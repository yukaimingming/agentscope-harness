package com.agentscope.harness.service;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Service;

import java.io.BufferedReader;
import java.io.File;
import java.io.InputStreamReader;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.*;

/**
 * Git 操作与代码审查（Review）服务。
 */
@Service
public class GitService {

    private static final Logger log = LoggerFactory.getLogger(GitService.class);
    private final WorkspaceService workspaceService;

    public GitService(WorkspaceService workspaceService) {
        this.workspaceService = workspaceService;
    }

    /**
     * 解析当前有效的 Git 根目录。
     */
    public File getGitRoot(String customPath) {
        String base = (customPath != null && !customPath.isBlank())
                ? customPath
                : workspaceService.getCurrentWorkspaceRoot();

        File current = new File(base);
        while (current != null && current.exists()) {
            File gitDir = new File(current, ".git");
            if (gitDir.exists()) {
                return current;
            }
            current = current.getParentFile();
        }

        // 保底使用当前运行的工作区目录或工程根目录（向上回溯找到 .git 目录）
        File fallback = new File(System.getProperty("user.dir", "."));
        while (fallback != null && fallback.exists()) {
            if (new File(fallback, ".git").exists()) {
                return fallback;
            }
            fallback = fallback.getParentFile();
        }
        return new File(base);
    }

    /**
     * 获取 Git 状态汇总（包括未暂存变更、已暂存变更、当前分支名、最近 commits）。
     */
    public Map<String, Object> getStatus(String customPath) {
        File repo = getGitRoot(customPath);
        Map<String, Object> result = new LinkedHashMap<>();
        result.put("repoRoot", repo.getAbsolutePath());

        if (!new File(repo, ".git").exists()) {
            result.put("isGitRepo", false);
            result.put("changes", List.of());
            result.put("staged", List.of());
            result.put("branch", "none");
            result.put("commits", List.of());
            return result;
        }

        result.put("isGitRepo", true);

        // 1. 获取当前分支名
        String branch = executeCommand(repo, "git", "rev-parse", "--abbrev-ref", "HEAD").trim();
        result.put("branch", branch.isEmpty() ? "main" : branch);

        // 2. 解析文件变更 (git status --porcelain -u)
        String statusOutput = executeCommand(repo, "git", "status", "--porcelain", "-u");
        List<Map<String, Object>> changes = new ArrayList<>();
        List<Map<String, Object>> staged = new ArrayList<>();

        for (String line : statusOutput.split("\r?\n")) {
            if (line.length() < 4) continue;
            char indexStatus = line.charAt(0);
            char workTreeStatus = line.charAt(1);
            String rawPath = line.substring(3).trim();
            // 处理引号包裹路径
            if (rawPath.startsWith("\"") && rawPath.endsWith("\"")) {
                rawPath = rawPath.substring(1, rawPath.length() - 1);
            }

            File targetFile = new File(repo, rawPath);
            boolean isImage = isImageFile(rawPath);

            // 未追踪文件
            if (indexStatus == '?' && workTreeStatus == '?') {
                Map<String, Object> item = createFileItem(rawPath, "U", false, isImage, targetFile);
                changes.add(item);
                continue;
            }

            // 暂存区变更
            if (indexStatus != ' ' && indexStatus != '?') {
                Map<String, Object> item = createFileItem(rawPath, String.valueOf(indexStatus), true, isImage, targetFile);
                staged.add(item);
            }

            // 工作区未暂存变更
            if (workTreeStatus != ' ' && workTreeStatus != '?') {
                Map<String, Object> item = createFileItem(rawPath, String.valueOf(workTreeStatus), false, isImage, targetFile);
                changes.add(item);
            }
        }

        result.put("changes", changes);
        result.put("staged", staged);

        // 3. 获取最近 10 条 Commit 记录
        List<Map<String, String>> commits = getRecentCommits(repo, 10);
        result.put("commits", commits);

        return result;
    }

    /**
     * 获取单个文件的 Diff 内容或图片对比数据。
     */
    public Map<String, Object> getFileDiff(String customPath, String filePath, boolean isStaged, String commitHash) {
        File repo = getGitRoot(customPath);
        Map<String, Object> result = new LinkedHashMap<>();
        result.put("path", filePath);
        boolean isImage = isImageFile(filePath);
        result.put("isImage", isImage);

        File targetFile = new File(repo, filePath);

        if (isImage) {
            // 图片对比数据
            String afterBase64 = null;
            if (targetFile.exists()) {
                try {
                    byte[] bytes = Files.readAllBytes(targetFile.toPath());
                    afterBase64 = "data:" + getMimeType(filePath) + ";base64," + Base64.getEncoder().encodeToString(bytes);
                } catch (Exception e) {
                    log.warn("读取图片失败: {}", filePath, e);
                }
            }
            result.put("beforeImage", null);
            result.put("afterImage", afterBase64);
            result.put("diff", "");
            return result;
        }

        // 文本 Diff
        String diffText = "";
        if (commitHash != null && !commitHash.isBlank() && !"Uncommitted".equalsIgnoreCase(commitHash)) {
            // 查看指定 commit 的变更
            diffText = executeCommand(repo, "git", "show", commitHash + ":" + filePath);
        } else if (isStaged) {
            diffText = executeCommand(repo, "git", "diff", "--cached", "--", filePath);
            if (diffText.isBlank()) {
                diffText = executeCommand(repo, "git", "diff", "HEAD", "--", filePath);
            }
            if (diffText.isBlank() && targetFile.exists() && targetFile.isFile()) {
                diffText = buildNewFileDiff(filePath, targetFile);
            }
        } else {
            diffText = executeCommand(repo, "git", "diff", "--", filePath);
            if (diffText.isBlank()) {
                diffText = executeCommand(repo, "git", "diff", "HEAD", "--", filePath);
            }
            // 如果 git diff 为空但文件存在，可能是未追踪新文件，构造完整新增 diff
            if (diffText.isBlank() && targetFile.exists() && targetFile.isFile()) {
                diffText = buildNewFileDiff(filePath, targetFile);
            }
        }

        result.put("diff", diffText);
        return result;
    }

    /**
     * 执行 Git 提交。
     */
    public Map<String, Object> commit(String customPath, String message, List<String> filePaths) {
        File repo = getGitRoot(customPath);
        if (message == null || message.isBlank()) {
            throw new IllegalArgumentException("提交说明不能为空");
        }

        // 1. git add
        if (filePaths == null || filePaths.isEmpty()) {
            executeCommand(repo, "git", "add", "-A");
        } else {
            for (String file : filePaths) {
                executeCommand(repo, "git", "add", "--", file);
            }
        }

        // 2. git commit -m
        String commitOutput = executeCommand(repo, "git", "commit", "-m", message);
        String newHash = executeCommand(repo, "git", "rev-parse", "--short", "HEAD").trim();

        return Map.of(
                "ok", true,
                "commitHash", newHash,
                "message", message,
                "output", commitOutput
        );
    }

    /**
     * 获取最近 Commits。
     */
    public List<Map<String, String>> getRecentCommits(File repo, int limit) {
        List<Map<String, String>> list = new ArrayList<>();
        String output = executeCommand(repo, "git", "log", "-n", String.valueOf(limit), "--format=%h%x09%s%x09%cr");
        for (String line : output.split("\r?\n")) {
            if (line.isBlank()) continue;
            String[] parts = line.split("\t");
            if (parts.length >= 2) {
                list.add(Map.of(
                        "hash", parts[0],
                        "subject", parts[1],
                        "time", parts.length > 2 ? parts[2] : ""
                ));
            }
        }
        return list;
    }

    private Map<String, Object> createFileItem(String path, String status, boolean staged, boolean isImage, File file) {
        Map<String, Object> item = new LinkedHashMap<>();
        item.put("path", path);
        item.put("name", new File(path).getName());
        item.put("dir", new File(path).getParent() == null ? "" : new File(path).getParent().replace('\\', '/'));
        item.put("status", status); // M, U, D, A, etc.
        item.put("staged", staged);
        item.put("isImage", isImage);
        item.put("exists", file.exists());
        return item;
    }

    private boolean isImageFile(String path) {
        String lower = path.toLowerCase();
        return lower.endsWith(".png") || lower.endsWith(".jpg") || lower.endsWith(".jpeg")
                || lower.endsWith(".gif") || lower.endsWith(".svg") || lower.endsWith(".webp")
                || lower.endsWith(".ico");
    }

    private String getMimeType(String path) {
        String lower = path.toLowerCase();
        if (lower.endsWith(".png")) return "image/png";
        if (lower.endsWith(".jpg") || lower.endsWith(".jpeg")) return "image/jpeg";
        if (lower.endsWith(".svg")) return "image/svg+xml";
        if (lower.endsWith(".webp")) return "image/webp";
        if (lower.endsWith(".gif")) return "image/gif";
        return "image/png";
    }

    private String buildNewFileDiff(String filePath, File file) {
        try {
            List<String> lines = Files.readAllLines(file.toPath(), StandardCharsets.UTF_8);
            StringBuilder sb = new StringBuilder();
            sb.append("--- /dev/null\n");
            sb.append("+++ b/").append(filePath.replace('\\', '/')).append("\n");
            sb.append("@@ -0,0 +1,").append(lines.size()).append(" @@\n");
            for (String l : lines) {
                sb.append("+").append(l).append("\n");
            }
            return sb.toString();
        } catch (Exception e) {
            return "+++ 新文件 (二进制或特殊格式内容无法纯文本展示)";
        }
    }

    /**
     * 读取指定文件的纯文本内容。
     */
    public Map<String, Object> readFileContent(String customPath, String relativePath) {
        File repo = getGitRoot(customPath);
        File file = new File(relativePath).isAbsolute() ? new File(relativePath) : new File(repo, relativePath);
        if (!file.exists() || !file.isFile()) {
            return Map.of("ok", false, "error", "文件不存在: " + relativePath);
        }
        try {
            String content = Files.readString(file.toPath(), StandardCharsets.UTF_8);
            return Map.of(
                    "ok", true,
                    "path", relativePath,
                    "name", file.getName(),
                    "size", file.length(),
                    "content", content
            );
        } catch (Exception e) {
            return Map.of("ok", false, "error", "读取文件失败: " + e.getMessage());
        }
    }

    /**
     * 在当前工作区执行终端命令。
     */
    public Map<String, Object> executeTerminalCommand(String customPath, String command) {
        File repo = getGitRoot(customPath);
        if (command == null || command.isBlank()) {
            return Map.of("ok", false, "output", "", "exitCode", 0, "cwd", repo.getAbsolutePath());
        }

        try {
            boolean isWindows = System.getProperty("os.name", "").toLowerCase().contains("win");
            ProcessBuilder pb;
            if (isWindows) {
                pb = new ProcessBuilder("powershell.exe", "-NoProfile", "-Command", command);
            } else {
                pb = new ProcessBuilder("sh", "-c", command);
            }
            pb.directory(repo);
            pb.redirectErrorStream(true);
            Process process = pb.start();

            StringBuilder out = new StringBuilder();
            try (BufferedReader reader = new BufferedReader(new InputStreamReader(process.getInputStream(), StandardCharsets.UTF_8))) {
                String line;
                while ((line = reader.readLine()) != null) {
                    out.append(line).append("\n");
                }
            }
            int exitCode = process.waitFor();
            return Map.of(
                    "ok", exitCode == 0,
                    "output", out.toString(),
                    "exitCode", exitCode,
                    "cwd", repo.getAbsolutePath()
            );
        } catch (Exception e) {
            log.error("执行终端命令失败: {}", command, e);
            return Map.of(
                    "ok", false,
                    "output", "命令执行异常: " + e.getMessage(),
                    "exitCode", -1,
                    "cwd", repo.getAbsolutePath()
            );
        }
    }

    private String executeCommand(File dir, String... command) {
        try {
            ProcessBuilder pb = new ProcessBuilder(command);
            pb.directory(dir);
            pb.redirectErrorStream(true);
            Process process = pb.start();
            StringBuilder out = new StringBuilder();
            try (BufferedReader reader = new BufferedReader(new InputStreamReader(process.getInputStream(), StandardCharsets.UTF_8))) {
                String line;
                while ((line = reader.readLine()) != null) {
                    out.append(line).append("\n");
                }
            }
            process.waitFor();
            return out.toString().trim();
        } catch (Exception e) {
            log.error("执行 Git 命令失败: {}", Arrays.toString(command), e);
            return "";
        }
    }
}
