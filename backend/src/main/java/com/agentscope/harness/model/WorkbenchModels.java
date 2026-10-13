package com.agentscope.harness.model;

import com.fasterxml.jackson.annotation.JsonIgnoreProperties;
import java.util.ArrayList;
import java.util.List;

/**
 * 工作台会话索引与状态模型。
 */
public final class WorkbenchModels {

    private WorkbenchModels() {}

    @JsonIgnoreProperties(ignoreUnknown = true)
    public static class SessionSummary {
        private String id;
        private String title;
        private long createdAt;
        private long updatedAt;
        private int messageCount;
        private String workspaceRoot;
        private String folderName;

        public SessionSummary() {}

        public String getId() {
            return id;
        }

        public void setId(String id) {
            this.id = id;
        }

        public String getTitle() {
            return title;
        }

        public void setTitle(String title) {
            this.title = title;
        }

        public long getCreatedAt() {
            return createdAt;
        }

        public void setCreatedAt(long createdAt) {
            this.createdAt = createdAt;
        }

        public long getUpdatedAt() {
            return updatedAt;
        }

        public void setUpdatedAt(long updatedAt) {
            this.updatedAt = updatedAt;
        }

        public int getMessageCount() {
            return messageCount;
        }

        public void setMessageCount(int messageCount) {
            this.messageCount = messageCount;
        }

        public String getWorkspaceRoot() {
            return workspaceRoot;
        }

        public void setWorkspaceRoot(String workspaceRoot) {
            this.workspaceRoot = workspaceRoot;
        }

        public String getFolderName() {
            return folderName;
        }

        public void setFolderName(String folderName) {
            this.folderName = folderName;
        }
    }

    @JsonIgnoreProperties(ignoreUnknown = true)
    public static class WorkbenchIndex {
        private int version = 1;
        private List<String> customWorkspaces = new ArrayList<>();
        private List<SessionSummary> sessions = new ArrayList<>();
        private String activeSessionId = "";
        private String currentWorkspace;

        public WorkbenchIndex() {}

        public int getVersion() {
            return version;
        }

        public void setVersion(int version) {
            this.version = version;
        }

        public List<String> getCustomWorkspaces() {
            return customWorkspaces;
        }

        public void setCustomWorkspaces(List<String> customWorkspaces) {
            this.customWorkspaces = customWorkspaces;
        }

        public List<SessionSummary> getSessions() {
            return sessions;
        }

        public void setSessions(List<SessionSummary> sessions) {
            this.sessions = sessions;
        }

        public String getActiveSessionId() {
            return activeSessionId;
        }

        public void setActiveSessionId(String activeSessionId) {
            this.activeSessionId = activeSessionId;
        }

        public String getCurrentWorkspace() {
            return currentWorkspace;
        }

        public void setCurrentWorkspace(String currentWorkspace) {
            this.currentWorkspace = currentWorkspace;
        }
    }
}
