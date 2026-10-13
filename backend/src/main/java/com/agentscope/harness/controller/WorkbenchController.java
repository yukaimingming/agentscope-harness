package com.agentscope.harness.controller;

import com.agentscope.harness.model.WorkbenchModels.WorkbenchIndex;
import com.agentscope.harness.service.WorkbenchService;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

import java.util.Map;

/**
 * 工作台索引与会话状态控制器。
 */
@RestController
@RequestMapping("/api/workbench")
@CrossOrigin
public class WorkbenchController {

    private final WorkbenchService workbenchService;

    public WorkbenchController(WorkbenchService workbenchService) {
        this.workbenchService = workbenchService;
    }

    @GetMapping
    public ResponseEntity<Map<String, Object>> getIndex() {
        return ResponseEntity.ok(Map.of("workbench", workbenchService.loadIndex()));
    }

    @PutMapping
    public ResponseEntity<Map<String, Object>> updateIndex(@RequestBody WorkbenchIndex index) {
        workbenchService.saveIndex(index);
        return ResponseEntity.ok(Map.of("ok", true));
    }

    @GetMapping("/sessions/{threadId}")
    public ResponseEntity<Object> getSessionState(@PathVariable String threadId) {
        Object state = workbenchService.loadSessionState(threadId);
        if (state == null) {
            return ResponseEntity.status(404).body(Map.of("error", "会话状态不存在"));
        }
        return ResponseEntity.ok(Map.of("state", state));
    }

    @PutMapping("/sessions/{threadId}")
    public ResponseEntity<Map<String, Object>> saveSessionState(
            @PathVariable String threadId,
            @RequestBody Object state) {
        workbenchService.saveSessionState(threadId, state);
        return ResponseEntity.ok(Map.of("ok", true));
    }

    @DeleteMapping("/sessions/{threadId}")
    public ResponseEntity<Map<String, Object>> deleteSessionState(@PathVariable String threadId) {
        workbenchService.deleteSessionState(threadId);
        return ResponseEntity.ok(Map.of("ok", true));
    }
}
