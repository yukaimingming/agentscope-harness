const { chromium } = require('playwright');
const path = require('path');

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
  const prompt = "请列出当前工作区目录并用一段话解释其主要组成。";
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

  console.log('4. 以高频（200ms）轮询监控时间线秒数变化序列...');
  const observedSeconds = [];
  let lastLoggedText = '';
  let midStreamPicTaken = false;
  let finalFinishedPicTaken = false;

  const maxWait = 90000;
  const start = Date.now();

  while (Date.now() - start < maxWait) {
    await page.waitForTimeout(200);

    const timelineBtn = page.locator('.process-group button').first();
    let btnText = '';
    if (await timelineBtn.count() > 0) {
      btnText = (await timelineBtn.innerText()).trim();
    }

    if (!btnText) continue;

    // 解析当前文本中的分与秒：例如 "0分1秒" -> 1，"0分2秒" -> 2
    const match = btnText.match(/(\d+)分(\d+)秒/);
    if (match) {
      const minutes = parseInt(match[1], 10);
      const seconds = parseInt(match[2], 10);
      const totalSec = minutes * 60 + seconds;

      if (observedSeconds.length === 0 || observedSeconds[observedSeconds.length - 1] !== totalSec) {
        observedSeconds.push(totalSec);
        console.log(`   ⏱️ [秒数捕获] -> ${totalSec}秒 (完整文案: "${btnText}")`);
      }
    }

    const stopBtn = page.locator('button:has(svg.lucide-square), button[title*="停止"]');
    const isStreaming = (await stopBtn.count()) > 0;

    // 当已完成分析且正文正在流式输出中时截取一张图
    if (btnText.includes('已完成分析') && isStreaming && !midStreamPicTaken) {
      const picPath = path.join(__dirname, '../screenshots/timeline-mid-stream-monotonic.png');
      await page.screenshot({ path: picPath });
      console.log(`   📸 [截图1] 已捕获正文流式打字中截图: ${picPath}`);
      midStreamPicTaken = true;
    }

    // 当整轮彻底结束时
    if (btnText.includes('已完成分析') && !isStreaming && midStreamPicTaken) {
      const picPath = path.join(__dirname, '../screenshots/timeline-finished-monotonic.png');
      await page.screenshot({ path: picPath });
      console.log(`   📸 [截图2] 已捕获整轮结束完成截图: ${picPath}`);
      finalFinishedPicTaken = true;
      break;
    }
  }

  console.log('\n--- 秒数序列严格检验分析 ---');
  console.log('捕获到的非重复秒数序列:', observedSeconds);

  // 1. 检查是否有跳回（单调递增性）
  let hasRegressed = false;
  for (let i = 1; i < observedSeconds.length; i++) {
    if (observedSeconds[i] < observedSeconds[i - 1]) {
      console.error(`❌ 发现秒数回退Bug: ${observedSeconds[i - 1]}秒 -> ${observedSeconds[i]}秒！`);
      hasRegressed = true;
    }
  }
  if (!hasRegressed) {
    console.log('✅ 检验1【绝对单调递增】：整个过程秒数只增不减，彻底杜绝跳回 1秒 的情况！');
  }

  // 2. 检查是否有跳两秒（严格按1秒1秒累加）
  let hasSkipped = false;
  for (let i = 1; i < observedSeconds.length; i++) {
    const diff = observedSeconds[i] - observedSeconds[i - 1];
    if (diff > 1) {
      console.error(`❌ 发现跳秒Bug: 从 ${observedSeconds[i - 1]}秒 直接跳到了 ${observedSeconds[i]}秒（跳过了 ${diff - 1} 秒）！`);
      hasSkipped = true;
    }
  }
  if (!hasSkipped) {
    console.log('✅ 检验2【严格按1秒1秒累加】：秒数步进严格为 +1（例如 1->2->3->4...），彻底杜绝跳两秒的情况！');
  }

  await browser.close();
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
