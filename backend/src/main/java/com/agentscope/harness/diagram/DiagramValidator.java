package com.agentscope.harness.diagram;

import java.util.Arrays;
import java.util.HashSet;
import java.util.Set;

/**
 * Mermaid 图表语法与安全校验器
 */
public class DiagramValidator {

    private static final Set<String> VALID_HEADER_KEYWORDS = new HashSet<>(Arrays.asList(
            "flowchart",
            "graph",
            "sequencediagram",
            "statediagram",
            "statediagram-v2",
            "classdiagram",
            "erdiagram",
            "architecture-beta",
            "gantt",
            "mindmap",
            "gitgraph",
            "c4context",
            "c4container",
            "c4component",
            "pie",
            "journey",
            "timeline"
    ));

    private static final String[] DANGEROUS_PATTERNS = {
            "<script",
            "javascript:",
            "onerror=",
            "onload=",
            "<iframe",
            "<embed",
            "<object",
            "data:text/html"
    };

    /**
     * 清理代码围栏、BOM 和多余首尾空字符
     */
    public static String sanitizeAndClean(String rawMermaidCode) {
        if (rawMermaidCode == null || rawMermaidCode.isBlank()) {
            return "";
        }

        String cleaned = rawMermaidCode.trim();

        // 去除 Markdown ```mermaid 代码围栏
        if (cleaned.startsWith("```")) {
            int firstLineEnd = cleaned.indexOf('\n');
            if (firstLineEnd != -1) {
                cleaned = cleaned.substring(firstLineEnd + 1);
            } else {
                cleaned = cleaned.replaceFirst("^`+", "");
            }
        }

        if (cleaned.endsWith("```")) {
            cleaned = cleaned.substring(0, cleaned.length() - 3).trim();
        }

        return cleaned.trim();
    }

    /**
     * 全面校验 Mermaid 代码语法与安全性
     */
    public static DiagramValidationResult validate(String mermaidCode) {
        DiagramValidationResult result = new DiagramValidationResult();
        String code = sanitizeAndClean(mermaidCode);

        if (code.isBlank()) {
            result.setValid(false);
            result.setErrorMessage("Mermaid 图表代码不能为空。");
            return result;
        }

        // 1. 安全防护检查
        String lowerCode = code.toLowerCase();
        for (String dangerous : DANGEROUS_PATTERNS) {
            if (lowerCode.contains(dangerous)) {
                result.setValid(false);
                result.setErrorMessage("检测到潜在的安全威胁字符 '" + dangerous + "'，已拒绝渲染。");
                return result;
            }
        }

        // 2. 头部类型声明检查（跳过注释行 %%）
        String[] lines = code.split("\n");
        String firstValidLine = null;
        for (String line : lines) {
            String trimmed = line.trim();
            if (!trimmed.isEmpty() && !trimmed.startsWith("%%")) {
                firstValidLine = trimmed;
                break;
            }
        }

        if (firstValidLine == null) {
            result.setValid(false);
            result.setErrorMessage("图表代码缺少有效内容。");
            return result;
        }

        String firstToken = firstValidLine.split("[ \t]")[0].toLowerCase();
        if (!VALID_HEADER_KEYWORDS.contains(firstToken)) {
            result.setValid(false);
            result.setErrorMessage("未识别的 Mermaid 图表类型声明: '" + firstValidLine + "'。支持 flowchart, sequenceDiagram, stateDiagram-v2, classDiagram, erDiagram 等。");
            return result;
        }

        // 3. 括号配对与引号检查
        int openBrackets = 0;   // []
        int openParens = 0;     // ()
        int openBraces = 0;     // {}
        boolean inQuotes = false;

        for (int i = 0; i < code.length(); i++) {
            char ch = code.charAt(i);

            if (ch == '"' && (i == 0 || code.charAt(i - 1) != '\\')) {
                inQuotes = !inQuotes;
                continue;
            }

            if (inQuotes) continue;

            switch (ch) {
                case '[': openBrackets++; break;
                case ']': openBrackets--; break;
                case '(': openParens++; break;
                case ')': openParens--; break;
                case '{': openBraces++; break;
                case '}': openBraces--; break;
            }

            if (openBrackets < 0) {
                result.setValid(false);
                result.setErrorMessage("方括号 ']' 闭合多于开放括号，语法不匹配。");
                return result;
            }
            if (openParens < 0) {
                result.setValid(false);
                result.setErrorMessage("圆括号 ')' 闭合多于开放括号，语法不匹配。");
                return result;
            }
            if (openBraces < 0) {
                result.setValid(false);
                result.setErrorMessage("花括号 '}' 闭合多于开放括号，语法不匹配。");
                return result;
            }
        }

        if (openBrackets != 0) {
            result.setValid(false);
            result.setErrorMessage("存在未闭合的方括号 '[' (未匹配数量: " + openBrackets + ")。");
            return result;
        }
        if (openParens != 0) {
            result.setValid(false);
            result.setErrorMessage("存在未闭合的圆括号 '(' (未匹配数量: " + openParens + ")。");
            return result;
        }
        if (openBraces != 0) {
            result.setValid(false);
            result.setErrorMessage("存在未闭合的花括号 '{' (未匹配数量: " + openBraces + ")。");
            return result;
        }

        if (inQuotes) {
            result.getWarnings().add("存在未配对的双引号，可能会影响图表标签渲染。");
        }

        result.setValid(true);
        return result;
    }
}
