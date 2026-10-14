const { chromium } = require('playwright');

(async () => {
  const browser = await chromium.launch({ channel: 'msedge', headless: true });
  const page = await browser.newPage();
  
  page.on('console', msg => console.log('[Browser Console]', msg.type(), msg.text()));
  page.on('pageerror', err => console.log('[Browser PageError]', err.message));

  console.log('1. 打开 http://127.0.0.1:5174...');
  await page.goto('http://127.0.0.1:5174');
  await page.waitForTimeout(2000);

  // 点击左侧“新聊天”按钮，确保进入直接聊天的空面板
  const newChatBtn = page.locator('button:has-text("新聊天")').first();
  await newChatBtn.click();
  await page.waitForTimeout(1000);

  // 检查当前是否在空会话面板
  const suggestionCards = page.locator('button:has-text("待办规划"), button:has-text("文件变更"), button:has-text("深度思考")');
  const count = await suggestionCards.count();
  console.log(`2. 找到建议提示词卡片数量: ${count}`);

  // 点击第 3 张卡片：深度思考
  console.log('3. 点击 [深度思考] 建议提示词卡片...');
  const thinkCard = page.locator('button:has-text("深度思考")').first();
  await thinkCard.click();

  // 观察 5 秒内右侧的变化
  console.log('4. 观察 5 秒内页面的响应...');
  for (let s = 1; s <= 5; s++) {
    await page.waitForTimeout(1000);
    const state = await page.evaluate(() => {
      const msgs = document.querySelectorAll('.group\\/user, .process-group, [data-role="assistant"]');
      const userMsg = document.querySelector('.group\\/user')?.innerText || '';
      const isRunning = Boolean(document.querySelector('.streaming-caret, .animate-spin, .animate-pulse'));
      const textVal = document.querySelector('textarea')?.value || '';
      return {
        messagesCount: msgs.length,
        userMsg: userMsg.slice(0, 30),
        isRunning,
        textVal,
      };
    });
    console.log(`  [第 ${s} 秒] 页面状态:`, state);
  }

  await browser.close();
})();
