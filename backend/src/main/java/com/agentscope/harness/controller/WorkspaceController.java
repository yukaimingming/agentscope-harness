package com.agentscope.harness.controller;

import com.agentscope.harness.service.WorkspaceService;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

import java.io.File;
import java.util.List;
import java.util.Map;

/**
 * 工作区操作接口控制器。
 */
@RestController
@RequestMapping("/api/workspace")
@CrossOrigin
public class WorkspaceController {

    private final WorkspaceService workspaceService;

    public WorkspaceController(WorkspaceService workspaceService) {
        this.workspaceService = workspaceService;
    }

    @GetMapping("/tree")
    public ResponseEntity<Map<String, Object>> getTree(
            @RequestParam(required = false) String root,
            @RequestParam(defaultValue = "3") int depth) {
        String target = (root != null && !root.isBlank()) ? root : workspaceService.getCurrentWorkspaceRoot();
        try {
            var nodes = workspaceService.getWorkspaceTree(target, depth);
            return ResponseEntity.ok(Map.of("ok", true, "root", target, "nodes", nodes));
        } catch (Exception e) {
            return ResponseEntity.ok(Map.of(
                    "ok", false,
                    "root", target,
                    "nodes", List.of(Map.of("name", new File(target).getName(), "path", target, "type", "directory")),
                    "message", e.getMessage()
            ));
        }
    }

    @PostMapping("/select")
    public ResponseEntity<Map<String, Object>> selectWorkspace(@RequestBody Map<String, String> body) {
        String path = body.get("path");
        if (path == null || path.isBlank()) {
            return ResponseEntity.badRequest().body(Map.of("error", "缺少文件夹路径"));
        }
        try {
            workspaceService.setCurrentWorkspaceRoot(path);
            var tree = workspaceService.getWorkspaceTree(path, 3);
            return ResponseEntity.ok(Map.of("ok", true, "root", path, "nodes", tree));
        } catch (Exception e) {
            return ResponseEntity.status(500).body(Map.of("error", "无法访问该文件夹: " + e.getMessage()));
        }
    }

    @PostMapping("/mkdir")
    public ResponseEntity<Map<String, Object>> createDir(@RequestBody Map<String, String> body) {
        String parentDir = body.get("parentDir");
        String dirName = body.get("dirName");
        if (dirName == null || dirName.isBlank()) {
            return ResponseEntity.badRequest().body(Map.of("error", "缺少文件夹名称"));
        }
        try {
            workspaceService.mkdir(parentDir, dirName);
            var tree = workspaceService.getWorkspaceTree(workspaceService.getCurrentWorkspaceRoot(), 3);
            return ResponseEntity.ok(Map.of("ok", true, "nodes", tree));
        } catch (Exception e) {
            return ResponseEntity.status(500).body(Map.of("error", "创建文件夹失败: " + e.getMessage()));
        }
    }

    @GetMapping("/browse")
    public ResponseEntity<Map<String, Object>> browse(@RequestParam(required = false) String path) {
        String target = (path != null && !path.isBlank()) ? path : workspaceService.getCurrentWorkspaceRoot();
        var entries = workspaceService.browseDirectory(target);
        return ResponseEntity.ok(Map.of(
                "ok", true,
                "currentPath", target,
                "entries", entries
        ));
    }
}
