const { chromium } = require('playwright');

const SUGGESTIONS = [
  { name: '待办规划', text: '使用 todo_write 工具为当前工作区规划一个开发自动化脚本的详细待办任务清单，并开始执行第一项任务。' },
  { name: '文件变更', text: '在工作区创建一个名为 demo-notes.txt 的文件，写入几行项目介绍；然后再编辑修改其中两行内容，展示行级 Diff 差异对比。' },
  { name: '深度思考', text: '请启动深度思考，全面对比快速排序与堆排序算法在内存局部性、最坏时间复杂度与工业界实际系统场景下的核心差异。' },
  { name: '子 Agent', text: '调用 researcher 子智能体帮我调研 AgentScope Java 框架的核心特性与工作区规范，并汇总一份简洁的调研报告。' },
  { name: '技能系统', text: '加载工作区中的 skills/meeting-notes 技能，根据其 references/template.md 模版帮我整理一份今日架构评审的规范会议纪要。' },
  { name: 'MCP 工具', text: '使用 deepwiki MCP 工具查询 facebook/react 仓库的架构与代码结构，说明其主要目录职责。' },
  { name: '计划审批', text: '进入计划模式 (plan_enter) 制定系统重构方案，并在准备退出计划模式时等待我的确认批准。' },
  { name: '长期记忆', text: '请记住：我的偏好语言是 Java 与 TypeScript，常用后端框架是 Spring Boot 3，把这个偏好存入你的长期记忆中。' },
];

async function checkAllSuggestions() {
  const browser = await chromium.launch({ channel: 'msedge', headless: true });
  const page = await browser.newPage();
  
  page.on('console', msg => {
    if (msg.type() === 'error') console.log('[Console Error]', msg.text());
  });

  await page.goto('http://127.0.0.1:5174');
  await page.waitForTimeout(2000);

  console.log('=== 测试直接聊天模式下建议提示词卡片与点击行为 ===');

  for (let i = 0; i < SUGGESTIONS.length; i++) {
    const item = SUGGESTIONS[i];
    console.log(`\n[测试 ${i + 1}/${SUGGESTIONS.length}]：${item.name}`);

    // 点击新聊天，回到直接聊天的空面板
    const newChatBtn = page.locator('button:has-text("新聊天")').first();
    await newChatBtn.click();
    await page.waitForTimeout(800);

    // 寻找对应卡片按钮
    const cardBtn = page.locator(`button:has-text("${item.name}")`).first();
    if (await cardBtn.count() === 0) {
      console.error(`  ❌ 未找到卡片按钮: ${item.name}`);
      continue;
    }

    // 点击卡片
    await cardBtn.click();
    await page.waitForTimeout(1000);

    // 检查是否有消息被发出
    const userMsg = await page.locator('.group\\/user').first();
    const hasSent = await userMsg.count() > 0;
    if (hasSent) {
      const sentText = await userMsg.innerText();
      console.log(`  ✅ 消息已成功发出: "${sentText.slice(0, 35)}..."`);
    } else {
      console.error(`  ❌ 点击后消息未能成功发出！`);
    }

    // 稍等 2 秒，查看是否出现分析或思考或答复
    await page.waitForTimeout(2000);
    const hasActivity = await page.locator('.process-group, [data-role="assistant"], .streaming-caret').count() > 0;
    console.log(`  响应状态: ${hasActivity ? '正在执行/已响应' : '无响应'}`);
  }

  await browser.close();
}

checkAllSuggestions().catch(console.error);
