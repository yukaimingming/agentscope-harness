package com.agentscope.harness.model;

import com.fasterxml.jackson.annotation.JsonInclude;
import java.util.ArrayList;
import java.util.List;

/**
 * 运行状态快照模型（deepagent:run-snapshot）。
 */
@JsonInclude(JsonInclude.Include.NON_NULL)
public class RunSnapshot {

    private String status; // idle, connecting, running, waiting_approval, completed, cancelled, error
    private String runId;
    private String threadId;
    private Long startedAt;
    private Long endedAt;
    private Long durationMs;
    private String progressNote;
    private List<InterruptItem> interrupts = new ArrayList<>();
    private TokenUsage usage;

    public static class InterruptItem {
        private String id;
        private String reason;
        private String message;
        private String toolName;
        private Object args;
        private List<String> allowedDecisions = List.of("approve", "reject");

        public InterruptItem() {}

        public InterruptItem(String id, String reason, String toolName, Object args) {
            this.id = id;
            this.reason = reason;
            this.toolName = toolName;
            this.args = args;
        }

        public String getId() {
            return id;
        }

        public void setId(String id) {
            this.id = id;
        }

        public String getReason() {
            return reason;
        }

        public void setReason(String reason) {
            this.reason = reason;
        }

        public String getMessage() {
            return message;
        }

        public void setMessage(String message) {
            this.message = message;
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

        public List<String> getAllowedDecisions() {
            return allowedDecisions;
        }

        public void setAllowedDecisions(List<String> allowedDecisions) {
            this.allowedDecisions = allowedDecisions;
        }
    }

    public static class TokenUsage {
        private int inputTokens;
        private int outputTokens;
        private int totalTokens;
        private int cachedInputTokens;
        private int lastInputTokens;
        private Integer contextWindow = 262144;

        public TokenUsage() {}

        public int getInputTokens() {
            return inputTokens;
        }

        public void setInputTokens(int inputTokens) {
            this.inputTokens = inputTokens;
        }

        public int getOutputTokens() {
            return outputTokens;
        }

        public void setOutputTokens(int outputTokens) {
            this.outputTokens = outputTokens;
        }

        public int getTotalTokens() {
            return totalTokens;
        }

        public void setTotalTokens(int totalTokens) {
            this.totalTokens = totalTokens;
        }

        public int getCachedInputTokens() {
            return cachedInputTokens;
        }

        public void setCachedInputTokens(int cachedInputTokens) {
            this.cachedInputTokens = cachedInputTokens;
        }

        public int getLastInputTokens() {
            return lastInputTokens;
        }

        public void setLastInputTokens(int lastInputTokens) {
            this.lastInputTokens = lastInputTokens;
        }

        public Integer getContextWindow() {
            return contextWindow;
        }

        public void setContextWindow(Integer contextWindow) {
            this.contextWindow = contextWindow;
        }
    }

    public RunSnapshot() {}

    public String getStatus() {
        return status;
    }

    public void setStatus(String status) {
        this.status = status;
    }

    public String getRunId() {
        return runId;
    }

    public void setRunId(String runId) {
        this.runId = runId;
    }

    public String getThreadId() {
        return threadId;
    }

    public void setThreadId(String threadId) {
        this.threadId = threadId;
    }

    public Long getStartedAt() {
        return startedAt;
    }

    public void setStartedAt(Long startedAt) {
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

    public String getProgressNote() {
        return progressNote;
    }

    public void setProgressNote(String progressNote) {
        this.progressNote = progressNote;
    }

    public List<InterruptItem> getInterrupts() {
        return interrupts;
    }

    public void setInterrupts(List<InterruptItem> interrupts) {
        this.interrupts = interrupts;
    }

    public TokenUsage getUsage() {
        return usage;
    }

    public void setUsage(TokenUsage usage) {
        this.usage = usage;
    }
}
