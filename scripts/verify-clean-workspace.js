const { chromium } = require('playwright');
const path = require('path');
const fs = require('fs');

async function main() {
  const screenshotsDir = path.join(__dirname, '../screenshots');
  const browser = await chromium.launch({
    channel: 'msedge',
    headless: true,
    args: ['--no-sandbox', '--disable-gpu']
  });

  const context = await browser.newContext({
    viewport: { width: 1560, height: 1020 },
    deviceScaleFactor: 2.0,
  });

  const page = await context.newPage();

  // 模拟空工作区或无 Git 变更返回
  await page.route('**/api/git/status*', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        isGitRepo: true,
        branch: 'main',
        repoRoot: 'D:\\temp\\agentscope-harness\\empty-workspace',
        changes: [],
        staged: [],
        commits: [],
      }),
    });
  });

  console.log('1. 正在访问前端并展开 Review...');
  await page.goto('http://127.0.0.1:5174', { waitUntil: 'networkidle' });
  await page.waitForTimeout(1000);

  let aside = page.locator('aside').last();
  if (!await aside.isVisible()) {
    const toggleBtn = page.locator('button[title*="代码审查"]').first();
    await toggleBtn.click();
    await page.waitForTimeout(800);
  }

  // 点击 Review 卡片
  const reviewCard = page.locator('aside button:has-text("Review")').first();
  await reviewCard.click();
  await page.waitForTimeout(1000);

  const pic = path.join(screenshotsDir, 'verify-user-6-clean-workspace-no-list.png');
  await page.screenshot({ path: pic });
  console.log('✅ 已保存截图 6 (无修改时右侧变更列表隐藏，左侧满屏干净工作区):', pic);

  await browser.close();
}

main().catch(console.error);
