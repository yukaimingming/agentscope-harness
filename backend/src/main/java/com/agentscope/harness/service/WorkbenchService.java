package com.agentscope.harness.service;

import com.agentscope.harness.config.AgentscopeProperties;
import com.agentscope.harness.model.WorkbenchModels.WorkbenchIndex;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Service;

import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.Paths;
import java.util.UUID;

/**
 * 工作台索引与会话状态持久化服务。
 */
@Service
public class WorkbenchService {

    private static final Logger log = LoggerFactory.getLogger(WorkbenchService.class);

    private final ObjectMapper objectMapper;
    private final Path workbenchDir;
    private final Path sessionsDir;
    private final Path indexPath;

    public WorkbenchService(AgentscopeProperties properties, ObjectMapper objectMapper) {
        this.objectMapper = objectMapper;
        Path baseDataDir = Paths.get(properties.getDataDir()).toAbsolutePath().normalize();
        Path parentData = baseDataDir.getParent() != null && baseDataDir.getParent().getParent() != null
                ? baseDataDir.getParent().getParent().resolve(".data").normalize()
                : null;
        if (parentData != null && Files.exists(parentData)) {
            baseDataDir = parentData;
        }
        this.workbenchDir = baseDataDir.resolve("workbench");
        this.sessionsDir = workbenchDir.resolve("sessions");
        this.indexPath = workbenchDir.resolve("index.md");
        initDirs();
    }

    private void initDirs() {
        try {
            Files.createDirectories(sessionsDir);
        } catch (IOException e) {
            log.error("创建工作台目录失败", e);
        }
    }

    public synchronized WorkbenchIndex loadIndex() {
        try {
            if (Files.exists(indexPath)) {
                String raw = Files.readString(indexPath);
                String json = parseMarkdownJson(raw);
                return objectMapper.readValue(json, WorkbenchIndex.class);
            }
            Path legacyJson = workbenchDir.resolve("index.json");
            if (Files.exists(legacyJson)) {
                return objectMapper.readValue(Files.readString(legacyJson), WorkbenchIndex.class);
            }
        } catch (Exception e) {
            log.warn("读取工作台索引失败: {}", e.getMessage());
        }
        return new WorkbenchIndex();
    }

    public synchronized void saveIndex(WorkbenchIndex index) {
        try {
            Files.createDirectories(workbenchDir);
            String json = objectMapper.writerWithDefaultPrettyPrinter().writeValueAsString(index);
            String md = toMarkdown("工作台索引", json);
            atomicWrite(indexPath, md);
        } catch (Exception e) {
            log.error("保存工作台索引失败", e);
        }
    }

    public synchronized Object loadSessionState(String threadId) {
        try {
            Path sessionFile = sessionPath(threadId);
            if (Files.exists(sessionFile)) {
                String raw = Files.readString(sessionFile);
                String json = parseMarkdownJson(raw);
                return objectMapper.readValue(json, Object.class);
            }
        } catch (Exception e) {
            log.warn("读取会话状态失败 [{}]: {}", threadId, e.getMessage());
        }
        return null;
    }

    public synchronized void saveSessionState(String threadId, Object state) {
        try {
            Files.createDirectories(sessionsDir);
            String json = objectMapper.writerWithDefaultPrettyPrinter().writeValueAsString(state);
            String md = toMarkdown("会话状态", json);
            atomicWrite(sessionPath(threadId), md);
        } catch (Exception e) {
            log.error("保存会话状态失败 [{}]", threadId, e);
        }
    }

    public synchronized void deleteSessionState(String threadId) {
        try {
            Path sessionFile = sessionPath(threadId);
            Files.deleteIfExists(sessionFile);
        } catch (Exception e) {
            log.warn("删除会话状态失败 [{}]", threadId, e);
        }
    }

    private Path sessionPath(String threadId) {
        String safeId = threadId.replaceAll("[^a-zA-Z0-9_-]", "_");
        return sessionsDir.resolve(safeId + ".md");
    }

    private String toMarkdown(String title, String json) {
        return "# " + title + "\n\n```json\n" + json + "\n```\n";
    }

    private String parseMarkdownJson(String content) {
        String trimmed = content.trim();
        if (trimmed.startsWith("{") || trimmed.startsWith("[")) {
            return trimmed;
        }
        int codeBlockStart = trimmed.indexOf("```json");
        if (codeBlockStart >= 0) {
            int jsonStart = codeBlockStart + 7;
            int codeBlockEnd = trimmed.indexOf("```", jsonStart);
            if (codeBlockEnd > jsonStart) {
                return trimmed.substring(jsonStart, codeBlockEnd).trim();
            }
        }
        return "{}";
    }

    private void atomicWrite(Path target, String content) throws IOException {
        Path temp = target.resolveSibling(target.getFileName().toString() + "." + UUID.randomUUID() + ".tmp");
        Files.writeString(temp, content);
        Files.move(temp, target, java.nio.file.StandardCopyOption.REPLACE_EXISTING, java.nio.file.StandardCopyOption.ATOMIC_MOVE);
    }
}
