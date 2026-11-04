package com.agentscope.harness.tool;

import com.agentscope.harness.diagram.DiagramGenerator;
import com.agentscope.harness.diagram.DiagramResult;
import com.agentscope.harness.diagram.DiagramValidationResult;
import com.agentscope.harness.diagram.DiagramValidator;
import com.fasterxml.jackson.databind.ObjectMapper;
import io.agentscope.core.tool.Tool;
import io.agentscope.core.tool.ToolParam;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Component;

/**
 * AgentScope 图表生成与校验工具
 */
@Component
public class DiagramTool {

    private static final Logger log = LoggerFactory.getLogger(DiagramTool.class);
    private final ObjectMapper objectMapper;

    public DiagramTool(ObjectMapper objectMapper) {
        this.objectMapper = objectMapper;
    }

    @Tool(
            name = "generate_diagram",
            description = "根据自然语言需求自动生成或修改 Mermaid 图表（支持流程图 flowchart、时序图 sequence、状态机图 state、类图 class、ER图 er、架构图 architecture、甘特图 gantt、思维导图 mindmap 等）。可基于已有的 sourceCode 增量修改或扩展。返回包含 Mermaid 源码和校验状态的 JSON 结果。"
    )
    public String generateDiagram(
            @ToolParam(name = "type", description = "图表类型：flowchart(流程图), sequence(时序图), state(状态机图), class(类图), er(ER图), architecture(架构图), gantt(甘特图), mindmap(思维导图) 等", required = true)
            String type,
            @ToolParam(name = "description", description = "图表的自然语言需求或修改说明（例如：绘制医院 LIS 与 MT8000 的通信时序图；或者：在现有时序图中增加数据库节点）", required = true)
            String description,
            @ToolParam(name = "sourceCode", description = "已有的 Mermaid 源码（如果是在原图基础上修改或扩展，请传入此参数；若是从零开始生成则留空或传 null）", required = false)
            String sourceCode
    ) {
        log.info("[DiagramTool] 生成图表: type={}, description={}", type, description);
        try {
            DiagramResult result = DiagramGenerator.generate(type, description, sourceCode);
            return objectMapper.writerWithDefaultPrettyPrinter().writeValueAsString(result);
        } catch (Exception e) {
            log.error("[DiagramTool] 图表生成异常", e);
            return "{\"error\":\"" + e.getMessage() + "\"}";
        }
    }

    @Tool(
            name = "validate_diagram",
            description = "校验一段 Mermaid 图表代码的语法正确性与安全性。"
    )
    public String validateDiagram(
            @ToolParam(name = "mermaidCode", description = "待校验的 Mermaid 代码源码", required = true)
            String mermaidCode
    ) {
        log.info("[DiagramTool] 校验图表代码");
        try {
            DiagramValidationResult result = DiagramValidator.validate(mermaidCode);
            return objectMapper.writerWithDefaultPrettyPrinter().writeValueAsString(result);
        } catch (Exception e) {
            log.error("[DiagramTool] 图表校验异常", e);
            return "{\"error\":\"" + e.getMessage() + "\"}";
        }
    }
}
