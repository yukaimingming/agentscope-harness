const { chromium } = require('playwright');
const path = require('path');
const fs = require('fs');

async function run() {
  const screenshotDir = path.join(__dirname, '..', 'screenshots');
  if (!fs.existsSync(screenshotDir)) {
    fs.mkdirSync(screenshotDir, { recursive: true });
  }

  console.log('启动浏览器 (使用系统 Edge)...');
  const browser = await chromium.launch({
    channel: 'msedge',
    headless: true,
  });

  const context = await browser.newContext({
    viewport: { width: 1440, height: 960 },
    deviceScaleFactor: 1.5,
  });

  const page = await context.newPage();

  console.log('访问 http://127.0.0.1:5174 ...');
  await page.goto('http://127.0.0.1:5174', { waitUntil: 'networkidle' });

  // 等待主界面渲染
  await page.waitForTimeout(2000);

  const homeScreenshot = path.join(screenshotDir, '01-home-screen.png');
  await page.screenshot({ path: homeScreenshot, fullPage: true });
  console.log('已保存首页截图：', homeScreenshot);

  // 检查建议提示词卡片
  console.log('寻找测试建议卡片...');
  const suggestionCards = page.locator('button:has-text("创建文件并查看行级修改对比")');
  if (await suggestionCards.count() > 0) {
    console.log('点击测试提示词卡片：创建文件并查看行级修改对比');
    await suggestionCards.first().click();
  } else {
    console.log('直接在输入框输入测试提示词');
    const textarea = page.locator('textarea');
    await textarea.fill('请在工作区新建一个 hello.txt 文件并写入内容 Hello AgentScope，然后读取该文件确认');
    await page.keyboard.press('Enter');
  }

  // 等待运行并在过程中观察
  console.log('等待智能体响应与工具执行...');
  // 等待出现工具卡片或活动时间线
  try {
    await page.waitForSelector('text=已完成', { timeout: 35000 });
  } catch (e) {
    console.log('等待完成超时，继续截取当前执行状态状态');
  }

  await page.waitForTimeout(3000);

  // 尝试点击展开工具调用卡片或思考折叠
  console.log('寻找并展开折叠面板...');
  const expandButtons = page.locator('button:has-text("详细"), button:has-text("展开"), button:has-text("思考"), div[role="button"]');
  const count = await expandButtons.count();
  for (let i = 0; i < Math.min(count, 5); i++) {
    try {
      await expandButtons.nth(i).click({ timeout: 1000 });
    } catch (ignored) {}
  }

  await page.waitForTimeout(1500);

  const resultScreenshot = path.join(screenshotDir, '02-tool-execution-detail.png');
  await page.screenshot({ path: resultScreenshot, fullPage: true });
  console.log('已保存执行详情截图：', resultScreenshot);

  await browser.close();
  console.log('验证截图完成！');
}

run().catch((err) => {
  console.error('运行失败:', err);
  process.exit(1);
});
