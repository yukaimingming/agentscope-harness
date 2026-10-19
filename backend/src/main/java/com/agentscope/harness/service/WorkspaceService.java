package com.agentscope.harness.service;

import com.agentscope.harness.config.AgentscopeProperties;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Service;

import java.io.File;
import java.io.IOException;
import java.nio.file.*;
import java.util.*;
import java.util.stream.Stream;

/**
 * 工作区文件系统与目录树服务。
 */
@Service
public class WorkspaceService {

    private static final Logger log = LoggerFactory.getLogger(WorkspaceService.class);

    private final AgentscopeProperties properties;
    private String currentWorkspaceRoot;

    public WorkspaceService(AgentscopeProperties properties) {
        this.properties = properties;
        Path p = Paths.get(properties.getWorkspace()).toAbsolutePath().normalize();
        // 如果当前目录在 backend 下且父目录存在 .agentscope/workspace，自动使用父目录路径
        Path parentWorkspace = p.getParent() != null && p.getParent().getParent() != null
                ? p.getParent().getParent().resolve(".agentscope").resolve("workspace").normalize()
                : null;
        if (parentWorkspace != null && Files.exists(parentWorkspace)) {
            p = parentWorkspace;
        }
        try {
            Files.createDirectories(p);
        } catch (IOException e) {
            log.warn("创建工作区目录失败: {}", e.getMessage());
        }
        this.currentWorkspaceRoot = p.toString();
        log.info("AgentScope 工作区已绑定至: {}", this.currentWorkspaceRoot);
    }

    public synchronized String getCurrentWorkspaceRoot() {
        return currentWorkspaceRoot;
    }

    public synchronized void setCurrentWorkspaceRoot(String newRoot) {
        Path p = Paths.get(newRoot).toAbsolutePath().normalize();
        try {
            Files.createDirectories(p);
            this.currentWorkspaceRoot = p.toString();
        } catch (IOException e) {
            throw new RuntimeException("无法访问或创建指定工作区：" + e.getMessage(), e);
        }
    }

    public static class TreeNode {
        private String name;
        private String path;
        private String type; // directory, file
        private List<TreeNode> children = new ArrayList<>();

        public TreeNode() {}

        public TreeNode(String name, String path, String type) {
            this.name = name;
            this.path = path;
            this.type = type;
        }

        public String getName() {
            return name;
        }

        public void setName(String name) {
            this.name = name;
        }

        public String getPath() {
            return path;
        }

        public void setPath(String path) {
            this.path = path;
        }

        public String getType() {
            return type;
        }

        public void setType(String type) {
            this.type = type;
        }

        public List<TreeNode> getChildren() {
            return children;
        }

        public void setChildren(List<TreeNode> children) {
            this.children = children;
        }
    }

    /**
     * 构建工作区目录树。
     */
    public List<TreeNode> getWorkspaceTree(String targetRoot, int maxDepth) {
        Path root = (targetRoot != null && !targetRoot.isBlank())
                ? Paths.get(targetRoot).toAbsolutePath().normalize()
                : Paths.get(currentWorkspaceRoot);

        TreeNode rootNode = new TreeNode(
                root.getFileName() != null ? root.getFileName().toString() : root.toString(),
                root.toString(),
                "directory"
        );
        populateTree(root, rootNode, 1, maxDepth);
        return List.of(rootNode);
    }

    private void populateTree(Path current, TreeNode parent, int depth, int maxDepth) {
        if (depth > maxDepth) return;
        try (DirectoryStream<Path> stream = Files.newDirectoryStream(current)) {
            List<Path> entries = new ArrayList<>();
            for (Path p : stream) {
                String name = p.getFileName().toString();
                if (name.startsWith(".") && !name.equals(".agentscope")) continue;
                if (name.equals("node_modules") || name.equals("target") || name.equals("dist")) continue;
                entries.add(p);
            }
            // 目录在前，文件在后排序
            entries.sort((a, b) -> {
                boolean aDir = Files.isDirectory(a);
                boolean bDir = Files.isDirectory(b);
                if (aDir != bDir) return aDir ? -1 : 1;
                return a.getFileName().compareTo(b.getFileName());
            });

            for (Path p : entries) {
                boolean isDir = Files.isDirectory(p);
                TreeNode child = new TreeNode(
                        p.getFileName().toString(),
                        p.toAbsolutePath().toString(),
                        isDir ? "directory" : "file"
                );
                parent.getChildren().add(child);
                if (isDir) {
                    populateTree(p, child, depth + 1, maxDepth);
                }
            }
        } catch (Exception ignored) {
        }
    }

    /**
     * 浏览指定目录，返回当前路径、父级路径、子文件夹列表及系统常用快捷路径（含盘符与桌面）。
     */
    public Map<String, Object> browse(String targetPath) {
        Path p = (targetPath != null && !targetPath.isBlank())
                ? Paths.get(targetPath).toAbsolutePath().normalize()
                : Paths.get(currentWorkspaceRoot);

        // 若路径不存在，回退到当前工作区或用户目录
        if (!Files.exists(p) || !Files.isDirectory(p)) {
            p = Paths.get(currentWorkspaceRoot);
            if (!Files.exists(p)) {
                p = Paths.get(System.getProperty("user.home"));
            }
        }

        String current = p.toString();
        String parent = p.getParent() != null ? p.getParent().toString() : null;

        List<Map<String, Object>> folders = new ArrayList<>();
        List<Map<String, Object>> entries = new ArrayList<>();

        try (DirectoryStream<Path> stream = Files.newDirectoryStream(p)) {
            for (Path entry : stream) {
                try {
                    String name = entry.getFileName() != null ? entry.getFileName().toString() : entry.toString();
                    // 过滤隐藏文件与系统临时垃圾缓存目录（保留普通文件夹）
                    if (name.startsWith("$") || name.equalsIgnoreCase("System Volume Information")) {
                        continue;
                    }
                    boolean isDir = Files.isDirectory(entry);
                    String absPath = entry.toAbsolutePath().normalize().toString();

                    Map<String, Object> item = new HashMap<>();
                    item.put("name", name);
                    item.put("path", absPath);
                    item.put("isDirectory", isDir);
                    entries.add(item);

                    if (isDir) {
                        Map<String, Object> folderItem = new HashMap<>();
                        folderItem.put("name", name);
                        folderItem.put("path", absPath);
                        folders.add(folderItem);
                    }
                } catch (Exception ignored) {
                }
            }
        } catch (Exception e) {
            log.warn("读取目录列表失败 [{}]: {}", current, e.getMessage());
        }

        // 文件夹按名称升序排序
        folders.sort(Comparator.comparing(a -> String.valueOf(a.get("name")).toLowerCase()));
        entries.sort((a, b) -> {
            boolean aDir = Boolean.TRUE.equals(a.get("isDirectory"));
            boolean bDir = Boolean.TRUE.equals(b.get("isDirectory"));
            if (aDir != bDir) return aDir ? -1 : 1;
            return String.valueOf(a.get("name")).compareToIgnoreCase(String.valueOf(b.get("name")));
        });

        // 生成系统常用快速入口（盘符、桌面、项目根、默认工作区）
        List<Map<String, String>> quickPaths = getSystemQuickPaths();

        Map<String, Object> result = new HashMap<>();
        result.put("ok", true);
        result.put("current", current);
        result.put("currentPath", current); // 兼容旧接口
        result.put("parent", parent);
        result.put("folders", folders);
        result.put("entries", entries);     // 兼容旧接口
        result.put("quickPaths", quickPaths);
        return result;
    }

    /**
     * 获取系统预置的常用路径列表（默认工作区、桌面、主目录及各磁盘盘符）。
     */
    public List<Map<String, String>> getSystemQuickPaths() {
        List<Map<String, String>> quick = new ArrayList<>();

        // 1. 默认工作区
        if (currentWorkspaceRoot != null && !currentWorkspaceRoot.isBlank()) {
            quick.add(Map.of("name", "默认工作区", "path", currentWorkspaceRoot));
        }

        // 2. 项目工程根目录（若存在）
        try {
            Path projectRoot = Paths.get("").toAbsolutePath().normalize();
            if (projectRoot.getParent() != null && "backend".equalsIgnoreCase(projectRoot.getFileName().toString())) {
                projectRoot = projectRoot.getParent();
            }
            if (Files.exists(projectRoot)) {
                quick.add(Map.of("name", "项目目录", "path", projectRoot.toString()));
            }
        } catch (Exception ignored) {
        }

        // 3. 用户主目录与桌面
        String userHome = System.getProperty("user.home");
        if (userHome != null) {
            Path homePath = Paths.get(userHome);
            Path desktopPath = homePath.resolve("Desktop");
            if (Files.exists(desktopPath)) {
                quick.add(Map.of("name", "桌面", "path", desktopPath.toString()));
            }
            if (Files.exists(homePath)) {
                quick.add(Map.of("name", "用户目录", "path", homePath.toString()));
            }
        }

        // 4. Windows 磁盘盘符（C:、D:等）
        File[] roots = File.listRoots();
        if (roots != null) {
            for (File root : roots) {
                String rootPath = root.getAbsolutePath();
                String displayName = rootPath.replace("\\", "");
                quick.add(Map.of("name", displayName + " 盘", "path", rootPath));
            }
        }

        return quick;
    }

    public List<Map<String, Object>> browseDirectory(String targetPath) {
        Map<String, Object> res = browse(targetPath);
        @SuppressWarnings("unchecked")
        List<Map<String, Object>> entries = (List<Map<String, Object>>) res.get("entries");
        return entries != null ? entries : Collections.emptyList();
    }

    public String mkdir(String parentDir, String dirName) throws IOException {
        Path parent = (parentDir != null && !parentDir.isBlank())
                ? Paths.get(parentDir).toAbsolutePath().normalize()
                : Paths.get(currentWorkspaceRoot);
        Path target = parent.resolve(dirName).normalize();
        Files.createDirectories(target);
        return target.toString();
    }
}
