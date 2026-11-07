package com.agentscope.harness.controller;

import com.agentscope.harness.service.SettingsService;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

import java.util.Map;

/**
 * 系统设置控制器：设置面板「电脑」页 Computer Use 开关的查询与切换。
 */
@RestController
@RequestMapping("/api/settings")
@CrossOrigin
public class SettingsController {

    private final SettingsService settingsService;

    public SettingsController(SettingsService settingsService) {
        this.settingsService = settingsService;
    }

    @GetMapping("/computer-use")
    public ResponseEntity<Map<String, Object>> getComputerUse() {
        return ResponseEntity.ok(Map.of("enabled", settingsService.isComputerUseEnabled()));
    }

    @PutMapping("/computer-use")
    public ResponseEntity<Map<String, Object>> updateComputerUse(
            @RequestBody Map<String, Object> body) {
        Object value = body.get("enabled");
        if (!(value instanceof Boolean enabled)) {
            return ResponseEntity.badRequest().body(Map.of("error", "enabled 必须为布尔值"));
        }
        settingsService.setComputerUseEnabled(enabled);
        return ResponseEntity.ok(Map.of("ok", true, "enabled", enabled));
    }
}
