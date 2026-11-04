package com.agentscope.harness.service;

import com.agentscope.harness.config.AgentscopeProperties;
import com.agentscope.harness.mcp.McpBootstrap;
import com.agentscope.harness.middleware.AsyncMemoryFlushMiddleware;
import com.agentscope.harness.middleware.ReflectionMiddleware;
import com.agentscope.harness.model.AguiMessage;
import com.agentscope.harness.model.ProviderModels.ProviderConfig;
import com.agentscope.harness.model.RunAgentInput;
import com.agentscope.harness.model.RunAgentInput.ResumeEntry;
import com.fasterxml.jackson.databind.ObjectMapper;
import io.agentscope.core.agent.RuntimeContext;
import io.agentscope.core.event.ConfirmResult;
import io.agentscope.core.event.RequireUserConfirmEvent;
import io.agentscope.core.message.Msg;
import io.agentscope.core.message.MsgRole;
import io.agentscope.core.message.ToolUseBlock;
import io.agentscope.core.message.UserMessage;
import io.agentscope.core.model.ExecutionConfig;
import io.agentscope.core.model.transport.HttpTransport;
import io.agentscope.core.model.transport.HttpTransportConfig;
import io.agentscope.core.model.transport.JdkHttpTransport;
import io.agentscope.core.tool.mcp.McpClientWrapper;
import io.agentscope.extensions.model.openai.OpenAIChatModel;
import io.agentscope.harness.agent.HarnessAgent;
import io.agentscope.harness.agent.memory.MemoryConfig;
import io.agentscope.harness.agent.memory.compaction.CompactionConfig;
import io.agentscope.harness.agent.memory.compaction.ToolResultEvictionConfig;
import io.agentscope.harness.agent.subagent.SubagentDeclaration;
import com.agentscope.harness.tool.WebSearchTool;
import com.agentscope.harness.tool.DiagramTool;
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
                               ObjectMapper objectMapper) {
        this.properties = properties;
        this.providerService = providerService;
        this.workspaceService = workspaceService;
        this.webSearchTool = webSearchTool;
        this.diagramTool = diagramTool;
        this.objectMapper = objectMapper;
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

        String apiKey = (provider != null && provider.getApiKey() != null && !provider.getApiKey().isBlank())
                ? provider.getApiKey()
                : properties.getDefaultApiKey();
        String baseUrl = (provider != null && provider.getBaseUrl() != null && !provider.getBaseUrl().isBlank())
                ? provider.getBaseUrl()
                : properties.getDefaultBaseUrl();
        String modelName = (provider != null && provider.getDefaultModel() != null && !provider.getDefaultModel().isBlank())
                ? provider.getDefaultModel()
                : properties.getDefaultModel();

        // 构建 AG-UI 适配器
        AguiAdapter adapter = new AguiAdapter(runId, threadId, objectMapper, sseWriter, workspaceRoot);

        try {
            // 1. 构建传输层与模型
            HttpTransportConfig transportConfig = HttpTransportConfig.builder()
                    .connectTimeout(Duration.ofSeconds(60))
                    .keepAliveDuration(Duration.ofSeconds(30))
                    .maxIdleConnections(8)
                    .build();

            HttpTransport transport = JdkHttpTransport.builder()
                    .config(transportConfig)
                    .build();

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

            String diagramRule = " 你具备专业图表生成能力（generate_diagram、validate_diagram），当用户需要绘制或修改流程图、时序图、状态机图、类图、ER图、架构图等图表时，必须调用 generate_diagram 工具生成 Mermaid DSL 源码，不要使用 AI 直接生成图片；支持基于已有图表（sourceCode）进行增量修改与扩展；最终回复必须包含完整的 Mermaid 代码块（```mermaid ... ```）。";
            String baseSysPrompt = (webSearchEnabled
                    ? "你是运行在 AgentScope Harness 上的高级智能体助手，具备文件读写、任务拆解规划、网络搜索与实时信息检索、技能执行与子智能体协同能力。当用户询问最新资讯、实时动态或天气（例如'深圳天气怎么样'）时，必须调用 web_search 工具获取最新数据和权威来源链接。始终使用中文清晰友好地回答。"
                    : "你是运行在 AgentScope Harness 上的高级智能体助手，具备文件读写、任务拆解规划、技能执行与子智能体协同能力。本次运行未启用网络搜索工具，请基于已有知识回答；如遇时效性问题请如实说明当前无法获取实时信息。始终使用中文清晰友好地回答。")
                    + diagramRule;
            if (planEnabled) {
                baseSysPrompt += " 【计划模式约束】先输出实施计划，等用户确认后再执行。在用户未明确确认执行前，严禁直接调用写文件、执行终端命令等修改操作工具。";
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
                agent.setPermissionMode(threadId, properties.getUserId(), permMode);
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
                        adapter.emitRunError(err.getMessage());
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
                    .subscribe();

            activeExecutions.put(threadId, new ActiveExecution(disposable, agent, ctx));

        } catch (Exception e) {
            log.error("创建或启动 Agent 失败", e);
            adapter.emitRunError("初始化 Agent 失败: " + e.getMessage());
            onComplete.run();
        }
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
}
