const { chromium } = require('playwright');
const path = require('path');

(async () => {
  const browser = await chromium.launch({ channel: 'msedge', headless: true });
  const page = await browser.newPage({ viewport: { width: 1600, height: 1040 } });
  await page.goto('http://127.0.0.1:5174');
  await page.waitForTimeout(1500);
  await page.evaluate(() => {
    document.documentElement.classList.add('light');
    document.documentElement.classList.remove('dark');
    document.documentElement.setAttribute('data-theme', 'light');
    localStorage.setItem('deepagent_theme_mode', 'light');
  });
  // 点击新聊天按钮
  const newChatBtn = page.locator('button:has-text("新聊天")').first();
  if (await newChatBtn.count() > 0) await newChatBtn.click();
  await page.waitForTimeout(1000);
  await page.screenshot({ path: path.join(__dirname, '../screenshots/theme-check-8cards.png') });
  await browser.close();
  console.log('Done');
})();
