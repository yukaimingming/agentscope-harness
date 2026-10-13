const { chromium } = require('playwright');
const path = require('path');

async function testHistoryTime() {
  const browser = await chromium.launch({ channel: 'msedge', headless: true });
  const context = await browser.newContext({
    viewport: { width: 1440, height: 1000 },
    deviceScaleFactor: 2.0,
  });
  const page = await context.newPage();

  console.log('1. 打开前端主页 http://127.0.0.1:5174...');
  await page.goto('http://127.0.0.1:5174', { waitUntil: 'networkidle' });
  await page.waitForTimeout(2000);

  // 检查左侧历史会话条目
  const sessionItems = page.locator('.sidebar-session-item');
  const count = await sessionItems.count();
  console.log(`2. 发现左侧历史会话数量: ${count}`);

  if (count < 2) {
    console.log('历史会话少于 2 个，先发送一条测试消息构建历史...');
    const textarea = page.locator('textarea');
    await textarea.fill('请启动深度思考，简述Java 21中虚拟线程与传统平台线程的核心区别。');
    await page.keyboard.press('Enter');
    await page.waitForTimeout(8000);
  }

  // 再次获取所有会话
  const currentItems = page.locator('.sidebar-session-item');
  const totalSessions = await currentItems.count();
  console.log(`当前共有 ${totalSessions} 个历史会话`);

  // 选择两个历史会话进行切换测试
  const session1 = currentItems.nth(0);
  const session1Title = await session1.locator('span.truncate').innerText();
  const session1TimeInitial = await session1.locator('.session-time').innerText().catch(() => '');
  console.log(`会话 1: "${session1Title}", 左侧记录时间: "${session1TimeInitial}"`);

  // 点击选中会话 1
  await session1.click();
  await page.waitForTimeout(1000);

  // 获取会话 1 右侧时间线上的文字
  const timelineBtn1 = page.locator('section.process-group button').first();
  let timelineText1_first = '';
  if (await timelineBtn1.count() > 0) {
    timelineText1_first = await timelineBtn1.innerText();
    console.log(`会话 1 第一次读取右侧时间线: "${timelineText1_first.trim().split('\n')[0]}"`);
  } else {
    console.log('会话 1 中未发现过程时间线组件');
  }

  // 记录会话 1 的用户消息时间
  const msgTime1_first = await page.locator('span.tabular-nums').first().innerText().catch(() => '');
  console.log(`会话 1 用户消息时间: "${msgTime1_first}"`);

  // 切换到会话 2
  const session2 = currentItems.nth(1);
  const session2Title = await session2.locator('span.truncate').innerText();
  const session2TimeInitial = await session2.locator('.session-time').innerText().catch(() => '');
  console.log(`\n切换到会话 2: "${session2Title}", 左侧记录时间: "${session2TimeInitial}"`);
  await session2.click();
  await page.waitForTimeout(1000);

  const timelineBtn2 = page.locator('section.process-group button').first();
  let timelineText2 = '';
  if (await timelineBtn2.count() > 0) {
    timelineText2 = await timelineBtn2.innerText();
    console.log(`会话 2 右侧时间线: "${timelineText2.trim().split('\n')[0]}"`);
  }

  console.log('\n等待 3 秒钟模拟系统时间流逝...');
  await page.waitForTimeout(3000);

  // 再次切回会话 1
  console.log(`\n切回会话 1: "${session1Title}"...`);
  await session1.click();
  await page.waitForTimeout(1000);

  // 验证会话 1 的左侧时间是否被篡改
  const session1TimeAfter = await session1.locator('.session-time').innerText().catch(() => '');
  console.log(`切回后会话 1 左侧时间: "${session1TimeAfter}" (初始为: "${session1TimeInitial}")`);
  if (session1TimeInitial && session1TimeAfter !== session1TimeInitial) {
    console.error(`[警告] 会话 1 左侧时间发生改变: ${session1TimeInitial} -> ${session1TimeAfter}`);
  } else {
    console.log('[成功] 会话 1 左侧列表记录时间完全保持不变！');
  }

  // 验证会话 1 右侧时间线上的文字是否被篡改
  let timelineText1_second = '';
  if (await timelineBtn1.count() > 0) {
    timelineText1_second = await timelineBtn1.innerText();
    console.log(`会话 1 第二次读取右侧时间线: "${timelineText1_second.trim().split('\n')[0]}"`);
  }

  if (timelineText1_first && timelineText1_second) {
    const textFirst = timelineText1_first.trim().split('\n')[0];
    const textSecond = timelineText1_second.trim().split('\n')[0];
    if (textFirst === textSecond) {
      console.log(`[成功] 右侧时间线耗时与状态完全锁定不变！(${textFirst})`);
    } else {
      console.error(`[失败] 右侧时间线发生了变动！\n第一次: ${textFirst}\n第二次: ${textSecond}`);
    }
  }

  // 展开过程时间线细节以备截图
  if (await timelineBtn1.count() > 0) {
    const isExpanded = await timelineBtn1.getAttribute('aria-expanded');
    if (isExpanded !== 'true') {
      await timelineBtn1.click();
      await page.waitForTimeout(500);
    }
  }
  await page.evaluate(() => {
    document.querySelectorAll('details').forEach(el => el.open = true);
  });
  await page.waitForTimeout(1000);

  // 截图 1: 会话 1 切换回来后固定时间的完整视图
  const outPath1 = path.join(__dirname, '..', 'screenshots', 'history-session-time-fixed.png');
  await page.screenshot({ path: outPath1, fullPage: true });
  console.log(`\n[交付截图 1 保存成功]: ${outPath1}`);

  // 切到会话 2 展开并截图
  await session2.click();
  await page.waitForTimeout(1000);
  if (await timelineBtn2.count() > 0) {
    const isExp2 = await timelineBtn2.getAttribute('aria-expanded');
    if (isExp2 !== 'true') {
      await timelineBtn2.click();
      await page.waitForTimeout(500);
    }
  }
  await page.evaluate(() => {
    document.querySelectorAll('details').forEach(el => el.open = true);
  });
  await page.waitForTimeout(1000);

  const outPath2 = path.join(__dirname, '..', 'screenshots', 'history-session-switch-verified.png');
  await page.screenshot({ path: outPath2, fullPage: true });
  console.log(`[交付截图 2 保存成功]: ${outPath2}`);

  await browser.close();
  console.log('\n历史会话时间固定性验证全部完成！');
}

testHistoryTime().catch(err => {
  console.error('测试异常:', err);
  process.exit(1);
});
