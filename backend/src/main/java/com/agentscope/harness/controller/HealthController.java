package com.agentscope.harness.controller;

import com.agentscope.harness.config.AgentscopeProperties;
import com.agentscope.harness.service.ProviderService;
import com.agentscope.harness.service.WorkspaceService;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.CrossOrigin;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RestController;

import java.time.Instant;
import java.util.Map;

/**
 * 服务健康检查控制器。
 */
@RestController
@CrossOrigin
public class HealthController {

    private final AgentscopeProperties properties;
    private final WorkspaceService workspaceService;
    private final ProviderService providerService;
    private final Instant startedAt = Instant.now();

    public HealthController(AgentscopeProperties properties,
                            WorkspaceService workspaceService,
                            ProviderService providerService) {
        this.properties = properties;
        this.workspaceService = workspaceService;
        this.providerService = providerService;
    }

    @GetMapping("/api/health")
    public ResponseEntity<Map<String, Object>> health() {
        return ResponseEntity.ok(Map.of(
                "status", "ok",
                "framework", "AgentScope Harness 2.0.3 (Spring Boot 3)",
                "startedAt", startedAt.toString(),
                "workspaceRoot", workspaceService.getCurrentWorkspaceRoot(),
                "defaultModel", properties.getDefaultModel(),
                "providersCount", providerService.list().size()
        ));
    }
}
