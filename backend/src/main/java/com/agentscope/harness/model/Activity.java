package com.agentscope.harness.model;

import com.fasterxml.jackson.annotation.JsonInclude;
import java.util.List;

/**
 * 前端时间线活动卡片模型。
 */
@JsonInclude(JsonInclude.Include.NON_NULL)
public class Activity {

    private String id;
    private String kind; // todo, tool, subagent, file, approval, answer, error
    private String status; // pending, running, waiting_approval, completed, failed, cancelled
    private String title;
    private String subtitle;
    private Object detail;
    private String runId;
    private long startedAt;
    private Long endedAt;
    private Long durationMs;
    private String error;

    public Activity() {}

    public Activity(String id, String kind, String status, String title, long startedAt) {
        this.id = id;
        this.kind = kind;
        this.status = status;
        this.title = title;
        this.startedAt = startedAt;
    }

    public String getId() {
        return id;
    }

    public void setId(String id) {
        this.id = id;
    }

    public String getKind() {
        return kind;
    }

    public void setKind(String kind) {
        this.kind = kind;
    }

    public String getStatus() {
        return status;
    }

    public void setStatus(String status) {
        this.status = status;
    }

    public String getTitle() {
        return title;
    }

    public void setTitle(String title) {
        this.title = title;
    }

    public String getSubtitle() {
        return subtitle;
    }

    public void setSubtitle(String subtitle) {
        this.subtitle = subtitle;
    }

    public Object getDetail() {
        return detail;
    }

    public void setDetail(Object detail) {
        this.detail = detail;
    }

    public String getRunId() {
        return runId;
    }

    public void setRunId(String runId) {
        this.runId = runId;
    }

    public long getStartedAt() {
        return startedAt;
    }

    public void setStartedAt(long startedAt) {
        this.startedAt = startedAt;
    }

    public Long getEndedAt() {
        return endedAt;
    }

    public void setEndedAt(Long endedAt) {
        this.endedAt = endedAt;
    }

    public Long getDurationMs() {
        return durationMs;
    }

    public void setDurationMs(Long durationMs) {
        this.durationMs = durationMs;
    }

    public String getError() {
        return error;
    }

    public void setError(String error) {
        this.error = error;
    }

    // --- Detail 辅助结构 ---

    public static class TodoItem {
        private String content;
        private String status; // pending, in_progress, completed

        public TodoItem() {}

        public TodoItem(String content, String status) {
            this.content = content;
            this.status = status;
        }

        public String getContent() {
            return content;
        }

        public void setContent(String content) {
            this.content = content;
        }

        public String getStatus() {
            return status;
        }

        public void setStatus(String status) {
            this.status = status;
        }
    }

    public static class TodoDetail {
        private List<TodoItem> items;
        private int completed;
        private int total;

        public TodoDetail() {}

        public TodoDetail(List<TodoItem> items, int completed, int total) {
            this.items = items;
            this.completed = completed;
            this.total = total;
        }

        public List<TodoItem> getItems() {
            return items;
        }

        public void setItems(List<TodoItem> items) {
            this.items = items;
        }

        public int getCompleted() {
            return completed;
        }

        public void setCompleted(int completed) {
            this.completed = completed;
        }

        public int getTotal() {
            return total;
        }

        public void setTotal(int total) {
            this.total = total;
        }
    }

    public static class ToolDetail {
        private String toolName;
        private Object input;
        private Object output;
        private boolean truncated;

        public ToolDetail() {}

        public ToolDetail(String toolName, Object input) {
            this.toolName = toolName;
            this.input = input;
        }

        public String getToolName() {
            return toolName;
        }

        public void setToolName(String toolName) {
            this.toolName = toolName;
        }

        public Object getInput() {
            return input;
        }

        public void setInput(Object input) {
            this.input = input;
        }

        public Object getOutput() {
            return output;
        }

        public void setOutput(Object output) {
            this.output = output;
        }

        public boolean isTruncated() {
            return truncated;
        }

        public void setTruncated(boolean truncated) {
            this.truncated = truncated;
        }
    }

    public static class SubagentDetail {
        private String name;
        private String goal;
        private String resultSummary;

        public SubagentDetail() {}

        public SubagentDetail(String name, String goal) {
            this.name = name;
            this.goal = goal;
        }

        public String getName() {
            return name;
        }

        public void setName(String name) {
            this.name = name;
        }

        public String getGoal() {
            return goal;
        }

        public void setGoal(String goal) {
            this.goal = goal;
        }

        public String getResultSummary() {
            return resultSummary;
        }

        public void setResultSummary(String resultSummary) {
            this.resultSummary = resultSummary;
        }
    }

    public static class FileDetail {
        private String path;
        private String operation; // read, write, edit, delete, list, grep, glob
        private FileDiff diff;

        public FileDetail() {}

        public FileDetail(String path, String operation) {
            this.path = path;
            this.operation = operation;
        }

        public String getPath() {
            return path;
        }

        public void setPath(String path) {
            this.path = path;
        }

        public String getOperation() {
            return operation;
        }

        public void setOperation(String operation) {
            this.operation = operation;
        }

        public FileDiff getDiff() {
            return diff;
        }

        public void setDiff(FileDiff diff) {
            this.diff = diff;
        }
    }

    public static class ApprovalDetail {
        private String toolName;
        private Object args;
        private String impact;
        private List<String> allowedDecisions = List.of("approve", "reject");
        private String decision;

        public ApprovalDetail() {}

        public ApprovalDetail(String toolName, Object args, String impact) {
            this.toolName = toolName;
            this.args = args;
            this.impact = impact;
        }

        public String getToolName() {
            return toolName;
        }

        public void setToolName(String toolName) {
            this.toolName = toolName;
        }

        public Object getArgs() {
            return args;
        }

        public void setArgs(Object args) {
            this.args = args;
        }

        public String getImpact() {
            return impact;
        }

        public void setImpact(String impact) {
            this.impact = impact;
        }

        public List<String> getAllowedDecisions() {
            return allowedDecisions;
        }

        public void setAllowedDecisions(List<String> allowedDecisions) {
            this.allowedDecisions = allowedDecisions;
        }

        public String getDecision() {
            return decision;
        }

        public void setDecision(String decision) {
            this.decision = decision;
        }
    }
}
