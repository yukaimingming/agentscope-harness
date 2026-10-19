const { chromium } = require('C:/Users/kaiming yu/.npm-global/node_modules/playwright');
const path = require('path');
const fs = require('fs');

const TARGET_DIR = path.resolve("C:/Users/kaiming yu/.gemini/antigravity/brain/ac05d304-37dc-46fd-b803-0d72160fed76");

(async () => {
  const browser = await chromium.launch({ channel: 'msedge', headless: true });
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const page = await context.newPage();

  console.log("1. 访问应用首页...");
  await page.goto("http://127.0.0.1:5174", { waitUntil: "networkidle" });
  await page.waitForTimeout(1000);

  // 1. 确保先切到深色模式拍摄基准图
  await page.evaluate(() => {
    document.documentElement.classList.remove("light");
    document.documentElement.classList.add("dark");
    document.documentElement.setAttribute("data-theme", "dark");
    localStorage.setItem("deepagent_theme_mode", "dark");
  });
  await page.waitForTimeout(500);

  const darkMainPath = path.join(TARGET_DIR, "theme-dark-main.png");
  await page.screenshot({ path: darkMainPath });
  console.log("已保存深色模式全景截图:", darkMainPath);

  // 2. 点击 Header 顶部的主题切换按钮切换到浅色模式
  console.log("2. 点击 Header 顶部的一键黑白主题切换按钮...");
  const headerBtn = page.locator('[data-testid="header-toggle-theme-btn"]');
  await headerBtn.waitFor({ state: "visible", timeout: 5000 });
  await headerBtn.click();
  await page.waitForTimeout(600);

  // 检查是否已变为 light
  const isLight = await page.evaluate(() => document.documentElement.classList.contains("light"));
  console.log("切换后是否具有 light 类名:", isLight);

  const lightMainPath = path.join(TARGET_DIR, "theme-light-main.png");
  await page.screenshot({ path: lightMainPath });
  console.log("已保存浅色模式全景截图:", lightMainPath);

  // 3. 点击 ContextMeter 查看浅色弹层效果
  console.log("3. 触发 ContextMeter 用量弹层...");
  const meterBtn = page.locator(".context-meter-btn");
  if (await meterBtn.count() > 0) {
    await meterBtn.click();
    await page.waitForTimeout(400);
    const meterLightPath = path.join(TARGET_DIR, "theme-light-context-meter.png");
    await page.screenshot({ path: meterLightPath });
    console.log("已保存浅色模式下的 ContextMeter 用量弹层截图:", meterLightPath);
    // 再次点击关闭
    await meterBtn.click();
    await page.waitForTimeout(300);
  } else {
    console.warn("未找到 .context-meter-btn");
  }

  // 4. 展开 Review 侧边栏，查看浅色适配效果
  console.log("4. 展开 Review 侧边栏...");
  const reviewBtn = page.locator('button[aria-label="代码审查"]');
  await reviewBtn.click();
  await page.waitForTimeout(600);

  const lightReviewEmptyPath = path.join(TARGET_DIR, "theme-light-review-empty.png");
  await page.screenshot({ path: lightReviewEmptyPath });
  console.log("已保存浅色模式下的 Review Empty 界面截图:", lightReviewEmptyPath);

  // 点击 Review 按钮进入 Git 审查
  console.log("5. 点击 Review 快捷选项进入 Git 审查...");
  const reviewAction = page.locator('button:has-text("Review")').first();
  if (await reviewAction.count() > 0) {
    await reviewAction.click();
    await page.waitForTimeout(800);
    const lightReviewPanelPath = path.join(TARGET_DIR, "theme-light-review-panel.png");
    await page.screenshot({ path: lightReviewPanelPath });
    console.log("已保存浅色模式下的 Review Panel 截图:", lightReviewPanelPath);
  }

  // 5. 点击侧边栏底部的主题切换按钮切回深色模式
  console.log("6. 点击侧边栏底部主题切换按钮切回深色...");
  const sidebarThemeBtn = page.locator('[data-testid="sidebar-toggle-theme-btn"]');
  if (await sidebarThemeBtn.count() > 0) {
    await sidebarThemeBtn.click();
    await page.waitForTimeout(600);
    const darkSwitchedBackPath = path.join(TARGET_DIR, "theme-dark-switched-back.png");
    await page.screenshot({ path: darkSwitchedBackPath });
    console.log("已保存切回深色模式截图:", darkSwitchedBackPath);
  }

  console.log("全部主题切换验证与截图测试完成！");
  await browser.close();
})().catch((err) => {
  console.error("执行出错:", err);
  process.exit(1);
});
