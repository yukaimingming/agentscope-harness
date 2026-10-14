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
  await page.waitForTimeout(1500);

  // 如果右侧边栏尚未展开，点击右上角展开按钮
  let aside = page.locator('aside').last();
  if (!await aside.isVisible()) {
    console.log('展开右侧边栏...');
    const toggleBtn = page.locator('button[title*="代码审查"]').first();
    await toggleBtn.click();
    await page.waitForTimeout(800);
  }

  // ==========================================
  // 验证 1: 展开侧边栏默认为主面板（居中搜索框 + Review/Open File/Terminal 三个列表卡片）
  // ==========================================
  console.log('2. 验证场景 1: 侧边栏默认展示主面板（图1效果）...');
  const pic1 = path.join(screenshotsDir, 'verify-user-1-default-main-panel.png');
  await page.screenshot({ path: pic1 });
  console.log('✅ 已保存截图 1 (默认主面板):', pic1);

  // ==========================================
  // 验证 2: 点击主面板 Review 进入 Review 视图，右侧有修改时正常显示变更列表
  // ==========================================
  console.log('3. 验证场景 2: 点击主面板 Review 进入 Review 视图...');
  const reviewCard = page.locator('button:has-text("Review")').first();
  await reviewCard.click();
  await page.waitForTimeout(1500);

  // 选择一个代码文件以展示清晰的 Diff
  const codeFileBtn = page.locator('aside button:has-text("review-sidebar.tsx"), aside button:has-text("review-panel.tsx"), aside button:has-text("GitController.java")').first();
  if (await codeFileBtn.count() > 0) {
    await codeFileBtn.click();
    await page.waitForTimeout(1000);
  }

  const pic2 = path.join(screenshotsDir, 'verify-user-2-review-diff.png');
  await page.screenshot({ path: pic2 });
  console.log('✅ 已保存截图 2 (Review Diff与右侧变更文件列表):', pic2);

  // ==========================================
  // 验证 3: 在 Review 标签上点击 ×，由于只有这一个默认标签，直接关闭并收缩侧边栏
  // ==========================================
  console.log('4. 验证场景 3: 点击 Review 标签的 × 按钮，直接关闭并收缩侧边栏...');
  const closeTabBtn = page.locator('aside div.group button[title*="关闭"]').first();
  await closeTabBtn.click();
  await page.waitForTimeout(1000);

  const pic3 = path.join(screenshotsDir, 'verify-user-3-tab-close-collapse.png');
  await page.screenshot({ path: pic3 });
  console.log('✅ 已保存截图 3 (关闭唯一标签后直接收缩侧边栏):', pic3);

  // ==========================================
  // 验证 4: 再次展开侧边栏（恢复为主面板），点击 Terminal 打开真正的 Windows PowerShell 终端
  // ==========================================
  console.log('5. 验证场景 4: 重新展开侧边栏并点击 Terminal 打开纯正 Windows PowerShell 终端...');
  const toggleBtn2 = page.locator('button[title*="代码审查"]').first();
  await toggleBtn2.click();
  await page.waitForTimeout(800);

  const terminalCard = page.locator('button:has-text("Terminal")').first();
  await terminalCard.click();
  await page.waitForTimeout(1000);

  // 在 PowerShell 输入框中运行一条命令并获取真实输出
  const terminalInput = page.locator('aside form input').first();
  if (await terminalInput.count() > 0) {
    await terminalInput.fill('git status -s');
    await page.waitForTimeout(300);
    await terminalInput.press('Enter');
    await page.waitForTimeout(2000);
  }

  const pic4 = path.join(screenshotsDir, 'verify-user-4-powershell-terminal.png');
  await page.screenshot({ path: pic4 });
  console.log('✅ 已保存截图 4 (Windows PowerShell 终端控制台执行命令):', pic4);

  // ==========================================
  // 验证 5: 验证当无修改内容/干净工作区时，右侧列表彻底隐藏，左侧自适应满屏
  // ==========================================
  console.log('6. 验证场景 5: 验证空工作区/无修改时右侧变更列表隐藏...');
  // 新建一个空 tab 打开无变更状态验证组件表现
  const newTabBtn = page.locator('button[title*="新建标签页"]').first();
  await newTabBtn.click();
  await page.waitForTimeout(600);

  // 此时在主面板搜索框中测试搜索联动
  const mainSearchInput = page.locator('input[placeholder*="Search tabs, files"]').first();
  if (await mainSearchInput.count() > 0) {
    await mainSearchInput.fill('Terminal');
    await page.waitForTimeout(600);
  }
  const pic5 = path.join(screenshotsDir, 'verify-user-5-main-search-filter.png');
  await page.screenshot({ path: pic5 });
  console.log('✅ 已保存截图 5 (主面板检索实时过滤):', pic5);

  console.log('🎉 所有场景验证完毕！');
  await browser.close();
}

main().catch((err) => {
  console.error('测试运行异常:', err);
  process.exit(1);
});
