const { chromium } = require('playwright');

(async () => {
  const browser = await chromium.launch({ channel: 'msedge', headless: true });
  const page = await browser.newPage();
  
  page.on('console', msg => {
    console.log(`[Browser ${msg.type()}]:`, msg.text());
  });
  page.on('pageerror', err => {
    console.log('[Browser PageError Stack]:', err.stack || err.message);
  });

  await page.goto('http://127.0.0.1:5174');
  await page.waitForTimeout(2000);

  const newChatBtn = page.locator('button:has-text("新聊天")').first();
  await newChatBtn.click();
  await page.waitForTimeout(800);

  console.log('点击 [计划审批] 卡片...');
  const planBtn = page.locator('button:has-text("计划审批")').first();
  await planBtn.click();

  await page.waitForTimeout(6000);

  await browser.close();
})();
