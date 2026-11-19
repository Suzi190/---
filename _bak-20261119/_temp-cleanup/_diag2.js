const fs = require('fs');
const s = fs.readFileSync('D:/叉叉机/_restored.html', 'utf8');
const out = [];
out.push('chars=' + s.length);
out.push('title=' + ((s.match(/<title>[\s\S]{0,60}/) || [''])[0]));
out.push('has_叉叉机=' + s.includes('叉叉机'));
out.push('has_主屏幕=' + s.includes('主屏幕'));
out.push('fffd=' + (s.match(/\uFFFD/g) || []).length);
const bad = [];
let i = -1;
while ((i = s.indexOf('\uFFFD', i + 1)) >= 0 && bad.length < 18) {
  bad.push(s.slice(Math.max(0, i - 45), i + 45).replace(/\s+/g, ' '));
}
out.push('--- U+FFFD 上下文 ---');
out.push(bad.join('\n'));
const q = [];
let j = -1, n = 0;
while ((j = s.indexOf('?', j + 1)) >= 0 && n < 8) {
  const ctx = s.slice(Math.max(0, j - 45), j + 45).replace(/\s+/g, ' ');
  if (/[\u4e00-\u9fa5]/.test(ctx)) { q.push(ctx); n++; }
}
out.push('--- 问号上下文 ---');
out.push(q.join('\n'));
fs.writeFileSync('D:/叉叉机/_diag2.txt', out.join('\n'), 'utf8');
console.log('ok');
