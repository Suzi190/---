const fs = require('fs');
const p = 'D:/叉叉机/叉叉机/js/lazy-loader.js';
let s = fs.readFileSync(p, 'utf8');
const anchor = '{src:"js/api-preset-model-patch.js?v=20260419r1",label:"API 预设补丁"}';
const count = s.split(anchor).length - 1;
console.log('anchor count: ' + count);
if (count !== 1) { console.log('ABORT: anchor not unique'); process.exit(1); }
if (s.indexOf('st-char-import.js') >= 0) { console.log('already added, skip'); process.exit(0); }
const add = ',{src:"js/st-char-import.js?v=20261119r1",label:"SillyTavern角色卡导入"}';
s = s.replace(anchor, anchor + add);
fs.writeFileSync(p, s, 'utf8');
console.log('done, new length ' + s.length);
