package com.agentscope.harness.model;

import com.fasterxml.jackson.annotation.JsonIgnoreProperties;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;

/**
 * 前端发起智能体执行的输入载荷（POST /agent）。
 */
@JsonIgnoreProperties(ignoreUnknown = true)
public class RunAgentInput {

    private String threadId;
    private String runId;
    private List<AguiMessage> messages = new ArrayList<>();
    private List<Object> tools = new ArrayList<>();
    private List<Object> context = new ArrayList<>();
    private Object state;
    private Map<String, Object> forwardedProps;
    private List<ResumeEntry> resume;

    @JsonIgnoreProperties(ignoreUnknown = true)
    public static class ResumeEntry {
        private String interruptId;
        private String status; // resolved, cancelled
        private Map<String, Object> payload;

        public String getInterruptId() {
            return interruptId;
        }

        public void setInterruptId(String interruptId) {
            this.interruptId = interruptId;
        }

        public String getStatus() {
            return status;
        }

        public void setStatus(String status) {
            this.status = status;
        }

        public Map<String, Object> getPayload() {
            return payload;
        }

        public void setPayload(Map<String, Object> payload) {
            this.payload = payload;
        }
    }

    public RunAgentInput() {}

    public String getThreadId() {
        return threadId;
    }

    public void setThreadId(String threadId) {
        this.threadId = threadId;
    }

    public String getRunId() {
        return runId;
    }

    public void setRunId(String runId) {
        this.runId = runId;
    }

    public List<AguiMessage> getMessages() {
        return messages;
    }

    public void setMessages(List<AguiMessage> messages) {
        this.messages = messages;
    }

    public List<Object> getTools() {
        return tools;
    }

    public void setTools(List<Object> tools) {
        this.tools = tools;
    }

    public List<Object> getContext() {
        return context;
    }

    public void setContext(List<Object> context) {
        this.context = context;
    }

    public Object getState() {
        return state;
    }

    public void setState(Object state) {
        this.state = state;
    }

    public Map<String, Object> getForwardedProps() {
        return forwardedProps;
    }

    public void setForwardedProps(Map<String, Object> forwardedProps) {
        this.forwardedProps = forwardedProps;
    }

    public List<ResumeEntry> getResume() {
        return resume;
    }

    public void setResume(List<ResumeEntry> resume) {
        this.resume = resume;
    }
}
