package com.agentscope.harness.service;

import java.util.List;
import java.util.Map;

/**
 * 订阅登录（OAuth）厂商注册表：每一家可订阅登录的厂商在这里声明一份描述符，
 * OAuthService 与前端卡片均以本表为唯一事实来源（数据驱动）。
 *
 * 技术参数来源（2026-11 联网核实，均已对官方开源实现逐项比对）：
 * - openai：Codex CLI（auth.openai.com 公开客户端 app_EMoamEEZ73f0CkXaXp7hrann）。
 * - anthropic：Claude Code（claude.ai/oauth/authorize + console.anthropic.com 令牌交换）。
 * - grok：xAI 官方开源 Grok Build CLI（github.com/xai-org/grok-build，
 *   crates/codegen/xai-grok-login）与 auth.x.ai 的 OIDC discovery 文档（实测拉取）。
 *   公开 client_id=b1a00492-073a-47ea-816f-4c329264a828；回环授权码+PKCE（随机端口、
 *   路径 /callback、host 固定 127.0.0.1、带 state+nonce+referrer）。推理不走 api.x.ai
 *   （那是 API Key 专用），走 OpenAI 兼容代理 https://cli-chat-proxy.grok.com/v1，
 *   且必须附带 X-XAI-Token-Auth: xai-grok-cli 与 x-authenticateresponse 头。
 *   代理还强制校验 Grok CLI 客户端身份头（缺失或版本过低返回 HTTP 426
 *   Upgrade Required）：x-grok-client-version（semver，当前最低 1.0.13）、
 *   x-grok-client-identifier: grok-shell、User-Agent: xai-grok-cli、
 *   x-grok-client-mode: interactive（2026-11 用真实令牌实测核实）。
 *   需要 SuperGrok 或 X Premium+ 订阅。
 * - google：google-gemini/gemini-cli packages/core/src/code_assist/oauth2.ts。
 *   installed-app 客户端凭据从 agentscope.oauth-google-* 配置读取（默认值在
 *   application.yml，可被 GOOGLE_OAUTH_CLIENT_ID / GOOGLE_OAUTH_CLIENT_SECRET 覆盖），
 *   源码不留明文；回环路径 /oauth2callback（任意端口），scope 为 cloud-platform +
 *   userinfo.email + userinfo.profile，带 access_type=offline、不带 PKCE（复刻 CLI）。
 *   令牌仅用于 Code Assist 专有协议（cloudcode-pa.googleapis.com v1internal），
 *   generativelanguage 的 OpenAI 兼容层实测只认 API Key，故 openaiBaseUrl=null。
 * - github-copilot：VS Code Copilot 同款公开 client_id=Iv1.b507a08c87ecfe98，
 *   RFC 8628 设备码流程（github.com/login/device/code），再用 GitHub token 经
 *   api.github.com/copilot_internal/v2/token 换约 30 分钟有效的 Copilot Bearer，
 *   调 OpenAI 兼容的 api.githubcopilot.com（需 editor/copilot 系列头）。
 * - qwen：qwenlm/qwen-code packages/core/src/qwen/subscription-oauth-client.ts。
 *   RFC 8628 设备码（auth.qwen.ai/api/oauth/device/code，client_id=qwen-code-cli，
 *   scope=model:invoke profile:read），推理走 OpenAI 兼容
 *   https://api.qwen.ai/compatible-mode/v1，需要 Plus/Pro 订阅。
 * - kimi：MoonshotAI/kimi-cli src/kimi_cli/auth/oauth.py。RFC 8628 设备码
 *   （auth.kimi.com/api/oauth/device_authorization，client_id=17e5f671-...），
 *   推理走 OpenAI 兼容 https://api.kimi.com/coding/v1，access token 约 15 分钟，
 *   需 Kimi Code 会员；官方提醒第三方接入应如实标注客户端身份。
 */
public final class OAuthProviders {

    private OAuthProviders() {}

    /** 登录流程形态。 */
    public enum Flow {
        /** 授权码 + PKCE，本地回环回调（OpenAI / Anthropic / Grok）。 */
        LOOPBACK_PKCE,
        /** 授权码 + client_secret，本地回环回调（Google，复刻 gemini-cli 无 PKCE）。 */
        LOOPBACK_SECRET,
        /** RFC 8628 设备码流程，后端轮询令牌端点（Copilot / Qwen / Kimi）。 */
        DEVICE,
    }

    /** 一家订阅登录厂商的完整接入参数。 */
    public static final class Descriptor {
        public final String id;
        public final String title;
        public final Flow flow;
        public final String authorizeUrl;
        public final String tokenUrl;
        /** 仅 DEVICE 流程：设备码申请端点。 */
        public final String deviceCodeUrl;
        public final String clientId;
        /** LOOPBACK_SECRET 流程必填，其余为 null。 */
        public final String clientSecret;
        public final String scope;
        /** 回环回调 host（localhost 或 127.0.0.1）。 */
        public final String callbackHost;
        public final String callbackPath;
        /** DEVICE 流程：申请设备码的请求体风格（form / json）。 */
        public final boolean deviceRequestJson;
        /** 令牌交换/轮询/刷新的请求体风格（form / json）。 */
        public final boolean jsonExchange;
        /** 授权 URL 的额外参数（不含开头的 &），如 Grok 的 nonce/referrer、Google 的 access_type。 */
        public final String extraAuthorizeParams;
        /** 下游 OpenAI 兼容推理端点；null 表示协议特殊、当前调用链不能直接消费令牌。 */
        public final String openaiBaseUrl;
        /** 调用下游时必须附加的 HTTP 头（Grok / Copilot）。 */
        public final Map<String, String> extraHeaders;
        /** 模型列表路径覆盖（Copilot 是根路径 /models，而非 /v1/models）。 */
        public final String modelsPathOverride;
        /** true 表示 apiKey 是短时派生令牌（Copilot），需用 refreshToken 动态换取。 */
        public final boolean dynamicBearer;
        /** true 表示 access token 有效期短，调用前应按过期时间自动刷新（Qwen / Kimi）。 */
        public final boolean shortLivedToken;
        /** 给前端卡片的调用方式/限制标注（null 表示无特殊限制）。 */
        public final String note;

        Descriptor(String id, String title, Flow flow, String authorizeUrl, String tokenUrl,
                   String deviceCodeUrl, String clientId, String clientSecret, String scope,
                   String callbackHost, String callbackPath, boolean deviceRequestJson,
                   boolean jsonExchange, String extraAuthorizeParams, String openaiBaseUrl,
                   Map<String, String> extraHeaders, String modelsPathOverride,
                   boolean dynamicBearer, boolean shortLivedToken, String note) {
            this.id = id;
            this.title = title;
            this.flow = flow;
            this.authorizeUrl = authorizeUrl;
            this.tokenUrl = tokenUrl;
            this.deviceCodeUrl = deviceCodeUrl;
            this.clientId = clientId;
            this.clientSecret = clientSecret;
            this.scope = scope;
            this.callbackHost = callbackHost;
            this.callbackPath = callbackPath;
            this.deviceRequestJson = deviceRequestJson;
            this.jsonExchange = jsonExchange;
            this.extraAuthorizeParams = extraAuthorizeParams;
            this.openaiBaseUrl = openaiBaseUrl;
            this.extraHeaders = extraHeaders;
            this.modelsPathOverride = modelsPathOverride;
            this.dynamicBearer = dynamicBearer;
            this.shortLivedToken = shortLivedToken;
            this.note = note;
        }

        public boolean isLoopback() {
            return flow == Flow.LOOPBACK_PKCE || flow == Flow.LOOPBACK_SECRET;
        }
    }

    private static final String GOOGLE_SCOPE =
            "https://www.googleapis.com/auth/cloud-platform "
                    + "https://www.googleapis.com/auth/userinfo.email "
                    + "https://www.googleapis.com/auth/userinfo.profile";

    /** Google OAuth 客户端凭据（由 agentscope.oauth-google-* 配置注入，源码不留明文）。 */
    private static volatile String googleClientId = "";
    private static volatile String googleClientSecret = "";

    /**
     * 注入 Google OAuth 客户端凭据（Spring 启动时由 OAuthService 构造器传入
     * {@code AgentscopeProperties} 的 oauth-google-* 配置）。必须在首次 Google
     * 订阅登录前完成；未配置（空串）时该厂商将无法通过令牌交换。
     */
    public static void setGoogleCredentials(String clientId, String clientSecret) {
        googleClientId = clientId == null ? "" : clientId.trim();
        googleClientSecret = clientSecret == null ? "" : clientSecret.trim();
    }

    /**
     * Grok CLI 客户端版本号（semver）。cli-chat-proxy.grok.com 按该头判断客户端
     * 新旧，低于代理最低支持版本（当前 1.0.13）直接拒绝（HTTP 426）。这里取
     * 当前稳定版本号，可用环境变量 GROK_CLIENT_VERSION 覆盖。
     */
    public static final String GROK_CLIENT_VERSION =
            System.getenv().getOrDefault("GROK_CLIENT_VERSION", "1.0.46");

    private static final Map<String, Descriptor> ALL = Map.ofEntries(
            Map.entry("openai", new Descriptor(
                    "openai", "OpenAI ChatGPT 订阅", Flow.LOOPBACK_PKCE,
                    "https://auth.openai.com/oauth/authorize",
                    "https://auth.openai.com/oauth/token",
                    null,
                    "app_EMoamEEZ73f0CkXaXp7hrann", null,
                    "openid profile email offline_access",
                    "localhost", "/auth/callback",
                    false, false,
                    "id_token_add_organizations=true&codex_cli_simplified_flow=true&originator=codex_cli_rs",
                    "https://api.openai.com/v1",
                    Map.of(), null, false, false,
                    null)),

            Map.entry("anthropic", new Descriptor(
                    "anthropic", "Anthropic Claude 订阅", Flow.LOOPBACK_PKCE,
                    "https://claude.ai/oauth/authorize",
                    "https://console.anthropic.com/v1/oauth/token",
                    null,
                    "9d1c250a-e61b-44d9-88ed-5944d1968f2e", null,
                    "org:create_api_key user:profile user:inference",
                    "localhost", "/callback",
                    false, true,
                    null,
                    null,
                    Map.of(), null, false, false,
                    "原生 Anthropic 协议（非 OpenAI 兼容），当前推理调用链不直接消费该令牌，需配合兼容网关使用")),

            Map.entry("grok", new Descriptor(
                    "grok", "xAI Grok 订阅", Flow.LOOPBACK_PKCE,
                    "https://auth.x.ai/oauth2/authorize",
                    "https://auth.x.ai/oauth2/token",
                    null,
                    "b1a00492-073a-47ea-816f-4c329264a828", null,
                    "openid profile email offline_access grok-cli:access api:access "
                            + "conversations:read conversations:write workspaces:read workspaces:write",
                    "127.0.0.1", "/callback",
                    false, false,
                    "referrer=grok-build",
                    "https://cli-chat-proxy.grok.com/v1",
                    Map.of("X-XAI-Token-Auth", "xai-grok-cli",
                            "x-authenticateresponse", "authenticate-response",
                            "x-grok-client-version", GROK_CLIENT_VERSION,
                            "x-grok-client-identifier", "grok-shell",
                            "User-Agent", "xai-grok-cli",
                            "x-grok-client-mode", "interactive"),
                    null, false, false,
                    "需要 SuperGrok 或 X Premium+ 订阅；推理走 Grok CLI 专用 OpenAI 兼容代理（cli-chat-proxy.grok.com），api.x.ai 仅支持 API Key")),

            Map.entry("github-copilot", new Descriptor(
                    "github-copilot", "GitHub Copilot 订阅", Flow.DEVICE,
                    null,
                    "https://github.com/login/oauth/access_token",
                    "https://github.com/login/device/code",
                    "Iv1.b507a08c87ecfe98", null,
                    "read:user",
                    null, null,
                    true, true,
                    null,
                    "https://api.githubcopilot.com",
                    Map.of("copilot-integration-id", "vscode-chat",
                            "editor-version", "vscode/1.99.0",
                            "editor-plugin-version", "copilot-chat/0.26.7",
                            "openai-intent", "conversation-panel",
                            "user-agent", "GitHubCopilotChat/0.26.7"),
                    "/models", true, false,
                    "设备码流程：在 github.com/login/device 输入代码完成授权；Copilot Bearer 约 30 分钟有效，系统用 GitHub 令牌自动换取；需要 Copilot 订阅（免费账号可用模型有限）")),

            Map.entry("qwen", new Descriptor(
                    "qwen", "Qwen 通义订阅", Flow.DEVICE,
                    null,
                    "https://auth.qwen.ai/api/oauth/token",
                    "https://auth.qwen.ai/api/oauth/device/code",
                    "qwen-code-cli", null,
                    "model:invoke profile:read",
                    null, null,
                    false, false,
                    null,
                    "https://api.qwen.ai/compatible-mode/v1",
                    Map.of(), null, false, true,
                    "设备码流程：在 chat.qwen.ai 授权页输入代码完成授权；需要 Qwen Plus/Pro 订阅（免费账号可登录但不解锁调用）")),

            Map.entry("kimi", new Descriptor(
                    "kimi", "Kimi Code 会员", Flow.DEVICE,
                    null,
                    "https://auth.kimi.com/api/oauth/token",
                    "https://auth.kimi.com/api/oauth/device_authorization",
                    "17e5f671-d194-4dfb-9706-5516cb48c098", null,
                    null,
                    null, null,
                    false, false,
                    null,
                    "https://api.kimi.com/coding/v1",
                    Map.of(), null, false, true,
                    "设备码流程：在 auth.kimi.com 授权页输入代码完成授权；需要 Kimi Code 会员（Andante/Moderato/Allegretto 等），access token 约 15 分钟自动续期"))
    );

    /**
     * Google 描述符按需构建：凭据不在源码里（{@link #setGoogleCredentials} 配置注入），
     * 不能随静态表在类加载时固化，其余参数与 2026-11 核实结果保持不变。
     */
    private static Descriptor googleDescriptor() {
        return new Descriptor(
                "google", "Google Gemini 订阅", Flow.LOOPBACK_SECRET,
                "https://accounts.google.com/o/oauth2/v2/auth",
                "https://oauth2.googleapis.com/token",
                null,
                googleClientId, googleClientSecret,
                GOOGLE_SCOPE,
                "127.0.0.1", "/oauth2callback",
                false, false,
                "access_type=offline",
                null,
                Map.of(), null, false, false,
                "Google 账号免费档（Code Assist，约 1000 请求/天）可登录；但推理走 Code Assist 专有协议（cloudcode-pa.googleapis.com v1internal），非 OpenAI 兼容，当前调用链不直接消费该令牌，需配合外部协议代理使用；Antigravity 为独立的逆向协议，未接入");
    }

    /** 全部支持的厂商（供控制器/前端目录使用，保持插入顺序）。 */
    public static final List<String> IDS = List.of("openai", "anthropic", "grok", "google", "github-copilot", "qwen", "kimi");

    public static Descriptor get(String id) {
        if ("google".equals(id)) {
            return googleDescriptor();
        }
        return id == null ? null : ALL.get(id);
    }

    public static boolean isSupported(String id) {
        return get(id) != null;
    }
}
