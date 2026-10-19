const { chromium } = require('C:/Users/kaiming yu/.npm-global/node_modules/playwright');
const path = require('path');

async function captureWebSearch() {
  const artifactDir = 'C:\\Users\\kaiming yu\\.gemini\\antigravity\\brain\\ac05d304-37dc-46fd-b803-0d72160fed76';

  console.log('启动自动化截屏网络搜索工具调用与来源展示...');
  const browser = await chromium.launch({ channel: 'msedge', headless: true });
  const context = await browser.newContext({
    viewport: { width: 1440, height: 960 },
    deviceScaleFactor: 2,
  });
  const page = await context.newPage();

  await page.goto('http://127.0.0.1:5174', { waitUntil: 'networkidle' });
  await page.waitForTimeout(2000);

  // 等待可能正在运行的模型流式回复完成
  for (let i = 0; i < 30; i++) {
    const isStreaming = await page.locator('text=/.*模型深度思考中|正在生成.*/').count();
    const isStopBtn = await page.locator('button:has-text("停止"), button[aria-label="停止响应"]').count();
    if (isStreaming === 0 && isStopBtn === 0) {
      console.log(`第 ${i + 1} 秒已确认回复完成！`);
      break;
    }
    await page.waitForTimeout(1000);
  }

  await page.waitForTimeout(1500);

  // 展开所有活动过程折叠卡片（如“已完成分析”、“查看详细过程”等）
  const processDetails = page.locator('summary:has-text("分析"), summary:has-text("过程"), summary:has-text("用时")');
  const count = await processDetails.count();
  console.log('找到过程折叠面板数量:', count);
  for (let i = 0; i < count; i++) {
    try {
      await processDetails.nth(i).click();
      await page.waitForTimeout(300);
    } catch (e) {}
  }

  // 展开工具调用卡片（“搜索了网络”）
  const toolDetails = page.locator('summary:has-text("搜索了网络")');
  const toolCount = await toolDetails.count();
  console.log('找到“搜索了网络”工具数量:', toolCount);
  for (let i = 0; i < toolCount; i++) {
    try {
      await toolDetails.nth(i).click();
      await page.waitForTimeout(300);
    } catch (e) {}
  }

  await page.waitForTimeout(1000);

  // 1. 全景截图
  const fullShot = path.join(artifactDir, '13-web-search-weather-flow.png');
  await page.screenshot({ path: fullShot });
  console.log('全景截图已更新:', fullShot);

  // 2. 特写截图：聚焦到包含“搜索了网络”与来源引用的区域
  const searchRow = page.locator('div:has-text("搜索了网络")').first();
  if (await searchRow.count() > 0) {
    const closeupShot = path.join(artifactDir, '14-web-search-sources-closeup.png');
    await searchRow.screenshot({ path: closeupShot });
    console.log('工具行特写截图已保存:', closeupShot);
  }

  // DOM 属性检查
  const domInfo = await page.evaluate(() => {
    const globes = Array.from(document.querySelectorAll('svg.lucide-globe')).map(svg => ({
      tagName: svg.tagName,
      parentClass: svg.parentElement ? svg.parentElement.className : '',
      parentText: svg.parentElement ? svg.parentElement.innerText.trim() : '',
    }));
    const sources = Array.from(document.querySelectorAll('a[href*="weather"], a[target="_blank"]')).map(a => ({
      title: a.title,
      text: a.innerText.trim(),
      href: a.href,
    }));
    return { globes, sources };
  });

  console.log('DOM 检查详情:', JSON.stringify(domInfo, null, 2));

  await browser.close();
}

captureWebSearch().catch((err) => {
  console.error(err);
  process.exit(1);
});
