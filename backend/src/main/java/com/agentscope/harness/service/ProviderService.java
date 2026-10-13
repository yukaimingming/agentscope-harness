package com.agentscope.harness.service;

import com.agentscope.harness.config.AgentscopeProperties;
import com.agentscope.harness.model.ProviderModels.*;
import com.fasterxml.jackson.core.type.TypeReference;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Service;

import java.io.IOException;
import java.net.URI;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.Paths;
import java.time.Duration;
import java.time.Instant;
import java.util.*;
import java.util.concurrent.ConcurrentHashMap;

/**
 * 大模型提供商存储与探测服务。
 */
@Service
public class ProviderService {

    private static final Logger log = LoggerFactory.getLogger(ProviderService.class);

    private final AgentscopeProperties properties;
    private final ObjectMapper objectMapper;
    private final Map<String, ProviderConfig> providers = new ConcurrentHashMap<>();
    private final HttpClient httpClient;
    private Path storeFile;

    public ProviderService(AgentscopeProperties properties, ObjectMapper objectMapper) {
        this.properties = properties;
        this.objectMapper = objectMapper;
        this.httpClient = HttpClient.newBuilder()
                .connectTimeout(Duration.ofSeconds(15))
                .build();
        initStore();
    }

    private void initStore() {
        try {
            Path dataDir = Paths.get(properties.getDataDir());
            Files.createDirectories(dataDir);
            this.storeFile = dataDir.resolve("providers.json");

            if (Files.exists(storeFile)) {
                String content = Files.readString(storeFile);
                JsonNode root = objectMapper.readTree(content);
                if (root.has("providers") && root.get("providers").isArray()) {
                    List<ProviderConfig> list = objectMapper.convertValue(
                            root.get("providers"),
                            new TypeReference<List<ProviderConfig>>() {}
                    );
                    for (ProviderConfig p : list) {
                        providers.put(p.getId(), p);
                    }
                }
            } else {
                // 初始化默认内置的 Provider
                ProviderConfig defaultProv = new ProviderConfig();
                defaultProv.setId("default-provider");
                defaultProv.setType("openai-compatible");
                defaultProv.setLabel("默认大模型端点 (InternLM/Atria)");
                defaultProv.setBaseUrl(properties.getDefaultBaseUrl());
                defaultProv.setApiKey(properties.getDefaultApiKey());
                defaultProv.setModels(List.of(
                        properties.getDefaultModel(),
                        "Atria-Dawn-Preview",
                        "glm-5.3",
                        "minimax-m3",
                        "qwen3.8-27b",
                        "kimi-k2.6"
                ));
                defaultProv.setDefaultModel(properties.getDefaultModel());
                defaultProv.setEnabled(true);
                defaultProv.setCreatedAt(Instant.now().toString());
                defaultProv.setUpdatedAt(Instant.now().toString());

                ReasoningCapabilities cap = new ReasoningCapabilities();
                cap.setEfforts(List.of("low", "medium", "high"));
                defaultProv.setReasoning(cap);

                providers.put(defaultProv.getId(), defaultProv);
                save();
            }
        } catch (Exception e) {
            log.error("初始化 ProviderService 失败", e);
        }
    }

    public synchronized void save() {
        try {
            Map<String, Object> map = new HashMap<>();
            map.put("version", 1);
            map.put("providers", new ArrayList<>(providers.values()));
            String json = objectMapper.writerWithDefaultPrettyPrinter().writeValueAsString(map);
            Files.writeString(storeFile, json);
        } catch (IOException e) {
            log.error("持久化 providers.json 失败", e);
        }
    }

    public List<ProviderConfig> list() {
        return new ArrayList<>(providers.values());
    }

    public ProviderConfig get(String id) {
        return providers.get(id);
    }

    public ProviderConfig getActive(String activeId) {
        if (activeId != null && providers.containsKey(activeId)) {
            ProviderConfig cfg = providers.get(activeId);
            if (cfg.isEnabled()) return cfg;
        }
        for (ProviderConfig p : providers.values()) {
            if (p.isEnabled() && p.getDefaultModel() != null) return p;
        }
        return providers.values().stream().findFirst().orElse(null);
    }

    public ProviderConfig create(ProviderInput input) {
        ProviderConfig cfg = new ProviderConfig();
        cfg.setId(UUID.randomUUID().toString());
        cfg.setType(input.getType() != null ? input.getType() : "openai-compatible");
        cfg.setLabel(input.getLabel() != null ? input.getLabel() : "自定义提供商");
        cfg.setBaseUrl(input.getBaseUrl() != null ? input.getBaseUrl() : "https://api.openai.com/v1");
        cfg.setApiKey(input.getApiKey() != null ? input.getApiKey() : "");
        cfg.setModels(input.getModels() != null ? input.getModels() : new ArrayList<>());
        cfg.setDefaultModel(input.getDefaultModel());
        cfg.setEnabled(input.isEnabled());
        cfg.setReasoning(input.getReasoning());
        cfg.setCreatedAt(Instant.now().toString());
        cfg.setUpdatedAt(Instant.now().toString());

        providers.put(cfg.getId(), cfg);
        save();
        return cfg;
    }

    public ProviderConfig update(String id, ProviderInput patch) {
        ProviderConfig existing = providers.get(id);
        if (existing == null) return null;

        if (patch.getType() != null) existing.setType(patch.getType());
        if (patch.getLabel() != null) existing.setLabel(patch.getLabel());
        if (patch.getBaseUrl() != null) existing.setBaseUrl(patch.getBaseUrl());
        if (patch.getApiKey() != null && !patch.getApiKey().trim().isEmpty()) {
            existing.setApiKey(patch.getApiKey());
        }
        if (patch.getModels() != null) existing.setModels(patch.getModels());
        if (patch.getDefaultModel() != null) existing.setDefaultModel(patch.getDefaultModel());
        existing.setEnabled(patch.isEnabled());
        if (patch.getReasoning() != null) existing.setReasoning(patch.getReasoning());
        existing.setUpdatedAt(Instant.now().toString());

        save();
        return existing;
    }

    public boolean remove(String id) {
        ProviderConfig removed = providers.remove(id);
        if (removed != null) {
            save();
            return true;
        }
        return false;
    }

    /**
     * 探测远程模型列表。
     */
    public Map<String, Object> fetchModels(ProviderConfig provider) {
        Map<String, Object> res = new HashMap<>();
        try {
            String baseUrl = provider.getBaseUrl().replaceAll("/+$", "");
            String modelsUrl = baseUrl.endsWith("/v1") ? baseUrl + "/models" : baseUrl + "/v1/models";

            HttpRequest req = HttpRequest.newBuilder()
                    .uri(URI.create(modelsUrl))
                    .header("Authorization", "Bearer " + provider.getApiKey())
                    .timeout(Duration.ofSeconds(15))
                    .GET()
                    .build();

            HttpResponse<String> resp = httpClient.send(req, HttpResponse.BodyHandlers.ofString());
            if (resp.statusCode() == 200) {
                JsonNode root = objectMapper.readTree(resp.body());
                List<String> list = new ArrayList<>();
                if (root.has("data") && root.get("data").isArray()) {
                    for (JsonNode item : root.get("data")) {
                        if (item.has("id")) {
                            list.add(item.get("id").asText());
                        }
                    }
                }
                res.put("ok", true);
                res.put("models", list);
                return res;
            } else {
                res.put("ok", false);
                res.put("errorKind", "http");
                res.put("message", "HTTP 状态码: " + resp.statusCode());
                res.put("models", List.of());
                return res;
            }
        } catch (Exception e) {
            res.put("ok", false);
            res.put("errorKind", "network");
            res.put("message", "网络连接错误: " + e.getMessage());
            res.put("models", List.of());
            return res;
        }
    }

    /**
     * 简单测试大模型连通性。
     */
    public Map<String, Object> testModel(ProviderConfig provider, String modelId) {
        Map<String, Object> res = new HashMap<>();
        long startedAt = System.currentTimeMillis();
        try {
            String baseUrl = provider.getBaseUrl().replaceAll("/+$", "");
            String chatUrl = baseUrl.endsWith("/v1") ? baseUrl + "/chat/completions" : baseUrl + "/v1/chat/completions";

            String reqBody = objectMapper.writeValueAsString(Map.of(
                    "model", modelId,
                    "messages", List.of(Map.of("role", "user", "content", "回复一个字：好")),
                    "max_tokens", 10
            ));

            HttpRequest req = HttpRequest.newBuilder()
                    .uri(URI.create(chatUrl))
                    .header("Authorization", "Bearer " + provider.getApiKey())
                    .header("Content-Type", "application/json")
                    .timeout(Duration.ofSeconds(20))
                    .POST(HttpRequest.BodyPublishers.ofString(reqBody))
                    .build();

            HttpResponse<String> resp = httpClient.send(req, HttpResponse.BodyHandlers.ofString());
            long latency = System.currentTimeMillis() - startedAt;
            res.put("latencyMs", latency);
            res.put("modelId", modelId);

            if (resp.statusCode() == 200) {
                JsonNode root = objectMapper.readTree(resp.body());
                String reply = "连接成功";
                if (root.has("choices") && root.get("choices").isArray() && !root.get("choices").isEmpty()) {
                    JsonNode choice = root.get("choices").get(0);
                    if (choice.has("message") && choice.get("message").has("content")) {
                        reply = choice.get("message").get("content").asText();
                    }
                }
                res.put("ok", true);
                res.put("reply", reply);
            } else {
                res.put("ok", false);
                res.put("message", "接口返回异常 HTTP " + resp.statusCode());
            }
        } catch (Exception e) {
            res.put("ok", false);
            res.put("latencyMs", System.currentTimeMillis() - startedAt);
            res.put("message", "连通性测试失败: " + e.getMessage());
        }
        return res;
    }
}
