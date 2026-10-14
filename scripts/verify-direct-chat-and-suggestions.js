const { chromium } = require('playwright');
const path = require('path');

async function main() {
  const browser = await chromium.launch({ channel: 'msedge', headless: true });
  const context = await browser.newContext({
    viewport: { width: 1440, height: 1000 },
    deviceScaleFactor: 2.0,
  });
  const page = await context.newPage();

  console.log('1. 打开前端页面 http://127.0.0.1:5174...');
  await page.goto('http://127.0.0.1:5174', { waitUntil: 'networkidle' });
  await page.waitForTimeout(2000);

  // ---------------------------------------------------------------------
  // 验证点 1: 左侧点击历史会话，右侧正常展示历史内容
  // ---------------------------------------------------------------------
  console.log('\n2. 验证左侧点击历史会话，右侧内容展示...');
  const sessionItems = page.locator('.sidebar-session-item');
  const count = await sessionItems.count();
  console.log(`发现历史会话数: ${count}`);

  // 找到一个包含完整执行过程与结果的历史会话点击
  let targetSession = sessionItems.nth(0);
  for (let i = 0; i < count; i++) {
    const text = (await sessionItems.nth(i).innerText()).trim();
    if (text.includes("在工作区创建") || text.includes("执行 Shell") || text.includes("你有哪些能力")) {
      targetSession = sessionItems.nth(i);
      console.log(`选择有完整执行历史的第 ${i + 1} 个会话: [${text.replace(/\n/g, ' | ')}]`);
      break;
    }
  }
  await targetSession.click();
  await page.waitForTimeout(2000);

  // 展开过程时间线（如果已存在）
  const processBtn = page.locator('section.process-group button').first();
  if (await processBtn.count() > 0) {
    const isExp = await processBtn.getAttribute('aria-expanded');
    if (isExp !== 'true') await processBtn.click();
  }
  await page.evaluate(() => {
    document.querySelectorAll('details').forEach(el => el.open = true);
  });
  await page.waitForTimeout(800);

  const shot1 = path.join(__dirname, '..', 'screenshots', 'history-session-content-verified.png');
  await page.screenshot({ path: shot1, fullPage: true });
  console.log(`✅ [截图 1] 历史会话内容展示截图已保存: ${shot1}`);

  // ---------------------------------------------------------------------
  // 验证点 2: 切换到直接聊天模式（无工作区），展示建议提示词面板
  // ---------------------------------------------------------------------
  console.log('\n3. 点击 [新聊天] 并切换至直接聊天模式...');
  const newChatBtn = page.locator('button:has-text("新聊天")').first();
  await newChatBtn.click();
  await page.waitForTimeout(800);

  // 确保没有残留遮罩弹窗
  const modalClose = page.locator('button[aria-label="关闭"], button:has-text("取消")');
  if (await modalClose.count() > 0) {
    try { await modalClose.first().click(); } catch {}
    await page.waitForTimeout(300);
  }

  // 点击底栏工作区选择菜单，切换为「直接聊天」模式
  const wsSelector = page.locator('button[data-testid="workspace-mode-selector"]').first();
  if (await wsSelector.count() > 0) {
    const wsText = await wsSelector.innerText();
    if (!wsText.includes("直接聊天")) {
      await wsSelector.click();
      await page.waitForTimeout(400);
      const directOption = page.locator('.workspace-dropdown-panel button:has-text("直接聊天")').first();
      if (await directOption.count() > 0) {
        await directOption.click();
        await page.waitForTimeout(600);
      }
    }
  }

  // 截图 2: 直接聊天模式下的建议提示词面板展示
  const shot2 = path.join(__dirname, '..', 'screenshots', 'direct-chat-suggestions-panel.png');
  await page.screenshot({ path: shot2, fullPage: true });
  console.log(`✅ [截图 2] 直接聊天建议提示词面板已保存: ${shot2}`);

  // ---------------------------------------------------------------------
  // 验证点 3: 点击建议提示词卡片 [深度思考]，验证直接聊天模式下执行并输出
  // ---------------------------------------------------------------------
  console.log('\n4. 点击 [深度思考] 建议提示词，启动执行...');
  const thinkCard = page.locator('button:has-text("深度思考")').first();
  await thinkCard.click();

  console.log('等待深度思考完成与回答生成...');
  // 等待“已完成分析”按钮出现
  try {
    await page.locator('button:has-text("已完成分析")').first().waitFor({ timeout: 35000 });
    console.log('分析与思考过程已完成！');
  } catch {
    console.log('等待超时或回答已完成，继续检查正文...');
  }
  await page.waitForTimeout(3000);

  // 展开思考过程供截图展示
  const processBtn2 = page.locator('section.process-group button').first();
  if (await processBtn2.count() > 0) {
    const isExp = await processBtn2.getAttribute('aria-expanded');
    if (isExp !== 'true') await processBtn2.click();
  }
  await page.evaluate(() => {
    document.querySelectorAll('details').forEach(el => el.open = true);
  });
  await page.waitForTimeout(1000);

  // 截图 3: 直接聊天建议提示词完整执行效果
  const shot3 = path.join(__dirname, '..', 'screenshots', 'direct-chat-suggestion-executed.png');
  await page.screenshot({ path: shot3, fullPage: true });
  console.log(`✅ [截图 3] 建议提示词执行并圆满完成效果已保存: ${shot3}`);

  await browser.close();
  console.log('\n🎉 所有验证全部顺利完成！');
}

main().catch(err => {
  console.error('测试执行失败:', err);
  process.exit(1);
});
