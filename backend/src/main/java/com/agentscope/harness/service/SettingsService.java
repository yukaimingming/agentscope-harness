package com.agentscope.harness.service;

import com.agentscope.harness.config.AgentscopeProperties;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Service;

import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.Paths;
import java.util.HashMap;
import java.util.Map;

/**
 * 系统设置服务：承载设置面板的运行时开关状态并落盘持久化。
 *
 * 目前管理 Computer Use（agent-desktop 桌面自动化）启用开关：
 * 切换直接修改 {@link AgentscopeProperties#setMcpAgentDesktopEnabled(boolean)}，
 * 由于 HarnessAgentManager 在每次创建智能体时都会实时读取该属性，
 * 切换后新会话立即生效（挂载失败仍按原有「降级运行」逻辑处理，不影响聊天主流程）。
 */
@Service
public class SettingsService {

    private static final Logger log = LoggerFactory.getLogger(SettingsService.class);

    private final AgentscopeProperties properties;
    private final ObjectMapper objectMapper;
    private Path storeFile;

    public SettingsService(AgentscopeProperties properties, ObjectMapper objectMapper) {
        this.properties = properties;
        this.objectMapper = objectMapper;
        initStore();
    }

    /** 启动时从 .data/settings.json 恢复上次保存的开关状态；无文件时保持配置默认值（关闭）。 */
    private void initStore() {
        try {
            Path dataDir = Paths.get(properties.getDataDir()).toAbsolutePath().normalize();
            Path parentData = dataDir.getParent() != null && dataDir.getParent().getParent() != null
                    ? dataDir.getParent().getParent().resolve(".data").normalize()
                    : null;
            if (parentData != null && Files.exists(parentData)) {
                dataDir = parentData;
            }
            Files.createDirectories(dataDir);
            this.storeFile = dataDir.resolve("settings.json");

            if (Files.exists(storeFile)) {
                String content = Files.readString(storeFile);
                JsonNode root = objectMapper.readTree(content);
                if (root.has("computerUseEnabled") && root.get("computerUseEnabled").isBoolean()) {
                    boolean enabled = root.get("computerUseEnabled").asBoolean();
                    properties.setMcpAgentDesktopEnabled(enabled);
                    log.info("已从 settings.json 恢复 Computer Use 开关状态: {}", enabled ? "启用" : "关闭");
                }
            }
        } catch (Exception e) {
            log.error("初始化 SettingsService 失败", e);
        }
    }

    public boolean isComputerUseEnabled() {
        return properties.isMcpAgentDesktopEnabled();
    }

    /** 切换 Computer Use 开关并立即持久化，保证重启后状态不回退。 */
    public synchronized void setComputerUseEnabled(boolean enabled) {
        properties.setMcpAgentDesktopEnabled(enabled);
        save();
        log.info("Computer Use 开关已切换为 {}（新会话即时生效）", enabled ? "启用" : "关闭");
    }

    private void save() {
        if (storeFile == null) {
            return;
        }
        try {
            Map<String, Object> map = new HashMap<>();
            map.put("version", 1);
            map.put("computerUseEnabled", properties.isMcpAgentDesktopEnabled());
            String json = objectMapper.writerWithDefaultPrettyPrinter().writeValueAsString(map);
            Files.writeString(storeFile, json);
        } catch (IOException e) {
            log.error("持久化 settings.json 失败", e);
        }
    }
}
