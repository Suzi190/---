// _scan-forgetting.js —— 全项目扫描 getMemoryForgettingValue 的所有消费点，确认没有别处依赖旧系数
const fs = require('fs');
const path = require('path');
const dir = 'D:/叉叉机/叉叉机/js';
let hits = 0;
for (const f of fs.readdirSync(dir)) {
  if (!f.endsWith('.js')) continue;
  const s = fs.readFileSync(path.join(dir, f), 'utf8');
  let i = -1;
  while ((i = s.indexOf('getMemoryForgettingValue', i + 1)) >= 0) {
    hits++;
    const ctx = s.slice(Math.max(0, i - 100), i + 80).replace(/\s+/g, ' ');
    console.log(f + ' @' + i + '\n    ' + ctx + '\n');
  }
}
console.log('total getMemoryForgettingValue hits = ' + hits);

// 顺带确认所有记忆提取调用点的 temperature
console.log('\n--- memory 提取调用点的 temperature ---');
for (const f of fs.readdirSync(dir)) {
  if (!f.endsWith('.js')) continue;
  const s = fs.readFileSync(path.join(dir, f), 'utf8');
  let i = -1;
  while ((i = s.indexOf('tokenCategory:"memory"', i + 1)) >= 0) {
    const back = s.slice(Math.max(0, i - 60), i);
    const m = back.match(/temperature\s*:\s*[\d.]+/);
    console.log('  ' + f + ' @' + i + '  ' + (m ? m[0] : '(无 temperature，用默认)'));
  }
}
