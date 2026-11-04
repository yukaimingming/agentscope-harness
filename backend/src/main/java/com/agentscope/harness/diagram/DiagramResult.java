package com.agentscope.harness.diagram;

import com.fasterxml.jackson.annotation.JsonProperty;

/**
 * 图表生成与操作返回结果模型
 */
public class DiagramResult {

    @JsonProperty("title")
    private String title = "";

    @JsonProperty("type")
    private String type = "";

    @JsonProperty("description")
    private String description = "";

    @JsonProperty("mermaidCode")
    private String mermaidCode = "";

    @JsonProperty("validationResult")
    private DiagramValidationResult validationResult = new DiagramValidationResult();

    public DiagramResult() {}

    public DiagramResult(String title, String type, String description, String mermaidCode, DiagramValidationResult validationResult) {
        this.title = title;
        this.type = type;
        this.description = description;
        this.mermaidCode = mermaidCode;
        this.validationResult = validationResult;
    }

    public String getTitle() { return title; }
    public void setTitle(String title) { this.title = title; }

    public String getType() { return type; }
    public void setType(String type) { this.type = type; }

    public String getDescription() { return description; }
    public void setDescription(String description) { this.description = description; }

    public String getMermaidCode() { return mermaidCode; }
    public void setMermaidCode(String mermaidCode) { this.mermaidCode = mermaidCode; }

    public DiagramValidationResult getValidationResult() { return validationResult; }
    public void setValidationResult(DiagramValidationResult validationResult) { this.validationResult = validationResult; }
}
