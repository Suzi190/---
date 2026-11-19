// _sim-order.js —— 精确算"老记忆 vs 新记忆"的排序边界（含近因加分，不只是遗忘扣分）
// 差异只来自三处：关键词命中 / 近因 / 遗忘；两条记忆同 anchor、同类型、同重要度(60)
const K = 5;      // 每个关键词命中 +5
const R = 12;     // 近因满分
function recency(days) { return Number((R * Math.exp(-days / 90)).toFixed(2)); }
// 真实公式（重要度 60、非 important、普通 tier）：12 + 0.6*(70-60) + min(24, 天数*0.8)
function forgetting(days) { return Math.round(Math.max(0, Math.min(100, 12 + 6 + Math.min(24, days * 0.8)))); }

function delta(keywordsOld, ageOld, coef) {
  const fOld = forgetting(ageOld), fNew = forgetting(0);
  const sOld = K * keywordsOld + recency(ageOld) - fOld * coef;
  const sNew = 0 + recency(0) - fNew * coef;
  return { d: Number((sOld - sNew).toFixed(2)), fOld, fNew };
}

console.log('【遗忘值】今天 = ' + forgetting(0) + '，7天 = ' + forgetting(7) + '，30天 = ' + forgetting(30) + '，90天 = ' + forgetting(90));
console.log('【近因】今天 = ' + recency(0) + '，7天 = ' + recency(7) + '，30天 = ' + recency(30) + '  → 新记忆天然白拿 3.4 分（30天对比）');
console.log('');

const cases = [
  ['30天老记忆 命中0个关键词', 0, 30],
  ['30天老记忆 命中1个关键词', 1, 30],
  ['30天老记忆 命中2个关键词', 2, 30],
  ['30天老记忆 命中3个关键词', 3, 30],
  ['7天老记忆  命中0个关键词', 0, 7],
  ['7天老记忆  命中1个关键词', 1, 7],
  ['7天老记忆  命中2个关键词', 2, 7],
];
const pad = (s, n) => String(s).padEnd(n);
const num = (v, n) => String(v).padStart(n);

for (const coef of [0.12, 0.2, 0.3]) {
  console.log('===== 系数 ' + coef + ' =====');
  console.log('  ' + pad('场景（对手 = 今天新增、零命中）', 30) + num('分差', 8) + '   结果');
  for (const [label, kw, age] of cases) {
    const r = delta(kw, age, coef);
    console.log('  ' + pad(label, 30) + num((r.d > 0 ? '+' : '') + r.d, 8) + '   ' + (r.d > 0 ? '老记忆赢 ' + r.d : '新记忆赢 ' + (-r.d)));
  }
  console.log('');
}

