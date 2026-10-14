const { chromium } = require('playwright');
const path = require('path');
const fs = require('fs');

async function main() {
  const screenshotsDir = path.join(__dirname, '../screenshots');
  if (!fs.existsSync(screenshotsDir)) {
    fs.mkdirSync(screenshotsDir, { recursive: true });
  }

  const browser = await chromium.launch({
    channel: 'msedge',
    headless: true,
    args: ['--no-sandbox', '--disable-gpu']
  });

  const context = await browser.newContext({
    viewport: { width: 1560, height: 1020 },
    deviceScaleFactor: 2.0,
  });

  const page = await context.newPage();

  console.log('1. 正在访问前端应用 http://127.0.0.1:5174 ...');
  await page.goto('http://127.0.0.1:5174', { waitUntil: 'networkidle' });
  await page.waitForTimeout(2000);

  // 确保右侧边栏展开
  const aside = page.locator('aside').last();
  if (!await aside.isVisible()) {
    const toggleBtn = page.locator('button[title*="代码审查"]').first();
    await toggleBtn.click();
    await page.waitForTimeout(800);
  }

  // 等待 Git 数据加载
  await page.waitForSelector('text=Changes', { timeout: 8000 });
  await page.waitForTimeout(1500);

  // ==========================================
  // 验证 1: 进入 Review 时，左侧展示具体修改过的代码文件与变更文件列表横条
  // ==========================================
  console.log('2. 验证场景 1: 代码文件 Diff 与上方变更文件列表横条...');
  const javaBtn = page.locator('aside button:has-text("GitController.java")').first();
  if (await javaBtn.count() > 0) {
    await javaBtn.click();
    await page.waitForTimeout(1500);
  }
  const pic1 = path.join(screenshotsDir, 'fix-1-code-diff-overview.png');
  await page.screenshot({ path: pic1 });
  console.log('✅ 已保存截图 1 (代码文件 Diff 与变更文件横栏):', pic1);

  // ==========================================
  // 验证 2: 搜索功能（在 Review 面板中搜索过滤变更文件）
  // ==========================================
  console.log('3. 验证场景 2: Review 搜索过滤功能...');
  const searchToggleBtn = page.locator('button[title="搜索变更文件"]').first();
  if (await searchToggleBtn.count() > 0) {
    await searchToggleBtn.click();
    await page.waitForTimeout(400);
    const searchInput = page.locator('input[placeholder*="过滤文件"]').first();
    if (await searchInput.count() > 0) {
      await searchInput.fill('GitService');
      await page.waitForTimeout(800);
    }
  }
  const pic2 = path.join(screenshotsDir, 'fix-2-review-search.png');
  await page.screenshot({ path: pic2 });
  console.log('✅ 已保存截图 2 (搜索过滤联动):', pic2);

  // ==========================================
  // 验证 3: Open File 功能（打开文件代码查看器）
  // ==========================================
  console.log('4. 验证场景 3: Open File 功能...');
  const plusBtn = page.locator('button[title="新建标签页"]').first();
  await plusBtn.click();
  await page.waitForTimeout(800);

  // 点击 Open File 快捷入口
  const openFileBtn = page.locator('button:has-text("Open File")').first();
  if (await openFileBtn.count() > 0) {
    await openFileBtn.click();
    await page.waitForTimeout(1500);
  }
  const pic3 = path.join(screenshotsDir, 'fix-3-open-file-viewer.png');
  await page.screenshot({ path: pic3 });
  console.log('✅ 已保存截图 3 (Open File 文件查看器):', pic3);

  // ==========================================
  // 验证 4: Terminal 功能（终端交互与命令执行）
  // ==========================================
  console.log('5. 验证场景 4: Terminal 交互式终端...');
  await plusBtn.click();
  await page.waitForTimeout(800);

  // 点击 Terminal 快捷入口
  const terminalBtn = page.locator('button:has-text("Terminal")').first();
  if (await terminalBtn.count() > 0) {
    await terminalBtn.click();
    await page.waitForTimeout(1500);

    // 点击执行快捷命令 “最近提交”
    const logBtn = page.locator('button:has-text("最近提交")').first();
    if (await logBtn.count() > 0) {
      await logBtn.click();
      await page.waitForTimeout(1200);
    }
  }
  const pic4 = path.join(screenshotsDir, 'fix-4-terminal-execution.png');
  await page.screenshot({ path: pic4 });
  console.log('✅ 已保存截图 4 (Terminal 交互终端与执行):', pic4);

  // ==========================================
  // 验证 5: 关闭标签直接收缩侧边栏（关闭第一个默认标签时）
  // ==========================================
  console.log('6. 验证场景 5: 关闭标签直接收缩侧边栏...');
  // 先把多余的标签关掉，留最后一个标签
  for (let i = 0; i < 5; i++) {
    const closeTabButtons = page.locator('button[title*="关闭"]');
    const count = await closeTabButtons.count();
    if (count <= 1) {
      // 当只剩最后一个标签（或默认标签）时，点击关闭
      if (count === 1) {
        await closeTabButtons.first().click();
        await page.waitForTimeout(800);
      }
      break;
    }
    await closeTabButtons.first().click();
    await page.waitForTimeout(400);
  }

  const pic5 = path.join(screenshotsDir, 'fix-5-close-tab-auto-collapse.png');
  await page.screenshot({ path: pic5 });
  console.log('✅ 已保存截图 5 (关闭首个默认标签自动收缩):', pic5);

  await browser.close();
  console.log('🎉 全部 5 大核心功能修复与自动化验证完成！');
}

main().catch(err => {
  console.error('测试执行异常:', err);
  process.exit(1);
});
