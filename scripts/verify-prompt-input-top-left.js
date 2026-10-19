const { chromium } = require('C:/Users/kaiming yu/.npm-global/node_modules/playwright');
const path = require('path');
const fs = require('fs');

async function verifyPromptInputTopLeft() {
  const artifactDir = 'C:\\Users\\kaiming yu\\.gemini\\antigravity\\brain\\ac05d304-37dc-46fd-b803-0d72160fed76';

  console.log('启动自动化验证：提示词输入框左上角对齐与官网规范对齐...');
  const browser = await chromium.launch({ channel: 'msedge', headless: true });
  const context = await browser.newContext({
    viewport: { width: 1440, height: 960 },
    deviceScaleFactor: 2,
  });
  const page = await context.newPage();

  await page.goto('http://127.0.0.1:5174', { waitUntil: 'networkidle' });
  await page.waitForTimeout(1500);

  const textarea = page.locator('textarea.chat-prompt-textarea');
  await textarea.waitFor({ state: 'visible', timeout: 5000 });

  // 1. 验证空状态 placeholder 视觉与位置
  console.log('1. 截取空状态 placeholder...');
  const composer = page.locator('.chat-prompt-input').first();
  await composer.screenshot({
    path: path.join(artifactDir, '18-prompt-input-placeholder.png'),
  });

  // 2. 验证单行输入：文字从左上角起始
  console.log('2. 输入单行文字并检验位置...');
  await textarea.focus();
  await textarea.fill('你好，这是测试单行输入从左上角对齐的效果');
  await page.waitForTimeout(400);

  // 检查 textarea 样式
  const singleLineInfo = await textarea.evaluate((el) => {
    const s = window.getComputedStyle(el);
    const rect = el.getBoundingClientRect();
    const parentRect = el.closest('.chat-prompt-input').getBoundingClientRect();
    return {
      rect: { top: rect.top, left: rect.left, height: rect.height, width: rect.width },
      offsetFromCardTop: rect.top - parentRect.top,
      display: s.display,
      textAlign: s.textAlign,
      paddingTop: s.paddingTop,
      paddingLeft: s.paddingLeft,
      fontSize: s.fontSize,
      lineHeight: s.lineHeight,
    };
  });
  console.log('单行输入位置与样式信息:', singleLineInfo);

  // 截取单行输入特写
  await composer.screenshot({
    path: path.join(artifactDir, '19-prompt-input-single-line.png'),
  });

  // 3. 验证多行输入：换行排版自然，始终左对齐且顶部固定
  console.log('3. 输入多行文本...');
  await textarea.fill(
    '第一行：从左上角开始输入\n第二行：第二行紧随其后自然换行\n第三行：测试多行自适应撑开高度，依然保持规范'
  );
  await page.waitForTimeout(400);

  // 截取多行输入特写
  await composer.screenshot({
    path: path.join(artifactDir, '20-prompt-input-multi-line.png'),
  });

  // 4. 截取完整界面全景视图
  console.log('4. 截取完整界面全景视图...');
  await page.screenshot({
    path: path.join(artifactDir, '21-full-view-prompt-input-optimized.png'),
  });

  console.log('自动化验证完成！截图均已生成。');
  await browser.close();
}

verifyPromptInputTopLeft().catch((err) => {
  console.error('验证执行失败:', err);
  process.exit(1);
});
