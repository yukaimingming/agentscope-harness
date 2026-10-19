const { chromium } = require('C:/Users/kaiming yu/.npm-global/node_modules/playwright');
const path = require('path');
const fs = require('fs');

async function run() {
  const artifactDir = 'C:\\Users\\kaiming yu\\.gemini\\antigravity\\brain\\ac05d304-37dc-46fd-b803-0d72160fed76';

  const browser = await chromium.launch({
    channel: 'msedge',
    headless: true,
  });

  const context = await browser.newContext({
    viewport: { width: 1440, height: 960 },
    deviceScaleFactor: 2,
  });

  const page = await context.newPage();
  await page.goto('http://127.0.0.1:5174', { waitUntil: 'networkidle' });
  await page.waitForTimeout(1000);

  // 在前端 DOM 中注入正在进行的真实时间线和流式思考消息
  console.log('在聊天区域注入流式思考和生成状态测试节点...');
  await page.evaluate(() => {
    // 隐藏默认空引导卡片以展示纯粹的聊天时间线
    const emptyState = document.querySelector('.max-w-2xl.mx-auto.w-full.space-y-8');
    if (emptyState) {
      emptyState.style.display = 'none';
    }

    const chatContainer = document.querySelector('.flex-1.overflow-y-auto') || document.querySelector('main') || document.body;
    let mockArea = document.getElementById('shimmer-chat-mock');
    if (!mockArea) {
      mockArea = document.createElement('div');
      mockArea.id = 'shimmer-chat-mock';
      mockArea.className = 'w-full max-w-3xl mx-auto px-4 py-6 space-y-6';
      mockArea.innerHTML = `
        <!-- 用户消息 -->
        <div class="flex flex-col items-end w-full">
          <div class="flex flex-col items-end max-w-[85%] space-y-1">
            <div class="rounded-2xl bg-zinc-900/90 px-4 py-2.5 text-[14px] text-zinc-100 shadow-sm border border-zinc-800/80">
              <p class="whitespace-pre-wrap break-words leading-relaxed">
                请检查系统当前架构，并给出详细的重构实施方案。
              </p>
            </div>
            <div class="flex items-center gap-1.5 pt-0.5 text-zinc-400">
              <span class="text-[12px] text-zinc-500 select-none">11:28</span>
            </div>
          </div>
        </div>

        <!-- 助手正在分析的时间线与思考过程 -->
        <div class="flex flex-col w-full text-zinc-100 space-y-3">
          <section class="process-group my-3 w-full text-[var(--color-text-primary)]">
            <!-- 活动汇总栏（带官方 shimmer 文字特效） -->
            <div class="flex w-full items-center gap-2 border-b border-[var(--color-border-subtle)] py-2.5 text-left text-[15px] text-[var(--color-text-secondary)]">
              <span class="text-[13px]">
                <span class="shimmer shimmer-color-blue-500/60 font-medium inline-block">正在分析，用时 0分15秒</span>
              </span>
              <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="ml-0.5 size-3.5 -rotate-180 transition-transform"><path d="m6 9 6 6 6-6"/></svg>
            </div>

            <!-- 时间线活动项与展开的思考细节 -->
            <div class="flex flex-col gap-4 pt-4">
              <!-- 思考活动项 -->
              <details class="process-activity-enter group" open>
                <summary class="flex w-full cursor-pointer list-none items-center gap-2 text-[13px] text-[var(--color-text-secondary)]">
                  <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="size-[18px] w-[18px] shrink-0 text-[var(--color-text-muted)]"><path d="M12 5a3 3 0 1 0-5.997.125 4 4 0 0 0-2.526 5.77 4 4 0 0 0 .556 6.588A4 4 0 1 0 12 18Z"/><path d="M12 5a3 3 0 1 1 5.997.125 4 4 0 0 1 2.526 5.77 4 4 0 0 1-.556 6.588A4 4 0 1 1 12 18Z"/></svg>
                  <span class="shimmer shimmer-color-blue-500/60 shrink-0 font-medium inline-block">思考</span>
                  <span class="min-w-0 flex-1 truncate text-[12px] text-[var(--color-text-muted)]">正在梳理前后端架构与通信链路...</span>
                  <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="ml-auto size-3.5 shrink-0 transition-transform rotate-180"><path d="m6 9 6 6 6-6"/></svg>
                </summary>
                <div class="ml-[26px] mt-1.5 break-words border-l border-[var(--color-border-subtle)] pl-3 text-[13px] leading-relaxed text-[var(--color-text-secondary)]">
                  当前系统为 Spring Boot 3 + React 19 全栈架构，通过 SSE 进行流式消息与工具调用广播。需要替换旧式文字动效为 shadcn 官方规范 shimmer 特效...
                </div>
              </details>

              <!-- 正在执行工具活动项 -->
              <div class="process-activity-enter flex min-w-0 items-start gap-2 text-[13px] text-[var(--color-text-secondary)]">
                <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="mt-0.5 size-[18px] w-[18px] shrink-0 text-[var(--color-text-muted)]"><circle cx="12" cy="12" r="10"/><path d="m10 15 5-3-5-3v6Z"/></svg>
                <div class="min-w-0 flex-1">
                  <div class="flex items-center gap-x-2">
                    <span class="shimmer shimmer-color-blue-500/60 font-medium inline-block">正在执行 grep 搜索</span>
                    <code class="rounded-md bg-[var(--color-surface-3)] px-1.5 py-0.5 font-mono text-[12px] text-[var(--color-text-primary)]">pattern: "shimmer"</code>
                  </div>
                </div>
              </div>

              <!-- 正在执行子任务活动项 -->
              <div class="process-activity-enter text-[13px] text-[var(--color-text-secondary)]">
                <div class="flex items-center gap-2.5">
                  <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="size-[18px] w-[18px] shrink-0 text-[var(--color-text-muted)]"><path d="M12 5a3 3 0 1 0-5.997.125 4 4 0 0 0-2.526 5.77 4 4 0 0 0 .556 6.588A4 4 0 1 0 12 18Z"/></svg>
                  <span class="shimmer shimmer-color-blue-500/60 font-medium inline-block">正在执行子任务</span>
                  <span class="truncate text-zinc-400">调研官方 shadcn shimmer 规范</span>
                </div>
              </div>
            </div>
          </section>

          <!-- 输出过程中思考等详细过程 / Generating response -->
          <div class="w-full pt-1">
            <p class="shimmer shimmer-color-blue-500/60 text-[13px] font-medium leading-relaxed">
              Generating response&hellip;
            </p>
          </div>
        </div>
      `;
      chatContainer.appendChild(mockArea);
    }
  });

  // 稍等等待微光 CSS 动画匀速扫过
  await page.waitForTimeout(600);

  // 截取整个聊天视窗
  const chatLiveShot = path.join(artifactDir, '05-live-shimmer-chat-flow.png');
  await page.screenshot({ path: chatLiveShot });
  console.log('已保存完整聊天流式动效截图：', chatLiveShot);

  // 单独截取时间线与 Generating response 焦点区域
  const mockAreaLocator = page.locator('#shimmer-chat-mock');
  const sectionShot = path.join(artifactDir, '06-shimmer-chat-section-closeup.png');
  await mockAreaLocator.screenshot({ path: sectionShot });
  console.log('已保存焦点区域特写截图：', sectionShot);

  await browser.close();
  console.log('所有真实界面流程截图完成！');
}

run().catch((err) => {
  console.error('运行失败:', err);
  process.exit(1);
});
