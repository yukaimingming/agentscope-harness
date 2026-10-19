const { chromium } = require('C:/Users/kaiming yu/.npm-global/node_modules/playwright');
const path = require('path');
const fs = require('fs');

async function run() {
  const artifactDir = 'C:\\Users\\kaiming yu\\.gemini\\antigravity\\brain\\ac05d304-37dc-46fd-b803-0d72160fed76';

  console.log('启动浏览器诊断模型下拉菜单...');
  const browser = await chromium.launch({ channel: 'msedge', headless: true });
  const context = await browser.newContext({
    viewport: { width: 1440, height: 960 },
    deviceScaleFactor: 2,
  });
  const page = await context.newPage();

  page.on('console', msg => console.log('浏览器控制台:', msg.text()));

  await page.goto('http://127.0.0.1:5174', { waitUntil: 'networkidle' });
  await page.waitForTimeout(1500);

  // 1. 检查页面中模型选择按钮
  const modelBtn = page.locator('button[title*="点击下拉切换当前模型"], button:has-text("Agents-A1"), button:has-text("Atria-Dawn")');
  console.log('模型选择按钮匹配数量:', await modelBtn.count());

  if (await modelBtn.count() > 0) {
    const text = await modelBtn.first().innerText();
    console.log('当前模型按钮文本:', text.trim());

    // 点击按钮
    console.log('点击模型选择按钮...');
    await modelBtn.first().click();
    await page.waitForTimeout(500);

    // 检查下拉弹层是否存在
    const menu = page.locator('div:has-text("选择模型")');
    console.log('“选择模型”弹层数量:', await menu.count());

    // 截屏查看点击后的视觉状态
    const clickShot = path.join(artifactDir, '10-model-dropdown-clicked.png');
    await page.screenshot({ path: clickShot });
    console.log('已保存点击后的界面截图：', clickShot);

    // 获取 DOM 详细属性
    const info = await page.evaluate(() => {
      const btn = document.querySelector('button[title*="点击下拉切换当前模型"]');
      const dropdown = document.querySelector('.workspace-dropdown-panel') || document.querySelector('div:has-text("选择模型")');
      
      // 检查父级链条中的 overflow
      let parent = btn ? btn.parentElement : null;
      const overflowChain = [];
      while (parent && parent !== document.body) {
        const style = window.getComputedStyle(parent);
        if (style.overflow !== 'visible' || style.overflowY !== 'visible' || style.overflowX !== 'visible') {
          overflowChain.push({
            tagName: parent.tagName,
            className: parent.className,
            overflow: style.overflow,
            overflowX: style.overflowX,
            overflowY: style.overflowY,
          });
        }
        parent = parent.parentElement;
      }

      return {
        hasBtn: !!btn,
        btnRect: btn ? btn.getBoundingClientRect() : null,
        hasDropdown: !!dropdown,
        dropdownRect: dropdown ? dropdown.getBoundingClientRect() : null,
        dropdownHtml: dropdown ? dropdown.outerHTML.slice(0, 300) : null,
        overflowChain,
      };
    });

    console.log('DOM 诊断信息:', JSON.stringify(info, null, 2));
  } else {
    console.error('未找到模型选择按钮！');
  }

  await browser.close();
}

run().catch((err) => {
  console.error('诊断失败:', err);
  process.exit(1);
});
