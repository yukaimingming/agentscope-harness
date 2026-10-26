import { describe, it, expect } from "vitest";
import { renderToString } from "react-dom/server";
import { ReviewSidebar } from "../src/features/review/review-sidebar.js";
import { FileViewer } from "../src/features/review/file-viewer.js";
import { EmptyTabView } from "../src/features/review/empty-tab-view.js";

describe("ReviewSidebar 侧边栏与代码预览主题适配", () => {
  it("侧边栏关闭时不渲染", () => {
    const html = renderToString(
      <ReviewSidebar isOpen={false} onToggle={() => {}} workspaceRoot={null} />
    );
    expect(html).toBe("");
  });

  it("侧边栏打开时包含响应式黑白主题样式类，无硬编码黑底断层", () => {
    const html = renderToString(
      <ReviewSidebar isOpen={true} onToggle={() => {}} workspaceRoot="d:/Ai agent/agentscope-harness" />
    );
    expect(html).toContain("bg-white");
    expect(html).toContain("dark:bg-black");
    expect(html).toContain("border-zinc-200");
    expect(html).toContain("dark:border-zinc-800");
    expect(html).toContain("Search");
  });

  it("代码预览视图具备黑白主题容器与代码样式", () => {
    const html = renderToString(
      <FileViewer initialPath="README.md" workspaceRoot="d:/Ai agent/agentscope-harness" />
    );
    expect(html).toContain("bg-white");
    expect(html).toContain("dark:bg-black");
    expect(html).toContain("border-zinc-200");
    expect(html).toContain("dark:border-zinc-800");
    expect(html).toContain("打开");
  });

  it("欢迎检索面板具备黑白主题卡片与操作入口", () => {
    const html = renderToString(
      <EmptyTabView
        onOpenReview={() => {}}
        onOpenFile={() => {}}
        onOpenTerminal={() => {}}
        onOpenBrowser={() => {}}
      />
    );
    expect(html).toContain("Browser");
    expect(html).toContain("Review");
    expect(html).toContain("Open File");
    expect(html).toContain("Terminal");
    expect(html).toContain("bg-zinc-50");
    expect(html).toContain("dark:bg-black");
  });
});
