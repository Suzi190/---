// _patch-tune2.js —— 第二批：把剩下 2 处"纯抽取型"记忆总结的 temperature .7 -> .4
// 先全量校验，全部通过才落盘；任一项不过则不写入并报错。
const fs = require('fs');
const path = require('path');

const ROOT = 'D:/叉叉机/叉叉机/js/';
const CN_KEYS = ['生日', '住址', '约定', '承诺', '纪念日', '身份', '名字', '还记得', '什么时候', '上次', '记忆', '关系', '总结'];

const JOBS = [
  { file: 'app-init.js',      from: 'temperature:.7,tokenCategory:"memory"', to: 'temperature:.4,tokenCategory:"memory"', times: 1 },
  { file: 'managers-extra.js', from: 'temperature:.7,max_tokens:1e3,tokenCategory:"memory"', to: 'temperature:.4,max_tokens:1e3,tokenCategory:"memory"', times: 1 },
];

function countOf(hay, needle) { let n = 0, i = -1; while ((i = hay.indexOf(needle, i + 1)) >= 0) n++; return n; }
function cnDump(s) { return CN_KEYS.map(k => k + '=' + countOf(s, k)).join(' '); }

let fail = 0;
const pending = [];

for (const job of JOBS) {
  const p = path.join(ROOT, job.file);
  const before = fs.readFileSync(p, 'utf8');
  const found = countOf(before, job.from);
  if (found !== job.times) {
    console.log('[FAIL] ' + job.file + ' 锚点期望 ' + job.times + ' 次，实际 ' + found + ' 次');
    fail++; continue;
  }
  const next = before.split(job.from).join(job.to);
  if (countOf(next, job.from) !== 0) { console.log('[FAIL] ' + job.file + ' 旧锚点残留'); fail++; continue; }
  if (countOf(next, job.to) !== job.times) { console.log('[FAIL] ' + job.file + ' 新锚点数量不符'); fail++; continue; }
  if (cnDump(before) !== cnDump(next)) { console.log('[FAIL] ' + job.file + ' 中文计数变化'); fail++; continue; }
  const bBOM = before.charCodeAt(0) === 0xFEFF, nBOM = next.charCodeAt(0) === 0xFEFF;
  const bCRLF = before.includes('\r\n'), nCRLF = next.includes('\r\n');
  if (bBOM !== nBOM || bCRLF !== nCRLF) { console.log('[FAIL] ' + job.file + ' BOM/换行风格变化'); fail++; continue; }
  const bBytes = Buffer.byteLength(before, 'utf8'), nBytes = Buffer.byteLength(next, 'utf8');
  const expectDelta = (job.to.length - job.from.length) * job.times;
  if (nBytes - bBytes !== expectDelta) { console.log('[FAIL] ' + job.file + ' 字节增量 ' + (nBytes - bBytes) + ' != 预期 ' + expectDelta); fail++; continue; }
  pending.push({ file: job.file, text: next });
  console.log('[ OK ] ' + job.file + ' bytes ' + bBytes + ' -> ' + nBytes + ' (delta ' + (nBytes - bBytes) + ')  BOM=' + nBOM + '  CRLF=' + nCRLF);
}

if (fail === 0) {
  for (const item of pending) {
    fs.writeFileSync(path.join(ROOT, item.file), item.text, 'utf8');
    console.log('[WRITE] ' + item.file);
  }
  console.log('batch2 done, files written = ' + pending.length);
} else {
  console.log('batch2 aborted, nothing written. fail=' + fail);
}
process.exitCode = fail === 0 ? 0 : 1;
