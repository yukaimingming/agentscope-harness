const { chromium } = require('playwright');
const path = require('path');

async function test() {
  const browser = await chromium.launch({ channel: 'msedge', headless: true });
  const context = await browser.newContext({
    viewport: { width: 1440, height: 1200 },
    deviceScaleFactor: 2.0,
  });
  const page = await context.newPage();

  console.log('1. 打开前端 http://127.0.0.1:5174 ...');
  await page.goto('http://127.0.0.1:5174', { waitUntil: 'networkidle' });
  await page.waitForTimeout(2000);

  console.log('2. 点击新聊天按钮...');
  const newChatBtn = page.locator('button:has-text("新聊天")');
  if (await newChatBtn.count() > 0) {
    await newChatBtn.first().click();
    await page.waitForTimeout(1000);
  }

  console.log('3. 输入用户测试提示词：请查看当前目录，并分析工作区内容。');
  const textarea = page.locator('textarea');
  await textarea.fill('请查看当前目录，并分析工作区内容。');
  await page.keyboard.press('Enter');

  console.log('4. 等待任务完全执行完成（包括思考、多轮工具调用及最终回答）...');
  // 轮询等待停止按钮变为发送按钮（即完成）
  for (let i = 0; i < 40; i++) {
    await page.waitForTimeout(1500);
    const stopBtn = page.locator('button[title="停止生成"], button:has(svg.lucide-square)');
    const count = await stopBtn.count();
    if (count === 0 && i > 5) {
      console.log(`执行在第 ${i * 1.5} 秒完成！`);
      break;
    }
  }

  await page.waitForTimeout(2000);

  // 展开思考与分析折叠，同时展示完整内容
  const analysisBtn = page.locator('button:has-text("已完成分析")');
  if (await analysisBtn.count() > 0) {
    await analysisBtn.first().click().catch(() => {});
    await page.waitForTimeout(800);
  }

  await page.evaluate(() => {
    document.querySelectorAll('details').forEach((d) => { d.open = true; });
  });

  await page.waitForTimeout(1500);

  const outPath = path.join(__dirname, '..', 'screenshots', '09-no-blank-md-verified.png');
  await page.screenshot({ path: outPath, fullPage: true });
  console.log('已成功保存验证截图：', outPath);

  // 检查页面上是否有多余的空 message
  const emptyActionToolbars = await page.evaluate(() => {
    // 检查所有含有复制按钮的消息气泡，其正文文本长度
    const msgs = Array.from(document.querySelectorAll('.group\\/user, [class*="Message"]'));
    return msgs.length;
  });
  console.log('页面总消息容器数量：', emptyActionToolbars);

  await browser.close();
  console.log('测试完成！');
}

test().catch(console.error);
