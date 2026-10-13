const { chromium } = require('playwright');
const path = require('path');

async function testDiffOnly() {
  const browser = await chromium.launch({ channel: 'msedge', headless: true });
  const context = await browser.newContext({
    viewport: { width: 1440, height: 1100 },
    deviceScaleFactor: 2.0,
  });
  const page = await context.newPage();
  page.setDefaultTimeout(120000);

  console.log('访问前端页面...');
  await page.goto('http://127.0.0.1:5174', { waitUntil: 'networkidle' });
  await page.waitForTimeout(1500);

  // 点击新聊天按钮创建全新会话
  const newChatBtn = page.locator('.new-chat-sidebar-button, button:has-text("新聊天")');
  if (await newChatBtn.count() > 0) {
    console.log('点击 [新聊天] 创建全新会话...');
    await newChatBtn.first().click();
    await page.waitForTimeout(1000);
  }

  // 定位文件变更建议卡片
  console.log('定位 [文件变更] 建议卡片...');
  const card = page.locator('button:has-text("文件读写与行级 Diff")');
  await card.waitFor({ state: 'visible', timeout: 10000 });
  console.log('点击 [文件变更] 建议卡片...');
  await card.click();

  console.log('等待智能体运行并返回结果...');
  const startTime = Date.now();
  while (Date.now() - startTime < 100000) {
    await page.waitForTimeout(2000);
    const state = await page.evaluate(() => {
      const hasSquare = Boolean(document.querySelector('svg.lucide-square'));
      const hasSpinner = Boolean(document.querySelector('.animate-spin'));
      const buttons = Array.from(document.querySelectorAll('button'));
      const hasAnalysisOrFile = buttons.some(b => b.textContent && (b.textContent.includes('已完成分析') || b.textContent.includes('个文件变更')));
      const hasAssistant = Boolean(document.querySelector('.prose')) || hasAnalysisOrFile;
      return {
        isStreaming: hasSquare || hasSpinner,
        hasAssistant,
      };
    });

    if (state.hasAssistant && !state.isStreaming) {
      await page.waitForTimeout(2500);
      const doubleCheck = await page.evaluate(() => Boolean(document.querySelector('svg.lucide-square') || document.querySelector('.animate-spin')));
      if (!doubleCheck) {
        console.log(`生成完成，耗时 ${(Date.now() - startTime) / 1000}s`);
        break;
      }
    }
  }

  console.log('稳定界面...');
  await page.waitForTimeout(2000);

  // 1. 展开分析过程面板
  const processBtn = page.locator('button:has-text("已完成分析")');
  if (await processBtn.count() > 0) {
    console.log('展开分析过程面板...');
    await processBtn.first().click();
    await page.waitForTimeout(600);
  }

  // 2. 展开 details
  await page.evaluate(() => {
    document.querySelectorAll('details').forEach((el) => {
      el.open = true;
    });
  });

  // 3. 展开文件变更卡片
  console.log('展开文件变更总卡片...');
  const queueTrigger = page.locator('button:has-text("个文件变更")');
  if (await queueTrigger.count() > 0) {
    await queueTrigger.first().click();
    await page.waitForTimeout(600);
  }

  // 4. 展开每个文件的行级 Diff 详情
  console.log('展开具体文件的 Diff 补丁视图...');
  const fileRows = page.locator('button[aria-expanded="false"]:has-text("demo-notes"), button:has-text("demo-notes.txt")');
  const count = await fileRows.count();
  for (let i = 0; i < count; i++) {
    await fileRows.nth(i).click();
    await page.waitForTimeout(400);
  }

  // 打印抓取到的 Diff pre 文本
  const diffTexts = await page.evaluate(() => {
    const pres = Array.from(document.querySelectorAll('pre'));
    return pres.map(p => p.innerText);
  });
  console.log('提取到的 Diff 渲染内容：\n', diffTexts.join('\n---\n'));

  // 滚动到 Diff 卡片位置以便截图完全展现
  await page.evaluate(() => {
    const btn = Array.from(document.querySelectorAll('button')).find(b => b.textContent && b.textContent.includes('个文件变更'));
    const pre = document.querySelector('pre');
    const target = pre || btn;
    if (target) target.scrollIntoView({ behavior: 'smooth', block: 'center' });
  });
  await page.waitForTimeout(1000);

  const outPath = path.join(__dirname, '..', 'screenshots', 'card-02-file-diff.png');
  await page.screenshot({ path: outPath, fullPage: true });
  console.log('文件变更完整截图已重新保存：', outPath);

  await browser.close();
}

testDiffOnly().catch(console.error);
