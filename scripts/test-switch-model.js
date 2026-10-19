const { chromium } = require('C:/Users/kaiming yu/.npm-global/node_modules/playwright');
const path = require('path');

async function testSelect() {
  const browser = await chromium.launch({ channel: 'msedge', headless: true });
  const page = await browser.newPage({ viewport: { width: 1440, height: 960 }, deviceScaleFactor: 2 });
  await page.goto('http://127.0.0.1:5174', { waitUntil: 'networkidle' });
  await page.waitForTimeout(1000);

  const modelBtn = page.locator('button[title*="点击下拉切换当前模型"]');
  console.log('初始模型按钮文本:', (await modelBtn.innerText()).trim());

  await modelBtn.click();
  await page.waitForTimeout(400);

  const targetOption = page.locator('button:has-text("Atria-Dawn-Preview")').first();
  await targetOption.click();
  await page.waitForTimeout(500);

  const updatedText = await modelBtn.innerText();
  console.log('切换后模型按钮文本:', updatedText.trim());

  const isMenuVisible = await page.locator('div:has-text("选择模型")').isVisible();
  console.log('弹窗是否已自动关闭:', !isMenuVisible);

  const artifactDir = 'C:\\Users\\kaiming yu\\.gemini\\antigravity\\brain\\ac05d304-37dc-46fd-b803-0d72160fed76';
  await page.screenshot({ path: path.join(artifactDir, '11-model-switched.png') });
  console.log('截图已保存');
  await browser.close();
}

testSelect().catch((err) => {
  console.error(err);
  process.exit(1);
});
