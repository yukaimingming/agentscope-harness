const { chromium } = require('playwright');
const path = require('path');

async function testSelectSession() {
  const browser = await chromium.launch({ channel: 'msedge', headless: true });
  const context = await browser.newContext({
    viewport: { width: 1440, height: 1100 },
    deviceScaleFactor: 2.0,
  });
  const page = await context.newPage();
  console.log('访问页面...');
  await page.goto('http://127.0.0.1:5174', { waitUntil: 'networkidle' });
  await page.waitForTimeout(2000);

  // 点击会话 [8] (22:03 文件变更会话)
  console.log('点击会话 [8] (22:03 生成了完整 Diff 的会话)...');
  const items = page.locator('.sidebar-session-item');
  await items.nth(8).click();
  await page.waitForTimeout(3000);

  // 1. 展开已完成分析
  const processBtn = page.locator('button:has-text("已完成分析")');
  if (await processBtn.count() > 0) {
    console.log('点击展开 [已完成分析] 面板');
    await processBtn.first().click();
    await page.waitForTimeout(600);
  }

  // 2. 展开所有 details
  await page.evaluate(() => {
    document.querySelectorAll('details').forEach(el => el.open = true);
  });

  // 3. 展开文件变更总卡片
  const queueBtn = page.locator('button:has-text("个文件变更")');
  if (await queueBtn.count() > 0) {
    console.log('点击展开 [个文件变更] 总卡片');
    await queueBtn.first().click();
    await page.waitForTimeout(800);
  }

  // 4. 展开 demo-notes 行以显示统一 diff patch 文本
  const row = page.locator('button:has-text("demo-notes")');
  if (await row.count() > 0) {
    console.log('点击展开 demo-notes 具体文件 Diff 补丁');
    await row.first().click();
    await page.waitForTimeout(800);
  }

  // 5. 滚动到文件变更卡片区域
  await page.evaluate(() => {
    const btn = Array.from(document.querySelectorAll('button')).find(b => b.textContent && b.textContent.includes('个文件变更'));
    const pre = document.querySelector('pre');
    const el = pre || btn;
    if (el) el.scrollIntoView({ behavior: 'instant', block: 'center' });
  });

  await page.waitForTimeout(1200);
  const outPath = path.join(__dirname, '..', 'screenshots', 'card-02-file-diff.png');
  await page.screenshot({ path: outPath, fullPage: true });
  console.log('Diff 会话截图已更新：', outPath);

  await browser.close();
}

testSelectSession().catch(console.error);
