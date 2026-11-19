/* 在压缩的单行 js 里按字符串定位 → 行号/列号 */
const fs = require('fs');
const p = process.argv[2];
const needles = process.argv.slice(3);
const s = fs.readFileSync(p, 'utf8');
const lines = s.split('\n');
console.log('file lines=' + lines.length + '  chars=' + s.length);
for (const n of needles) {
  let idx = -1, cnt = 0, marks = [];
  while ((idx = s.indexOf(n, idx + 1)) >= 0) {
    cnt++;
    const lineNo = s.slice(0, idx).split('\n').length;
    const col = idx - (s.lastIndexOf('\n', idx) + 1) + 1;
    if (cnt <= 8) marks.push('L' + lineNo + ':' + col);
  }
  console.log('[' + n + '] count=' + cnt + '  ' + marks.join('  '));
}
