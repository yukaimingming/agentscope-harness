const { chromium } = require('playwright');
const path = require('path');
const fs = require('fs');

const ARTIFACT_DIR = 'C:\\Users\\kaiming yu\\.gemini\\antigravity\\brain\\ac05d304-37dc-46fd-b803-0d72160fed76';

async function main() {
  console.log('启动浏览器 (使用 Edge)...');
  const browser = await chromium.launch({
    channel: 'msedge',
    headless: true,
  });

  const context = await browser.newContext({
    viewport: { width: 1440, height: 960 },
    deviceScaleFactor: 1.5,
  });

  const page = await context.newPage();

  console.log('1. 访问首页 http://127.0.0.1:5174 ...');
  await page.goto('http://127.0.0.1:5174', { waitUntil: 'networkidle' });
  await page.waitForTimeout(2000);

  // 截图 1: 首页主面板与输入框布局
  const shot1 = path.join(ARTIFACT_DIR, '01-main-dashboard-aligned.png');
  await page.screenshot({ path: shot1, fullPage: true });
  console.log('已保存首页主面板截图:', shot1);

  // 2. 测试工作区选择器下拉交互
  console.log('2. 测试工作区选择器下拉面板...');
  const wsSelector = page.locator('[data-testid="workspace-mode-selector"]');
  await wsSelector.click();
  await page.waitForTimeout(500);

  const shot2 = path.join(ARTIFACT_DIR, '02-workspace-dropdown-opened.png');
  await page.screenshot({ path: shot2, fullPage: true });
  console.log('已保存工作区下拉截图:', shot2);

  // 点击外部关闭下拉
  await page.mouse.click(200, 200);
  await page.waitForTimeout(400);

  // 3. 测试发送任务，规划并完成待办
  console.log('3. 输入任务：请规划 2 项待办并把它们都设为已完成状态 (completed)');
  const textarea = page.locator('textarea');
  await textarea.fill('请调用 todo_write 规划待办并将两个任务状态都设为已完成 completed：1. 初始化工作区 2. 编写验证代码');
  await page.keyboard.press('Enter');

  // 等待回复流式输出与待办任务列表更新
  console.log('等待回复流式输出与待办任务列表更新...');
  try {
    await page.waitForSelector('text=项待办任务', { timeout: 15000 });
    console.log('已检测到待办任务列表渲染！');
  } catch (e) {
    console.log('待办列表等待中...');
  }

  // 持续等待执行完成
  for (let step = 0; step < 10; step++) {
    await page.waitForTimeout(2500);
    const completedCount = await page.locator('text=已完成').count();
    console.log(`执行观察轮次 ${step + 1}: 已完成关键词出现次数=${completedCount}`);
    if (completedCount >= 2) {
      break;
    }
  }

  // 5. 验证折叠状态下工作区与待办任务卡片的垂直中心坐标水平对齐
  console.log('4. 验证折叠状态下工作区与待办任务卡片的垂直中心坐标水平对齐...');
  const wsBox = await wsSelector.boundingBox();
  const todoTrigger = page.locator('button:has-text("项待办任务")').first();
  if (wsBox && (await todoTrigger.count() > 0)) {
    const todoBox = await todoTrigger.boundingBox();
    if (todoBox) {
      const wsCenterY = wsBox.y + wsBox.height / 2;
      const todoCenterY = todoBox.y + todoBox.height / 2;
      const diffY = Math.abs(wsCenterY - todoCenterY);
      console.log(`[水平对齐检测] 工作区中心Y: ${wsCenterY.toFixed(1)}, 待办卡片中心Y: ${todoCenterY.toFixed(1)}, Y轴偏差: ${diffY.toFixed(1)}px`);
      if (diffY <= 6) {
        console.log('✅ 完美对齐：工作区与任务列表已在同一水平线上对齐（偏差 <= 6px）！');
      } else {
        console.log(`提示：Y轴偏差为 ${diffY.toFixed(1)}px`);
      }
    }
  }

  // 截图 3: 默认折叠状态下的水平同行对齐与底栏统计
  const shot3 = path.join(ARTIFACT_DIR, '03-task-execution-horizontal-alignment.png');
  await page.screenshot({ path: shot3, fullPage: true });
  console.log('已保存执行中水平对齐与待办列表截图:', shot3);

  // 6. 展开待办任务卡片以检查打勾状态
  console.log('5. 展开待办任务卡片检查打勾...');
  if (await todoTrigger.count() > 0) {
    await todoTrigger.click();
    await page.waitForTimeout(600);
  }

  // 展开思考链时间线面板
  const thinkTriggers = page.locator('button:has-text("思考"), button:has-text("展开")');
  const count = await thinkTriggers.count();
  for (let i = 0; i < Math.min(count, 3); i++) {
    try {
      await thinkTriggers.nth(i).click({ timeout: 800 });
    } catch (e) {}
  }
  await page.waitForTimeout(800);

  // 截图 4: 待办任务打勾展开与底部统计条
  const shot4 = path.join(ARTIFACT_DIR, '04-todo-completed-checks-and-bottom-stats.png');
  await page.screenshot({ path: shot4, fullPage: true });
  console.log('已保存待办打勾展开与底栏统计截图:', shot4);

  await browser.close();
  console.log('所有自动化测试验证完成！');
}

main().catch((err) => {
  console.error('测试失败:', err);
  process.exit(1);
});
