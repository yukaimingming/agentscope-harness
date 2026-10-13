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

  console.log('等待智能体总结回答完成...');
  await page.waitForTimeout(6000);

  // 展开分析过程折叠
  const analysisBtn = page.locator('button:has-text("已完成分析")');
  if (await analysisBtn.count() > 0) {
    await analysisBtn.first().click().catch(() => {});
    await page.waitForTimeout(800);
  }

  // 展开所有 details 节点
  await page.evaluate(() => {
    document.querySelectorAll('details').forEach((d) => { d.open = true; });
  });

  await page.waitForTimeout(1000);
  const outPath = path.join(__dirname, '..', 'screenshots', '08-final-full-timeline.png');
  await page.screenshot({ path: outPath, fullPage: true });
  console.log('已保存完整交付截图：', outPath);
  await browser.close();
}

test().catch(console.error);
