package com.agentscope.harness.middleware;

import io.agentscope.core.agent.Agent;
import io.agentscope.core.agent.RuntimeContext;
import io.agentscope.core.event.AgentEvent;
import io.agentscope.core.event.TextBlockDeltaEvent;
import io.agentscope.core.message.Msg;
import io.agentscope.core.message.MsgRole;
import io.agentscope.core.message.TextBlock;
import io.agentscope.core.middleware.AgentInput;
import io.agentscope.core.middleware.MiddlewareBase;
import io.agentscope.core.model.Model;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import reactor.core.publisher.Flux;
import reactor.core.scheduler.Schedulers;

import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.Paths;
import java.nio.file.StandardOpenOption;
import java.time.Duration;
import java.time.Instant;
import java.time.ZoneId;
import java.time.format.DateTimeFormatter;
import java.util.ArrayList;
import java.util.List;
import java.util.concurrent.CompletableFuture;
import java.util.function.Function;

/**
 * 异步记忆 flush 中间件：
 * 替代同步 flush（避免阻塞回合管线导致结束延迟 20-50 秒）。
 * <ul>
 *   <li>回合结束后在后台线程做一次 LLM 事实抽取（默认 10 分钟节流）；</li>
 *   <li>抽取结果追加到 userId/ 命名空间的 memory/YYYY-MM-DD.md 日流水账；</li>
 *   <li>完全异步，不阻塞用户前端交互。</li>
 * </ul>
 */
public class AsyncMemoryFlushMiddleware implements MiddlewareBase {

    private static final Logger log = LoggerFactory.getLogger(AsyncMemoryFlushMiddleware.class);
    private static final ZoneId ZONE = ZoneId.systemDefault();
    private static final DateTimeFormatter DAY = DateTimeFormatter.ofPattern("yyyy-MM-dd");

    private final Model model;
    private final String workspaceRoot;
    private final String userId;
    private final long minGapMillis;

    private final StringBuilder turnAnswer = new StringBuilder();
    private volatile String turnQuestion = "";
    private volatile long lastFlushAt = 0;
    private volatile CompletableFuture<String> inFlight;

    public AsyncMemoryFlushMiddleware(Model model, String workspaceRoot, String userId, long minGapMillis) {
        this.model = model;
        this.workspaceRoot = workspaceRoot;
        this.userId = userId;
        this.minGapMillis = minGapMillis;
    }

    @Override
    public Flux<AgentEvent> onAgent(Agent agent, RuntimeContext ctx, AgentInput in,
                                    Function<AgentInput, Flux<AgentEvent>> next) {
        turnAnswer.setLength(0);
        for (Msg m : in.msgs()) {
            if (m.getRole() == MsgRole.USER) {
                for (io.agentscope.core.message.ContentBlock b : m.getContent()) {
                    if (b instanceof TextBlock t) {
                        turnQuestion = t.getText();
                    }
                }
            }
        }
        return next.apply(in)
                .doOnNext(event -> {
                    if (event instanceof TextBlockDeltaEvent e
                            && (e.getSource() == null || e.getSource().isEmpty())) {
                        turnAnswer.append(e.getDelta());
                    }
                })
                .doOnComplete(() -> {
                    long now = System.currentTimeMillis();
                    if (now - lastFlushAt < minGapMillis) {
                        return;
                    }
                    lastFlushAt = now;
                    String question = turnQuestion;
                    String answer = turnAnswer.toString();
                    if (question.isBlank() || answer.isBlank()) {
                        return;
                    }
                    // 在后台异步线程调度记忆事实抽取与合并落盘
                    inFlight = CompletableFuture.supplyAsync(() -> extractAndPersist(question, answer))
                            .exceptionally(ex -> {
                                log.warn("[MemoryFlush] 后台记忆抽取异常：{}", ex.getMessage());
                                return null;
                            });
                });
    }

    private String extractAndPersist(String question, String answer) {
        try {
            String prompt = """
                    请分析以下对话，提取其中关于用户偏好、重要事实或关键决策的记忆条目。
                    如果没有任何值得长期保存的信息，请回复 NONE。
                    如果有，请用无序列表（以 - 开头）输出，每条简明扼要，用中文输出。
                    
                    用户问题：%s
                    助手回答：%s
                    """.formatted(question, answer.length() > 2000 ? answer.substring(0, 2000) : answer);

            List<Msg> msgs = List.of(Msg.builder()
                    .role(MsgRole.USER)
                    .name("system")
                    .textContent(prompt)
                    .build());

            StringBuilder extracted = new StringBuilder();
            model.stream(msgs, List.of(), null)
                    .publishOn(Schedulers.boundedElastic())
                    .doOnNext(chunk -> {
                        if (chunk != null && chunk.getContent() != null) {
                            for (var block : chunk.getContent()) {
                                if (block instanceof TextBlock tb) {
                                    extracted.append(tb.getText());
                                }
                            }
                        }
                    })
                    .blockLast(Duration.ofSeconds(60));

            String result = extracted.toString().trim();
            if (result.isEmpty() || result.equalsIgnoreCase("NONE") || result.contains("没有") && result.length() < 20) {
                return null;
            }

            // 持久化到 memory/YYYY-MM-DD.md
            String today = DAY.format(Instant.ofEpochMilli(System.currentTimeMillis()).atZone(ZONE));
            Path memoryDir = Paths.get(workspaceRoot, userId, "memory");
            Files.createDirectories(memoryDir);
            Path dailyFile = memoryDir.resolve(today + ".md");

            String entry = "\n### " + Instant.now().toString() + "\n" + result + "\n";
            Files.writeString(dailyFile, entry, StandardOpenOption.CREATE, StandardOpenOption.APPEND);
            log.info("[MemoryFlush] 已异步记录记忆条目至 {}", dailyFile);
            return result;
        } catch (Exception e) {
            log.warn("[MemoryFlush] 记忆落盘失败: {}", e.getMessage());
            return null;
        }
    }
}
