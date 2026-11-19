// 用法: node _slice.js <文件> <起始字符> <长度> [输出文件]
const fs = require('fs');
const [, , file, start, len, outArg] = process.argv;
const s = fs.readFileSync(file, 'utf8');
const st = Math.max(0, Number(start) || 0);
const ln = Number(len) || 2000;
const seg = s.slice(st, st + ln);
const out = outArg || 'D:/叉叉机/_slice-out.txt';
fs.writeFileSync(out, seg, 'utf8');
console.log('total=' + s.length + ' slice[' + st + ',' + (st + seg.length) + '] -> ' + out);
