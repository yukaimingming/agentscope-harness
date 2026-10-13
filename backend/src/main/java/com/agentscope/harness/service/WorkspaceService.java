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
        try {
            Files.createDirectories(p);
        } catch (IOException e) {
            log.warn("创建工作区目录失败: {}", e.getMessage());
        }
        this.currentWorkspaceRoot = p.toString();
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

    public List<Map<String, Object>> browseDirectory(String targetPath) {
        Path p = (targetPath != null && !targetPath.isBlank())
                ? Paths.get(targetPath).toAbsolutePath().normalize()
                : Paths.get(currentWorkspaceRoot);

        List<Map<String, Object>> list = new ArrayList<>();
        try (DirectoryStream<Path> stream = Files.newDirectoryStream(p)) {
            for (Path entry : stream) {
                Map<String, Object> item = new HashMap<>();
                item.put("name", entry.getFileName().toString());
                item.put("path", entry.toAbsolutePath().toString());
                item.put("isDirectory", Files.isDirectory(entry));
                list.add(item);
            }
        } catch (Exception ignored) {
        }
        return list;
    }

    public void mkdir(String parentDir, String dirName) throws IOException {
        Path parent = (parentDir != null && !parentDir.isBlank())
                ? Paths.get(parentDir).toAbsolutePath().normalize()
                : Paths.get(currentWorkspaceRoot);
        Path target = parent.resolve(dirName);
        Files.createDirectories(target);
    }
}
