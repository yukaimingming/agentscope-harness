package com.agentscope.harness.service;

import com.agentscope.harness.config.AgentscopeProperties;
import com.agentscope.harness.mcp.McpBootstrap;
import com.agentscope.harness.middleware.AsyncMemoryFlushMiddleware;
import com.agentscope.harness.middleware.ReflectionMiddleware;
import com.agentscope.harness.model.AguiMessage;
import com.agentscope.harness.model.ProviderModels.ProviderConfig;
import com.agentscope.harness.model.RunAgentInput;
import com.agentscope.harness.model.RunAgentInput.ResumeEntry;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.node.ObjectNode;
import io.agentscope.core.ReActAgent;
import io.agentscope.core.agent.RuntimeContext;
import io.agentscope.core.event.ConfirmResult;
import io.agentscope.core.event.RequireUserConfirmEvent;
import io.agentscope.core.message.Msg;
import io.agentscope.core.message.MsgRole;
import io.agentscope.core.message.ToolUseBlock;
import io.agentscope.core.message.UserMessage;
import io.agentscope.core.model.ExecutionConfig;
import io.agentscope.core.model.transport.HttpRequest;
import io.agentscope.core.model.transport.HttpResponse;
import io.agentscope.core.model.transport.HttpTransport;
import io.agentscope.core.model.transport.HttpTransportConfig;
import io.agentscope.core.model.transport.HttpTransportException;
import io.agentscope.core.model.transport.JdkHttpTransport;
import io.agentscope.core.state.InMemoryAgentStateStore;
import io.agentscope.core.tool.Toolkit;
import io.agentscope.core.tool.mcp.McpClientWrapper;
import io.agentscope.core.tool.subagent.SubAgentConfig;
import io.agentscope.core.tool.subagent.SubAgentTool;
import io.agentscope.extensions.model.openai.OpenAIChatModel;
import io.agentscope.harness.agent.HarnessAgent;
import io.agentscope.harness.agent.memory.MemoryConfig;
import io.agentscope.harness.agent.memory.compaction.CompactionConfig;
import io.agentscope.harness.agent.memory.compaction.ToolResultEvictionConfig;
import io.agentscope.harness.agent.subagent.SubagentDeclaration;
import com.agentscope.harness.tool.WebSearchTool;
import com.agentscope.harness.tool.DiagramTool;
import com.fasterxml.jackson.databind.JsonNode;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Service;
import reactor.core.Disposable;

import java.io.File;
import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.Paths;
import java.time.Duration;
import java.util.*;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.atomic.AtomicBoolean;
import java.util.concurrent.atomic.AtomicReference;
import java.util.function.Consumer;

/**
 * HarnessAgent 智能体实例与多会话生命周期管理服务。
 */
@Service
public class HarnessAgentManager {

    private static final Logger log = LoggerFactory.getLogger(HarnessAgentManager.class);

    private final AgentscopeProperties properties;
    private final ProviderService providerService;
    private final WorkspaceService workspaceService;
    private final WebSearchTool webSearchTool;
    private final DiagramTool diagramTool;
    private final ObjectMapper objectMapper;
    /** 订阅登录厂商的下游调用准备（密钥刷新/附加头/协议屏蔽）。 */
    private final OAuthService oauthService;

    /** 线程活跃状态记录，用于取消与清理。 */
    private final Map<String, ActiveExecution> activeExecutions = new ConcurrentHashMap<>();

    /** 存储等待用户人工审批的工具调用（threadId -> List<ToolUseBlock>）。 */
    private final Map<String, List<ToolUseBlock>> pendingApprovals = new ConcurrentHashMap<>();

    private record ActiveExecution(Disposable disposable, HarnessAgent agent, RuntimeContext ctx) {}

    public HarnessAgentManager(AgentscopeProperties properties,
                               ProviderService providerService,
                               WorkspaceService workspaceService,
                               WebSearchTool webSearchTool,
                               DiagramTool diagramTool,
                               ObjectMapper objectMapper,
                               OAuthService oauthService) {
        this.properties = properties;
        this.providerService = providerService;
        this.workspaceService = workspaceService;
        this.webSearchTool = webSearchTool;
        this.diagramTool = diagramTool;
        this.objectMapper = objectMapper;
        this.oauthService = oauthService;
    }

    /**
     * 执行智能体运行（SSE 响应式推送）。
     */
    public void execute(RunAgentInput input, Consumer<String> sseWriter, Runnable onComplete) {
        String threadId = input.getThreadId();
        String runId = input.getRunId();
        Map<String, Object> forwardedProps = input.getForwardedProps() != null ? input.getForwardedProps() : Map.of();

        // 解析工作区路径
        String workspaceRoot = (forwardedProps.containsKey("workspaceRoot") && forwardedProps.get("workspaceRoot") != null && !String.valueOf(forwardedProps.get("workspaceRoot")).isBlank())
                ? String.valueOf(forwardedProps.get("workspaceRoot"))
                : workspaceService.getCurrentWorkspaceRoot();

        // 解析模型配置
        String providerId = forwardedProps.containsKey("providerId") ? String.valueOf(forwardedProps.get("providerId")) : null;
        ProviderConfig provider = providerService.getActive(providerId);

        // 订阅登录厂商的下游调用准备：Copilot 动态 Bearer（过期自动换取）、
        // Grok/Copilot 必需附加头、协议特殊厂商（Google 等）返回屏蔽原因
        OAuthService.CallPrep callPrep = provider != null ? oauthService.prepareForCall(provider) : null;
        Map<String, String> providerExtraHeaders = callPrep != null && callPrep.extraHeaders() != null
                ? callPrep.extraHeaders()
                : Map.of();
        String apiKey = (provider != null && provider.getApiKey() != null && !provider.getApiKey().isBlank())
                ? (callPrep != null && callPrep.apiKey() != null && !callPrep.apiKey().isBlank()
                        ? callPrep.apiKey()
                        : provider.getApiKey())
                : properties.getDefaultApiKey();
        String baseUrl = (provider != null && provider.getBaseUrl() != null && !provider.getBaseUrl().isBlank())
                ? provider.getBaseUrl()
                : properties.getDefaultBaseUrl();
        // 模型解析优先级（参考姊妹项目 MafAgentManager 的 requestedModelId 优先逻辑）：
        // 用户在输入框选择的 modelId（trim 后非空）> 厂商默认模型 > 全局默认模型。
        // 此前只用 provider.getDefaultModel()，导致前端选择的非默认模型从不生效。
        String requestedModelId = (forwardedProps.containsKey("modelId") && forwardedProps.get("modelId") != null)
                ? String.valueOf(forwardedProps.get("modelId")).trim()
                : null;
        String modelName = (requestedModelId != null && !requestedModelId.isBlank())
                ? requestedModelId
                : (provider != null && provider.getDefaultModel() != null && !provider.getDefaultModel().isBlank()
                        ? provider.getDefaultModel()
                        : properties.getDefaultModel());
        log.info("会话 [{}] 模型解析: providerId={}, 用户选择 modelId={}, 实际使用 modelName={}",
                threadId, providerId, requestedModelId, modelName);

        // 构建 AG-UI 适配器
        AguiAdapter adapter = new AguiAdapter(runId, threadId, objectMapper, sseWriter, workspaceRoot);

        // agent-desktop（Computer Use）挂载句柄与进程清理凭据，异常兜底时统一释放
        McpClientWrapper desktopClient = null;
        Path desktopPidFile = null;

        try {
            // 0. 订阅登录但协议特殊的厂商（如 Google Code Assist）：直接给出可读的失败原因
            if (callPrep != null && callPrep.blockedMessage() != null) {
                throw new IllegalStateException(callPrep.blockedMessage());
            }

            // 1. 构建传输层与模型
            HttpTransportConfig transportConfig = HttpTransportConfig.builder()
                    .connectTimeout(Duration.ofSeconds(60))
                    .keepAliveDuration(Duration.ofSeconds(30))
                    .maxIdleConnections(8)
                    .build();

            HttpTransport transport = JdkHttpTransport.builder()
                    .config(transportConfig)
                    .build();
            if (!providerExtraHeaders.isEmpty()) {
                // 订阅登录厂商（Grok / Copilot）要求附加身份头：包一层透传装饰器，其余厂商零改动
                transport = new HeaderInjectingTransport(transport, providerExtraHeaders, objectMapper);
            }

            OpenAIChatModel model = OpenAIChatModel.builder()
                    .apiKey(apiKey)
                    .baseUrl(baseUrl)
                    .modelName(modelName)
                    .stream(true)
                    .httpTransport(transport)
                    .build();

            // 2. 轮次超时设置
            Duration roundTimeout = properties.getTurnTimeoutSeconds() > 0
                    ? Duration.ofSeconds(properties.getTurnTimeoutSeconds())
                    : Duration.ofDays(365);

            // 3. 记忆与自检中间件
            AsyncMemoryFlushMiddleware memoryFlush = new AsyncMemoryFlushMiddleware(
                    model, workspaceRoot, properties.getUserId(), Duration.ofMinutes(10).toMillis());
            ReflectionMiddleware reflection = new ReflectionMiddleware(
                    workspaceRoot, properties.getUserId(), adapter::recordReflection);

            // 网络搜索门控：仅当前端勾选（forwardedProps.webSearch=true）时本轮才挂载 web_search 工具；
            // 未勾选时绝不装配 WebSearchTool，模型只能基于自身知识回答。
            final boolean webSearchEnabled = Boolean.parseBoolean(
                    String.valueOf(input.getForwardedProps() != null
                            ? input.getForwardedProps().getOrDefault("webSearch", Boolean.FALSE)
                            : Boolean.FALSE));

            // 计划模式约束：当 planEnabled=true 时，在拼装 system prompt 时注入指令
            final boolean planEnabled = Boolean.parseBoolean(
                    String.valueOf(input.getForwardedProps() != null
                            ? input.getForwardedProps().getOrDefault("planEnabled", Boolean.FALSE)
                            : Boolean.FALSE));

            // 3.1 前置挂载 agent-desktop MCP（Computer Use）：
            // 必须先于系统提示词拼装，真实区分「挂载成功」与「失败降级」，
            // 避免提示词宣称配备了 computer-use 而实际工具未挂载，模型幻觉调用不存在的工具导致本轮直接崩溃断流。
            // pidfile 由 node 端 mcp-server.js 启动时写入（pid + session），doFinally 兜底据此终结进程树并清理 overlay。
            final Path finalDesktopPidFile;
            final Toolkit computerToolkit;
            if (properties.isMcpAgentDesktopEnabled()) {
                computerToolkit = new Toolkit();
                desktopPidFile = Paths.get(System.getProperty("java.io.tmpdir"),
                        "agent-desktop-mcp-" + UUID.randomUUID() + ".pid");
                finalDesktopPidFile = desktopPidFile;
                try {
                    desktopClient = McpBootstrap.registerStdio(
                            computerToolkit,
                            new McpBootstrap.StdioServerSpec(
                                    "agent-desktop",
                                    properties.getMcpAgentDesktopCommand(),
                                    properties.getMcpAgentDesktopArgs(),
                                    Map.of("AGENT_DESKTOP_MCP_PIDFILE", desktopPidFile.toString()),
                                    Duration.ofSeconds(60)
                            )
                    );
                } catch (Exception e) {
                    log.warn("[MCP] agent-desktop 计算机操作子智能体挂载异常: {}，降级运行", e.getMessage());
                    desktopClient = null;
                }
            } else {
                computerToolkit = null;
                finalDesktopPidFile = null;
            }

            // 3.2 挂载成功时构建 computer-use 桌面自动化子智能体工具（失败返回 null，本轮按未启用降级）
            final SubAgentTool computerUseTool = computerToolkit != null
                    ? prepareComputerUseSubagent(computerToolkit, model, threadId)
                    : null;
            final boolean computerUseMounted = desktopClient != null && computerUseTool != null;

            // 3.3 系统提示词按「真实挂载结果」区分：启用态给委派规则；关闭态或挂载失败给明确的关闭态规则（参考 Maf FileAgentFactory 写法）
            String diagramRule = " 你具备专业图表生成能力（generate_diagram、validate_diagram），当用户需要绘制或修改流程图、时序图、状态机图、类图、ER图、架构图等图表时，必须调用 generate_diagram 工具生成 Mermaid DSL 源码，不要使用 AI 直接生成图片；支持基于已有图表（sourceCode）进行增量修改与扩展；最终回复必须包含完整的 Mermaid 代码块（```mermaid ... ```）。";
            String computerUseRule = " 【计算机与桌面操作委派规则】你配备了 computer-use 自动化子智能体工具。当且仅当用户任务确实需要操作本台电脑上的桌面应用程序、打开系统软件（例如记事本 Notepad、计算器 Calculator、设置等）、在桌面应用窗口中输入文字、点击按钮或查看桌面窗口状态时，你必须调用 computer-use 工具委派给它完成，并在 message 参数中详细给出任务目标。你自身的工具箱中不直接包含 desktop_* 系列底层桌面工具，绝不要直接拒绝用户的电脑操作需求，直接委派给 computer-use 即可。";
            String computerUseDisabledRule = " 【电脑操作能力未启用】当前用户尚未在左上角「设置→电脑」页开启 Computer Use（电脑桌面自动化能力），你没有操作本地电脑桌面应用或窗口的任何工具。严禁尝试操控本地桌面应用或窗口（例如打开记事本、点击或切换窗口），严禁调用 computer-use、desktop_* 等不存在的工具，也严禁用写文件、执行终端命令等方式冒充完成桌面操作（例如向工作区写入文件来假装已在记事本输入文字）。当用户请求操作电脑时，必须如实告知：该功能需在「设置→电脑」页开启 Computer Use 后重试。";
            String baseSysPrompt = (webSearchEnabled
                    ? "你是运行在 AgentScope Harness 上的高级智能体助手，具备文件读写、任务拆解规划、网络搜索与实时信息检索、技能执行与子智能体协同能力。当用户询问最新资讯、实时动态或天气（例如'深圳天气怎么样'）时，必须调用 web_search 工具获取最新数据和权威来源链接。始终使用中文清晰友好地回答。"
                    : "你是运行在 AgentScope Harness 上的高级智能体助手，具备文件读写、任务拆解规划、技能执行与子智能体协同能力。本次运行未启用网络搜索工具，请基于已有知识回答；如遇时效性问题请如实说明当前无法获取实时信息。始终使用中文清晰友好地回答。")
                    + diagramRule
                    + (computerUseMounted ? computerUseRule : computerUseDisabledRule);
            if (planEnabled) {
                baseSysPrompt += " 【计划模式约束】先输出实施计划，等用户确认后再执行。在用户未明确确认执行前，严禁直接调用写文件、执行终端命令等修改操作工具。";
            }

            // 运行时身份澄清：SDK 每轮会把工作区 MEMORY.md、memory/ 记忆以 <loaded_context> 注入
            // system prompt，历史会话也可能残留过往模型的自述，导致模型被带偏自述错误身份。
            // 明确告知：回答身份相关问题以运行时指定为准，不得依据历史记忆或过往对话自述。
            if (modelName != null && !modelName.isBlank()) {
                baseSysPrompt += " 【运行时身份澄清】当前会话使用的模型由系统在运行时指定，本次运行实际指定的模型型号为 "
                        + modelName + "。当用户询问你的身份、模型型号或所属厂商时，必须以该运行时指定为准作答；"
                        + "严禁根据历史记忆、过往对话或训练数据中的自述来回答身份问题。";
            }

            // 4. 构建 HarnessAgent
            HarnessAgent.Builder builder = HarnessAgent.builder()
                    .name("agentscope-spring-assistant")
                    .sysPrompt(baseSysPrompt)
                    .model(model)
                    .workspace(Paths.get(workspaceRoot))
                    .modelExecutionConfig(ExecutionConfig.builder()
                            .timeout(roundTimeout)
                            .maxAttempts(3)
                            .retryOn(ExecutionConfig.RETRYABLE_ERRORS)
                            .initialBackoff(Duration.ofSeconds(2))
                            .maxBackoff(Duration.ofSeconds(30))
                            .backoffMultiplier(2.0)
                            .build())
                    .toolExecutionConfig(ExecutionConfig.builder().timeout(roundTimeout).maxAttempts(1).build())
                    .memory(MemoryConfig.builder().flushTrigger(MemoryConfig.FlushTrigger.never()).build())
                    .compaction(CompactionConfig.builder().triggerMessages(30).keepMessages(10).build())
                    .toolResultEviction(ToolResultEvictionConfig.defaults())
                    .enablePlanMode()
                    .enableTaskList()
                    .maxIters(30)
                    .middleware(reflection)
                    .middleware(memoryFlush)
                    .subagent(SubagentDeclaration.builder()
                            .name("summarizer")
                            .description("文本精简提炼专家。当需要长文本提炼总结时委派给它。")
                            .steps(6)
                            .build())
                    .subagent(SubagentDeclaration.builder()
                            .name("researcher")
                            .description("专业技术调研与分析智能体。擅长深入调研框架规范、技术架构与行业生态并输出结构化报告。")
                            .steps(8)
                            .build());

            HarnessAgent agent = builder.build();

            // 装配图表生成工具 DiagramTool
            try {
                agent.getToolkit().registerTool(diagramTool);
                log.info("装载图表生成工具 DiagramTool");
            } catch (Exception e) {
                log.warn("注册 DiagramTool 异常: {}", e.getMessage());
            }

            // 网络搜索工具装配：仅勾选时替换为全功能 WebSearchTool（免第三方 Key 依赖，自带气象与通用网页索引与来源引用）；
            // 未勾选时移除框架内置 web_search（如有），保证本轮没有任何联网搜索工具。
            if (webSearchEnabled) {
                try {
                    agent.getToolkit().removeTool("web_search");
                    agent.getToolkit().registerTool(webSearchTool);
                    log.info("本轮已勾选网络搜索：装载全功能 WebSearchTool");
                } catch (Exception e) {
                    log.warn("注册 WebSearchTool 异常: {}", e.getMessage());
                }
            } else {
                try {
                    agent.getToolkit().removeTool("web_search");
                    log.info("本轮未勾选网络搜索：不装配 WebSearchTool");
                } catch (Exception e) {
                    log.warn("移除默认 web_search 工具异常: {}", e.getMessage());
                }
            }

            // 5. 注册 MCP（如有配置）
            if (properties.getMcpDeepwikiUrl() != null && !properties.getMcpDeepwikiUrl().isBlank()) {
                McpBootstrap.register(
                        agent.getToolkit(),
                        List.of(new McpBootstrap.ServerSpec("deepwiki", properties.getMcpDeepwikiUrl(), Duration.ofSeconds(30))),
                        properties.getMcpKeepaliveSeconds()
                );
            }

            // 5.1 注册 computer-use 子智能体工具（仅真实挂载成功时，保证提示词与实际工具集一致）
            if (computerUseMounted && computerUseTool != null) {
                try {
                    agent.getToolkit().registerAgentTool(computerUseTool);
                    log.info("成功挂载 computer-use 子智能体（持独立 Toolkit 与 agent-desktop MCP，已启用全自动免审批）");
                } catch (Exception e) {
                    log.warn("computer-use 子智能体工具注册失败: {}", e.getMessage());
                }
            }
            final McpClientWrapper finalDesktopClient = desktopClient;

            // 6. 构造 RuntimeContext（实现用户与多会话持久化隔离）
            RuntimeContext ctx = RuntimeContext.builder()
                    .sessionId(threadId)
                    .userId(properties.getUserId())
                    .build();

            // 解析用户前端选择的权限模式（ask: 请求批准 / auto: 自动确认 / full: 完全访问权限）
            String permModeStr = (forwardedProps.containsKey("permissionMode") && forwardedProps.get("permissionMode") != null)
                    ? String.valueOf(forwardedProps.get("permissionMode")).trim().toLowerCase()
                    : "ask";

            io.agentscope.core.permission.PermissionMode permMode = switch (permModeStr) {
                case "full", "bypass", "dont_ask" -> io.agentscope.core.permission.PermissionMode.BYPASS;
                case "auto", "accept_edits" -> io.agentscope.core.permission.PermissionMode.ACCEPT_EDITS;
                case "explore" -> io.agentscope.core.permission.PermissionMode.EXPLORE;
                default -> io.agentscope.core.permission.PermissionMode.DEFAULT;
            };

            try {
                agent.setPermissionMode(ctx, permMode);
                agent.setPermissionMode(properties.getUserId(), threadId, permMode);
                log.info("会话 [{}] 应用权限模式: {} -> {}", threadId, permModeStr, permMode);
            } catch (Exception pe) {
                log.warn("设置 Agent 权限模式异常: {}", pe.getMessage());
            }

            // 7. 构建本轮输入消息
            List<Msg> turn;
            if (input.getResume() != null && !input.getResume().isEmpty()) {
                // 人工审批恢复流程
                List<ToolUseBlock> pending = pendingApprovals.remove(threadId);
                if (pending == null) pending = List.of();

                boolean allApproved = input.getResume().stream()
                        .allMatch(r -> "resolved".equalsIgnoreCase(r.getStatus()));

                List<ConfirmResult> results = new ArrayList<>();
                for (ToolUseBlock block : pending) {
                    results.add(new ConfirmResult(allApproved, block));
                }

                Map<String, Object> meta = new HashMap<>();
                meta.put(Msg.METADATA_CONFIRM_RESULTS, results);

                Msg resumeMsg = Msg.builder()
                        .name("user")
                        .role(MsgRole.USER)
                        .textContent(allApproved ? "approved" : "denied")
                        .metadata(meta)
                        .build();
                turn = List.of(resumeMsg);
            } else {
                // 常规用户消息流程
                String lastUserText = extractLastUserText(input.getMessages());
                turn = List.of(new UserMessage(lastUserText));
            }

            // 8. 订阅事件流并转换为 AG-UI
            AtomicBoolean interrupted = new AtomicBoolean(false);
            AtomicReference<List<ToolUseBlock>> confirmHold = new AtomicReference<>();

            Disposable disposable = agent.streamEvents(turn, ctx)
                    .doOnNext(event -> {
                        if (event instanceof RequireUserConfirmEvent ce) {
                            if (!"full".equals(permModeStr) && !"bypass".equals(permModeStr) && !"dont_ask".equals(permModeStr)) {
                                interrupted.set(true);
                                confirmHold.set(ce.getToolCalls());
                            } else {
                                log.info("当前会话开启完全访问权限 [{}]，自动免审批继续调用: {}", threadId, ce.getToolCalls());
                            }
                        }
                        adapter.onAgentEvent(event);
                    })
                    .doOnError(err -> {
                        log.error("Agent 执行异常 [{}]", threadId, err);
                        // 任何异常都必须给用户可见的中文反馈（RUN_ERROR），尤其防止模型幻觉调用
                        // 未挂载的 computer-use 工具时静默断流。
                        adapter.emitRunError(buildRunErrorMessage(err, computerUseMounted));
                        activeExecutions.remove(threadId);
                        onComplete.run();
                    })
                    .doOnComplete(() -> {
                        if (interrupted.get() && confirmHold.get() != null) {
                            pendingApprovals.put(threadId, confirmHold.get());
                            adapter.emitRequireConfirm(confirmHold.get());
                        } else {
                            adapter.emitRunFinished();
                        }
                        activeExecutions.remove(threadId);
                        onComplete.run();
                    })
                    .doFinally(signalType -> {
                        if (finalDesktopClient != null) {
                            try {
                                finalDesktopClient.close();
                                log.info("已释放 agent-desktop MCP 客户端连接与进程资源");
                            } catch (Exception ignored) {}
                        }
                        // SDK close 仅对 node 进程 TerminateProcess（Windows 硬终止，无信号），
                        // node 侧退出清理可能来不及执行，此处兜底终结进程树并关闭遗留 overlay 会话。
                        releaseDesktopProcessResources(finalDesktopPidFile);
                    })
                    .subscribe();

            activeExecutions.put(threadId, new ActiveExecution(disposable, agent, ctx));

        } catch (Exception e) {
            log.error("创建或启动 Agent 失败", e);
            // 初始化中途失败（尚未订阅事件流）也要释放已挂载的 agent-desktop 进程资源
            if (desktopClient != null) {
                try {
                    desktopClient.close();
                } catch (Exception ignored) {}
            }
            releaseDesktopProcessResources(desktopPidFile);
            adapter.emitRunError("初始化 Agent 失败: " + e.getMessage());
            onComplete.run();
        }
    }

    /**
     * 构建 computer-use 桌面自动化子智能体工具（依赖已成功挂载的 agent-desktop MCP 的独立 Toolkit）。
     * 返回 null 表示构建失败，本轮按「未启用」降级，提示词与实际工具集保持一致。
     */
    private SubAgentTool prepareComputerUseSubagent(Toolkit computerToolkit, OpenAIChatModel model, String threadId) {
        try {
            String computerSubagentPrompt = """
                    你是一个专门执行本地计算机与桌面应用操作的自动化子智能体（Computer Use Agent）。
                    你的职责：只有当任务确实需要操作这台电脑上的桌面应用、窗口、界面交互时才使用底层桌面工具。
                    核心规则：
                    1. 工具能力：你拥有 desktop_* 系列工具，包括 desktop_launch（启动桌面应用，例如 app="notepad" 或 app="calc"）、desktop_snapshot（抓取无障碍树及带 @ref 的 UI 元素）、desktop_click（按 @ref 点击元素）、desktop_type（按 @ref 输入文本）、desktop_press（按键如 return/enter）、desktop_list_windows（列出当前活动窗口）、desktop_screenshot（截取应用窗口截图）、desktop_wait（等待 UI 渲染）等。
                    2. Ref 引用机制与 STALE_REF：元素的 ref（如 @e1、@e2）是根据当前无障碍树快照动态生成的编号。当界面发生变化或操作后，旧的 ref 可能会过期失效。如需多步操作，每次点击或输入后，若需要继续操作其他元素，必须先调用 desktop_snapshot 获取最新的有效 ref，绝对不要臆造 ref。
                    3. 常用流程：
                       - 若需打开某个应用：首先调用 desktop_launch（app="notepad"），或检查 desktop_list_windows 确认窗口已在前台；
                       - 然后调用 desktop_snapshot 查看窗口中的编辑区域或按钮元素，获取目标 @ref；
                       - 调用 desktop_set_value（ref="@目标ref", value="文本内容"）或 desktop_type（ref="@目标ref", text="文本内容"）完成输入，或 desktop_click 点击按钮；
                       - 如果需要保存或换行，调用 desktop_press（key="ctrl+s" 或 "enter"）；
                    4. 安全规范：能只读观察就不要随意改动其他窗口，操作完成后总结操作步骤与结果并回复。
                    """;

            io.agentscope.core.permission.PermissionContextState.Builder bypassBuilder =
                    io.agentscope.core.permission.PermissionContextState.builder()
                            .mode(io.agentscope.core.permission.PermissionMode.BYPASS);
            for (String toolName : computerToolkit.getToolNames()) {
                bypassBuilder.addAllowRule(toolName, new io.agentscope.core.permission.PermissionRule(
                        toolName, "*", io.agentscope.core.permission.PermissionBehavior.ALLOW, "computer-use-subagent"
                ));
            }
            io.agentscope.core.permission.PermissionContextState bypassContext = bypassBuilder.build();

            ReActAgent computerAgent = ReActAgent.builder()
                    .name("computer-use")
                    .description("操作本地电脑桌面、原生应用与窗口无障碍树的自动化子智能体")
                    .sysPrompt(computerSubagentPrompt)
                    .model(model)
                    .toolkit(computerToolkit)
                    .permissionContext(bypassContext)
                    .stateStore(new InMemoryAgentStateStore())
                    .maxIters(15)
                    .build();

            SubAgentConfig subConfig = SubAgentConfig.builder()
                    .toolName("computer-use")
                    .description("操作本地 Windows 桌面、窗口与原生应用的自动化子智能体。当且仅当需要启动程序（如 Notepad 记事本、计算器、设置等）、在桌面应用窗口中点击、输入文本、查看窗口界面无障碍树时，必须调用此工具委派执行。入参说明：message 为委派给子智能体的具体操作任务描述。")
                    .build();

            return new SubAgentTool(() -> {
                try {
                    computerAgent.setPermissionMode(properties.getUserId(), threadId, io.agentscope.core.permission.PermissionMode.BYPASS);
                } catch (Exception ignored) {}
                return computerAgent;
            }, subConfig);
        } catch (Exception e) {
            log.warn("computer-use 子智能体构建失败: {}，本轮降级为未启用", e.getMessage());
            return null;
        }
    }

    /**
     * 将任意执行异常转换为用户可见的中文友好错误信息（RUN_ERROR），保证前端一定收到反馈而非静默断流。
     * Computer Use 相关异常（含模型幻觉调用未挂载的 computer-use 工具）按真实挂载状态给出明确指引。
     */
    private String buildRunErrorMessage(Throwable err, boolean computerUseMounted) {
        StringBuilder chain = new StringBuilder();
        Throwable t = err;
        int depth = 0;
        while (t != null && depth < 6) {
            if (t.getMessage() != null) {
                chain.append(t.getMessage()).append(' ');
            }
            chain.append(t.getClass().getName()).append(' ');
            t = t.getCause() == t ? null : t.getCause();
            depth++;
        }
        String lowered = chain.toString().toLowerCase();
        boolean computerUseRelated = lowered.contains("computer-use") || lowered.contains("computer_use")
                || lowered.contains("computeruse") || lowered.contains("desktop_")
                || lowered.contains("agent-desktop");
        if (computerUseRelated) {
            return computerUseMounted
                    ? "本轮执行中断：Computer Use 工具调用失败，请重试；若持续失败请检查「设置→电脑」页的 Computer Use 开关与配置。"
                    : "本轮执行中断：Computer Use 未启用或调用失败，请在「设置→电脑」开启后重试。";
        }
        String first = err != null && err.getMessage() != null && !err.getMessage().isBlank()
                ? err.getMessage().trim()
                : (err != null ? err.getClass().getSimpleName() : "未知错误");
        return "本轮执行中断：" + first;
    }

    /**
     * 兜底释放 agent-desktop 相关子进程资源：
     * MCP SDK 的 close 对 node 进程是 Windows TerminateProcess 硬终止（不触发 node 信号清理），
     * 因此依据 node 启动时经 AGENT_DESKTOP_MCP_PIDFILE 写入的凭据（pid + session），
     * 先 taskkill /T /F 终结其进程树，再关闭可能遗留的光标 overlay 会话，防止孤儿渲染进程。
     */
    private void releaseDesktopProcessResources(Path pidFile) {
        if (pidFile == null) {
            return;
        }
        String pid = null;
        String sessionId = null;
        try {
            if (Files.exists(pidFile)) {
                JsonNode node = objectMapper.readTree(Files.readString(pidFile));
                pid = node.path("pid").asText(null);
                sessionId = node.path("session").asText(null);
            }
        } catch (Exception ignored) {}

        boolean isWin = System.getProperty("os.name", "").toLowerCase().contains("win");
        if (isWin && pid != null && !pid.isBlank()) {
            runQuiet(List.of("taskkill", "/F", "/T", "/PID", pid));
            log.info("已兜底终结 agent-desktop MCP 进程树 pid={}", pid);
        }
        if (sessionId != null && !sessionId.isBlank()) {
            try {
                File script = McpBootstrap.findRepoMcpServerScript();
                File nativeExe = script != null ? new File(script.getParentFile(), "agent-desktop.exe") : null;
                if (nativeExe != null && nativeExe.exists()) {
                    runQuiet(List.of(nativeExe.getAbsolutePath(), "cursor-overlay", "disable", "--session", sessionId));
                    runQuiet(List.of(nativeExe.getAbsolutePath(), "session", "end", "--session", sessionId));
                    log.info("已清理 agent-desktop 光标 overlay 会话 {}", sessionId);
                }
            } catch (Exception ignored) {}
        }
        try {
            Files.deleteIfExists(pidFile);
        } catch (Exception ignored) {}
    }

    /** 静默执行外部命令（限时 5 秒），失败不抛出。 */
    private void runQuiet(List<String> command) {
        try {
            Process p = new ProcessBuilder(command).start();
            if (!p.waitFor(5, TimeUnit.SECONDS)) {
                p.destroyForcibly();
            }
        } catch (Exception ignored) {}
    }

    /**
     * 取消指定会话的运行。
     */
    public boolean cancelThread(String threadId) {
        ActiveExecution active = activeExecutions.remove(threadId);
        pendingApprovals.remove(threadId);
        if (active != null) {
            try {
                active.disposable().dispose();
                active.agent().interrupt(active.ctx());
                log.info("已成功取消线程运行 [{}]", threadId);
                return true;
            } catch (Exception e) {
                log.warn("取消线程失败 [{}]：{}", threadId, e.getMessage());
            }
        }
        return false;
    }

    private String extractLastUserText(List<AguiMessage> messages) {
        if (messages == null || messages.isEmpty()) return "你好";
        for (int i = messages.size() - 1; i >= 0; i--) {
            AguiMessage m = messages.get(i);
            if ("user".equalsIgnoreCase(m.getRole())) {
                return m.getTextContent();
            }
        }
        return messages.get(messages.size() - 1).getTextContent();
    }

    /**
     * 透传传输层装饰器：为订阅登录厂商（Grok 的 X-XAI-Token-Auth 与 CLI 客户端身份头、
     * Copilot 的 editor/copilot 系列头）的下游请求注入必需的附加头。普通 API Key 厂商
     * 不经过此装饰器，调用行为零改动。
     *
     * 同时清洗请求体：Grok CLI 代理只允许 user 角色的消息携带 name 字段（其余角色
     * 带 name 直接返回 400 invalid-argument），而 agentscope 的 OpenAI 格式化器会为
     * 带名字的系统消息透传 name。这里统一为非 user 消息去掉 name（name 仅为可选
     * 元数据，去除不影响语义），Copilot 等其他订阅厂商对此同样兼容。
     */
    private static final class HeaderInjectingTransport implements HttpTransport {
        private final HttpTransport delegate;
        private final Map<String, String> extraHeaders;
        private final ObjectMapper objectMapper;

        HeaderInjectingTransport(HttpTransport delegate, Map<String, String> extraHeaders,
                                 ObjectMapper objectMapper) {
            this.delegate = delegate;
            this.extraHeaders = extraHeaders;
            this.objectMapper = objectMapper;
        }

        private HttpRequest apply(HttpRequest request) {
            // 订阅厂商下游端点追踪：便于用日志确证每次推理实际命中的 Base URL
            log.info("[订阅厂商透传] {} {}", request.getMethod(), request.getUrl());
            HttpRequest.Builder builder = HttpRequest.builder()
                    .url(request.getUrl())
                    .method(request.getMethod())
                    .headers(request.getHeaders())
                    .body(stripNonUserNameFields(request.getBody()));
            extraHeaders.forEach(builder::header);
            return builder.build();
        }

        /** 非 user 角色消息移除 name 字段；请求体不是合法 JSON 或无需修改时原样返回。 */
        private String stripNonUserNameFields(String body) {
            if (body == null || !body.contains("\"messages\"")) {
                return body;
            }
            try {
                JsonNode root = objectMapper.readTree(body);
                JsonNode messages = root.get("messages");
                if (messages != null && messages.isArray()) {
                    boolean changed = false;
                    for (JsonNode msg : messages) {
                        if (!"user".equals(msg.path("role").asText()) && msg.has("name")) {
                            ((ObjectNode) msg).remove("name");
                            changed = true;
                        }
                    }
                    if (changed) {
                        return objectMapper.writeValueAsString(root);
                    }
                }
                return body;
            } catch (Exception e) {
                // 清洗失败不影响调用本身：按原请求体透传
                return body;
            }
        }

        @Override
        public HttpResponse execute(HttpRequest request) throws HttpTransportException {
            return delegate.execute(apply(request));
        }

        @Override
        public reactor.core.publisher.Flux<String> stream(HttpRequest request) {
            return delegate.stream(apply(request));
        }

        @Override
        public void close() {
            delegate.close();
        }
    }
}
