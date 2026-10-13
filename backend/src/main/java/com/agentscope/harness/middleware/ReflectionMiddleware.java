package com.agentscope.harness.middleware;

import io.agentscope.core.agent.Agent;
import io.agentscope.core.agent.RuntimeContext;
import io.agentscope.core.event.AgentEvent;
import io.agentscope.core.event.ToolResultEndEvent;
import io.agentscope.core.message.ToolUseBlock;
import io.agentscope.core.middleware.ActingInput;
import io.agentscope.core.middleware.AgentInput;
import io.agentscope.core.middleware.MiddlewareBase;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import reactor.core.publisher.Flux;

import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.Paths;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import java.util.concurrent.ConcurrentHashMap;
import java.util.function.Function;

/**
 * Reflection 反思中间件：框架级「干完检查」。
 * <ul>
 *   <li>监控 write_file / edit_file 执行，验证磁盘落地状态；</li>
 *   <li>汇总所有工具执行结果状态；</li>
 *   <li>仅打印自检日志，避免向模型上下文注入杂音。</li>
 * </ul>
 */
public class ReflectionMiddleware implements MiddlewareBase {

    private static final Logger log = LoggerFactory.getLogger(ReflectionMiddleware.class);

    private record PendingCheck(String toolCallId, String toolName, String path) {}

    private final Map<String, String> results = new ConcurrentHashMap<>();

    @Override
    public Flux<AgentEvent> onAgent(Agent agent, RuntimeContext ctx, AgentInput in,
                                    Function<AgentInput, Flux<AgentEvent>> next) {
        results.clear();
        return next.apply(in);
    }

    @Override
    public Flux<AgentEvent> onActing(Agent agent, RuntimeContext ctx, ActingInput in,
                                     Function<ActingInput, Flux<AgentEvent>> next) {
        List<PendingCheck> checks = new ArrayList<>();
        for (ToolUseBlock call : in.toolCalls()) {
            if ("write_file".equals(call.getName()) || "edit_file".equals(call.getName())) {
                Object input = call.getInput();
                if (input instanceof Map<?, ?> map && map.containsKey("path")) {
                    checks.add(new PendingCheck(call.getId(), call.getName(), String.valueOf(map.get("path"))));
                }
            }
        }

        return next.apply(in)
                .doOnNext(event -> {
                    if (event instanceof ToolResultEndEvent e) {
                        results.put(e.getToolCallId(), e.getToolCallName() + ":" + e.getState());
                    }
                })
                .doOnComplete(() -> {
                    // 自检验证文件是否真正存在
                    for (PendingCheck pc : checks) {
                        try {
                            Path p = Paths.get(pc.path());
                            if (Files.exists(p)) {
                                log.debug("[Reflection] 文件工具执行自检核对成功: {}", pc.path());
                            } else {
                                log.warn("[Reflection] 警报：工具已执行，但目标文件不存在: {}", pc.path());
                            }
                        } catch (Exception ignored) {
                        }
                    }

                    if (!results.isEmpty()) {
                        long ok = results.values().stream().filter(v -> v.endsWith(":SUCCESS")).count();
                        log.info("[Reflection] 本轮 {} 项工具调用：{} 成功 / {} 异常",
                                results.size(), ok, (results.size() - ok));
                    }
                });
    }
}
