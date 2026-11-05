package com.agentscope.harness.mcp;

import io.agentscope.core.ReActAgent;
import io.agentscope.core.message.ToolResultBlock;
import io.agentscope.core.message.ToolUseBlock;
import io.agentscope.core.tool.ToolCallParam;
import io.agentscope.core.tool.Toolkit;
import io.agentscope.core.tool.mcp.McpClientBuilder;
import io.agentscope.core.tool.mcp.McpClientWrapper;
import io.agentscope.core.tool.subagent.SubAgentConfig;
import io.agentscope.core.tool.subagent.SubAgentTool;
import org.junit.jupiter.api.Test;
import reactor.core.publisher.Flux;
import reactor.core.publisher.Mono;

import java.io.File;
import java.time.Duration;
import java.util.List;
import java.util.Map;

import static org.junit.jupiter.api.Assertions.*;

class AgentDesktopMcpTest {

    @Test
    void testAgentDesktopMcpConnectionAndCall() {
        Toolkit computerToolkit = new Toolkit();

        McpBootstrap.ResolvedCommand resolved = McpBootstrap.resolveStdioCommand(
                "node",
                List.of("backend/tools/agent-desktop/mcp-server.js", "mcp")
        );
        assertNotNull(resolved, "ResolvedCommand should not be null");
        assertTrue(new File(resolved.args().get(0)).exists(), "Resolved mcp-server.js script must exist: " + resolved.args().get(0));

        McpClientWrapper client = McpClientBuilder.create("agent-desktop")
                .stdioTransport(resolved.command(), resolved.args(), Map.of())
                .timeout(Duration.ofSeconds(15))
                .initializationTimeout(Duration.ofSeconds(15))
                .buildSync();

        assertNotNull(client, "McpClientWrapper should not be null");

        // 注册到独立 Toolkit
        computerToolkit.registerMcpClient(client).block(Duration.ofSeconds(10));

        assertEquals(56, computerToolkit.getToolNames().size(), "Should have registered all 56 agent-desktop tools");

        // 测试调用 desktop_status 工具
        ToolUseBlock useBlock = ToolUseBlock.builder()
                .id("call-1")
                .name("desktop_status")
                .input(Map.of())
                .content("{}")
                .build();

        ToolCallParam param = ToolCallParam.builder()
                .toolUseBlock(useBlock)
                .build();

        ToolResultBlock result = computerToolkit.callTool(param).block(Duration.ofSeconds(10));
        assertNotNull(result, "Tool execution result should not be null");
        System.out.println("desktop_status output: " + result.getOutput());
        assertFalse(result.getOutput().isEmpty(), "Result output should not be empty");

        // 构建 computer-use ReActAgent 与 SubAgentTool
        ReActAgent computerAgent = ReActAgent.builder()
                .name("computer-use")
                .description("操作本地电脑桌面")
                .sysPrompt("你是计算机操作助手")
                .toolkit(computerToolkit)
                .maxIters(10)
                .build();

        SubAgentConfig config = SubAgentConfig.builder()
                .toolName("computer-use")
                .description("操作本地电脑桌面应用与窗口")
                .build();

        SubAgentTool subAgentTool = new SubAgentTool(() -> computerAgent, config);
        assertEquals("computer-use", subAgentTool.getName());
        assertNotNull(subAgentTool.getParameters());
        System.out.println("SubAgentTool parameters schema: " + subAgentTool.getParameters());
    }
}
