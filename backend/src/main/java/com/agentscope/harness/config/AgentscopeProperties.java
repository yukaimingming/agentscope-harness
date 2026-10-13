package com.agentscope.harness.config;

import org.springframework.boot.context.properties.ConfigurationProperties;

/**
 * AgentScope Harness 配置属性。
 */
@ConfigurationProperties(prefix = "agentscope")
public class AgentscopeProperties {

    /** 工作区目录路径。 */
    private String workspace = ".agentscope/workspace";

    /** 服务端持久化数据目录。 */
    private String dataDir = ".data";

    /** 默认用户标识。 */
    private String userId = "kaiming";

    /** 默认大模型 API Key。 */
    private String defaultApiKey = "sk-76d18a6f27e0aa104ebc480ae52e9e5c41141351d97cdaf414ddfe729715612e";

    /** 默认大模型基础地址。 */
    private String defaultBaseUrl = "https://discovery-api.intern-ai.org.cn/v1";

    /** 默认模型名称。 */
    private String defaultModel = "Agents-A1";

    /** 轮次超时秒数（0 表示不限制）。 */
    private long turnTimeoutSeconds = 0;

    /** MCP 客户端连接回收秒数。 */
    private int mcpKeepaliveSeconds = 10;

    /** DeepWiki MCP 服务器地址（为空则不启用）。 */
    private String mcpDeepwikiUrl = "https://mcp.deepwiki.com/mcp";

    /** 是否默认展开思考流。 */
    private boolean thinkingExpanded = false;

    public String getWorkspace() {
        return workspace;
    }

    public void setWorkspace(String workspace) {
        this.workspace = workspace;
    }

    public String getDataDir() {
        return dataDir;
    }

    public void setDataDir(String dataDir) {
        this.dataDir = dataDir;
    }

    public String getUserId() {
        return userId;
    }

    public void setUserId(String userId) {
        this.userId = userId;
    }

    public String getDefaultApiKey() {
        return defaultApiKey;
    }

    public void setDefaultApiKey(String defaultApiKey) {
        this.defaultApiKey = defaultApiKey;
    }

    public String getDefaultBaseUrl() {
        return defaultBaseUrl;
    }

    public void setDefaultBaseUrl(String defaultBaseUrl) {
        this.defaultBaseUrl = defaultBaseUrl;
    }

    public String getDefaultModel() {
        return defaultModel;
    }

    public void setDefaultModel(String defaultModel) {
        this.defaultModel = defaultModel;
    }

    public long getTurnTimeoutSeconds() {
        return turnTimeoutSeconds;
    }

    public void setTurnTimeoutSeconds(long turnTimeoutSeconds) {
        this.turnTimeoutSeconds = turnTimeoutSeconds;
    }

    public int getMcpKeepaliveSeconds() {
        return mcpKeepaliveSeconds;
    }

    public void setMcpKeepaliveSeconds(int mcpKeepaliveSeconds) {
        this.mcpKeepaliveSeconds = mcpKeepaliveSeconds;
    }

    public String getMcpDeepwikiUrl() {
        return mcpDeepwikiUrl;
    }

    public void setMcpDeepwikiUrl(String mcpDeepwikiUrl) {
        this.mcpDeepwikiUrl = mcpDeepwikiUrl;
    }

    public boolean isThinkingExpanded() {
        return thinkingExpanded;
    }

    public void setThinkingExpanded(boolean thinkingExpanded) {
        this.thinkingExpanded = thinkingExpanded;
    }
}
