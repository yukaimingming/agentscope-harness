package com.agentscope.harness.service;

import com.agentscope.harness.config.AgentscopeProperties;
import com.agentscope.harness.model.ProviderModels;
import com.agentscope.harness.service.OAuthProviders.Descriptor;
import com.agentscope.harness.service.OAuthProviders.Flow;
import com.fasterxml.jackson.core.type.TypeReference;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Service;

import com.sun.net.httpserver.HttpExchange;
import com.sun.net.httpserver.HttpServer;

import java.io.IOException;
import java.io.OutputStream;
import java.net.InetSocketAddress;
import java.net.ServerSocket;
import java.net.URI;
import java.net.URLDecoder;
import java.net.URLEncoder;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.security.SecureRandom;
import java.time.Duration;
import java.time.Instant;
import java.util.Base64;
import java.util.HashMap;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.ScheduledExecutorService;
import java.util.concurrent.ScheduledFuture;
import java.util.concurrent.TimeUnit;

/**
 * 订阅登录（OAuth）服务：厂商参数全部来自 {@link OAuthProviders} 注册表（数据驱动），
 * 支持两种流程：
 *
 * <ul>
 *   <li>回环授权码（OpenAI / Anthropic / Grok / Google）：生成 PKCE（或 client_secret）
 *       并启动本地回环 HTTP 服务器 → 浏览器完成授权回调 → 用 code 换 token。</li>
 *   <li>RFC 8628 设备码（GitHub Copilot / Qwen / Kimi）：申请设备码返回给前端展示，
 *       后端按 interval 轮询令牌端点直到用户在授权页确认。</li>
 * </ul>
 *
 * 令牌交换成功后的账号信息解析、刷新、下游调用准备（{@link #prepareForCall}）同样
 * 按注册表分派。若 start 时带了 providerId 则登录成功立即落到该厂商（access token
 * 存入现有 apiKey 字段）；新建厂商流程由保存接口携带 oauthLoginId 后取 {@link #takeTokens}。
 */
@Service
public class OAuthService {

    private static final Logger log = LoggerFactory.getLogger(OAuthService.class);

    /** 支持的订阅登录厂商 id 列表（与前端卡片目录一致）。 */
    public static final List<String> SUPPORTED_TYPES = OAuthProviders.IDS;

    /** 回环流程浏览器授权超时。 */
    private static final long LOGIN_TIMEOUT_MINUTES = 5;
    /** 设备码流程轮询上限（以厂商返回的 expires_in 为准，最长 15 分钟）。 */
    private static final long DEVICE_MAX_POLL_MINUTES = 15;
    /** 登录记录在内存中保留的最长时间（之后清理，status 返回 missing）。 */
    private static final long RECORD_TTL_MINUTES = 30;
    /** 下游调用前 access token 剩余寿命低于该值则先刷新（毫秒）。 */
    private static final long REFRESH_AHEAD_MS = 300_000;

    /** 优先尝试的本地回环端口（Codex CLI 注册端口段），全部占用则随机。 */
    private static final int[] PREFERRED_PORTS = {1455, 1456, 1457, 1458, 1459, 1460};

    private static final SecureRandom SECURE_RANDOM = new SecureRandom();

    private final ObjectMapper objectMapper;
    private final ProviderService providerService;
    private final HttpClient httpClient;
    private final Map<String, PendingLogin> logins = new ConcurrentHashMap<>();
    private final ExecutorService callbackExecutor = Executors.newFixedThreadPool(2, r -> {
        Thread t = new Thread(r, "oauth-callback");
        t.setDaemon(true);
        return t;
    });
    private final ScheduledExecutorService cleaner = Executors.newSingleThreadScheduledExecutor(r -> {
        Thread t = new Thread(r, "oauth-cleaner");
        t.setDaemon(true);
        return t;
    });
    /** 设备码流程的令牌轮询线程池（每次登录占用一个 slot 直到完成/超时）。 */
    private final ScheduledExecutorService devicePoller = Executors.newScheduledThreadPool(2, r -> {
        Thread t = new Thread(r, "oauth-device-poll");
        t.setDaemon(true);
        return t;
    });

    public OAuthService(ObjectMapper objectMapper, ProviderService providerService,
                        AgentscopeProperties properties) {
        this.objectMapper = objectMapper;
        this.providerService = providerService;
        this.httpClient = HttpClient.newBuilder()
                .connectTimeout(Duration.ofSeconds(15))
                .followRedirects(HttpClient.Redirect.NORMAL)
                .build();
        // Google 凭据从配置注入（源码不留明文，默认值见 application.yml）
        OAuthProviders.setGoogleCredentials(
                properties.getOauthGoogleClientId(), properties.getOauthGoogleClientSecret());
    }

    /** 一次订阅登录会话（浏览器授权 → 换令牌 → 落库前的暂存）。 */
    public static class PendingLogin {
        private final String state;
        private final String type;
        private final String providerId;
        /** 回环流程：PKCE verifier；设备码流程：device_code。 */
        private final String verifier;
        private final String redirectUri;
        private final String authorizeUrl;
        private final int port;
        private final long createdAt = System.currentTimeMillis();
        /** 设备码流程字段（回环流程为 null）。 */
        private final String userCode;
        private final String verificationUri;
        private final String verificationUriComplete;
        private final long deviceExpiresAtMs;
        private final int intervalSeconds;

        private volatile String status = "pending"; // pending | success | error | expired
        private volatile String accessToken;
        private volatile String refreshToken;
        private volatile String expiresAtIso;
        private volatile String accountEmail;
        private volatile String planName;
        private volatile String error;
        /** 成功后已直接落到哪个厂商（start 时指定 providerId 的流程）。 */
        private volatile String appliedProviderId;
        private volatile HttpServer server;
        private volatile ScheduledFuture<?> pollFuture;

        PendingLogin(String state, String type, String providerId, String verifier,
                     String redirectUri, String authorizeUrl, int port) {
            this(state, type, providerId, verifier, redirectUri, authorizeUrl, port,
                    null, null, null, 0, 0);
        }

        PendingLogin(String state, String type, String providerId, String verifier,
                     String redirectUri, String authorizeUrl, int port,
                     String userCode, String verificationUri, String verificationUriComplete,
                     long deviceExpiresAtMs, int intervalSeconds) {
            this.state = state;
            this.type = type;
            this.providerId = providerId;
            this.verifier = verifier;
            this.redirectUri = redirectUri;
            this.authorizeUrl = authorizeUrl;
            this.port = port;
            this.userCode = userCode;
            this.verificationUri = verificationUri;
            this.verificationUriComplete = verificationUriComplete;
            this.deviceExpiresAtMs = deviceExpiresAtMs;
            this.intervalSeconds = intervalSeconds;
        }

        public String getState() { return state; }
        public String getType() { return type; }
        public String getProviderId() { return providerId; }
        public String getRedirectUri() { return redirectUri; }
        public String getAuthorizeUrl() { return authorizeUrl; }
        public String getStatus() { return status; }
        public String getUserCode() { return userCode; }
        public String getVerificationUri() { return verificationUri; }
        public String getVerificationUriComplete() { return verificationUriComplete; }
        public long getDeviceExpiresAtMs() { return deviceExpiresAtMs; }
        public int getIntervalSeconds() { return intervalSeconds; }
    }

    /** 下游调用准备结果：解析后的密钥 + 必须附加的头 + 模型列表路径 + 屏蔽原因。 */
    public record CallPrep(String apiKey, Map<String, String> extraHeaders,
                           String modelsPathOverride, String blockedMessage) {}

    /**
     * 发起一次订阅登录。
     *
     * @param type       注册表中的厂商 id（openai / anthropic / grok / google / github-copilot / qwen / kimi）
     * @param providerId 可选；传入且存在时，登录成功后令牌直接落到该厂商
     */
    public PendingLogin start(String type, String providerId) throws IOException, InterruptedException {
        Descriptor d = OAuthProviders.get(type);
        if (d == null) throw new IOException("未知的订阅登录类型: " + type);
        String state = randomBase64Url(32);
        PendingLogin login;
        if (d.isLoopback()) {
            login = startLoopback(d, state, providerId);
        } else {
            login = startDevice(d, state, providerId);
        }
        logins.put(state, login);
        // 记录保留一段时间供前端查询状态，之后清理
        cleaner.schedule(() -> logins.remove(state), RECORD_TTL_MINUTES, TimeUnit.MINUTES);
        log.info("订阅登录会话已启动: type={}, flow={}, port={}, providerId={}, state={}",
                type, d.flow, login.port, providerId, abbreviate(state));
        return login;
    }

    /** 回环授权码流程：PKCE/secret + 本地回调服务器。 */
    private PendingLogin startLoopback(Descriptor d, String state, String providerId) throws IOException {
        String verifier = d.flow == Flow.LOOPBACK_PKCE ? randomBase64Url(32) : null;
        String challenge;
        if (verifier != null) {
            try {
                challenge = s256Challenge(verifier);
            } catch (Exception e) {
                throw new IOException("生成 PKCE challenge 失败: " + e.getMessage(), e);
            }
        } else {
            challenge = null;
        }
        int port = allocatePort();
        String redirectUri = "http://" + d.callbackHost + ":" + port + d.callbackPath;
        String authorizeUrl = buildAuthorizeUrl(d, redirectUri, challenge, state);

        PendingLogin login = new PendingLogin(state, d.id, providerId, verifier, redirectUri, authorizeUrl, port);

        HttpServer server = HttpServer.create(new InetSocketAddress("127.0.0.1", port), 0);
        server.setExecutor(callbackExecutor);
        server.createContext("/", exchange -> handleCallback(exchange, login));
        server.start();
        login.server = server;

        // 超时自动清理：标记过期 + 停掉回调服务器
        cleaner.schedule(() -> {
            if ("pending".equals(login.status)) {
                login.status = "expired";
                login.error = "登录超时（" + LOGIN_TIMEOUT_MINUTES + " 分钟未完成授权），请重新发起登录";
            }
            stopServer(login);
        }, LOGIN_TIMEOUT_MINUTES, TimeUnit.MINUTES);
        return login;
    }

    /** RFC 8628 设备码流程：申请设备码 → 展示给用户 → 后台轮询令牌端点。 */
    private PendingLogin startDevice(Descriptor d, String state, String providerId)
            throws IOException, InterruptedException {
        Map<String, Object> device = requestDeviceCode(d);
        String deviceCode = str(device.get("device_code"));
        if (deviceCode == null || deviceCode.isBlank()) {
            throw new IOException("设备码响应缺少 device_code");
        }
        String userCode = str(device.get("user_code"));
        String verificationUri = str(device.get("verification_uri"));
        String verificationUriComplete = str(device.get("verification_uri_complete"));
        Number expiresIn = (Number) device.get("expires_in");
        Number interval = (Number) device.get("interval");
        int intervalSeconds = interval != null && interval.intValue() > 0 ? interval.intValue() : 5;
        long expiresAtMs = System.currentTimeMillis()
                + (expiresIn != null ? expiresIn.longValue() * 1000L : DEVICE_MAX_POLL_MINUTES * 60_000L);

        PendingLogin login = new PendingLogin(state, d.id, providerId, deviceCode, null, null, 0,
                userCode, verificationUri, verificationUriComplete, expiresAtMs, intervalSeconds);

        // 轮询循环：按 interval 自调度，直到拿到令牌 / 过期 / 出错
        ScheduledFuture<?>[] holder = new ScheduledFuture<?>[1];
        holder[0] = devicePoller.scheduleWithFixedDelay(() -> {
            if (!"pending".equals(login.status)) {
                if (holder[0] != null) holder[0].cancel(false);
                return;
            }
            if (System.currentTimeMillis() >= login.deviceExpiresAtMs) {
                login.status = "expired";
                login.error = "设备码已过期，请重新发起登录";
                if (holder[0] != null) holder[0].cancel(false);
                return;
            }
            try {
                Map<String, Object> token = pollDeviceToken(d, deviceCode);
                if (token == null) return; // authorization_pending / slow_down，继续等
                completeLogin(login, token);
                if (holder[0] != null) holder[0].cancel(false);
            } catch (Exception e) {
                login.status = "error";
                login.error = "设备码登录失败: " + e.getMessage();
                if (holder[0] != null) holder[0].cancel(false);
                log.warn("订阅登录设备码轮询失败: type={}", d.id, e);
            }
        }, intervalSeconds, intervalSeconds, TimeUnit.SECONDS);
        login.pollFuture = holder[0];

        // 兜底过期标记（轮询任务自身也会判断 deadline）
        long timeoutSeconds = Math.min(expiresIn != null ? expiresIn.longValue() : DEVICE_MAX_POLL_MINUTES * 60L,
                DEVICE_MAX_POLL_MINUTES * 60L) + 30;
        cleaner.schedule(() -> {
            if ("pending".equals(login.status)) {
                login.status = "expired";
                login.error = "设备码已过期，请重新发起登录";
            }
            if (holder[0] != null) holder[0].cancel(false);
        }, timeoutSeconds, TimeUnit.SECONDS);
        return login;
    }

    /** 登录状态快照（供前端轮询）。返回 null 表示会话不存在/已被清理。 */
    public Map<String, Object> status(String state) {
        PendingLogin login = state == null ? null : logins.get(state);
        if (login == null) return null;
        Map<String, Object> out = new LinkedHashMap<>();
        out.put("status", login.status);
        out.put("type", login.type);
        Descriptor d = OAuthProviders.get(login.type);
        out.put("flow", d != null ? (d.isLoopback() ? "loopback" : "device") : null);
        out.put("loginId", login.state);
        out.put("providerId", login.appliedProviderId);
        if (login.accountEmail != null) out.put("accountEmail", login.accountEmail);
        if (login.planName != null) out.put("planName", login.planName);
        if (login.expiresAtIso != null) out.put("tokenExpiresAt", login.expiresAtIso);
        if (login.userCode != null) {
            out.put("userCode", login.userCode);
            out.put("verificationUri", login.verificationUri);
            out.put("verificationUriComplete", login.verificationUriComplete);
            out.put("expiresInSeconds", Math.max(0, (login.deviceExpiresAtMs - System.currentTimeMillis()) / 1000));
            out.put("intervalSeconds", login.intervalSeconds);
        }
        if (login.error != null) out.put("message", login.error);
        return out;
    }

    /**
     * 取走一次登录换到的令牌（保存新厂商时消费）。取走后即清除，
     * 防止重复消费；失败/未完成登录返回 null。
     */
    public Map<String, Object> takeTokens(String loginId) {
        PendingLogin login = loginId == null ? null : logins.get(loginId);
        if (login == null || !"success".equals(login.status) || login.accessToken == null) return null;
        Map<String, Object> out = new HashMap<>();
        out.put("oauthProvider", login.type);
        out.put("accessToken", login.accessToken);
        out.put("refreshToken", login.refreshToken);
        out.put("expiresAt", login.expiresAtIso);
        out.put("accountEmail", login.accountEmail);
        out.put("planName", login.planName);
        return out;
    }

    /**
     * 下游调用准备：按厂商解析「此刻应该用的密钥」与必须附加的头。
     * - 短时令牌（Qwen / Kimi）或派生令牌（Copilot）：过期前自动刷新并落库；
     * - 协议特殊的厂商（Google / Anthropic 原生协议）：返回 blockedMessage，调用方应直接拒绝；
     * - 其余：原样返回 apiKey。
     */
    public CallPrep prepareForCall(ProviderModels.ProviderConfig cfg) {
        if (cfg == null || !"oauth".equals(cfg.getAuthMode()) || cfg.getOauthProvider() == null) {
            return new CallPrep(cfg != null ? cfg.getApiKey() : "", Map.of(), null, null);
        }
        Descriptor d = OAuthProviders.get(cfg.getOauthProvider());
        if (d == null) return new CallPrep(cfg.getApiKey(), Map.of(), null, null);
        if (d.openaiBaseUrl == null) {
            return new CallPrep(cfg.getApiKey(), d.extraHeaders, d.modelsPathOverride,
                    "该厂商为「" + d.title + "」订阅登录，令牌仅适用于其专有协议（" + d.note + "）。");
        }
        String key = cfg.getApiKey();
        if ((d.dynamicBearer || d.shortLivedToken) && cfg.getId() != null) {
            key = ensureFreshAccessToken(cfg, d);
        }
        return new CallPrep(key, d.extraHeaders, d.modelsPathOverride, null);
    }

    /** 短时/派生令牌的到期自动刷新：返回最新可用密钥（刷新失败时退回旧密钥）。 */
    private String ensureFreshAccessToken(ProviderModels.ProviderConfig cfg, Descriptor d) {
        String expiresAt = cfg.getTokenExpiresAt();
        boolean stale = true;
        if (expiresAt != null && !expiresAt.isBlank()) {
            try {
                stale = Instant.parse(expiresAt).toEpochMilli() - System.currentTimeMillis() < REFRESH_AHEAD_MS;
            } catch (Exception ignored) {
                // 解析失败视为过期
            }
        }
        if (!stale) return cfg.getApiKey();
        log.info("订阅令牌即将过期，自动刷新: providerId={}, type={}", cfg.getId(), d.id);
        Map<String, Object> result = refreshForProvider(cfg.getId());
        if (Boolean.TRUE.equals(result.get("ok"))) {
            ProviderModels.ProviderConfig updated = providerService.get(cfg.getId());
            if (updated != null && updated.getApiKey() != null && !updated.getApiKey().isBlank()) {
                return updated.getApiKey();
            }
        } else {
            log.warn("订阅令牌自动刷新失败，沿用旧令牌尝试调用: {}", result.get("message"));
        }
        return cfg.getApiKey();
    }

    /** 用已保存的 refresh_token 换新 access token 并落库。 */
    public Map<String, Object> refreshForProvider(String providerId) {
        ProviderModels.ProviderConfig cfg = providerService.get(providerId);
        if (cfg == null) return Map.of("ok", false, "message", "提供商不存在");
        if (!"oauth".equals(cfg.getAuthMode()))
            return Map.of("ok", false, "message", "该厂商未使用订阅登录，无需刷新令牌");
        Descriptor d = OAuthProviders.get(cfg.getOauthProvider());
        if (d == null)
            return Map.of("ok", false, "message", "未知的订阅登录类型: " + cfg.getOauthProvider());
        String refreshToken = cfg.getRefreshToken();
        if (refreshToken == null || refreshToken.isBlank())
            return Map.of("ok", false, "message", "没有可用的刷新令牌，请重新打开浏览器登录");
        try {
            String accessToken;
            String newRefresh = refreshToken;
            long fallbackExpiresIn = 3600;
            if ("github-copilot".equals(d.id)) {
                // Copilot：GitHub 令牌长效，用它重新换取约 30 分钟有效的 Copilot Bearer
                Map<String, Object> derived = deriveCopilotBearer(refreshToken);
                accessToken = str(derived.get("token"));
                if (accessToken == null || accessToken.isBlank())
                    throw new IOException("Copilot 令牌响应缺少 token");
                Number expiresAtSec = (Number) derived.get("expires_at");
                Number refreshIn = (Number) derived.get("refresh_in");
                long ttl = refreshIn != null && refreshIn.longValue() > 0 ? refreshIn.longValue()
                        : expiresAtSec != null ? Math.max(60, expiresAtSec.longValue() - Instant.now().getEpochSecond())
                        : 1500;
                fallbackExpiresIn = ttl;
            } else {
                Map<String, Object> token = refreshRequest(d, refreshToken);
                accessToken = str(token.get("access_token"));
                if (accessToken == null || accessToken.isBlank())
                    throw new IOException("令牌响应缺少 access_token");
                String maybeRefresh = str(token.get("refresh_token"));
                if (maybeRefresh != null && !maybeRefresh.isBlank()) newRefresh = maybeRefresh;
                Number expiresIn = (Number) token.get("expires_in");
                if (expiresIn != null) fallbackExpiresIn = expiresIn.longValue();
            }
            String expiresAt = Instant.now().plusSeconds(fallbackExpiresIn).toString();
            // 刷新响应不含账号信息，沿用已有账号字段
            providerService.applyOAuthToken(providerId, d.id, accessToken, newRefresh,
                    expiresAt, cfg.getAccountEmail(), cfg.getPlanName());
            return Map.of("ok", true, "provider", ProviderModels.toPublic(providerService.get(providerId)));
        } catch (Exception e) {
            log.warn("刷新订阅令牌失败: providerId={}, type={}", providerId, d.id, e);
            return Map.of("ok", false, "message", "刷新令牌失败: " + e.getMessage());
        }
    }

    /** 退出订阅登录：清除令牌与账号信息，回退 API Key 模式。非订阅登录厂商直接拒绝，避免误清密钥。 */
    public Map<String, Object> logout(String providerId) {
        ProviderModels.ProviderConfig cfg = providerService.get(providerId);
        if (cfg == null) return Map.of("ok", false, "message", "提供商不存在");
        if (!"oauth".equals(cfg.getAuthMode()))
            return Map.of("ok", false, "message", "该厂商未使用订阅登录，无需退出");
        providerService.clearOAuth(providerId);
        return Map.of("ok", true, "provider", ProviderModels.toPublic(providerService.get(providerId)));
    }

    // ==================================================================
    // 回环回调处理与令牌交换
    // ==================================================================

    private void handleCallback(HttpExchange exchange, PendingLogin login) {
        try {
            if (!"GET".equalsIgnoreCase(exchange.getRequestMethod())) {
                respond(exchange, 405, htmlPage(false, "方法不支持", "请使用浏览器正常访问"));
                return;
            }
            if (!"pending".equals(login.status)) {
                respond(exchange, 200, htmlPage(false, "会话已失效",
                        login.error != null ? login.error : "该登录会话已结束，请返回应用重新发起登录"));
                return;
            }
            Descriptor d = OAuthProviders.get(login.type);
            Map<String, String> params = parseQuery(exchange.getRequestURI().getRawQuery());

            String err = params.get("error");
            if (err != null && !err.isBlank()) {
                String desc = params.getOrDefault("error_description", "");
                String message = "授权方返回错误: " + err + (desc.isBlank() ? "" : "（" + desc + "）");
                login.status = "error";
                login.error = message;
                stopServerLater(login);
                log.warn("订阅登录被授权方拒绝: type={}, error={}", login.type, err);
                respond(exchange, 200, htmlPage(false, "登录失败", message));
                return;
            }

            String code = params.get("code");
            if (code == null || code.isBlank()) {
                String message = "回调缺少授权码（code 参数为空）";
                login.status = "error";
                login.error = message;
                stopServerLater(login);
                respond(exchange, 200, htmlPage(false, "登录失败", message));
                return;
            }
            String stateParam = params.get("state");
            // Anthropic 回调会把 code 与 state 以 # 连接后放进 code 参数（code#state）
            if (code.contains("#")) {
                int idx = code.indexOf('#');
                String statePart = code.substring(idx + 1);
                if (stateParam == null || stateParam.isBlank()) stateParam = statePart;
                code = code.substring(0, idx);
            }
            if (stateParam != null && !stateParam.isBlank() && !stateParam.equals(login.state)) {
                String message = "state 校验失败（可能的 CSRF），已终止登录";
                login.status = "error";
                login.error = message;
                stopServerLater(login);
                log.warn("订阅登录 state 校验失败: type={}", login.type);
                respond(exchange, 200, htmlPage(false, "登录失败", message));
                return;
            }

            Map<String, Object> token = exchangeLoopbackCode(d, code, login);
            completeLogin(login, token);
            respond(exchange, 200, htmlPage(true, "登录成功",
                    "账号：" + (login.accountEmail != null ? login.accountEmail : "未知")
                            + (login.planName != null ? " · " + login.planName : "")));
        } catch (Exception e) {
            String message = "授权码换取令牌失败: " + e.getMessage();
            login.status = "error";
            login.error = message;
            stopServerLater(login);
            log.warn("订阅登录令牌交换失败: type={}", login.type, e);
            try {
                respond(exchange, 200, htmlPage(false, "登录失败", message));
            } catch (IOException ignored) {
                // 连接已断开，无需处理
            }
        } finally {
            exchange.close();
        }
    }

    /** 令牌拿到后的公共收尾：解析账号信息 → 必要时落到厂商 → 标记成功。 */
    private void completeLogin(PendingLogin login, Map<String, Object> token) {
        fillAccountInfo(login, token);
        if (login.providerId != null && !login.providerId.isBlank()
                && providerService.get(login.providerId) != null) {
            providerService.applyOAuthToken(login.providerId, login.type, login.accessToken,
                    login.refreshToken, login.expiresAtIso, login.accountEmail, login.planName);
            login.appliedProviderId = login.providerId;
            log.info("订阅登录成功并已落到厂商: type={}, providerId={}, account={}",
                    login.type, login.providerId, login.accountEmail);
        } else {
            log.info("订阅登录成功（待保存时落库）: type={}, account={}", login.type, login.accountEmail);
        }
    }

    /** 回环流程：用授权码换令牌（按注册表分派 form / json、PKCE / client_secret）。 */
    private Map<String, Object> exchangeLoopbackCode(Descriptor d, String code, PendingLogin login)
            throws IOException, InterruptedException {
        if (d.jsonExchange) {
            Map<String, Object> body = new LinkedHashMap<>();
            body.put("grant_type", "authorization_code");
            body.put("code", code);
            body.put("client_id", d.clientId);
            body.put("redirect_uri", login.redirectUri);
            if ("anthropic".equals(d.id)) body.put("state", login.state);
            if (login.verifier != null) body.put("code_verifier", login.verifier);
            if (d.clientSecret != null) body.put("client_secret", d.clientSecret);
            HttpRequest req = HttpRequest.newBuilder(URI.create(d.tokenUrl))
                    .timeout(Duration.ofSeconds(20))
                    .header("Content-Type", "application/json")
                    .header("Accept", "application/json")
                    .POST(HttpRequest.BodyPublishers.ofString(objectMapper.writeValueAsString(body), StandardCharsets.UTF_8))
                    .build();
            return executeTokenRequest(req);
        }
        StringBuilder form = new StringBuilder();
        form.append("grant_type=authorization_code")
                .append("&code=").append(urlEncode(code))
                .append("&client_id=").append(urlEncode(d.clientId))
                .append("&redirect_uri=").append(urlEncode(login.redirectUri));
        if (login.verifier != null) form.append("&code_verifier=").append(urlEncode(login.verifier));
        if (d.clientSecret != null) form.append("&client_secret=").append(urlEncode(d.clientSecret));
        HttpRequest req = HttpRequest.newBuilder(URI.create(d.tokenUrl))
                .timeout(Duration.ofSeconds(20))
                .header("Content-Type", "application/x-www-form-urlencoded")
                .header("Accept", "application/json")
                .POST(HttpRequest.BodyPublishers.ofString(form.toString(), StandardCharsets.UTF_8))
                .build();
        return executeTokenRequest(req);
    }

    /** 设备码申请（厂商端点）。 */
    private Map<String, Object> requestDeviceCode(Descriptor d) throws IOException, InterruptedException {
        HttpRequest.Builder builder = HttpRequest.newBuilder(URI.create(d.deviceCodeUrl))
                .timeout(Duration.ofSeconds(20))
                .header("Accept", "application/json");
        if (d.deviceRequestJson) {
            Map<String, Object> body = new LinkedHashMap<>();
            body.put("client_id", d.clientId);
            if (d.scope != null) body.put("scope", d.scope);
            builder.header("Content-Type", "application/json")
                    .POST(HttpRequest.BodyPublishers.ofString(objectMapper.writeValueAsString(body), StandardCharsets.UTF_8));
        } else {
            StringBuilder form = new StringBuilder("client_id=").append(urlEncode(d.clientId));
            if (d.scope != null) form.append("&scope=").append(urlEncode(d.scope));
            builder.header("Content-Type", "application/x-www-form-urlencoded")
                    .POST(HttpRequest.BodyPublishers.ofString(form.toString(), StandardCharsets.UTF_8));
        }
        HttpResponse<String> resp = httpClient.send(builder.build(), HttpResponse.BodyHandlers.ofString());
        if (resp.statusCode() != 200) {
            throw new IOException("申请设备码失败 HTTP " + resp.statusCode() + " " + abbreviate(resp.body()));
        }
        JsonNode root = objectMapper.readTree(resp.body());
        if (root.hasNonNull("error")) {
            throw new IOException("申请设备码被拒绝: " + root.path("error").asText()
                    + (root.hasNonNull("error_description") ? "（" + root.get("error_description").asText() + "）" : ""));
        }
        return objectMapper.convertValue(root, new TypeReference<Map<String, Object>>() {});
    }

    /**
     * 设备码轮询一次。返回令牌响应；authorization_pending / slow_down 返回 null 继续等；
     * 其他错误抛 IOException。
     */
    private Map<String, Object> pollDeviceToken(Descriptor d, String deviceCode)
            throws IOException, InterruptedException {
        HttpRequest.Builder builder = HttpRequest.newBuilder(URI.create(d.tokenUrl))
                .timeout(Duration.ofSeconds(20))
                .header("Accept", "application/json");
        if (d.jsonExchange) {
            Map<String, Object> body = new LinkedHashMap<>();
            body.put("client_id", d.clientId);
            body.put("device_code", deviceCode);
            body.put("grant_type", "urn:ietf:params:oauth:grant-type:device_code");
            builder.header("Content-Type", "application/json")
                    .POST(HttpRequest.BodyPublishers.ofString(objectMapper.writeValueAsString(body), StandardCharsets.UTF_8));
        } else {
            String form = "grant_type=urn:ietf:params:oauth:grant-type:device_code"
                    + "&client_id=" + urlEncode(d.clientId)
                    + "&device_code=" + urlEncode(deviceCode);
            builder.header("Content-Type", "application/x-www-form-urlencoded")
                    .POST(HttpRequest.BodyPublishers.ofString(form, StandardCharsets.UTF_8));
        }
        HttpResponse<String> resp = httpClient.send(builder.build(), HttpResponse.BodyHandlers.ofString());
        JsonNode root = objectMapper.readTree(resp.body());
        if (root.hasNonNull("access_token")) {
            return objectMapper.convertValue(root, new TypeReference<Map<String, Object>>() {});
        }
        String error = root.path("error").asText(null);
        if (error == null && resp.statusCode() == 200) {
            throw new IOException("令牌响应缺少 access_token");
        }
        if ("authorization_pending".equals(error) || "slow_down".equals(error)) {
            return null;
        }
        throw new IOException(root.path("error_description").asText(
                error != null ? error : "HTTP " + resp.statusCode()));
    }

    /** 刷新请求（按注册表分派 form / json）。 */
    private Map<String, Object> refreshRequest(Descriptor d, String refreshToken)
            throws IOException, InterruptedException {
        if (d.jsonExchange) {
            Map<String, Object> body = new LinkedHashMap<>();
            body.put("grant_type", "refresh_token");
            body.put("refresh_token", refreshToken);
            body.put("client_id", d.clientId);
            HttpRequest req = HttpRequest.newBuilder(URI.create(d.tokenUrl))
                    .timeout(Duration.ofSeconds(20))
                    .header("Content-Type", "application/json")
                    .header("Accept", "application/json")
                    .POST(HttpRequest.BodyPublishers.ofString(objectMapper.writeValueAsString(body), StandardCharsets.UTF_8))
                    .build();
            return executeTokenRequest(req);
        }
        StringBuilder form = new StringBuilder("grant_type=refresh_token")
                .append("&refresh_token=").append(urlEncode(refreshToken))
                .append("&client_id=").append(urlEncode(d.clientId));
        if ("openai".equals(d.id)) form.append("&scope=").append(urlEncode(d.scope));
        HttpRequest req = HttpRequest.newBuilder(URI.create(d.tokenUrl))
                .timeout(Duration.ofSeconds(20))
                .header("Content-Type", "application/x-www-form-urlencoded")
                .header("Accept", "application/json")
                .POST(HttpRequest.BodyPublishers.ofString(form.toString(), StandardCharsets.UTF_8))
                .build();
        return executeTokenRequest(req);
    }

    private Map<String, Object> executeTokenRequest(HttpRequest req)
            throws IOException, InterruptedException {
        HttpResponse<String> resp = httpClient.send(req, HttpResponse.BodyHandlers.ofString());
        if (resp.statusCode() != 200) {
            throw new IOException("HTTP " + resp.statusCode() + " " + abbreviate(resp.body()));
        }
        JsonNode root = objectMapper.readTree(resp.body());
        if (root.has("error")) {
            throw new IOException(root.path("error").asText()
                    + (root.has("error_description") ? "（" + root.get("error_description").asText() + "）" : ""));
        }
        return objectMapper.convertValue(root, new TypeReference<Map<String, Object>>() {});
    }

    // ==================================================================
    // 账号信息解析（按厂商分派）
    // ==================================================================

    /** 从令牌响应里解析账号信息（邮箱/套餐）与过期时间，写入登录会话。 */
    private void fillAccountInfo(PendingLogin login, Map<String, Object> token) {
        Descriptor d = OAuthProviders.get(login.type);
        login.refreshToken = str(token.get("refresh_token"));
        Number expiresIn = (Number) token.get("expires_in");

        switch (login.type) {
            case "anthropic" -> {
                // Claude 令牌响应自带 account 与 organization
                login.accessToken = str(token.get("access_token"));
                Object account = token.get("account");
                if (account instanceof Map<?, ?> accountMap && accountMap.get("email_address") != null) {
                    login.accountEmail = String.valueOf(accountMap.get("email_address"));
                }
                Object org = token.get("organization");
                String orgName = org instanceof Map<?, ?> orgMap && orgMap.get("name") != null
                        ? String.valueOf(orgMap.get("name")) : null;
                login.planName = orgName != null && !orgName.isBlank() ? orgName : "Claude 订阅";
            }
            case "github-copilot" -> {
                // GitHub 令牌长效，存入 refreshToken；用它在调用时换取短时 Copilot Bearer
                String githubToken = str(token.get("access_token"));
                login.refreshToken = githubToken;
                Map<String, Object> derived = deriveCopilotBearer(githubToken);
                login.accessToken = str(derived.get("token"));
                if (login.accessToken == null || login.accessToken.isBlank()) {
                    throw new IllegalStateException("换取 Copilot Bearer 失败（copilot_internal/v2/token 无 token 字段）");
                }
                Number expiresAtSec = (Number) derived.get("expires_at");
                Number refreshIn = (Number) derived.get("refresh_in");
                long ttl = refreshIn != null && refreshIn.longValue() > 0 ? refreshIn.longValue()
                        : expiresAtSec != null ? Math.max(60, expiresAtSec.longValue() - Instant.now().getEpochSecond())
                        : 1500;
                login.expiresAtIso = Instant.now().plusSeconds(ttl).toString();
                fillCopilotAccount(login, githubToken);
                if (login.planName == null) login.planName = "GitHub Copilot";
                login.status = "success";
                return; // expiresAtIso 已单独处理
            }
            case "grok" -> {
                login.accessToken = str(token.get("access_token"));
                String email = idTokenEmail(token);
                if (email == null) email = fetchJsonWithBearer("https://auth.x.ai/oauth2/userinfo", login.accessToken)
                        .map(n -> firstNonNullText(n, "email", "name")).orElse(null);
                login.accountEmail = email;
                login.planName = "Grok 订阅（SuperGrok / X Premium+）";
            }
            case "google" -> {
                login.accessToken = str(token.get("access_token"));
                String email = fetchJsonWithBearer("https://www.googleapis.com/oauth2/v3/userinfo", login.accessToken)
                        .map(n -> firstNonNullText(n, "email", "name")).orElse(null);
                login.accountEmail = email;
                login.planName = googlePlanName(login.accessToken);
            }
            case "qwen" -> {
                login.accessToken = str(token.get("access_token"));
                var info = fetchJsonWithBearer("https://auth.qwen.ai/api/oauth/userinfo", login.accessToken);
                login.accountEmail = info.map(n -> firstNonNullText(n, "email", "name")).orElse(null);
                String memberType = info.map(n -> n.path("member_type").asText(null)).orElse(null);
                login.planName = qwenPlanName(memberType);
            }
            case "kimi" -> {
                login.accessToken = str(token.get("access_token"));
                login.planName = "Kimi Code 会员";
            }
            default -> {
                // openai：解 id_token JWT 拿 email 与 chatgpt_plan_type
                login.accessToken = str(token.get("access_token"));
                Object idToken = token.get("id_token");
                if (idToken != null) {
                    try {
                        String[] parts = String.valueOf(idToken).split("\\.");
                        if (parts.length >= 2) {
                            byte[] payload = Base64.getUrlDecoder().decode(padBase64Url(parts[1]));
                            JsonNode claims = objectMapper.readTree(payload);
                            if (claims.hasNonNull("email")) login.accountEmail = claims.get("email").asText();
                            JsonNode auth = claims.path("https://api.openai.com/auth");
                            if (auth.isObject()) {
                                login.planName = chatgptPlanName(auth.path("chatgpt_plan_type").asText(null));
                            }
                        }
                    } catch (Exception e) {
                        log.warn("解析 id_token 失败，套餐信息不可用", e);
                    }
                }
                if (login.planName == null) login.planName = "ChatGPT 订阅";
            }
        }
        if (login.expiresAtIso == null) {
            login.expiresAtIso = Instant.now()
                    .plusSeconds(expiresIn != null ? expiresIn.longValue() : 3600)
                    .toString();
        }
        login.status = "success";
    }

    /** Copilot：用 GitHub 令牌换短时 Copilot Bearer（api.githubcopilot.com 的调用凭证）。 */
    private Map<String, Object> deriveCopilotBearer(String githubToken) {
        try {
            HttpRequest req = HttpRequest.newBuilder(URI.create("https://api.github.com/copilot_internal/v2/token"))
                    .timeout(Duration.ofSeconds(15))
                    .header("Authorization", "token " + githubToken)
                    .header("Accept", "application/json")
                    .header("editor-version", "vscode/1.99.0")
                    .header("editor-plugin-version", "copilot-chat/0.26.7")
                    .header("user-agent", "GitHubCopilotChat/0.26.7")
                    .header("x-github-api-version", "2025-04-01")
                    .GET()
                    .build();
            HttpResponse<String> resp = httpClient.send(req, HttpResponse.BodyHandlers.ofString());
            if (resp.statusCode() != 200) {
                throw new IOException("HTTP " + resp.statusCode() + " " + abbreviate(resp.body()));
            }
            return objectMapper.readValue(resp.body(), new TypeReference<Map<String, Object>>() {});
        } catch (Exception e) {
            throw new IllegalStateException("换取 Copilot Bearer 失败: " + e.getMessage(), e);
        }
    }

    /** Copilot 账号信息：GitHub 用户 + 订阅档位。失败不阻塞登录。 */
    private void fillCopilotAccount(PendingLogin login, String githubToken) {
        try {
            var user = fetchJsonWithBearer2("https://api.github.com/user", "token " + githubToken,
                    Map.of("x-github-api-version", "2025-04-01"));
            if (user.isPresent()) {
                JsonNode n = user.get();
                String email = n.path("email").asText(null);
                String loginName = n.path("login").asText(null);
                login.accountEmail = email != null && !email.isBlank() ? email : loginName;
            }
            var plan = fetchJsonWithBearer2("https://api.github.com/copilot_internal/user", "token " + githubToken,
                    Map.of("x-github-api-version", "2025-04-01"));
            if (plan.isPresent()) {
                login.planName = copilotPlanName(plan.get().path("copilot_plan").asText(null));
            }
        } catch (Exception e) {
            log.warn("获取 Copilot 账号信息失败（不影响登录）: {}", e.getMessage());
        }
    }

    private static String copilotPlanName(String plan) {
        if (plan == null) return "GitHub Copilot";
        return switch (plan) {
            case "free" -> "Copilot Free";
            case "pro" -> "Copilot Pro";
            case "pro_plus", "pro+" -> "Copilot Pro+";
            case "business" -> "Copilot Business";
            case "enterprise" -> "Copilot Enterprise";
            default -> "GitHub Copilot (" + plan + ")";
        };
    }

    private static String qwenPlanName(String memberType) {
        if (memberType == null || memberType.isBlank()) return "Qwen 订阅";
        return switch (memberType) {
            case "plus" -> "Qwen Plus 订阅";
            case "pro" -> "Qwen Pro 订阅";
            case "free" -> "Qwen 免费账号";
            default -> "Qwen 订阅 (" + memberType + ")";
        };
    }

    /** Google：Code Assist 档位（loadCodeAssist）；失败回退「Google 账号」。 */
    private String googlePlanName(String accessToken) {
        try {
            Map<String, Object> body = new LinkedHashMap<>();
            body.put("metadata", Map.of(
                    "ideType", "IDE_UNSPECIFIED",
                    "platform", "PLATFORM_UNSPECIFIED",
                    "pluginType", "GEMINI"));
            HttpRequest req = HttpRequest.newBuilder(URI.create("https://cloudcode-pa.googleapis.com/v1internal:loadCodeAssist"))
                    .timeout(Duration.ofSeconds(15))
                    .header("Authorization", "Bearer " + accessToken)
                    .header("Content-Type", "application/json")
                    .header("Accept", "application/json")
                    .POST(HttpRequest.BodyPublishers.ofString(objectMapper.writeValueAsString(body), StandardCharsets.UTF_8))
                    .build();
            HttpResponse<String> resp = httpClient.send(req, HttpResponse.BodyHandlers.ofString());
            if (resp.statusCode() != 200) {
                log.warn("loadCodeAssist 查询套餐失败: HTTP {}", resp.statusCode());
                return "Google 账号";
            }
            JsonNode root = objectMapper.readTree(resp.body());
            String tier = root.path("currentTier").path("id").asText(
                    root.path("currentTier").path("tierId").asText(null));
            if (tier == null) return "Google 账号";
            return switch (tier) {
                case "free-tier" -> "Gemini Code Assist 免费档";
                case "legacy-tier" -> "Gemini Code Assist (Legacy)";
                case "standard-tier" -> "Gemini Code Assist Standard";
                default -> "Gemini Code Assist (" + tier + ")";
            };
        } catch (Exception e) {
            log.warn("查询 Code Assist 套餐失败（不影响登录）: {}", e.getMessage());
            return "Google 账号";
        }
    }

    /** 用 Bearer 令牌 GET 一个 JSON 端点（失败返回 empty，不抛异常）。 */
    private java.util.Optional<JsonNode> fetchJsonWithBearer(String url, String bearerToken) {
        return fetchJsonWithBearer2(url, "Bearer " + bearerToken, Map.of());
    }

    private java.util.Optional<JsonNode> fetchJsonWithBearer2(String url, String authorization,
                                                              Map<String, String> extraHeaders) {
        try {
            HttpRequest.Builder builder = HttpRequest.newBuilder(URI.create(url))
                    .timeout(Duration.ofSeconds(15))
                    .header("Authorization", authorization)
                    .header("Accept", "application/json");
            extraHeaders.forEach(builder::header);
            HttpResponse<String> resp = httpClient.send(builder.GET().build(), HttpResponse.BodyHandlers.ofString());
            if (resp.statusCode() != 200) return java.util.Optional.empty();
            return java.util.Optional.of(objectMapper.readTree(resp.body()));
        } catch (Exception e) {
            log.warn("GET {} 失败: {}", url, e.getMessage());
            return java.util.Optional.empty();
        }
    }

    private static String firstNonNullText(JsonNode node, String... fields) {
        for (String f : fields) {
            String v = node.path(f).asText(null);
            if (v != null && !v.isBlank()) return v;
        }
        return null;
    }

    /** 解析 id_token JWT 的 payload（不验签，仅展示用）：取 email。 */
    private String idTokenEmail(Map<String, Object> token) {
        Object idToken = token.get("id_token");
        if (idToken == null) return null;
        try {
            String[] parts = String.valueOf(idToken).split("\\.");
            if (parts.length >= 2) {
                byte[] payload = Base64.getUrlDecoder().decode(padBase64Url(parts[1]));
                JsonNode claims = objectMapper.readTree(payload);
                return claims.hasNonNull("email") ? claims.get("email").asText() : null;
            }
        } catch (Exception e) {
            log.warn("解析 id_token 失败: {}", e.getMessage());
        }
        return null;
    }

    private static String chatgptPlanName(String planType) {
        if (planType == null) return "ChatGPT 订阅";
        return switch (planType) {
            case "free" -> "ChatGPT Free";
            case "plus" -> "ChatGPT Plus";
            case "pro" -> "ChatGPT Pro";
            case "team" -> "ChatGPT Team";
            case "enterprise" -> "ChatGPT Enterprise";
            case "edu" -> "ChatGPT Edu";
            default -> "ChatGPT 订阅 (" + planType + ")";
        };
    }

    private void stopServerLater(PendingLogin login) {
        // 回调响应写完后延迟关闭，保证浏览器能收到页面
        cleaner.schedule(() -> stopServer(login), 1, TimeUnit.SECONDS);
    }

    private void stopServer(PendingLogin login) {
        HttpServer server = login.server;
        if (server != null) {
            login.server = null;
            server.stop(0);
        }
    }

    // ==================================================================
    // URL / PKCE / 回环服务器辅助
    // ==================================================================

    private String buildAuthorizeUrl(Descriptor d, String redirectUri, String challenge, String state) {
        StringBuilder url = new StringBuilder();
        url.append(d.authorizeUrl)
                .append("?response_type=code")
                .append("&client_id=").append(urlEncode(d.clientId))
                .append("&redirect_uri=").append(urlEncode(redirectUri));
        if (d.scope != null) url.append("&scope=").append(urlEncode(d.scope));
        if (challenge != null) {
            url.append("&code_challenge=").append(urlEncode(challenge))
                    .append("&code_challenge_method=S256");
        }
        url.append("&state=").append(urlEncode(state));
        if (d.extraAuthorizeParams != null && !d.extraAuthorizeParams.isBlank()) {
            url.append("&").append(d.extraAuthorizeParams);
        }
        // Grok 与官方 Grok Build 一致，授权请求带随机 nonce
        if ("grok".equals(d.id)) {
            url.append("&nonce=").append(urlEncode(java.util.UUID.randomUUID().toString()));
        }
        return url.toString();
    }

    private int allocatePort() throws IOException {
        for (int p : PREFERRED_PORTS) {
            try (ServerSocket ss = new ServerSocket()) {
                ss.setReuseAddress(true);
                ss.bind(new InetSocketAddress("127.0.0.1", p));
                return p;
            } catch (IOException ignored) {
                // 端口被占用（例如 Codex CLI 正在运行），尝试下一个
            }
        }
        try (ServerSocket ss = new ServerSocket(0)) {
            return ss.getLocalPort();
        }
    }

    private static String randomBase64Url(int numBytes) {
        byte[] buf = new byte[numBytes];
        SECURE_RANDOM.nextBytes(buf);
        return Base64.getUrlEncoder().withoutPadding().encodeToString(buf);
    }

    private static String s256Challenge(String verifier) throws Exception {
        MessageDigest md = MessageDigest.getInstance("SHA-256");
        byte[] digest = md.digest(verifier.getBytes(StandardCharsets.US_ASCII));
        return Base64.getUrlEncoder().withoutPadding().encodeToString(digest);
    }

    private static String padBase64Url(String segment) {
        StringBuilder sb = new StringBuilder(segment);
        while (sb.length() % 4 != 0) sb.append('=');
        return sb.toString();
    }

    private static String urlEncode(String value) {
        return URLEncoder.encode(value, StandardCharsets.UTF_8);
    }

    private static Map<String, String> parseQuery(String rawQuery) {
        Map<String, String> out = new HashMap<>();
        if (rawQuery == null || rawQuery.isBlank()) return out;
        for (String pair : rawQuery.split("&")) {
            if (pair.isEmpty()) continue;
            int eq = pair.indexOf('=');
            if (eq < 0) {
                out.putIfAbsent(URLDecoder.decode(pair, StandardCharsets.UTF_8), "");
            } else {
                out.put(URLDecoder.decode(pair.substring(0, eq), StandardCharsets.UTF_8),
                        URLDecoder.decode(pair.substring(eq + 1), StandardCharsets.UTF_8));
            }
        }
        return out;
    }

    private static String str(Object value) {
        return value instanceof String s ? s : null;
    }

    private static String abbreviate(String s) {
        if (s == null) return "";
        return s.length() <= 10 ? s : s.substring(0, 10) + "…";
    }

    private static String escapeHtml(String text) {
        if (text == null) return "";
        return text.replace("&", "&amp;").replace("<", "&lt;").replace(">", "&gt;")
                .replace("\"", "&quot;");
    }

    /** 供控制器展示支持的类型列表。 */
    public static String supportedTypesText() {
        return String.join(" / ", SUPPORTED_TYPES);
    }

    /** 兼容旧调用：Set 视图。 */
    public static Set<String> supportedTypeSet() {
        return Set.copyOf(SUPPORTED_TYPES);
    }

    /** 回调页面：授权完成后浏览器里看到的提示页（自动尝试关闭）。 */
    private static String htmlPage(boolean success, String title, String detail) {
        String color = success ? "#34d399" : "#fb7185";
        return "<!doctype html><html lang=\"zh-CN\"><head><meta charset=\"utf-8\"><title>" + title
                + " - agentscope-harness</title><style>"
                + "body{font-family:system-ui,-apple-system,'Segoe UI','Microsoft YaHei',sans-serif;display:flex;"
                + "min-height:100vh;align-items:center;justify-content:center;background:#101013;color:#f4f4f5;margin:0}"
                + ".card{max-width:460px;padding:36px 40px;border-radius:16px;border:1px solid rgba(255,255,255,.12);"
                + "background:#17171b;text-align:center}h1{font-size:18px;margin:0 0 12px;color:" + color + "}"
                + "p{font-size:13px;color:#a1a1aa;line-height:1.7;word-break:break-all;margin:6px 0}</style></head><body>"
                + "<div class=\"card\"><h1>" + (success ? "✅ " : "❌ ") + escapeHtml(title) + "</h1>"
                + "<p>" + escapeHtml(detail) + "</p>"
                + "<p>本页面由本地服务临时启动，稍后会自动尝试关闭，请返回应用查看登录状态。</p></div>"
                + "<script>setTimeout(function(){window.close()},2000)</script></body></html>";
    }

    private static void respond(HttpExchange exchange, int status, String html) throws IOException {
        byte[] body = html.getBytes(StandardCharsets.UTF_8);
        exchange.getResponseHeaders().set("Content-Type", "text/html; charset=utf-8");
        exchange.sendResponseHeaders(status, body.length);
        try (OutputStream os = exchange.getResponseBody()) {
            os.write(body);
        }
    }
}
