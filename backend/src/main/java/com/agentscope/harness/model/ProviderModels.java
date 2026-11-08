package com.agentscope.harness.model;

import com.fasterxml.jackson.annotation.JsonIgnoreProperties;
import com.fasterxml.jackson.annotation.JsonInclude;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;

/**
 * 大模型提供商配置及接口交互模型。
 */
public final class ProviderModels {

    private ProviderModels() {}

    @JsonIgnoreProperties(ignoreUnknown = true)
    @JsonInclude(JsonInclude.Include.NON_NULL)
    public static class ReasoningCapabilities {
        private List<String> efforts = List.of("low", "medium", "high");
        private Map<String, List<String>> perModel;
        private Boolean unsupported = false;

        public ReasoningCapabilities() {}

        public List<String> getEfforts() {
            return efforts;
        }

        public void setEfforts(List<String> efforts) {
            this.efforts = efforts;
        }

        public Map<String, List<String>> getPerModel() {
            return perModel;
        }

        public void setPerModel(Map<String, List<String>> perModel) {
            this.perModel = perModel;
        }

        public Boolean getUnsupported() {
            return unsupported;
        }

        public void setUnsupported(Boolean unsupported) {
            this.unsupported = unsupported;
        }
    }

    /** 服务端持久化配置（包含明文 apiKey）。 */
    @JsonIgnoreProperties(ignoreUnknown = true)
    @JsonInclude(JsonInclude.Include.NON_NULL)
    public static class ProviderConfig {
        private String id;
        private String type; // stepfun, openai, anthropic, openai-compatible
        private String label;
        private String baseUrl;
        private String apiKey = "";
        private List<String> models = new ArrayList<>();
        private String defaultModel;
        private boolean enabled = true;
        private ReasoningCapabilities reasoning;
        private String createdAt;
        private String updatedAt;

        // ===== 订阅登录（OAuth）扩展字段，持久化跟随 providers.json =====
        /** 接入方式：api-key（默认）| oauth（订阅登录）。 */
        private String authMode = "api-key";
        /** 订阅登录提供方：openai | anthropic。 */
        private String oauthProvider;
        /** OAuth 刷新令牌（明文随 providers.json 落盘，与 apiKey 同级安全约束）。 */
        private String refreshToken;
        /** access token 过期时间（ISO-8601）。 */
        private String tokenExpiresAt;
        /** 订阅账号邮箱。 */
        private String accountEmail;
        /** 订阅套餐名（如 ChatGPT Plus / Claude Pro）。 */
        private String planName;

        public ProviderConfig() {}

        public String getId() {
            return id;
        }

        public void setId(String id) {
            this.id = id;
        }

        public String getType() {
            return type;
        }

        public void setType(String type) {
            this.type = type;
        }

        public String getLabel() {
            return label;
        }

        public void setLabel(String label) {
            this.label = label;
        }

        public String getBaseUrl() {
            return baseUrl;
        }

        public void setBaseUrl(String baseUrl) {
            this.baseUrl = baseUrl;
        }

        public String getApiKey() {
            return apiKey;
        }

        public void setApiKey(String apiKey) {
            this.apiKey = apiKey;
        }

        public List<String> getModels() {
            return models;
        }

        public void setModels(List<String> models) {
            this.models = models;
        }

        public String getDefaultModel() {
            return defaultModel;
        }

        public void setDefaultModel(String defaultModel) {
            this.defaultModel = defaultModel;
        }

        public boolean isEnabled() {
            return enabled;
        }

        public void setEnabled(boolean enabled) {
            this.enabled = enabled;
        }

        public ReasoningCapabilities getReasoning() {
            return reasoning;
        }

        public void setReasoning(ReasoningCapabilities reasoning) {
            this.reasoning = reasoning;
        }

        public String getCreatedAt() {
            return createdAt;
        }

        public void setCreatedAt(String createdAt) {
            this.createdAt = createdAt;
        }

        public String getUpdatedAt() {
            return updatedAt;
        }

        public void setUpdatedAt(String updatedAt) {
            this.updatedAt = updatedAt;
        }

        public String getAuthMode() {
            return authMode;
        }

        public void setAuthMode(String authMode) {
            this.authMode = authMode;
        }

        public String getOauthProvider() {
            return oauthProvider;
        }

        public void setOauthProvider(String oauthProvider) {
            this.oauthProvider = oauthProvider;
        }

        public String getRefreshToken() {
            return refreshToken;
        }

        public void setRefreshToken(String refreshToken) {
            this.refreshToken = refreshToken;
        }

        public String getTokenExpiresAt() {
            return tokenExpiresAt;
        }

        public void setTokenExpiresAt(String tokenExpiresAt) {
            this.tokenExpiresAt = tokenExpiresAt;
        }

        public String getAccountEmail() {
            return accountEmail;
        }

        public void setAccountEmail(String accountEmail) {
            this.accountEmail = accountEmail;
        }

        public String getPlanName() {
            return planName;
        }

        public void setPlanName(String planName) {
            this.planName = planName;
        }
    }

    /** 返回给前端的公共信息（已掩码 apiKey）。 */
    @JsonInclude(JsonInclude.Include.NON_NULL)
    public static class PublicProvider {
        private String id;
        private String type;
        private String label;
        private String baseUrl;
        private boolean hasApiKey;
        private String apiKeyMask = "";
        private List<String> models = new ArrayList<>();
        private String defaultModel;
        private boolean enabled = true;
        private ReasoningCapabilities reasoning;
        private String createdAt;
        private String updatedAt;

        // ===== 订阅登录状态与账号信息（不含明文令牌/刷新令牌） =====
        private String authMode = "api-key";
        private String oauthProvider;
        private boolean hasRefreshToken;
        private String tokenExpiresAt;
        private String accountEmail;
        private String planName;

        public PublicProvider() {}

        public String getId() {
            return id;
        }

        public void setId(String id) {
            this.id = id;
        }

        public String getType() {
            return type;
        }

        public void setType(String type) {
            this.type = type;
        }

        public String getLabel() {
            return label;
        }

        public void setLabel(String label) {
            this.label = label;
        }

        public String getBaseUrl() {
            return baseUrl;
        }

        public void setBaseUrl(String baseUrl) {
            this.baseUrl = baseUrl;
        }

        public boolean isHasApiKey() {
            return hasApiKey;
        }

        public void setHasApiKey(boolean hasApiKey) {
            this.hasApiKey = hasApiKey;
        }

        public String getApiKeyMask() {
            return apiKeyMask;
        }

        public void setApiKeyMask(String apiKeyMask) {
            this.apiKeyMask = apiKeyMask;
        }

        public List<String> getModels() {
            return models;
        }

        public void setModels(List<String> models) {
            this.models = models;
        }

        public String getDefaultModel() {
            return defaultModel;
        }

        public void setDefaultModel(String defaultModel) {
            this.defaultModel = defaultModel;
        }

        public boolean isEnabled() {
            return enabled;
        }

        public void setEnabled(boolean enabled) {
            this.enabled = enabled;
        }

        public ReasoningCapabilities getReasoning() {
            return reasoning;
        }

        public void setReasoning(ReasoningCapabilities reasoning) {
            this.reasoning = reasoning;
        }

        public String getCreatedAt() {
            return createdAt;
        }

        public void setCreatedAt(String createdAt) {
            this.createdAt = createdAt;
        }

        public String getUpdatedAt() {
            return updatedAt;
        }

        public void setUpdatedAt(String updatedAt) {
            this.updatedAt = updatedAt;
        }

        public String getAuthMode() {
            return authMode;
        }

        public void setAuthMode(String authMode) {
            this.authMode = authMode;
        }

        public String getOauthProvider() {
            return oauthProvider;
        }

        public void setOauthProvider(String oauthProvider) {
            this.oauthProvider = oauthProvider;
        }

        public boolean isHasRefreshToken() {
            return hasRefreshToken;
        }

        public void setHasRefreshToken(boolean hasRefreshToken) {
            this.hasRefreshToken = hasRefreshToken;
        }

        public String getTokenExpiresAt() {
            return tokenExpiresAt;
        }

        public void setTokenExpiresAt(String tokenExpiresAt) {
            this.tokenExpiresAt = tokenExpiresAt;
        }

        public String getAccountEmail() {
            return accountEmail;
        }

        public void setAccountEmail(String accountEmail) {
            this.accountEmail = accountEmail;
        }

        public String getPlanName() {
            return planName;
        }

        public void setPlanName(String planName) {
            this.planName = planName;
        }
    }

    @JsonIgnoreProperties(ignoreUnknown = true)
    public static class ProviderInput {
        private String type;
        private String label;
        private String baseUrl;
        private String apiKey;
        private List<String> models;
        private String defaultModel;
        private boolean enabled = true;
        private ReasoningCapabilities reasoning;
        /** 接入方式：api-key | oauth；为空表示沿用原值。 */
        private String authMode;
        /** OAuth 登录会话 ID（state）：保存时消费对应会话里换好的令牌。 */
        private String oauthLoginId;

        public String getOauthLoginId() {
            return oauthLoginId;
        }

        public void setOauthLoginId(String oauthLoginId) {
            this.oauthLoginId = oauthLoginId;
        }

        public String getAuthMode() {
            return authMode;
        }

        public void setAuthMode(String authMode) {
            this.authMode = authMode;
        }

        public String getType() {
            return type;
        }

        public void setType(String type) {
            this.type = type;
        }

        public String getLabel() {
            return label;
        }

        public void setLabel(String label) {
            this.label = label;
        }

        public String getBaseUrl() {
            return baseUrl;
        }

        public void setBaseUrl(String baseUrl) {
            this.baseUrl = baseUrl;
        }

        public String getApiKey() {
            return apiKey;
        }

        public void setApiKey(String apiKey) {
            this.apiKey = apiKey;
        }

        public List<String> getModels() {
            return models;
        }

        public void setModels(List<String> models) {
            this.models = models;
        }

        public String getDefaultModel() {
            return defaultModel;
        }

        public void setDefaultModel(String defaultModel) {
            this.defaultModel = defaultModel;
        }

        public boolean isEnabled() {
            return enabled;
        }

        public void setEnabled(boolean enabled) {
            this.enabled = enabled;
        }

        public ReasoningCapabilities getReasoning() {
            return reasoning;
        }

        public void setReasoning(ReasoningCapabilities reasoning) {
            this.reasoning = reasoning;
        }
    }

    public static String maskApiKey(String key) {
        if (key == null) return "";
        String trimmed = key.trim();
        if (trimmed.isEmpty()) return "";
        if (trimmed.length() <= 8) return "*".repeat(trimmed.length());
        return trimmed.substring(0, 4) + "…" + trimmed.substring(trimmed.length() - 4);
    }

    public static PublicProvider toPublic(ProviderConfig config) {
        PublicProvider p = new PublicProvider();
        p.setId(config.getId());
        p.setType(config.getType());
        p.setLabel(config.getLabel());
        p.setBaseUrl(config.getBaseUrl());
        p.setHasApiKey(config.getApiKey() != null && !config.getApiKey().trim().isEmpty());
        p.setApiKeyMask(maskApiKey(config.getApiKey()));
        p.setModels(config.getModels());
        p.setDefaultModel(config.getDefaultModel());
        p.setEnabled(config.isEnabled());
        p.setReasoning(config.getReasoning());
        p.setCreatedAt(config.getCreatedAt());
        p.setUpdatedAt(config.getUpdatedAt());
        // 订阅登录状态与账号信息（绝不暴露 refreshToken / 明文令牌）
        p.setAuthMode("oauth".equals(config.getAuthMode()) ? "oauth" : "api-key");
        p.setOauthProvider(config.getOauthProvider());
        p.setHasRefreshToken(config.getRefreshToken() != null && !config.getRefreshToken().trim().isEmpty());
        p.setTokenExpiresAt(config.getTokenExpiresAt());
        p.setAccountEmail(config.getAccountEmail());
        p.setPlanName(config.getPlanName());
        return p;
    }
}
