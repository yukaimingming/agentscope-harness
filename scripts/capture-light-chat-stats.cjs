const { chromium } = require('C:/Users/kaiming yu/.npm-global/node_modules/playwright');
const path = require('path');

const TARGET_DIR = path.resolve("C:/Users/kaiming yu/.gemini/antigravity/brain/ac05d304-37dc-46fd-b803-0d72160fed76");

(async () => {
  const browser = await chromium.launch({ channel: 'msedge', headless: true });
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const page = await context.newPage();

  await page.goto("http://127.0.0.1:5174", { waitUntil: "networkidle" });
  await page.waitForTimeout(1000);

  // 切换为浅色
  await page.evaluate(() => {
    document.documentElement.classList.add("light");
    document.documentElement.classList.remove("dark");
    document.documentElement.setAttribute("data-theme", "light");
    localStorage.setItem("deepagent_theme_mode", "light");
  });

  // 点击一个已有消息的会话（例如昨天第 1 条）
  const sessionItem = page.locator('.sidebar-session-item').nth(1);
  if (await sessionItem.count() > 0) {
    await sessionItem.click();
    await page.waitForTimeout(1000);
  }

  const lightChatStatsPath = path.join(TARGET_DIR, "theme-light-chat-statsline.png");
  await page.screenshot({ path: lightChatStatsPath });
  console.log("已保存浅色模式下的聊天与 StatsLine 截图:", lightChatStatsPath);

  await browser.close();
})().catch((err) => {
  console.error("执行出错:", err);
  process.exit(1);
});
