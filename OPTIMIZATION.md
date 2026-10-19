# AgentScope Harness 优化清单（具体待办版）

> **分析对象**：`D:\temp\agentscope-harness`（master 分支，HEAD `852546c`，含工作树未提交改动）
> **生成日期**：2026-10-18
> **文档性质**：基于只读代码审查整理的优化待办，**不包含新功能需求**；生成本文档时未修改任何源码。
> **行号说明**：行号以当前工作树为准，后续代码变动后请以符号名/文件路径重新定位。

## 严重度定义

| 级别 | 含义 | 处理时限建议 |
| :--- | :--- | :--- |
| **P0** | 安全漏洞、凭据泄露、数据泄露，公开或多人使用前必须修复 | 立即（1–2 天内） |
| **P1** | 影响正确性、稳定性、可维护性，或显著降低体验 | 本迭代（1–2 周） |
| **P2** | 代码质量、性能、可访问性、工程化改进 | 持续迭代 |

---

## 0. 总览

### 0.1 问题统计

| 领域 | P0 | P1 | P2 | 合计 |
| :--- | ---: | ---: | ---: | ---: |
| 安全与数据 | 5 | 0 | 0 | 5 |
| 后端 | 0 | 8 | 0 | 8 |
| 前端 | 0 | 10 | 0 | 10 |
| 工程化 | 0 | 7 | 0 | 7 |
| 代码质量 | 0 | 0 | 8 | 8 |
| **合计** | **5** | **25** | **8** | **38** |

### 0.2 建议排期

| 阶段 | 目标 | 包含项 | 预估 |
| :--- | :--- | :--- | :--- |
| **Sprint 0** | 止血：凭据、RCE、数据 | SEC-01 ~ SEC-05 | 1–2 天 |
| **Sprint 1** | 稳定性：后端会话/SSE/HITL + 前端错误态/竞态 | BE-01 ~ BE-08、FE-01 ~ FE-05 | 1 周 |
| **Sprint 2** | 体验与工程化：性能、脚本、CI、文档 | FE-06 ~ FE-10、ENG-01 ~ ENG-07 | 1 周 |
| **持续** | 质量债 | QUA-01 ~ QUA-08 | 按迭代穿插 |

### 0.3 优化项速查表

| 编号 | 级别 | 一句话问题 | 工作量 |
| :--- | :--- | :--- | :--- |
| SEC-01 | P0 | 真实 API Key 硬编码并已入 git 历史 | S |
| SEC-02 | P0 | `/api/git/terminal` 无鉴权任意命令执行 | S |
| SEC-03 | P0 | 任意绝对路径读取/建目录，无工作区 jail | M |
| SEC-04 | P0 | 无鉴权 + 控制器级 `@CrossOrigin` 放开任意 Origin | M |
| SEC-05 | P0 | 会话 JSONL、个人目录路径被跟踪/硬编码 | M |
| BE-01 | P1 | 每轮重建 Agent/MCP，MCP 注册阻塞 | L |
| BE-02 | P1 | 执行句柄在 subscribe 后才注册，存在竞态 | M |
| BE-03 | P1 | 审批暂存无过期、恢复语义粗糙 | M |
| BE-04 | P1 | 客户端传 `permissionMode=full` 可绕过 HITL | S |
| BE-05 | P1 | 全局可变 workspaceRoot 跨会话串扰 | M |
| BE-06 | P1 | SSE 无心跳/背压/断连清理 | M |
| BE-07 | P1 | 大量吞异常，失败仍返回 200 | M |
| BE-08 | P1 | 后端仅 1 个冒烟测试，无安全回归测试 | M |
| FE-01 | P1 | 运行错误完全不可见，无重连/重试 | S |
| FE-02 | P1 | 审批卡重复渲染，内联卡按钮禁用 | S |
| FE-03 | P1 | 切换会话无取消/序号，存在串会话竞态 | M |
| FE-04 | P1 | 附件 base64 全量写 localStorage，超配额静默失败 | M |
| FE-05 | P1 | Review 在 `useMemo` 内发请求且无 AbortController | M |
| FE-06 | P1 | 每个 delta 重算整条时间线，无虚拟化 | L |
| FE-07 | P1 | 硬编码 `127.0.0.1:8787` 与本机绝对路径 | S |
| FE-08 | P1 | reducer 模块级可变 Map，异常路径可能残留 | M |
| FE-09 | P1 | 计时器每秒重建、拖拽监听/Agent 句柄未释放 | M |
| FE-10 | P1 | 核心 Hook、Review、设置无测试 | M |
| ENG-01 | P1 | 一键启动不重编、无健康检查/端口/依赖预检 | M |
| ENG-02 | P1 | README 与 JDK/API/内置 Maven 描述不符 | S |
| ENG-03 | P1 | 46 个 Playwright 脚本依赖未声明、不可复现 | L |
| ENG-04 | P1 | 工作树脏、ignore 策略导致配置需 force-add | M |
| ENG-05 | P1 | 无 CI 与质量门禁 | M |
| ENG-06 | P1 | 根脚本 test/e2e 指向不存在的目录 | S |
| ENG-07 | P1 | 未用依赖与过大包体（dist 15.7 MB） | M |
| QUA-01 | P2 | 前后端类型手工重复，无 codegen | M |
| QUA-02 | P2 | Diff 非 LCS，与 README 宣称不符 | M |
| QUA-03 | P2 | data-dir/工作区路径有三套解析逻辑 | S |
| QUA-04 | P2 | 巨型类/超长方法，职责过载 | L |
| QUA-05 | P2 | 魔法值与硬编码阈值散落 | S |
| QUA-06 | P2 | 可访问性与响应式缺口 | M |
| QUA-07 | P2 | 生产环境暴露测试/调试钩子 | S |
| QUA-08 | P2 | 死代码、命名与文件后缀混用 | S |

---

## 1. P0：安全与数据

### SEC-01 移除并轮换硬编码 API Key

- **位置**：`backend/src/main/resources/application.yml:17`、`backend/src/main/java/com/agentscope/harness/config/AgentscopeProperties.java:21`
- **现状**：两处都写死默认 Key（`sk-76d1…`），`git log -S` 证实由初始提交 `44a9272` 引入且当前 HEAD 仍存在；`.data/providers.json` 也以明文保存同一 Key；README:180 只写"内置密钥"。
- **影响**：任何拿到仓库或历史的人都能直接消费该账号额度；即使删除当前文件，git 历史仍可取回。
- **建议**：
  1. 立即在服务商侧**吊销并轮换**该 Key；
  2. 默认值改为空，启动时校验：为空则 fail-fast（或仅允许显式 demo 模式）；
  3. 用 `git filter-repo` / BFG 清理历史中的 Key 并强推，通知协作者重新 clone；
  4. 清理 `.data/providers.json`，改为引用环境变量或加密存储；
  5. 增加 `.env.example`，README 明确"必须自行配置"。
- **验收**：`git grep -n "sk-76d1"` 与 `git log -S "sk-76d1"` 均无结果；未设置 `ATRIA_API_KEY` 时启动给出明确错误；`.data` 中不再出现明文 Key。

### SEC-02 关闭/加固任意命令执行端点

- **位置**：`backend/src/main/java/com/agentscope/harness/controller/GitController.java:85-95`、`backend/src/main/java/com/agentscope/harness/service/GitService.java:302-318`
- **现状**：`POST /api/git/terminal` 将请求体 `command` 直接交给 `powershell.exe -NoProfile -Command` / `sh -c` 执行，无鉴权、无命令白名单、无超时、无输出上限；`/api/git/commit` 在 `files` 为空时执行 `git add -A`（`GitService.java:191-196`），可能把 `.env`、`.data` 一并提交。
- **影响**：本机任意进程或任意 localhost 网页可借浏览器发起请求执行任意命令（P0 级 RCE）；提交动作可能扩大凭据泄露。
- **建议**：
  1. 默认**下线**该端点，或改为仅允许固定命令白名单（如 `git status/log/diff`），参数化而非拼接 shell；
  2. 加认证（一次性本地 token）与频率限制；
  3. 设置执行超时（如 10s）、输出截断（如 1 MB）、工作目录限定；
  4. `commit` 禁止空 `files` 的 `git add -A`，改为显式文件列表并过滤敏感路径。
- **验收**：未携带 token 调用 `/api/git/terminal` 返回 401/403；白名单外命令被拒绝；提交空列表返回 400；日志中不再打印完整命令输出。

### SEC-03 为文件接口增加工作区 jail

- **位置**：`backend/src/main/java/com/agentscope/harness/service/WorkspaceService.java:159-166`（browse）、`:287-294`（mkdir）、`:108-120`（tree）；`backend/src/main/java/com/agentscope/harness/service/GitService.java:136-150`、`:279-297`（file-content / 路径拼接）
- **现状**：`browse`、`mkdir`、`getWorkspaceTree` 接受任意绝对路径；`mkdir` 的 `dirName` 可包含 `..` 或绝对路径；`/api/git/file-content` 可读取任意文件；服务端还信任客户端在 `forwardedProps.workspaceRoot` 下发的路径。
- **影响**：本机任意文件读取/目录枚举/目录创建；与其他漏洞组合可扩大影响面。
- **建议**：
  1. 定义 `resolveWithinRoot(root, input)`：`normalize()` 后必须 `startsWith(root)`，否则 400；
  2. 工作区切换只允许在配置的允许根目录集合内；
  3. `mkdir` 禁止绝对路径与 `..`，`dirName` 仅允许单层目录名；
  4. 为文件读取增加大小/类型限制（如 5 MB、文本白名单）。
- **验收**：`path=../../etc/passwd`、`path=C:\Windows\win.ini` 均返回 400；正常工作区内操作不受影响；补充对应 MockMvc 测试。

### SEC-04 统一 CORS 与本地鉴权

- **位置**：`backend/src/main/java/com/agentscope/harness/config/WebConfig.java:15-24`、各 Controller 类级 `@CrossOrigin`（如 `GitController.java:15`、`AgentController.java:24`）
- **现状**：全局配置只放行 localhost，但控制器类级 `@CrossOrigin` 默认允许任意 Origin，实际覆盖/冲突；项目无 Spring Security、无 token、无 CSRF 防护、无 `/agent` 限流。
- **影响**：恶意网页可在用户浏览器中读取 `127.0.0.1:8787` 的响应并发起调用（包括终端端点），同时消耗模型额度。
- **建议**：
  1. 删除控制器上的 `@CrossOrigin`，只保留 `WebConfig` 并收紧为固定端口；
  2. 引入轻量鉴权：启动时生成随机 token 写入前端运行时，所有 `/api`、`/agent` 请求校验 `Authorization`；
  3. 校验 `Origin`/`Sec-Fetch-Site`，拒绝非同源请求；
  4. 为 `/agent` 增加并发与频率限制。
- **验收**：跨源请求预检被拒；无 token 请求 401；前端正常功能不受影响；README 补充本地鉴权说明。

### SEC-05 清理入库的个人数据与本机路径

- **位置**：`backend/.agentscope/workspace/kaiming/agents/agentscope-spring-assistant/sessions/*.jsonl`、`sessions.json`、`.../test-session-001/events/*.jsonl`；`scripts/` 中 11 处 `C:/Users/...`；`frontend/apps/web/src/features/review/terminal-view.tsx:14`、`folder-picker-modal.tsx:55-56`
- **现状**：4 个历史会话文件仍在 git 跟踪中（含 userId `kaiming` 与对话内容）；多个脚本硬编码个人目录与 `D:\temp\agentscope-harness`。
- **影响**：个人用户名、目录结构、对话内容随仓库扩散；换机后功能异常。
- **建议**：
  1. 用 `git rm --cached` 移除会话文件，保留 `.gitignore`，必要时清历史；
  2. 脚本改为相对路径或 `process.cwd()`，删除个人绝对路径；
  3. 前端默认路径改为由后端 `/api/workspace` 返回，不在 UI 里写死；
  4. 检查 `screenshots/` 中是否含账号/密钥截图。
- **验收**：`git ls-files` 不再包含会话 JSONL；`git grep -n "kaiming yu"`、`git grep -n "D:\\\\temp"` 无结果；前端无写死绝对路径。

---

## 2. P1：后端

### BE-01 复用 Agent/MCP 实例，降低单轮开销

- **位置**：`backend/src/main/java/com/agentscope/harness/service/HarnessAgentManager.java:107-181`、`backend/src/main/java/com/agentscope/harness/mcp/McpBootstrap.java:33-47`
- **现状**：每个请求都新建 `OpenAIChatModel`、`HarnessAgent`，并重新注册 MCP；MCP 注册在请求线程阻塞等待（最长 30–60s），客户端未显式关闭；`AsyncMemoryFlushMiddleware` 每请求 new，导致其节流状态失效。
- **建议**：按"用户/工作区/模型配置"缓存 Agent（带 LRU 与失效）；MCP 客户端应用级单例 + 健康检查；中间件单例化；把初始化移出请求线程并加超时。
- **验收**：第二次请求（相同配置）初始化耗时显著下降；MCP 连接数稳定；无每轮重复日志。

### BE-02 修复执行句柄注册竞态

- **位置**：`HarnessAgentManager.java:244-274`
- **现状**：先 `subscribe()` 再 `activeExecutions.put(...)`；若流在 put 前完成/被取消，句柄残留或取消失败；同一 `threadId` 并发执行会覆盖旧句柄，旧任务无法取消。
- **建议**：执行前占位，用 `compute` 原子登记；同 thread 重复执行时拒绝或先取消旧任务；`doFinally` 中统一清理；`pendingApprovals` 与执行句柄绑定生命周期。
- **验收**：并发调用同一 thread 有确定行为（400 或取消旧任务）；快速连点取消能终止；无 `activeExecutions` 残留（可加指标）。

### BE-03 审批状态生命周期与恢复语义

- **位置**：`HarnessAgentManager.java:63`、`:211-233`、`:263-266`
- **现状**：`pendingApprovals` 仅以 threadId 为 key，无过期/上限；恢复时只要全部 `resolved` 即视为全部批准（无法逐项批准/拒绝）；无 pending 时仍构造空确认列表。
- **建议**：审批项带 ID/时间戳/过期时间（如 10 分钟）；恢复时按 interruptId 逐项映射 `ConfirmResult`；过期自动清理并通知前端；限制单会话待审批数量。
- **验收**：超时后审批自动失效；混合批准/拒绝能正确传递；长时间运行无内存增长。

### BE-04 HITL 策略由服务端强制

- **位置**：`HarnessAgentManager.java:190-203`
- **现状**：`forwardedProps.permissionMode` 由客户端传入，`full/bypass/dont_ask` 直接映射为 `BYPASS`；无服务端策略校验。
- **建议**：服务端维护允许模式集合与默认模式；高风险工具（shell/写文件）在 `BYPASS` 下仍强制确认，或通过配置项显式开启；记录权限变更审计日志。
- **验收**：普通请求无法通过构造参数关闭审批；审计日志能查到模式来源。

### BE-05 消除全局可变工作区状态

- **位置**：`WorkspaceService.java:23`、`:44-56`、`:111`、`:162`、`:290`
- **现状**：`currentWorkspaceRoot` 是单例可变字段，读方法带 `synchronized`，但使用处多处未同步；多会话/多用户共享同一 root。
- **建议**：workspace 作为会话级参数显式传递（`RuntimeContext` 或请求上下文），去掉全局字段；确需默认值时用不可变配置。
- **验收**：两个会话同时切换工作区互不影响；增加并发测试。

### BE-06 完善 SSE 生命周期

- **位置**：`AgentController.java:38-78`
- **现状**：30 分钟固定超时；无心跳事件，代理/浏览器空闲可能断连；无背压；客户端断开仅在 `send` 抛错时发现；`onTimeout/onError` 与正常完成路径存在重复 `cancelThread` 风险。
- **建议**：每 15–30s 发送注释心跳（`: ping`）；使用 `SseEmitter` 或统一超时配置；订阅端关注取消信号；保证 `complete` 只调用一次（`AtomicBoolean` 已部分处理，需覆盖全路径）。
- **验收**：空闲 5 分钟连接保持；浏览器断网后后端 10s 内释放执行；无重复取消日志。

### BE-07 统一错误处理与 HTTP 语义

- **位置**：`WorkspaceService.java:152`、`:201`、`:251`；`AguiAdapter.java:696`；`ReflectionMiddleware.java` 中静默 catch；`WorkspaceController` 失败仍返回 200
- **现状**：大量 `catch (Exception ignored)`；部分接口失败也返回 200；错误信息直接拼进响应可能泄露内部路径。
- **建议**：引入全局 `@RestControllerAdvice`，区分 4xx/5xx；记录结构化日志（threadId/runId）；对用户返回脱敏错误；SSE 错误统一 `RUN_ERROR` 并关闭流。
- **验收**：错误场景返回码正确；日志可定位；无静默吞异常（可用静态检查规则）。

### BE-08 补后端测试与请求校验

- **位置**：`backend/src/test/java/.../AgentScopeApplicationTests.java:9-12`；`pom.xml` 引入 validation 但全项目无 `@Valid`
- **现状**：仅 `contextLoads`；Controller/Service 无测试；请求 DTO 无校验注解。
- **建议**：为 AgentController、GitController、WorkspaceController 增加 MockMvc 测试（含路径穿越、未鉴权、非法参数）；对 `RunAgentInput` 等加 `@NotNull/@Size`；把安全用例纳入 CI。
- **验收**：核心接口行覆盖 ≥ 60%；安全回归用例全部通过。

---

## 3. P1：前端

### FE-01 让运行错误可见并可恢复

- **位置**：`frontend/apps/web/src/App.tsx:628-637`（传入 `state.run.error`）、`frontend/apps/web/src/features/chat/chat-messages.tsx:330-341`（解构为 `_error` 未渲染）、`use-agent-client.ts:227-249`
- **现状**：错误只写入 `state.run.error`，UI 从不展示；无超时、无断线重连、无"重试本轮"入口。
- **建议**：在时间线顶部渲染错误条（含错误摘要、重试/取消按钮、复制错误）；为流式请求增加超时（如 5 分钟）与自动重连（指数退避）；区分"取消"与"异常"。
- **验收**：断网/后端 500 时用户能看到明确提示并可重试；无控制台未处理异常。

### FE-02 修复审批卡重复与禁用按钮

- **位置**：`App.tsx:628-637`（未向 ChatMessages 传 `onDecide/decisions`）、`chat-messages.tsx:714-723`、`approval-card.tsx:27`
- **现状**：底部通知栏渲染了可用的审批卡；ChatMessages 内部又渲染一份内联审批卡，因 `onDecide` 未传而按钮禁用。
- **建议**：二选一：要么把 `onDecide/decisions` 传入 ChatMessages 并移除底部重复卡；要么让 ChatMessages 不渲染审批卡。统一由单一组件管理审批交互。
- **验收**：页面同一时刻只有一处审批卡；点击"批准/拒绝"有状态反馈；恢复执行按钮可用。

### FE-03 修复会话切换竞态

- **位置**：`App.tsx:410-448`（`await` 后无条件 `loadState`）、`:171-228`（启动恢复）
- **现状**：异步加载会话状态无取消/请求序号，快速点击 A→B 时 A 的响应可能覆盖 B；运行中的后台会话快照可能被磁盘旧状态覆盖。
- **建议**：用 `AbortController` 或自增序号校验；`loadState` 前确认仍是当前目标会话；后台运行中的会话优先使用内存状态。
- **验收**：快速连续切换 10 次会话，最终展示与最后点击一致；无历史消息错位。

### FE-04 附件存储改造

- **位置**：`use-sessions.ts:179-207`、`client-reducer.ts:26`、`use-agent-client.ts` 附件发送路径
- **现状**：附件以 base64 全量写入 `localStorage` 并随会话 PUT 到服务端；上限 12 MB 高于常见 5 MB 配额；`setItem` 异常被静默吞掉。
- **建议**：附件改用 IndexedDB 或上传到服务端文件接口，localStorage 只存元数据；实现配额检测与用户提示；大文件分片/压缩。
- **验收**：10 MB 附件可正常发送与恢复；配额不足时有明确提示；会话状态不再因附件膨胀。

### FE-05 修复 Review 数据获取副作用

- **位置**：`review-diff-view.tsx:36-49`（`useMemo` 中 fetch + `setState`）、`use-git-review.ts:15-89`（无 `AbortController`）
- **现状**：渲染期副作用违反 React 规则，可能重复请求/竞态覆盖；请求未取消，切换文件后旧响应可能写回；部分 fetch 缺少 `root` 参数导致跨工作区读错。
- **建议**：改为 `useEffect` + 取消标记；每次请求带 `AbortController`；统一封装 `fetchJson` 并补 `root`；错误展示到面板。
- **验收**：快速切换文件无错乱；React StrictMode 下无重复副作用警告；请求中断后不更新状态。

### FE-06 优化流式渲染性能

- **位置**：`chat-messages.tsx:183-189`（每轮过滤全部 activities）、`:360-364`（每次增量重建时间线）
- **现状**：每个 delta 触发整条时间线重算与重渲染；长会话无虚拟化，O(n²) 成本明显。
- **建议**：时间线按稳定性拆分缓存（memo + key）；流式文本单独 subtree；长列表引入虚拟化（如 `@tanstack/react-virtual`）；对 activities 建索引而非全量过滤。
- **验收**：1000 条消息 + 500 个工具事件时输入与滚动仍流畅（Performance 面板无长任务 > 100ms）。

### FE-07 消除环境硬编码

- **位置**：`App.tsx:374`、`workspace-sidebar.tsx:187`、`folder-picker-modal.tsx:55-56,87,136,140,172`、`terminal-view.tsx:14`
- **现状**：多处直接请求 `http://127.0.0.1:8787`，绕过 Vite 代理；默认路径写死 `D:\temp\agentscope-harness` 与个人桌面。
- **建议**：统一走相对路径 + Vite 代理；后端提供默认工作区/快捷路径；端口通过 `import.meta.env` 配置；删除个人目录。
- **验收**：更换端口/改用反向代理后前端无需改代码；`grep -r "127.0.0.1:8787" src` 无结果。

### FE-08 收敛 reducer 全局可变状态

- **位置**：`client-reducer.ts:679-709`
- **现状**：`reasoningToAssistant`、`textToAssistant` 两个模块级 `Map`，仅在 4 处 run 边界清理（`:596/:617/:630/:634`）；reducer 不是纯函数，异常/中断路径可能残留，影响测试与多实例。
- **建议**：把绑定表放进 `ClientState`（按 thread 隔离）或独立 store；清理逻辑统一到 run 结束的单一入口；补中断/异常场景测试。
- **验收**：reducer 纯函数化（相同输入相同输出）；异常中断后无残留绑定。

### FE-09 修复资源泄漏

- **位置**：`process-activity-group.tsx:365-381`（每秒重建计时器）、`review-sidebar.tsx:42-62`（仅 mouseup 清理拖拽监听）、`use-agent-client.ts:111`（`agentsRef` 按 thread 增长不释放）
- **现状**：计时器 effect 依赖不当导致重建；拖拽期间组件卸载可能残留监听；HttpAgent 与消息历史随会话数增长。
- **建议**：计时器改用单一 interval + ref；拖拽用 pointer events 并在 unmount 清理；会话关闭时从 `agentsRef` 删除并释放。
- **验收**：反复打开/关闭会话 50 次内存不持续增长；无 "setState on unmounted" 警告。

### FE-10 补前端核心测试

- **位置**：`frontend/apps/web/tests/`（7 个文件）、`frontend/packages/shared/tests/`（3 个文件）
- **现状**：覆盖 reducer、时间线、多线程隔离、思考流、Diff；但 `use-agent-client`（运行/取消/续跑/重连）、会话恢复、Git Review、设置、错误态均无测试。
- **建议**：用 Vitest + Testing Library 补 Hook 测试（mock SSE/HttpAgent）；加入关键 UI 流程测试；把测试纳入 CI。
- **验收**：核心 Hook 行覆盖 ≥ 60%；关键回归场景有自动化用例。

---

## 4. P1：工程化

### ENG-01 加固一键启动脚本

- **位置**：`run.cmd:9,16,27,30,33`、`run.sh:11-32`
- **现状**：硬编码本机 Maven 路径；只在 jar 不存在时编译（源码改动不会重编）；固定 `timeout 4`，无 `/api/health` 就绪探测；不检查 `node_modules`/`pnpm install`；不检查 8787/5174 端口占用；失败无清晰提示。README 声称"内置 Maven"，但 `backend/mvnw.cmd`、`backend/.mvn` 未纳入版本控制。
- **建议**：改为"按 mtime 判断是否需要重编"或每次显式构建；轮询 `/api/health` 直到就绪（带超时与日志）；预检端口与依赖；把 mvnw 纳入版本控制或删除该说法；增加 `--skip-build` 参数。
- **验收**：修改源码后双击脚本能自动重编；后端未就绪时前端不启动或明确报错；换机按 README 可一次成功。

### ENG-02 对齐 README 与实现

- **位置**：`README.md:77-80,155-169,178-180`、`frontend/apps/web`、`pom.xml:22-24`
- **现状**：详见第 6 节"文档不一致清单"。
- **建议**：按实际行为修订 README；API 清单补 `/api/git/*` 与 `/api/workspace/current`，并标注 `/terminal` 高危；统一 JDK 要求为 21；补充前端 preview 端口、环境变量、鉴权说明。
- **验收**：新环境按 README 操作可成功启动；API 清单与实际路由一致（可用脚本校验）。

### ENG-03 整理 Playwright 验证脚本

- **位置**：`scripts/`（46 个 `capture-*/verify-*/test-*`）
- **现状**：依赖 `playwright` 但未在任何 `package.json` 声明；硬编码 `127.0.0.1:5174`、`D:\temp\...`、本机全局 node_modules 路径；大量固定 `waitForTimeout`，多数无断言，属开发残留。
- **建议**：保留有价值场景，重构为参数化的 e2e 套件（`scripts/e2e/`），声明 `playwright` devDependency，用 `baseURL`/env 参数，补断言；其余截图脚本归档或删除；在 README 说明如何运行。
- **验收**：干净 clone + `pnpm install` + `pnpm test:e2e` 可运行通过；无本机绝对路径。

### ENG-04 修复仓库卫生与 ignore 策略

- **位置**：`.gitignore`、`git status`
- **现状**：20+ 源文件改动未提交、34+ 新截图未跟踪、`backend/.mvn` 未跟踪；`.agentscope/workspace/` 整体忽略导致应入库的 `AGENTS.md`/`skills`/`subagents` 只能 force-add；既有会话文件"已忽略但仍被跟踪"。
- **建议**：分批提交或用 `git stash` 收敛工作树；ignore 改为白名单式（忽略 `kaiming/`、`agents/`、`.skills-cache/`、`memory/` 等运行态，保留配置）；`screenshots/` 决定入库或忽略；清理历史误提交；增加 `.editorconfig`。
- **验收**：`git status` 干净；`git ls-files` 只含源码/配置/文档/素材；运行后不会产生新的可跟踪文件。

### ENG-05 建立 CI 与质量门禁

- **现状**：无 `.github/`、无 CI、无 LICENSE；后端仅 1 个冒烟测试，前端有 typecheck/lint/test 脚本但未自动执行。
- **建议**：GitHub Actions（或本地 pre-commit）执行：`mvn test`（JDK 21）、`pnpm typecheck`、`pnpm lint`、`pnpm test`、`pnpm build`；增加依赖漏洞扫描（`npm audit`/Dependabot）；补 LICENSE 与贡献说明。
- **验收**：PR 必须通过全部检查；main 分支构建可重复。

### ENG-06 修复失效的根脚本

- **位置**：`frontend/package.json:13-15`
- **现状**：`test` 指向 `vitest run --dir tests`（实际测试在各 package 内）、`test:e2e` 指向不存在的 `scripts/e2e-browser-check.mjs`。
- **建议**：改为 `pnpm -r test`；e2e 指向整理后的真实脚本；`dev:server` 在只有 Spring 后端时移除或改为后端启动命令。
- **验收**：在 `frontend/` 执行 `pnpm test`、`pnpm test:e2e` 均成功。

### ENG-07 清理依赖与包体

- **位置**：`frontend/apps/web/package.json`、`frontend/apps/web/dist`（本地构建产物）
- **现状**：`@rive-app/react-webgl2`、部分 `@streamdown/*`、`react-markdown`、`remark-gfm`、`tokenlens`、`ansi-to-react`、`media-chrome` 等未发现引用；全量 shiki 语法进入 bundle，dist 约 15.7 MB、461 文件、主 chunk 约 1.7 MB。
- **建议**：用 `depcheck`/源码检索确认后移除未用依赖；shiki 限定常用语言；路由/重组件按需加载；开启构建体积分析（rollup-plugin-visualizer）；dist 保持不入库。
- **验收**：主 chunk 显著下降（目标 < 1 MB）；无未使用依赖；构建产物不进入 git。

---

## 5. P2：代码质量与体验

### QUA-01 消除前后端类型重复

- **位置**：`frontend/packages/shared/src/activity.ts`、`diff.ts`、`providers.ts` 与 `backend/.../model/Activity.java`、`FileDiff.java`、`ProviderModels.java`
- **建议**：以 OpenAPI/JSON Schema 或 codegen（如 `openapi-typescript`）生成共享类型，避免字段漂移；CUSTOM 事件 guard 替代强转。

### QUA-02 Diff 算法与宣称对齐

- **位置**：`AguiAdapter.java:701-727`
- **现状**：按行号逐位比较，插入一行会导致后续全部错位，并非 README 宣称的 LCS。
- **建议**：接入成熟 diff 实现（如 Myers/LCS，或前端用 `diff` 库在客户端计算），补插入/删除/移动场景测试；若不改算法则修正 README 表述。

### QUA-03 统一路径解析

- **现状**：`WorkspaceService`、`ProviderService`、`WorkbenchService` 对 `data-dir` 使用三套不同启发式。
- **建议**：抽出 `DataPaths` 组件统一解析与创建，配置唯一来源（`agentscope.data-dir`），并支持相对/绝对路径。

### QUA-04 拆分巨型类与超长方法

- **位置**：`AguiAdapter.java`（约 770 行）、`HarnessAgentManager.execute`（约 200 行）、`client-reducer.ts`（836 行）、`App.tsx`（773 行）、`chat-input.tsx`（848 行）
- **建议**：按职责拆分（事件映射/工具状态/Diff 计算；前端按消息流、活动流、会话管理拆 hook）；提取纯函数便于测试。

### QUA-05 收敛魔法值

- **现状**：`1800_000`、`15000`、`400`、`30`、`6/8 steps`、超时与上限散落在代码中。
- **建议**：集中到配置类/常量文件，支持环境变量覆盖；前端同理由常量统一。

### QUA-06 可访问性与响应式

- **现状**：可点击 `div` 无 `role/tabIndex`（`workspace-sidebar.tsx:236-248`、`review-sidebar.tsx:192-212`）；Modal 无焦点 trap（`modal.tsx`）；仅 1 处媒体查询，固定 260/660 宽度。
- **建议**：改用语义化 `button`；补键盘导航与 `aria-*`；加入焦点管理；对窄屏增加断点与可折叠布局。

### QUA-07 移除生产环境调试钩子

- **位置**：`App.tsx:502-515`、`client-reducer.ts:814`
- **现状**：调试/测试入口未用 `import.meta.env.DEV` 包裹，可被全局改写状态。
- **建议**：用 DEV 判断包裹或删除；保留受控的诊断接口并加开关。

### QUA-08 清理死代码与命名

- **现状**：`stream-playback.ts` 仅测试引用；约 14 个 `ai-elements` 组件未使用；`session-stats.tsx`、`subagent-card.tsx` 疑似未引用；`scripts/` 中 `.js/.cjs` 混用、前缀语义混乱。
- **建议**：用 `knip`/`ts-prune` 确认后删除；统一脚本后缀（ESM 用 `.mjs`）；组件命名与目录规范写进 CONTRIBUTING。

---

## 6. 文档不一致清单（随 ENG-02 修复）

| # | 文档说法 | 实际行为 | 位置 |
| :--- | :--- | :--- | :--- |
| 1 | "自动计算 LCS 行级增删差异" | 按行号逐位比较，插入即错位 | `README.md:62` vs `AguiAdapter.java:701-727` |
| 2 | API 清单 17 条 | 缺少 `/api/git/{status,diff,commit,file-content,terminal}`、`/api/workspace/current`；`/terminal` 未标注高危 | `README.md:153-170` vs `GitController.java`、`WorkspaceController.java` |
| 3 | "JDK 17+ / JDK 21" | `pom.xml` release=21，JDK 17 无法构建 | `README.md:77` vs `pom.xml:23` |
| 4 | "项目支持使用本机或内置 Maven" | `mvnw.cmd`/`.mvn` 未纳入版本控制 | `README.md:78` vs `git status` |
| 5 | `run.cmd` "自动检测并编译后端" | 仅当 jar 不存在时编译，源码改动不重编 | `README.md:88-92` vs `run.cmd:16` |
| 6 | 前端 `pnpm dev` 端口/代理 | preview 端口 5175 未写；根 `test:e2e` 脚本指向不存在文件 | `README.md:114` vs `vite.config.ts`、`frontend/package.json:13-15` |

---

## 7. 分阶段执行计划（可直接当任务清单）

### Sprint 0：止血（P0）

- [ ] SEC-01 吊销/轮换 Key，移除硬编码，清理 git 历史与 `.data`
- [ ] SEC-02 下线或白名单化 `/api/git/terminal`，限制执行超时与输出
- [ ] SEC-03 文件接口加工作区 jail，补路径穿越测试
- [ ] SEC-04 移除控制器级 `@CrossOrigin`，加本地 token 与限流
- [ ] SEC-05 移除跟踪的会话文件与个人路径
- [ ] 全仓扫描：`git grep -n "sk-"`、`git grep -n "kaiming yu"`、`git grep -n "D:\\\\temp"`

### Sprint 1：稳定性（后端 + 前端核心）

- [ ] BE-01/02/03/04：Agent 复用、句柄竞态、审批生命周期、服务端权限策略
- [ ] BE-05/06/07：工作区上下文、SSE 心跳、错误处理
- [ ] FE-01/02/03/04/05：错误态、审批卡、会话竞态、附件、Review 请求
- [ ] BE-08/FE-10：补关键测试

### Sprint 2：体验与工程化

- [ ] FE-06/07/08/09：性能、硬编码、reducer 状态、资源泄漏
- [ ] ENG-01/02/03/04：启动脚本、README、Playwright 脚本、仓库卫生
- [ ] ENG-05/06/07：CI、根脚本、依赖与包体
- [ ] 执行 README 全流程验收

### 持续：质量债

- [ ] QUA-01 ~ QUA-08 按迭代穿插

---

## 8. 验收与回归测试清单

### 8.1 安全回归

```text
# 凭据
git grep -n "sk-76d1"                 # 期望：无结果
git log -S "sk-76d1" --all            # 期望：无结果

# 未鉴权命令执行
curl -i -X POST http://127.0.0.1:8787/api/git/terminal \
  -H "Content-Type: application/json" -d "{\"command\":\"whoami\"}"
# 期望：401/403（或端点已下线）

# 路径穿越
curl -i "http://127.0.0.1:8787/api/git/file-content?path=../../../../Windows/win.ini"
curl -i "http://127.0.0.1:8787/api/workspace/browse?path=C:\\Windows"
# 期望：400

# CORS
curl -i -X OPTIONS http://127.0.0.1:8787/agent \
  -H "Origin: http://evil.example" -H "Access-Control-Request-Method: POST"
# 期望：预检被拒绝
```

### 8.2 构建与测试

```bash
# 后端（JDK 21）
cd backend && mvn -q test

# 前端
cd frontend
pnpm --filter @deepagent/web typecheck
pnpm --filter @deepagent/web lint
pnpm --filter @deepagent/web test
pnpm -r test
pnpm --filter @deepagent/web build
```

### 8.3 功能手工回归

- [ ] 新建会话 → 流式正文/思考正常，工具卡/耗时正常
- [ ] 触发需要审批的工具 → 只有一处审批卡，批准/拒绝均能继续或终止
- [ ] 生成/修改文件 → Diff 卡片内容与磁盘一致
- [ ] 快速连续切换 5 个会话 → 消息不串、后台运行会话仍显示运行态
- [ ] 断网/杀掉后端 → 前端有错误提示，可重试
- [ ] Review 面板：状态、Diff、图片对比、提交、终端（加固后）均可用
- [ ] 切换模型/工作区 → 后续请求生效，旧会话不受影响
- [ ] 长时间运行（30 分钟以上）→ 无内存持续增长、无重复取消日志

---

## 9. 备注

1. 本文档只覆盖"优化/修复"，不包含功能扩展；如需新功能请另立需求文档。
2. P0 项涉及真实凭据和本机命令执行，建议**先做 SEC-01~SEC-05，再动其他代码**，避免修复过程中二次泄露。
3. 行号会随代码变化漂移；重构后请同步更新本清单的状态列（可另建 issue 跟踪）。
4. 本清单生成过程未修改任何项目源码；如需，我可以按 Sprint 0 输出逐项补丁与验证命令。
