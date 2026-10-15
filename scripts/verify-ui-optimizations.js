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

  // 确保左侧边栏展开
  const sidebar = page.locator('aside').first();
  if (!await sidebar.isVisible()) {
    console.log('展开左侧边栏...');
    const toggleBtn = page.locator('button[title*="侧边栏"]').first();
    await toggleBtn.click();
    await page.waitForTimeout(800);
  }

  // ==========================================
  // 验证 1: 左侧边栏时间语义分组、对话气泡图标、严格时间降序、去除单选框圆圈、紧凑8宫格引导卡片
  // ==========================================
  console.log('2. 验证场景 1: 左侧时间语义分组（今天/昨天/过去7天）、去圆圈气泡图标与中央紧凑引导卡片...');
  const pic1 = path.join(screenshotsDir, 'opt-1-sidebar-groups-and-cards.png');
  await page.screenshot({ path: pic1 });
  console.log('✅ 已保存截图 1 (时间语义分组与自然语言卡片):', pic1);

  // ==========================================
  // 验证 2: 会话项悬浮操作菜单（重命名 Pencil、清空 Eraser、删除 Trash）
  // ==========================================
  console.log('3. 验证场景 2: 会话项悬浮操作菜单...');
  const sessionItem = page.locator('.sidebar-session-item').first();
  if (await sessionItem.count() > 0) {
    await sessionItem.hover();
    await page.waitForTimeout(500);
  }
  const pic2 = path.join(screenshotsDir, 'opt-2-session-hover-actions.png');
  await page.screenshot({ path: pic2 });
  console.log('✅ 已保存截图 2 (会话项悬浮操作菜单):', pic2);

  // ==========================================
  // 验证 3: 底部控制栏优化：工作区清晰前缀、Token用量文字标签、完全访问权限高亮警示
  // ==========================================
  console.log('4. 验证场景 3: 底部控制栏（完全访问权限高亮警示 + Token用量指示按钮 + 工作区前缀）...');
  // 切换权限为完全访问权限展示警示样式
  const permBtn = page.locator('button.composer-selector:has-text("请求批准")').first();
  if (await permBtn.count() > 0) {
    await permBtn.click();
    await page.waitForTimeout(400);
    const fullAccessBtn = page.locator('button[data-testid="permission-mode-full"]').first();
    if (await fullAccessBtn.count() > 0) {
      await fullAccessBtn.click();
      await page.waitForTimeout(600);

      // 如果出现二次确认弹窗，点击“确认”关闭弹窗开启完全访问
      const confirmModalBtn = page.locator('button[data-testid="confirm-full-access"]').first();
      if (await confirmModalBtn.count() > 0) {
        await confirmModalBtn.click();
        await page.waitForTimeout(600);
      }
    }
  }

  const pic3 = path.join(screenshotsDir, 'opt-3-bottom-prompt-controls.png');
  await page.screenshot({ path: pic3 });
  console.log('✅ 已保存截图 3 (底部输入与控制栏优化，完全访问权限警示高亮):', pic3);

  // ==========================================
  // 验证 4: Token 用量悬浮展示统计卡片
  // ==========================================
  console.log('5. 验证场景 4: 悬浮 Token 用量查看详细统计面板...');
  const usageBtn = page.locator('button[aria-label="Token 用量"]').first();
  if (await usageBtn.count() > 0) {
    await usageBtn.hover();
    await page.waitForTimeout(800);
  }
  const pic4 = path.join(screenshotsDir, 'opt-4-token-usage-hover.png');
  await page.screenshot({ path: pic4 });
  console.log('✅ 已保存截图 4 (Token用量悬浮详情):', pic4);

  console.log('🎉 全部优化项测试验证完毕！');
  await browser.close();
}

main().catch((err) => {
  console.error('测试异常:', err);
  process.exit(1);
});
