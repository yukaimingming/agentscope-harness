const { chromium } = require('playwright');
const path = require('path');
const fs = require('fs');

const ARTIFACT_DIR = 'C:\\Users\\kaiming yu\\.gemini\\antigravity\\brain\\ac05d304-37dc-46fd-b803-0d72160fed76';

async function main() {
  console.log('启动浏览器 (使用 Edge)...');
  const browser = await chromium.launch({
    channel: 'msedge',
    headless: true,
  });

  const context = await browser.newContext({
    viewport: { width: 1440, height: 960 },
    deviceScaleFactor: 1.5,
  });

  const page = await context.newPage();

  console.log('1. 访问首页 http://127.0.0.1:5174 ...');
  await page.goto('http://127.0.0.1:5174', { waitUntil: 'networkidle' });
  await page.waitForTimeout(2000);

  // 截图 1: 左侧侧边栏初始状态
  const shot0 = path.join(ARTIFACT_DIR, '01-workspace-sidebar-initial.png');
  await page.screenshot({ path: shot0, fullPage: true });
  console.log('已保存左侧侧边栏初始截图:', shot0);

  // 2. 点击左侧列表的“添加工作区”图标按钮
  console.log('2. 点击添加工作区按钮打开弹窗...');
  const addBtn = page.locator('.sidebar-add-workspace-button');
  if (await addBtn.count() > 0) {
    await addBtn.first().click();
  } else {
    // 尝试点击备选按钮
    await page.locator('button:has-text("新建或添加工作区")').first().click();
  }

  // 等待弹窗加载并渲染数据
  await page.waitForSelector('text=选择与新建工作区文件夹', { timeout: 10000 });
  await page.waitForTimeout(1500);

  // 截图 2: 弹窗包含默认工作区与多种系统路径（桌面、C盘、D盘、项目目录）
  const shot1 = path.join(ARTIFACT_DIR, '02-workspace-modal-default-and-paths.png');
  await page.screenshot({ path: shot1, fullPage: true });
  console.log('已保存弹窗默认工作区与多路径截图:', shot1);

  // 3. 测试点击切换到其它路径，例如“项目目录”
  console.log('3. 测试切换到其它路径：项目目录...');
  const projectPathBtn = page.locator('button:has-text("项目目录")');
  if (await projectPathBtn.count() > 0) {
    await projectPathBtn.first().click();
    await page.waitForTimeout(1500);
  }

  // 截图 3: 切换到其它路径（项目目录）后的子文件夹列表
  const shot2 = path.join(ARTIFACT_DIR, '03-workspace-modal-switch-other-paths.png');
  await page.screenshot({ path: shot2, fullPage: true });
  console.log('已保存切换其它路径截图:', shot2);

  // 4. 切回默认工作区
  console.log('4. 切回默认工作区...');
  const defaultWsBtn = page.locator('button:has-text("默认工作区")');
  if (await defaultWsBtn.count() > 0) {
    await defaultWsBtn.first().click();
    await page.waitForTimeout(1500);
  }

  // 5. 测试新建工作区文件夹功能
  console.log('5. 点击新建文件夹按钮...');
  const createFolderToggle = page.locator('[data-testid="modal-create-folder-btn"]');
  await createFolderToggle.click();
  await page.waitForTimeout(600);

  const folderName = `project-${Date.now().toString().slice(-4)}`;
  console.log(`输入新建文件夹名称: ${folderName}...`);
  const folderInput = page.locator('input[placeholder*="新建工作区文件夹名称"]');
  await folderInput.fill(folderName);
  await page.waitForTimeout(400);

  // 点击弹窗内的“创建”按钮
  const submitCreateBtn = page.getByRole('button', { name: '创建', exact: true });
  await submitCreateBtn.click();
  await page.waitForTimeout(2000);

  // 截图 4: 创建新文件夹成功并高亮选中
  const shot3 = path.join(ARTIFACT_DIR, '04-workspace-modal-create-folder-success.png');
  await page.screenshot({ path: shot3, fullPage: true });
  console.log('已保存新建文件夹成功截图:', shot3);

  // 6. 点击“选择此工作区”确认绑定
  console.log('6. 点击选择此工作区确认绑定...');
  const confirmBtn = page.locator('[data-testid="confirm-select-folder-btn"]');
  await confirmBtn.click();
  await page.waitForTimeout(2500);

  // 截图 5: 验证左侧列表中新增了该工作区分组节点并处于激活状态
  const shot4 = path.join(ARTIFACT_DIR, '05-workspace-sidebar-with-new-folder.png');
  await page.screenshot({ path: shot4, fullPage: true });
  console.log('已保存工作区列表新增工作区节点截图:', shot4);

  await browser.close();
  console.log('工作区弹窗与新建功能验证全部完成！');
}

main().catch((err) => {
  console.error('测试失败:', err);
  process.exit(1);
});
