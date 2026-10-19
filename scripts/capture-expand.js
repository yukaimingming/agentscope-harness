const { chromium } = require('playwright');
const path = require('path');

async function main() {
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

  const targetItem = page.locator('.sidebar-session-item:has-text("请用 write_file")').first();
  if (await targetItem.count() > 0) {
    await targetItem.click();
    await page.waitForTimeout(2000);
  }

  const timelineBtn = page.locator('.process-group button').first();
  if (await timelineBtn.count() > 0) {
    await timelineBtn.click();
    await page.waitForTimeout(600);
  }

  const pic = path.join(__dirname, '../screenshots/timeline-flow-expanded.png');
  await page.screenshot({ path: pic });
  console.log('展开状态截图已保存:', pic);

  await browser.close();
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
