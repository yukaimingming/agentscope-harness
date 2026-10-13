const { chromium } = require('playwright');
const path = require('path');

async function test() {
  const browser = await chromium.launch({ channel: 'msedge', headless: true });
  const context = await browser.newContext({
    viewport: { width: 1440, height: 1200 },
    deviceScaleFactor: 2.0,
  });
  const page = await context.newPage();
  console.log('访问前端页面...');
  await page.goto('http://127.0.0.1:5174', { waitUntil: 'networkidle' });
  await page.waitForTimeout(2000);

  // 1. 展开总分析过程折叠栏
  const processBtn = page.locator('button:has-text("已完成分析")');
  if (await processBtn.count() > 0) {
    console.log('点击展开 [已完成分析] 面板');
    await processBtn.first().click();
    await page.waitForTimeout(1000);
  }

  // 2. 展开内部所有 details 折叠标签（思考、各个工具调用的输入参数与执行结果）
  await page.evaluate(() => {
    document.querySelectorAll('details').forEach((el) => {
      el.open = true;
    });
  });
  console.log('已将所有内部思考与工具执行详情设置为 open');

  // 3. 展开文件变更卡片
  const fileDiffBtn = page.locator('button:has-text("文件变更")');
  if (await fileDiffBtn.count() > 0) {
    console.log('点击展开 [文件变更] 卡片');
    await fileDiffBtn.first().click();
  }

  await page.waitForTimeout(1500);

  const outPath = path.join(__dirname, '..', 'screenshots', '05-complete-detail-view.png');
  await page.screenshot({ path: outPath, fullPage: true });
  console.log('已成功保存全展开详细截图：', outPath);

  await browser.close();
}

test().catch(console.error);
