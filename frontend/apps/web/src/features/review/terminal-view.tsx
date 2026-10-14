import { useState, useRef, useEffect } from "react";
import { TerminalIcon, PlayIcon, Trash2Icon, RefreshCwIcon, CornerDownLeftIcon } from "lucide-react";

interface TerminalViewProps {
  workspaceRoot: string | null;
}

interface CommandHistoryItem {
  id: string;
  command: string;
  output: string;
  exitCode: number;
  time: string;
}

export function TerminalView({ workspaceRoot }: TerminalViewProps) {
  const [history, setHistory] = useState<CommandHistoryItem[]>([
    {
      id: "init",
      command: "git status -s",
      output: "正在初始化终端控制台...\n工作区已就绪。",
      exitCode: 0,
      time: new Date().toLocaleTimeString(),
    },
  ]);
  const [currentCmd, setCurrentCmd] = useState("");
  const [running, setRunning] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);

  // 快捷命令列表
  const quickCommands = [
    { label: "Git 状态", cmd: "git status -s" },
    { label: "Git 分支", cmd: "git branch -a" },
    { label: "最近提交", cmd: "git log --oneline -n 5" },
    { label: "目录列表", cmd: "dir" },
  ];

  const handleExecute = async (cmdToRun = currentCmd) => {
    const trimmed = cmdToRun.trim();
    if (!trimmed || running) return;

    setRunning(true);
    setCurrentCmd("");

    try {
      const res = await fetch("/api/git/terminal", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          command: trimmed,
          root: workspaceRoot,
        }),
      });
      const data = await res.json();
      const newItem: CommandHistoryItem = {
        id: `cmd-${Date.now()}`,
        command: trimmed,
        output: data.output || (data.ok ? "（命令执行完毕，无输出）" : "命令执行失败"),
        exitCode: data.exitCode ?? 0,
        time: new Date().toLocaleTimeString(),
      };
      setHistory((prev) => [...prev, newItem]);
    } catch (err: any) {
      setHistory((prev) => [
        ...prev,
        {
          id: `cmd-${Date.now()}`,
          command: trimmed,
          output: "请求执行异常: " + (err.message || String(err)),
          exitCode: -1,
          time: new Date().toLocaleTimeString(),
        },
      ]);
    } finally {
      setRunning(false);
      setTimeout(() => {
        bottomRef.current?.scrollIntoView({ behavior: "smooth" });
      }, 100);
    }
  };

  useEffect(() => {
    // 首次进入自动执行一次 git status
    void handleExecute("git status -s");
  }, []);

  return (
    <div className="flex flex-1 flex-col h-full bg-black text-zinc-200 font-mono text-xs overflow-hidden select-text">
      {/* 终端顶部操作栏 */}
      <div className="flex h-9 shrink-0 items-center justify-between border-b border-zinc-800 bg-zinc-950 px-3 select-none">
        <div className="flex items-center gap-2">
          <TerminalIcon className="size-3.5 text-emerald-400" />
          <span className="font-semibold text-zinc-300">Terminal 控制台</span>
        </div>

        <div className="flex items-center gap-1.5">
          {quickCommands.map((q) => (
            <button
              key={q.cmd}
              type="button"
              onClick={() => void handleExecute(q.cmd)}
              disabled={running}
              className="rounded border border-zinc-800 bg-zinc-900 px-2 py-0.5 text-[11px] text-zinc-400 hover:border-zinc-700 hover:text-zinc-200 disabled:opacity-50 transition-colors"
            >
              {q.label}
            </button>
          ))}

          <button
            type="button"
            onClick={() => setHistory([])}
            title="清空终端"
            className="rounded p-1 text-zinc-500 hover:bg-zinc-800 hover:text-zinc-300 ml-1"
          >
            <Trash2Icon className="size-3.5" />
          </button>
        </div>
      </div>

      {/* 终端历史输出区域 */}
      <div className="flex-1 overflow-y-auto p-3 space-y-3">
        {history.map((item) => (
          <div key={item.id} className="space-y-1">
            <div className="flex items-center gap-2 text-zinc-500 text-[11px]">
              <span className="text-emerald-400 font-bold">$</span>
              <span className="text-zinc-200 font-semibold">{item.command}</span>
              <span className="text-[10px] text-zinc-600">[{item.time}]</span>
              {item.exitCode !== 0 && (
                <span className="rounded bg-rose-950/60 px-1 text-[10px] text-rose-400">
                  exit {item.exitCode}
                </span>
              )}
            </div>
            <pre className="whitespace-pre-wrap rounded bg-zinc-950/80 p-2.5 text-[11.5px] leading-relaxed text-zinc-300 border border-zinc-900">
              {item.output}
            </pre>
          </div>
        ))}
        {running && (
          <div className="flex items-center gap-2 text-zinc-400 py-1 text-[11px]">
            <RefreshCwIcon className="size-3.5 animate-spin text-emerald-400" />
            <span>命令正在执行中...</span>
          </div>
        )}
        <div ref={bottomRef} />
      </div>

      {/* 底部输入框 */}
      <div className="shrink-0 border-t border-zinc-800 bg-zinc-950 p-2 flex items-center gap-2">
        <span className="text-emerald-400 font-bold pl-2 text-sm">$</span>
        <input
          type="text"
          value={currentCmd}
          onChange={(e) => setCurrentCmd(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              void handleExecute();
            }
          }}
          disabled={running}
          placeholder="输入 Shell 命令（例如 git diff, npm test, dir）并回车..."
          className="flex-1 bg-transparent text-xs text-zinc-100 placeholder-zinc-500 outline-none"
          autoFocus
        />
        <button
          type="button"
          onClick={() => void handleExecute()}
          disabled={running || !currentCmd.trim()}
          className="flex items-center gap-1 rounded bg-zinc-800 px-2.5 py-1 text-xs text-zinc-300 hover:bg-zinc-700 hover:text-white disabled:opacity-40"
        >
          <CornerDownLeftIcon className="size-3" />
          <span>执行</span>
        </button>
      </div>
    </div>
  );
}
