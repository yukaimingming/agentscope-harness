const { chromium } = require('playwright');
const path = require('path');

async function main() {
  const browser = await chromium.launch({
    channel: 'msedge',
    headless: true,
  });
  const ctx = await browser.newContext({
    viewport: { width: 1560, height: 1020 },
    deviceScaleFactor: 2.0,
  });
  const page = await ctx.newPage();
  await page.goto('http://127.0.0.1:5174', { waitUntil: 'networkidle' });
  await page.waitForTimeout(1500);

  // 点击收起右侧边栏
  const closeBtn = page.locator('button[title="收起右侧边栏"]').first();
  if (await closeBtn.count() > 0) {
    await closeBtn.click();
    await page.waitForTimeout(600);
  }

  const pic = path.join(__dirname, '../screenshots/review-collapsed.png');
  await page.screenshot({ path: pic });
  console.log('✅ 收起侧边栏截图已保存:', pic);

  await browser.close();
}

main().catch(console.error);
