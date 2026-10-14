import { useMemo, useState } from "react";
import type { GitDiffResponse, GitFileItem } from "./review-types.js";
import { ChevronDownIcon, ChevronRightIcon, CopyIcon, CheckIcon, ImageIcon, FileTextIcon, RefreshCwIcon } from "lucide-react";

interface ReviewDiffViewProps {
  file: GitFileItem | null;
  diff: GitDiffResponse | null;
  loading: boolean;
  onRefresh?: () => void;
}

export function ReviewDiffView({ file, diff, loading, onRefresh }: ReviewDiffViewProps) {
  const [copied, setCopied] = useState(false);
  const [isExpanded, setIsExpanded] = useState(true);

  const handleCopyPath = () => {
    if (!file) return;
    navigator.clipboard.writeText(file.path);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  /** 解析统一 Diff 行结构 */
  const diffLines = useMemo(() => {
    if (!diff?.diff) return [];
    const lines = diff.diff.split("\n");
    let oldLineNum = 0;
    let newLineNum = 0;

    return lines.map((raw) => {
      // 解析 @@ -a,b +c,d @@
      if (raw.startsWith("@@")) {
        const match = raw.match(/@@ -(\d+)(?:,\d+)? \+(\d+)(?:,\d+)? @@/);
        if (match) {
          oldLineNum = parseInt(match[1] ?? "0", 10);
          newLineNum = parseInt(match[2] ?? "0", 10);
        }
        return { type: "chunk", text: raw, oldNum: null, newNum: null };
      }

      if (raw.startsWith("+") && !raw.startsWith("+++")) {
        const curNum = newLineNum++;
        return { type: "add", text: raw.substring(1), oldNum: null, newNum: curNum };
      }

      if (raw.startsWith("-") && !raw.startsWith("---")) {
        const curNum = oldLineNum++;
        return { type: "del", text: raw.substring(1), oldNum: curNum, newNum: null };
      }

      if (raw.startsWith(" ") || raw === "") {
        const oNum = oldLineNum++;
        const nNum = newLineNum++;
        return { type: "ctx", text: raw.startsWith(" ") ? raw.substring(1) : raw, oldNum: oNum, newNum: nNum };
      }

      return { type: "meta", text: raw, oldNum: null, newNum: null };
    });
  }, [diff?.diff]);

  if (!file) {
    return (
      <div className="flex h-full flex-1 flex-col items-center justify-center p-8 text-zinc-500">
        <FileTextIcon className="size-8 mb-2 stroke-1 opacity-50" />
        <p className="text-xs">在右侧列表中选择一个文件以查看差异</p>
      </div>
    );
  }

  return (
    <div className="flex h-full flex-1 flex-col overflow-hidden bg-black text-zinc-300">
      {/* 单个文件的标题条 */}
      <div className="flex shrink-0 items-center justify-between border-b border-zinc-800/80 bg-zinc-950/80 px-3 py-2 text-xs">
        <div className="flex items-center gap-2 min-w-0">
          <button
            type="button"
            onClick={() => setIsExpanded(!isExpanded)}
            className="text-zinc-400 hover:text-zinc-200"
          >
            {isExpanded ? (
              <ChevronDownIcon className="size-4" />
            ) : (
              <ChevronRightIcon className="size-4" />
            )}
          </button>

          {file.isImage ? (
            <ImageIcon className="size-4 text-purple-400 shrink-0" />
          ) : (
            <FileTextIcon className="size-4 text-blue-400 shrink-0" />
          )}

          <span className="font-semibold text-zinc-100 truncate">{file.name}</span>
          <span className="text-[11px] text-zinc-500 truncate" title={file.dir}>
            {file.dir}
          </span>

          <span
            className={`rounded px-1.5 py-0.2 text-[10px] font-mono font-bold ${
              file.status === "U"
                ? "bg-emerald-950 text-emerald-400 border border-emerald-800/50"
                : file.status === "M"
                  ? "bg-amber-950 text-amber-400 border border-amber-800/50"
                  : "bg-rose-950 text-rose-400 border border-rose-800/50"
            }`}
          >
            {file.status}
          </span>
        </div>

        <div className="flex items-center gap-1.5">
          {onRefresh && (
            <button
              type="button"
              onClick={onRefresh}
              title="刷新 Diff"
              className="rounded p-1 text-zinc-400 hover:bg-zinc-800 hover:text-zinc-200"
            >
              <RefreshCwIcon className={`size-3.5 ${loading ? "animate-spin" : ""}`} />
            </button>
          )}

          <button
            type="button"
            onClick={handleCopyPath}
            title="复制文件相对路径"
            className="flex items-center gap-1 rounded p-1 text-zinc-400 hover:bg-zinc-800 hover:text-zinc-200"
          >
            {copied ? (
              <CheckIcon className="size-3.5 text-emerald-400" />
            ) : (
              <CopyIcon className="size-3.5" />
            )}
          </button>
        </div>
      </div>

      {/* 展开内容区 */}
      {isExpanded && (
        <div className="flex-1 overflow-auto bg-black p-2 font-mono text-xs">
          {loading ? (
            <div className="flex h-32 items-center justify-center text-zinc-500">
              <RefreshCwIcon className="size-4 animate-spin mr-2" />
              正在加载变更差异...
            </div>
          ) : file.isImage ? (
            /* 图片对比模式（对应图 2 效果：Before Not available / After 预览） */
            <div className="space-y-4 p-2">
              <div className="grid grid-cols-2 gap-4">
                {/* Before 对比列 */}
                <div className="flex flex-col items-center rounded-lg border border-zinc-800 bg-zinc-950/60 p-3">
                  <div className="mb-2 text-xs font-medium text-zinc-400">
                    Before
                  </div>
                  {diff?.beforeImage ? (
                    <img
                      src={diff.beforeImage}
                      alt="Before"
                      className="max-h-72 object-contain rounded border border-zinc-800"
                    />
                  ) : (
                    <div className="flex h-48 w-full items-center justify-center rounded border border-dashed border-zinc-800/80 bg-zinc-900/30 text-xs text-zinc-500">
                      (Not available)
                    </div>
                  )}
                </div>

                {/* After 对比列 */}
                <div className="flex flex-col items-center rounded-lg border border-zinc-800 bg-zinc-950/60 p-3">
                  <div className="mb-2 text-xs font-medium text-zinc-400">
                    After
                  </div>
                  {diff?.afterImage ? (
                    <img
                      src={diff.afterImage}
                      alt="After"
                      className="max-h-72 object-contain rounded border border-zinc-800"
                    />
                  ) : (
                    <div className="flex h-48 w-full items-center justify-center rounded border border-dashed border-zinc-800/80 bg-zinc-900/30 text-xs text-zinc-500">
                      (File deleted)
                    </div>
                  )}
                </div>
              </div>
            </div>
          ) : (
            /* 代码 / 文本统一 Diff 模式 */
            <div className="overflow-x-auto rounded border border-zinc-800/80 bg-zinc-950">
              {diffLines.length === 0 ? (
                <div className="p-4 text-center text-xs text-zinc-500 font-sans">
                  {diff?.error || "无差异内容或为空文件"}
                </div>
              ) : (
                <div className="min-w-max text-[11.5px] leading-relaxed">
                  {diffLines.map((line, idx) => {
                    if (line.type === "chunk") {
                      return (
                        <div
                          key={idx}
                          className="bg-indigo-950/30 px-3 py-0.5 text-indigo-400 select-none border-y border-indigo-900/40"
                        >
                          {line.text}
                        </div>
                      );
                    }
                    if (line.type === "meta") {
                      return (
                        <div key={idx} className="text-zinc-600 px-3 py-0.5 select-none text-[10px]">
                          {line.text}
                        </div>
                      );
                    }
                    const isAdd = line.type === "add";
                    const isDel = line.type === "del";

                    return (
                      <div
                        key={idx}
                        className={`flex items-start hover:bg-zinc-800/40 ${
                          isAdd
                            ? "bg-emerald-950/30 text-emerald-300"
                            : isDel
                              ? "bg-rose-950/30 text-rose-300"
                              : "text-zinc-300"
                        }`}
                      >
                        {/* 左行号 */}
                        <span className="w-10 shrink-0 text-right pr-2 text-zinc-600 select-none border-r border-zinc-800 text-[10px]">
                          {line.oldNum ?? ""}
                        </span>
                        {/* 右行号 */}
                        <span className="w-10 shrink-0 text-right pr-2 text-zinc-600 select-none border-r border-zinc-800 text-[10px]">
                          {line.newNum ?? ""}
                        </span>
                        {/* 符号 */}
                        <span className="w-5 shrink-0 text-center select-none font-bold">
                          {isAdd ? "+" : isDel ? "-" : " "}
                        </span>
                        {/* 代码正文 */}
                        <span className="flex-1 whitespace-pre pr-2">
                          {line.text}
                        </span>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
