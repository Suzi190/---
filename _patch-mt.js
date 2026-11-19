const fs = require('fs');
const p = 'D:/叉叉机/叉叉机/js/lazy-loader.js';
let s = fs.readFileSync(p, 'utf8');
const anchor = '{src:"js/st-char-import.js?v=20261119r1",label:"SillyTavern角色卡导入"}';
const count = s.split(anchor).length - 1;
console.log('anchor count: ' + count);
if (count !== 1) { console.log('ABORT'); process.exit(1); }
if (s.indexOf('memory-access-touch-patch.js') >= 0) { console.log('already added, skip'); process.exit(0); }
const add = ',{src:"js/memory-access-touch-patch.js?v=20261119r1",label:"记忆访问记账(P4)"}';
s = s.replace(anchor, anchor + add);
fs.writeFileSync(p, s, 'utf8');
console.log('done len=' + s.length);
