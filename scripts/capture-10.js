const { chromium } = require('playwright');
const path = require('path');

async function test() {
  const browser = await chromium.launch({ channel: 'msedge', headless: true });
  const context = await browser.newContext({
    viewport: { width: 1440, height: 1300 },
    deviceScaleFactor: 2.0,
  });
  const page = await context.newPage();
  await page.goto('http://127.0.0.1:5174', { waitUntil: 'networkidle' });
  await page.waitForTimeout(5000);

  // 展开思考与分析
  const analysisBtn = page.locator('button:has-text("已完成分析")');
  if (await analysisBtn.count() > 0) {
    await analysisBtn.first().click().catch(() => {});
    await page.waitForTimeout(800);
  }

  await page.evaluate(() => {
    document.querySelectorAll('details').forEach((d) => { d.open = true; });
  });

  await page.waitForTimeout(1000);
  const outPath = path.join(__dirname, '..', 'screenshots', '10-no-blank-final-completed.png');
  await page.screenshot({ path: outPath, fullPage: true });
  console.log('已保存收尾完成截图：', outPath);
  await browser.close();
}

test().catch(console.error);
