package com.agentscope.harness.mcp;

import io.agentscope.core.tool.Toolkit;
import io.agentscope.core.tool.mcp.McpClientBuilder;
import io.agentscope.core.tool.mcp.McpClientWrapper;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;

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
 * chunked EOF 异常，并在连接僵死时支持自动探测重建。
 */
public final class McpBootstrap {

    private static final Logger log = LoggerFactory.getLogger(McpBootstrap.class);

    public record ServerSpec(String name, String url, Duration requestTimeout) {}

    private McpBootstrap() {}

    /**
     * 构建并注册所有 MCP server。
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
