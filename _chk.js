// 括号平衡检查：跳过字符串/注释/模板串
const fs = require('fs');
const src = fs.readFileSync(process.argv[2], 'utf8');
let i = 0, depth = 0, line = 1;
const stack = [];
const lines = src.split('\n');
let lineDepth = [];
for (let n = 0; n < lines.length; n++) lineDepth.push(0);

let mode = 'code';
i = 0;
let curLine = 1;
while (i < src.length) {
  const c = src[i], n1 = src[i + 1], n2 = src[i + 2];
  if (c === '\n') { curLine++; lineDepth[curLine - 1] = depth; i++; continue; }
  if (mode === 'code') {
    if (c === '/' && n1 === '/') { mode = 'line'; i += 2; continue; }
    if (c === '/' && n1 === '*') { mode = 'block'; i += 2; continue; }
    if (c === '"' || c === "'" || c === '`') { mode = c; i++; continue; }
    if (c === '{') { depth++; stack.push(curLine); }
    else if (c === '}') { depth--; stack.pop(); if (depth < 0) { console.log('NEGATIVE at line ' + curLine); } }
  } else if (mode === 'line') {
    if (c === '\n') mode = 'code';
  } else if (mode === 'block') {
    if (c === '*' && n1 === '/') { mode = 'code'; i += 2; continue; }
  } else {
    if (c === '\\') { i += 2; continue; }
    if (c === mode) { mode = 'code'; }
  }
  i++;
}
console.log('final depth = ' + depth + '  (0 = balanced)');
console.log('unclosed opened at lines: ' + stack.join(', '));
