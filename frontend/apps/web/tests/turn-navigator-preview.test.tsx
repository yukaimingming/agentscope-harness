import { describe, it, expect } from "vitest";
import { renderToString } from "react-dom/server";
import { ConversationTurnNavigator, type ConversationTurn } from "../src/features/chat/conversation-turn-navigator.js";

describe("ConversationTurnNavigator 悬停内容预览测试", () => {
  const mockTurns: ConversationTurn[] = [
    {
      id: "turn-1",
      time: "10:12",
      dateTime: "2026年10月28日 10:12",
      prompt: "帮我把代码提交一下，不要改东西",
      replyPreview: "已为您完成代码提交与推送，严格遵循要求未做任何代码改动： 提交详情 提交 Commit: 0059aef 提交信息: feat: 优化工作区选择器发出对话后隐...",
    },
    {
      id: "turn-2",
      time: "10:15",
      dateTime: "2026年10月28日 10:15",
      prompt: "把前后端服务运行起来",
      replyPreview: "前后端服务已全部启动成功，Spring Boot 运行在 8787，Vite 运行在 5174。",
    },
  ];

  it("正常渲染上下文导航条与刻度横条", () => {
    const html = renderToString(<ConversationTurnNavigator turns={mockTurns} />);
    expect(html).toContain('data-testid="conversation-turn-navigator"');
    expect(html).toContain('data-testid="turn-nav-item-0"');
    expect(html).toContain('data-testid="turn-nav-item-1"');
    expect(html).toContain("第 1 回合：帮我把代码提交一下，不要改东西");
    expect(html).toContain("第 2 回合：把前后端服务运行起来");
  });

  it("当 turns 为空时不渲染", () => {
    const html = renderToString(<ConversationTurnNavigator turns={[]} />);
    expect(html).toBe("");
  });
});
