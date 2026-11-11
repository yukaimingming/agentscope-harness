package com.agentscope.harness.controller;

import com.agentscope.harness.service.OAuthService;
import com.agentscope.harness.service.ProviderService;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

import java.util.LinkedHashMap;
import java.util.Map;

/**
 * 订阅登录（OAuth）控制器。
 *
 * - POST /api/providers/oauth/start   发起登录（回环授权码：生成 PKCE + 本地回调服务；
 *   设备码：申请设备码并后台轮询），返回授权地址或设备码信息
 * - GET  /api/providers/oauth/status  前端轮询登录结果（含账号邮箱/套餐/令牌过期时间；
 *   设备码流程附带 userCode 与验证页地址）
 * - POST /api/providers/oauth/refresh 用已保存的 refresh_token 换新 access token
 * - POST /api/providers/oauth/logout  清除订阅登录态
 */
@RestController
@RequestMapping("/api/providers/oauth")
@CrossOrigin
public class OAuthController {

    private static final Logger log = LoggerFactory.getLogger(OAuthController.class);

    private final OAuthService oauthService;
    private final ProviderService providerService;

    public OAuthController(OAuthService oauthService, ProviderService providerService) {
        this.oauthService = oauthService;
        this.providerService = providerService;
    }

    @PostMapping("/start")
    public ResponseEntity<Map<String, Object>> start(@RequestBody Map<String, String> body) {
        String type = body == null ? null : body.get("type");
        String providerId = body == null ? null : body.get("providerId");
        if (!OAuthService.SUPPORTED_TYPES.contains(type)) {
            return ResponseEntity.badRequest().body(Map.of(
                    "ok", false,
                    "message", "不支持的订阅登录类型: " + type + "（支持 " + OAuthService.supportedTypesText() + "）"));
        }
        if (providerId != null && !providerId.isBlank() && providerService.get(providerId) == null) {
            return ResponseEntity.badRequest().body(Map.of("ok", false, "message", "目标厂商不存在"));
        }
        try {
            OAuthService.PendingLogin login = oauthService.start(type,
                    providerId != null && !providerId.isBlank() ? providerId : null);
            Map<String, Object> out = new LinkedHashMap<>();
            out.put("ok", true);
            out.put("flow", login.getAuthorizeUrl() != null ? "loopback" : "device");
            if (login.getAuthorizeUrl() != null) {
                out.put("authorizeUrl", login.getAuthorizeUrl());
                out.put("redirectUri", login.getRedirectUri());
            }
            out.put("state", login.getState());
            out.put("loginId", login.getState());
            // 回环流程固定 5 分钟；设备码流程用厂商返回的 expires_in
            long expiresInSeconds = login.getDeviceExpiresAtMs() > 0
                    ? Math.max(30, (login.getDeviceExpiresAtMs() - System.currentTimeMillis()) / 1000)
                    : 300;
            out.put("expiresInSeconds", expiresInSeconds);
            if (login.getUserCode() != null) {
                out.put("userCode", login.getUserCode());
                out.put("verificationUri", login.getVerificationUri());
                out.put("verificationUriComplete", login.getVerificationUriComplete());
                out.put("intervalSeconds", login.getIntervalSeconds());
            }
            return ResponseEntity.ok(out);
        } catch (Exception e) {
            log.error("启动订阅登录失败: type={}", type, e);
            return ResponseEntity.status(500).body(Map.of(
                    "ok", false,
                    "message", "启动订阅登录失败: " + e.getMessage()));
        }
    }

    @GetMapping("/status")
    public ResponseEntity<Map<String, Object>> status(@RequestParam("state") String state) {
        Map<String, Object> snapshot = oauthService.status(state);
        if (snapshot == null) {
            return ResponseEntity.status(404).body(Map.of(
                    "ok", false,
                    "status", "missing",
                    "message", "登录会话不存在或已被清理"));
        }
        Map<String, Object> out = new LinkedHashMap<>();
        out.put("ok", true);
        out.putAll(snapshot);
        return ResponseEntity.ok(out);
    }

    @PostMapping("/refresh")
    public ResponseEntity<Map<String, Object>> refresh(@RequestBody Map<String, String> body) {
        String providerId = body == null ? null : body.get("providerId");
        if (providerId == null || providerId.isBlank()) {
            return ResponseEntity.badRequest().body(Map.of("ok", false, "message", "缺少 providerId"));
        }
        return ResponseEntity.ok(oauthService.refreshForProvider(providerId));
    }

    @PostMapping("/logout")
    public ResponseEntity<Map<String, Object>> logout(@RequestBody Map<String, String> body) {
        String providerId = body == null ? null : body.get("providerId");
        if (providerId == null || providerId.isBlank()) {
            return ResponseEntity.badRequest().body(Map.of("ok", false, "message", "缺少 providerId"));
        }
        return ResponseEntity.ok(oauthService.logout(providerId));
    }
}
