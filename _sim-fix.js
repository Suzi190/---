// _sim-fix.js —— P5/P6 改动前后的遗忘值对比（决定改多少才合适）
const COEF = 0.2;

// 现状公式
function fvNow(tier, imp, days, important) {
  if (tier === 'carved') return 0;
  const ageWeight = tier === 'fading' ? 2.2 : 0.8;
  const ageLimit = tier === 'fading' ? 46 : 24;   // ← P6 要改的地方
  return Math.max(0, Math.min(100, Math.round(
    (tier === 'fading' ? 34 : 12) + 0.6 * Math.max(0, 70 - imp)
    + Math.min(ageLimit, days * ageWeight) - (important ? 8 : 0))));
}
// 改后公式（P6：普通档 24 → 40）
function fvFix(tier, imp, days, important, lim) {
  if (tier === 'carved') return 0;
  const ageWeight = tier === 'fading' ? 2.2 : 0.8;
  const ageLimit = tier === 'fading' ? 46 : lim;
  return Math.max(0, Math.min(100, Math.round(
    (tier === 'fading' ? 34 : 12) + 0.6 * Math.max(0, 70 - imp)
    + Math.min(ageLimit, days * ageWeight) - (important ? 8 : 0))));
}

const pad = (s, n) => String(s).padEnd(n);
const num = (v, n) => String(v).padStart(n);

console.log('########## P6：普通记忆（重要度60、非 important、走公式）##########');
console.log(pad('记忆年龄', 10) + num('现在(限24)', 12) + num('→扣分', 8) + num('改后(限40)', 11) + num('→扣分', 8) + num('  差值', 8));
for (const d of [0, 7, 30, 31, 45, 60, 90, 365]) {
  const a = fvNow('remembered', 60, d, false);
  const b = fvFix('remembered', 60, d, false, 40);
  const da = Math.round(a * COEF), db = Math.round(b * COEF);
  console.log(pad(d + ' 天', 10) + num(a, 12) + num('-' + da, 8) + num(b, 11) + num('-' + db, 8) + num((db - da >= 0 ? '+' : '') + (db - da), 8));
}

console.log('');
console.log('########## P6 如果更激进：限 52（65天才封顶）##########');
console.log(pad('记忆年龄', 10) + num('现在(限24)', 12) + num('改后(限52)', 11) + num('遗忘值差', 10) + num('扣分差', 8));
for (const d of [0, 30, 45, 60, 90, 365]) {
  const a = fvNow('remembered', 60, d, false);
  const b = fvFix('remembered', 60, d, false, 52);
  console.log(pad(d + ' 天', 10) + num(a, 12) + num(b, 11) + num((b - a >= 0 ? '+' : '') + (b - a), 10) + num('+' + (Math.round(b * COEF) - Math.round(a * COEF)), 8));
}

console.log('');
console.log('########## P5：群聊线下记忆（现在写死 → 改后走公式）##########');
const tiers = ['carved', 'remembered', 'fading'];
const fixed = { carved: 0, remembered: 20, fading: 70 };
console.log(pad('层级 / 年龄', 18) + num('现在(写死)', 11) + num('→扣分', 8) + num('改后(公式)', 11) + num('→扣分', 8));
for (const t of tiers) {
  for (const d of [0, 7, 30, 90]) {
    const b = fvFix(t, 60, d, false, 40);
    const a = fixed[t];
    console.log(pad(t + ' / ' + d + '天', 18) + num(a, 11) + num('-' + Math.round(a * COEF), 8) + num(b, 11) + num('-' + Math.round(b * COEF), 8));
  }
  console.log('');
}

console.log('########## 改后排序边界（60天老记忆 vs 今天新记忆）##########');
const R = 12, K = 5;
const rec = d => R * Math.exp(-d / 90);
for (const d of [30, 60, 90]) {
  const fOld = fvFix('remembered', 60, d, false, 40), fNew = fvFix('remembered', 60, 0, false, 40);
  const out = [];
  for (const kw of [1, 2, 3, 4]) {
    const diff = K * kw + (rec(d) - rec(0)) - (fOld - fNew) * COEF;
    out.push(kw + '词:' + (diff > 0 ? '+' : '') + diff.toFixed(1));
  }
  console.log('  ' + pad(d + '天老记忆', 12) + out.join('   '));
}
console.log('  （正数=老记忆赢。临界点：词数×5 + 近因差 − 遗忘差×0.2 > 0）');
