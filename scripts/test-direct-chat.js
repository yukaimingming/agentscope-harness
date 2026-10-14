const { chromium } = require('playwright');

(async () => {
  const browser = await chromium.launch({ channel: 'msedge', headless: true });
  const page = await browser.newPage();
  
  page.on('console', msg => console.log('[Browser Console]', msg.type(), msg.text()));
  page.on('pageerror', err => console.log('[Browser PageError]', err.message));

  console.log('正在访问 http://127.0.0.1:5174...');
  await page.goto('http://127.0.0.1:5174');
  await page.waitForTimeout(2000);

  const sessionCount = await page.locator('.sidebar-session-item').count();
  console.log('当前左侧会话总数:', sessionCount);

  // 逐个点击前 4 个会话，查看右侧内容
  for (let i = 0; i < Math.min(sessionCount, 4); i++) {
    const item = page.locator('.sidebar-session-item').nth(i);
    const title = (await item.innerText()).trim().replace(/\n/g, ' | ');
    console.log(`\n👉 点击测试第 ${i + 1} 个会话: [${title}]`);
    await item.click();
    await page.waitForTimeout(1000);

    const userMsgs = await page.locator('.group\\/user').count();
    const processGroups = await page.locator('section.process-group').count();
    const assistantMsgs = await page.locator('[data-role="assistant"], .text-zinc-100.leading-relaxed').count();
    const greetingCount = await page.locator('h2').count();

    console.log(`  渲染统计 -> 用户消息: ${userMsgs}, 过程时间线: ${processGroups}, 助手消息: ${assistantMsgs}, 空白欢迎语: ${greetingCount}`);
    if (userMsgs > 0 || processGroups > 0) {
      const firstUserText = await page.locator('.group\\/user').first().innerText().catch(() => '');
      console.log(`  ✅ 成功显示历史对话内容: "${firstUserText.slice(0, 40).replace(/\n/g, ' ')}..."`);
    } else if (greetingCount > 0) {
      console.log(`  ℹ️ 此会话为空会话（展示欢迎语与建议提示词）`);
    } else {
      console.warn(`  ⚠️ 此会话未检测到任何内容！`);
    }
  }

  await browser.close();
})();
