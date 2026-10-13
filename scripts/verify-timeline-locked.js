const { chromium } = require('playwright');
const path = require('path');

async function testTimelinePrecision() {
  const browser = await chromium.launch({ channel: 'msedge', headless: true });
  const context = await browser.newContext({
    viewport: { width: 1440, height: 1000 },
    deviceScaleFactor: 2.0,
  });
  const page = await context.newPage();

  console.log('1. 打开前端主页...');
  await page.goto('http://127.0.0.1:5174', { waitUntil: 'networkidle' });
  await page.waitForTimeout(2000);

  // 找到会话 2（带分析时间线）
  const sessionItems = page.locator('.sidebar-session-item');
  const targetSession = sessionItems.nth(1);
  const targetTitle = await targetSession.locator('span.truncate').innerText();
  console.log(`目标测试历史会话: "${targetTitle}"`);

  // 点击进入目标会话
  await targetSession.click();
  await page.waitForTimeout(1000);

  // 获取时间线文本
  const timelineHeader = page.locator('section.process-group button').first();
  const initialTimelineText = (await timelineHeader.innerText()).trim().split('\n')[0];
  console.log(`初次读取时间线标题: "${initialTimelineText}"`);

  // 切换到会话 3
  const otherSession = sessionItems.nth(2);
  const otherTitle = await otherSession.locator('span.truncate').innerText();
  console.log(`切换到其他会话: "${otherTitle}"`);
  await otherSession.click();
  await page.waitForTimeout(1000);

  console.log('等待 4 秒模拟时间流逝...');
  await page.waitForTimeout(4000);

  // 再次切回目标测试会话
  console.log(`切回目标测试会话: "${targetTitle}"`);
  await targetSession.click();
  await page.waitForTimeout(1000);

  const afterTimelineText = (await timelineHeader.innerText()).trim().split('\n')[0];
  console.log(`切回后读取时间线标题: "${afterTimelineText}"`);

  if (initialTimelineText === afterTimelineText) {
    console.log(`\n🎉 [完美验证通过]：时间线耗时与状态严格固定一致！("${initialTimelineText}") 未受任何影响！`);
  } else {
    console.error(`\n❌ [验证失败]：时间线发生变化！初次="${initialTimelineText}", 之后="${afterTimelineText}"`);
    process.exit(1);
  }

  // 展开时间线和内部 details
  const isExp = await timelineHeader.getAttribute('aria-expanded');
  if (isExp !== 'true') {
    await timelineHeader.click();
    await page.waitForTimeout(500);
  }
  await page.evaluate(() => {
    document.querySelectorAll('details').forEach(el => el.open = true);
  });
  await page.waitForTimeout(500);

  const shotPath = path.join(__dirname, '..', 'screenshots', 'history-session-timeline-locked.png');
  await page.screenshot({ path: shotPath, fullPage: true });
  console.log(`高清验证截图已保存至: ${shotPath}`);

  await browser.close();
}

testTimelinePrecision().catch(err => {
  console.error(err);
  process.exit(1);
});
