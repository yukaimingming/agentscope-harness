package com.agentscope.harness.service;

import com.agentscope.harness.model.*;
import com.agentscope.harness.model.Activity.*;
import com.agentscope.harness.model.FileDiff.DiffHunk;
import com.agentscope.harness.model.FileDiff.DiffLine;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import io.agentscope.core.event.*;
import io.agentscope.core.message.ToolUseBlock;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;

import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.Paths;
import java.util.*;
import java.util.concurrent.ConcurrentHashMap;
import java.util.function.Consumer;

/**
 * AgentScope 事件流到 AG-UI 协议的适配器。
 */
public class AguiAdapter {

    private static final Logger log = LoggerFactory.getLogger(AguiAdapter.class);

    private final String runId;
    private final String threadId;
    private final ObjectMapper objectMapper;
    private final Consumer<String> sseWriter;
    private final String workspaceRoot;

    private boolean runStartedEmitted = false;
    private boolean reasoningStarted = false;
    private boolean reasoningEnded = false;
    private final String reasoningMsgId;

    private boolean textStarted = false;
    private boolean textEnded = false;
    private final String textMsgId;
    private final StringBuilder fullAnswer = new StringBuilder();

    private final Map<String, Activity> activities = new ConcurrentHashMap<>();
    private final Map<String, StringBuilder> toolArgBuffers = new ConcurrentHashMap<>();
    private final Map<String, String> toolPreContents = new ConcurrentHashMap<>();

    private final long startedAt;
    private volatile boolean finished = false;

    public AguiAdapter(String runId, String threadId, ObjectMapper objectMapper,
                       Consumer<String> sseWriter, String workspaceRoot) {
        this.runId = runId;
        this.threadId = threadId;
        this.objectMapper = objectMapper;
        this.sseWriter = sseWriter;
        this.workspaceRoot = workspaceRoot;
        this.reasoningMsgId = "msg-reasoning-" + UUID.randomUUID();
        this.textMsgId = "msg-text-" + UUID.randomUUID();
        this.startedAt = System.currentTimeMillis();
    }

    public synchronized void emitRunStarted() {
        if (!runStartedEmitted) {
            runStartedEmitted = true;
            emitJson(Map.of(
                    "type", AguiEventType.RUN_STARTED,
                    "runId", runId,
                    "threadId", threadId
            ));
        }
    }

    /**
     * 处理 AgentScope 事件。
     */
    public synchronized void onAgentEvent(AgentEvent event) {
        emitRunStarted();

        if (event instanceof ThinkingBlockDeltaEvent e) {
            handleThinkingDelta(e.getDelta());
        } else if (event instanceof ThinkingBlockEndEvent) {
            endReasoningIfNeeded();
        } else if (event instanceof TextBlockDeltaEvent e) {
            handleTextDelta(e.getDelta());
        } else if (event instanceof ToolCallStartEvent e) {
            handleToolCallStart(e);
        } else if (event instanceof ToolCallDeltaEvent e) {
            handleToolCallDelta(e);
        } else if (event instanceof ToolCallEndEvent e) {
            handleToolCallEnd(e);
        } else if (event instanceof ToolResultEndEvent e) {
            handleToolResultEnd(e);
        }
    }

    private void handleThinkingDelta(String delta) {
        if (delta == null || delta.isEmpty()) return;
        if (!reasoningStarted) {
            reasoningStarted = true;
            emitJson(Map.of(
                    "type", AguiEventType.REASONING_START,
                    "messageId", reasoningMsgId
            ));
        }
        emitJson(Map.of(
                "type", AguiEventType.REASONING_CONTENT,
                "messageId", reasoningMsgId,
                "delta", delta
        ));
    }

    private void endReasoningIfNeeded() {
        if (reasoningStarted && !reasoningEnded) {
            reasoningEnded = true;
            emitJson(Map.of(
                    "type", AguiEventType.REASONING_END,
                    "messageId", reasoningMsgId
            ));
        }
    }

    private void handleTextDelta(String delta) {
        if (delta == null || delta.isEmpty()) return;
        endReasoningIfNeeded();

        if (!textStarted) {
            textStarted = true;
            emitJson(Map.of(
                    "type", AguiEventType.TEXT_MESSAGE_START,
                    "messageId", textMsgId,
                    "role", "assistant"
            ));
        }
        fullAnswer.append(delta);
        emitJson(Map.of(
                "type", AguiEventType.TEXT_MESSAGE_CONTENT,
                "messageId", textMsgId,
                "delta", delta
        ));
    }

    private void handleToolCallStart(ToolCallStartEvent e) {
        endReasoningIfNeeded();
        String callId = e.getToolCallId();
        String toolName = e.getToolCallName();

        toolArgBuffers.put(callId, new StringBuilder());
        Activity activity = new Activity(callId, resolveKind(toolName), "running",
                toolName, System.currentTimeMillis());
        activity.setRunId(runId);

        // 如果是文件写或修改，在执行前记录现有磁盘内容以便生成 diff
        if ("write_file".equals(toolName) || "edit_file".equals(toolName)) {
            capturePreContent(callId, toolName, null);
        }

        activities.put(callId, activity);
        emitActivity(activity);
    }

    private void handleToolCallDelta(ToolCallDeltaEvent e) {
        String callId = e.getToolCallId();
        if (callId != null && e.getDelta() != null) {
            StringBuilder sb = toolArgBuffers.get(callId);
            if (sb != null) {
                sb.append(e.getDelta());
            }
        }
    }

    private void handleToolCallEnd(ToolCallEndEvent e) {
        String callId = e.getToolCallId();
        String toolName = e.getToolCallName();
        Activity activity = activities.get(callId);
        if (activity == null) {
            activity = new Activity(callId, resolveKind(toolName), "running", toolName, System.currentTimeMillis());
            activity.setRunId(runId);
            activities.put(callId, activity);
        }

        StringBuilder sb = toolArgBuffers.get(callId);
        String rawArgs = sb != null ? sb.toString() : "";
        Object parsedInput = parseJsonOrRaw(rawArgs);

        if ("write_file".equals(toolName) || "edit_file".equals(toolName)) {
            capturePreContent(callId, toolName, parsedInput);
        }

        // 解析 Todo 清单
        if ("todo_write".equals(toolName) && parsedInput instanceof Map<?, ?> map) {
            activity.setKind("todo");
            Object itemsObj = map.get("todos");
            if (itemsObj instanceof List<?> list) {
                List<TodoItem> items = new ArrayList<>();
                int completed = 0;
                for (Object item : list) {
                    if (item instanceof Map<?, ?> m) {
                        String content = m.get("content") != null ? String.valueOf(m.get("content")) : "";
                        String status = m.get("status") != null ? String.valueOf(m.get("status")) : "pending";
                        items.add(new TodoItem(content, status));
                        if ("completed".equalsIgnoreCase(status)) completed++;
                    }
                }
                activity.setDetail(new TodoDetail(items, completed, items.size()));
                activity.setTitle("待办任务清单");
            }
        } else if ("agent_spawn".equals(toolName) && parsedInput instanceof Map<?, ?> map) {
            activity.setKind("subagent");
            String agentName = map.get("agent") != null ? String.valueOf(map.get("agent")) : "researcher";
            String task = map.get("task") != null ? String.valueOf(map.get("task")) : "";
            activity.setTitle("子智能体 [" + agentName + "]");
            activity.setDetail(new SubagentDetail(agentName, task));
        } else if (isFileTool(toolName)) {
            activity.setKind("file");
            String filePath = extractPath(parsedInput);
            activity.setTitle(toolName + " " + (filePath.isEmpty() ? "" : filePath));
            activity.setDetail(new FileDetail(filePath, mapFileOp(toolName)));
        } else {
            activity.setDetail(new ToolDetail(toolName, parsedInput));
        }

        emitActivity(activity);
    }

    private void handleToolResultEnd(ToolResultEndEvent e) {
        String callId = e.getToolCallId();
        Activity activity = activities.get(callId);
        if (activity == null) return;

        long now = System.currentTimeMillis();
        activity.setEndedAt(now);
        activity.setDurationMs(Math.max(0, now - activity.getStartedAt()));

        boolean success = e.getState() != null && "SUCCESS".equalsIgnoreCase(e.getState().name());
        activity.setStatus(success ? "completed" : "failed");

        String outputStr = e.getState() != null ? e.getState().name() : "";
        if (activity.getDetail() instanceof ToolDetail td) {
            td.setOutput(outputStr.length() > 5000 ? outputStr.substring(0, 5000) + "…(已截断)" : outputStr);
            td.setTruncated(outputStr.length() > 5000);
        } else if (activity.getDetail() instanceof FileDetail fd) {
            // 计算 Diff
            String pre = toolPreContents.remove(callId);
            if (pre != null && ("write".equals(fd.getOperation()) || "edit".equals(fd.getOperation()))) {
                String post = readDiskContent(fd.getPath());
                fd.setDiff(calculateDiff(fd.getPath(), pre, post));
            }
        } else if (activity.getDetail() instanceof SubagentDetail sd) {
            sd.setResultSummary(outputStr.length() > 1000 ? outputStr.substring(0, 1000) + "…" : outputStr);
        }

        emitActivity(activity);
    }

    /**
     * 发出人工审批中断卡片与快照。
     */
    public synchronized void emitRequireConfirm(List<ToolUseBlock> pendingCalls) {
        endReasoningIfNeeded();

        List<RunSnapshot.InterruptItem> interruptItems = new ArrayList<>();
        for (ToolUseBlock call : pendingCalls) {
            String interruptId = "interrupt-" + UUID.randomUUID();
            Activity approvalActivity = new Activity(
                    interruptId,
                    "approval",
                    "waiting_approval",
                    "审批请求：" + call.getName(),
                    System.currentTimeMillis()
            );
            approvalActivity.setRunId(runId);
            approvalActivity.setSubtitle("该工具调用需要您的确认批准后方可执行");
            approvalActivity.setDetail(new ApprovalDetail(call.getName(), call.getInput(), "高影响操作审批"));
            activities.put(interruptId, approvalActivity);
            emitActivity(approvalActivity);

            interruptItems.add(new RunSnapshot.InterruptItem(
                    interruptId,
                    "tool_approval",
                    call.getName(),
                    call.getInput()
            ));
        }

        // 推送待审批快照
        RunSnapshot snapshot = new RunSnapshot();
        snapshot.setStatus("waiting_approval");
        snapshot.setRunId(runId);
        snapshot.setThreadId(threadId);
        snapshot.setStartedAt(startedAt);
        snapshot.setProgressNote("等待用户确认批准工具执行…");
        snapshot.setInterrupts(interruptItems);
        emitRunSnapshot(snapshot);

        // 结束本轮连接（outcome: interrupt）
        emitJson(Map.of(
                "type", AguiEventType.RUN_FINISHED,
                "runId", runId,
                "threadId", threadId,
                "outcome", Map.of(
                        "type", "interrupt",
                        "interrupts", interruptItems
                )
        ));
        this.finished = true;
    }

    /**
     * 正常结束本轮运行。
     */
    public synchronized void emitRunFinished() {
        if (finished) return;
        finished = true;
        endReasoningIfNeeded();

        if (textStarted && !textEnded) {
            textEnded = true;
            emitJson(Map.of(
                    "type", AguiEventType.TEXT_MESSAGE_END,
                    "messageId", textMsgId
            ));
        }

        RunSnapshot snapshot = new RunSnapshot();
        snapshot.setStatus("completed");
        snapshot.setRunId(runId);
        snapshot.setThreadId(threadId);
        snapshot.setStartedAt(startedAt);
        snapshot.setEndedAt(System.currentTimeMillis());
        snapshot.setDurationMs(snapshot.getEndedAt() - startedAt);
        snapshot.setProgressNote("任务完成");
        emitRunSnapshot(snapshot);

        emitJson(Map.of(
                "type", AguiEventType.RUN_FINISHED,
                "runId", runId,
                "threadId", threadId,
                "outcome", Map.of("type", "success")
        ));
    }

    /**
     * 运行出错。
     */
    public synchronized void emitRunError(String errorMessage) {
        if (finished) return;
        finished = true;
        endReasoningIfNeeded();

        emitJson(Map.of(
                "type", AguiEventType.RUN_ERROR,
                "runId", runId,
                "threadId", threadId,
                "message", errorMessage != null ? errorMessage : "未知运行错误"
        ));
    }

    private void emitActivity(Activity activity) {
        emitJson(Map.of(
                "type", AguiEventType.CUSTOM,
                "name", AguiEventType.CUSTOM_ACTIVITY,
                "value", activity
        ));
    }

    private void emitRunSnapshot(RunSnapshot snapshot) {
        emitJson(Map.of(
                "type", AguiEventType.CUSTOM,
                "name", AguiEventType.CUSTOM_RUN_SNAPSHOT,
                "value", snapshot
        ));
    }

    private void emitJson(Object data) {
        try {
            String json = objectMapper.writeValueAsString(data);
            sseWriter.accept("data: " + json + "\n\n");
        } catch (Exception e) {
            log.error("写入 SSE 事件异常", e);
        }
    }

    private String resolveKind(String toolName) {
        if ("todo_write".equals(toolName)) return "todo";
        if ("agent_spawn".equals(toolName)) return "subagent";
        if (isFileTool(toolName)) return "file";
        return "tool";
    }

    private boolean isFileTool(String name) {
        return name.contains("file") || "ls".equals(name) || "glob".equals(name) || "grep".equals(name);
    }

    private String mapFileOp(String toolName) {
        if (toolName.contains("read")) return "read";
        if (toolName.contains("write")) return "write";
        if (toolName.contains("edit")) return "edit";
        if (toolName.contains("delete")) return "delete";
        if ("ls".equals(toolName)) return "list";
        if ("glob".equals(toolName)) return "glob";
        if ("grep".equals(toolName)) return "grep";
        return "read";
    }

    private String extractPath(Object input) {
        if (input instanceof Map<?, ?> m && m.containsKey("path")) {
            return String.valueOf(m.get("path"));
        }
        return "";
    }

    private void capturePreContent(String callId, String toolName, Object input) {
        String pathStr = input != null ? extractPath(input) : "";
        if (!pathStr.isEmpty()) {
            toolPreContents.put(callId, readDiskContent(pathStr));
        }
    }

    private String readDiskContent(String pathStr) {
        try {
            Path p = Paths.get(pathStr);
            if (!p.isAbsolute()) {
                p = Paths.get(workspaceRoot).resolve(pathStr);
            }
            if (Files.exists(p) && Files.isRegularFile(p)) {
                return Files.readString(p);
            }
        } catch (Exception ignored) {
        }
        return "";
    }

    private FileDiff calculateDiff(String path, String before, String after) {
        FileDiff diff = new FileDiff(path, before.isEmpty() ? "created" : "modified", 0, 0);
        List<String> bLines = Arrays.asList(before.split("\r?\n"));
        List<String> aLines = Arrays.asList(after.split("\r?\n"));

        List<DiffLine> lines = new ArrayList<>();
        int additions = 0;
        int deletions = 0;

        // 简易差分对比展示
        int max = Math.max(bLines.size(), aLines.size());
        for (int i = 0; i < max; i++) {
            String b = i < bLines.size() ? bLines.get(i) : null;
            String a = i < aLines.size() ? aLines.get(i) : null;
            if (Objects.equals(b, a)) {
                lines.add(new DiffLine("normal", a, i + 1, i + 1));
            } else {
                if (b != null) {
                    lines.add(new DiffLine("delete", b, i + 1, null));
                    deletions++;
                }
                if (a != null) {
                    lines.add(new DiffLine("add", a, null, i + 1));
                    additions++;
                }
            }
        }

        diff.setAdditions(additions);
        diff.setDeletions(deletions);
        diff.setHunks(List.of(new DiffHunk("@@ -1," + bLines.size() + " +1," + aLines.size() + " @@", lines)));
        diff.setBeforeContent(before);
        diff.setAfterContent(after);
        return diff;
    }

    private Object parseJsonOrRaw(String text) {
        if (text == null || text.isBlank()) return Map.of();
        try {
            return objectMapper.readValue(text, Object.class);
        } catch (Exception e) {
            return text;
        }
    }
}
