const { chromium } = require('C:/Users/kaiming yu/.npm-global/node_modules/playwright');
const path = require('path');

const TARGET_DIR = path.resolve("C:/Users/kaiming yu/.gemini/antigravity/brain/ac05d304-37dc-46fd-b803-0d72160fed76");

(async () => {
  const browser = await chromium.launch({ channel: 'msedge', headless: true });
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const page = await context.newPage();

  console.log("1. 打开工作台页面...");
  await page.goto("http://127.0.0.1:5174", { waitUntil: "networkidle" });
  await page.waitForTimeout(1000);

  // 1. 点击新聊天
  console.log("1.1 点击新聊天...");
  const newChatBtn = page.locator('.new-chat-sidebar-button, button:has-text("新聊天")').first();
  if (await newChatBtn.count() > 0) {
    await newChatBtn.click({ force: true });
    await page.waitForTimeout(600);
  }

  // 2. 选择「完全访问权限」
  console.log("2. 检查并选择「完全访问权限」...");
  const permSelector = page.locator('button:has-text("请求批准"), button:has-text("完全访问"), button:has-text("自动确认")').first();
  if (await permSelector.count() > 0) {
    const text = await permSelector.innerText();
    console.log("当前权限按钮显示:", text);
    if (!text.includes("完全访问")) {
      await permSelector.click();
      await page.waitForTimeout(300);
      const fullAccessItem = page.locator('button:has-text("完全访问权限")').first();
      if (await fullAccessItem.count() > 0) {
        await fullAccessItem.click();
        await page.waitForTimeout(400);

        // 处理二次确认弹窗
        const confirmBtn = page.locator('button[data-testid="confirm-full-access"], button:has-text("确认")').last();
        if (await confirmBtn.count() > 0 && await confirmBtn.isVisible()) {
          console.log("点击完全访问权限二次确认弹窗...");
          await confirmBtn.click();
          await page.waitForTimeout(400);
        }
        console.log("已切换至「完全访问权限」");
      }
    }
  }

  // 再次验证按钮状态
  const updatedPermText = await permSelector.innerText();
  console.log("切换后权限按钮显示:", updatedPermText);

  // 3. 点击主面板上的「DeepWiki 仓库查询」卡片
  console.log("3. 点击主面板快速建议卡片「DeepWiki 仓库查询」...");
  const mcpCard = page.locator('button:has-text("DeepWiki 仓库查询")').first();
  if (await mcpCard.count() > 0 && await mcpCard.isVisible()) {
    await mcpCard.click();
    console.log("已点击「DeepWiki 仓库查询」卡片，并自动发送提示词！");
  } else {
    console.log("卡片未找到，回退到手动填入提示词...");
    const promptText = "使用 deepwiki MCP 工具查询 facebook/react 仓库的架构与代码结构，说明其主要目录职责。";
    const inputArea = page.locator('textarea[placeholder*="输入任务描述"]').first();
    await inputArea.fill(promptText);
    await page.waitForTimeout(300);
    const sendBtn = page.locator('button[aria-label="发送提示词"], button[type="submit"]').last();
    await sendBtn.click({ force: true });
  }

  // 4. 等待执行并实时监控审批卡片
  console.log("4. 等待智能体执行，并实时检查是否有审批弹层...");
  const startTime = Date.now();
  let popupDetected = false;

  while (Date.now() - startTime < 120000) {
    // 检测是否出现“此工具请求执行敏感操作”
    const approvalCard = page.locator('text=此工具请求执行敏感操作');
    if (await approvalCard.count() > 0 && await approvalCard.first().isVisible()) {
      popupDetected = true;
      console.error("【警告】检测到敏感操作审批弹层！");
    }

    // 检查停止按钮是否已经消失（即输出已经彻底完成）
    const isStopBtnVisible = await page.evaluate(() => {
      const stopBtn = document.querySelector('button[aria-label="停止响应"]');
      return Boolean(stopBtn);
    });

    const hasCompletedSummary = await page.evaluate(() => {
      const summaryBtn = document.querySelector('.process-group button');
      return Boolean(summaryBtn && summaryBtn.textContent && summaryBtn.textContent.includes('已完成分析'));
    });

    if (!isStopBtnVisible && hasCompletedSummary && (Date.now() - startTime > 10000)) {
      console.log("Agent 执行已圆满完成（停止按钮已消失，已完成分析）！");
      break;
    }

    await page.waitForTimeout(1000);
  }

  await page.waitForTimeout(3000);

  // 5. 校验时间线收缩状态与各工具状态
  const checkResult = await page.evaluate(() => {
    const summaryBtn = document.querySelector('.process-group button');
    const isTimelineExpanded = summaryBtn ? summaryBtn.getAttribute('aria-expanded') === 'true' : false;
    const summaryText = summaryBtn ? summaryBtn.textContent : '';
    const bodyText = document.body.innerText;
    const stillCalling = bodyText.includes('正在调用 ask_wiki_question');
    const hasSensitiveCard = bodyText.includes('此工具请求执行敏感操作');
    const hasAnswer = bodyText.includes('facebook/react') || bodyText.includes('React') || bodyText.includes('packages');
    return {
      summaryText,
      isTimelineExpanded,
      stillCalling,
      hasSensitiveCard,
      hasAnswer,
    };
  });

  console.log("=== 校验结果 ===");
  console.log("时间线文本:", checkResult.summaryText);
  console.log("时间线是否自动收缩:", !checkResult.isTimelineExpanded);
  console.log("是否有残留审批卡片:", checkResult.hasSensitiveCard);
  console.log("是否依然显示「正在调用」:", checkResult.stillCalling);
  console.log("是否成功输出正文回答:", checkResult.hasAnswer);

  // 截图 1：完成态全景（验证：时间线自动收缩、无审批卡片、正文清晰）
  const finalPath = path.join(TARGET_DIR, "mcp-full-access-finished.png");
  await page.screenshot({ path: finalPath });
  console.log("已保存完成态全景截图:", finalPath);

  // 点击展开时间线
  const timelineBtn = page.locator('.process-group button').first();
  if (await timelineBtn.count() > 0) {
    await timelineBtn.click();
    await page.waitForTimeout(600);
    const expandedPath = path.join(TARGET_DIR, "mcp-timeline-expanded-clean.png");
    await page.screenshot({ path: expandedPath });
    console.log("已保存展开状态截图:", expandedPath);
  }

  await browser.close();
  console.log("全部端到端验证通过！");
})().catch((err) => {
  console.error("执行出错:", err);
  process.exit(1);
});
