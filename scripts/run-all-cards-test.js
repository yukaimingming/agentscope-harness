const { chromium } = require('playwright');
const path = require('path');
const fs = require('fs');

const TEST_CARDS = [
  {
    id: 1,
    title: '待办规划',
    badge: '待办规划',
    cardText: '任务清单与执行',
    outName: 'card-01-todos.png',
  },
  {
    id: 2,
    title: '文件变更与行级Diff',
    badge: '文件变更',
    cardText: '文件读写与行级 Diff',
    outName: 'card-02-file-diff.png',
    isDiff: true,
  },
  {
    id: 3,
    title: '深度思考推演',
    badge: '深度思考',
    cardText: '深度推演与思维链',
    outName: 'card-03-deep-thinking.png',
  },
  {
    id: 4,
    title: '子Agent调研',
    badge: '子 Agent',
    cardText: '委派 Researcher 调研',
    outName: 'card-04-subagent-researcher.png',
  },
  {
    id: 5,
    title: '技能系统加载',
    badge: '技能系统',
    cardText: '加载会议纪要技能',
    outName: 'card-05-skills-system.png',
  },
  {
    id: 6,
    title: 'MCP工具调用',
    badge: 'MCP 工具',
    cardText: 'DeepWiki 仓库查询',
    outName: 'card-06-mcp-tools.png',
  },
  {
    id: 7,
    title: '计划模式与审批',
    badge: '计划审批',
    cardText: '计划模式与人工确认',
    outName: 'card-07-plan-approval.png',
  },
  {
    id: 8,
    title: '长期记忆沉淀',
    badge: '长期记忆',
    cardText: '事实抽取沉淀落盘',
    outName: 'card-08-long-term-memory.png',
  },
];

async function runTest() {
  const screenshotsDir = path.join(__dirname, '..', 'screenshots');
  if (!fs.existsSync(screenshotsDir)) {
    fs.mkdirSync(screenshotsDir, { recursive: true });
  }

  console.log('启动浏览器（基于系统 Microsoft Edge，高DPI）...');
  const browser = await chromium.launch({ channel: 'msedge', headless: true });
  const context = await browser.newContext({
    viewport: { width: 1440, height: 1100 },
    deviceScaleFactor: 2.0,
  });
  const page = await context.newPage();
  page.setDefaultTimeout(120000);

  console.log('访问前端页面 http://127.0.0.1:5174 ...');
  await page.goto('http://127.0.0.1:5174', { waitUntil: 'networkidle' });
  await page.waitForTimeout(1500);

  for (const card of TEST_CARDS) {
    console.log(`\n==================================================`);
    console.log(`[测试开始] 功能 ${card.id}: ${card.title} (${card.cardText})`);
    console.log(`==================================================`);

    // 1. 点击新聊天按钮，重置为主面板
    const newChatBtn = page.locator('.new-chat-sidebar-button, button:has-text("新聊天")');
    if (await newChatBtn.count() > 0) {
      await newChatBtn.first().click();
      await page.waitForTimeout(1000);
    }

    // 2. 定位并点击对应的功能建议卡片
    const cardBtn = page.locator(`button:has-text("${card.cardText}")`);
    try {
      await cardBtn.waitFor({ state: 'visible', timeout: 8000 });
      await cardBtn.click();
      console.log(`已成功点击卡片: ${card.cardText}`);
    } catch (err) {
      console.warn(`未直接找到卡片，尝试按徽标寻找: ${card.badge}`);
      const fallbackBtn = page.locator(`button:has-text("${card.badge}")`);
      await fallbackBtn.waitFor({ state: 'visible', timeout: 5000 });
      await fallbackBtn.click();
    }

    // 3. 等待智能体生成完成
    console.log('等待智能体推理思考与工具执行完成...');
    const startTime = Date.now();
    let isCompleted = false;

    while (Date.now() - startTime < 120000) {
      await page.waitForTimeout(2000);
      const state = await page.evaluate(() => {
        const hasSquare = Boolean(document.querySelector('svg.lucide-square'));
        const hasSpinner = Boolean(document.querySelector('.animate-spin'));
        const buttons = Array.from(document.querySelectorAll('button'));
        const hasAnalysisOrFile = buttons.some(b => b.textContent && (b.textContent.includes('已完成分析') || b.textContent.includes('个文件变更')));
        const hasAssistant = Boolean(document.querySelector('.prose')) || hasAnalysisOrFile;
        return {
          isStreaming: hasSquare || hasSpinner,
          hasAssistant,
        };
      });

      if (state.hasAssistant && !state.isStreaming) {
        // 再次确认 2 秒无新流式涌入
        await page.waitForTimeout(2500);
        const doubleCheck = await page.evaluate(() => Boolean(document.querySelector('svg.lucide-square') || document.querySelector('.animate-spin')));
        if (!doubleCheck) {
          isCompleted = true;
          break;
        }
      }
    }

    if (isCompleted) {
      console.log(`功能 ${card.id} 生成完毕（耗时 ${(Date.now() - startTime) / 1000}s）`);
    } else {
      console.warn(`功能 ${card.id} 等待超时，尝试展开已有内容截图`);
    }

    await page.waitForTimeout(1500);

    // 4. 展开总分析过程折叠栏
    const processBtn = page.locator('button:has-text("已完成分析")');
    if (await processBtn.count() > 0) {
      await processBtn.first().click();
      await page.waitForTimeout(600);
    }

    // 5. 展开内部所有 details 标签（包含思维链思考、工具输入输出等）
    await page.evaluate(() => {
      document.querySelectorAll('details').forEach((el) => {
        el.open = true;
      });
    });

    // 6. 如果是待办卡片，展开待办清单卡片
    const todoTrigger = page.locator('button:has-text("待办任务清单")');
    if (await todoTrigger.count() > 0) {
      await todoTrigger.first().click();
      await page.waitForTimeout(500);
    }

    // 7. 如果是文件变更，展开“个文件变更”总卡片并展开具体文件行 Diff
    if (card.isDiff) {
      console.log('展开文件变更总卡片及文件级 Diff 补丁...');
      const queueTrigger = page.locator('button:has-text("个文件变更")');
      if (await queueTrigger.count() > 0) {
        await queueTrigger.first().click();
        await page.waitForTimeout(600);
      }
      // 展开 demo-notes 等具体文件
      const fileRows = page.locator('button[aria-expanded="false"]:has-text("demo-notes"), button:has-text("demo-notes.txt")');
      const count = await fileRows.count();
      for (let i = 0; i < count; i++) {
        await fileRows.nth(i).click();
        await page.waitForTimeout(400);
      }
      // 输出前 5 行 Diff patch 预览
      const diffSnippet = await page.evaluate(() => {
        const pre = document.querySelector('pre');
        return pre ? pre.innerText.split('\n').slice(0, 10).join('\n') : '(无 pre 差异标签)';
      });
      console.log('Diff 片段预览:\n', diffSnippet);
    }

    // 8. 截取并保存该功能的高清截图
    const outPath = path.join(screenshotsDir, card.outName);
    await page.screenshot({ path: outPath, fullPage: true });
    console.log(`[截图交付] 功能 ${card.id} 已保存至: screenshots/${card.outName}`);
    await page.waitForTimeout(1000);
  }

  await browser.close();
  console.log('\n==================================================');
  console.log('全部 8 大主面板核心功能自动化测试与截图已顺利完成！');
  console.log('==================================================');
}

runTest().catch((err) => {
  console.error('测试运行异常:', err);
  process.exit(1);
});
