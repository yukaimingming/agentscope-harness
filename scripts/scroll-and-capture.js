const { chromium } = require('playwright');
const path = require('path');

async function scrollAndCapture() {
  const browser = await chromium.launch({ channel: 'msedge', headless: true });
  const context = await browser.newContext({
    viewport: { width: 1440, height: 1100 },
    deviceScaleFactor: 2.0,
  });
  const page = await context.newPage();
  console.log('访问页面...');
  await page.goto('http://127.0.0.1:5174', { waitUntil: 'networkidle' });
  await page.waitForTimeout(2000);

  // 点击展开已完成分析
  const processBtn = page.locator('button:has-text("已完成分析")');
  if (await processBtn.count() > 0) {
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
    await queueBtn.first().click();
    await page.waitForTimeout(500);
  }

  // 展开 demo-notes 行
  const row = page.locator('button:has-text("demo-notes")');
  if (await row.count() > 0) {
    await row.first().click();
    await page.waitForTimeout(500);
  }

  // 滚动到底部
  console.log('滚动到底部并等待渲染稳定...');
  await page.evaluate(() => {
    // 找到消息滚动容器或全页滚动
    const scrollables = Array.from(document.querySelectorAll('*')).filter(el => {
      return el.scrollHeight > el.clientHeight && (getComputedStyle(el).overflowY === 'auto' || getComputedStyle(el).overflowY === 'scroll');
    });
    scrollables.forEach(el => el.scrollTop = el.scrollHeight);
    window.scrollTo(0, document.body.scrollHeight);
  });
  await page.waitForTimeout(1500);

  const outPath = path.join(__dirname, '..', 'screenshots', 'card-02-file-diff.png');
  await page.screenshot({ path: outPath, fullPage: true });
  console.log('底部Diff完整大图已保存：', outPath);

  await browser.close();
}

scrollAndCapture().catch(console.error);
