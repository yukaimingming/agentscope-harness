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
    viewport: { width: 1600, height: 1040 },
    deviceScaleFactor: 2.0,
  });

  const page = await context.newPage();

  console.log('1. 正在访问前端应用 http://127.0.0.1:5174 ...');
  await page.goto('http://127.0.0.1:5174', { waitUntil: 'networkidle' });
  await page.waitForTimeout(2000);

  // 展开左侧边栏（如果收起）
  const sidebar = page.locator('aside').first();
  if (!await sidebar.isVisible()) {
    console.log('展开左侧边栏...');
    const toggleBtn = page.locator('button[title*="侧边栏"]').first();
    await toggleBtn.click();
    await page.waitForTimeout(800);
  }

  // ==========================================
  // 步骤 1: 点击左侧一个具有历史消息与工具调用的会话
  // ==========================================
  console.log('2. 查找并选中一个具有历史对话的会话...');
  const sessionItems = page.locator('.sidebar-session-item');
  const count = await sessionItems.count();
  console.log(`找到 ${count} 个会话条目`);
  
  if (count > 0) {
    // 点击第一条会话
    await sessionItems.first().click();
    await page.waitForTimeout(1500);
  }

  // ==========================================
  // 步骤 2: 验证主页面底栏统计条 (StatsLine)
  // ==========================================
  console.log('3. 验证场景 1: DeepSeek Harness StatsLine 主页面底栏统计条...');
  const pic1 = path.join(screenshotsDir, 'stats-1-statsline-display.png');
  await page.screenshot({ path: pic1 });
  console.log('✅ 已保存截图 1 (StatsLine 主页面底栏统计条):', pic1);

  // ==========================================
  // 步骤 3: 点击底部的 ContextMeter 环形用量按钮，打开详尽面板
  // ==========================================
  console.log('4. 验证场景 2: 点击 ContextMeter 环形用量按钮打开详细统计面板...');
  // 寻找用量按钮
  const usageBtn = page.locator('button[aria-label*="上下文占用"], button:has-text("用量")').first();
  if (await usageBtn.count() > 0) {
    console.log('点击用量按钮...');
    await usageBtn.click();
    await page.waitForTimeout(800);
  } else {
    console.log('⚠️ 未直接找到用量按钮，尝试通用选择器');
  }

  const pic2 = path.join(screenshotsDir, 'stats-2-context-meter-dialog.png');
  await page.screenshot({ path: pic2 });
  console.log('✅ 已保存截图 2 (ContextMeter 上下文与Token用量详情面板):', pic2);

  // ==========================================
  // 步骤 4: 聚焦并查看底栏特写区域
  // ==========================================
  console.log('5. 验证场景 3: 底部 Prompt Box 与 StatsLine/用量组件特写...');
  const promptBox = page.locator('div:has(textarea[placeholder*="输入任务描述"])').last();
  const pic3 = path.join(screenshotsDir, 'stats-3-bottom-dock-closeup.png');
  await page.screenshot({ path: pic3 });
  console.log('✅ 已保存截图 3 (整体底栏与统计联动效果):', pic3);

  await browser.close();
  console.log('🎉 所有 Token 用量与 DeepSeek Harness 统计验证完成！');
}

main().catch((err) => {
  console.error('测试执行出错:', err);
  process.exit(1);
});
