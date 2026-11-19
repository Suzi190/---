// _integrity-check.js —— 项目完整性体检：文件清单、lazy-loader 引用、记忆链路调用点
const fs = require('fs');
const path = require('path');

const CUR = 'D:/叉叉机/叉叉机';
const BAK = 'D:/叉叉机/_bak-20261119-r2';

console.log('=== 1. 目录文件清单 vs 备份 ===');
function walk(root, sub, acc) {
  const dir = path.join(root, sub);
  if (!fs.existsSync(dir)) return acc;
  for (const name of fs.readdirSync(dir)) {
    const rel = sub ? sub + '/' + name : name;
    const full = path.join(root, rel);
    const st = fs.statSync(full);
    if (st.isDirectory()) walk(root, rel, acc);
    else acc.push(rel);
  }
  return acc;
}
const curFiles = walk(CUR, '', []);
const bakFiles = walk(BAK, '', []);
const curSet = new Set(curFiles);
const bakSet = new Set(bakFiles);
const missing = bakFiles.filter(f => !curSet.has(f));
const added = curFiles.filter(f => !bakSet.has(f));
console.log('  当前 ' + curFiles.length + ' 个文件 / 备份 ' + bakFiles.length + ' 个');
console.log('  [备份有但当前缺失] = ' + missing.length + (missing.length ? '\n    ' + missing.join('\n    ') : '  (无)'));
console.log('  [当前新增（相对 r2 备份）] = ' + added.length + (added.length ? '\n    ' + added.join('\n    ') : '  (无)'));

console.log('');
console.log('=== 2. lazy-loader 引用的脚本是否都存在 ===');
const ll = fs.readFileSync(CUR + '/js/lazy-loader.js', 'utf8');
const refs = [...ll.matchAll(/["']([\w\-\/.]+\.js)["']/g)].map(m => m[1]);
const uniq = [...new Set(refs)];
let bad = 0;
for (const r of uniq) {
  const p = path.join(CUR, r.replace(/^\.?\//, ''));
  if (!fs.existsSync(p)) { console.log('  [缺失] ' + r); bad++; }
}
console.log('  引用 ' + uniq.length + ' 个脚本，缺失 ' + bad + ' 个');

console.log('');
console.log('=== 3. 记忆召回入口的所有调用点 ===');
for (const f of fs.readdirSync(CUR + '/js')) {
  if (!f.endsWith('.js')) continue;
  const s = fs.readFileSync(path.join(CUR, 'js', f), 'utf8');
  let i = -1;
  while ((i = s.indexOf('getMemoryAppPromptMemories', i + 1)) >= 0) {
    console.log('  ' + f + ' @' + i + '  ...' + s.slice(Math.max(0, i - 50), i + 40).replace(/\s+/g, ' '));
  }
}

console.log('');
console.log('=== 4. 记忆打分链的关键函数是否都在 ===');
const ai = fs.readFileSync(CUR + '/js/app-init.js', 'utf8');
const fns = ['getMemoryForgettingValue', 'getMemoryImportanceScore', 'getMemoryTier', 'getMemoryRecencyBonus', 'scoreMemoryForAppPrompt', 'getMemoryAppPromptMemories', 'getMemoryAnchorScore', 'getMemoryAgeDays', 'normalizeForgettingScore', 'clampMemoryPercent'];
for (const fn of fns) {
  const n = ai.split(fn).length - 1;
  console.log('  ' + fn.padEnd(32) + ' 引用 ' + String(n).padStart(2) + ' 次  ' + (n > 0 ? 'OK' : '!! 缺失'));
}
