package com.agentscope.harness;

import org.springframework.boot.SpringApplication;
import org.springframework.boot.autoconfigure.SpringBootApplication;
import org.springframework.boot.context.properties.EnableConfigurationProperties;
import com.agentscope.harness.config.AgentscopeProperties;

/**
 * AgentScope Harness Spring Boot 启动类。
 * 封装了 AgentScope Java v2 HarnessAgent 框架，并通过 AG-UI 协议为现代前端 UI 提供流式交互。
 */
@SpringBootApplication
@EnableConfigurationProperties(AgentscopeProperties.class)
public class AgentScopeApplication {

    public static void main(String[] args) {
        // 设置 JDK HTTP 客户端连接保活回收时间，避免外部连接长期僵死
        System.setProperty("jdk.httpclient.keepalive.timeout", "10");
        SpringApplication.run(AgentScopeApplication.class, args);
    }
}
