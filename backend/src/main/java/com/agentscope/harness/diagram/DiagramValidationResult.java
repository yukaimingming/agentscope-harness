package com.agentscope.harness.diagram;

import com.fasterxml.jackson.annotation.JsonProperty;
import java.util.ArrayList;
import java.util.List;

/**
 * 图表代码语法与安全性校验结果
 */
public class DiagramValidationResult {

    @JsonProperty("isValid")
    private boolean isValid = true;

    @JsonProperty("errorMessage")
    private String errorMessage;

    @JsonProperty("warnings")
    private List<String> warnings = new ArrayList<>();

    public DiagramValidationResult() {}

    public DiagramValidationResult(boolean isValid, String errorMessage) {
        this.isValid = isValid;
        this.errorMessage = errorMessage;
    }

    public boolean isValid() { return isValid; }
    public void setValid(boolean valid) { isValid = valid; }

    public String getErrorMessage() { return errorMessage; }
    public void setErrorMessage(String errorMessage) { this.errorMessage = errorMessage; }

    public List<String> getWarnings() { return warnings; }
    public void setWarnings(List<String> warnings) { this.warnings = warnings; }
}
