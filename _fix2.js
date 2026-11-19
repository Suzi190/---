const fs = require('fs');
const p = 'D:/叉叉机/叉叉机/js/st-char-import.js';
let s = fs.readFileSync(p, 'utf8');
const marker = "console.log('[st-char-import] 导入完成'";
const idxs = [];
let i = -1;
while ((i = s.indexOf(marker, i + 1)) >= 0) idxs.push(i);
console.log('occurrences: ' + idxs.length + ' at ' + idxs.join(','));
if (idxs.length < 2) { console.log('nothing to remove'); process.exit(0); }
const target = idxs[idxs.length - 1];
const lineStart = s.lastIndexOf('\n', target) + 1;
const endIdx = s.indexOf('\n  }', target);
if (endIdx < 0) { console.log('end brace not found'); process.exit(1); }
console.log('removing: ' + JSON.stringify(s.slice(lineStart, endIdx + 4)));
s = s.slice(0, lineStart) + s.slice(endIdx + 4);
fs.writeFileSync(p, s, 'utf8');
console.log('done, new length ' + s.length);
