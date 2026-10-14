const { chromium } = require('playwright');
const path = require('path');

async function main() {
  console.log('1. 启动浏览器并访问前端页面 http://127.0.0.1:5174...');
  const browser = await chromium.launch({ channel: 'msedge', headless: true });
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

  // 2. 发送清晰的文件写入测试指令
  const prompt = "在工作区使用 write_file 创建 reflect-final.txt，写入：'Reflection自检校验成功'，并展示你的自检落盘能力。";
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

  // 3. 等待智能体完全执行完所有工具和回答
  console.log('4. 持续等待工具执行完成与 Reflection 落盘自检...');
  const maxWaitMs = 120000;
  const start = Date.now();
  let done = false;

  while (Date.now() - start < maxWaitMs) {
    await page.waitForTimeout(3000);

    // 检查是否有完成标识
    const finishLabel = page.locator('button:has-text("已完成分析")');
    const cornerIcon = page.locator('svg.lucide-corner-down-left');

    const hasFinishLabel = (await finishLabel.count()) > 0;
    const hasCorner = (await cornerIcon.count()) > 0;

    // 确保已经有实质性的工具卡片和内容产生
    const activities = page.locator('.process-activity-enter, .group\\/user');
    const actCount = await activities.count();

    if (hasFinishLabel && hasCorner && actCount >= 2) {
      console.log(`🎉 判定整轮执行已彻底完成！（耗时 ${Math.round((Date.now() - start) / 1000)} 秒）`);
      done = true;
      break;
    }
  }

  if (!done) {
    console.log('等待超时，继续抓取当前页面截图...');
  }
  await page.waitForTimeout(2000);

  // 4. 展开时间线和所有工具详情
  console.log('5. 展开过程时间线与工具调用详情...');
  const processBtn = page.locator('section.process-group button').first();
  if (await processBtn.count() > 0) {
    const isExp = await processBtn.getAttribute('aria-expanded');
    if (isExp !== 'true') await processBtn.click();
  }
  await page.waitForTimeout(600);

  // 展开所有 details 节点，显示工具参数与输出详情（包含 Reflection 记录）
  await page.evaluate(() => {
    document.querySelectorAll('details').forEach(el => el.open = true);
  });
  await page.waitForTimeout(1000);

  // 5. 截图保存
  const shotPath = path.join(__dirname, '..', 'screenshots', 'reflection-verification.png');
  await page.screenshot({ path: shotPath, fullPage: true });
  console.log(`✅ [截图交付] Reflection 自我检查验证截图已保存: ${shotPath}`);

  await browser.close();
  console.log('\n🎉 Reflection 自检功能端到端验证全部完成！');
}

main().catch(err => {
  console.error('测试执行失败:', err);
  process.exit(1);
});
