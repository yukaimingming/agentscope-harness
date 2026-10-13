const { chromium } = require('playwright');
const path = require('path');

async function test() {
  const browser = await chromium.launch({ channel: 'msedge', headless: true });
  const context = await browser.newContext({ viewport: { width: 1440, height: 1100 }, deviceScaleFactor: 1.5 });
  const page = await context.newPage();
  await page.goto('http://127.0.0.1:5174', { waitUntil: 'networkidle' });
  await page.waitForTimeout(2000);

  // 点击展开 '已完成分析'
  const summaryBtn = page.locator('button:has-text("已完成分析")');
  if (await summaryBtn.count() > 0) {
    await summaryBtn.first().click();
    console.log('已点击展开分析过程汇总');
  }

  await page.waitForTimeout(1000);

  // 展开所有工具卡片
  const toolToggles = page.locator('div[role="button"]:has-text("写入了文件"), div[role="button"]:has-text("分析了文件"), div[role="button"]:has-text("write_file"), div[role="button"]:has-text("read_file"), button:has-text("详细")');
  const tCount = await toolToggles.count();
  console.log(`找到 ${tCount} 个工具卡片，正在依次展开...`);
  for (let i = 0; i < tCount; i++) {
    try {
      await toolToggles.nth(i).click({ timeout: 1500 });
    } catch (e) {}
  }

  // 展开文件变更卡片
  const fileDiffBtn = page.locator('button:has-text("文件变更")');
  if (await fileDiffBtn.count() > 0) {
    await fileDiffBtn.first().click();
    console.log('已点击展开文件变更');
  }

  await page.waitForTimeout(1500);

  const detailPath = path.join(__dirname, '..', 'screenshots', '03-expanded-process-and-tools.png');
  await page.screenshot({ path: detailPath, fullPage: true });
  console.log('保存展开详情截图：', detailPath);
  await browser.close();
}

test().catch(console.error);
