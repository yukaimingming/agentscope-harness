package com.agentscope.harness.model;

/**
 * AG-UI 协议事件类型及自定义事件名称定义。
 */
public final class AguiEventType {

    private AguiEventType() {}

    // AG-UI 标准事件类型
    public static final String RUN_STARTED = "RUN_STARTED";
    public static final String RUN_FINISHED = "RUN_FINISHED";
    public static final String RUN_ERROR = "RUN_ERROR";

    public static final String TEXT_MESSAGE_START = "TEXT_MESSAGE_START";
    public static final String TEXT_MESSAGE_CONTENT = "TEXT_MESSAGE_CONTENT";
    public static final String TEXT_MESSAGE_END = "TEXT_MESSAGE_END";

    public static final String REASONING_MESSAGE_START = "REASONING_MESSAGE_START";
    public static final String REASONING_MESSAGE_CONTENT = "REASONING_MESSAGE_CONTENT";
    public static final String REASONING_MESSAGE_END = "REASONING_MESSAGE_END";
    // 兼容别名
    public static final String REASONING_START = REASONING_MESSAGE_START;
    public static final String REASONING_CONTENT = REASONING_MESSAGE_CONTENT;
    public static final String REASONING_END = REASONING_MESSAGE_END;

    public static final String CUSTOM = "CUSTOM";

    // 自定义扩展事件名称（与前端 @deepagent/shared 一致）
    public static final String CUSTOM_ACTIVITY = "deepagent:activity";
    public static final String CUSTOM_RUN_SNAPSHOT = "deepagent:run-snapshot";
    public static final String CUSTOM_PROCESS_MESSAGE = "deepagent:process-message";
    public static final String CUSTOM_NOTICE = "deepagent:notice";
}
