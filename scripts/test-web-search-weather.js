const { chromium } = require('C:/Users/kaiming yu/.npm-global/node_modules/playwright');
const path = require('path');
const fs = require('fs');

async function testWebSearch() {
  const artifactDir = 'C:\\Users\\kaiming yu\\.gemini\\antigravity\\brain\\ac05d304-37dc-46fd-b803-0d72160fed76';

  console.log('启动自动化测试网络搜索“深圳天气怎么样”...');
  const browser = await chromium.launch({ channel: 'msedge', headless: true });
  const context = await browser.newContext({
    viewport: { width: 1440, height: 960 },
    deviceScaleFactor: 2,
  });
  const page = await context.newPage();

  await page.goto('http://127.0.0.1:5174', { waitUntil: 'networkidle' });
  await page.waitForTimeout(1500);

  // 定位输入框
  const textarea = page.locator('textarea.chat-prompt-textarea');
  await textarea.fill('深圳天气怎么样');
  await page.waitForTimeout(400);

  // 点击发送按钮
  const sendBtn = page.locator('button[type="submit"], button[aria-label*="发送"], button:has-text("发送")').last();
  console.log('点击发送...');
  await sendBtn.click();

  // 等待智能体生成与网络搜索工具执行
  console.log('等待智能体调用网络搜索工具并返回...');
  
  // 轮询检查是否有包含“搜索了网络”或“正在搜索网络”或 GlobeIcon 的活动项
  let searchToolFound = false;
  for (let i = 0; i < 45; i++) {
    await page.waitForTimeout(1000);
    const searchTexts = await page.locator('text=/.*搜索.*网络.*/').count();
    const sourceLinks = await page.locator('a[href*="weather"]').count();
    if (searchTexts > 0 || sourceLinks > 0) {
      searchToolFound = true;
      console.log(`第 ${i + 1} 秒检测到网络搜索活动或来源链接！`);
      break;
    }
  }

  // 额外等待流式回复完成
  await page.waitForTimeout(4000);

  // 1. 全景截图
  const fullShot = path.join(artifactDir, '13-web-search-weather-flow.png');
  await page.screenshot({ path: fullShot });
  console.log('已保存全景截图:', fullShot);

  // 2. 点击展开工具详情与来源引用
  const toolDetails = page.locator('details:has-text("搜索了网络"), details:has-text("正在搜索网络"), details:has-text("web_search")').first();
  if (await toolDetails.count() > 0) {
    const isOpen = await toolDetails.evaluate(el => el.open);
    if (!isOpen) {
      await toolDetails.locator('summary').click();
      await page.waitForTimeout(500);
    }
  }

  // 3. 特写截图
  const closeupShot = path.join(artifactDir, '14-web-search-sources-closeup.png');
  await page.screenshot({ path: closeupShot });
  console.log('已保存特写截图:', closeupShot);

  // 检查 DOM 中的地球图标与来源链接
  const checkResult = await page.evaluate(() => {
    const globeIcons = document.querySelectorAll('svg.lucide-globe');
    const sourceLinks = Array.from(document.querySelectorAll('a[target="_blank"]')).map(a => ({
      href: a.href,
      text: a.innerText.trim(),
    }));
    return {
      globeIconCount: globeIcons.length,
      sourceLinks,
    };
  });

  console.log('DOM 检查结果:', JSON.stringify(checkResult, null, 2));

  await browser.close();
}

testWebSearch().catch((err) => {
  console.error('测试异常:', err);
  process.exit(1);
});
