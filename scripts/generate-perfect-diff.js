const { chromium } = require('playwright');
const path = require('path');

async function runPerfectDiff() {
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

  // 输入明确要求调用 write_file 和 edit_file 的提示词
  const prompt = "请使用 write_file 工具在工作区创建 demo-notes.txt 写入 5 行系统介绍，紧接着使用 edit_file 工具修改其中第 2 行和第 4 行，以完整展示行级 Diff 差异卡片。";
  console.log('在输入框填入提示词并发送...');
  const textarea = page.locator('textarea');
  await textarea.fill(prompt);
  await page.waitForTimeout(500);

  const submitBtn = page.locator('button[type="submit"]');
  await submitBtn.click();
  console.log('已提交任务，等待智能体执行工具并返回结果...');

  const startTime = Date.now();
  while (Date.now() - startTime < 90000) {
    await page.waitForTimeout(2500);
    const state = await page.evaluate(() => {
      const isStreaming = Boolean(document.querySelector('svg.lucide-square') || document.querySelector('.animate-spin'));
      const buttons = Array.from(document.querySelectorAll('button'));
      const hasAnalysisOrFile = buttons.some(b => b.textContent && (b.textContent.includes('已完成分析') || b.textContent.includes('个文件变更')));
      const hasAssistant = Boolean(document.querySelector('.prose')) || hasAnalysisOrFile;
      return { isStreaming, hasAssistant };
    });

    if (state.hasAssistant && !state.isStreaming) {
      await page.waitForTimeout(3000);
      const isStillBusy = await page.evaluate(() => Boolean(document.querySelector('svg.lucide-square') || document.querySelector('.animate-spin')));
      if (!isStillBusy) {
        console.log(`执行完成，总耗时 ${(Date.now() - startTime) / 1000}s`);
        break;
      }
    }
  }

  console.log('稳定界面...');
  await page.waitForTimeout(2000);

  // 1. 展开已完成分析
  const processBtn = page.locator('button:has-text("已完成分析")');
  if (await processBtn.count() > 0) {
    console.log('展开分析过程');
    await processBtn.first().click();
    await page.waitForTimeout(600);
  }

  // 2. 展开 details
  await page.evaluate(() => {
    document.querySelectorAll('details').forEach(el => el.open = true);
  });

  // 3. 展开文件变更卡片
  const queueBtn = page.locator('button:has-text("个文件变更")');
  if (await queueBtn.count() > 0) {
    console.log('展开文件变更总卡片');
    await queueBtn.first().click();
    await page.waitForTimeout(600);
  }

  // 4. 展开 demo-notes 行
  const row = page.locator('button:has-text("demo-notes")');
  if (await row.count() > 0) {
    console.log('展开具体文件 Diff');
    await row.first().click();
    await page.waitForTimeout(600);
  }

  // 打印抓取到的 Diff pre 文本
  const diffTexts = await page.evaluate(() => {
    const pres = Array.from(document.querySelectorAll('pre'));
    return pres.map(p => p.innerText);
  });
  console.log('提取到的 Diff 渲染内容：\n', diffTexts.join('\n---\n'));

  // 滚动到 Diff 卡片
  await page.evaluate(() => {
    const btn = Array.from(document.querySelectorAll('button')).find(b => b.textContent && b.textContent.includes('个文件变更'));
    const pre = document.querySelector('pre');
    const el = pre || btn;
    if (el) el.scrollIntoView({ behavior: 'instant', block: 'center' });
  });

  await page.waitForTimeout(1000);
  const outPath = path.join(__dirname, '..', 'screenshots', 'card-02-file-diff.png');
  await page.screenshot({ path: outPath, fullPage: true });
  console.log('完美 Diff 截图已保存至：', outPath);

  await browser.close();
}

runPerfectDiff().catch(console.error);
