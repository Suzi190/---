// _sim-forgetting.js —— 用项目真实公式复现遗忘值，对比 0.12 与 0.20 的扣分效果
// 公式来源：app-init.js getMemoryForgettingValue
function clampP(v, fb) { const n = Number(v); return Number.isFinite(n) ? Math.max(0, Math.min(100, Math.round(n))) : fb; }
function forgetting(tier, importance, ageDays, important) {
  if (tier === 'carved') return 0;
  const ageWeight = tier === 'fading' ? 2.2 : 0.8;
  const ageLimit = tier === 'fading' ? 46 : 24;
  return clampP((tier === 'fading' ? 34 : 12) + 0.6 * Math.max(0, 70 - importance) + Math.min(ageLimit, ageDays * ageWeight) - (important ? 8 : 0), 0);
}
const OLD = 0.12, NEW = 0.2;
const pad = (s, n) => String(s).padEnd(n);
const num = (v, n) => String(v).padStart(n);

function table(title, tier, importance, important) {
  console.log('\n===== ' + title + '  (tier=' + tier + ', 重要度=' + importance + ', important=' + !!important + ') =====');
  console.log(pad('场景', 26) + num('遗忘值', 8) + num('×0.12', 9) + num('×0.20', 9) + '   变化');
  const rows = [
    ['今天刚产生', 0],
    ['3 天前', 3],
    ['10 天前', 10],
    ['10 天前 + 刚被召回(P4)', 4],
    ['30 天前', 30],
    ['90 天前', 90],
    ['90 天前 + 刚被召回(P4)', 36],
  ];
  for (const [label, ageDays] of rows) {
    const v = forgetting(tier, importance, ageDays, important);
    const o = Math.round(v * OLD), n = Math.round(v * NEW);
    console.log(pad(label, 26) + num(v, 8) + num('-' + o, 9) + num('-' + n, 9) + ('   ' + (o === n ? '' : '+' + (n - o) + ' 扣分')));
  }
  const vNew = forgetting(tier, importance, 0, important);
  const vOld = forgetting(tier, importance, 90, important);
  const dOld = Math.round(vOld * OLD) - Math.round(vNew * OLD);
  const dNew = Math.round(vOld * NEW) - Math.round(vNew * NEW);
  console.log('  --> "今天新增" vs "90天未碰" 的净分差：  0.12 = ' + dOld + ' 分      0.20 = ' + dNew + ' 分');
}

console.log('【关键参照】1 个关键词命中 = 5 分；整句命中 = 18 分；近因满分 = 12 分；翻盘临界 = 0.23');
table('普通记忆', 'normal', 60, false);
table('易忘记忆', 'fading', 40, false);
table('重要记忆（important 标记，重要度 85）', 'normal', 85, true);

console.log('\n===== 结论 =====');
console.log('  普通记忆 30 天就封顶（min(24, 天数×0.8) → 24），所以"再老也不会更老"；');
console.log('  0.20 下"新 vs 老"的净差 = 4 分，仍小于 1 个关键词匹配(5 分) → 不会翻盘，安全；');
console.log('  P4 召回只对"1~30 天内"的记忆有降遗忘效果，>30 天因封顶看不出变化。');
