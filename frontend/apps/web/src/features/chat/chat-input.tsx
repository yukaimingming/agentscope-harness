/**
 * 聊天输入区。
 *
 * 严格对齐 AI SDK Elements 官网规范 (https://elements.ai-sdk.dev/components/prompt-input)：
 * 1. 采用官方 PromptInput / PromptInputBody / PromptInputFooter / PromptInputTools / PromptInputSubmit 架构。
 * 2. 初始绝无白色边框：采用深邃无高亮白边的暗色系边框（border-zinc-800/80 bg-zinc-950/70）。
 * 3. 发送按钮采用官网示例：PromptInputSubmit（流式生成时自动变为停止方块，就绪时为 CornerDownLeft 回车发送图标）。
 * 4. 思考等级与推理强度升级为标准下拉选择（Dropdown / Select）样式，严格遵守模型能力约束（如 step-3.5-flash-2603 仅限 low / high）。
 */

import { useState, useRef, useEffect, useCallback, useMemo, type KeyboardEventHandler } from "react";
import {
  ChevronDownIcon,
  ChevronRightIcon,
  GitBranchIcon,
  CheckIcon,
  SettingsIcon,
  BrainIcon,
  FolderIcon,
  PlusIcon,
  MessageSquareIcon,
  HandIcon,
  ShieldCheckIcon,
  ShieldAlertIcon,
  TriangleAlertIcon,
  TerminalSquareIcon,
  GlobeIcon,
  SquarePenIcon,
  Trash2Icon,
  ArrowUpIcon,
  ClockIcon,
  ZapIcon,
  LightbulbIcon,
  XIcon,
} from "lucide-react";
import {
  PromptInput,
  PromptInputActionAddAttachments,
  PromptInputActionMenu,
  PromptInputActionMenuContent,
  PromptInputActionMenuTrigger,
  PromptInputBody,
  PromptInputFooter,
  PromptInputHeader,
  PromptInputProvider,
  PromptInputTextarea,
  PromptInputTools,
  PromptInputSubmit,
  type PromptInputMessage,
  usePromptInputAttachments,
} from "../../components/ai-elements/prompt-input.js";
import {
  REASONING_EFFORTS,
  availableEffortsForModel,
  isTwoTierModel,
  type Activity,
  type PermissionMode,
  type PublicProvider,
  type ReasoningEffort,
  type RunTokenUsage,
} from "@deepagent/shared";
import type { ChatMessage } from "./client-reducer.js";
import { StatsLine } from "./session-stats.js";
import { DropdownMenuItem } from "../../components/ui/dropdown-menu.js";
import { cn } from "../../lib/utils.js";
import { extractFolderName } from "./use-sessions.js";
import { ChatAttachmentGallery, ImagePreviewDialog, type ChatAttachment } from "./chat-attachments.js";
import { TodoCard } from "./todo-card.js";

/** 取指定提供商下某个模型实际支持的思考等级档位。 */
function getModelSupportedEfforts(
  modelName: string,
  provider?: PublicProvider,
  globalUnsupported?: boolean,
): readonly ReasoningEffort[] {
  if (provider?.reasoning?.unsupported || (globalUnsupported && !provider)) {
    return [];
  }
  const modelEfforts = availableEffortsForModel(modelName);
  if (isTwoTierModel(modelName)) {
    return modelEfforts;
  }
  if (provider?.reasoning?.perModel?.[modelName]) {
    return provider.reasoning.perModel[modelName];
  }
  if (provider?.reasoning?.efforts && provider.reasoning.efforts.length > 0) {
    return provider.reasoning.efforts.filter((e) => modelEfforts.includes(e));
  }
  return modelEfforts;
}

/**
 * 模型下拉的归并分组：按厂商 label 聚合（重复添加同名厂商时兜底合并为一个分组）。
 */
interface MergedProviderGroup {
  /** 分组键（label），同 label 的配置必然聚进同一组 */
  key: string;
  /** 厂商标签（取自分组内第一个配置） */
  label: string;
  /** 分组内原始 provider 配置（保持后端返回顺序） */
  providers: PublicProvider[];
  /** 合并去重后的模型列表 */
  models: string[];
  /** 分组内存在多个不同 baseUrl 时用于标题栏区分展示（否则为 null） */
  baseUrlNote: string | null;
  /** 任一同名配置已配 Key 即算就绪 */
  ready: boolean;
}

/** 按厂商 label 归并 providers：模型合并去重，baseUrl 不一致时生成区分标注。 */
function mergeProviderGroups(providers: PublicProvider[]): MergedProviderGroup[] {
  const groups: MergedProviderGroup[] = [];
  const byLabel = new Map<string, MergedProviderGroup>();
  for (const prov of providers) {
    if (!prov.enabled || !prov.models || prov.models.length === 0) continue;
    let group = byLabel.get(prov.label);
    if (!group) {
      group = { key: prov.label, label: prov.label, providers: [], models: [], baseUrlNote: null, ready: false };
      byLabel.set(prov.label, group);
      groups.push(group);
    }
    group.providers.push(prov);
    for (const m of prov.models) {
      if (!group.models.includes(m)) group.models.push(m);
    }
    group.ready = group.ready || prov.hasApiKey;
  }
  for (const group of groups) {
    const baseUrls = [...new Set(group.providers.map((p) => p.baseUrl))];
    if (baseUrls.length > 1) group.baseUrlNote = baseUrls.join(" · ");
  }
  return groups;
}

/**
 * 归并分组内的模型点击时定位实际 provider：
 * 优先当前 activeProviderId（须含该模型），其次该分组下第一个启用且已配 Key 的 provider。
 */
function resolveGroupModelProvider(
  group: MergedProviderGroup,
  model: string,
  activeProviderId?: string | null,
): PublicProvider {
  const withModel = group.providers.filter((p) => p.models.includes(model));
  const active = activeProviderId
    ? withModel.find((p) => p.id === activeProviderId)
    : undefined;
  if (active) return active;
  return withModel.find((p) => p.enabled && p.hasApiKey) ?? withModel[0] ?? group.providers[0]!;
}

export interface QueuedPrompt {
  id: string;
  text: string;
  attachments: ChatAttachment[];
  createdAt: number;
}

interface ChatInputProps {
  messages?: ChatMessage[];
  activities?: Activity[];
  onSend: (content: string, attachments: ChatAttachment[]) => void;
  onStop: () => void;
  isRunning: boolean;
  effort: ReasoningEffort;
  onEffortChange: (effort: ReasoningEffort) => void;
  supportedEfforts: readonly ReasoningEffort[];
  reasoningUnsupported: boolean;
  fallbackApplied: boolean;
  /** 用户原始请求的推理档位（fallbackApplied 时用于显示降级说明）。 */
  requestedEffort?: ReasoningEffort;
  modelStatus: string;
  modelStatusKind: "ok" | "warn" | "error";
  disabled?: boolean;
  /** 当处于禁用/未配置状态被用户触发发送时的拦截回调 */
  onBlockedSend?: (reason: string) => void;
  /** 可供下拉切换的模型列表 */
  availableModels?: string[];
  /** 当前选中的模型 ID */
  currentModel?: string | null;
  /** 切换模型回调 */
  onSelectModel?: (model: string) => void;
  /** 所有已配置的模型厂商列表（用于按厂商分组选择模型） */
  providers?: PublicProvider[];
  /** 当前选中的厂商 ID */
  activeProviderId?: string | null;
  /** 按厂商与模型一键切换回调 */
  onSelectProviderModel?: (providerId: string, modelId: string) => void;
  /** 打开模型设置模态框 */
  onOpenSettings?: () => void;
  /** 当前工作区根目录（若为空或 null 则为直接聊天模式） */
  workspaceRoot?: string | null;
  /** 已添加的工作区列表 */
  customWorkspaces?: string[];
  /** 选择工作区或切换至直接聊天模式（传 null） */
  onSelectWorkspace?: (path: string | null) => void;
  /** 打开系统文件夹选择器弹窗 */
  onOpenFolderPicker?: () => void;
  /** 点击 Git 分支徽标时触发（例如打开代码审查/Git面板） */
  onOpenGitReview?: () => void;
  /** 最近一次运行的 Token 用量（无数据时显示占位提示）。 */
  usage?: RunTokenUsage | null;
  /** 当前会话最新待办计划，显示在输入框上方。 */
  todoActivity?: Activity | null;
  /** 当前会话最近一份待办计划。 */
  permissionMode: PermissionMode;
  onPermissionModeChange: (mode: PermissionMode) => void;
  /** 计划模式：独立勾选，开启后代理先输出实施计划，待确认后再执行（参考 ZCode 开源仓库实现）。*/
  planEnabled?: boolean;
  onPlanEnabledChange?: (enabled: boolean) => void;
  /** 网络搜索：仅勾选时本轮运行才挂载 web_search 工具（参照 Maf Harness web-search-menu-item）。*/
  webSearch?: boolean;
  onWebSearchChange?: (value: boolean) => void;
}

const PERMISSION_OPTIONS: Array<{
  mode: PermissionMode;
  label: string;
  description: string;
  Icon: typeof HandIcon;
}> = [
  {
    mode: "ask",
    label: "请求批准",
    description: "写入、修改、删除文件或运行命令时逐项确认",
    Icon: HandIcon,
  },
  {
    mode: "auto",
    label: "帮我批准",
    description: "自动处理写入和修改；删除文件或运行命令时确认",
    Icon: ShieldCheckIcon,
  },
  {
    mode: "full",
    label: "完全访问权限",
    description: "跳过逐项审批；访问范围取决于服务端开放的工具",
    Icon: ShieldAlertIcon,
  },
];

const ACCEPTED_ATTACHMENT_TYPES =
  "image/*,application/pdf,text/plain,text/markdown,text/csv,application/json,application/xml,text/html,application/x-yaml,text/yaml";
const MAX_ATTACHMENT_COUNT = 4;
const MAX_ATTACHMENT_SIZE = 5 * 1024 * 1024;
const MAX_TOTAL_ATTACHMENT_SIZE = 12 * 1024 * 1024;

function PromptInputAttachmentsDisplay({
  onPreview,
}: {
  onPreview: (file: ChatAttachment) => void;
}) {
  const attachments = usePromptInputAttachments();
  if (attachments.files.length === 0) {
    return null;
  }
  return (
    <ChatAttachmentGallery
      files={attachments.files}
      onPreview={onPreview}
      onRemove={attachments.remove}
    />
  );
}

interface PromptInputComposerProps {
  text: string;
  setText: (v: string) => void;
  hasText: boolean;
  isRunning: boolean;
  disabled: boolean;
  queuedPrompts: QueuedPrompt[];
  onEnqueue: (text: string, files: ChatAttachment[]) => void;
  onSteer: (text: string, files: ChatAttachment[]) => void;
  onExecuteQueued: (id: string) => void;
  onSubmit: (message: PromptInputMessage) => void;
  onAttachmentError: (error: { code: "max_files" | "max_file_size" | "accept" }) => void;
  setPreviewAttachment: (file: ChatAttachment | null) => void;
  permissionMode: PermissionMode;
  isPermissionDropdownOpen: boolean;
  setIsPermissionDropdownOpen: React.Dispatch<React.SetStateAction<boolean>>;
  selectPermissionMode: (mode: PermissionMode) => void;
  permissionDropdownRef: React.RefObject<HTMLDivElement | null>;
  currentModel?: string | null;
  modelStatus: string;
  isModelDropdownOpen: boolean;
  setIsModelDropdownOpen: React.Dispatch<React.SetStateAction<boolean>>;
  availableModels: string[];
  onSelectModel?: (model: string) => void;
  providers: PublicProvider[];
  activeProviderId?: string | null;
  onSelectProviderModel?: (providerId: string, modelId: string) => void;
  onOpenSettings?: () => void;
  modelDropdownRef: React.RefObject<HTMLDivElement | null>;
  messages: ChatMessage[];
  activities: Activity[];
  usage?: RunTokenUsage | null;
  reasoningUnsupported: boolean;
  effortDropdownRef: React.RefObject<HTMLDivElement | null>;
  isEffortDropdownOpen: boolean;
  setIsEffortDropdownOpen: React.Dispatch<React.SetStateAction<boolean>>;
  effortLabel: string;
  fallbackApplied: boolean;
  requestedEffort?: ReasoningEffort;
  effort: ReasoningEffort;
  supportedEfforts: readonly ReasoningEffort[];
  onEffortChange: (effort: ReasoningEffort) => void;
  onStop: () => void;
  /** 计划模式：独立勾选，开启后代理先输出实施计划，待确认后再执行（参考 ZCode 开源仓库实现）。*/
  planEnabled?: boolean;
  onPlanEnabledChange?: (enabled: boolean) => void;
  /** 网络搜索：仅勾选时本轮运行才挂载 web_search 工具（参照 Maf Harness web-search-menu-item）。*/
  webSearch?: boolean;
  onWebSearchChange?: (value: boolean) => void;
}

function PromptInputComposer({
  text,
  setText,
  hasText,
  isRunning,
  disabled,
  queuedPrompts,
  onEnqueue,
  onSteer,
  onExecuteQueued,
  onSubmit,
  onAttachmentError,
  setPreviewAttachment,
  permissionMode,
  planEnabled,
  onPlanEnabledChange,
  webSearch,
  onWebSearchChange,
  isPermissionDropdownOpen,
  setIsPermissionDropdownOpen,
  selectPermissionMode,
  permissionDropdownRef,
  currentModel,
  modelStatus,
  isModelDropdownOpen,
  setIsModelDropdownOpen,
  availableModels,
  onSelectModel,
  providers,
  activeProviderId,
  onSelectProviderModel,
  onOpenSettings,
  modelDropdownRef,
  messages,
  activities,
  usage,
  reasoningUnsupported,
  effortDropdownRef,
  isEffortDropdownOpen,
  setIsEffortDropdownOpen,
  effortLabel,
  fallbackApplied,
  requestedEffort,
  effort,
  supportedEfforts,
  onEffortChange,
  onStop,
}: PromptInputComposerProps) {
  const attachments = usePromptInputAttachments();
  const hasContent = hasText || attachments.files.length > 0;

  const [hoveredModel, setHoveredModel] = useState<{
    provId?: string;
    model: string;
  } | null>(null);
  const [submenuTop, setSubmenuTop] = useState<number>(0);
  const menuPanelRef = useRef<HTMLDivElement>(null);
  const closeTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (!isModelDropdownOpen) {
      setHoveredModel(null);
    }
  }, [isModelDropdownOpen]);

  useEffect(() => {
    return () => {
      if (closeTimerRef.current) {
        clearTimeout(closeTimerRef.current);
      }
    };
  }, []);

  const handleModelMouseEnter = (
    provId: string | undefined,
    modelId: string,
    e: React.MouseEvent<HTMLElement>,
  ) => {
    if (closeTimerRef.current) {
      clearTimeout(closeTimerRef.current);
      closeTimerRef.current = null;
    }
    const rect = e.currentTarget.getBoundingClientRect();
    const parentRect = menuPanelRef.current?.getBoundingClientRect();
    if (parentRect) {
      const offset = rect.top - parentRect.top;
      const maxTop = Math.max(0, parentRect.height - 130);
      setSubmenuTop(Math.min(Math.max(0, offset), maxTop));
    }
    setHoveredModel({ provId, model: modelId });
  };

  const handleModelMouseLeave = () => {
    closeTimerRef.current = setTimeout(() => {
      setHoveredModel(null);
    }, 150);
  };

  const handleSubmenuMouseEnter = () => {
    if (closeTimerRef.current) {
      clearTimeout(closeTimerRef.current);
      closeTimerRef.current = null;
    }
  };

  const handleSubmenuMouseLeave = () => {
    closeTimerRef.current = setTimeout(() => {
      setHoveredModel(null);
    }, 150);
  };

  const handleKeyDown: KeyboardEventHandler<HTMLTextAreaElement> = (e) => {
    if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) {
      if (e.ctrlKey || e.metaKey) {
        // Ctrl+Enter / Cmd+Enter: 立即引导
        e.preventDefault();
        const currentFiles = attachments.files as ChatAttachment[];
        if (hasContent) {
          onSteer(text, currentFiles);
          attachments.clear();
        } else if (queuedPrompts.length > 0 && queuedPrompts[0]) {
          onExecuteQueued(queuedPrompts[0].id);
        }
        return;
      }

      if (isRunning) {
        // 模型正在生成中，普通 Enter 默认为排队
        const currentFiles = attachments.files as ChatAttachment[];
        if (hasContent) {
          e.preventDefault();
          onEnqueue(text, currentFiles);
          attachments.clear();
        }
        return;
      }
    }
  };

  const placeholderText =
    queuedPrompts.length > 0
      ? "Cmd/Ctrl+Enter 快捷发送全部排队消息（或按 Enter 继续排队）"
      : isRunning
        ? "模型回复中... 输入内容按 Enter 排队，Ctrl+Enter 立即引导"
        : "输入任务描述...（Enter 发送，Shift+Enter 换行）";

  return (
    <PromptInput
      onSubmit={onSubmit}
      accept={ACCEPTED_ATTACHMENT_TYPES}
      multiple
      globalDrop
      maxFiles={MAX_ATTACHMENT_COUNT}
      maxFileSize={MAX_ATTACHMENT_SIZE}
      onError={onAttachmentError}
      className="chat-prompt-input rounded-2xl border border-zinc-200 bg-white dark:border-zinc-800/80 dark:bg-[#18181b] shadow-xs dark:shadow-md focus-within:border-zinc-400 dark:focus-within:border-zinc-600 focus-within:ring-0 transition-colors overflow-visible relative outline-none"
    >
      {attachments.files.length > 0 && (
        <PromptInputHeader className="px-3 pt-3">
          <PromptInputAttachmentsDisplay onPreview={(f) => setPreviewAttachment(f)} />
        </PromptInputHeader>
      )}
      <PromptInputBody>
        <PromptInputTextarea
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder={placeholderText}
          className="chat-prompt-textarea block w-full text-left align-top min-h-[44px] max-h-[220px] px-3.5 pt-3 pb-1 text-[14px] leading-relaxed text-zinc-900 dark:text-zinc-100 placeholder:text-zinc-400 dark:placeholder:text-zinc-600 focus:outline-none border-0 shadow-none focus-visible:ring-0 bg-transparent"
        />
      </PromptInputBody>

      {/* 底部工具条与提交按钮 */}
      <PromptInputFooter className="flex items-center justify-between px-3 pb-2.5 pt-1.5 border-0 border-none overflow-visible relative">
        <PromptInputTools className="flex-1 min-w-0 flex items-center gap-1.5 text-[12px] flex-nowrap overflow-visible">
          <PromptInputActionMenu>
            <PromptInputActionMenuTrigger
              aria-label="添加图片或文件"
              title="添加图片或文件"
              className="chat-action-menu-btn size-8 rounded-lg text-zinc-500 hover:text-zinc-900 hover:bg-zinc-100 dark:text-zinc-300 dark:hover:bg-zinc-800/70 dark:hover:text-white border-0 border-none outline-none focus:outline-none focus-visible:ring-0 shadow-none transition-colors shrink-0"
            />
            <PromptInputActionMenuContent className="border-zinc-200 bg-white text-zinc-900 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-100">
              <PromptInputActionAddAttachments label="添加图片或文件" />
              {/* 联网搜索开关：仅勾选时本轮运行挂载 web_search 工具（preventDefault 保持菜单开启便于切换，参照 Maf Harness） */}
              <DropdownMenuItem
                data-testid="web-search-menu-item"
                onSelect={(event) => {
                  event.preventDefault();
                  onWebSearchChange?.(!webSearch);
                }}
                className={webSearch ? "bg-blue-500/10 text-blue-600 dark:text-blue-400" : undefined}
              >
                <GlobeIcon className="mr-2 size-4" />
                网络搜索
                {webSearch && <CheckIcon className="ml-auto size-4 text-blue-500 dark:text-blue-400" />}
              </DropdownMenuItem>
            </PromptInputActionMenuContent>
          </PromptInputActionMenu>

          {/* 运行权限选择：只影响后续发起的运行。 */}
          <div className="relative shrink-0" ref={permissionDropdownRef}>
            <button
              type="button"
              data-testid="permission-mode-selector"
              data-permission-mode={permissionMode}
              aria-label={`权限模式：${PERMISSION_OPTIONS.find((option) => option.mode === permissionMode)?.label ?? "请求批准"}`}
              onClick={() => {
                setIsPermissionDropdownOpen((open) => !open);
                setIsModelDropdownOpen(false);
                setIsEffortDropdownOpen(false);
              }}
              className={cn(
                "composer-selector flex items-center gap-1.5 rounded-md bg-transparent px-2 py-1 transition-colors border-0 border-none outline-none focus:outline-none shadow-none whitespace-nowrap shrink-0",
                permissionMode === "full"
                  ? "text-red-500 hover:bg-red-500/10 hover:text-red-400 font-semibold"
                  : "text-zinc-300 hover:bg-zinc-800/70 hover:text-white font-medium",
              )}
              title="选择本次及后续运行的工具审批方式"
            >
              {(() => {
                const option = PERMISSION_OPTIONS.find((item) => item.mode === permissionMode) ?? PERMISSION_OPTIONS[0]!;
                return <option.Icon className={cn("size-3.5 shrink-0", permissionMode === "full" ? "text-red-500" : "text-zinc-400")} />;
              })()}
              <span className={cn("text-[11.5px] whitespace-nowrap", permissionMode === "full" ? "text-red-500 font-semibold" : "font-medium")}>
                {PERMISSION_OPTIONS.find((option) => option.mode === permissionMode)?.label ?? "请求批准"}
              </span>
              <ChevronDownIcon className={cn("size-3 transition-transform shrink-0", permissionMode === "full" ? "text-red-500/80" : "text-zinc-500", isPermissionDropdownOpen && "rotate-180")} />
            </button>

            {isPermissionDropdownOpen && (
              <div className="workspace-dropdown-panel composer-menu absolute bottom-full left-0 z-50 mb-2 w-[min(21rem,calc(100vw-2rem))] rounded-xl border border-zinc-700/70 bg-[#242427] p-1.5 shadow-2xl animate-in fade-in zoom-in-95 duration-100">
                {/* 计划模式：独立勾选，不与权限模式互斥（参考 ZCode 开源仓库 V4ComposerModeControls 实现） */}
                <button
                  type="button"
                  data-testid="plan-mode-toggle"
                  aria-pressed={planEnabled}
                  onClick={() => onPlanEnabledChange?.(!planEnabled)}
                  title="开启后代理先输出实施计划，待确认后再执行"
                  className={cn(
                    "flex w-full items-center gap-3 rounded-lg px-2.5 py-2 text-left transition-colors border",
                    planEnabled
                      ? "bg-[#2f2f35] text-zinc-100 border-transparent font-medium"
                      : "hover:bg-[#2f2f35] text-zinc-300 border border-transparent",
                  )}
                >
                  <LightbulbIcon className={cn("size-5 shrink-0", planEnabled ? "text-zinc-100" : "text-zinc-300")} />
                  <span className="min-w-0 flex-1">
                    <span className="block text-[13px] font-medium">计划模式</span>
                    <span className="block text-[11.5px] leading-snug text-zinc-400">编辑前先出计划。</span>
                  </span>
                  {planEnabled && <CheckIcon className={cn("size-4 shrink-0", "text-zinc-200")} />}
                </button>
                <div role="separator" className="my-1 h-px shrink-0 bg-zinc-700/70" />

                {PERMISSION_OPTIONS.map(({ mode, label, description, Icon }) => {
                  const isSelected = permissionMode === mode;
                  const isFull = mode === "full";
                  return (
                    <button
                      key={mode}
                      type="button"
                      data-testid={`permission-mode-${mode}`}
                      data-permission-mode={mode}
                      aria-pressed={isSelected}
                      onClick={() => {
                        selectPermissionMode(mode);
                      }}
                      className={cn(
                        "flex w-full items-center gap-3 rounded-lg px-2.5 py-2 text-left transition-colors",
                        isFull
                          ? isSelected
                            ? "bg-red-500/15 border border-red-500/35 text-red-500 shadow-xs"
                            : "text-red-500 hover:bg-red-500/10 border border-transparent"
                          : isSelected
                            ? "bg-[#2f2f35] text-zinc-100 border border-transparent"
                            : "hover:bg-[#2f2f35] text-zinc-300 border border-transparent",
                      )}
                    >
                      <Icon className={cn("size-5 shrink-0", isFull ? "text-red-500" : "text-zinc-300")} />
                      <span className="min-w-0 flex-1">
                        <span className={cn("block text-[13px] font-medium", isFull ? "text-red-500 font-semibold" : "")}>
                          {label}
                        </span>
                        <span className={cn("block text-[11.5px] leading-snug", isFull ? "text-red-400" : "text-zinc-400")}>
                          {description}
                        </span>
                      </span>
                      {isSelected && <CheckIcon className={cn("size-4 shrink-0", isFull ? "text-red-500" : "text-zinc-200")} />}
                    </button>
                  );
                })}
              </div>
            )}
          </div>

          {/* 计划模式标记：开启后显示，点击关闭（参考 ZCode 开源仓库实现） */}
          {planEnabled && (
            <span data-testid="plan-mode-marker" className="flex shrink-0 items-center gap-1">
              <span role="separator" aria-orientation="vertical" className="h-3 w-px shrink-0 bg-zinc-700" />
              <button
                type="button"
                data-testid="plan-mode-marker-close"
                onClick={() => onPlanEnabledChange?.(false)}
                title="取消下一次提交的计划模式"
                aria-label="取消计划模式"
                className="group/plan composer-selector flex items-center gap-1.5 rounded-md bg-transparent px-2 py-1 text-zinc-300 transition-colors hover:bg-zinc-800/70 hover:text-white border-0 border-none outline-none focus:outline-none shadow-none whitespace-nowrap"
              >
                <LightbulbIcon className="size-3.5 shrink-0 group-hover/plan:hidden" />
                <XIcon className="hidden size-3.5 shrink-0 group-hover/plan:block" />
                <span className="text-[11.5px] font-medium">计划模式</span>
              </button>
            </span>
          )}

          {/* 网络搜索标记：勾选后显示，点击关闭（参照本文件计划模式标记与 Maf Harness） */}
          {webSearch && (
            <span data-testid="web-search-marker" className="flex shrink-0 items-center gap-1">
              <span role="separator" aria-orientation="vertical" className="h-3 w-px shrink-0 bg-zinc-700" />
              <button
                type="button"
                data-testid="web-search-marker-close"
                onClick={() => onWebSearchChange?.(false)}
                title="取消下一次提交的网络搜索"
                aria-label="取消网络搜索"
                className="group/websearch composer-selector flex items-center gap-1.5 rounded-md bg-transparent px-2 py-1 text-zinc-300 transition-colors hover:bg-zinc-800/70 hover:text-white border-0 border-none outline-none focus:outline-none shadow-none whitespace-nowrap"
              >
                <GlobeIcon className="size-3.5 shrink-0 group-hover/websearch:hidden" />
                <XIcon className="hidden size-3.5 shrink-0 group-hover/websearch:block" />
                <span className="text-[11.5px] font-medium">网络搜索</span>
              </button>
            </span>
          )}

          {/* 模型选择与推理等级子菜单 */}
          <div className="relative shrink-0" ref={modelDropdownRef}>
            <button
              type="button"
              data-testid="model-effort-selector-trigger"
              onClick={() => {
                setIsModelDropdownOpen((v) => !v);
                setIsEffortDropdownOpen(false);
                setIsPermissionDropdownOpen(false);
              }}
              className="composer-selector flex items-center gap-1.5 rounded-md bg-transparent px-2.5 py-1 text-zinc-700 hover:bg-zinc-100 hover:text-zinc-900 dark:text-zinc-300 transition-colors dark:hover:bg-zinc-800/70 dark:hover:text-white border-0 border-none outline-none focus:outline-none shadow-none whitespace-nowrap shrink-0 cursor-pointer"
              title={
                reasoningUnsupported
                  ? "点击切换模型（当前模型不支持调节思考等级）"
                  : fallbackApplied
                    ? `点击切换模型（当前模型不支持「${requestedEffort === "high" ? "高" : requestedEffort === "medium" ? "中" : "低"}」档位，已自动降级至「${effortLabel}」）`
                    : `当前模型：${currentModel || modelStatus}`
              }
            >
              {/* 模型状态圆点 */}
              <span className="size-1.5 rounded-full bg-emerald-400 shrink-0" />

              {/* 模型名 */}
              <span className="font-mono truncate max-w-[160px] sm:max-w-[220px] text-[11.5px] whitespace-nowrap">
                {currentModel || modelStatus}
              </span>

              {/* 思考等级降级指示圆点 */}
              {fallbackApplied && (
                <span
                  className="size-1.5 rounded-full bg-amber-400 shrink-0"
                  aria-label="推理强度已降级"
                />
              )}

              {/* 下拉箭头 */}
              <ChevronDownIcon
                className={cn(
                  "size-3 text-zinc-400 dark:text-zinc-500 shrink-0 ml-0.5 transition-transform",
                  isModelDropdownOpen && "rotate-180"
                )}
              />
            </button>

            {/* 弹出式合并下拉面板（按厂商分组展示模型列表，悬停右侧滑出思考等级子菜单） */}
            {isModelDropdownOpen && (
              <div
                ref={menuPanelRef}
                data-testid="model-selector-dropdown"
                className="workspace-dropdown-panel composer-menu absolute bottom-full mb-2 left-0 z-50 w-72 sm:w-80 rounded-xl border border-zinc-200 bg-white text-zinc-800 shadow-2xl dark:border-zinc-800 dark:bg-[#242427] dark:text-zinc-100 p-1.5 animate-in fade-in zoom-in-95 duration-100 overflow-visible"
              >
                {(() => {
                  const mergedGroups = mergeProviderGroups(providers);
                  const totalGroupedModels = mergedGroups.reduce(
                    (acc, g) => acc + g.models.length,
                    0
                  );

                  return (
                    <>
                      <div className="px-2 py-1 text-[11px] font-semibold text-zinc-500 dark:text-zinc-400 uppercase tracking-wider flex items-center justify-between">
                        <span>模型</span>
                        {(totalGroupedModels > 0 || availableModels.length > 0) && (
                          <span className="font-normal text-[10.5px]">
                            {mergedGroups.length > 0
                              ? `${mergedGroups.length} 厂商 · ${totalGroupedModels} 模型`
                              : `${availableModels.length} 模型`}
                          </span>
                        )}
                      </div>

                      <div className="max-h-72 overflow-y-auto space-y-2 my-1 pr-0.5 scrollbar-thin scrollbar-thumb-zinc-700">
                        {mergedGroups.length > 0 ? (
                          mergedGroups.map((group) => {
                            const primary = group.providers[0]!;
                            const isCurrentProvider = group.providers.some(
                              (p) => p.id === activeProviderId
                            );
                            return (
                              <div
                                key={group.key}
                                data-testid={`provider-group-${primary.id}`}
                                className="space-y-0.5"
                              >
                                {/* 厂商分组标题栏（同 label 多配置已归并；baseUrl 不一致时附加标注区分） */}
                                <div className="flex items-center justify-between gap-1 px-2 py-1 text-[11px] font-semibold text-zinc-500 dark:text-zinc-400 bg-zinc-50/80 dark:bg-zinc-900/50 rounded-md">
                                  <span className="truncate min-w-0">
                                    {group.label}
                                    {group.baseUrlNote && (
                                      <span
                                        className="ml-1 text-[9.5px] font-normal text-zinc-400 dark:text-zinc-500"
                                        title={group.baseUrlNote}
                                      >
                                        ({group.baseUrlNote})
                                      </span>
                                    )}
                                  </span>
                                  <span
                                    className={cn(
                                      "text-[10px] px-1.5 py-0.2 rounded font-normal shrink-0",
                                      isCurrentProvider
                                        ? "bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 font-medium"
                                        : group.ready
                                          ? "bg-zinc-200/70 text-zinc-600 dark:bg-zinc-800 dark:text-zinc-400"
                                          : "bg-amber-500/15 text-amber-600 dark:text-amber-400"
                                    )}
                                  >
                                    {isCurrentProvider ? "当前厂商" : group.ready ? "已就绪" : "未填 Key"}
                                  </span>
                                </div>

                                {/* 模型单列列表 */}
                                <div className="space-y-0.5 pl-1">
                                  {group.models.map((m) => {
                                    const modelProv = resolveGroupModelProvider(
                                      group,
                                      m,
                                      activeProviderId
                                    );
                                    const isSelected = isCurrentProvider && currentModel === m;
                                    const isHovered =
                                      hoveredModel?.provId === modelProv.id && hoveredModel?.model === m;

                                    return (
                                      <div
                                        key={`${modelProv.id}:${m}`}
                                        data-testid={`model-option-${modelProv.id}-${m}`}
                                        role="button"
                                        tabIndex={0}
                                        onMouseEnter={(e) => handleModelMouseEnter(modelProv.id, m, e)}
                                        onMouseLeave={handleModelMouseLeave}
                                        onClick={() => {
                                          if (onSelectProviderModel) {
                                            onSelectProviderModel(modelProv.id, m);
                                          } else {
                                            onSelectModel?.(m);
                                          }
                                          setIsModelDropdownOpen(false);
                                          setHoveredModel(null);
                                        }}
                                        onKeyDown={(e) => {
                                          if (e.key === "Enter" || e.key === " ") {
                                            e.preventDefault();
                                            if (onSelectProviderModel) {
                                              onSelectProviderModel(modelProv.id, m);
                                            } else {
                                              onSelectModel?.(m);
                                            }
                                            setIsModelDropdownOpen(false);
                                            setHoveredModel(null);
                                          }
                                        }}
                                        className={cn(
                                          "group/item flex items-center justify-between px-2.5 py-1.5 rounded-md text-[12px] font-mono text-left cursor-pointer transition-colors select-none",
                                          isSelected
                                            ? "bg-zinc-100 text-zinc-900 dark:bg-[#2f2f35] dark:text-white font-medium"
                                            : isHovered
                                              ? "bg-zinc-100/70 text-zinc-900 dark:bg-[#2a2a2f] dark:text-zinc-100"
                                              : "text-zinc-700 hover:bg-zinc-100 dark:text-zinc-300 dark:hover:bg-[#2f2f35] dark:hover:text-zinc-100"
                                        )}
                                      >
                                        <span className="truncate">{m}</span>

                                        <div className="flex items-center gap-1 shrink-0 ml-2">
                                          {isSelected && (
                                            <CheckIcon className="size-3.5 text-emerald-500 dark:text-emerald-400 shrink-0" />
                                          )}
                                          <ChevronRightIcon
                                            className={cn(
                                              "size-3 transition-colors",
                                              isHovered
                                                ? "text-zinc-600 dark:text-zinc-200"
                                                : "text-zinc-400/60 dark:text-zinc-500/60 group-hover/item:text-zinc-600 dark:group-hover/item:text-zinc-300"
                                            )}
                                          />
                                        </div>
                                      </div>
                                    );
                                  })}
                                </div>
                              </div>
                            );
                          })
                        ) : availableModels.length === 0 ? (
                          <div className="px-2 py-2 text-[11.5px] text-zinc-500 text-center">
                            暂无可用模型，请在设置中配置
                          </div>
                        ) : (
                          /* availableModels 兜底 */
                          <div className="space-y-0.5">
                            {availableModels.map((m) => {
                              const isSelected = currentModel === m;
                              const isHovered =
                                hoveredModel?.model === m && !hoveredModel?.provId;

                              return (
                                <div
                                  key={m}
                                  data-testid={`model-option-${m}`}
                                  role="button"
                                  tabIndex={0}
                                  onMouseEnter={(e) => handleModelMouseEnter(undefined, m, e)}
                                  onMouseLeave={handleModelMouseLeave}
                                  onClick={() => {
                                    onSelectModel?.(m);
                                    setIsModelDropdownOpen(false);
                                    setHoveredModel(null);
                                  }}
                                  onKeyDown={(e) => {
                                    if (e.key === "Enter" || e.key === " ") {
                                      e.preventDefault();
                                      onSelectModel?.(m);
                                      setIsModelDropdownOpen(false);
                                      setHoveredModel(null);
                                    }
                                  }}
                                  className={cn(
                                    "group/item flex items-center justify-between px-2.5 py-1.5 rounded-md text-[12px] font-mono text-left cursor-pointer transition-colors select-none",
                                    isSelected
                                      ? "bg-zinc-100 text-zinc-900 dark:bg-[#2f2f35] dark:text-white font-medium"
                                      : isHovered
                                        ? "bg-zinc-100/70 text-zinc-900 dark:bg-[#2a2a2f] dark:text-zinc-100"
                                        : "text-zinc-700 hover:bg-zinc-100 dark:text-zinc-300 dark:hover:bg-[#2f2f35] dark:hover:text-zinc-100"
                                  )}
                                >
                                  <span className="truncate">{m}</span>

                                  <div className="flex items-center gap-1 shrink-0 ml-2">
                                    {isSelected && (
                                      <CheckIcon className="size-3.5 text-emerald-500 dark:text-emerald-400 shrink-0" />
                                    )}
                                    <ChevronRightIcon
                                      className={cn(
                                        "size-3 transition-colors",
                                        isHovered
                                          ? "text-zinc-600 dark:text-zinc-200"
                                          : "text-zinc-400/60 dark:text-zinc-500/60 group-hover/item:text-zinc-600 dark:group-hover/item:text-zinc-300"
                                      )}
                                    />
                                  </div>
                                </div>
                              );
                            })}
                          </div>
                        )}
                      </div>
                    </>
                  );
                })()}

                {onOpenSettings && (
                  <div className="pt-1 border-t border-zinc-200 dark:border-zinc-800/80">
                    <button
                      type="button"
                      onClick={() => {
                        setIsModelDropdownOpen(false);
                        setHoveredModel(null);
                        onOpenSettings();
                      }}
                      className="flex w-full items-center gap-1.5 px-2 py-1 text-[11.5px] text-zinc-600 hover:text-zinc-900 hover:bg-zinc-100 dark:text-zinc-400 dark:hover:text-zinc-200 dark:hover:bg-zinc-900 rounded transition-colors cursor-pointer"
                    >
                      <SettingsIcon className="size-3 text-zinc-500" />
                      <span>管理模型与提供商...</span>
                    </button>
                  </div>
                )}

                {/* 鼠标悬停模型项时向右滑出的推理等级次级子菜单 */}
                {hoveredModel && (
                  <div
                    data-testid="effort-submenu"
                    onMouseEnter={handleSubmenuMouseEnter}
                    onMouseLeave={handleSubmenuMouseLeave}
                    style={{ top: Math.max(0, submenuTop) }}
                    className="absolute left-[calc(100%+4px)] z-50 w-44 rounded-xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-[#242427] text-zinc-900 dark:text-zinc-100 p-1.5 shadow-xl dark:shadow-2xl animate-in fade-in zoom-in-95 duration-100 before:absolute before:-left-2 before:top-0 before:bottom-0 before:w-2"
                  >
                    <div className="px-2 py-1 text-[10.5px] font-semibold text-zinc-500 dark:text-zinc-400 uppercase tracking-wider flex items-center justify-between border-b border-zinc-100 dark:border-zinc-800/60 pb-1 mb-1">
                      <span className="flex items-center gap-1">
                        <BrainIcon className="size-3 text-zinc-400 shrink-0" />
                        <span>思考等级</span>
                      </span>
                      <span className="font-mono text-[10px] text-zinc-400 truncate max-w-[70px]">
                        {hoveredModel.model}
                      </span>
                    </div>

                    <div className="space-y-0.5">
                      {REASONING_EFFORTS.map((opt) => {
                        const isHoveredModelActive =
                          (hoveredModel.provId ? hoveredModel.provId === activeProviderId : true) &&
                          currentModel === hoveredModel.model;

                        const activeProvObj = hoveredModel.provId
                          ? providers.find((p) => p.id === hoveredModel.provId)
                          : undefined;

                        const modelSupported = isHoveredModelActive
                          ? (reasoningUnsupported ? [] : supportedEfforts)
                          : getModelSupportedEfforts(
                              hoveredModel.model,
                              activeProvObj,
                              reasoningUnsupported
                            );

                        const supported = modelSupported.includes(opt);
                        const isSelected = isHoveredModelActive && effort === opt;
                        const optTitle =
                          opt === "high" ? "高 (high)" : opt === "medium" ? "中 (medium)" : "低 (low)";
                        const optDesc =
                          opt === "high" ? "深度思考" : opt === "medium" ? "均衡推理" : "快速响应";

                        if (!supported) {
                          return (
                            <div
                              key={opt}
                              data-testid={`effort-option-${opt}`}
                              className="flex items-center justify-between px-2 py-1.5 rounded-md text-[11.5px] text-zinc-400 dark:text-zinc-600 cursor-not-allowed select-none line-through opacity-50"
                              title="当前模型不支持此档位"
                            >
                              <span>{optTitle}</span>
                              <span className="text-[9.5px] font-normal no-underline">不支持</span>
                            </div>
                          );
                        }

                        return (
                          <button
                            key={opt}
                            type="button"
                            data-testid={`effort-option-${opt}`}
                            onClick={(e) => {
                              e.stopPropagation();
                              if (!isHoveredModelActive) {
                                if (hoveredModel.provId && onSelectProviderModel) {
                                  onSelectProviderModel(hoveredModel.provId, hoveredModel.model);
                                } else {
                                  onSelectModel?.(hoveredModel.model);
                                }
                              }
                              onEffortChange(opt);
                              setIsModelDropdownOpen(false);
                              setHoveredModel(null);
                            }}
                            className={cn(
                              "flex w-full items-center justify-between px-2 py-1.5 rounded-md text-[11.5px] text-left transition-colors cursor-pointer",
                              isSelected
                                ? "bg-zinc-100 text-zinc-900 dark:bg-[#2f2f35] dark:text-white font-medium"
                                : "text-zinc-700 hover:bg-zinc-100 dark:text-zinc-300 dark:hover:bg-[#2f2f35] dark:hover:text-zinc-100"
                            )}
                          >
                            <div className="flex flex-col min-w-0">
                              <span className="truncate">{optTitle}</span>
                              <span className="text-[9.5px] text-zinc-400 dark:text-zinc-500 font-normal">
                                {optDesc}
                              </span>
                            </div>
                            {isSelected && (
                              <CheckIcon className="size-3 text-emerald-500 dark:text-emerald-400 shrink-0 ml-1" />
                            )}
                          </button>
                        );
                      })}
                    </div>

                    {/* 降级提示（针对当前选中的模型） */}
                    {(() => {
                      const isHoveredModelActive =
                        (hoveredModel.provId ? hoveredModel.provId === activeProviderId : true) &&
                        currentModel === hoveredModel.model;
                      if (isHoveredModelActive && fallbackApplied) {
                        return (
                          <div className="mt-1 pt-1 border-t border-zinc-100 dark:border-zinc-800 text-[9.5px] leading-tight text-amber-600 dark:text-amber-400/90 px-1">
                            已降级至「{effortLabel}」
                          </div>
                        );
                      }
                      return null;
                    })()}
                  </div>
                )}
              </div>
            )}
          </div>
        </PromptInputTools>

        {/* 右侧：当正在回复中且用户输入了新内容时，展示排队与立即引导操作按钮；否则显示标准 PromptInputSubmit */}
        {isRunning && hasContent ? (
          <div className="flex items-center gap-1 shrink-0 ml-auto pl-1.5 z-10 animate-in fade-in duration-100">
            <button
              type="button"
              data-testid="chat-queue-prompt-btn"
              onClick={() => {
                onEnqueue(text, attachments.files as ChatAttachment[]);
                attachments.clear();
              }}
              title="排队（Enter）：等待当前回复完成后自动发送"
              className="inline-flex items-center gap-1 h-7 px-2 rounded-md bg-zinc-100 hover:bg-zinc-200 text-zinc-800 border-zinc-300/80 dark:bg-zinc-800 dark:hover:bg-zinc-700 dark:text-zinc-200 text-[11px] font-medium transition-colors border dark:border-zinc-700/60 shadow-xs cursor-pointer select-none whitespace-nowrap"
            >
              <ClockIcon className="size-3 text-zinc-500 dark:text-zinc-400" />
              <span>排队</span>
            </button>
            <button
              type="button"
              data-testid="chat-steer-prompt-btn"
              onClick={() => {
                onSteer(text, attachments.files as ChatAttachment[]);
                attachments.clear();
              }}
              title="立即引导（Ctrl+Enter）：打断当前回复并立即执行此提示词"
              className="inline-flex items-center gap-1 h-7 px-2 rounded-md bg-emerald-50 hover:bg-emerald-100 text-emerald-700 border-emerald-300 dark:bg-emerald-500/20 dark:hover:bg-emerald-500/30 dark:text-emerald-300 text-[11px] font-medium transition-colors border dark:border-emerald-500/40 shadow-xs cursor-pointer select-none whitespace-nowrap"
            >
              <ZapIcon className="size-3 text-emerald-600 dark:text-emerald-400" />
              <span>立即引导</span>
            </button>
            <button
              type="button"
              data-testid="chat-stop-prompt-btn"
              onClick={onStop}
              title="停止当前回复"
              className="size-7 rounded-md flex items-center justify-center bg-zinc-100 hover:bg-zinc-200 text-zinc-600 hover:text-red-500 border border-zinc-300 dark:bg-zinc-800 dark:hover:bg-zinc-700 dark:text-zinc-400 dark:hover:text-red-400 dark:border-zinc-700/60 transition-colors cursor-pointer select-none shrink-0"
            >
              <span className="size-2 rounded-[2px] bg-red-500 dark:bg-red-400" />
            </button>
          </div>
        ) : (
          <PromptInputSubmit
            disabled={!hasText && attachments.files.length === 0 && !isRunning}
            status={isRunning ? "streaming" : undefined}
            onStop={onStop}
            className="chat-submit-btn size-8 rounded-lg transition-colors shadow-none border-0 border-none outline-none focus:outline-none focus-visible:ring-0 bg-zinc-900 text-white hover:bg-black dark:bg-zinc-100 dark:text-black dark:hover:bg-white disabled:opacity-30 disabled:bg-zinc-200 disabled:text-zinc-400 dark:disabled:bg-zinc-800 dark:disabled:text-zinc-500"
          />
        )}
      </PromptInputFooter>
    </PromptInput>
  );
}

export function ChatInput({
  onSend,
  onStop,
  isRunning,
  effort,
  onEffortChange,
  supportedEfforts,
  reasoningUnsupported,
  fallbackApplied,
  requestedEffort,
  modelStatus,
  disabled = false,
  onBlockedSend,
  availableModels = [],
  currentModel,
  onSelectModel,
  providers = [],
  activeProviderId,
  onSelectProviderModel,
  onOpenSettings,
  workspaceRoot,
  customWorkspaces = [],
  onSelectWorkspace,
  onOpenFolderPicker,
  onOpenGitReview,
  usage,
  todoActivity,
  permissionMode,
  onPermissionModeChange,
  planEnabled,
  onPlanEnabledChange,
  webSearch,
  onWebSearchChange,
  messages = [],
  activities = [],
}: ChatInputProps) {
  const [text, setText] = useState("");
  const [attachmentError, setAttachmentError] = useState<string | null>(null);
  const [previewAttachment, setPreviewAttachment] = useState<ChatAttachment | null>(null);

  // 待办任务列表展开状态
  const [isTodoExpanded, setIsTodoExpanded] = useState(false);

  // 工作区下拉选择状态
  // 获取当前工作区关联的 Git 仓储与分支状态
  const [gitStatus, setGitStatus] = useState<{
    isGitRepo: boolean;
    branch: string;
    repoRoot: string;
    changesCount: number;
  } | null>(null);

  useEffect(() => {
    if (!workspaceRoot || workspaceRoot.trim() === "") {
      setGitStatus(null);
      return;
    }

    let isMounted = true;
    const fetchGitStatus = async () => {
      try {
        const res = await fetch(`/api/git/status?root=${encodeURIComponent(workspaceRoot)}`);
        if (!res.ok) {
          if (isMounted) setGitStatus(null);
          return;
        }
        const data = await res.json();
        if (isMounted) {
          if (data && data.isGitRepo) {
            const changes = Array.isArray(data.changes) ? data.changes.length : 0;
            const staged = Array.isArray(data.staged) ? data.staged.length : 0;
            setGitStatus({
              isGitRepo: true,
              branch: data.branch || "main",
              repoRoot: data.repoRoot || workspaceRoot,
              changesCount: changes + staged,
            });
          } else {
            setGitStatus(null);
          }
        }
      } catch {
        if (isMounted) setGitStatus(null);
      }
    };

    void fetchGitStatus();
  }, [workspaceRoot, activities?.length, isRunning]);

  const [isWorkspaceDropdownOpen, setIsWorkspaceDropdownOpen] = useState(false);
  const workspaceDropdownRef = useRef<HTMLDivElement>(null);
  const todoCardRef = useRef<HTMLDivElement>(null);

  // 模型下拉菜单状态
  const [isModelDropdownOpen, setIsModelDropdownOpen] = useState(false);
  const modelDropdownRef = useRef<HTMLDivElement>(null);

  // 思考等级下拉菜单状态
  const [isEffortDropdownOpen, setIsEffortDropdownOpen] = useState(false);
  const effortDropdownRef = useRef<HTMLDivElement>(null);
  const [isPermissionDropdownOpen, setIsPermissionDropdownOpen] = useState(false);
  const permissionDropdownRef = useRef<HTMLDivElement>(null);
  const [showFullAccessConfirmation, setShowFullAccessConfirmation] = useState(false);

  // 提示词排队队列状态
  const [queuedPrompts, setQueuedPrompts] = useState<QueuedPrompt[]>([]);
  const prevIsRunningRef = useRef(isRunning);

  // 当模型从回复中转为空闲时，若有排队中的提示词，按序自动接力发送下一条
  useEffect(() => {
    if (prevIsRunningRef.current && !isRunning && queuedPrompts.length > 0) {
      const [nextPrompt, ...rest] = queuedPrompts;
      setQueuedPrompts(rest);
      if (nextPrompt) {
        const timer = setTimeout(() => {
          onSend(nextPrompt.text || "请查看附件中的内容。", nextPrompt.attachments);
        }, 200);
        return () => clearTimeout(timer);
      }
    }
    prevIsRunningRef.current = isRunning;
  }, [isRunning, queuedPrompts, onSend]);

  // 排队提示词入队
  const handleEnqueue = useCallback((content: string, files: ChatAttachment[]) => {
    const trimmed = content.trim();
    if (!trimmed && files.length === 0) return;
    const item: QueuedPrompt = {
      id: `queue-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
      text: trimmed,
      attachments: [...files],
      createdAt: Date.now(),
    };
    setQueuedPrompts((prev) => [...prev, item]);
    setText("");
    setAttachmentError(null);
  }, []);

  // 立即引导（打断当前回复并立即以此提示词发送）
  const handleSteer = useCallback((content: string, files: ChatAttachment[]) => {
    const trimmed = content.trim();
    if (!trimmed && files.length === 0) return;
    if (isRunning) {
      onStop();
    }
    setTimeout(() => {
      onSend(trimmed || "请查看附件中的内容。", files);
    }, 150);
    setText("");
    setAttachmentError(null);
  }, [isRunning, onStop, onSend]);

  // 从队列编辑某一条（取回输入框供修改并移出队列）
  const handleEditQueued = useCallback((id: string) => {
    const item = queuedPrompts.find((p) => p.id === id);
    if (!item) return;
    setText(item.text);
    setQueuedPrompts((prev) => prev.filter((p) => p.id !== id));
  }, [queuedPrompts]);

  // 从队列删除某一条
  const handleDeleteQueued = useCallback((id: string) => {
    setQueuedPrompts((prev) => prev.filter((p) => p.id !== id));
  }, []);

  // 立即发送执行某一条排队条目
  const handleExecuteQueued = useCallback((id: string) => {
    const item = queuedPrompts.find((p) => p.id === id);
    if (!item) return;
    setQueuedPrompts((prev) => prev.filter((p) => p.id !== id));
    if (isRunning) {
      onStop();
    }
    setTimeout(() => {
      onSend(item.text || "请查看附件中的内容。", item.attachments);
    }, 150);
  }, [queuedPrompts, isRunning, onStop, onSend]);

  const selectPermissionMode = (mode: PermissionMode) => {
    setIsPermissionDropdownOpen(false);
    if (mode === "full" && permissionMode !== "full") {
      setShowFullAccessConfirmation(true);
      return;
    }
    onPermissionModeChange(mode);
  };

  // 点击外部自动关闭下拉框
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      const target = e.target as Node;
      if (workspaceDropdownRef.current && !workspaceDropdownRef.current.contains(target)) {
        setIsWorkspaceDropdownOpen(false);
      }
      if (todoCardRef.current && !todoCardRef.current.contains(target)) {
        setIsTodoExpanded(false);
      }
      if (modelDropdownRef.current && !modelDropdownRef.current.contains(target)) {
        setIsModelDropdownOpen(false);
      }
      if (effortDropdownRef.current && !effortDropdownRef.current.contains(target)) {
        setIsEffortDropdownOpen(false);
      }
      if (permissionDropdownRef.current && !permissionDropdownRef.current.contains(target)) {
        setIsPermissionDropdownOpen(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const hasText = text.trim().length > 0;

  const handleSubmit = (message: PromptInputMessage) => {
    const content = (message.text || text).trim();
    const attachments = message.files;
    // 如果在模型生成回复中触发提交，默认进行安全排队
    if (isRunning) {
      if (content.length > 0 || attachments.length > 0) {
        handleEnqueue(content, attachments as ChatAttachment[]);
      }
      return;
    }
    // 未配置 API 厂商或未填 Key 时进行主动拦截提示，绝不静默无反应
    if (disabled) {
      if (content.length > 0 || attachments.length > 0) {
        onBlockedSend?.(modelStatus || "未配置大模型 API 厂商或未填写 API Key");
      }
      return;
    }
    if (content.length > 0 || attachments.length > 0) {
      const totalBytes = attachments.reduce((total, file) => {
        const payload = file.url.match(/^data:[^;,]+;base64,([\s\S]+)$/)?.[1] ?? "";
        return total + Math.floor((payload.length * 3) / 4);
      }, 0);
      if (attachments.some((file) => !file.url.startsWith("data:"))) {
        setAttachmentError("附件读取失败，请移除后重新添加。");
        return;
      }
      if (totalBytes > MAX_TOTAL_ATTACHMENT_SIZE) {
        setAttachmentError("附件总大小不能超过 12 MB，请移除部分文件后重试。");
        return;
      }
      onSend(content || "请查看附件中的内容。", attachments);
      setAttachmentError(null);
      setText("");
    }
  };

  const handleAttachmentError = (error: { code: "max_files" | "max_file_size" | "accept" }) => {
    const messages = {
      accept: "暂只支持图片、PDF 和常见文本文件（TXT、Markdown、CSV、JSON、XML、HTML、YAML）。",
      max_file_size: "单个附件不能超过 5 MB。",
      max_files: "一次最多添加 4 个附件。",
    };
    setAttachmentError(messages[error.code]);
  };

  const effortLabel = effort === "high" ? "高" : effort === "medium" ? "中" : "低";

  const isDirectChat = !workspaceRoot || workspaceRoot.trim() === "";
  const currentWorkspaceName = isDirectChat ? "直接聊天模式" : extractFolderName(workspaceRoot);
  const currentWorkspacePath = isDirectChat ? "" : workspaceRoot;

  return (
    <div className="shrink-0 bg-white dark:bg-black px-4 py-4 transition-colors">
      <div className="mx-auto w-full max-w-3xl">
        <div className="mb-2 flex min-w-0 items-center justify-between gap-2">
          {/* 左侧：工作区选择器（仅在会话还没发过消息时显示，避免中途切换工作区导致上下文混乱）+ Git 分支徽标 */}
          <div className="flex min-w-0 items-center gap-1.5 flex-wrap">
            {/* 工作区选择器保持在左侧 */}
            {messages.length === 0 && (
            <div className="relative flex w-fit shrink-0 items-center" ref={workspaceDropdownRef}>
              <button
                type="button"
                data-testid="workspace-mode-selector"
                onClick={() => {
                  setIsWorkspaceDropdownOpen((v) => !v);
                  setIsTodoExpanded(false);
                  setIsModelDropdownOpen(false);
                  setIsEffortDropdownOpen(false);
                }}
                className="group inline-flex items-center gap-1.5 rounded-xl bg-transparent hover:bg-zinc-200/80 dark:hover:bg-zinc-900/80 px-2.5 py-1 text-[13px] font-medium text-zinc-800 dark:text-zinc-100 transition-colors select-none max-w-[260px] border-0 outline-none cursor-pointer"
                title={isDirectChat ? "当前为直接聊天模式（无工作区）" : `当前工作区：${currentWorkspacePath}`}
              >
                {isDirectChat ? (
                  <MessageSquareIcon className="size-4 text-zinc-600 dark:text-zinc-300 shrink-0" />
                ) : (
                  <FolderIcon className="size-4 text-zinc-600 dark:text-zinc-300 shrink-0" />
                )}
                <span className="truncate">
                  {isDirectChat ? "直接聊天" : currentWorkspaceName}
                </span>
                <ChevronDownIcon
                  className={cn(
                    "size-3.5 text-zinc-500 dark:text-zinc-400 shrink-0 transition-transform duration-200 ml-0.5",
                    isWorkspaceDropdownOpen && "rotate-180 text-zinc-800 dark:text-zinc-200",
                  )}
                />
              </button>

              {/* 下拉菜单面板（大圆角、深灰底、无多余线条、移动悬浮高亮） */}
              {isWorkspaceDropdownOpen && (
                <div className="workspace-dropdown-panel absolute left-0 bottom-full mb-2 z-50 w-64 rounded-2xl bg-[#242427] p-1.5 shadow-2xl border-0 animate-in fade-in zoom-in-95 duration-100">
                  {/* 选项 1：直接聊天模式 */}
                  <button
                    type="button"
                    onClick={() => {
                      onSelectWorkspace?.(null);
                      setIsWorkspaceDropdownOpen(false);
                    }}
                    className={cn(
                      "flex w-full items-center gap-2.5 rounded-xl px-2.5 py-2 text-left text-[13px] transition-colors select-none",
                      isDirectChat
                        ? "bg-[#2f2f35] text-white font-medium"
                        : "text-zinc-200 hover:bg-[#2f2f35] hover:text-white",
                    )}
                  >
                    <MessageSquareIcon className="size-4 text-zinc-300 shrink-0" />
                    <span className="truncate">直接聊天</span>
                    {isDirectChat && <CheckIcon className="size-4 text-white shrink-0 ml-auto" />}
                  </button>

                  {/* 选项 2..N：工作区列表（无多余分割线，干净紧凑排列） */}
                  <div className="max-h-[220px] overflow-y-auto space-y-0.5 my-0.5 scrollbar-thin scrollbar-thumb-zinc-700">
                    {customWorkspaces && customWorkspaces.length > 0
                      ? customWorkspaces.map((wsPath) => {
                          const isSelected =
                            !isDirectChat &&
                            (currentWorkspacePath === wsPath ||
                              currentWorkspacePath.toLowerCase() === wsPath.toLowerCase());
                          const name = extractFolderName(wsPath);
                          return (
                            <button
                              key={wsPath}
                              type="button"
                              onClick={() => {
                                onSelectWorkspace?.(wsPath);
                                setIsWorkspaceDropdownOpen(false);
                              }}
                              className={cn(
                                "flex w-full items-center gap-2.5 rounded-xl px-2.5 py-2 text-left text-[13px] transition-colors select-none",
                                isSelected
                                  ? "bg-[#2f2f35] text-white font-medium"
                                  : "text-zinc-200 hover:bg-[#2f2f35] hover:text-white",
                              )}
                            >
                              <FolderIcon className="size-4 text-zinc-300 shrink-0" />
                              <span className="truncate">{name}</span>
                              {isSelected && <CheckIcon className="size-4 text-white shrink-0 ml-auto" />}
                            </button>
                          );
                        })
                      : null}
                  </div>

                  {/* 选项：添加工作区...（使用加号图标，无额外分割线） */}
                  <button
                    type="button"
                    onClick={() => {
                      setIsWorkspaceDropdownOpen(false);
                      onOpenFolderPicker?.();
                    }}
                    className="flex w-full items-center gap-2.5 rounded-xl px-2.5 py-2 text-left text-[13px] text-zinc-200 hover:bg-[#2f2f35] hover:text-white transition-colors select-none"
                  >
                    <PlusIcon className="size-4 text-zinc-300 shrink-0" />
                    <span className="truncate">添加工作区...</span>
                  </button>
                </div>
              )}
            </div>
            )}

            {/* Git 分支胶囊（当前工作区关联了 Git 时展示，无 Git 时不展示） */}
            {gitStatus?.isGitRepo ? (
              <button
                type="button"
                data-testid="workspace-git-badge"
                onClick={() => onOpenGitReview?.()}
                className={cn(
                  "group inline-flex items-center gap-1.5 rounded-xl px-2.5 py-1 text-[12.5px] font-medium transition-colors select-none max-w-[200px] border outline-none",
                  "bg-zinc-100/90 hover:bg-zinc-200/90 text-zinc-700 border-zinc-200/90",
                  "dark:bg-zinc-900/60 dark:hover:bg-zinc-900 dark:text-zinc-300 dark:border-zinc-800/80",
                  onOpenGitReview && "cursor-pointer"
                )}
                title={`Git 仓库：${gitStatus.repoRoot}\n当前分支：${gitStatus.branch}${gitStatus.changesCount > 0 ? `\n未提交变更：${gitStatus.changesCount} 个文件` : ''}${onOpenGitReview ? '\n点击打开代码审查与分支面板' : ''}`}
              >
                <GitBranchIcon className="size-3.5 text-zinc-500 dark:text-zinc-400 shrink-0" />
                <span className="truncate">{gitStatus.branch}</span>
                {gitStatus.changesCount > 0 && (
                  <span
                    className="ml-0.5 rounded-full px-1.5 py-0.2 text-[10px] font-semibold bg-amber-500/15 text-amber-600 dark:text-amber-400 shrink-0"
                    title={`${gitStatus.changesCount} 个未提交变更文件`}
                  >
                    {gitStatus.changesCount}
                  </span>
                )}
              </button>
            ) : null}
          </div>

          {/* 任务 Todo 列表平行在右侧独立展示（展开详情为绝对定位浮层，互不影响） */}
          {todoActivity ? (
            <div ref={todoCardRef} className="relative flex w-fit shrink-0 items-center">
              <TodoCard
                activity={todoActivity}
                isOpen={isTodoExpanded}
                onToggleOpen={() => {
                  setIsTodoExpanded((v) => !v);
                  setIsWorkspaceDropdownOpen(false);
                  setIsModelDropdownOpen(false);
                  setIsEffortDropdownOpen(false);
                }}
                onClose={() => setIsTodoExpanded(false)}
              />
            </div>
          ) : null}
        </div>

        {/* 输入框与背面折叠排队卡片堆叠容器 */}
        <div className="relative">
          {/* 排队条目卡片：显示在输入框背面，像从背面探出的折叠卡片 */}
          {queuedPrompts.length > 0 && (
            <div className="relative z-0 -mb-3.5 w-full space-y-[-10px] animate-in fade-in slide-in-from-bottom-2 duration-150">
              {queuedPrompts.map((item, index) => (
                <div
                  key={item.id}
                  data-testid="chat-queued-prompt-item"
                  className={cn(
                    "group flex items-center justify-between gap-3 px-4 pt-2 pb-5 rounded-t-2xl select-none transition-all",
                    "border-t border-x",
                    "bg-zinc-100/95 border-zinc-300/90 text-zinc-800 shadow-xs",
                    "dark:bg-[#202024] dark:border-zinc-700/80 dark:text-zinc-200 dark:shadow-md"
                  )}
                  style={{ zIndex: index }}
                >
                  {/* 左侧：气泡图标与消息文本内容 */}
                  <div className="flex min-w-0 flex-1 items-center gap-2.5">
                    <MessageSquareIcon className="size-3.5 shrink-0 text-zinc-500 dark:text-zinc-400" />
                    <span className="truncate text-[12.5px] font-normal text-zinc-800 dark:text-zinc-200 select-text">
                      {item.text || (item.attachments.length > 0 ? `[附件: ${item.attachments.map((f) => (f as any).filename || (f as any).name || "文件").join(", ")}]` : "排队任务")}
                    </span>
                  </div>

                  {/* 右侧：三个紧凑操作按钮（编辑取回、删除、立即发送引导） */}
                  <div className="flex items-center gap-1 shrink-0 text-zinc-500 dark:text-zinc-400">
                    <button
                      type="button"
                      data-testid="chat-queue-edit-btn"
                      onClick={() => handleEditQueued(item.id)}
                      title="编辑此提示词并取回输入框"
                      className="rounded p-1 text-zinc-500 hover:bg-zinc-200 hover:text-zinc-900 dark:text-zinc-400 dark:hover:bg-zinc-700/60 dark:hover:text-zinc-100 transition-colors cursor-pointer"
                    >
                      <SquarePenIcon className="size-3.5" />
                    </button>
                    <button
                      type="button"
                      data-testid="chat-queue-delete-btn"
                      onClick={() => handleDeleteQueued(item.id)}
                      title="删除排队消息"
                      className="rounded p-1 text-zinc-500 hover:bg-zinc-200 hover:text-red-500 dark:text-zinc-400 dark:hover:bg-zinc-700/60 dark:hover:text-red-400 transition-colors cursor-pointer"
                    >
                      <Trash2Icon className="size-3.5" />
                    </button>
                    <button
                      type="button"
                      data-testid="chat-queue-execute-btn"
                      onClick={() => handleExecuteQueued(item.id)}
                      title="立即发送并执行此排队项"
                      className="rounded p-1 text-zinc-500 hover:bg-zinc-200 hover:text-zinc-900 dark:text-zinc-400 dark:hover:bg-zinc-700/60 dark:hover:text-zinc-100 transition-colors cursor-pointer"
                    >
                      <ArrowUpIcon className="size-3.5" />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* 前面的输入框卡片：具有实色不透明背景和微阴影，覆盖在排队卡片下半截之上 */}
          <div className="relative z-10">
            <PromptInputProvider>
              <PromptInputComposer
                text={text}
                setText={setText}
                hasText={hasText}
                isRunning={isRunning}
                disabled={disabled}
                queuedPrompts={queuedPrompts}
                onEnqueue={handleEnqueue}
                onSteer={handleSteer}
                onExecuteQueued={handleExecuteQueued}
                onSubmit={handleSubmit}
                onAttachmentError={handleAttachmentError}
                setPreviewAttachment={setPreviewAttachment}
                permissionMode={permissionMode}
                planEnabled={planEnabled}
                onPlanEnabledChange={onPlanEnabledChange}
                webSearch={webSearch}
                onWebSearchChange={onWebSearchChange}
                isPermissionDropdownOpen={isPermissionDropdownOpen}
                setIsPermissionDropdownOpen={setIsPermissionDropdownOpen}
                selectPermissionMode={selectPermissionMode}
                permissionDropdownRef={permissionDropdownRef}
                currentModel={currentModel}
                modelStatus={modelStatus}
                isModelDropdownOpen={isModelDropdownOpen}
                setIsModelDropdownOpen={setIsModelDropdownOpen}
                availableModels={availableModels}
                onSelectModel={onSelectModel}
                providers={providers}
                activeProviderId={activeProviderId}
                onSelectProviderModel={onSelectProviderModel}
                onOpenSettings={onOpenSettings}
                modelDropdownRef={modelDropdownRef}
                messages={messages}
                activities={activities}
                usage={usage}
                reasoningUnsupported={reasoningUnsupported}
                effortDropdownRef={effortDropdownRef}
                isEffortDropdownOpen={isEffortDropdownOpen}
                setIsEffortDropdownOpen={setIsEffortDropdownOpen}
                effortLabel={effortLabel}
                fallbackApplied={fallbackApplied}
                requestedEffort={requestedEffort}
                effort={effort}
                supportedEfforts={supportedEfforts}
                onEffortChange={onEffortChange}
                onStop={onStop}
              />
              {attachmentError && (
                <p role="alert" className="px-3 pt-2 text-xs text-red-300">
                  {attachmentError}
                </p>
              )}
            </PromptInputProvider>
          </div>
        </div>

        {/* Token 与耗时统计条：移至输入框最下方展示（严格对齐 Microsoft agent 样式与参数） */}
        <div className="mt-2 px-1">
          <StatsLine
            messages={messages}
            activities={activities}
            providedUsage={usage}
          />
        </div>
      </div>

      <ImagePreviewDialog
        file={previewAttachment}
        onOpenChange={(open) => {
          if (!open) setPreviewAttachment(null);
        }}
      />

      {showFullAccessConfirmation && (
        <div
          className="fixed inset-0 z-[100] flex items-center justify-center bg-black/65 p-4 backdrop-blur-[2px]"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) setShowFullAccessConfirmation(false);
          }}
        >
          <section
            role="alertdialog"
            aria-modal="true"
            aria-labelledby="full-access-title"
            aria-describedby="full-access-description"
            className="w-full max-w-[680px] max-h-[calc(100vh-2rem)] overflow-y-auto rounded-[22px] border border-border bg-card p-7 text-card-foreground shadow-2xl sm:p-8"
          >
            <div className="flex items-center gap-3">
              <TriangleAlertIcon className="size-7 shrink-0 text-amber-400" />
              <h2 id="full-access-title" className="text-2xl font-semibold tracking-tight">要开启完全访问权限吗？</h2>
            </div>
            <p id="full-access-description" className="mt-5 text-base leading-relaxed text-muted-foreground">
              开启后，Agent 将跳过逐项审批，并可使用当前服务端已启用的工具。请确认你信任当前模型和工作区内容。
            </p>

            <div className="mt-4 divide-y divide-border rounded-2xl bg-secondary px-4">
              <div className="flex items-center gap-4 py-4">
                <FolderIcon className="size-7 shrink-0 text-sky-400" />
                <div>
                  <div className="text-base font-semibold">文件和文件夹</div>
                  <div className="text-sm leading-relaxed text-muted-foreground">可能读取、创建、修改或删除已授权工作区内的文件</div>
                </div>
              </div>
              <div className="flex items-center gap-4 py-4">
                <TerminalSquareIcon className="size-7 shrink-0 text-muted-foreground" />
                <div>
                  <div className="text-base font-semibold">终端命令</div>
                  <div className="text-sm leading-relaxed text-muted-foreground">如果服务端启用了命令工具，Agent 可直接运行命令</div>
                </div>
              </div>
              <div className="flex items-center gap-4 py-4">
                <GlobeIcon className="size-7 shrink-0 text-cyan-400" />
                <div>
                  <div className="text-base font-semibold">互联网和已连接的应用</div>
                  <div className="text-sm leading-relaxed text-muted-foreground">如果相关工具已启用，Agent 可访问网络或调用应用</div>
                </div>
              </div>
            </div>

            <p className="mt-5 text-sm leading-relaxed text-muted-foreground">
              这可能带来敏感数据丢失或泄露、提示注入等风险。你可以随时切回其他权限模式。
            </p>
            <div className="mt-5 flex justify-end gap-2.5">
              <button
                type="button"
                onClick={() => setShowFullAccessConfirmation(false)}
                className="rounded-full bg-secondary px-6 py-3 text-base font-medium text-secondary-foreground transition-colors hover:bg-accent"
              >
                取消
              </button>
              <button
                type="button"
                data-testid="confirm-full-access"
                onClick={() => {
                  onPermissionModeChange("full");
                  setShowFullAccessConfirmation(false);
                }}
                className="inline-flex items-center gap-2 rounded-full bg-destructive/10 px-6 py-3 text-base font-medium text-destructive transition-colors hover:bg-destructive/20"
              >
                <TriangleAlertIcon className="size-4" />
                确认
              </button>
            </div>
          </section>
        </div>
      )}
    </div>
  );
}
