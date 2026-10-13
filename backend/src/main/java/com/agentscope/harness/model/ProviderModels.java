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
        return p;
    }
}
