// _uniq.js —— 检查待改字符串的唯一性
const fs = require('fs');
const a = fs.readFileSync('D:/叉叉机/叉叉机/js/app-init.js', 'utf8');
const g = fs.readFileSync('D:/叉叉机/叉叉机/js/group-offline-auto-summary.js', 'utf8');
const c = (s, p) => s.split(p).length - 1;

const t1 = 'ageLimit="fading"===tier?46:24';
const t2 = ',forgetting="carved"===tier?0:"fading"===tier?70:20;';
const t3 = ',forgettingScore:forgetting,';

console.log('[1] app-init  ageLimit="fading"===tier?46:24   出现 ' + c(a, t1) + ' 次');
console.log('[2] group     ,forgetting="carved"===tier?0:"fading"===tier?70:20;  出现 ' + c(g, t2) + ' 次');
console.log('[3] group     ,forgettingScore:forgetting,   出现 ' + c(g, t3) + ' 次');
console.log('');
console.log('[1] 上下文: ' + JSON.stringify(a.slice(a.indexOf(t1) - 60, a.indexOf(t1) + t1.length + 40)));
const i2 = g.indexOf(t2);
console.log('[2] 上下文: ' + JSON.stringify(g.slice(i2 - 60, i2 + t2.length + 20)));
const i3 = g.indexOf(t3);
console.log('[3] 上下文: ' + JSON.stringify(g.slice(i3 - 90, i3 + t3.length + 40)));
