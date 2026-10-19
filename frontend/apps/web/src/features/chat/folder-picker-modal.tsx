/**
 * 文件夹选择与新建工作区弹窗。
 *
 * 优化特性：
 * 1. 默认路径与多种系统常用路径（默认工作区、项目目录、桌面、C盘/D盘驱动器）快速切换；
 * 2. 文件夹浏览、双击穿透、返回上一级、路径输入快速跳转；
 * 3. 增强的新建工作区文件夹交互：直观的输入与一键创建，创建后自动高亮选中并可立即确定；
 * 4. 容错保障：输入未创建路径时自动创建并绑定，前后端字段全兼容；
 * 5. 纯黑磨砂玻璃极简风格，与 AI Elements 整体调性一致。
 */

import { useCallback, useEffect, useState } from "react";
import {
  FolderIcon,
  FolderPlusIcon,
  ChevronRightIcon,
  ArrowUpIcon,
  RefreshCwIcon,
  HardDriveIcon,
  CheckIcon,
  SparklesIcon,
} from "lucide-react";
import { Modal } from "../../components/modal.js";

interface FolderItem {
  name: string;
  path: string;
}

interface QuickPath {
  name: string;
  path: string;
}

interface BrowseResult {
  ok: boolean;
  current?: string;
  currentPath?: string;
  parent?: string | null;
  folders?: FolderItem[];
  entries?: Array<{ name: string; path: string; isDirectory: boolean }>;
  quickPaths?: QuickPath[];
  error?: string;
}

interface FolderPickerModalProps {
  open: boolean;
  onClose: () => void;
  onSelect: (selectedPath: string) => void;
  initialPath?: string;
}

/** 默认兜底快捷路径（防止后端未就绪时依然可用） */
const FALLBACK_QUICK_PATHS: QuickPath[] = [
  { name: "默认工作区", path: "D:\\temp\\agentscope-harness\\.agentscope\\workspace" },
  { name: "项目目录", path: "D:\\temp\\agentscope-harness" },
  { name: "桌面", path: "C:\\Users\\kaiming yu\\Desktop" },
  { name: "C 盘", path: "C:\\" },
  { name: "D 盘", path: "D:\\" },
];

export function FolderPickerModal({
  open,
  onClose,
  onSelect,
  initialPath,
}: FolderPickerModalProps) {
  const [currentPath, setCurrentPath] = useState(initialPath || "");
  const [parentPath, setParentPath] = useState<string | null>(null);
  const [folders, setFolders] = useState<FolderItem[]>([]);
  const [quickPaths, setQuickPaths] = useState<QuickPath[]>(FALLBACK_QUICK_PATHS);
  const [selectedFolder, setSelectedFolder] = useState<string>("");
  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);

  // 新建子文件夹输入状态
  const [isCreatingDir, setIsCreatingDir] = useState(false);
  const [newDirName, setNewDirName] = useState("");

  // 加载目录数据
  const loadDirectory = useCallback(async (path?: string) => {
    setLoading(true);
    setErrorMsg(null);
    setSuccessMsg(null);
    try {
      const url = new URL("http://127.0.0.1:8787/api/workspace/browse");
      if (path && path.trim()) {
        url.searchParams.set("path", path.trim());
      }
      const res = await fetch(url.toString());
      const data = (await res.json()) as BrowseResult;
      if (data.ok) {
        const actualCurrent = data.current || data.currentPath || path || "";
        setCurrentPath(actualCurrent);
        setSelectedFolder(actualCurrent);
        setParentPath(data.parent !== undefined ? data.parent : null);

        // 兼容 folders 与 entries
        let parsedFolders: FolderItem[] = [];
        if (Array.isArray(data.folders) && data.folders.length > 0) {
          parsedFolders = data.folders;
        } else if (Array.isArray(data.entries)) {
          parsedFolders = data.entries
            .filter((e) => e.isDirectory)
            .map((e) => ({ name: e.name, path: e.path }));
        }
        setFolders(parsedFolders);

        if (Array.isArray(data.quickPaths) && data.quickPaths.length > 0) {
          setQuickPaths(data.quickPaths);
        }
      } else {
        setErrorMsg(data.error || "读取目录失败");
      }
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : "连接本地服务失败");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (open) {
      void loadDirectory(initialPath);
    }
  }, [open, initialPath, loadDirectory]);

  // 新建文件夹
  const handleCreateDirectory = async () => {
    const trimmed = newDirName.trim();
    if (!trimmed) {
      setErrorMsg("请输入文件夹名称");
      return;
    }
    const targetParent = currentPath || "D:\\temp\\agentscope-harness\\.agentscope\\workspace";
    try {
      setLoading(true);
      setErrorMsg(null);
      const res = await fetch("http://127.0.0.1:8787/api/workspace/mkdir", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ parentDir: targetParent, dirName: trimmed }),
      });
      const data = (await res.json()) as { ok?: boolean; createdPath?: string; path?: string; error?: string };
      if (res.ok && data.ok) {
        const newPath = data.createdPath || data.path || `${targetParent}\\${trimmed}`;
        setNewDirName("");
        setIsCreatingDir(false);
        setSuccessMsg(`✓ 成功创建文件夹: ${trimmed}`);
        // 重新加载并选中新创建的目录
        await loadDirectory(targetParent);
        setSelectedFolder(newPath);
      } else {
        setErrorMsg(data.error || "创建文件夹失败");
      }
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : "创建失败");
    } finally {
      setLoading(false);
    }
  };

  const handleConfirm = async () => {
    const chosen = selectedFolder || currentPath;
    if (!chosen) {
      setErrorMsg("请选择或输入有效文件夹路径");
      return;
    }
    // 确保选择时后端同步工作区
    try {
      await fetch("http://127.0.0.1:8787/api/workspace/select", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ path: chosen }),
      });
    } catch {
      // 忽略
    }
    onSelect(chosen);
    onClose();
  };

  return (
    <Modal open={open} onClose={onClose} title="选择与新建工作区文件夹" width="lg">
      <div className="flex flex-col gap-3.5 text-zinc-200">
        {/* 顶部：常用位置快速通道（默认工作区、桌面、各盘符） */}
        <div className="flex flex-col gap-1.5 pb-2.5 border-b border-zinc-800/60">
          <div className="flex items-center gap-1.5 text-[11.5px] text-zinc-400">
            <HardDriveIcon className="size-3.5 text-zinc-500" />
            <span>常用推荐路径 (点击立即切换):</span>
          </div>
          <div className="flex items-center gap-1.5 flex-wrap">
            {quickPaths.map((item) => {
              const isDefaultWs = item.name.includes("默认");
              const isCurrent = currentPath === item.path || currentPath.toLowerCase() === item.path.toLowerCase();
              return (
                <button
                  key={item.path}
                  type="button"
                  onClick={() => void loadDirectory(item.path)}
                  className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-[12px] transition-all border ${
                    isCurrent
                      ? "bg-zinc-800 text-white font-medium border-zinc-600 shadow-xs"
                      : isDefaultWs
                      ? "bg-amber-500/10 text-amber-300 border-amber-500/30 hover:bg-amber-500/20"
                      : "bg-zinc-900/80 text-zinc-300 hover:text-white border-zinc-800 hover:border-zinc-700"
                  }`}
                  title={item.path}
                >
                  {isDefaultWs && <SparklesIcon className="size-3 text-amber-400 shrink-0" />}
                  <span>{item.name}</span>
                </button>
              );
            })}
          </div>
        </div>

        {/* 路径导航行：上一级、当前路径输入/展示、刷新、新建文件夹 */}
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => parentPath && void loadDirectory(parentPath)}
            disabled={!parentPath || loading}
            className="flex size-8 items-center justify-center rounded-lg bg-zinc-900 border border-zinc-800 text-zinc-400 hover:text-white disabled:opacity-30 disabled:pointer-events-none transition-colors shrink-0"
            title={parentPath ? `返回上一级: ${parentPath}` : "已是顶层根目录"}
          >
            <ArrowUpIcon className="size-4" />
          </button>

          <div className="relative flex-1 min-w-0">
            <input
              type="text"
              value={currentPath}
              onChange={(e) => setCurrentPath(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  void loadDirectory(currentPath);
                }
              }}
              placeholder="输入或选择目录路径（Enter 跳转）..."
              className="w-full rounded-lg bg-zinc-900/90 border border-zinc-800 px-3 py-1.5 text-[12px] font-mono text-zinc-100 focus:outline-none focus:border-zinc-500 placeholder:text-zinc-600"
            />
          </div>

          <button
            type="button"
            onClick={() => void loadDirectory(currentPath)}
            disabled={loading}
            className="flex size-8 items-center justify-center rounded-lg bg-zinc-900 border border-zinc-800 text-zinc-400 hover:text-white transition-colors shrink-0"
            title="刷新当前目录"
          >
            <RefreshCwIcon className={`size-3.5 ${loading ? "animate-spin" : ""}`} />
          </button>

          <button
            type="button"
            data-testid="modal-create-folder-btn"
            onClick={() => setIsCreatingDir((v) => !v)}
            className="flex items-center gap-1.5 h-8 px-3 rounded-lg bg-zinc-900 border border-zinc-700/80 text-[12px] font-medium text-zinc-200 hover:text-white hover:bg-zinc-800 transition-colors shrink-0"
            title="在当前目录下新建工作区文件夹"
          >
            <FolderPlusIcon className="size-3.5 text-amber-400" />
            <span>新建文件夹</span>
          </button>
        </div>

        {/* 新建子文件夹输入区 */}
        {isCreatingDir && (
          <div className="flex items-center gap-2 p-2.5 rounded-xl bg-zinc-900 border border-zinc-700/80 animate-in fade-in zoom-in-95 duration-100">
            <FolderIcon className="size-4 text-amber-400 shrink-0" />
            <input
              type="text"
              value={newDirName}
              onChange={(e) => setNewDirName(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") void handleCreateDirectory();
                if (e.key === "Escape") setIsCreatingDir(false);
              }}
              placeholder="输入新建工作区文件夹名称 (例如: my-project)..."
              autoFocus
              className="flex-1 bg-transparent text-[12.5px] text-zinc-100 placeholder:text-zinc-500 outline-none"
            />
            <button
              type="button"
              onClick={() => void handleCreateDirectory()}
              className="px-3 py-1 rounded-lg bg-zinc-100 text-black text-[12px] font-medium hover:bg-white transition-colors"
            >
              创建
            </button>
            <button
              type="button"
              onClick={() => setIsCreatingDir(false)}
              className="px-2.5 py-1 text-[12px] text-zinc-400 hover:text-zinc-200"
            >
              取消
            </button>
          </div>
        )}

        {/* 提示消息 */}
        {errorMsg && (
          <div className="rounded-lg bg-rose-950/40 border border-rose-800/60 p-2 text-[12px] text-rose-300">
            {errorMsg}
          </div>
        )}
        {successMsg && (
          <div className="rounded-lg bg-emerald-950/40 border border-emerald-800/60 p-2 text-[12px] text-emerald-300">
            {successMsg}
          </div>
        )}

        {/* 文件夹列表展示区域 */}
        <div className="h-[250px] overflow-y-auto rounded-xl border border-zinc-800/80 bg-zinc-950/80 p-2 scrollbar-thin scrollbar-thumb-zinc-800">
          {loading ? (
            <div className="flex h-full items-center justify-center text-[12.5px] text-zinc-500">
              <RefreshCwIcon className="mr-2 size-4 animate-spin text-zinc-400" />
              正在读取文件夹...
            </div>
          ) : folders.length === 0 ? (
            <div className="flex h-full flex-col items-center justify-center text-zinc-500 text-[12.5px] gap-1.5">
              <FolderIcon className="size-8 stroke-[1.2] opacity-40 text-zinc-400" />
              <span>当前目录下没有其他子文件夹</span>
              <span className="text-[11.5px] text-zinc-500">
                可直接点击右下角按钮选择当前目录，或点击上方“新建文件夹”
              </span>
            </div>
          ) : (
            <div className="grid grid-cols-2 gap-1.5">
              {folders.map((folder) => {
                const isSelected = selectedFolder === folder.path;
                return (
                  <div
                    key={folder.path}
                    onClick={() => setSelectedFolder(folder.path)}
                    onDoubleClick={() => void loadDirectory(folder.path)}
                    className={`flex items-center justify-between gap-2 px-3 py-2 rounded-lg cursor-pointer border transition-all ${
                      isSelected
                        ? "bg-zinc-800/90 border-zinc-500 text-white shadow-xs font-medium"
                        : "bg-zinc-900/40 border-zinc-800/80 text-zinc-300 hover:bg-zinc-900 hover:border-zinc-700 hover:text-white"
                    }`}
                  >
                    <div className="flex items-center gap-2 truncate">
                      <FolderIcon
                        className={`size-4 shrink-0 transition-colors ${
                          isSelected ? "text-amber-400" : "text-zinc-400"
                        }`}
                      />
                      <span className="truncate text-[12.5px]">{folder.name}</span>
                    </div>

                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        void loadDirectory(folder.path);
                      }}
                      className="p-1 rounded-md hover:bg-zinc-700/60 text-zinc-500 hover:text-zinc-200 transition-colors"
                      title="双击或点击进入此文件夹"
                    >
                      <ChevronRightIcon className="size-3.5" />
                    </button>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* 底部信息与确认按钮 */}
        <div className="flex items-center justify-between pt-2 border-t border-zinc-800/80">
          <div className="text-[12px] text-zinc-400 truncate max-w-[400px]">
            <span className="text-zinc-500 mr-1.5">目标工作区:</span>
            <span className="font-mono text-zinc-200 font-medium truncate" title={selectedFolder || currentPath}>
              {selectedFolder || currentPath || "尚未选择"}
            </span>
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={onClose}
              className="px-3.5 py-1.5 rounded-lg border border-zinc-800 bg-zinc-900 text-[12px] text-zinc-300 hover:bg-zinc-800 hover:text-white transition-colors"
            >
              取消
            </button>
            <button
              type="button"
              data-testid="confirm-select-folder-btn"
              onClick={() => void handleConfirm()}
              className="flex items-center gap-1.5 px-4 py-1.5 rounded-lg bg-zinc-100 text-black font-medium text-[12px] hover:bg-white transition-colors shadow-xs"
            >
              <CheckIcon className="size-3.5 stroke-[2.5]" />
              选择此工作区
            </button>
          </div>
        </div>
      </div>
    </Modal>
  );
}
