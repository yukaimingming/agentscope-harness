import { useState } from "react";
import { GitPullRequestIcon, FileCodeIcon, TerminalIcon, SearchIcon, SparklesIcon } from "lucide-react";

interface EmptyTabViewProps {
  onOpenReview: () => void;
  onOpenFile?: () => void;
  onOpenTerminal?: () => void;
}

/**
 * 对应图 1：当没有激活的标签页或新建 Tab 时显示的检索与快捷入口视图。
 */
export function EmptyTabView({
  onOpenReview,
  onOpenFile,
  onOpenTerminal,
}: EmptyTabViewProps) {
  const [searchTerm, setSearchTerm] = useState("");

  const actions = [
    {
      id: "review",
      icon: GitPullRequestIcon,
      label: "Review",
      desc: "查看 Git 代码变更、Diff 对比与提交",
      onClick: onOpenReview,
    },
    {
      id: "file",
      icon: FileCodeIcon,
      label: "Open File",
      desc: "快速定位并浏览工作区文件",
      onClick: onOpenFile || onOpenReview,
    },
    {
      id: "terminal",
      icon: TerminalIcon,
      label: "Terminal",
      desc: "启动交互式控制台终端",
      onClick: onOpenTerminal,
    },
  ];

  const filteredActions = actions.filter((act) =>
    act.label.toLowerCase().includes(searchTerm.toLowerCase()) ||
    act.desc.toLowerCase().includes(searchTerm.toLowerCase())
  );

  return (
    <div className="flex flex-1 flex-col items-center justify-center p-6 bg-black text-zinc-300 select-none">
      <div className="w-full max-w-md space-y-4">
        {/* 顶部搜索框 */}
        <div className="relative w-full">
          <SearchIcon className="absolute left-3.5 top-1/2 -translate-y-1/2 size-4 text-zinc-500" />
          <input
            type="text"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            placeholder="Search tabs, files, plugins, subagents, artifacts, tasks..."
            className="w-full rounded-lg border border-zinc-800 bg-zinc-950/80 px-10 py-2.5 text-xs text-zinc-200 placeholder-zinc-500 shadow-inner outline-none transition-colors focus:border-zinc-700 focus:bg-zinc-900"
            autoFocus
          />
          <span className="absolute right-3 top-1/2 -translate-y-1/2 rounded border border-zinc-800 bg-zinc-900 px-1.5 py-0.5 text-[10px] text-zinc-500">
            Esc
          </span>
        </div>

        {/* 快捷操作选项列表 */}
        <div className="rounded-lg border border-zinc-800/80 bg-zinc-950/60 p-1.5 shadow-xl backdrop-blur">
          {filteredActions.map((action) => {
            const Icon = action.icon;
            return (
              <button
                key={action.id}
                type="button"
                onClick={action.onClick}
                className="group flex w-full items-center gap-3 rounded-md px-3 py-2.5 text-left transition-colors hover:bg-zinc-800/60 hover:text-white"
              >
                <div className="flex size-7 shrink-0 items-center justify-center rounded border border-zinc-800 bg-zinc-900/90 text-zinc-400 group-hover:border-zinc-700 group-hover:text-zinc-200">
                  <Icon className="size-4" />
                </div>
                <div className="flex min-w-0 flex-1 flex-col">
                  <div className="flex items-center gap-1.5">
                    <span className="text-xs font-medium text-zinc-200 group-hover:text-white">
                      {action.label}
                    </span>
                  </div>
                  <span className="truncate text-[11px] text-zinc-500 group-hover:text-zinc-400">
                    {action.desc}
                  </span>
                </div>
              </button>
            );
          })}

          {filteredActions.length === 0 && (
            <div className="py-6 text-center text-xs text-zinc-500">
              未匹配到任何结果
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
