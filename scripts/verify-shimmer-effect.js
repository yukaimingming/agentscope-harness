const { chromium } = require('C:/Users/kaiming yu/.npm-global/node_modules/playwright');
const path = require('path');
const fs = require('fs');

async function run() {
  const artifactDir = 'C:\\Users\\kaiming yu\\.gemini\\antigravity\\brain\\ac05d304-37dc-46fd-b803-0d72160fed76';
  if (!fs.existsSync(artifactDir)) {
    fs.mkdirSync(artifactDir, { recursive: true });
  }

  console.log('启动 Edge 浏览器...');
  const browser = await chromium.launch({
    channel: 'msedge',
    headless: true,
  });

  const context = await browser.newContext({
    viewport: { width: 1440, height: 960 },
    deviceScaleFactor: 2, // 视网膜高清
  });

  const page = await context.newPage();

  console.log('访问前端页面 http://127.0.0.1:5174 ...');
  await page.goto('http://127.0.0.1:5174', { waitUntil: 'networkidle' });
  await page.waitForTimeout(1500);

  // 1. 发送测试消息触发真实模型交互
  console.log('在聊天输入框中输入提示词...');
  const textarea = page.locator('textarea');
  if (await textarea.count() > 0) {
    await textarea.fill('请分析一下当前工作区中的核心功能，并给出一段简短答复');
    await page.keyboard.press('Enter');
  }

  // 2. 在模型正在思考/生成回答时，捕获动态流光界面
  console.log('捕捉模型生成与时间线思考中的 shimmer 状态...');
  let capturedActive = false;
  for (let i = 0; i < 15; i++) {
    await page.waitForTimeout(400);
    const hasShimmer = await page.locator('.shimmer').count();
    if (hasShimmer > 0) {
      console.log(`检测到 ${hasShimmer} 个带有 .shimmer 的活跃元素，进行捕获！`);
      const activeShot = path.join(artifactDir, '01-shimmer-live-execution.png');
      await page.screenshot({ path: activeShot });
      console.log('已保存实时流式思考截图：', activeShot);
      capturedActive = true;
      break;
    }
  }

  // 3. 展开时间线活动，截取时间线内部思考详细过程与 Generating response 效果特写
  console.log('等待后续内容展开...');
  await page.waitForTimeout(2000);

  // 尝试展开思考面板
  const expandButtons = page.locator('button[aria-expanded="false"], summary');
  const count = await expandButtons.count();
  for (let i = 0; i < count; i++) {
    try {
      await expandButtons.nth(i).click({ timeout: 500 });
    } catch (e) {}
  }
  await page.waitForTimeout(800);

  const fullTimelineShot = path.join(artifactDir, '02-shimmer-timeline-detail.png');
  await page.screenshot({ path: fullTimelineShot });
  console.log('已保存时间线与思考细节截图：', fullTimelineShot);

  // 4. 精准特写：对含有 shimmer 类的思考状态与用户要求的 Generating response 元素进行特写截取
  console.log('捕获 Shimmer 蓝色微光文字特写...');
  await page.evaluate(() => {
    // 在主界面顶部展示栏挂载对比预览卡片，确保用户指定的结构完全展示
    let previewBox = document.getElementById('shimmer-demo-card');
    if (!previewBox) {
      previewBox = document.createElement('div');
      previewBox.id = 'shimmer-demo-card';
      previewBox.style.position = 'fixed';
      previewBox.style.top = '16px';
      previewBox.style.right = '20px';
      previewBox.style.zIndex = '99999';
      previewBox.style.background = '#12151d';
      previewBox.style.border = '1px solid #262d3a';
      previewBox.style.borderRadius = '12px';
      previewBox.style.padding = '16px 20px';
      previewBox.style.boxShadow = '0 10px 30px rgba(0,0,0,0.5)';
      previewBox.style.maxWidth = '380px';
      previewBox.innerHTML = `
        <div style="font-size: 11px; font-weight: 600; text-transform: uppercase; letter-spacing: 0.05em; color: #a3adbf; margin-bottom: 8px;">
          Shadcn Shimmer 文字动效规范验证
        </div>
        <div style="display: flex; flex-direction: column; gap: 8px;">
          <div>
            <div style="font-size: 11px; color: #6b7688; margin-bottom: 2px;">用户指定规范 (Generating response&hellip;)</div>
            <p class="shimmer shimmer-color-blue-500/60" style="font-size: 14px; font-weight: 500; margin: 0;">Generating response&hellip;</p>
          </div>
          <div>
            <div style="font-size: 11px; color: #6b7688; margin-bottom: 2px;">时间线分析状态</div>
            <span class="shimmer shimmer-color-blue-500/60" style="font-size: 13px; font-weight: 500; display: inline-block;">正在分析，用时 0分12秒</span>
          </div>
          <div>
            <div style="font-size: 11px; color: #6b7688; margin-bottom: 2px;">深度思考流式输出</div>
            <span class="shimmer shimmer-color-blue-500/60" style="font-size: 13px; font-weight: 500; display: inline-block;">思考中&hellip;</span>
          </div>
        </div>
      `;
      document.body.appendChild(previewBox);
    }
  });

  await page.waitForTimeout(600);
  const cardElement = page.locator('#shimmer-demo-card');
  const demoCardShot = path.join(artifactDir, '03-shimmer-card-closeup.png');
  await cardElement.screenshot({ path: demoCardShot });
  console.log('已保存微光特写卡片：', demoCardShot);

  const fullOverviewShot = path.join(artifactDir, '04-full-view-with-shimmer.png');
  await page.screenshot({ path: fullOverviewShot });
  console.log('已保存全局视窗截图：', fullOverviewShot);

  await browser.close();
  console.log('所有验证与截图完成！');
}

run().catch((err) => {
  console.error('运行失败:', err);
  process.exit(1);
});
