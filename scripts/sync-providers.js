const fs = require('fs');

async function main() {
  const fileContent = fs.readFileSync('d:/temp/langchain/.data/providers.json', 'utf8');
  const data = JSON.parse(fileContent);
  console.log(`从 langchain 读取到 ${data.providers.length} 个历史配置提供商`);

  for (const p of data.providers) {
    const res = await fetch('http://127.0.0.1:8787/api/providers', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(p),
    });
    const result = await res.json();
    console.log(`成功恢复提供商 [${p.label}]:`, result.provider?.id);
  }

  const finalRes = await fetch('http://127.0.0.1:8787/api/providers');
  const finalData = await finalRes.json();
  console.log('当前全部提供商数量:', finalData.providers.length);
  for (const item of finalData.providers) {
    console.log(` - [${item.label}] id: ${item.id}, model: ${item.defaultModel}, models count: ${item.models.length}`);
  }
}

main().catch(console.error);
