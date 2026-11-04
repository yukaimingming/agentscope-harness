package com.agentscope.harness.diagram;

import java.util.ArrayList;
import java.util.Arrays;
import java.util.List;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

/**
 * 图表生成核心引擎
 * 具备自然语言需求解析、增量上下文修改以及高质量领域模板能力。
 */
public class DiagramGenerator {

    public static DiagramResult generate(String type, String description, String sourceCode) {
        DiagramType diagramType = DiagramType.parse(type);
        String title = extractTitle(description, diagramType);

        String code = generateTemplate(diagramType, description, sourceCode);
        DiagramValidationResult validation = DiagramValidator.validate(code);

        return new DiagramResult(
                title,
                diagramType.getTypeIdentifier(),
                description != null ? description : "",
                code,
                validation
        );
    }

    private static String extractTitle(String description, DiagramType type) {
        if (description == null || description.isBlank()) {
            return type.getDisplayName();
        }
        String trimmed = description.trim();
        Matcher matcher = Pattern.compile("(?:帮我画一个|绘制一个|生成一个|画出|绘制|生成|关于)?([^\\n，。？！]{2,30})").matcher(trimmed);
        if (matcher.find() && matcher.group(1) != null && !matcher.group(1).isBlank()) {
            String candidate = matcher.group(1).trim();
            if (candidate.length() > 2) {
                return candidate;
            }
        }
        return trimmed.length() > 30 ? trimmed.substring(0, 30) + "..." : trimmed;
    }

    public static String generateTemplate(DiagramType type, String description, String sourceCode) {
        String d = description != null ? description.toLowerCase() : "";

        // 如果存在已有源码且用户要求增量修改或扩展
        if (sourceCode != null && !sourceCode.isBlank()) {
            return modifyExistingSource(sourceCode, d, type);
        }

        return switch (type) {
            case FLOWCHART -> generateFlowchart(d);
            case SEQUENCE -> generateSequence(d);
            case STATE -> generateState(d);
            case CLASS_DIAGRAM -> generateClassDiagram(d);
            case ER_DIAGRAM -> generateErDiagram(d);
            case ARCHITECTURE -> generateArchitecture(d);
            case GANTT -> generateGantt(d);
            case MINDMAP -> generateMindmap(d);
            case GIT_GRAPH -> generateGitGraph(d);
        };
    }

    private static String modifyExistingSource(String source, String req, DiagramType type) {
        String clean = DiagramValidator.sanitizeAndClean(source);

        // 原图有时序图且用户要求增加数据库节点
        if (clean.contains("sequenceDiagram") && (req.contains("数据库") || req.contains("db") || req.contains("database"))) {
            if (!clean.contains("participant DB") && !clean.contains("Database")) {
                List<String> lines = new ArrayList<>(Arrays.asList(clean.split("\n")));
                int insertIndex = -1;
                for (int i = 0; i < lines.size(); i++) {
                    String line = lines.get(i).trim();
                    if (line.startsWith("participant") || line.startsWith("actor")) {
                        insertIndex = i;
                    }
                }
                if (insertIndex >= 0) {
                    lines.add(insertIndex + 1, "    participant DB as 检验数据库 (Database)");
                } else {
                    lines.add(1, "    participant DB as 检验数据库 (Database)");
                }
                lines.add("    LIS->>DB: 记录通信日志与样本状态");
                lines.add("    DB-->>LIS: 确认写入成功");
                return String.join("\n", lines);
            }
        }

        // 要求增加异常处理分支
        if (req.contains("异常") || req.contains("错误") || req.contains("分支")) {
            if (clean.startsWith("flowchart") || clean.startsWith("graph")) {
                return clean + "\n    E -->|异常或校验失败| Err[\"异常处理 & 告警上报\"]\n    Err --> Notify[\"通知运维与责任人\"]";
            }
            if (clean.startsWith("stateDiagram")) {
                return clean + "\n    [*] --> 异常状态: 触发故障告警\n    异常状态 --> [*]: 故障排除与复位";
            }
        }

        return clean;
    }

    private static String generateFlowchart(String d) {
        if (d.contains("样本") || d.contains("检验") || d.contains("采集") || d.contains("审核")) {
            return """
                flowchart TD
                    A["样本采集 (Collection)"] --> B["样本前处理 & 贴码条"]
                    B --> C["物流运输至实验室"]
                    C --> D["LIS 样本扫码签收"]
                    D --> E{"样本状态初验"}
                    E -- 合格 --> F["分析仪上机检测"]
                    E -- 不合格/溶血 --> G["标记异常并通知重采"]
                    F --> H["质控质检比对"]
                    H --> I["LIS 自动初审"]
                    I --> J["检验主管终审签字"]
                    J --> K["发布检验报告 & 推送通知"]
                """;
        }

        if (d.contains("agent") || d.contains("接收") || d.contains("工具") || d.contains("执行")) {
            return """
                flowchart TD
                    A["用户发送请求 Prompt"] --> B["Agent 接收并解析上下文"]
                    B --> C["规划模式评估 (Plan Mode)"]
                    C --> D{"是否需要调用工具?"}
                    D -- 是 --> E["选择并调用工具 (如 generate_diagram)"]
                    E --> F["执行工具逻辑并获取结果"]
                    F --> G["结果回填 Agent 上下文"]
                    G --> H["循环评估与中间思考"]
                    H --> I{"任务是否完成?"}
                    I -- 否 --> C
                    I -- 是 --> J["生成最终 Markdown 回复"]
                    D -- 否 --> J
                    J --> K["前端渲染与展示"]
                """;
        }

        return """
            flowchart TD
                Start["开始"] --> Step1["接收输入与需求解析"]
                Step1 --> Check{"逻辑条件判断"}
                Check -- 是 --> ActionA["主流程处理执行"]
                Check -- 否 --> ActionB["备用流程/分支处理"]
                ActionA --> Merge["汇聚与数据整合"]
                ActionB --> Merge
                Merge --> Finish["完成并输出结果"]
            """;
    }

    private static String generateSequence(String d) {
        if (d.contains("lis") || d.contains("mt8000") || d.contains("通信") || d.contains("医院")) {
            return """
                sequenceDiagram
                    autonumber
                    participant MT as MT8000 流水线分析仪
                    participant LIS as 医院 LIS 系统
                    participant DB as 检验数据库

                    MT->>LIS: 1. 建立 TCP/HL7 通信握手
                    LIS-->>MT: 2. 握手确认 (ACK)
                    MT->>LIS: 3. 扫描试管条码查询测试项目 (QRY^Q02)
                    LIS->>DB: 4. 检索样本检验申请单
                    DB-->>LIS: 5. 返回项目明细 (血常规/生化)
                    LIS-->>MT: 6. 下发检测医嘱与通道参数 (DSR^Q03)
                    MT->>MT: 7. 执行样本吸样、孵育与比色测定
                    MT->>LIS: 8. 上传检验结果数据 (ORU^R01)
                    LIS->>DB: 9. 写入检测结果并标记待审
                    LIS-->>MT: 10. 确认接收数据完成 (ACK^R01)
                """;
        }

        return """
            sequenceDiagram
                autonumber
                actor User as 用户
                participant Client as 前端界面
                participant Agent as Agent 核心服务
                participant Tools as 工具执行引擎

                User->>Client: 发起业务请求
                Client->>Agent: 提交自然语言指令
                Agent->>Agent: 解析意图与规划任务
                Agent->>Tools: 调用指定工具执行
                Tools-->>Agent: 返回工具执行结果
                Agent->>Client: 流式输出响应数据与图表
                Client-->>User: 渲染展示可视化图表
            """;
    }

    private static String generateState(String d) {
        if (d.contains("订单") || d.contains("支付") || d.contains("待支付")) {
            return """
                stateDiagram-v2
                    [*] --> 待支付: 创建订单
                    待支付 --> 已支付: 支付成功
                    待支付 --> 已取消: 超时未付/用户取消
                    已支付 --> 处理中: 仓储配货/开始执行
                    已支付 --> 已退款: 发起全额退款
                    处理中 --> 已完成: 发货并确认收货
                    处理中 --> 已取消: 异常阻断中断
                    已完成 --> [*]
                    已取消 --> [*]
                    已退款 --> [*]
                """;
        }

        return """
            stateDiagram-v2
                [*] --> 初始化: 实例创建
                初始化 --> 就绪: 资源加载完毕
                就绪 --> 运行中: 触发执行事件
                运行中 --> 暂停: 收到挂起信号
                暂停 --> 运行中: 恢复执行
                运行中 --> 完成: 任务处理结束
                运行中 --> 错误: 发生异常
                错误 --> 就绪: 重试恢复
                完成 --> [*]
            """;
    }

    private static String generateClassDiagram(String d) {
        return """
            classDiagram
                class DiagramGenerator {
                    +generate(type, desc, sourceCode) DiagramResult
                }
                class DiagramValidator {
                    +validate(code) DiagramValidationResult
                    +sanitizeAndClean(raw) String
                }
                class DiagramResult {
                    +String title
                    +String type
                    +String mermaidCode
                    +DiagramValidationResult validationResult
                }
                class DiagramTool {
                    +generate_diagram() String
                    +validate_diagram() String
                }
                DiagramTool --> DiagramGenerator : invokes
                DiagramGenerator --> DiagramValidator : validates
                DiagramGenerator ..> DiagramResult : returns
            """;
    }

    private static String generateErDiagram(String d) {
        return """
            erDiagram
                USER ||--o{ ORDER : places
                ORDER ||--|{ ORDER_ITEM : contains
                PRODUCT ||--o{ ORDER_ITEM : includes
                ORDER ||--|| PAYMENT : generates

                USER {
                    string id PK
                    string username
                    string email
                    datetime createdAt
                }
                ORDER {
                    string id PK
                    string userId FK
                    decimal totalAmount
                    string status
                    datetime createdAt
                }
                ORDER_ITEM {
                    string id PK
                    string orderId FK
                    string productId FK
                    int quantity
                    decimal unitPrice
                }
                PRODUCT {
                    string id PK
                    string name
                    decimal price
                    int stock
                }
            """;
    }

    private static String generateArchitecture(String d) {
        return """
            flowchart LR
                subgraph ClientTier["客户端展现层"]
                    Web["Web 前端 (React / Vite)"]
                    Viewer["DiagramViewer (Mermaid.js)"]
                end

                subgraph GatewayTier["接入网关层"]
                    API["Spring Boot REST API"]
                    SSE["SSE 流式响应 (AguiAdapter)"]
                end

                subgraph CoreTier["AgentScope 核心引擎"]
                    HarnessAgent["HarnessAgent"]
                    Manager["HarnessAgentManager"]
                    Subagents["Subagents (researcher/summarizer)"]
                end

                subgraph ToolTier["工具与技能集成"]
                    DiagramTool["DiagramTool"]
                    WebSearch["WebSearchTool"]
                    FileTool["Built-in File/Shell Toolkit"]
                end

                Web --> API
                Web --> SSE
                API --> Manager
                SSE --> Manager
                Manager --> HarnessAgent
                HarnessAgent --> Subagents
                HarnessAgent --> DiagramTool
                HarnessAgent --> WebSearch
                HarnessAgent --> FileTool
            """;
    }

    private static String generateGantt(String d) {
        return """
            gantt
                title 项目实施甘特图
                dateFormat  YYYY-MM-DD
                section 需求与规划
                需求分析           :done,    des1, 2026-11-01,2026-11-03
                架构设计           :active,  des2, 2026-11-03, 3d
                section 后端开发
                图表模块实现       :         des3, after des2, 4d
                工具集成与测试     :         des4, after des3, 2d
                section 前端开发
                Mermaid 渲染组件   :         des5, after des2, 3d
                卡片交互与导出     :         des6, after des5, 3d
            """;
    }

    private static String generateMindmap(String d) {
        return """
            mindmap
                root((Diagram Generator))
                    后端架构
                        DiagramGenerator
                        DiagramValidator
                        DiagramTool
                    前端渲染
                        Mermaid.js
                        缩放与平移
                        SVG/PNG 导出
                        源码实时编辑
                    支持图表
                        Flowchart
                        Sequence
                        State
                        Class
                        ER
            """;
    }

    private static String generateGitGraph(String d) {
        return """
            gitGraph
                commit id: "Initial Commit"
                branch feature/diagram
                checkout feature/diagram
                commit id: "Add Diagram Tool"
                commit id: "Add Diagram Viewer"
                checkout main
                merge feature/diagram id: "Merge PR #1"
                commit id: "Release v1.2"
            """;
    }
}
