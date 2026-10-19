const { chromium } = require('C:/Users/kaiming yu/.npm-global/node_modules/playwright');
const path = require('path');
const fs = require('fs');

async function verifyAll() {
  const artifactDir = 'C:\\Users\\kaiming yu\\.gemini\\antigravity\\brain\\ac05d304-37dc-46fd-b803-0d72160fed76';

  console.log('启动自动化验证：左侧列表转圈状态 + 网络搜索地球图标与URL来源...');
  const browser = await chromium.launch({ channel: 'msedge', headless: true });
  const context = await browser.newContext({
    viewport: { width: 1440, height: 960 },
    deviceScaleFactor: 2,
  });
  const page = await context.newPage();

  await page.goto('http://127.0.0.1:5174', { waitUntil: 'networkidle' });
  await page.waitForTimeout(1500);

  // 1. 发送一条新的网络搜索查询，例如：'深圳天气'
  console.log('输入提示词：深圳今天天气怎么样并附带来源...');
  const textarea = page.locator('textarea.chat-prompt-textarea');
  await textarea.fill('请帮我网络搜索深圳今天天气怎么样，并给出官方来源');
  await page.waitForTimeout(400);

  const sendBtn = page.locator('button[type="submit"], button[aria-label*="发送"], button:has-text("发送")').last();
  await sendBtn.click();

  // 2. 立即截取左侧列表运行中的状态（转圈 Spinner，无“执行中”文本）
  console.log('截取运行中的左侧列表状态...');
  await page.waitForTimeout(1200);

  // 验证左边列表的 Spinner 是否出现，且确认没有“执行中”文字
  const sidebarCheck = await page.evaluate(() => {
    const spinners = document.querySelectorAll('.sidebar-session-item svg.animate-spin');
    const runningTexts = Array.from(document.querySelectorAll('.sidebar-session-item')).filter(el => el.innerText.includes('执行中'));
    return {
      spinnerCount: spinners.length,
      hasRunningText: runningTexts.length > 0,
    };
  });
  console.log('左侧侧边栏检测结果:', sidebarCheck);

  const sidebarShot = path.join(artifactDir, '15-sidebar-spinning-status.png');
  await page.screenshot({ path: sidebarShot });
  console.log('左侧转圈截图已保存:', sidebarShot);

  // 3. 等待模型完成网络搜索并流式回复
  console.log('等待网络搜索执行与回复完成...');
  for (let i = 0; i < 40; i++) {
    await page.waitForTimeout(1000);
    const isStopBtn = await page.locator('button[aria-label="停止响应"], button:has-text("停止")').count();
    if (isStopBtn === 0) {
      console.log(`第 ${i + 1} 秒回复已完成！`);
      break;
    }
  }

  await page.waitForTimeout(2000);

  // 4. 展开最新消息中的折叠过程卡片（“已完成分析”或包含“搜索了网络”）
  console.log('展开活动过程...');
  const summaries = page.locator('summary:has-text("分析"), summary:has-text("过程"), summary:has-text("搜索了网络")');
  const count = await summaries.count();
  for (let i = 0; i < count; i++) {
    try {
      await summaries.nth(i).click();
      await page.waitForTimeout(300);
    } catch (e) {}
  }

  await page.waitForTimeout(800);

  // 5. 检查地球图标与来源链接
  const domInfo = await page.evaluate(() => {
    const globes = document.querySelectorAll('svg.lucide-globe');
    const sourceLinks = Array.from(document.querySelectorAll('a[target="_blank"]')).map(a => ({
      href: a.href,
      text: a.innerText.trim(),
    }));
    return {
      globeCount: globes.length,
      sourceLinks,
    };
  });
  console.log('DOM 搜索与来源结果:', domInfo);

  // 6. 保存全景与局部特写截图
  const fullShot = path.join(artifactDir, '17-web-search-full-view.png');
  await page.screenshot({ path: fullShot });
  console.log('全景截图已保存:', fullShot);

  const searchBox = page.locator('div:has-text("搜索了网络"), .process-activity-enter:has(svg.lucide-globe)').last();
  if (await searchBox.count() > 0) {
    const closeupShot = path.join(artifactDir, '16-web-search-with-globe-and-sources.png');
    await searchBox.screenshot({ path: closeupShot });
    console.log('特写截图已保存:', closeupShot);
  }

  await browser.close();
  console.log('全部验证与截屏完成！');
}

verifyAll().catch((err) => {
  console.error('测试异常:', err);
  process.exit(1);
});
