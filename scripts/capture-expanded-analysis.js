const { chromium } = require('C:/Users/kaiming yu/.npm-global/node_modules/playwright');
const path = require('path');

async function testOpen() {
  const browser = await chromium.launch({ channel: 'msedge', headless: true });
  const page = await browser.newPage({ viewport: { width: 1440, height: 960 }, deviceScaleFactor: 2 });
  await page.goto('http://127.0.0.1:5174', { waitUntil: 'networkidle' });
  await page.waitForTimeout(2000);

  const summaries = page.locator('summary:has-text("已完成分析")');
  const count = await summaries.count();
  console.log('summary数量:', count);
  for (let i = 0; i < count; i++) {
    await summaries.nth(i).click();
    await page.waitForTimeout(300);
  }

  // 展开所有内部的工具或思考
  const subDetails = page.locator('summary:has-text("搜索"), summary:has-text("web_search"), summary:has-text("思考")');
  const subCount = await subDetails.count();
  console.log('内部详情数量:', subCount);
  for (let i = 0; i < subCount; i++) {
    try {
      await subDetails.nth(i).click();
      await page.waitForTimeout(300);
    } catch (e) {}
  }

  const artifactDir = 'C:\\Users\\kaiming yu\\.gemini\\antigravity\\brain\\ac05d304-37dc-46fd-b803-0d72160fed76';
  const fullShot = path.join(artifactDir, '13-web-search-weather-flow.png');
  await page.screenshot({ path: fullShot });
  console.log('展开后全景截图已保存');

  // 检查 DOM 详情
  const info = await page.evaluate(() => {
    const globes = document.querySelectorAll('svg.lucide-globe');
    const aTags = Array.from(document.querySelectorAll('a')).filter(a => a.href && (a.href.includes('weather') || a.href.includes('bing') || a.href.includes('duck')));
    return {
      globeCount: globes.length,
      links: aTags.map(a => ({ href: a.href, text: a.innerText.trim(), target: a.target })),
    };
  });
  console.log('DOM 分析:', JSON.stringify(info, null, 2));

  // 特写截图
  const searchSection = page.locator('.process-activity-enter, details:has-text("搜索")').first();
  if (await searchSection.count() > 0) {
    const closeup = path.join(artifactDir, '14-web-search-sources-closeup.png');
    await searchSection.screenshot({ path: closeup });
    console.log('特写截图已保存');
  }

  await browser.close();
}

testOpen().catch((err) => {
  console.error(err);
  process.exit(1);
});
