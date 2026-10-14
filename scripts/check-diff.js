const { chromium } = require('playwright');

async function main() {
  const b = await chromium.launch({ channel: 'msedge', headless: true });
  const p = await b.newPage();
  p.on('console', msg => console.log('浏览器控制台:', msg.text()));
  p.on('requestfailed', req => console.log('请求失败:', req.url(), req.failure()));
  p.on('response', resp => {
    if (resp.status() >= 400) {
      console.log('HTTP 错误状态:', resp.status(), resp.url());
    }
  });

  await p.goto('http://127.0.0.1:5174');
  await p.waitForTimeout(2000);

  // 查看选中的文件
  const btn = p.locator('aside button:has-text("GitService.java")').first();
  if (await btn.count() > 0) {
    await btn.click();
    await p.waitForTimeout(1500);
  }

  const diffBox = p.locator('aside .overflow-x-auto').first();
  console.log('aside 中的 Diff 内容:\n', await diffBox.innerText());

  await b.close();
}

main().catch(console.error);
