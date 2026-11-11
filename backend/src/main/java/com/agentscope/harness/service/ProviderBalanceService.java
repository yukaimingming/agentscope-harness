package com.agentscope.harness.service;

import com.agentscope.harness.model.ProviderModels.ProviderConfig;
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
import java.time.Duration;
import java.util.LinkedHashMap;
import java.util.Map;

/**
 * 厂商余额查询服务（API Key 厂商）。
 *
 * 各家接口（2026-11 联网核实）：
 * - DeepSeek：GET https://api.deepseek.com/user/balance（Bearer），返回
 *   balance_infos[0]：{currency, total_balance, granted_balance, topped_up_balance}
 * - Moonshot（Kimi）：GET {origin}/v1/users/me/balance（Bearer），返回
 *   data：{available_balance, voucher_balance}（人民币）
 * - SiliconFlow（硅基流动）：GET {origin}/v1/user/info（Bearer），返回
 *   data：{totalBalance, chargeBalance, grantedBalance?...}
 *
 * 统一返回结构：{ok, vendor?, currency, balance, granted, toppedUp, used, message?}。
 */
@Service
public class ProviderBalanceService {

    private static final Logger log = LoggerFactory.getLogger(ProviderBalanceService.class);

    private final ObjectMapper objectMapper;
    private final HttpClient httpClient;

    public ProviderBalanceService(ObjectMapper objectMapper) {
        this.objectMapper = objectMapper;
        this.httpClient = HttpClient.newBuilder()
                .connectTimeout(Duration.ofSeconds(15))
                .build();
    }

    public Map<String, Object> queryBalance(ProviderConfig provider) {
        Map<String, Object> res = new LinkedHashMap<>();
        String apiKey = provider.getApiKey() == null ? "" : provider.getApiKey().trim();
        if (apiKey.isEmpty()) {
            res.put("ok", false);
            res.put("message", "未配置密钥，无法查询余额");
            return res;
        }
        String baseUrl = provider.getBaseUrl() == null ? "" : provider.getBaseUrl().trim();
        String host = parseHost(baseUrl);
        if (host == null) {
            res.put("ok", false);
            res.put("message", "无法识别的 Base URL: " + baseUrl);
            return res;
        }
        try {
            if (host.contains("deepseek")) {
                return queryDeepSeek(apiKey, res);
            }
            if (host.contains("moonshot")) {
                return queryMoonshot(origin(baseUrl), apiKey, res);
            }
            if (host.contains("siliconflow")) {
                return querySiliconFlow(origin(baseUrl), apiKey, res);
            }
        } catch (InterruptedException e) {
            Thread.currentThread().interrupt();
            res.put("ok", false);
            res.put("message", "查询被中断");
            return res;
        } catch (Exception e) {
            log.warn("查询余额失败: providerId={}, host={}", provider.getId(), host, e);
            res.put("ok", false);
            res.put("message", "网络连接错误: " + e.getMessage());
            return res;
        }
        res.put("ok", false);
        res.put("message", "该厂商暂不支持余额查询（当前支持 DeepSeek / Moonshot Kimi / SiliconFlow）");
        return res;
    }

    // DeepSeek：GET https://api.deepseek.com/user/balance
    private Map<String, Object> queryDeepSeek(String apiKey, Map<String, Object> res) throws Exception {
        HttpResponse<String> resp = get("https://api.deepseek.com/user/balance", apiKey);
        if (resp.statusCode() != 200) {
            return httpError(res, resp.statusCode());
        }
        JsonNode root = objectMapper.readTree(resp.body());
        JsonNode infos = root.path("balance_infos");
        if (!infos.isArray() || infos.isEmpty()) {
            res.put("ok", false);
            res.put("message", "响应缺少 balance_infos 字段，无法解析余额");
            return res;
        }
        JsonNode info = infos.get(0);
        res.put("ok", true);
        res.put("vendor", "deepseek");
        res.put("currency", textOr(info, "currency", "CNY"));
        res.put("balance", textOrNull(info, "total_balance"));
        res.put("granted", textOrNull(info, "granted_balance"));
        res.put("toppedUp", textOrNull(info, "topped_up_balance"));
        res.put("used", null);
        return res;
    }

    // Moonshot：GET {origin}/v1/users/me/balance（api.moonshot.cn 或 .ai 均可）
    private Map<String, Object> queryMoonshot(String origin, String apiKey, Map<String, Object> res) throws Exception {
        HttpResponse<String> resp = get(origin + "/v1/users/me/balance", apiKey);
        if (resp.statusCode() != 200) {
            return httpError(res, resp.statusCode());
        }
        JsonNode data = objectMapper.readTree(resp.body()).path("data");
        if (!data.isObject()) {
            res.put("ok", false);
            res.put("message", "响应缺少 data 字段，无法解析余额");
            return res;
        }
        res.put("ok", true);
        res.put("vendor", "moonshot");
        res.put("currency", "CNY");
        res.put("balance", textOrNull(data, "available_balance"));
        res.put("granted", textOrNull(data, "voucher_balance"));
        res.put("toppedUp", null);
        res.put("used", null);
        return res;
    }

    // SiliconFlow：GET {origin}/v1/user/info（api.siliconflow.cn / .com）
    private Map<String, Object> querySiliconFlow(String origin, String apiKey, Map<String, Object> res) throws Exception {
        HttpResponse<String> resp = get(origin + "/v1/user/info", apiKey);
        if (resp.statusCode() != 200) {
            return httpError(res, resp.statusCode());
        }
        JsonNode data = objectMapper.readTree(resp.body()).path("data");
        if (!data.isObject()) {
            res.put("ok", false);
            res.put("message", "响应缺少 data 字段，无法解析余额");
            return res;
        }
        // totalBalance 为总额（社区反馈 balance 字段语义不稳定，优先 totalBalance）
        String total = textOrNull(data, "totalBalance");
        if (total == null) total = textOrNull(data, "balance");
        res.put("ok", true);
        res.put("vendor", "siliconflow");
        res.put("currency", "CNY");
        res.put("balance", total);
        res.put("granted", textOrNull(data, "grantedBalance"));
        res.put("toppedUp", textOrNull(data, "chargeBalance"));
        res.put("used", null);
        return res;
    }

    private HttpResponse<String> get(String url, String apiKey) throws IOException, InterruptedException {
        HttpRequest req = HttpRequest.newBuilder(URI.create(url))
                .timeout(Duration.ofSeconds(15))
                .header("Authorization", "Bearer " + apiKey)
                .header("Accept", "application/json")
                .GET()
                .build();
        return httpClient.send(req, HttpResponse.BodyHandlers.ofString());
    }

    private Map<String, Object> httpError(Map<String, Object> res, int status) {
        res.put("ok", false);
        switch (status) {
            case 401 -> res.put("message", "API Key 无效或已过期（HTTP 401），请检查密钥配置");
            case 403 -> res.put("message", "API Key 没有余额查询权限（HTTP 403）");
            case 404 -> res.put("message", "余额接口不存在（HTTP 404），请确认 Base URL 配置");
            case 429 -> res.put("message", "请求过于频繁（HTTP 429），请稍后重试");
            default -> res.put("message", "余额接口返回异常 HTTP " + status);
        }
        return res;
    }

    private static String parseHost(String baseUrl) {
        if (baseUrl == null || baseUrl.isBlank()) return null;
        try {
            URI uri = URI.create(baseUrl);
            String host = uri.getHost();
            return host == null ? null : host.toLowerCase();
        } catch (Exception e) {
            return null;
        }
    }

    private static String origin(String baseUrl) {
        URI uri = URI.create(baseUrl.trim());
        int port = uri.getPort();
        return uri.getScheme() + "://" + uri.getHost() + (port > 0 ? ":" + port : "");
    }

    private static String textOr(JsonNode node, String field, String fallback) {
        return node.hasNonNull(field) && !node.get(field).asText().isBlank()
                ? node.get(field).asText() : fallback;
    }

    private static String textOrNull(JsonNode node, String field) {
        return textOr(node, field, null);
    }
}
