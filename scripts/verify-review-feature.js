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

  // 1. 验证 Review 侧边栏是否存在（默认展开）
  const reviewSidebar = page.locator('aside').last();
  console.log('Review 侧边栏是否可见:', await reviewSidebar.isVisible());

  // 等待 Git 状态加载完毕并出现文件列表
  await page.waitForSelector('text=Changes', { timeout: 8000 });
  await page.waitForTimeout(1500);

  // 截图 1: Review 基础界面与代码 Diff 对比
  // 点击一个 Java 文件查看代码 Diff
  const javaFileItem = page.locator('button:has-text("GitController.java")').first();
  if (await javaFileItem.count() > 0) {
    await javaFileItem.click();
    await page.waitForTimeout(1200);
  }

  const codeDiffPic = path.join(screenshotsDir, 'review-code-diff.png');
  await page.screenshot({ path: codeDiffPic });
  console.log('✅ 已保存代码 Diff 界面截图:', codeDiffPic);

  // 截图 2: 图片文件的 Before / After 对比（对应图 2 效果）
  const imageFileItem = page.locator('button:has-text(".png")').first();
  if (await imageFileItem.count() > 0) {
    await imageFileItem.click();
    await page.waitForTimeout(1500);
  }

  const imageDiffPic = path.join(screenshotsDir, 'review-image-diff.png');
  await page.screenshot({ path: imageDiffPic });
  console.log('✅ 已保存图片 Before/After 对比截图:', imageDiffPic);

  // 截图 3: 点击 '+' 按钮，展现图 1 对应的欢迎/检索界面 (Search tabs, files...)
  const plusBtn = page.locator('button[title="新建标签页"]');
  if (await plusBtn.count() > 0) {
    await plusBtn.click();
    await page.waitForTimeout(800);
  }

  const emptyTabPic = path.join(screenshotsDir, 'review-empty-tab-search.png');
  await page.screenshot({ path: emptyTabPic });
  console.log('✅ 已保存空标签欢迎/检索界面截图:', emptyTabPic);

  // 在空标签页中点击 Review 卡片，切回 Review
  const reviewEntryBtn = page.locator('button:has-text("Review")').last();
  if (await reviewEntryBtn.count() > 0) {
    await reviewEntryBtn.click();
    await page.waitForTimeout(800);
  }

  // 截图 4: 点击 Commit 按钮弹出提交输入框
  const commitBtn = page.locator('button:has-text("Commit")').first();
  if (await commitBtn.count() > 0) {
    await commitBtn.click();
    await page.waitForTimeout(600);
  }

  const commitModalPic = path.join(screenshotsDir, 'review-commit-modal.png');
  await page.screenshot({ path: commitModalPic });
  console.log('✅ 已保存 Commit 弹窗界面截图:', commitModalPic);

  await browser.close();
  console.log('🎉 所有自动化验证与截图完成！');
}

main().catch(err => {
  console.error('测试异常:', err);
  process.exit(1);
});
