const { chromium } = require('playwright');
const path = require('path');

async function main() {
  console.log('1. 启动 Edge 浏览器...');
  const browser = await chromium.launch({
    channel: 'msedge',
    headless: true,
    args: ['--no-sandbox', '--disable-gpu']
  });
  const context = await browser.newContext({
    viewport: { width: 1440, height: 1050 },
    deviceScaleFactor: 2.0,
  });
  const page = await context.newPage();

  console.log('2. 访问前端页面 http://127.0.0.1:5174...');
  await page.goto('http://127.0.0.1:5174', { waitUntil: 'networkidle' });
  await page.waitForTimeout(2000);

  // 1. 点击新聊天
  console.log('3. 点击 [新聊天] 开启全新会话...');
  const newChatBtn = page.locator('button:has-text("新聊天")').first();
  await newChatBtn.click();
  await page.waitForTimeout(1000);

  // 2. 发送指令
  const prompt = "请用 write_file 创建 time-test.txt，写入：'时间线耗时稳定测试'，并展示工具结果与 Reflection 自检，最后用一段总结解释。";
  console.log(`4. 发送提示词: "${prompt}"...`);

  const textarea = page.locator('textarea[placeholder*="输入任务描述"]').first();
  await textarea.fill(prompt);
  await page.waitForTimeout(400);

  const sendBtn = page.locator('button[title*="发送 (Enter)"], button:has-text("发送")').first();
  if (await sendBtn.count() > 0 && await sendBtn.isEnabled()) {
    await sendBtn.click();
  } else {
    await textarea.press('Enter');
  }

  console.log('5. 监控全流程时间线状态与耗时...');
  let phase1_analyzingTime = '';
  let phase2_streamingTime = '';
  let phase3_finishedTime = '';
  let streamPicTaken = false;

  const maxWait = 90000;
  const start = Date.now();

  while (Date.now() - start < maxWait) {
    await page.waitForTimeout(500);

    const timelineBtn = page.locator('.process-group button').first();
    let btnText = '';
    if (await timelineBtn.count() > 0) {
      btnText = (await timelineBtn.innerText()).trim();
    }

    const stopBtn = page.locator('button:has(svg.lucide-square), button[title*="停止"]');
    const isStreaming = (await stopBtn.count()) > 0;

    if (btnText.includes('正在分析')) {
      phase1_analyzingTime = btnText;
      console.log(`   [阶段1：分析中] ${btnText}`);
    } else if (btnText.includes('已完成分析')) {
      if (isStreaming) {
        // 正处于正文流式输出阶段！
        phase2_streamingTime = btnText;
        console.log(`   [阶段2：正文流式中] ${btnText} (停止按钮存在，正文正在输出)`);

        if (!streamPicTaken) {
          const streamPath = path.join(__dirname, '../screenshots/timeline-flow-streaming.png');
          await page.screenshot({ path: streamPath });
          console.log(`   📸 已捕获【正文流式中】截图: ${streamPath}`);
          streamPicTaken = true;
        }
      } else {
        // 正文彻底输出完成！
        phase3_finishedTime = btnText;
        console.log(`   [阶段3：正文已结束] ${btnText} (整轮彻底结束)`);
        break;
      }
    }
  }

  console.log('\n--- 耗时监控对比报告 ---');
  console.log(`阶段1（分析中最后耗时）: ${phase1_analyzingTime}`);
  console.log(`阶段2（正文流式期间耗时）: ${phase2_streamingTime}`);
  console.log(`阶段3（正文结束后最终耗时）: ${phase3_finishedTime}`);

  if (phase2_streamingTime.includes('用时 1秒') && !phase1_analyzingTime.includes('1秒')) {
    console.error('❌ 严重错误：正文流式期间时间线退化成了 1 秒！');
  } else {
    console.log('✅ 正文流式期间：耗时锁定正常，绝对没有退化为 1 秒！');
  }

  if (phase2_streamingTime && phase3_finishedTime && phase2_streamingTime === phase3_finishedTime) {
    console.log('✅ 跨阶段一致性：正文输出期间 与 正文输出结束 耗时完全一致，未发生刷新跳变！');
  }

  // 截取阶段3（正文已结束）的高清完成图
  const finishPath = path.join(__dirname, '../screenshots/timeline-flow-completed.png');
  await page.screenshot({ path: finishPath });
  console.log(`📸 已捕获【正文结束后】截图: ${finishPath}`);

  await browser.close();
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
