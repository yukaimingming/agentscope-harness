package com.agentscope.harness.controller;

import com.agentscope.harness.model.ProviderModels;
import com.agentscope.harness.model.ProviderModels.*;
import com.agentscope.harness.service.OAuthService;
import com.agentscope.harness.service.ProviderBalanceService;
import com.agentscope.harness.service.ProviderService;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

import java.util.List;
import java.util.Map;
import java.util.Objects;

/**
 * 大模型提供商管理控制器。
 */
@RestController
@RequestMapping("/api/providers")
@CrossOrigin
public class ProviderController {

    private static final Logger log = LoggerFactory.getLogger(ProviderController.class);

    private final ProviderService providerService;
    private final ProviderBalanceService balanceService;
    private final OAuthService oauthService;

    public ProviderController(ProviderService providerService,
                              ProviderBalanceService balanceService,
                              OAuthService oauthService) {
        this.providerService = providerService;
        this.balanceService = balanceService;
        this.oauthService = oauthService;
    }

    @GetMapping
    public ResponseEntity<Map<String, Object>> listProviders() {
        List<PublicProvider> list = providerService.list().stream()
                .map(ProviderModels::toPublic)
                .toList();
        return ResponseEntity.ok(Map.of("providers", list));
    }

    @PostMapping
    public ResponseEntity<Map<String, Object>> createProvider(@RequestBody ProviderInput input) {
        ProviderConfig created = providerService.create(input);
        applyPendingOAuth(created, input);
        return ResponseEntity.status(201).body(Map.of("provider", ProviderModels.toPublic(created)));
    }

    @PutMapping("/{id}")
    public ResponseEntity<Map<String, Object>> updateProvider(
            @PathVariable String id,
            @RequestBody ProviderInput input) {
        ProviderConfig updated = providerService.update(id, input);
        if (updated == null) {
            return ResponseEntity.status(404).body(Map.of("error", "提供商不存在"));
        }
        applyPendingOAuth(updated, input);
        return ResponseEntity.ok(Map.of("provider", ProviderModels.toPublic(updated)));
    }

    @DeleteMapping("/{id}")
    public ResponseEntity<Map<String, Object>> deleteProvider(@PathVariable String id) {
        boolean removed = providerService.remove(id);
        if (!removed) {
            return ResponseEntity.status(404).body(Map.of("error", "提供商不存在"));
        }
        return ResponseEntity.ok(Map.of("ok", true));
    }

    @PostMapping("/{id}/models")
    public ResponseEntity<Map<String, Object>> fetchModels(@PathVariable String id) {
        ProviderConfig provider = providerService.get(id);
        if (provider == null) {
            return ResponseEntity.status(404).body(Map.of("error", "提供商不存在"));
        }
        return ResponseEntity.ok(providerService.fetchModels(provider, oauthService.prepareForCall(provider)));
    }

    @PostMapping("/{id}/test")
    public ResponseEntity<Map<String, Object>> testModel(
            @PathVariable String id,
            @RequestBody(required = false) Map<String, String> body) {
        ProviderConfig provider = providerService.get(id);
        if (provider == null) {
            return ResponseEntity.status(404).body(Map.of("error", "提供商不存在"));
        }
        String modelId = body != null && body.containsKey("modelId")
                ? body.get("modelId")
                : provider.getDefaultModel();
        return ResponseEntity.ok(providerService.testModel(provider, modelId, oauthService.prepareForCall(provider)));
    }

    /** 查询厂商余额（当前支持 DeepSeek / Moonshot Kimi / SiliconFlow 的 API Key 厂商）。 */
    @GetMapping("/{id}/balance")
    public ResponseEntity<Map<String, Object>> balance(@PathVariable String id) {
        ProviderConfig provider = providerService.get(id);
        if (provider == null) {
            return ResponseEntity.status(404).body(Map.of("ok", false, "error", "提供商不存在"));
        }
        return ResponseEntity.ok(balanceService.queryBalance(provider));
    }

    /**
     * 保存时消费一次性的订阅登录凭据：新建厂商（start 时未指定 providerId）的
     * 登录流程里，令牌暂存在 OAuthService 的会话中，前端保存时携带 oauthLoginId。
     */
    private void applyPendingOAuth(ProviderConfig provider, ProviderInput input) {
        String loginId = input.getOauthLoginId();
        if (loginId == null || loginId.isBlank()) return;
        Map<String, Object> tokens = oauthService.takeTokens(loginId);
        if (tokens == null) {
            log.warn("订阅登录凭据不存在或已失效，忽略 oauthLoginId={}", loginId);
            return;
        }
        providerService.applyOAuthToken(provider.getId(),
                Objects.toString(tokens.get("oauthProvider"), null),
                Objects.toString(tokens.get("accessToken"), null),
                Objects.toString(tokens.get("refreshToken"), null),
                Objects.toString(tokens.get("expiresAt"), null),
                Objects.toString(tokens.get("accountEmail"), null),
                Objects.toString(tokens.get("planName"), null));
    }
}
