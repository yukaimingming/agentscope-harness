import { describe, it, expect } from "vitest";
import { renderToString } from "react-dom/server";
import { TodoCard } from "../src/features/chat/todo-card.js";
import type { Activity } from "@deepagent/shared";

describe("TodoCard 主题适配与渲染", () => {
  const mockTodoActivity: Activity = {
    id: "act-todo-1",
    kind: "tool",
    title: "write_todos",
    status: "completed",
    startedAt: 1000,
    endedAt: 2000,
    detail: {
      toolName: "write_todos",
      total: 3,
      completed: 2,
      in_progress: 1,
      items: [
        { content: "初始化工程依赖", status: "completed" },
        { content: "编写核心逻辑代码", status: "completed" },
        { content: "运行单元测试并校验", status: "in_progress" },
      ],
    },
  };

  it("正常渲染待办任务卡片触发条，支持黑白主题切换样式类", () => {
    const html = renderToString(
      <TodoCard activity={mockTodoActivity} isOpen={false} />
    );

    expect(html).toContain('data-testid="todo-queue-trigger"');
    expect(html).toContain("项待办任务");
    expect(html).toContain("已完成");
    // 包含黑白主题响应式样式类，无硬编码单色断层
    expect(html).toContain("dark:text-zinc-100");
    expect(html).toContain("text-zinc-800");
  });

  it("展开时正确渲染任务浮动面板，具备黑白主题背景与边框阴影配置", () => {
    const html = renderToString(
      <TodoCard activity={mockTodoActivity} isOpen={true} />
    );

    expect(html).toContain('data-testid="todo-queue-panel"');
    expect(html).toContain("todo-queue-panel");
    expect(html).toContain("初始化工程依赖");
    expect(html).toContain("运行单元测试并校验");
    // 适配浅色 bg-white / 深色 dark:bg-[#242427]
    expect(html).toContain("bg-white");
    expect(html).toContain("dark:bg-[#242427]");
  });
});
