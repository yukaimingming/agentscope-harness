package com.agentscope.harness.diagram;

/**
 * Mermaid 图表类型枚举与关键字映射
 */
public enum DiagramType {
    FLOWCHART("flowchart TD", "流程图 (Flowchart)", "flowchart"),
    SEQUENCE("sequenceDiagram", "时序图 (Sequence Diagram)", "sequence"),
    STATE("stateDiagram-v2", "状态机图 (State Diagram)", "state"),
    CLASS_DIAGRAM("classDiagram", "类图 (Class Diagram)", "class"),
    ER_DIAGRAM("erDiagram", "实体关系图 (ER Diagram)", "er"),
    ARCHITECTURE("flowchart LR", "架构图 (Architecture Diagram)", "architecture"),
    GANTT("gantt", "甘特图 (Gantt)", "gantt"),
    MINDMAP("mindmap", "思维导图 (Mindmap)", "mindmap"),
    GIT_GRAPH("gitGraph", "Git 分支图 (Git Graph)", "gitGraph");

    private final String mermaidKeyword;
    private final String displayName;
    private final String typeIdentifier;

    DiagramType(String mermaidKeyword, String displayName, String typeIdentifier) {
        this.mermaidKeyword = mermaidKeyword;
        this.displayName = displayName;
        this.typeIdentifier = typeIdentifier;
    }

    public String getMermaidKeyword() { return mermaidKeyword; }
    public String getDisplayName() { return displayName; }
    public String getTypeIdentifier() { return typeIdentifier; }

    public static DiagramType parse(String input) {
        if (input == null || input.isBlank()) return FLOWCHART;
        String s = input.trim().toLowerCase();
        if (s.contains("sequence") || s.contains("时序") || s.contains("序列")) return SEQUENCE;
        if (s.contains("state") || s.contains("状态")) return STATE;
        if (s.contains("class") || s.contains("类图")) return CLASS_DIAGRAM;
        if (s.contains("er") || s.contains("实体") || s.contains("关系")) return ER_DIAGRAM;
        if (s.contains("arch") || s.contains("架构") || s.contains("拓扑")) return ARCHITECTURE;
        if (s.contains("gantt") || s.contains("甘特")) return GANTT;
        if (s.contains("mind") || s.contains("思维导图") || s.contains("脑图")) return MINDMAP;
        if (s.contains("git")) return GIT_GRAPH;
        return FLOWCHART;
    }
}
