package com.agentscope.harness.controller;

import com.agentscope.harness.model.RunAgentInput;
import com.agentscope.harness.service.HarnessAgentManager;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.servlet.mvc.method.annotation.ResponseBodyEmitter;

import java.io.IOException;
import java.util.Map;
import java.util.concurrent.atomic.AtomicBoolean;

/**
 * AG-UI 协议核心交互控制器。
 * <ul>
 *   <li>POST /agent: SSE 流式执行端点</li>
 *   <li>POST /agent/cancel: 取消当前会话端点</li>
 * </ul>
 */
@RestController
@CrossOrigin
public class AgentController {

    private static final Logger log = LoggerFactory.getLogger(AgentController.class);

    private final HarnessAgentManager agentManager;

    public AgentController(HarnessAgentManager agentManager) {
        this.agentManager = agentManager;
    }

    /**
     * AG-UI SSE 执行接口。
     */
    @PostMapping(value = "/agent", produces = MediaType.TEXT_EVENT_STREAM_VALUE)
    public ResponseBodyEmitter runAgent(@RequestBody RunAgentInput input) {
        // 设置超长超时（例如 30 分钟），避免长任务在流中途被切断
        ResponseBodyEmitter emitter = new ResponseBodyEmitter(1800_000L);
        AtomicBoolean completed = new AtomicBoolean(false);

        emitter.onCompletion(() -> completed.set(true));
        emitter.onTimeout(() -> {
            completed.set(true);
            agentManager.cancelThread(input.getThreadId());
        });
        emitter.onError(e -> {
            completed.set(true);
            agentManager.cancelThread(input.getThreadId());
        });

        agentManager.execute(
                input,
                chunk -> {
                    if (!completed.get()) {
                        try {
                            emitter.send(chunk);
                        } catch (Exception e) {
                            completed.set(true);
                            agentManager.cancelThread(input.getThreadId());
                        }
                    }
                },
                () -> {
                    if (!completed.get()) {
                        try {
                            completed.set(true);
                            emitter.complete();
                        } catch (Exception ignored) {
                        }
                    }
                }
        );

        return emitter;
    }

    /**
     * 取消指定会话的运行。
     */
    @PostMapping("/agent/cancel")
    public ResponseEntity<Map<String, Object>> cancel(@RequestBody Map<String, String> body) {
        String threadId = body.get("threadId");
        if (threadId == null || threadId.isBlank()) {
            return ResponseEntity.badRequest().body(Map.of("error", "缺少 threadId"));
        }
        boolean cancelled = agentManager.cancelThread(threadId);
        return ResponseEntity.ok(Map.of("ok", true, "cancelled", cancelled));
    }
}
