const { chromium } = require('playwright');
const path = require('path');

async function main() {
  const browser = await chromium.launch({
    channel: 'msedge',
    headless: true,
  });

  const context = await browser.newContext({
    viewport: { width: 1560, height: 1020 },
    deviceScaleFactor: 2.0,
  });

  const page = await context.newPage();
  await page.goto('http://127.0.0.1:5174', { waitUntil: 'networkidle' });
  await page.waitForTimeout(2500);

  // 确保侧边栏展开
  const aside = page.locator('aside').last();
  if (!await aside.isVisible()) {
    const toggleBtn = page.locator('button[title*="代码审查"]').first();
    await toggleBtn.click();
    await page.waitForTimeout(1000);
  }

  // 等待 Git 数据加载
  await page.waitForSelector('text=Changes', { timeout: 8000 });
  await page.waitForTimeout(1500);

  // 点击选择 GitService.java 查看清晰的逐行代码差异
  const gitServiceBtn = page.locator('aside button:has-text("GitService.java")').first();
  if (await gitServiceBtn.count() > 0) {
    await gitServiceBtn.click();
    await page.waitForTimeout(1500);
  }

  const pic1 = path.join(__dirname, '../screenshots/fix-1-code-diff-overview.png');
  await page.screenshot({ path: pic1 });
  console.log('✅ 已成功更新场景 1 截图:', pic1);

  await browser.close();
}

main().catch(console.error);
