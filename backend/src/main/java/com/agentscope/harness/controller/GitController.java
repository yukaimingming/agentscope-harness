package com.agentscope.harness.controller;

import com.agentscope.harness.service.GitService;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

import java.util.List;
import java.util.Map;

/**
 * Git 操作与代码审查（Review）接口控制器。
 */
@RestController
@RequestMapping("/api/git")
@CrossOrigin
public class GitController {

    private final GitService gitService;

    public GitController(GitService gitService) {
        this.gitService = gitService;
    }

    /**
     * 获取 Git 状态与变更文件列表。
     */
    @GetMapping("/status")
    public ResponseEntity<Map<String, Object>> getStatus(@RequestParam(required = false) String root) {
        try {
            return ResponseEntity.ok(gitService.getStatus(root));
        } catch (Exception e) {
            return ResponseEntity.status(500).body(Map.of("error", e.getMessage()));
        }
    }

    /**
     * 获取单个文件的 Diff 或图片对比。
     */
    @GetMapping("/diff")
    public ResponseEntity<Map<String, Object>> getDiff(
            @RequestParam String path,
            @RequestParam(required = false) String root,
            @RequestParam(defaultValue = "false") boolean staged,
            @RequestParam(required = false) String commit) {
        try {
            return ResponseEntity.ok(gitService.getFileDiff(root, path, staged, commit));
        } catch (Exception e) {
            return ResponseEntity.status(500).body(Map.of("error", e.getMessage()));
        }
    }

    /**
     * 提交选中的或全部变更。
     */
    @PostMapping("/commit")
    public ResponseEntity<Map<String, Object>> commit(@RequestBody Map<String, Object> body) {
        String message = (String) body.get("message");
        String root = (String) body.get("root");
        @SuppressWarnings("unchecked")
        List<String> files = (List<String>) body.get("files");
        try {
            return ResponseEntity.ok(gitService.commit(root, message, files));
        } catch (Exception e) {
            return ResponseEntity.status(400).body(Map.of("error", e.getMessage()));
        }
    }
}
