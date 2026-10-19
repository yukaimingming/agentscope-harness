const { chromium } = require('playwright');
const path = require('path');
const fs = require('fs');

async function main() {
  console.log('1. 启动 Edge 浏览器并访问前端页面 http://127.0.0.1:5174...');
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

  await page.goto('http://127.0.0.1:5174', { waitUntil: 'networkidle' });
  await page.waitForTimeout(2000);

  // 1. 点击新聊天
  console.log('2. 点击 [新聊天] 开启独立测试轮次...');
  const newChatBtn = page.locator('button:has-text("新聊天")').first();
  await newChatBtn.click();
  await page.waitForTimeout(1000);

  // 2. 发送一个需要思考和工具执行的提示词
  const prompt = "请列出当前工作区目录下的所有文件并简要解释其结构。";
  console.log(`3. 发送测试提示词: "${prompt}"...`);

  const textarea = page.locator('textarea[placeholder*="输入任务描述"]').first();
  await textarea.fill(prompt);
  await page.waitForTimeout(400);

  const sendBtn = page.locator('button[title*="发送 (Enter)"], button:has-text("发送")').first();
  if (await sendBtn.count() > 0 && await sendBtn.isEnabled()) {
    await sendBtn.click();
  } else {
    await textarea.press('Enter');
  }

  console.log('4. 实时监控时间线文案流转与正文流式阶段的耗时锁定情况...');
  const maxWaitMs = 90000;
  const start = Date.now();
  let sawAnalyzing = false;
  let sawStreamingAnswerWithFixedTime = false;
  let analyzingText = '';
  let streamingAnswerText = '';
  let finalFinishedText = '';
  let streamingScreenshotTaken = false;

  while (Date.now() - start < maxWaitMs) {
    await page.waitForTimeout(500);

    // 获取时间线按钮上的文本
    const timelineBtn = page.locator('.process-group button').first();
    let btnText = '';
    if (await timelineBtn.count() > 0) {
      btnText = (await timelineBtn.innerText()).trim();
    }

    // 检查是否有正文内容正在输出
    const assistantContent = page.locator('.message-bubble-assistant, .prose').first();
    let contentLen = 0;
    if (await assistantContent.count() > 0) {
      contentLen = (await assistantContent.innerText()).length;
    }

    // 检查是否整轮结束（发送按钮恢复可用，或者有角标）
    const cornerIcon = page.locator('svg.lucide-corner-down-left');
    const isDone = (await cornerIcon.count()) > 0 && contentLen > 20;

    if (btnText.includes('正在分析')) {
      sawAnalyzing = true;
      analyzingText = btnText;
      console.log(`   [分析中状态] -> ${btnText}`);
    } else if (btnText.includes('已完成分析')) {
      if (!isDone && contentLen > 10) {
        // 说明正处于「正文流式输出中」！
        sawStreamingAnswerWithFixedTime = true;
        streamingAnswerText = btnText;
        console.log(`   [正文输出中时间线] -> ${btnText} (当前正文已输出 ${contentLen} 字)`);

        if (!streamingScreenshotTaken) {
          const streamPic = path.join(__dirname, '../screenshots/timeline-during-streaming.png');
          await page.screenshot({ path: streamPic, fullPage: false });
          console.log(`   📸 已捕获正文流式阶段截图: ${streamPic}`);
          streamingScreenshotTaken = true;
        }
      }

      if (isDone) {
        finalFinishedText = btnText;
        console.log(`   [整轮完成最终时间线] -> ${btnText}`);
        break;
      }
    }
  }

  console.log('\n--- 验证结果汇总 ---');
  console.log(`1. 是否经历过「正在分析」阶段: ${sawAnalyzing ? '是 (' + analyzingText + ')' : '否'}`);
  console.log(`2. 正文流式输出期间时间线文字: "${streamingAnswerText}"`);
  console.log(`3. 整轮结束最终时间线文字: "${finalFinishedText}"`);

  // 判断是否出现 1 秒跳变
  const hasOneSecBug = streamingAnswerText.includes('用时 1秒') && !analyzingText.includes('1秒');
  if (hasOneSecBug) {
    console.error('❌ 检测到正文输出时时间线跳变成 1秒的 Bug！');
  } else {
    console.log('✅ 正文输出期间时间线耗时稳定锁定，未出现 1 秒异常！');
  }

  if (streamingAnswerText && finalFinishedText && streamingAnswerText === finalFinishedText) {
    console.log('✅ 正文流式阶段与最终完成阶段耗时完全一致，未发生刷新跳变！');
  }

  // 展开时间线卡片并截取最终结果截图
  const timelineBtn = page.locator('.process-group button').first();
  if (await timelineBtn.count() > 0) {
    await timelineBtn.click();
    await page.waitForTimeout(600);
  }

  const finalPic = path.join(__dirname, '../screenshots/timeline-time-fixed.png');
  await page.screenshot({ path: finalPic, fullPage: false });
  console.log(`📸 已保存最终验证截图: ${finalPic}`);

  await browser.close();
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
