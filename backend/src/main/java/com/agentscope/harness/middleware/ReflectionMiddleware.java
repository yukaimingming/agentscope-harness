package com.agentscope.harness.middleware;

import io.agentscope.core.agent.Agent;
import io.agentscope.core.agent.RuntimeContext;
import io.agentscope.core.event.AgentEvent;
import io.agentscope.core.event.ToolResultEndEvent;
import io.agentscope.core.message.Msg;
import io.agentscope.core.message.MsgRole;
import io.agentscope.core.message.TextBlock;
import io.agentscope.core.message.ToolResultBlock;
import io.agentscope.core.message.ToolResultState;
import io.agentscope.core.message.ToolUseBlock;
import io.agentscope.core.middleware.ActingInput;
import io.agentscope.core.middleware.AgentInput;
import io.agentscope.core.middleware.MiddlewareBase;
import io.agentscope.core.middleware.ReasoningInput;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import reactor.core.publisher.Flux;

import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.Paths;
import java.util.ArrayList;
import java.util.HashSet;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.atomic.AtomicBoolean;
import java.util.function.Consumer;
import java.util.function.Function;
import java.util.stream.Collectors;

/**
 * Reflection 中间件：框架级「干完检查」，不依赖提示词。
 * 完整对齐控制台 Demo 规范并支持 Web 前端 AG-UI 协议呈现：
 * <ul>
 *   <li>onActing 包裹 write_file / edit_file 执行，完成后读磁盘核对预期变更是否真实落盘（带牙的自检）；</li>
 *   <li>所有工具的结果状态轮末汇总（含联网工具）；联网结果按状态/内容分类检查；</li>
 *   <li>支持通过 listener 将自检报告同步投递到控制台与 Web 前端 AG-UI 过程时间线。</li>
 * </ul>
 */
public class ReflectionMiddleware implements MiddlewareBase {

    private static final Logger log = LoggerFactory.getLogger(ReflectionMiddleware.class);

    // ANSI 控制台色彩（对齐控制台 Demo 风格）
    private static final String DIM = "\u001b[2m";
    private static final String YELLOW = "\u001b[33m";
    private static final String GREEN = "\u001b[32m";
    private static final String RESET = "\u001b[0m";

    private record PendingCheck(String toolCallId, String toolName, String path, String expected) {}

    /** 工作区根目录与当前用户 ID（用于相对路径解析）。 */
    private final String workspaceRoot;
    private final String userId;

    /** 用于向 AG-UI 适配器推送自检事件的消费者回调。 */
    private final Consumer<String> reflectionListener;

    /** 演示钩子：DEMO_REFLECTION_FAIL_ONCE=1 时首个文件工具校验模拟失败，用于验证自检报警。 */
    private final AtomicBoolean failOnceArmed =
            new AtomicBoolean("1".equals(System.getenv("DEMO_REFLECTION_FAIL_ONCE")));
    private final AtomicBoolean failOnceUsed = new AtomicBoolean();

    /** 本轮各工具执行结果状态（toolCallId -> "工具名:状态"），用于状态级 Reflection 统计。 */
    private final Map<String, String> results = new ConcurrentHashMap<>();

    /** 已检查过的联网工具结果 id。 */
    private final Set<String> webResultsSeen = new HashSet<>();
    private final Set<String> reportedCategories = new HashSet<>();

    public ReflectionMiddleware() {
        this("", "kaiming", null);
    }

    public ReflectionMiddleware(String workspaceRoot, String userId, Consumer<String> reflectionListener) {
        this.workspaceRoot = (workspaceRoot != null && !workspaceRoot.isBlank()) ? workspaceRoot : ".agentscope/workspace";
        this.userId = (userId != null && !userId.isBlank()) ? userId : "kaiming";
        this.reflectionListener = reflectionListener;
    }

    @Override
    public Flux<AgentEvent> onAgent(Agent agent, RuntimeContext ctx, AgentInput in,
                                    Function<AgentInput, Flux<AgentEvent>> next) {
        results.clear();
        webResultsSeen.clear();
        reportedCategories.clear();
        failOnceUsed.set(false);
        return next.apply(in);
    }

    @Override
    public Flux<AgentEvent> onActing(Agent agent, RuntimeContext ctx, ActingInput in,
                                     Function<ActingInput, Flux<AgentEvent>> next) {
        List<PendingCheck> checks = new ArrayList<>();
        for (ToolUseBlock call : in.toolCalls()) {
            PendingCheck pc = parse(call);
            if (pc != null) {
                checks.add(pc);
            }
        }

        return next.apply(in)
                .doOnNext(event -> {
                    // 收集本轮每个工具的执行结果状态（所有工具都纳入 Reflection 统计）
                    if (event instanceof ToolResultEndEvent e) {
                        results.put(e.getToolCallId(), e.getToolCallName() + ":" + e.getState());
                    }
                })
                .doOnComplete(() -> {
                    // 1. 状态级自检：本轮所有工具的执行结果汇总
                    if (!results.isEmpty()) {
                        long ok = results.values().stream().filter(v -> v.endsWith(":SUCCESS")).count();
                        String summaryMsg;
                        if (ok == results.size()) {
                            summaryMsg = "· [Reflection] 本轮 " + results.size() + " 项工具调用全部成功";
                            System.out.println(DIM + summaryMsg + RESET);
                            log.info(summaryMsg);
                        } else {
                            summaryMsg = "· [Reflection] 本轮 " + results.size() + " 项工具调用：" + ok + " 成功 / "
                                    + (results.size() - ok) + " 异常";
                            System.out.println(YELLOW + summaryMsg + RESET);
                            log.warn(summaryMsg);
                        }
                        notifyListener(summaryMsg);
                    }

                    // 2. 内容落盘校验：只对「执行成功」的文件工具做真实文件比对（带牙的自检）
                    for (PendingCheck pc : checks) {
                        String state = results.get(pc.toolCallId());
                        if (state != null && state.endsWith(":SUCCESS")) {
                            verify(pc);
                        }
                    }
                    results.clear();
                });
    }

    @Override
    public Flux<AgentEvent> onReasoning(Agent agent, RuntimeContext ctx, ReasoningInput in,
                                        Function<ReasoningInput, Flux<AgentEvent>> next) {
        for (String f : inspectWebResults(in.messages())) {
            String reportMsg = "· [Reflection] 联网自检：" + f;
            System.out.println(DIM + reportMsg + RESET);
            log.info(reportMsg);
            notifyListener(reportMsg);
        }

        List<Msg> messages = compatibleMessages(in.messages());
        return next.apply(messages.size() == in.messages().size() ? in
                : new ReasoningInput(messages, in.tools(), in.options()));
    }

    /** 校验预期内容是否真实落盘。 */
    private void verify(PendingCheck pc) {
        String content = read(pc.path());
        if (content == null) {
            String skipMsg = "· [Reflection] 文件不可读、超限或读取超时，已跳过内容核对";
            System.out.println(DIM + skipMsg + RESET);
            log.info(skipMsg);
            notifyListener(skipMsg);
            return;
        }

        boolean ok = content.contains(pc.expected()) || content.strip().endsWith(pc.expected().strip());
        if (ok && failOnceArmed.get() && failOnceUsed.compareAndSet(false, true)) {
            ok = false;
            String mockMsg = "   （Reflection 演示：注入一次模拟校验失败）";
            System.out.println(DIM + mockMsg + RESET);
            notifyListener(mockMsg);
        }

        if (ok) {
            String passMsg = "· [Reflection] " + pc.toolName() + "(" + fileName(pc.path()) + ") 自检通过：变更已真实落盘";
            System.out.println(DIM + passMsg + RESET);
            log.info(passMsg);
            notifyListener(passMsg);
        } else {
            String failMsg = "⚠ [Reflection] " + pc.toolName() + "(" + fileName(pc.path()) + ") 自检失败：预期变更未在文件中找到";
            System.out.println(YELLOW + failMsg + RESET);
            log.warn(failMsg);
            notifyListener(failMsg);
        }
    }

    private void notifyListener(String text) {
        if (reflectionListener != null) {
            try {
                reflectionListener.accept(text);
            } catch (Exception ignored) {
            }
        }
    }

    /** 读取文件内容用于落盘核对；相对路径按工作区与用户空间解析。 */
    private String read(String path) {
        try {
            Path p = Paths.get(path);
            if (!p.isAbsolute()) {
                Path root = Paths.get(workspaceRoot);
                Path userPath = root.resolve(userId).resolve(path);
                if (Files.exists(userPath)) {
                    p = userPath;
                } else {
                    p = root.resolve(path);
                }
            }
            if (Files.exists(p)) {
                return Files.readString(p);
            }
            return null;
        } catch (Exception e) {
            return null;
        }
    }

    /** 从工具入参提取需要落盘校验的信息。 */
    private PendingCheck parse(ToolUseBlock call) {
        Map<String, Object> input = call.getInput();
        if (input == null) return null;
        String name = call.getName();
        String path = str(input.get("path"));
        switch (name) {
            case "write_file" -> {
                String content = str(input.get("content"));
                if (path == null || content == null) return null;
                return new PendingCheck(call.getId(), name, path, content);
            }
            case "edit_file" -> {
                String newString = str(input.get("new_string"));
                if (path == null || newString == null) return null;
                return new PendingCheck(call.getId(), name, path, newString);
            }
            default -> {
                return null;
            }
        }
    }

    /** 联网工具结果自检。 */
    private List<String> inspectWebResults(List<Msg> messages) {
        List<String> findings = new ArrayList<>();
        for (Msg m : messages) {
            for (ToolResultBlock block : m.getContentBlocks(ToolResultBlock.class)) {
                String name = block.getName();
                if (name == null || !(name.equals("web_search") || name.equals("web_fetch"))) {
                    continue;
                }
                String id = block.getId();
                if (id == null || id.isEmpty() || !webResultsSeen.add(id)) {
                    continue;
                }
                String text = block.getOutput() == null ? "" : block.getOutput().stream()
                        .filter(b -> b instanceof TextBlock)
                        .map(b -> ((TextBlock) b).getText())
                        .collect(Collectors.joining(" "));

                if (block.getState() != ToolResultState.SUCCESS) {
                    report(CAT_WEB_FAIL, "联网工具 " + name + " 执行异常：不要编造搜索/抓取结果；改用既有知识并标注「需核实」。", findings);
                    continue;
                }
                if (name.equals("web_fetch") && text.startsWith("status=")) {
                    String code = text.length() > 10 ? text.substring(7, Math.min(10, text.length())).trim() : "";
                    if (code.startsWith("2")) {
                        report(CAT_WEB_CITE, "联网内容自检：引用抓取结果时注明来源与日期；结果无法交叉确认的表述，向用户标注「需核实」。", findings);
                    } else {
                        report(CAT_WEB_FAIL, "联网抓取被目标网站拒绝或失败（HTTP " + code + "）。如需该网页内容，让用户直接打开链接查看。", findings);
                    }
                    continue;
                }
                String lower = text.toLowerCase();
                String head = lower.substring(0, Math.min(160, lower.length()));
                if (head.contains("not configured")
                        || (head.contains("tavily") && head.contains("key"))
                        || head.startsWith("error")
                        || head.contains("failed") || head.contains("exception")) {
                    report(CAT_WEB_FAIL, "联网搜索失败或不可用（" + firstLine(text) + "）。不要编造搜索结果；改用既有知识回答，并标注「未联网核实」。", findings);
                } else if (text.isBlank()) {
                    report(CAT_WEB_EMPTY, "联网搜索无结果：如实告知用户，建议更换关键词或改用既有知识。", findings);
                } else {
                    report(CAT_WEB_CITE, "联网内容自检：引用搜索/抓取结果时注明来源；结果无法交叉确认的表述，向用户标注「需核实」。", findings);
                }
            }
        }
        return findings;
    }

    private void report(String category, String text, List<String> findings) {
        if (reportedCategories.add(category)) {
            findings.add(text);
        }
    }

    private static final String CAT_WEB_FAIL = "web_fail";
    private static final String CAT_WEB_CITE = "web_cite";
    private static final String CAT_WEB_EMPTY = "web_empty";

    /** 兼容旧会话：过滤旧中间件生成的 SYSTEM 自检消息。 */
    static List<Msg> compatibleMessages(List<Msg> messages) {
        return messages.stream().filter(message -> !(message.getRole() == MsgRole.SYSTEM
                && "reflection".equals(message.getName()))).toList();
    }

    private static String str(Object o) {
        return o instanceof String s ? s : null;
    }

    private static String firstLine(String text) {
        if (text == null) return "";
        int newline = text.indexOf('\n');
        String first = (newline < 0 ? text : text.substring(0, newline)).replace('\r', ' ').trim();
        return first.substring(0, Math.min(160, first.length()));
    }

    private static String fileName(String path) {
        String p = path.replace('\\', '/');
        return p.substring(p.lastIndexOf('/') + 1);
    }
}
