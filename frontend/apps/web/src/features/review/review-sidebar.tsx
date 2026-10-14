import { useState } from "react";
import { ReviewPanel } from "./review-panel.js";
import { EmptyTabView } from "./empty-tab-view.js";
import {
  GitPullRequestIcon,
  PlusIcon,
  XIcon,
  PanelRightCloseIcon,
  Maximize2Icon,
  Minimize2Icon,
} from "lucide-react";

interface TabItem {
  id: string;
  title: string;
  type: "review" | "empty";
}

interface ReviewSidebarProps {
  isOpen: boolean;
  onToggle: () => void;
  workspaceRoot: string | null;
}

export function ReviewSidebar({ isOpen, onToggle, workspaceRoot }: ReviewSidebarProps) {
  const [tabs, setTabs] = useState<TabItem[]>([
    { id: "review-1", title: "Review", type: "review" },
  ]);
  const [activeTabId, setActiveTabId] = useState<string>("review-1");
  const [isFullScreen, setIsFullScreen] = useState(false);
  const [width, setWidth] = useState(640);
  const [isResizing, setIsResizing] = useState(false);

  // 拖拽调节宽度
  const handleMouseDown = (e: React.MouseEvent) => {
    e.preventDefault();
    setIsResizing(true);
    const startX = e.clientX;
    const startWidth = width;

    const handleMouseMove = (moveEvent: MouseEvent) => {
      const deltaX = startX - moveEvent.clientX;
      const nextWidth = Math.max(380, Math.min(window.innerWidth - 300, startWidth + deltaX));
      setWidth(nextWidth);
    };

    const handleMouseUp = () => {
      setIsResizing(false);
      window.removeEventListener("mousemove", handleMouseMove);
      window.removeEventListener("mouseup", handleMouseUp);
    };

    window.addEventListener("mousemove", handleMouseMove);
    window.addEventListener("mouseup", handleMouseUp);
  };

  /** 新增空标签（显示欢迎检索页） */
  const handleAddTab = () => {
    const newId = `tab-${Date.now()}`;
    setTabs((prev) => [...prev, { id: newId, title: "New Tab", type: "empty" }]);
    setActiveTabId(newId);
  };

  /** 关闭标签 */
  const handleCloseTab = (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    setTabs((prev) => {
      const filtered = prev.filter((t) => t.id !== id);
      if (filtered.length === 0) {
        // 如果全关了，默认留一个 empty tab
        const emptyId = `empty-${Date.now()}`;
        setActiveTabId(emptyId);
        return [{ id: emptyId, title: "Search", type: "empty" }];
      }
      if (activeTabId === id) {
        const lastTab = filtered[filtered.length - 1];
        if (lastTab) {
          setActiveTabId(lastTab.id);
        }
      }
      return filtered;
    });
  };

  /** 在空 Tab 中点击打开 Review */
  const handleOpenReviewInCurrent = () => {
    setTabs((prev) =>
      prev.map((t) =>
        t.id === activeTabId ? { ...t, title: "Review", type: "review" } : t
      )
    );
  };

  if (!isOpen) {
    return null;
  }

  const activeTab = tabs.find((t) => t.id === activeTabId) || tabs[0];

  return (
    <aside
      style={{ width: isFullScreen ? "100%" : `${width}px` }}
      className={`relative flex flex-col h-full shrink-0 border-l border-zinc-800 bg-black shadow-2xl transition-all duration-150 ${
        isResizing ? "select-none" : ""
      }`}
    >
      {/* 左侧可拖拽调整尺寸的手柄 */}
      {!isFullScreen && (
        <div
          onMouseDown={handleMouseDown}
          className="absolute left-0 top-0 bottom-0 w-1.5 cursor-col-resize hover:bg-blue-500/50 active:bg-blue-500 transition-colors z-30"
          title="拖拽调节宽度"
        />
      )}

      {/* 顶部 Tab 栏（对应图 1 与图 2 顶部） */}
      <div className="flex h-10 shrink-0 items-center justify-between border-b border-zinc-800/90 bg-zinc-950 px-2 select-none">
        {/* 左侧标签页列表 */}
        <div className="flex items-center gap-1 overflow-x-auto min-w-0 pr-2">
          {tabs.map((tab) => {
            const isActive = tab.id === activeTabId;
            return (
              <div
                key={tab.id}
                onClick={() => setActiveTabId(tab.id)}
                className={`group flex items-center gap-1.5 rounded-t px-2.5 py-1.5 text-xs font-medium cursor-pointer transition-colors border-b-2 ${
                  isActive
                    ? "bg-zinc-900 text-white border-blue-500 shadow-sm"
                    : "text-zinc-400 border-transparent hover:bg-zinc-900/50 hover:text-zinc-200"
                }`}
              >
                <GitPullRequestIcon className="size-3.5 text-zinc-400 group-hover:text-zinc-200" />
                <span className="truncate max-w-[100px]">{tab.title}</span>
                <button
                  type="button"
                  onClick={(e) => handleCloseTab(tab.id, e)}
                  title="关闭标签"
                  className="rounded p-0.5 text-zinc-500 hover:bg-zinc-800 hover:text-zinc-200"
                >
                  <XIcon className="size-3" />
                </button>
              </div>
            );
          })}

          {/* 新增 Tab 按钮（对应图 2 中 Rev 标签右侧的 +） */}
          <button
            type="button"
            onClick={handleAddTab}
            title="新建标签页"
            className="rounded p-1 text-zinc-400 hover:bg-zinc-900 hover:text-zinc-200"
          >
            <PlusIcon className="size-3.5" />
          </button>
        </div>

        {/* 右上角操作按钮（对应用户截图图 1 和图 2 右上角：收起与全屏） */}
        <div className="flex items-center gap-1 shrink-0">
          <button
            type="button"
            onClick={() => setIsFullScreen(!isFullScreen)}
            title={isFullScreen ? "退出全屏" : "全屏显示"}
            className="rounded p-1 text-zinc-400 hover:bg-zinc-800 hover:text-zinc-200"
          >
            {isFullScreen ? (
              <Minimize2Icon className="size-3.5" />
            ) : (
              <Maximize2Icon className="size-3.5" />
            )}
          </button>

          <button
            type="button"
            onClick={onToggle}
            title="收起右侧边栏"
            className="rounded p-1 text-zinc-400 hover:bg-zinc-800 hover:text-zinc-200"
          >
            <PanelRightCloseIcon className="size-3.5" />
          </button>
        </div>
      </div>

      {/* 标签页内容呈现 */}
      <div className="flex flex-1 min-h-0 overflow-hidden">
        {activeTab?.type === "review" ? (
          <ReviewPanel workspaceRoot={workspaceRoot} />
        ) : (
          <EmptyTabView
            onOpenReview={handleOpenReviewInCurrent}
            onOpenFile={handleOpenReviewInCurrent}
          />
        )}
      </div>
    </aside>
  );
}
