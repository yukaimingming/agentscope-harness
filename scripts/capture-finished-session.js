const { chromium } = require('playwright');
const path = require('path');

async function main() {
  console.log('1. 连接浏览器查看当前最新会话状态...');
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

  // 点击左侧“最近”里的“请列出当前工作区目录下的所有文件并简要解释其结构...”会话
  console.log('2. 查找并选中刚才测试的会话...');
  const targetItem = page.locator('.sidebar-session-item:has-text("请列出当前")').first();
  if (await targetItem.count() > 0) {
    await targetItem.click();
    await page.waitForTimeout(3000);
  }

  // 等待右下角停止按钮消失（即整轮回答彻底完成）
  console.log('3. 等待正文输出彻底结束...');
  for (let i = 0; i < 40; i++) {
    const stopBtn = page.locator('button:has(svg.lucide-square), button[title*="停止"]');
    if (await stopBtn.count() === 0) {
      console.log('正文输出已彻底完成！');
      break;
    }
    await page.waitForTimeout(2000);
  }

  // 获取时间线文案
  const timelineBtn = page.locator('.process-group button').first();
  if (await timelineBtn.count() > 0) {
    const text = await timelineBtn.innerText();
    console.log(`最终时间线文本: "${text.trim()}"`);
  }

  // 截图 1：时间线收起状态（默认状态），展示正文与时间线头部
  const collapsePic = path.join(__dirname, '../screenshots/timeline-time-settled-collapsed.png');
  await page.screenshot({ path: collapsePic, fullPage: false });
  console.log(`📸 截图 1 已保存: ${collapsePic}`);

  // 截图 2：点击展开时间线，展示内部完整的分析思考链与 Reflection
  if (await timelineBtn.count() > 0) {
    await timelineBtn.click();
    await page.waitForTimeout(600);
  }

  const expandPic = path.join(__dirname, '../screenshots/timeline-time-settled-expanded.png');
  await page.screenshot({ path: expandPic, fullPage: false });
  console.log(`📸 截图 2 已保存: ${expandPic}`);

  await browser.close();
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
