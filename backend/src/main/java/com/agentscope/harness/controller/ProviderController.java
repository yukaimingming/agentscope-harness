package com.agentscope.harness.controller;

import com.agentscope.harness.model.ProviderModels;
import com.agentscope.harness.model.ProviderModels.*;
import com.agentscope.harness.service.ProviderService;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

import java.util.List;
import java.util.Map;

/**
 * 大模型提供商管理控制器。
 */
@RestController
@RequestMapping("/api/providers")
@CrossOrigin
public class ProviderController {

    private final ProviderService providerService;

    public ProviderController(ProviderService providerService) {
        this.providerService = providerService;
    }

    @GetMapping
    public ResponseEntity<Map<String, Object>> listProviders() {
        List<PublicProvider> list = providerService.list().stream()
                .map(ProviderModels::toPublic)
                .toList();
        return ResponseEntity.ok(Map.of("providers", list));
    }

    @PostMapping
    public ResponseEntity<Map<String, Object>> createProvider(@RequestBody ProviderInput input) {
        ProviderConfig created = providerService.create(input);
        return ResponseEntity.status(201).body(Map.of("provider", ProviderModels.toPublic(created)));
    }

    @PutMapping("/{id}")
    public ResponseEntity<Map<String, Object>> updateProvider(
            @PathVariable String id,
            @RequestBody ProviderInput input) {
        ProviderConfig updated = providerService.update(id, input);
        if (updated == null) {
            return ResponseEntity.status(404).body(Map.of("error", "提供商不存在"));
        }
        return ResponseEntity.ok(Map.of("provider", ProviderModels.toPublic(updated)));
    }

    @DeleteMapping("/{id}")
    public ResponseEntity<Map<String, Object>> deleteProvider(@PathVariable String id) {
        boolean removed = providerService.remove(id);
        if (!removed) {
            return ResponseEntity.status(404).body(Map.of("error", "提供商不存在"));
        }
        return ResponseEntity.ok(Map.of("ok", true));
    }

    @PostMapping("/{id}/models")
    public ResponseEntity<Map<String, Object>> fetchModels(@PathVariable String id) {
        ProviderConfig provider = providerService.get(id);
        if (provider == null) {
            return ResponseEntity.status(404).body(Map.of("error", "提供商不存在"));
        }
        return ResponseEntity.ok(providerService.fetchModels(provider));
    }

    @PostMapping("/{id}/test")
    public ResponseEntity<Map<String, Object>> testModel(
            @PathVariable String id,
            @RequestBody(required = false) Map<String, String> body) {
        ProviderConfig provider = providerService.get(id);
        if (provider == null) {
            return ResponseEntity.status(404).body(Map.of("error", "提供商不存在"));
        }
        String modelId = body != null && body.containsKey("modelId")
                ? body.get("modelId")
                : provider.getDefaultModel();
        return ResponseEntity.ok(providerService.testModel(provider, modelId));
    }
}
