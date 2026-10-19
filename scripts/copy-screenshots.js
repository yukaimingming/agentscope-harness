const fs = require('fs');
const path = require('path');

const srcDir = 'C:\\Users\\kaiming yu\\.gemini\\antigravity\\brain\\ac05d304-37dc-46fd-b803-0d72160fed76';
const destDir = path.join(__dirname, '..', 'docs', 'images');

if (!fs.existsSync(destDir)) {
  fs.mkdirSync(destDir, { recursive: true });
}

const copyList = [
  { src: '01-main-dashboard-aligned.png', dest: '01-dashboard-overview.png', desc: '工作台主界面全景（任务列表与工作区水平完美对齐）' },
  { src: '10-model-dropdown-clicked.png', dest: '02-model-selector-dropdown.png', desc: '输入框模型选择列表（点击展开6大可用模型与提供商快捷入口）' },
  { src: '07-token-meter-active-session-card-detailed.png', dest: '03-token-meter-context-dialog.png', desc: 'Token用量卡片（参考微软智能体样式，点击药丸环形进度圈弹出详细用量占比与构成）' },
  { src: '03-queued-prompt-card-above-input.png', dest: '04-queued-prompt-folded-card.png', desc: '背面折叠排队卡片（输入框背面优雅折叠展示排队提示词，支持生成中二次发送排队与立即引导）' },
  { src: '04-full-view-with-shimmer.png', dest: '05-shimmer-streaming-thinking.png', desc: 'Shadcn UI 官方 Shimmer 蓝色微光动态思考与流式过程' },
  { src: '08-settings-save-success.png', dest: '06-settings-providers-config.png', desc: '模型与提供商设置中心（支持自定义Endpoint、模型探测与配置持久化保存）' },
  { src: '09-blocked-send-warning-alert.png', dest: '07-blocked-send-warning-alert.png', desc: '未配置API厂商发送拦截警告提醒（友好弹窗提示未配置厂商，防止空白调用）' },
  { src: '04-todo-completed-checks-and-bottom-stats.png', dest: '08-todo-tasks-completion.png', desc: '任务清单 Todo 状态实时打勾联动与底部 Token 统计提示词' },
  { src: '02-workspace-modal-default-and-paths.png', dest: '09-workspace-folder-manager.png', desc: '工作区目录新建与选择管理（支持默认路径与自定义系统目录切换）' },
  { src: 'fix-1-code-diff-overview.png', dest: '10-code-diff-review.png', desc: 'Git 代码变更差异（Diff 对比查看与代码审查工作台）' },
  { src: 'fix-4-terminal-execution.png', dest: '11-terminal-execution.png', desc: '内置交互式控制台与终端命令执行' },
  { src: 'theme-light-main.png', dest: '12-light-theme-mode.png', desc: '明暗双主题无缝切换（清新明亮的浅色主题模式）' },
];

console.log('开始复制完整功能截图到 docs/images...');
for (const item of copyList) {
  const s = path.join(srcDir, item.src);
  const d = path.join(destDir, item.dest);
  if (fs.existsSync(s)) {
    fs.copyFileSync(s, d);
    const stat = fs.statSync(d);
    console.log(`[成功] ${item.src} -> ${item.dest} (${(stat.size / 1024).toFixed(1)} KB) - ${item.desc}`);
  } else {
    console.warn(`[未找到] ${item.src}`);
  }
}
console.log('截图复制完成！');
