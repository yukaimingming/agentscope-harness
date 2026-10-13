const { chromium } = require('playwright');
const path = require('path');

async function main() {
  const browser = await chromium.launch({ channel: 'msedge', headless: true });
  const context = await browser.newContext({
    viewport: { width: 1440, height: 1100 },
    deviceScaleFactor: 2.0,
  });
  const page = await context.newPage();

  console.log('1. 打开主页面...');
  await page.goto('http://127.0.0.1:5174', { waitUntil: 'networkidle' });
  await page.waitForTimeout(2000);

  console.log('2. 点击 [新聊天]...');
  const newChatBtn = page.locator('button:has-text("新聊天")');
  if (await newChatBtn.count() > 0) {
    await newChatBtn.first().click();
    await page.waitForTimeout(1000);
  }

  console.log('3. 输入指令并发送...');
  const textarea = page.locator('textarea');
  await textarea.fill('请执行 execute 工具运行 dir 命令查看当前目录，并分析工作区内容。');
  await page.keyboard.press('Enter');

  console.log('4. 等待 4 秒，截取流式进行中画面...');
  await page.waitForTimeout(4000);
  const runningShot = path.join(__dirname, '..', 'screenshots', '06-executing-live.png');
  await page.screenshot({ path: runningShot, fullPage: true });
  console.log('已保存执行中截图：', runningShot);

  console.log('5. 等待本轮任务彻底完成...');
  // 等待底部的发送按钮重新变为可用（没有停止按钮）
  await page.waitForTimeout(18000);

  console.log('6. 展开思考与工具调用卡片详情...');
  // 点击展开 [已完成分析]
  const analysisBtn = page.locator('button:has-text("已完成分析")');
  if (await analysisBtn.count() > 0) {
    await analysisBtn.first().click();
    await page.waitForTimeout(800);
  }

  // 展开所有 details
  await page.evaluate(() => {
    document.querySelectorAll('details').forEach((d) => { d.open = true; });
  });

  await page.waitForTimeout(1000);

  const completedShot = path.join(__dirname, '..', 'screenshots', '07-completed-with-details.png');
  await page.screenshot({ path: completedShot, fullPage: true });
  console.log('已保存完整展开截图：', completedShot);

  await browser.close();
  console.log('全部端到端验证执行完毕！');
}

main().catch(console.error);
