import { useEffect, useMemo, useRef, useState } from "react";
import { cn } from "../../lib/utils.js";

/** 对齐 ZCode ConversationTurnNavigator：聊天区左侧的回合导航条，用于快速翻找历史记录。 */
export interface ConversationTurn {
  /** 回合锚点：该轮用户消息的 id（消息容器上带 data-message-id 供滚动定位）。 */
  id: string;
  /** HH:mm 格式时间（无有效时间戳时为空串）。 */
  time: string;
  /** 该轮用户消息的首行预览。 */
  preview: string;
}

function prefersReducedMotion(): boolean {
  return typeof matchMedia !== "undefined" && matchMedia("(prefers-reduced-motion: reduce)").matches;
}

export function ConversationTurnNavigator({
  turns,
  getScrollElement,
  stopScroll,
}: {
  turns: ConversationTurn[];
  /** 取真实滚动元素（use-stick-to-bottom 的 scrollRef）。 */
  getScrollElement?: () => HTMLElement | null;
  /** 解除粘底锁定，让点击跳转不被拉回底部。 */
  stopScroll?: () => void;
}) {
  const railRef = useRef<HTMLElement>(null);
  const activeRef = useRef<HTMLButtonElement>(null);
  const [activeId, setActiveId] = useState<string | null>(null);
  // 跳转动画令牌：连续点击时取消上一次动画
  const jumpTokenRef = useRef(0);

  // 导航条位于滚动容器外层（避免绝对定位随内容滚走）。
  // 优先使用 use-stick-to-bottom 提供的真实滚动元素，兜底取 [role=log] 的首个子节点。
  const getScrollContainer = (): HTMLElement | null => {
    const viaContext = getScrollElement?.();
    if (viaContext) return viaContext;
    const log = document.querySelector<HTMLElement>('[role="log"]');
    if (!log) return null;
    return log.firstElementChild instanceof HTMLElement ? log.firstElementChild : log;
  };

  // 点击：滚动到对应回合。
  // 注意：use-stick-to-bottom 会吞掉 scrollIntoView / scrollTo 的平滑滚动并强制回底，
  // 因此先 stopScroll() 解除粘底，再用 rAF 自绘缓动动画逐帧写 scrollTop。
  const jumpTo = (messageId: string) => {
    const scroller = getScrollContainer();
    const target = scroller?.querySelector(`[data-message-id="${messageId}"]`);
    if (!scroller || !target) return;
    stopScroll?.();
    const targetTop =
      target.getBoundingClientRect().top - scroller.getBoundingClientRect().top + scroller.scrollTop;
    const from = scroller.scrollTop;
    const delta = targetTop - from;
    if (Math.abs(delta) < 2) return;

    // 后台标签页中 rAF 会被浏览器暂停，直接跳转即可（无人观看，无需动画）
    if (prefersReducedMotion() || document.hidden) {
      scroller.scrollTop = targetTop;
      return;
    }

    const token = ++jumpTokenRef.current;
    const duration = 480;
    const start = performance.now();
    const ease = (t: number): number => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);
    const step = (now: number): void => {
      if (token !== jumpTokenRef.current) return; // 已被新的跳转取代
      const t = Math.min(1, (now - start) / duration);
      scroller.scrollTop = from + delta * ease(t);
      if (t < 1) requestAnimationFrame(step);
    };
    requestAnimationFrame(step);
  };

  // 按滚动位置推导当前所处的回合，高亮对应横条
  const items = useMemo(() => turns, [turns]);
  useEffect(() => {
    const container = getScrollContainer();
    if (!container || items.length === 0) return;
    const containerTop = () => container.getBoundingClientRect().top;
    const computeActive = () => {
      let current: string | null = items[0]?.id ?? null;
      for (const turn of items) {
        const el = container.querySelector(`[data-message-id="${turn.id}"]`);
        if (el && el.getBoundingClientRect().top <= containerTop() + 160) {
          current = turn.id;
        } else {
          break;
        }
      }
      setActiveId((prev) => (prev === current ? prev : current));
    };
    computeActive();
    container.addEventListener("scroll", computeActive, { passive: true });
    return () => container.removeEventListener("scroll", computeActive);
  }, [items]);

  // 导航条自身滚动到当前高亮项
  useEffect(() => {
    if (activeId) {
      activeRef.current?.scrollIntoView({ block: "nearest" });
    }
  }, [activeId]);

  // 少于两个回合没有导航价值（对齐 ZCode）
  if (items.length < 2) return null;

  return (
    <nav
      ref={railRef}
      aria-label="会话回合导航"
      className="pointer-events-none absolute inset-y-0 left-1.5 z-20 hidden w-8 flex-col @[900px]:flex"
    >
      {/* flex 容器 + margin-auto：垂直居中，内容溢出时自动退化为顶对齐，保证长列表可滚到头 */}
      <div className="pointer-events-auto m-auto flex max-h-[calc(100%-1.5rem)] w-full flex-col items-center gap-1 overflow-y-auto overflow-x-hidden py-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
        {items.map((turn) => {
          const isActive = activeId === turn.id;
          return (
            <button
              key={turn.id}
              ref={isActive ? activeRef : undefined}
              type="button"
              aria-current={isActive ? "location" : undefined}
              aria-label={`${turn.time ? `${turn.time} ` : ""}${turn.preview}`}
              onClick={() => jumpTo(turn.id)}
              className="group/nav-item relative flex h-3 w-6 shrink-0 items-center justify-center rounded outline-none focus-visible:ring-1 focus-visible:ring-blue-500 cursor-pointer"
            >
              {/* 悬停预览：回合时间 + 用户消息首行（导航条在左侧，预览向右弹出） */}
              <span
                className={cn(
                  "pointer-events-none absolute left-full top-1/2 z-30 ml-1.5 hidden max-w-[300px] -translate-y-1/2 items-center gap-1.5 truncate rounded-md border px-2 py-1 text-left text-[11px] leading-snug shadow-lg",
                  "border-zinc-200 bg-white text-zinc-800",
                  "dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-100",
                  "group-hover/nav-item:flex",
                )}
              >
                {turn.time && (
                  <span className="shrink-0 font-mono text-[10px] text-zinc-400 dark:text-zinc-500">
                    {turn.time}
                  </span>
                )}
                <span className="truncate">{turn.preview}</span>
              </span>
              {/* 回合横条：紧凑间距，悬停拉长，当前回合高亮 */}
              <span
                className={cn(
                  "block h-0.5 w-2.5 origin-center rounded-full transition-all duration-150",
                  isActive
                    ? "w-3.5 bg-zinc-800 dark:bg-zinc-100"
                    : "bg-zinc-300 group-hover/nav-item:w-3.5 group-hover/nav-item:bg-zinc-500 dark:bg-zinc-600 dark:group-hover/nav-item:bg-zinc-400",
                )}
              />
            </button>
          );
        })}
      </div>
    </nav>
  );
}
