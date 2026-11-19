// _diff-check.js —— 逐字节比对：本次改动应【只有】那几处数字不同
const fs = require('fs');
const PAIRS = [
  ['D:/叉叉机/叉叉机/js/app-init.js', 'D:/叉叉机/_bak-20261119-r2/js/app-init.js'],
  ['D:/叉叉机/叉叉机/js/offline-auto-summary.js', 'D:/叉叉机/_bak-20261119-r2/js/offline-auto-summary.js'],
  ['D:/叉叉机/叉叉机/js/group-offline-auto-summary.js', 'D:/叉叉机/_bak-20261119-r2/js/group-offline-auto-summary.js'],
];

for (const [cur, bak] of PAIRS) {
  const name = cur.split('/').pop();
  if (!fs.existsSync(bak)) { console.log(name + ' :: 备份不存在 ' + bak); continue; }
  const a = fs.readFileSync(cur, 'utf8');
  const b = fs.readFileSync(bak, 'utf8');
  if (a === b) { console.log(name + ' :: 与备份完全一致（无改动？）'); continue; }
  // 找出所有不同的区段（最多 20 处）
  let i = 0, j = 0, diffs = 0;
  const out = [];
  while (i < a.length && j < b.length && diffs < 20) {
    if (a[i] === b[j]) { i++; j++; continue; }
    // 采一段上下文
    const aCtx = a.slice(Math.max(0, i - 40), i + 40);
    const bCtx = b.slice(Math.max(0, j - 40), j + 40);
    out.push('  diff@cur' + i + '/bak' + j + '\n    现在: ' + JSON.stringify(aCtx) + '\n    备份: ' + JSON.stringify(bCtx));
    diffs++;
    // 跳过不同的字符块（简单对齐：向前找同步点）
    let sync = -1;
    for (let k = 1; k < 40; k++) {
      if (a[i + k] === b[j + k]) { sync = k; break; }
    }
    if (sync < 0) { i++; j++; } else { i += sync; j += sync; }
  }
  console.log('==== ' + name + ' :: len ' + a.length + ' vs ' + b.length + ' (delta ' + (a.length - b.length) + '), 差异段 ' + diffs + '+ ====');
  console.log(out.join('\n'));
}
