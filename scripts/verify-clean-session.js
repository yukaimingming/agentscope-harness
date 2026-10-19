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
  await page.waitForTimeout(1500);

  // 1. 点击左上角“新聊天”按钮，开启纯净全新会话
  console.log('点击新聊天按钮开启纯净会话...');
  const newChatBtn = page.locator('button:has-text("新聊天")');
  if (await newChatBtn.count() > 0) {
    await newChatBtn.first().click();
    await page.waitForTimeout(1000);
  }

  // 截图 1: 新建会话后的主面板（无任何上下挤压，工作区整齐，底栏无错位）
  const shot1 = path.join(ARTIFACT_DIR, '01-clean-dashboard.png');
  await page.screenshot({ path: shot1, fullPage: true });
  console.log('已保存纯净主面板截图:', shot1);

  // 2. 发送任务指令：使用 todo_write 包含完成与未完成项
  console.log('发送任务指令...');
  const textarea = page.locator('textarea');
  await textarea.fill('请调用 todo_write 记录两项任务：一项内容为“搭建工程骨架”状态为 completed，另一项为“业务逻辑实现”状态为 in_progress。调用完成后简要回复');
  await page.keyboard.press('Enter');

  // 等待待办任务卡片渲染
  console.log('等待 todoActivity 待办任务卡片渲染...');
  await page.waitForSelector('button:has-text("项待办任务")', { timeout: 20000 });
  console.log('待办任务卡片已出现！');

  // 等待几秒钟让工具执行完成并返回
  await page.waitForTimeout(4000);

  // 3. 验证水平对齐
  const wsSelector = page.locator('[data-testid="workspace-mode-selector"]');
  const todoTrigger = page.locator('button:has-text("项待办任务")').first();
  const wsBox = await wsSelector.boundingBox();
  const todoBox = await todoTrigger.boundingBox();
  if (wsBox && todoBox) {
    const wsCenterY = wsBox.y + wsBox.height / 2;
    const todoCenterY = todoBox.y + todoBox.height / 2;
    const diffY = Math.abs(wsCenterY - todoCenterY);
    console.log(`[水平对齐校验] 工作区中心Y: ${wsCenterY.toFixed(1)}, 待办卡片中心Y: ${todoCenterY.toFixed(1)}, Y轴偏差: ${diffY.toFixed(1)}px`);
  }

  // 截图 2: 水平对齐截图（折叠态同行展示）
  const shot2 = path.join(ARTIFACT_DIR, '02-horizontal-alignment-closed.png');
  await page.screenshot({ path: shot2, fullPage: true });
  console.log('已保存水平对齐折叠态截图:', shot2);

  // 4. 点击展开待办任务卡片
  console.log('展开待办任务卡片...');
  await todoTrigger.click();
  await page.waitForTimeout(800);

  // 截图 3: 待办任务展开，展示打勾状态与完成划线
  const shot3 = path.join(ARTIFACT_DIR, '03-todo-card-expanded-checked.png');
  await page.screenshot({ path: shot3, fullPage: true });
  console.log('已保存待办打勾展开截图:', shot3);

  // 5. 展开思维链时间线，验证过程文本在时间线内不跳出
  console.log('展开思维链分析面板...');
  const timelineTrigger = page.locator('button:has-text("已完成分析"), button:has-text("正在分析")').first();
  if (await timelineTrigger.count() > 0) {
    await timelineTrigger.click();
    await page.waitForTimeout(800);
  }

  // 截图 4: 完整思维链与底栏统计条
  const shot4 = path.join(ARTIFACT_DIR, '04-timeline-and-bottom-statsline.png');
  await page.screenshot({ path: shot4, fullPage: true });
  console.log('已保存思维链与底栏统计条截图:', shot4);

  await browser.close();
  console.log('全部纯净验证完成！');
}

main().catch((err) => {
  console.error('运行失败:', err);
  process.exit(1);
});
