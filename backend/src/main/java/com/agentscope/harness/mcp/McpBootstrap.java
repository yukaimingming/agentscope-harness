package com.agentscope.harness.mcp;

import io.agentscope.core.tool.Toolkit;
import io.agentscope.core.tool.mcp.McpClientBuilder;
import io.agentscope.core.tool.mcp.McpClientWrapper;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;

import java.io.File;
import java.net.http.HttpClient;
import java.time.Duration;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

/**
 * MCP 客户端接管与连接生命周期管理。
 * <p>
 * 通过自定义配置降低 keepalive 连接保活时间，防止远程服务端关闭连接后客户端依然复用导致的
 * chunked EOF 异常，并在连接僵死时支持自动探测重建。同时支持 Stdio 进程级 MCP 扩展服务。
 */
public final class McpBootstrap {

    private static final Logger log = LoggerFactory.getLogger(McpBootstrap.class);

    public record ServerSpec(String name, String url, Duration requestTimeout) {}

    public record StdioServerSpec(String name, String command, List<String> args, Map<String, String> env, Duration requestTimeout) {}

    public record ResolvedCommand(String command, List<String> args) {}

    private McpBootstrap() {}

    /**
     * 构建并注册所有 HTTP MCP server。
     */
    public static List<McpClientWrapper> register(Toolkit toolkit, List<ServerSpec> specs, int keepaliveSeconds) {
        Map<String, McpClientWrapper> registered = new LinkedHashMap<>();
        for (ServerSpec spec : specs) {
            try {
                McpClientWrapper client = buildClient(spec, keepaliveSeconds);
                toolkit.registerMcpClient(client)
                        .block(spec.requestTimeout().plus(Duration.ofSeconds(30)));
                registered.put(spec.name(), client);
                log.info("[MCP] {} 已连接: {}", spec.name(), spec.url());
            } catch (Exception e) {
                log.warn("[MCP] {} 连接失败: {}，该 server 工具暂不可用", spec.name(), e.getMessage());
            }
        }
        return new ArrayList<>(registered.values());
    }

    /**
     * 构建单个带有特定 HTTPClient 设置的 MCP 客户端。
     */
    public static McpClientWrapper buildClient(ServerSpec spec, int keepaliveSeconds) {
        return McpClientBuilder.create(spec.name())
                .streamableHttpTransport(spec.url())
                .customizeStreamableHttpClient(builder -> builder
                        .connectTimeout(Duration.ofSeconds(15))
                        .version(HttpClient.Version.HTTP_1_1))
                .timeout(spec.requestTimeout())
                .initializationTimeout(spec.requestTimeout())
                .buildSync();
    }

    /**
     * 构建并注册单个 Stdio MCP 客户端到指定 Toolkit。
     * 连接任一步骤失败时，会关闭已半建成的客户端（终止其 stdio 子进程）后返回 null，
     * 避免进程泄漏。
     */
    public static McpClientWrapper registerStdio(Toolkit toolkit, StdioServerSpec spec) {
        McpClientWrapper client = null;
        try {
            ResolvedCommand resolved = resolveStdioCommand(spec.command(), spec.args());
            client = McpClientBuilder.create(spec.name())
                    .stdioTransport(resolved.command(), resolved.args(), spec.env() != null ? spec.env() : Map.of())
                    .timeout(spec.requestTimeout())
                    .initializationTimeout(spec.requestTimeout())
                    .buildSync();
            toolkit.registerMcpClient(client)
                    .block(spec.requestTimeout().plus(Duration.ofSeconds(30)));
            int toolCount = client.listTools().block(Duration.ofSeconds(5)).size();
            log.info("[MCP] Stdio {} 已连接，注册工具 {} 个", spec.name(), toolCount);
            return client;
        } catch (Exception e) {
            log.warn("[MCP] Stdio {} 连接失败: {}，该 server 工具暂不可用", spec.name(), e.getMessage());
            if (client != null) {
                try {
                    client.close();
                } catch (Exception ignored) {}
            }
            return null;
        }
    }

    /**
     * 辅助解析仓库内 MCP 脚本或工具文件（优先按运行目录相对路径探测）。
     */
    public static File resolveRepoFile(String pathHint) {
        if (pathHint == null || pathHint.isBlank()) {
            return null;
        }
        // 1. 直接按当前工作目录尝试
        File f1 = new File(pathHint);
        if (f1.exists()) {
            return f1.getAbsoluteFile();
        }
        // 2. 尝试补上 backend/ 前缀（针对在项目根目录运行情况）
        File f2 = new File("backend", pathHint);
        if (f2.exists()) {
            return f2.getAbsoluteFile();
        }
        // 3. 尝试去除 backend/ 或 backend\ 前缀（针对在 backend 子目录运行情况，如 mvn test）
        if (pathHint.startsWith("backend/") || pathHint.startsWith("backend\\")) {
            File f3 = new File(pathHint.substring(8));
            if (f3.exists()) {
                return f3.getAbsoluteFile();
            }
        }
        return null;
    }

    /**
     * 获取仓库内内置的 mcp-server.js 脚本文件。
     */
    public static File findRepoMcpServerScript() {
        File f = resolveRepoFile("backend/tools/agent-desktop/mcp-server.js");
        if (f != null && f.exists()) {
            return f;
        }
        File fSub = resolveRepoFile("tools/agent-desktop/mcp-server.js");
        if (fSub != null && fSub.exists()) {
            return fSub;
        }
        return null;
    }

    /**
     * Windows 环境与外部命令路径自适应探测。
     * 优先解析仓库内相对路径（backend/tools/agent-desktop/mcp-server.js），不存在时回退到外部路径。
     */
    public static ResolvedCommand resolveStdioCommand(String command, List<String> args) {
        String os = System.getProperty("os.name", "").toLowerCase();
        boolean isWin = os.contains("win");

        // 1. 如果 args 中包含指向 mcp-server.js 的相对路径或脚本路径
        if (args != null && !args.isEmpty()) {
            String firstArg = args.get(0);
            if (firstArg != null && firstArg.toLowerCase().contains("mcp-server.js")) {
                File repoScript = resolveRepoFile(firstArg);
                if (repoScript == null) {
                    repoScript = findRepoMcpServerScript();
                }
                if (repoScript != null && repoScript.exists()) {
                    List<String> newArgs = new ArrayList<>(args);
                    newArgs.set(0, repoScript.getAbsolutePath());
                    return new ResolvedCommand(command != null ? command : "node", newArgs);
                }
                // 仓库内不存在时，回退到全局 fallback 路径
                File fallbackScript = new File("E:\\nodejs\\node_modules\\agent-desktop\\lib\\mcp-server.js");
                if (fallbackScript.exists()) {
                    List<String> newArgs = new ArrayList<>(args);
                    newArgs.set(0, fallbackScript.getAbsolutePath());
                    return new ResolvedCommand(command != null ? command : "node", newArgs);
                }
            }
        }

        // 2. 如果 command 本身就是 agent-desktop 别名
        if (isWin && "agent-desktop".equalsIgnoreCase(command)) {
            // 优先使用仓库内 patch 脚本
            File repoScript = findRepoMcpServerScript();
            if (repoScript != null && repoScript.exists()) {
                List<String> nodeArgs = new ArrayList<>();
                nodeArgs.add(repoScript.getAbsolutePath());
                if (args != null && !args.isEmpty()) {
                    nodeArgs.addAll(args);
                }
                return new ResolvedCommand("node", nodeArgs);
            }
            // 回退到全局 node 脚本
            File nodeJsScript = new File("E:\\nodejs\\node_modules\\agent-desktop\\lib\\mcp-server.js");
            if (nodeJsScript.exists()) {
                List<String> nodeArgs = new ArrayList<>();
                nodeArgs.add(nodeJsScript.getAbsolutePath());
                if (args != null && !args.isEmpty()) {
                    nodeArgs.addAll(args);
                }
                return new ResolvedCommand("node", nodeArgs);
            }
            String appData = System.getenv("APPDATA");
            if (appData != null) {
                File appDataScript = new File(appData, "npm\\node_modules\\agent-desktop\\lib\\mcp-server.js");
                if (appDataScript.exists()) {
                    List<String> nodeArgs = new ArrayList<>();
                    nodeArgs.add(appDataScript.getAbsolutePath());
                    if (args != null && !args.isEmpty()) {
                        nodeArgs.addAll(args);
                    }
                    return new ResolvedCommand("node", nodeArgs);
                }
            }
            File cmdFile = new File("E:\\nodejs\\agent-desktop.cmd");
            if (cmdFile.exists()) {
                return new ResolvedCommand(cmdFile.getAbsolutePath(), args != null ? args : List.of());
            }
            return new ResolvedCommand("agent-desktop.cmd", args != null ? args : List.of());
        }

        // 3. 如果 command 本身是相对路径（如指向 backend/tools/agent-desktop/mcp-server.js）
        File repoFile = resolveRepoFile(command);
        if (repoFile != null && repoFile.exists()) {
            if (repoFile.getName().toLowerCase().endsWith(".js")) {
                List<String> nodeArgs = new ArrayList<>();
                nodeArgs.add(repoFile.getAbsolutePath());
                if (args != null && !args.isEmpty()) {
                    nodeArgs.addAll(args);
                }
                return new ResolvedCommand("node", nodeArgs);
            }
            return new ResolvedCommand(repoFile.getAbsolutePath(), args != null ? args : List.of());
        }

        return new ResolvedCommand(command, args != null ? args : List.of());
    }

    /**
     * 探测 MCP 客户端存活状态。
     */
    public static boolean isAlive(McpClientWrapper client) {
        try {
            client.listTools().block(Duration.ofSeconds(10));
            return true;
        } catch (Exception e) {
            return false;
        }
    }
}
