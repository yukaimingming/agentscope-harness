import React, { useState, useEffect, useRef, useId, useCallback } from "react";
import mermaid from "mermaid";
import {
  ZoomIn,
  ZoomOut,
  RotateCcw,
  Maximize2,
  Minimize2,
  Copy,
  Check,
  Code2,
  Eye,
  Download,
  Image as ImageIcon,
  FileCode,
  RefreshCw,
  AlertCircle,
  Network,
  Scan,
} from "lucide-react";
import { cn } from "../../lib/utils.js";

export interface DiagramViewerProps {
  code: string;
  title?: string;
  className?: string;
}

// 解析图表类型与展示名称
function detectDiagramType(code: string): { type: string; label: string } {
  const clean = code.trim().toLowerCase();
  if (clean.startsWith("sequencediagram")) {
    return { type: "sequence", label: "时序图 (Sequence)" };
  }
  if (clean.startsWith("statediagram") || clean.startsWith("statediagram-v2")) {
    return { type: "state", label: "状态机图 (State)" };
  }
  if (clean.startsWith("classdiagram")) {
    return { type: "class", label: "类图 (Class)" };
  }
  if (clean.startsWith("erdiagram")) {
    return { type: "er", label: "实体关系图 (ER)" };
  }
  if (clean.startsWith("architecture-beta") || clean.startsWith("architecture")) {
    return { type: "architecture", label: "架构图 (Architecture)" };
  }
  if (clean.startsWith("gantt")) {
    return { type: "gantt", label: "甘特图 (Gantt)" };
  }
  if (clean.startsWith("mindmap")) {
    return { type: "mindmap", label: "思维导图 (Mindmap)" };
  }
  if (clean.startsWith("gitgraph")) {
    return { type: "gitGraph", label: "Git 分支图 (GitGraph)" };
  }
  return { type: "flowchart", label: "流程图 (Flowchart)" };
}

// 提取图表标题
function extractDiagramTitle(code: string, fallbackType: string): string {
  const lines = code.split("\n");
  for (const line of lines) {
    const trimmed = line.trim();
    if (trimmed.startsWith("title ")) {
      return trimmed.replace(/^title\s+/, "").trim();
    }
    if (trimmed.startsWith("%% title:")) {
      return trimmed.replace(/^%%\s*title:\s*/, "").trim();
    }
  }
  return `${fallbackType} 可视化`;
}

// 解析 SVG viewBox 尺寸
function parseViewBoxDimensions(vb: string | null | undefined): { width: number; height: number } | null {
  if (!vb) return null;
  const parts = vb.trim().split(/[\s,]+/).map(Number);
  const w = parts[2];
  const h = parts[3];
  if (typeof w === "number" && typeof h === "number" && !isNaN(w) && !isNaN(h) && w > 0 && h > 0) {
    return { width: w, height: h };
  }
  return null;
}

export const DiagramViewer: React.FC<DiagramViewerProps> = ({
  code: initialCode,
  title: initialTitle,
  className,
}) => {
  const [code, setCode] = useState(initialCode);
  const [svgHtml, setSvgHtml] = useState<string>("");
  const [renderError, setRenderError] = useState<string | null>(null);
  const [isEditing, setIsEditing] = useState(false);
  const [zoom, setZoom] = useState(1);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const [isDragging, setIsDragging] = useState(false);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [copied, setCopied] = useState(false);
  const [exportStatus, setExportStatus] = useState<"idle" | "exporting" | "error">("idle");

  const containerRef = useRef<HTMLDivElement>(null);
  const naturalSizeRef = useRef({ width: 800, height: 600 });
  const zoomRef = useRef(zoom);
  zoomRef.current = zoom;
  const panRef = useRef(pan);
  panRef.current = pan;
  const isDraggingRef = useRef(false);
  const startPosRef = useRef({ x: 0, y: 0 });
  const startPanRef = useRef({ x: 0, y: 0 });
  const hasDraggedRef = useRef(false);

  const uniqueId = useId().replace(/:/g, "_");
  const renderCounter = useRef(0);

  // 监听主题变化（深色 / 浅色）
  const [isDark, setIsDark] = useState(() => {
    if (typeof document !== "undefined") {
      return document.documentElement.classList.contains("dark");
    }
    return false;
  });

  useEffect(() => {
    if (typeof document === "undefined") return;
    const observer = new MutationObserver(() => {
      setIsDark(document.documentElement.classList.contains("dark"));
    });
    observer.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ["class"],
    });
    return () => observer.disconnect();
  }, []);

  const { label: typeLabel } = detectDiagramType(code);
  const displayTitle = initialTitle || extractDiagramTitle(code, typeLabel.split(" ")[0] ?? "流程图");

  // Mermaid 渲染引擎执行
  const renderDiagram = useCallback(
    async (codeToRender: string) => {
      const trimmed = codeToRender.trim();
      if (!trimmed) {
        setSvgHtml("");
        setRenderError("图表代码不能为空。");
        return;
      }

      renderCounter.current += 1;
      const elementId = `mermaid_diag_${uniqueId}_${renderCounter.current}`;

      try {
        mermaid.initialize({
          startOnLoad: false,
          securityLevel: "strict", // 启用严格安全级别，阻断 XSS 与 SVG 脚本注入
          suppressErrorRendering: true,
          theme: isDark ? "dark" : "default",
          fontFamily: "ui-sans-serif, system-ui, sans-serif",
          flowchart: { htmlLabels: true, curve: "basis" },
          sequence: { actorMargin: 50 },
        });

        const { svg } = await mermaid.render(elementId, trimmed);

        // 解析 viewBox 提取自然物理宽高，并移除 width="100%" 与 max-width 的强制内联挤压
        let naturalWidth = 800;
        let naturalHeight = 600;
        const vbMatch = svg.match(/viewBox=["']([^"']+)["']/i);
        const parsedVb = parseViewBoxDimensions(vbMatch?.[1]);
        if (parsedVb) {
          naturalWidth = parsedVb.width;
          naturalHeight = parsedVb.height;
        }
        naturalSizeRef.current = { width: naturalWidth, height: naturalHeight };

        // 规范化 SVG 根节点尺寸，解除 width="100%" 强制缩窄的问题
        const normalizedSvg = svg.replace(/<svg\b([^>]*)>/i, (_m, attrs) => {
          const cleanAttrs = attrs
            .replace(/\s+width=["'][^"']*["']/gi, "")
            .replace(/\s+height=["'][^"']*["']/gi, "")
            .replace(/\s+style=["'][^"']*["']/gi, "");
          return `<svg width="${naturalWidth}" height="${naturalHeight}" style="max-width:none;" ${cleanAttrs}>`;
        });

        setSvgHtml(normalizedSvg);
        setRenderError(null);
      } catch (err: unknown) {
        console.warn("Mermaid 渲染失败:", err);
        const errMsg = err instanceof Error ? err.message : String(err);
        const firstLine = errMsg.split(/\r?\n/)[0]?.trim() || errMsg;
        setRenderError(firstLine);
      } finally {
        for (const id of [elementId, `d${elementId}`, `i${elementId}`]) {
          const el = document.getElementById(id);
          if (el) {
            el.remove();
          }
        }
      }
    },
    [isDark, uniqueId]
  );

  // 计算 contain 适配的缩放比例：fitZoom = min(可用宽/图宽, 可用高/图高)
  const calculateFitZoom = useCallback((container: HTMLDivElement): number => {
    let naturalWidth = naturalSizeRef.current.width;
    let naturalHeight = naturalSizeRef.current.height;

    const svgEl = container.querySelector("svg");
    if (svgEl) {
      const parsed = parseViewBoxDimensions(svgEl.getAttribute("viewBox"));
      if (parsed) {
        naturalWidth = parsed.width;
        naturalHeight = parsed.height;
      } else if (svgEl.viewBox?.baseVal && svgEl.viewBox.baseVal.width > 0) {
        naturalWidth = svgEl.viewBox.baseVal.width;
        naturalHeight = svgEl.viewBox.baseVal.height;
      }
    }

    const style = window.getComputedStyle(container);
    const padX = (parseFloat(style.paddingLeft) || 0) + (parseFloat(style.paddingRight) || 0);
    const padY = (parseFloat(style.paddingTop) || 0) + (parseFloat(style.paddingBottom) || 0);
    const availWidth = Math.max(container.clientWidth - padX, 20);
    const availHeight = Math.max(container.clientHeight - padY, 20);

    if (naturalWidth <= 0 || naturalHeight <= 0) return 1;

    const fitZoom = Math.min(availWidth / naturalWidth, availHeight / naturalHeight);
    return Math.min(Math.max(fitZoom, 0.1), 6.0);
  }, []);

  // 初始适配：初始 zoom 取 min(fitZoom, 1)（下限 0.1，上限 6.0），平移归零，保证整张图一加载就完整可见且尽量大
  const handleInitialFit = useCallback(() => {
    const container = containerRef.current;
    if (!container) return;
    const fitZoom = calculateFitZoom(container);
    const initialZoom = Math.min(Math.max(Math.min(fitZoom, 1), 0.1), 6.0);
    setZoom(initialZoom);
    setPan({ x: 0, y: 0 });
  }, [calculateFitZoom]);

  // 点击「适应窗口」重新适配：让图表铺满可用视口
  const handleFitWindow = useCallback(() => {
    const container = containerRef.current;
    if (!container) return;
    const fitZoom = calculateFitZoom(container);
    setZoom(fitZoom);
    setPan({ x: 0, y: 0 });
  }, [calculateFitZoom]);

  useEffect(() => {
    setCode(initialCode);
    renderDiagram(initialCode);
  }, [initialCode, renderDiagram]);

  useEffect(() => {
    renderDiagram(code);
  }, [isDark, renderDiagram]);

  // 渲染完成后自动触发初始适配
  useEffect(() => {
    if (!svgHtml) return;
    const raf = requestAnimationFrame(() => {
      handleInitialFit();
    });
    return () => cancelAnimationFrame(raf);
  }, [svgHtml, handleInitialFit]);

  // 用 ResizeObserver 监听视口容器尺寸变化，全屏切换或窗格改变后自动重新适配
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    let prevW = container.clientWidth;
    let prevH = container.clientHeight;

    const observer = new ResizeObserver((entries) => {
      for (const entry of entries) {
        const { width, height } = entry.contentRect;
        if (Math.abs(width - prevW) > 8 || Math.abs(height - prevH) > 8) {
          prevW = width;
          prevH = height;
          handleFitWindow();
        }
      }
    });

    observer.observe(container);
    return () => observer.disconnect();
  }, [handleFitWindow]);

  // 全屏切换状态发生变化时，立即重新适配
  useEffect(() => {
    const raf = requestAnimationFrame(() => {
      handleFitWindow();
    });
    return () => cancelAnimationFrame(raf);
  }, [isFullscreen, handleFitWindow]);

  // 缩放操作：最大放大上限提高到 6.0
  const handleZoomIn = () => setZoom((prev) => Math.min(prev + 0.15, 6.0));
  const handleZoomOut = () => setZoom((prev) => Math.max(prev - 0.15, 0.1));
  const handleZoomReset = () => {
    setZoom(1);
    setPan({ x: 0, y: 0 });
  };

  // 鼠标拖拽平移 (pan)
  const handleMouseDown = (e: React.MouseEvent<HTMLDivElement>) => {
    if (e.button !== 0) return; // 仅左键拖动
    e.preventDefault();
    isDraggingRef.current = true;
    hasDraggedRef.current = false;
    startPosRef.current = { x: e.clientX, y: e.clientY };
    startPanRef.current = { ...panRef.current };
    setIsDragging(true);
  };

  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      if (!isDraggingRef.current) return;
      if ((e.buttons & 1) === 0) {
        isDraggingRef.current = false;
        setIsDragging(false);
        return;
      }
      const dx = e.clientX - startPosRef.current.x;
      const dy = e.clientY - startPosRef.current.y;
      if (!hasDraggedRef.current && (Math.abs(dx) > 3 || Math.abs(dy) > 3)) {
        hasDraggedRef.current = true;
        window.getSelection()?.removeAllRanges();
      }
      setPan({
        x: startPanRef.current.x + dx,
        y: startPanRef.current.y + dy,
      });
    };

    const handleMouseUp = () => {
      if (isDraggingRef.current) {
        isDraggingRef.current = false;
        setIsDragging(false);
      }
    };

    window.addEventListener("mousemove", handleMouseMove);
    window.addEventListener("mouseup", handleMouseUp);
    return () => {
      window.removeEventListener("mousemove", handleMouseMove);
      window.removeEventListener("mouseup", handleMouseUp);
    };
  }, []);

  // 拖拽后阻止冒泡和误触点击
  const handleClickCapture = (e: React.MouseEvent) => {
    if (hasDraggedRef.current) {
      e.stopPropagation();
      e.preventDefault();
    }
  };

  // 拖动过程中设置全局抓取光标与禁止选中文本
  useEffect(() => {
    if (isDragging) {
      const originalCursor = document.body.style.cursor;
      const originalUserSelect = document.body.style.userSelect;
      document.body.style.cursor = "grabbing";
      document.body.style.userSelect = "none";
      return () => {
        document.body.style.cursor = originalCursor;
        document.body.style.userSelect = originalUserSelect;
      };
    }
  }, [isDragging]);

  // 滚轮缩放：以鼠标当前位置为中心缩放并调整平移坐标
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const handleWheel = (e: WheelEvent) => {
      e.preventDefault();

      const rect = container.getBoundingClientRect();
      const mouseX = e.clientX - rect.left;
      const mouseY = e.clientY - rect.top;
      const centerX = rect.width / 2;
      const centerY = rect.height / 2;

      const currentZoom = zoomRef.current;
      const currentPan = panRef.current;

      const factor = Math.exp(-e.deltaY * 0.0015);
      const newZoom = Math.min(Math.max(currentZoom * factor, 0.1), 6.0);
      if (Math.abs(newZoom - currentZoom) < 0.0001) return;

      const px = mouseX - centerX;
      const py = mouseY - centerY;
      const ratio = newZoom / currentZoom;
      const newPanX = px - (px - currentPan.x) * ratio;
      const newPanY = py - (py - currentPan.y) * ratio;

      setZoom(newZoom);
      setPan({ x: newPanX, y: newPanY });
    };

    container.addEventListener("wheel", handleWheel, { passive: false });
    return () => {
      container.removeEventListener("wheel", handleWheel);
    };
  }, [svgHtml, isEditing, renderError]);

  // 复制代码
  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(code);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // 容错降级
    }
  };

  // 重新渲染
  const handleRerender = () => {
    setIsEditing(false);
    setPan({ x: 0, y: 0 });
    renderDiagram(code);
  };

  // 导出 SVG（保持原有行为不变）
  const handleExportSvg = () => {
    if (!svgHtml) return;
    const blob = new Blob([svgHtml], { type: "image/svg+xml;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${displayTitle.replace(/[\s/\\:*?"<>|]/g, "_")}.svg`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  // 导出 PNG：使用 data URL 彻底杜绝 tainted canvas 安全限制，按真实 viewBox 2x 高清导出
  const handleExportPng = () => {
    if (!svgHtml || exportStatus === "exporting") return;
    setExportStatus("exporting");

    try {
      const containerSvg = containerRef.current?.querySelector("svg");
      if (!containerSvg) {
        setExportStatus("error");
        setTimeout(() => setExportStatus("idle"), 2500);
        return;
      }

      // 1. 导出前克隆当前 SVG
      const clonedSvg = containerSvg.cloneNode(true) as SVGSVGElement;

      // 2. 读取 viewBox
      let width = naturalSizeRef.current.width || 800;
      let height = naturalSizeRef.current.height || 600;
      const parsed = parseViewBoxDimensions(clonedSvg.getAttribute("viewBox"));
      if (parsed) {
        width = parsed.width;
        height = parsed.height;
      } else if (clonedSvg.viewBox?.baseVal && clonedSvg.viewBox.baseVal.width > 0) {
        width = clonedSvg.viewBox.baseVal.width;
        height = clonedSvg.viewBox.baseVal.height;
      }

      // 3. 把根节点 width/height 设置为 viewBox 的真实宽高，并移除根节点上的 inline style（max-width 限制）
      clonedSvg.setAttribute("width", `${width}px`);
      clonedSvg.setAttribute("height", `${height}px`);
      clonedSvg.removeAttribute("style");

      // 4. 用 XMLSerializer 序列化，再以 data URL 作为 img.src（彻底避免 blob URL 污染 canvas）
      const serialized = new XMLSerializer().serializeToString(clonedSvg);
      const dataUrl = "data:image/svg+xml;charset=utf-8," + encodeURIComponent(serialized);

      const img = new Image();
      img.onload = () => {
        try {
          // 5. canvas 按 viewBox 宽高 × 2 创建
          const canvas = document.createElement("canvas");
          const scale = 2; // 2x 超清导出
          canvas.width = Math.round(width * scale);
          canvas.height = Math.round(height * scale);

          const ctx = canvas.getContext("2d");
          if (!ctx) {
            setExportStatus("error");
            setTimeout(() => setExportStatus("idle"), 2500);
            return;
          }

          // 6. 先按当前主题填背景色（浅色 #ffffff / 深色 #09090b）再 drawImage
          ctx.fillStyle = isDark ? "#09090b" : "#ffffff";
          ctx.fillRect(0, 0, canvas.width, canvas.height);
          ctx.drawImage(img, 0, 0, canvas.width, canvas.height);

          // 7. canvas.toBlob 成功后用 a[download] 触发下载，URL 用完再 revoke
          canvas.toBlob((blob) => {
            if (!blob) {
              setExportStatus("error");
              setTimeout(() => setExportStatus("idle"), 2500);
              return;
            }
            const pngUrl = URL.createObjectURL(blob);
            const a = document.createElement("a");
            a.href = pngUrl;
            a.download = `${displayTitle.replace(/[\s/\\:*?"<>|]/g, "_")}.png`;
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
            setTimeout(() => URL.revokeObjectURL(pngUrl), 1000);
            setExportStatus("idle");
          }, "image/png");
        } catch (err) {
          console.error("PNG canvas export error:", err);
          setExportStatus("error");
          setTimeout(() => setExportStatus("idle"), 2500);
        }
      };

      img.onerror = (e) => {
        console.error("PNG img load error:", e);
        setExportStatus("error");
        setTimeout(() => setExportStatus("idle"), 2500);
      };

      img.src = dataUrl;
    } catch (err) {
      console.error("PNG export prepare error:", err);
      setExportStatus("error");
      setTimeout(() => setExportStatus("idle"), 2500);
    }
  };

  return (
    <div
      className={cn(
        "my-3.5 w-full rounded-xl border border-zinc-200/90 bg-white/95 shadow-sm dark:border-zinc-800 dark:bg-zinc-950/90 overflow-hidden transition-all",
        isFullscreen &&
          "fixed inset-0 z-50 m-0 flex flex-col rounded-none border-none bg-white/98 dark:bg-zinc-950/98 backdrop-blur-md",
        className
      )}
    >
      {/* 顶部标题栏 & 操作工具栏 */}
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-zinc-200/80 bg-zinc-50/80 px-3.5 py-2 text-zinc-700 dark:border-zinc-800/80 dark:bg-zinc-900/80 dark:text-zinc-300">
        <div className="flex items-center gap-2 min-w-0">
          <Network className="size-4 shrink-0 text-blue-500" />
          <span className="truncate text-xs font-semibold tracking-wide text-zinc-900 dark:text-zinc-100">
            {displayTitle}
          </span>
          <span className="shrink-0 rounded-md bg-blue-50 px-1.5 py-0.5 text-[11px] font-medium text-blue-600 dark:bg-blue-950/50 dark:text-blue-400 border border-blue-200/60 dark:border-blue-800/60">
            {typeLabel}
          </span>
        </div>

        <div className="flex items-center gap-1 shrink-0">
          {/* 模式切换：预览 / 编辑 */}
          <button
            type="button"
            onClick={() => setIsEditing(!isEditing)}
            className={cn(
              "flex items-center gap-1 rounded-md px-2 py-1 text-xs font-medium transition-colors cursor-pointer",
              isEditing
                ? "bg-blue-100 text-blue-700 dark:bg-blue-900/60 dark:text-blue-300"
                : "text-zinc-600 hover:bg-zinc-200/70 hover:text-zinc-900 dark:text-zinc-400 dark:hover:bg-zinc-800 dark:hover:text-zinc-100"
            )}
            title={isEditing ? "返回图表预览" : "编辑 Mermaid 源码"}
          >
            {isEditing ? <Eye className="size-3.5" /> : <Code2 className="size-3.5" />}
            <span>{isEditing ? "预览" : "源码/编辑"}</span>
          </button>

          {/* 缩放控制器（仅在预览状态显示） */}
          {!isEditing && (
            <div className="flex items-center rounded-md border border-zinc-200/80 bg-white/80 dark:border-zinc-800 dark:bg-zinc-900/80 px-1">
              <button
                type="button"
                onClick={handleZoomOut}
                disabled={zoom <= 0.1}
                className="p-1 text-zinc-500 hover:text-zinc-900 dark:text-zinc-400 dark:hover:text-zinc-100 disabled:opacity-40 cursor-pointer"
                title="缩小 (Zoom Out)"
              >
                <ZoomOut className="size-3.5" />
              </button>
              <button
                type="button"
                onClick={handleZoomReset}
                className="px-1 text-[11px] font-mono text-zinc-600 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-zinc-100 cursor-pointer"
                title="重置缩放 (100%)"
              >
                {Math.round(zoom * 100)}%
              </button>
              <button
                type="button"
                onClick={handleZoomIn}
                disabled={zoom >= 6.0}
                className="p-1 text-zinc-500 hover:text-zinc-900 dark:text-zinc-400 dark:hover:text-zinc-100 disabled:opacity-40 cursor-pointer"
                title="放大 (Zoom In)"
              >
                <ZoomIn className="size-3.5" />
              </button>
              <button
                type="button"
                onClick={handleFitWindow}
                className="flex items-center gap-1 border-l border-zinc-200 dark:border-zinc-800 pl-1.5 ml-1 py-0.5 text-[11px] text-zinc-600 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-zinc-100 cursor-pointer"
                title="适应窗口"
              >
                <Scan className="size-3" />
                <span>适应窗口</span>
              </button>
            </div>
          )}

          {/* 复制代码 */}
          <button
            type="button"
            onClick={handleCopy}
            className="flex items-center gap-1 rounded-md px-2 py-1 text-xs text-zinc-600 hover:bg-zinc-200/70 hover:text-zinc-900 dark:text-zinc-400 dark:hover:bg-zinc-800 dark:hover:text-zinc-100 transition-colors cursor-pointer"
            title="复制 Mermaid 源码"
          >
            {copied ? <Check className="size-3.5 text-emerald-500" /> : <Copy className="size-3.5" />}
            <span className={copied ? "text-emerald-600 dark:text-emerald-400 font-medium" : ""}>
              {copied ? "已复制" : "复制代码"}
            </span>
          </button>

          {/* 导出 SVG */}
          <button
            type="button"
            onClick={handleExportSvg}
            disabled={!svgHtml}
            className="flex items-center gap-1 rounded-md px-2 py-1 text-xs text-zinc-600 hover:bg-zinc-200/70 hover:text-zinc-900 dark:text-zinc-400 dark:hover:bg-zinc-800 dark:hover:text-zinc-100 transition-colors cursor-pointer disabled:opacity-40"
            title="导出为矢量图 (.svg)"
          >
            <Download className="size-3.5" />
            <span>SVG</span>
          </button>

          {/* 导出 PNG */}
          <button
            type="button"
            onClick={handleExportPng}
            disabled={!svgHtml || exportStatus === "exporting"}
            className={cn(
              "flex items-center gap-1 rounded-md px-2 py-1 text-xs transition-colors cursor-pointer disabled:opacity-40",
              exportStatus === "error"
                ? "bg-red-50 text-red-600 dark:bg-red-950/50 dark:text-red-400 font-medium"
                : "text-zinc-600 hover:bg-zinc-200/70 hover:text-zinc-900 dark:text-zinc-400 dark:hover:bg-zinc-800 dark:hover:text-zinc-100"
            )}
            title="导出为高清图片 (.png)"
          >
            <ImageIcon className="size-3.5" />
            <span>
              {exportStatus === "exporting"
                ? "导出中..."
                : exportStatus === "error"
                  ? "导出失败"
                  : "PNG"}
            </span>
          </button>

          {/* 全屏切换 */}
          <button
            type="button"
            onClick={() => setIsFullscreen(!isFullscreen)}
            className="rounded-md p-1.5 text-zinc-600 hover:bg-zinc-200/70 hover:text-zinc-900 dark:text-zinc-400 dark:hover:bg-zinc-800 dark:hover:text-zinc-100 transition-colors cursor-pointer"
            title={isFullscreen ? "退出全屏" : "全屏查看"}
          >
            {isFullscreen ? <Minimize2 className="size-3.5" /> : <Maximize2 className="size-3.5" />}
          </button>
        </div>
      </div>

      {/* 主视图区域 */}
      <div
        className={cn(
          "relative w-full overflow-hidden flex items-center justify-center bg-zinc-50/40 dark:bg-zinc-900/30",
          isFullscreen ? "flex-1" : "h-[460px] min-h-[280px] max-h-[560px]"
        )}
      >
        {isEditing ? (
          /* 源码编辑模式 */
          <div className="flex h-full w-full flex-col p-4 bg-zinc-950 font-mono text-xs">
            <div className="mb-2 flex items-center justify-between text-zinc-400">
              <span className="flex items-center gap-1.5 font-medium">
                <FileCode className="size-4 text-blue-400" />
                编辑 Mermaid 源码 (直接修改实时反映)
              </span>
              <button
                type="button"
                onClick={handleRerender}
                className="flex items-center gap-1.5 rounded-md bg-blue-600 px-2.5 py-1 text-xs font-semibold text-white hover:bg-blue-500 transition-colors cursor-pointer"
              >
                <RefreshCw className="size-3" />
                重新渲染
              </button>
            </div>
            <textarea
              value={code}
              onChange={(e) => setCode(e.target.value)}
              className="flex-1 w-full resize-none rounded-lg border border-zinc-800 bg-zinc-900 p-3 font-mono text-zinc-100 outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500"
              rows={12}
              spellCheck={false}
            />
          </div>
        ) : renderError ? (
          /* 语法/渲染错误提示 */
          <div className="flex flex-col items-center justify-center p-6 text-center max-w-md">
            <AlertCircle className="size-9 text-rose-500 mb-2" />
            <h4 className="text-sm font-semibold text-zinc-900 dark:text-zinc-100 mb-1">
              Mermaid 图表解析错误
            </h4>
            <p className="text-xs text-zinc-500 dark:text-zinc-400 font-mono break-all mb-4">
              {renderError}
            </p>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => setIsEditing(true)}
                className="rounded-md bg-zinc-900 px-3 py-1.5 text-xs font-medium text-white hover:bg-zinc-800 dark:bg-zinc-100 dark:text-zinc-900 dark:hover:bg-zinc-200 cursor-pointer"
              >
                检查并编辑源码
              </button>
              <button
                type="button"
                onClick={() => {
                  setCode(initialCode);
                  setZoom(1);
                  setPan({ x: 0, y: 0 });
                  renderDiagram(initialCode);
                }}
                className="rounded-md border border-zinc-300 px-3 py-1.5 text-xs font-medium text-zinc-700 hover:bg-zinc-100 dark:border-zinc-700 dark:text-zinc-300 dark:hover:bg-zinc-800 cursor-pointer"
              >
                恢复初始代码
              </button>
            </div>
          </div>
        ) : (
          /* 可视化渲染展示 */
          <div
            ref={containerRef}
            onMouseDown={handleMouseDown}
            onClickCapture={handleClickCapture}
            className="w-full h-full max-h-full overflow-hidden flex items-center justify-center p-6 select-none relative"
            style={{
              cursor: isDragging ? "grabbing" : "grab",
              touchAction: "none",
            }}
          >
            <div
              className={cn(
                "origin-center select-none flex items-center justify-center [&>svg]:max-w-none [&>svg]:h-auto",
                isDragging ? "transition-none" : "transition-transform duration-150 ease-out"
              )}
              style={{
                transform: `translate(${pan.x}px, ${pan.y}px) scale(${zoom})`,
                pointerEvents: isDragging ? "none" : "auto",
              }}
              dangerouslySetInnerHTML={{ __html: svgHtml }}
            />
          </div>
        )}
      </div>
    </div>
  );
};
