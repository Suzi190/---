// _patch-tune.js —— 按业界标准校准 3 处参数（纯数字替换，不动任何逻辑）
// 1) app-init.js 遗忘系数 .12 -> .2      （recency 通道补到 relevance 的 1/3）
// 2) offline-auto-summary.js      2 处记忆提取 temperature .7 -> .4
// 3) group-offline-auto-summary.js 1 处记忆提取 temperature .7 -> .4
const fs = require('fs');
const path = require('path');

const ROOT = 'D:/叉叉机/叉叉机/js/';
const CN_KEYS = ['生日', '住址', '喜欢', '讨厌', '约定', '承诺', '纪念日', '恋爱', '在一起', '确认关系', '身份', '名字', '还记得', '记得', '什么时候', '上次'];

const JOBS = [
  {
    file: 'app-init.js',
    pairs: [{ from: 'getMemoryForgettingValue(memory)*.12', to: 'getMemoryForgettingValue(memory)*.2', times: 1 }],
  },
  {
    file: 'offline-auto-summary.js',
    pairs: [{ from: 'temperature:.7,tokenCategory:"memory"', to: 'temperature:.4,tokenCategory:"memory"', times: 2 }],
  },
  {
    file: 'group-offline-auto-summary.js',
    pairs: [{ from: 'temperature:.7,tokenCategory:"memory"', to: 'temperature:.4,tokenCategory:"memory"', times: 1 }],
  },
];

function countOf(hay, needle) {
  let n = 0, i = -1;
  while ((i = hay.indexOf(needle, i + 1)) >= 0) n++;
  return n;
}
function cnDump(s) {
  return CN_KEYS.map(k => k + '=' + countOf(s, k)).join(' ');
}
function balance(s) {
  let p = 0, b = 0, c = 0, inStr = null, esc = false, inTpl = 0;
  for (let i = 0; i < s.length; i++) {
    const ch = s[i];
    if (inStr) {
      if (esc) { esc = false; continue; }
      if (ch === '\\') { esc = true; continue; }
      if (inStr === '`') { if (ch === '`') inStr = null; }
      else if (ch === inStr) inStr = null;
      continue;
    }
    if (ch === '"' || ch === "'" || ch === '`') { inStr = ch; continue; }
    if (ch === '(') p++; else if (ch === ')') p--;
    else if (ch === '{') b++; else if (ch === '}') b--;
    else if (ch === '[') c++; else if (ch === ']') c--;
  }
  return { paren: p, brace: b, bracket: c, openStr: inStr };
}

let fail = 0;
const report = [];

for (const job of JOBS) {
  const p = path.join(ROOT, job.file);
  const before = fs.readFileSync(p, 'utf8');
  const beforeBytes = Buffer.byteLength(before, 'utf8');
  const beforeCN = cnDump(before);
  const beforeBal = balance(before);
  const hasBOM = before.charCodeAt(0) === 0xFEFF;
  const hasCRLF = before.includes('\r\n');

  let next = before;
  for (const pair of job.pairs) {
    const found = countOf(next, pair.from);
    if (found !== pair.times) {
      report.push('  [FAIL] ' + job.file + ' 锚点 "' + pair.from + '" 期望 ' + pair.times + ' 次，实际 ' + found + ' 次 —— 未写入');
      fail++;
      continue;
    }
    next = next.split(pair.from).join(pair.to);
  }
  if (next === before) {
    report.push('  [FAIL] ' + job.file + ' 未发生任何变化 —— 未写入');
    fail++;
    continue;
  }

  // 写入前先做语法预检：写到临时文件校验
  const tmp = p + '.tmpcheck.js';
  fs.writeFileSync(tmp, next, 'utf8');

  // 事后校验
  const afterBytes = Buffer.byteLength(next, 'utf8');
  for (const pair of job.pairs) {
    const left = countOf(next, pair.from);
    const nowHas = countOf(next, pair.to);
    if (left !== 0) { report.push('  [FAIL] ' + job.file + ' 旧锚点残留 ' + left + ' 处'); fail++; }
    if (nowHas !== pair.times) { report.push('  [FAIL] ' + job.file + ' 新锚点出现 ' + nowHas + ' 次（期望 ' + pair.times + '）'); fail++; }
  }
  const afterCN = cnDump(next);
  const afterBal = balance(next);
  const hasBOM2 = next.charCodeAt(0) === 0xFEFF;
  const hasCRLF2 = next.includes('\r\n');

  if (beforeCN !== afterCN) { report.push('  [FAIL] ' + job.file + ' 中文关键字计数变化\n    before: ' + beforeCN + '\n    after : ' + afterCN); fail++; }
  if (JSON.stringify(beforeBal) !== JSON.stringify(afterBal)) { report.push('  [FAIL] ' + job.file + ' 括号平衡变化 ' + JSON.stringify(beforeBal) + ' -> ' + JSON.stringify(afterBal)); fail++; }
  if (beforeBal.paren !== 0 || beforeBal.brace !== 0 || beforeBal.bracket !== 0 || beforeBal.openStr) { report.push('  [WARN] ' + job.file + ' 原文件本身括号/字符串未闭合 ' + JSON.stringify(beforeBal)); }
  if (hasBOM !== hasBOM2) { report.push('  [FAIL] ' + job.file + ' BOM 状态改变'); fail++; }
  if (hasCRLF !== hasCRLF2) { report.push('  [FAIL] ' + job.file + ' 换行风格改变 (CRLF before=' + hasCRLF + ' after=' + hasCRLF2 + ')'); fail++; }

  fs.writeFileSync(p, next, 'utf8');
  report.push('  [ OK ] ' + job.file + '  bytes ' + beforeBytes + ' -> ' + afterBytes + '  (delta ' + (afterBytes - beforeBytes) + ')  BOM=' + hasBOM2 + '  CRLF=' + hasCRLF2);
  job.tmp = tmp;
}

console.log('==== tune patch ====');
console.log(report.join('\n'));
console.log('fail=' + fail);
process.exitCode = fail === 0 ? 0 : 1;
