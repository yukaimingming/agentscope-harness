const { chromium } = require('playwright');
const path = require('path');
const fs = require('fs');

async function main() {
  const screenshotsDir = path.join(__dirname, '../screenshots');
  if (!fs.existsSync(screenshotsDir)) {
    fs.mkdirSync(screenshotsDir, { recursive: true });
  }

  const browser = await chromium.launch({
    channel: 'msedge',
    headless: true,
    args: ['--no-sandbox', '--disable-gpu']
  });

  const context = await browser.newContext({
    viewport: { width: 1600, height: 1040 },
    deviceScaleFactor: 2.0,
  });

  const page = await context.newPage();

  console.log('1. 正在访问前端应用 http://127.0.0.1:5174 ...');
  await page.goto('http://127.0.0.1:5174', { waitUntil: 'networkidle' });
  await page.waitForTimeout(2000);

  // 1. 截取默认的深色主题
  console.log('2. 截取当前默认深色主题 (Dark)...');
  await page.screenshot({ path: path.join(screenshotsDir, 'theme-1-dark-mode.png') });

  // 2. 切换到浅色主题 (Light)
  console.log('3. 切换至浅色主题 (Light)...');
  await page.evaluate(() => {
    document.documentElement.classList.add('light');
    document.documentElement.classList.remove('dark');
    document.documentElement.setAttribute('data-theme', 'light');
    localStorage.setItem('deepagent_theme_mode', 'light');
  });
  await page.waitForTimeout(1000);

  // 截取浅色主题首页（8宫格与边栏）
  console.log('4. 截取浅色主题首页...');
  await page.screenshot({ path: path.join(screenshotsDir, 'theme-2-light-home.png') });

  // 3. 点击一个历史会话，查看浅色主题下的聊天记录、StatsLine 与 Diff
  console.log('5. 选中历史会话查看聊天区与统计条...');
  const sessionItems = page.locator('.sidebar-session-item');
  if (await sessionItems.count() > 0) {
    await sessionItems.first().click();
    await page.waitForTimeout(1200);
  }
  await page.screenshot({ path: path.join(screenshotsDir, 'theme-3-light-chat-and-stats.png') });

  // 4. 点击用量面板查看 ContextMeter 弹层
  console.log('6. 点击用量面板查看弹层在浅色模式下的展示...');
  const usageBtn = page.locator('button[aria-label*="上下文占用"], button:has-text("用量")').first();
  if (await usageBtn.count() > 0) {
    await usageBtn.click();
    await page.waitForTimeout(800);
  }
  await page.screenshot({ path: path.join(screenshotsDir, 'theme-4-light-context-meter.png') });

  // 5. 打开右侧 Review 边栏查看浅色模式
  console.log('7. 打开右侧 Review 边栏...');
  const reviewBtn = page.locator('button[title*="Review"], button:has-text("Review")').first();
  if (await reviewBtn.count() > 0) {
    await reviewBtn.click();
    await page.waitForTimeout(1000);
  }
  await page.screenshot({ path: path.join(screenshotsDir, 'theme-5-light-review-sidebar.png') });

  // 6. 打开设置弹窗查看设置界面在浅色模式下的展示
  console.log('8. 打开设置弹窗...');
  const settingsBtn = page.locator('button:has-text("设置")').first();
  if (await settingsBtn.count() > 0) {
    await settingsBtn.click();
    await page.waitForTimeout(800);
  }
  await page.screenshot({ path: path.join(screenshotsDir, 'theme-6-light-settings-modal.png') });

  await browser.close();
  console.log('🎉 主题适应性检查截图完成！');
}

main().catch((err) => {
  console.error('测试出错:', err);
  process.exit(1);
});
