const { chromium } = require('playwright');
const path = require('path');

async function testDiff() {
  const browser = await chromium.launch({ channel: 'msedge', headless: true });
  const context = await browser.newContext({
    viewport: { width: 1440, height: 1100 },
    deviceScaleFactor: 2.0,
  });
  const page = await context.newPage();
  console.log('打开前端页面...');
  await page.goto('http://127.0.0.1:5174', { waitUntil: 'networkidle' });
  await page.waitForTimeout(2000);

  console.log('点击 [文件变更] 建议卡片...');
  const card = page.locator('button:has-text("文件读写与行级 Diff")');
  await card.click();

  console.log('等待智能体运行并返回结果...');
  // 等待发送按钮再次变为可点击（表示运行完成），或者等待超时
  await page.waitForFunction(() => {
    // 检查停止按钮是否消失，或者输入框是否可以输入
    const stopBtn = document.querySelector('button[aria-label="停止生成"]');
    const sendBtn = document.querySelector('button[type="submit"]');
    return !stopBtn && (sendBtn && !sendBtn.disabled);
  }, { timeout: 90000 });

  console.log('智能体运行完毕，等待 2 秒稳定界面...');
  await page.waitForTimeout(2000);

  // 1. 展开过程
  const processBtn = page.locator('button:has-text("已完成分析")');
  if (await processBtn.count() > 0) {
    await processBtn.first().click();
    await page.waitForTimeout(500);
  }

  // 2. 展开 details
  await page.evaluate(() => {
    document.querySelectorAll('details').forEach((el) => {
      el.open = true;
    });
  });

  // 3. 展开文件变更卡片
  console.log('展开文件变更卡片...');
  const queueTrigger = page.locator('button:has-text("个文件变更")');
  if (await queueTrigger.count() > 0) {
    await queueTrigger.first().click();
    await page.waitForTimeout(500);
  }

  // 4. 展开文件列表中的具体文件行以显示 patch
  console.log('展开具体文件行的 Diff 补丁...');
  const fileRows = page.locator('button[title*="demo-notes.txt"]');
  if (await fileRows.count() > 0) {
    await fileRows.first().click();
    await page.waitForTimeout(800);
  } else {
    // 尝试点击所有带有 demo-notes 的按钮
    const anyRow = page.locator('button:has-text("demo-notes.txt")');
    if (await anyRow.count() > 0) {
      await anyRow.first().click();
      await page.waitForTimeout(800);
    }
  }

  // 检查 patch 内容是否存在
  const patchContent = await page.evaluate(() => {
    const pre = document.querySelector('pre');
    return pre ? pre.innerText : '未找到 pre 标签';
  });
  console.log('Diff Pre 内容预览:\n', patchContent);

  const outPath = path.join(__dirname, '..', 'screenshots', '02-file-diff.png');
  await page.screenshot({ path: outPath, fullPage: true });
  console.log('Diff 验证截图已保存至:', outPath);

  await browser.close();
}

testDiff().catch(console.error);
