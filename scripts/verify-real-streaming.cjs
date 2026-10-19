const { chromium } = require('C:/Users/kaiming yu/.npm-global/node_modules/playwright');
const path = require('path');

const TARGET_DIR = path.resolve("C:/Users/kaiming yu/.gemini/antigravity/brain/ac05d304-37dc-46fd-b803-0d72160fed76");

(async () => {
  const browser = await chromium.launch({ channel: 'msedge', headless: true });
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const page = await context.newPage();

  console.log("1. 打开工作台页面...");
  await page.goto("http://127.0.0.1:5174", { waitUntil: "networkidle" });
  await page.waitForTimeout(1000);

  // 1. 点击新聊天
  console.log("1.1 点击新聊天...");
  const newChatBtn = page.locator('.new-chat-sidebar-button, button:has-text("新聊天")').first();
  if (await newChatBtn.count() > 0) {
    await newChatBtn.click({ force: true });
    await page.waitForTimeout(600);
  }

  // 2. 统计网络层真实 SSE chunk 到达
  let sseChunkCount = 0;
  let textDeltaEvents = 0;
  let reasoningDeltaEvents = 0;
  const deltaTimestamps = [];

  page.on('response', async (response) => {
    if (response.url().includes('/agent') && response.request().method() === 'POST') {
      console.log("捕获到 /agent SSE 流式连接响应，HTTP:", response.status());
    }
  });

  // 3. 填入测试提示词
  const promptText = "请用一句话介绍你自己，并说明你可以帮用户做什么。";
  console.log("2. 填入提示词并发送:", promptText);
  const inputArea = page.locator('textarea[placeholder*="输入任务描述"]').first();
  await inputArea.fill(promptText);
  await page.waitForTimeout(300);

  const sendBtn = page.locator('button[aria-label="发送提示词"], button[type="submit"]').last();
  await sendBtn.click({ force: true });
  console.log("已发送，开始实时监控真实流式吐字情况...");

  // 4. 连续监控 UI 渲染长度的变化节奏
  const lengths = [];
  const startMonitoring = Date.now();
  let streamingScreenshotTaken = false;

  while (Date.now() - startMonitoring < 45000) {
    const status = await page.evaluate(() => {
      const stopBtn = Boolean(document.querySelector('button[aria-label="停止响应"]'));
      const textEls = Array.from(document.querySelectorAll('.prose, [data-streamdown]'));
      const allText = textEls.map(el => el.textContent || '').join('');
      const reasoningEls = Array.from(document.querySelectorAll('[data-slot="collapsible-content"], .reasoning-content'));
      const allReasoning = reasoningEls.map(el => el.textContent || '').join('');
      return {
        stopBtn,
        textLen: allText.length,
        reasoningLen: allReasoning.length,
      };
    });

    lengths.push({ time: Date.now() - startMonitoring, ...status });

    // 当流式吐字达到一定长度时截一张「正在实时流式输出」的图
    if (!streamingScreenshotTaken && status.textLen > 20 && status.stopBtn) {
      streamingScreenshotTaken = true;
      const streamShotPath = path.join(TARGET_DIR, "real-streaming-in-progress.png");
      await page.screenshot({ path: streamShotPath });
      console.log("已截取【真实流式吐字进行中】截图:", streamShotPath);
    }

    if (!status.stopBtn && lengths.length > 5 && status.textLen > 0) {
      console.log("智能体回答输出圆满完成！");
      break;
    }

    await page.waitForTimeout(200);
  }

  await page.waitForTimeout(1500);

  // 5. 校验完成态
  const finalCheck = await page.evaluate(() => {
    const textEls = Array.from(document.querySelectorAll('.prose, [data-streamdown]'));
    const allText = textEls.map(el => el.textContent || '').join('');
    const buttons = Array.from(document.querySelectorAll('button'));
    const hasReasoning = buttons.some(b => b.textContent && (b.textContent.includes('思考') || b.textContent.includes('分析')));
    return {
      finalLength: allText.length,
      hasReasoning,
      preview: allText.slice(0, 150),
    };
  });

  console.log("=== 流式测试结果 ===");
  console.log("采样点总数:", lengths.length);
  const positiveDeltas = lengths.filter((l, i) => i > 0 && l.textLen > lengths[i - 1].textLen);
  console.log("文本长度增长阶段采样点数:", positiveDeltas.length);
  if (positiveDeltas.length > 0) {
    console.log("增长轨迹前 8 个采样点 (time -> length):", positiveDeltas.slice(0, 8).map(d => `${d.time}ms: ${d.textLen}字`));
  }
  console.log("最终文本长度:", finalCheck.finalLength);
  console.log("思维链/分析组件是否存在:", finalCheck.hasReasoning);
  console.log("回答内容预览:\n", finalCheck.preview);

  // 截图：最终完成态
  const finishShotPath = path.join(TARGET_DIR, "real-streaming-finished.png");
  await page.screenshot({ path: finishShotPath });
  console.log("已保存【真实流式完成态】截图:", finishShotPath);

  await browser.close();
  console.log("验证执行完毕！");
})().catch(err => {
  console.error("执行出错:", err);
  process.exit(1);
});
