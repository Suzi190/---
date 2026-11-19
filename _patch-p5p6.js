// _patch-p5p6.js —— P5（群聊记忆遗忘锁死）+ P6（30天封顶）
const fs = require('fs');
const P_A = 'D:/叉叉机/叉叉机/js/app-init.js';
const P_G = 'D:/叉叉机/叉叉机/js/group-offline-auto-summary.js';

function one(src, oldStr, newStr, tag) {
  const n = src.split(oldStr).length - 1;
  if (n !== 1) throw new Error(tag + ' 匹配数 = ' + n + '（应为 1）');
  return src.split(oldStr).join(newStr);
}

// ---------- P6：普通记忆遗忘封顶 24 → 40（30 天内零变化，50 天封顶） ----------
let a = fs.readFileSync(P_A, 'utf8');
const beforeA = a.length;
a = one(a, 'ageLimit="fading"===tier?46:24', 'ageLimit="fading"===tier?46:40', 'P6');
fs.writeFileSync(P_A, a, 'utf8');
console.log('P6 OK  长度 ' + beforeA + ' -> ' + a.length);

// ---------- P5：群聊线下记忆不再写死 forgettingScore，改由遗忘公式接管 ----------
let g = fs.readFileSync(P_G, 'utf8');
const beforeG = g.length;
g = one(g, ',forgetting="carved"===tier?0:"fading"===tier?70:20;', ';', 'P5-变量');
g = one(g, ',forgettingScore:forgetting,', ',', 'P5-字段');
fs.writeFileSync(P_G, g, 'utf8');
console.log('P5 OK  长度 ' + beforeG + ' -> ' + g.length + '  (应减少 ' + (beforeG - g.length) + ' 字节)');

// ---------- 校验：不再有 forgettingScore 写入、不再有 forgetting 变量 ----------
const g2 = fs.readFileSync(P_G, 'utf8');
console.log('');
console.log('校验 group-offline-auto-summary.js:');
console.log('  forgettingScore 出现 ' + (g2.split('forgettingScore').length - 1) + ' 次（应为 0）');
console.log('  forgetting= 出现 ' + (g2.split('forgetting=').length - 1) + ' 次（应为 0）');
console.log('  retentionTier:tier 仍在 ' + (g2.split('retentionTier:tier').length - 1) + ' 次（应为 1）');
const a2 = fs.readFileSync(P_A, 'utf8');
console.log('  app-init ageLimit 46:40 = ' + (a2.split('ageLimit="fading"===tier?46:40').length - 1) + ' 次（应为 1）');
console.log('  app-init 残留 46:24 = ' + (a2.split('ageLimit="fading"===tier?46:24').length - 1) + ' 次（应为 0）');
