package com.agentscope.harness.service;

import com.agentscope.harness.model.*;
import com.agentscope.harness.model.Activity.*;
import com.agentscope.harness.model.FileDiff.DiffHunk;
import com.agentscope.harness.model.FileDiff.DiffLine;
import com.fasterxml.jackson.databind.ObjectMapper;
import io.agentscope.core.event.*;
import io.agentscope.core.message.ToolUseBlock;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;

import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.Paths;
import java.util.*;
import java.util.concurrent.ConcurrentHashMap;
import java.util.function.Consumer;

/**
 * AgentScope 事件流到 AG-UI 协议的适配器。
 * 完整对齐原项目（LangChain / Deep Agents UI）协议标准：
 * 1. 思考流采用 REASONING_MESSAGE_START / CONTENT / END 独立事件；
 * 2. 工具调用前后的文本识别为伴随过程说明，通过 deepagent:process-message 标记并在时间线中渲染；
 * 3. 监听 ToolResultTextDeltaEvent 累积真实工具执行输出详情，并放入 ToolDetail.output；
 * 4. 工具与文件卡片 ID 统一为 tool:<callId> 与 file:<callId>；
 * 5. 自动捕获文件修改并生成行级 diff。
 */
public class AguiAdapter {

    private static final Logger log = LoggerFactory.getLogger(AguiAdapter.class);

    private final String runId;
    private final String threadId;
    private final ObjectMapper objectMapper;
    private final Consumer<String> sseWriter;
    private final String workspaceRoot;

    private boolean runStartedEmitted = false;

    // 当前思考流状态
    private String openReasoningId = null;

    // 当前文本流状态
    private String openTextId = null;
    private final StringBuilder fullAnswer = new StringBuilder();

    // 工具调用与输出累积缓冲区
    private final Map<String, Activity> activities = new ConcurrentHashMap<>();
    private final Map<String, StringBuilder> toolArgBuffers = new ConcurrentHashMap<>();
    private final Map<String, StringBuilder> toolOutputBuffers = new ConcurrentHashMap<>();
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

            RunSnapshot snapshot = new RunSnapshot();
            snapshot.setStatus("running");
            snapshot.setRunId(runId);
            snapshot.setThreadId(threadId);
            snapshot.setStartedAt(startedAt);
            snapshot.setProgressNote("智能体已就绪，正在分析任务…");
            emitRunSnapshot(snapshot);
        }
    }

    /**
     * 处理 AgentScope 事件流。
     */
    public synchronized void onAgentEvent(AgentEvent event) {
        emitRunStarted();

        if (event instanceof ThinkingBlockStartEvent) {
            startReasoning();
        } else if (event instanceof ThinkingBlockDeltaEvent e) {
            handleThinkingDelta(e.getDelta());
        } else if (event instanceof ThinkingBlockEndEvent) {
            endReasoning();
        } else if (event instanceof TextBlockDeltaEvent e) {
            handleTextDelta(e.getDelta());
        } else if (event instanceof TextBlockEndEvent) {
            endText();
        } else if (event instanceof ToolCallStartEvent e) {
            handleToolCallStart(e);
        } else if (event instanceof ToolCallDeltaEvent e) {
            handleToolCallDelta(e);
        } else if (event instanceof ToolCallEndEvent e) {
            handleToolCallEnd(e);
        } else if (event instanceof ToolResultTextDeltaEvent e) {
            handleToolResultTextDelta(e);
        } else if (event instanceof ToolResultEndEvent e) {
            handleToolResultEnd(e);
        }
    }

    private void startReasoning() {
        if (openReasoningId == null) {
            openReasoningId = "msg-reasoning-" + UUID.randomUUID();
            emitJson(Map.of(
                    "type", AguiEventType.REASONING_MESSAGE_START,
                    "messageId", openReasoningId,
                    "role", "reasoning"
            ));
            emitSnapshotProgress("模型深度思考中…");
        }
    }

    private void handleThinkingDelta(String delta) {
        if (delta == null || delta.isEmpty()) return;
        if (openReasoningId == null) {
            startReasoning();
        }
        emitJson(Map.of(
                "type", AguiEventType.REASONING_MESSAGE_CONTENT,
                "messageId", openReasoningId,
                "delta", delta
        ));
    }

    private void endReasoning() {
        if (openReasoningId != null) {
            emitJson(Map.of(
                    "type", AguiEventType.REASONING_MESSAGE_END,
                    "messageId", openReasoningId
            ));
            openReasoningId = null;
        }
    }

    private final StringBuilder currentTextContent = new StringBuilder();

    private void startText() {
        endReasoning();
        if (openTextId == null) {
            openTextId = "msg-text-" + UUID.randomUUID();
            currentTextContent.setLength(0);
            emitJson(Map.of(
                    "type", AguiEventType.TEXT_MESSAGE_START,
                    "messageId", openTextId,
                    "role", "assistant"
            ));
        }
    }

    private void handleTextDelta(String delta) {
        if (delta == null || delta.isEmpty()) return;
        // 如果当前尚未开启正文，且delta全部是换行或空白字符，先不开启正文，避免产生空气泡
        if (openTextId == null && delta.isBlank()) {
            return;
        }

        endReasoning();

        if (openTextId == null) {
            startText();
        }
        fullAnswer.append(delta);
        currentTextContent.append(delta);
        emitJson(Map.of(
                "type", AguiEventType.TEXT_MESSAGE_CONTENT,
                "messageId", openTextId,
                "delta", delta
        ));
    }

    private void endText() {
        if (openTextId != null) {
            emitJson(Map.of(
                    "type", AguiEventType.TEXT_MESSAGE_END,
                    "messageId", openTextId
            ));
            openTextId = null;
            currentTextContent.setLength(0);
        }
    }

    private void handleToolCallStart(ToolCallStartEvent e) {
        endReasoning();

        // 仅当调用工具前输出了实质性非空白文本时，才标记为伴随工具的中间过程说明
        if (openTextId != null && !currentTextContent.toString().trim().isEmpty()) {
            emitJson(Map.of(
                    "type", AguiEventType.CUSTOM,
                    "name", AguiEventType.CUSTOM_PROCESS_MESSAGE,
                    "value", Map.of("messageId", openTextId, "runId", runId)
            ));
            endText();
        } else if (openTextId != null) {
            // 纯空白或空串的说明，直接平滑结束闭合，不作为过程文本
            endText();
        }

        String callId = e.getToolCallId();
        String toolName = e.getToolCallName();

        toolArgBuffers.put(callId, new StringBuilder());
        toolOutputBuffers.put(callId, new StringBuilder());

        // 统一以 tool:<callId> 作为工具卡片 ID
        String toolActivityId = "tool:" + callId;
        Activity toolActivity = new Activity(
                toolActivityId,
                "tool",
                "running",
                toolName,
                System.currentTimeMillis()
        );
        toolActivity.setRunId(runId);
        toolActivity.setSubtitle("执行中");
        toolActivity.setDetail(new ToolDetail(toolName, Map.of()));
        activities.put(toolActivityId, toolActivity);
        emitActivity(toolActivity);

        // 如果是文件操作工具，同时创建 file:<callId> 卡片
        if (isFileTool(toolName)) {
            String fileActivityId = "file:" + callId;
            String op = mapFileOp(toolName);
            Activity fileActivity = new Activity(
                    fileActivityId,
                    "file",
                    "running",
                    op + " · " + toolName,
                    System.currentTimeMillis()
            );
            fileActivity.setRunId(runId);
            fileActivity.setDetail(new FileDetail("", op));
            activities.put(fileActivityId, fileActivity);
            emitActivity(fileActivity);
        }

        // 文件修改前捕获基线内容
        if ("write_file".equals(toolName) || "edit_file".equals(toolName)) {
            capturePreContent(callId, toolName, null);
        }
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
        String toolActivityId = "tool:" + callId;

        StringBuilder sb = toolArgBuffers.get(callId);
        String rawArgs = sb != null ? sb.toString() : "";
        Object parsedInput = parseJsonOrRaw(rawArgs);

        if ("write_file".equals(toolName) || "edit_file".equals(toolName)) {
            capturePreContent(callId, toolName, parsedInput);
        }

        // 更新工具卡片参数详情
        Activity toolActivity = activities.get(toolActivityId);
        if (toolActivity != null) {
            toolActivity.setDetail(new ToolDetail(toolName, parsedInput));
            emitActivity(toolActivity);
        }

        // 处理文件卡片
        if (isFileTool(toolName)) {
            String fileActivityId = "file:" + callId;
            Activity fileActivity = activities.get(fileActivityId);
            if (fileActivity != null) {
                String filePath = extractPath(parsedInput);
                fileActivity.setSubtitle(filePath);
                fileActivity.setDetail(new FileDetail(filePath, mapFileOp(toolName)));
                emitActivity(fileActivity);
            }
        }

        // 处理 Todo 卡片（兼容 todo_write / write_todos / task_update 及各类参数别名）
        boolean isTodoTool = "write_todos".equals(toolName) || "todo_write".equals(toolName)
                || "update_todos".equals(toolName) || "todo_update".equals(toolName) || "task_update".equals(toolName);
        if (parsedInput instanceof Map<?, ?> map && (isTodoTool || map.containsKey("todos") || map.containsKey("tasks") || map.containsKey("taskList"))) {
            String todoId = "todo:" + threadId;
            Activity todoActivity = activities.get(todoId);
            if (todoActivity == null) {
                todoActivity = new Activity(todoId, "todo", "running", "待办任务清单", System.currentTimeMillis());
                todoActivity.setRunId(runId);
                activities.put(todoId, todoActivity);
            }
            Object itemsObj = map.get("todos");
            if (itemsObj == null) itemsObj = map.get("tasks");
            if (itemsObj == null) itemsObj = map.get("items");
            if (itemsObj == null) itemsObj = map.get("taskList");

            if (itemsObj instanceof List<?> list) {
                List<TodoItem> items = new ArrayList<>();
                int completed = 0;
                for (Object item : list) {
                    if (item instanceof Map<?, ?> m) {
                        String content = "";
                        if (m.get("content") != null) content = String.valueOf(m.get("content"));
                        else if (m.get("task") != null) content = String.valueOf(m.get("task"));
                        else if (m.get("description") != null) content = String.valueOf(m.get("description"));
                        else if (m.get("title") != null) content = String.valueOf(m.get("title"));
                        else if (m.get("name") != null) content = String.valueOf(m.get("name"));

                        String rawStatus = m.get("status") != null ? String.valueOf(m.get("status")).trim().toLowerCase() : "";
                        boolean isDone = "completed".equals(rawStatus) || "done".equals(rawStatus) || "finished".equals(rawStatus)
                                || "success".equals(rawStatus) || "closed".equals(rawStatus) || "resolved".equals(rawStatus)
                                || Boolean.TRUE.equals(m.get("done")) || "true".equalsIgnoreCase(String.valueOf(m.get("done")))
                                || Boolean.TRUE.equals(m.get("completed")) || "true".equalsIgnoreCase(String.valueOf(m.get("completed")));

                        boolean isInProgress = "in_progress".equals(rawStatus) || "running".equals(rawStatus) || "doing".equals(rawStatus) || "started".equals(rawStatus);

                        String finalStatus = isDone ? "completed" : (isInProgress ? "in_progress" : "pending");
                        items.add(new TodoItem(content, finalStatus));
                        if (isDone) completed++;
                    }
                }
                todoActivity.setDetail(new TodoDetail(items, completed, items.size()));
                String subtitle = (completed >= items.size() && !items.isEmpty())
                        ? "已完成 (" + completed + "/" + items.size() + ")"
                        : "进行中 (" + completed + "/" + items.size() + ")";
                todoActivity.setSubtitle(subtitle);
                if (completed >= items.size() && !items.isEmpty()) {
                    todoActivity.setStatus("completed");
                }
                emitActivity(todoActivity);
            }
        } else if ("agent_spawn".equals(toolName) && parsedInput instanceof Map<?, ?> map) {
            String subagentId = "subagent:" + callId;
            Activity subActivity = new Activity(subagentId, "subagent", "running", "子智能体任务", System.currentTimeMillis());
            subActivity.setRunId(runId);
            String agentName = map.get("agent") != null ? String.valueOf(map.get("agent")) : "worker";
            String task = map.get("task") != null ? String.valueOf(map.get("task")) : "";
            subActivity.setTitle("子智能体 · " + agentName);
            subActivity.setDetail(new SubagentDetail(agentName, task));
            activities.put(subagentId, subActivity);
            emitActivity(subActivity);
        }
    }

    private void handleToolResultTextDelta(ToolResultTextDeltaEvent e) {
        String callId = e.getToolCallId();
        if (callId != null && e.getDelta() != null) {
            toolOutputBuffers.computeIfAbsent(callId, k -> new StringBuilder()).append(e.getDelta());
        }
    }

    private void handleToolResultEnd(ToolResultEndEvent e) {
        String callId = e.getToolCallId();
        String toolName = e.getToolCallName();
        String toolActivityId = "tool:" + callId;
        Activity toolActivity = activities.get(toolActivityId);

        StringBuilder outputSb = toolOutputBuffers.remove(callId);
        String rawOutput = outputSb != null ? outputSb.toString() : "";
        if (rawOutput.isEmpty() && e.getState() != null) {
            rawOutput = e.getState().name();
        }

        long now = System.currentTimeMillis();
        boolean success = e.getState() != null && "SUCCESS".equalsIgnoreCase(e.getState().name());

        if (toolActivity != null) {
            toolActivity.setEndedAt(now);
            toolActivity.setDurationMs(Math.max(0, now - toolActivity.getStartedAt()));
            toolActivity.setStatus(success ? "completed" : "failed");
            toolActivity.setSubtitle(success ? "完成" : "失败");

            StringBuilder argSb = toolArgBuffers.remove(callId);
            Object parsedInput = parseJsonOrRaw(argSb != null ? argSb.toString() : "");

            ToolDetail td = new ToolDetail(toolName, parsedInput);
            if (rawOutput.length() > 15000) {
                td.setOutput(rawOutput.substring(0, 15000) + "\n…(输出过长，已截断展示)");
                td.setTruncated(true);
            } else {
                td.setOutput(rawOutput);
                td.setTruncated(false);
            }
            toolActivity.setDetail(td);
            emitActivity(toolActivity);
        }

        // 文件卡片更新与 Diff 计算
        if (isFileTool(toolName)) {
            String fileActivityId = "file:" + callId;
            Activity fileActivity = activities.get(fileActivityId);
            if (fileActivity != null) {
                fileActivity.setEndedAt(now);
                fileActivity.setDurationMs(Math.max(0, now - fileActivity.getStartedAt()));
                fileActivity.setStatus(success ? "completed" : "failed");

                if (fileActivity.getDetail() instanceof FileDetail fd) {
                    String pre = toolPreContents.remove(callId);
                    if (pre == null) pre = "";
                    if ("write".equals(fd.getOperation()) || "edit".equals(fd.getOperation())) {
                        String post = readDiskContent(fd.getPath());
                        if (post.isEmpty() && toolActivity != null && toolActivity.getDetail() instanceof ToolDetail td) {
                            if (td.getInput() instanceof Map<?, ?> m && m.get("content") != null) {
                                post = String.valueOf(m.get("content"));
                            }
                        }
                        fd.setDiff(calculateDiff(fd.getPath(), pre, post));
                    }
                }
                emitActivity(fileActivity);
            }
        }

        // 子智能体卡片更新
        String subagentId = "subagent:" + callId;
        Activity subActivity = activities.get(subagentId);
        if (subActivity != null) {
            subActivity.setEndedAt(now);
            subActivity.setDurationMs(Math.max(0, now - subActivity.getStartedAt()));
            subActivity.setStatus(success ? "completed" : "failed");
            if (subActivity.getDetail() instanceof SubagentDetail sd) {
                sd.setResultSummary(rawOutput.length() > 1000 ? rawOutput.substring(0, 1000) + "…" : rawOutput);
            }
            emitActivity(subActivity);
        }
    }

    /**
     * 发出人工审批中断卡片与快照。
     */
    public synchronized void emitRequireConfirm(List<ToolUseBlock> pendingCalls) {
        endReasoning();
        endText();

        List<RunSnapshot.InterruptItem> interruptItems = new ArrayList<>();
        for (ToolUseBlock call : pendingCalls) {
            String interruptId = "interrupt-" + UUID.randomUUID();
            Activity approvalActivity = new Activity(
                    "approval:" + interruptId,
                    "approval",
                    "waiting_approval",
                    "审批请求：" + call.getName(),
                    System.currentTimeMillis()
            );
            approvalActivity.setRunId(runId);
            approvalActivity.setSubtitle("该操作涉及敏感指令，需要您的审批确认");
            approvalActivity.setDetail(new ApprovalDetail(call.getName(), call.getInput(), "高影响操作人工审批"));
            activities.put("approval:" + interruptId, approvalActivity);
            emitActivity(approvalActivity);

            interruptItems.add(new RunSnapshot.InterruptItem(
                    interruptId,
                    "tool_approval",
                    call.getName(),
                    call.getInput()
            ));
        }

        RunSnapshot snapshot = new RunSnapshot();
        snapshot.setStatus("waiting_approval");
        snapshot.setRunId(runId);
        snapshot.setThreadId(threadId);
        snapshot.setStartedAt(startedAt);
        snapshot.setProgressNote("等待用户人工确认审批…");
        snapshot.setInterrupts(interruptItems);
        emitRunSnapshot(snapshot);

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
     * 接收 Reflection 中间件产生的自检记录，并同步到活动详情及前端时间线。
     */
    public synchronized void recordReflection(String line) {
        if (line == null || line.isBlank()) return;

        // 1. 同步追加到当前已执行工具的详情 output 中
        for (Activity act : activities.values()) {
            if ("tool".equals(act.getKind()) && act.getDetail() instanceof ToolDetail td) {
                String existing = td.getOutput() != null ? String.valueOf(td.getOutput()) : "";
                if (!existing.contains(line)) {
                    td.setOutput(existing.isEmpty() ? line : existing + "\n\n" + line);
                    emitActivity(act);
                }
            }
        }

        // 2. 作为过程消息推送到前端时间线
        String reflectionMsgId = "msg-reflection-" + UUID.randomUUID();
        emitJson(Map.of(
                "type", AguiEventType.TEXT_MESSAGE_START,
                "messageId", reflectionMsgId,
                "role", "assistant"
        ));
        emitJson(Map.of(
                "type", AguiEventType.TEXT_MESSAGE_CONTENT,
                "messageId", reflectionMsgId,
                "delta", line
        ));
        emitJson(Map.of(
                "type", AguiEventType.TEXT_MESSAGE_END,
                "messageId", reflectionMsgId
        ));
        emitJson(Map.of(
                "type", AguiEventType.CUSTOM,
                "name", AguiEventType.CUSTOM_PROCESS_MESSAGE,
                "value", Map.of("messageId", reflectionMsgId, "runId", runId)
        ));
    }

    /**
     * 正常结束本轮运行。
     */
    public synchronized void emitRunFinished() {
        if (finished) return;
        finished = true;
        endReasoning();
        endText();

        long now = System.currentTimeMillis();
        // 兜底处理：将所有仍在运行中或等待中的工具/活动标记为完成，防止前端死卡在「正在调用」
        for (Activity act : activities.values()) {
            if ("todo".equals(act.getKind()) && act.getDetail() instanceof Activity.TodoDetail td) {
                // 当整轮任务成功结束并输出最后总结时，待办清单内所有任务均已达成，全部标记为已完成
                List<Activity.TodoItem> items = td.getItems();
                if (items != null && !items.isEmpty()) {
                    for (Activity.TodoItem item : items) {
                        item.setStatus("completed");
                    }
                    td.setCompleted(items.size());
                    act.setStatus("completed");
                    act.setSubtitle("已完成 (" + items.size() + "/" + items.size() + ")");
                    if (act.getEndedAt() == 0) {
                        act.setEndedAt(now);
                        act.setDurationMs(Math.max(0, now - act.getStartedAt()));
                    }
                    emitActivity(act);
                }
            } else if ("running".equals(act.getStatus()) || "pending".equals(act.getStatus()) || "waiting_approval".equals(act.getStatus())) {
                act.setStatus("completed");
                act.setSubtitle("完成");
                if (act.getEndedAt() == 0) {
                    act.setEndedAt(now);
                    act.setDurationMs(Math.max(0, now - act.getStartedAt()));
                }
                emitActivity(act);
            }
        }

        RunSnapshot snapshot = new RunSnapshot();
        snapshot.setStatus("completed");
        snapshot.setRunId(runId);
        snapshot.setThreadId(threadId);
        snapshot.setStartedAt(startedAt);
        snapshot.setEndedAt(now);
        snapshot.setDurationMs(snapshot.getEndedAt() - startedAt);
        snapshot.setProgressNote("任务已圆满完成");
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
        endReasoning();
        endText();

        emitJson(Map.of(
                "type", AguiEventType.RUN_ERROR,
                "runId", runId,
                "threadId", threadId,
                "message", errorMessage != null ? errorMessage : "未知运行错误"
        ));
    }

    private void emitSnapshotProgress(String note) {
        RunSnapshot snapshot = new RunSnapshot();
        snapshot.setStatus("running");
        snapshot.setRunId(runId);
        snapshot.setThreadId(threadId);
        snapshot.setProgressNote(note);
        emitRunSnapshot(snapshot);
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

    private boolean isFileTool(String name) {
        if (name == null) return false;
        return name.contains("file") || "ls".equals(name) || "glob".equals(name) || "grep".equals(name);
    }

    private String mapFileOp(String toolName) {
        if (toolName == null) return "read";
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
        if (input instanceof Map<?, ?> m) {
            for (String key : List.of("file_path", "filePath", "path", "dir_path", "directory")) {
                if (m.containsKey(key) && m.get(key) != null) {
                    return String.valueOf(m.get(key));
                }
            }
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
        if (pathStr == null || pathStr.isBlank()) return "";
        try {
            Path p = Paths.get(pathStr);
            if (p.isAbsolute() && Files.exists(p) && Files.isRegularFile(p)) {
                return Files.readString(p);
            }
            if (workspaceRoot != null && !workspaceRoot.isBlank()) {
                Path rootPath = Paths.get(workspaceRoot);
                Path direct = rootPath.resolve(pathStr).normalize();
                if (Files.exists(direct) && Files.isRegularFile(direct)) {
                    return Files.readString(direct);
                }
                // 在 workspaceRoot 及其子目录 (如 workspace/kaiming/demo-notes.txt) 中查找
                if (Files.exists(rootPath) && Files.isDirectory(rootPath)) {
                    String targetFileName = Paths.get(pathStr).getFileName().toString();
                    try (java.util.stream.Stream<Path> stream = Files.walk(rootPath, 4)) {
                        java.util.Optional<Path> found = stream
                                .filter(Files::isRegularFile)
                                .filter(f -> f.getFileName().toString().equals(targetFileName))
                                .findFirst();
                        if (found.isPresent()) {
                            return Files.readString(found.get());
                        }
                    }
                }
            }
            // 兜底尝试 backend/workspace 或当前执行目录下的同名文件
            Path fallback = Paths.get("workspace").resolve(pathStr).normalize();
            if (Files.exists(fallback) && Files.isRegularFile(fallback)) {
                return Files.readString(fallback);
            }
        } catch (Exception ignored) {
        }
        return "";
    }

    private FileDiff calculateDiff(String path, String before, String after) {
        boolean isCreated = (before == null || before.isEmpty());
        FileDiff diff = new FileDiff(path, isCreated ? "created" : "modified", 0, 0);
        List<String> bLines = (before == null || before.isEmpty()) ? List.of() : Arrays.asList(before.split("\r?\n"));
        List<String> aLines = (after == null || after.isEmpty()) ? List.of() : Arrays.asList(after.split("\r?\n"));

        List<DiffLine> lines = new ArrayList<>();
        int additions = 0;
        int deletions = 0;

        int max = Math.max(bLines.size(), aLines.size());
        for (int i = 0; i < max; i++) {
            String b = i < bLines.size() ? bLines.get(i) : null;
            String a = i < aLines.size() ? aLines.get(i) : null;
            if (Objects.equals(b, a)) {
                lines.add(new DiffLine("normal", a != null ? a : "", i + 1, i + 1));
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

        String hunkHeader = "@@ -" + (bLines.isEmpty() ? "0,0" : "1," + bLines.size()) + " +" + (aLines.isEmpty() ? "0,0" : "1," + aLines.size()) + " @@";
        diff.setAdditions(additions);
        diff.setDeletions(deletions);
        diff.setHunks(List.of(new DiffHunk(hunkHeader, lines)));
        diff.setBeforeContent(before);
        diff.setAfterContent(after);

        // 生成统一 unified diff patch 文本供前端 diff 卡片展示
        StringBuilder patchSb = new StringBuilder();
        patchSb.append(hunkHeader).append("\n");
        int maxPatchLines = 400;
        boolean truncated = false;
        int count = 0;
        for (DiffLine dl : lines) {
            if (count >= maxPatchLines) {
                truncated = true;
                break;
            }
            if ("add".equals(dl.getType())) {
                patchSb.append("+").append(dl.getText() != null ? dl.getText() : "").append("\n");
            } else if ("delete".equals(dl.getType())) {
                patchSb.append("-").append(dl.getText() != null ? dl.getText() : "").append("\n");
            } else {
                patchSb.append(" ").append(dl.getText() != null ? dl.getText() : "").append("\n");
            }
            count++;
        }
        diff.setTruncated(truncated);
        diff.setPatch(patchSb.toString().stripTrailing());

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
