package com.agentscope.harness.model;

import com.fasterxml.jackson.annotation.JsonIgnoreProperties;
import java.util.List;
import java.util.Map;

/**
 * 前端 AG-UI 传输的消息对象。
 */
@JsonIgnoreProperties(ignoreUnknown = true)
public class AguiMessage {

    private String id;
    private String role; // user, assistant, system, tool
    private Object content; // String 或 List<Map<String, Object>>
    private String name;
    private String toolCallId;

    public AguiMessage() {}

    public String getId() {
        return id;
    }

    public void setId(String id) {
        this.id = id;
    }

    public String getRole() {
        return role;
    }

    public void setRole(String role) {
        this.role = role;
    }

    public Object getContent() {
        return content;
    }

    public void setContent(Object content) {
        this.content = content;
    }

    public String getName() {
        return name;
    }

    public void setName(String name) {
        this.name = name;
    }

    public String getToolCallId() {
        return toolCallId;
    }

    public void setToolCallId(String toolCallId) {
        this.toolCallId = toolCallId;
    }

    /**
     * 获取纯文本内容。
     */
    public String getTextContent() {
        if (content == null) {
            return "";
        }
        if (content instanceof String str) {
            return str;
        }
        if (content instanceof List<?> list) {
            StringBuilder sb = new StringBuilder();
            for (Object item : list) {
                if (item instanceof Map<?, ?> map) {
                    Object text = map.get("text");
                    if (text != null) {
                        sb.append(text.toString());
                    }
                }
            }
            return sb.toString();
        }
        return content.toString();
    }
}
