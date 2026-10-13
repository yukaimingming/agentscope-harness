const { chromium } = require('playwright');
const path = require('path');

async function capture() {
  const browser = await chromium.launch({ channel: 'msedge', headless: true });
  const context = await browser.newContext({
    viewport: { width: 1440, height: 1100 },
    deviceScaleFactor: 2.0,
  });
  const page = await context.newPage();
  console.log('访问页面...');
  await page.goto('http://127.0.0.1:5174', { waitUntil: 'networkidle' });
  await page.waitForTimeout(2000);

  // 展开已完成分析
  const processBtn = page.locator('button:has-text("已完成分析")');
  if (await processBtn.count() > 0) {
    console.log('点击展开 [已完成分析] 面板');
    await processBtn.first().click();
    await page.waitForTimeout(500);
  }

  // 展开所有 details
  await page.evaluate(() => {
    document.querySelectorAll('details').forEach(el => el.open = true);
  });

  // 展开文件变更总卡片
  const queueBtn = page.locator('button:has-text("个文件变更")');
  if (await queueBtn.count() > 0) {
    console.log('点击展开 [个文件变更] 总卡片');
    await queueBtn.first().click();
    await page.waitForTimeout(500);
  }

  // 展开 demo-notes 行
  const row = page.locator('button:has-text("demo-notes")');
  if (await row.count() > 0) {
    console.log('点击展开 demo-notes 具体文件 Diff');
    await row.first().click();
    await page.waitForTimeout(500);
  }

  // 滚动到底部让 Diff 居中
  await page.evaluate(() => {
    const el = document.querySelector('pre') || document.querySelector('button:has-text("个文件变更")');
    if (el) el.scrollIntoView({ behavior: 'instant', block: 'center' });
  });

  await page.waitForTimeout(1000);
  const outPath = path.join(__dirname, '..', 'screenshots', 'card-02-file-diff.png');
  await page.screenshot({ path: outPath, fullPage: true });
  console.log('Diff 最终全屏大图已保存：', outPath);

  await browser.close();
}

capture().catch(console.error);
