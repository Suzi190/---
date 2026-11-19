const fs = require('fs');
const vm = require('vm');

const JS = 'D:/叉叉机/叉叉机/js/';
const BAK = 'D:/叉叉机/_bak-20261119/';

function load(p) { return fs.readFileSync(p, 'utf8'); }
function cnt(s, k) { return s.split(k).length - 1; }

const files = ['app-init.js', 'chat-features.js', 'offline-auto-summary.js', 'group-offline-auto-summary.js'];
console.log('=== 1. syntax / bytes / bom / badchars ===');
for (const f of files) {
  const p = JS + f;
  const buf = fs.readFileSync(p);
  const s = buf.toString('utf8');
  let ok = 'OK';
  try { new vm.Script(s, { filename: f }); } catch (e) { ok = 'FAIL:' + e.message; }
  console.log('  ' + f.padEnd(32) + ok.padEnd(6) + ' bytes=' + String(buf.length).padStart(7) + ' bom=' + (buf[0] === 0xEF) + ' fffd=' + cnt(s, '\uFFFD'));
}

console.log('');
console.log('=== 2. P1 markers ===');
const ai = load(JS + 'app-init.js');
const cf = load(JS + 'chat-features.js');
const of = load(JS + 'offline-auto-summary.js');
console.log('  includeTopK:!0                  = ' + cnt(cf, 'includeTopK:!0') + '  (expect 1)');
console.log('  getMemoryRecencyBonus           = ' + cnt(ai, 'getMemoryRecencyBonus') + '  (expect 2: def+call)');

console.log('');
console.log('=== 3. P2 markers ===');
console.log('  invalidates prompt rule (app-init)  = ' + cnt(ai, 'invalidates：若本次新内容明确推翻') + '  (expect 2)');
console.log('  invalidates prompt rule (offline)   = ' + cnt(of, 'invalidates：若本次新内容明确推翻') + '  (expect 1)');
console.log('  applyMemoryInvalidations (app-init) = ' + cnt(ai, 'applyMemoryInvalidations') + '  (expect 2)');
console.log('  applyMemoryInvalidations (offline)  = ' + cnt(of, 'applyMemoryInvalidations') + '  (expect 2)');
console.log('  markSupersededForPromptBlock        = ' + cnt(ai, 'markSupersededForPromptBlock') + '  (expect 2)');
console.log('  superseded downweight               = ' + cnt(ai, 'Math.round(35*score/100)') + '  (expect 1)');

console.log('');
console.log('=== 4. P3 markers ===');
console.log('  forgetting wired into score     = ' + cnt(ai, 'getMemoryForgettingValue(memory)*.2') + '  (expect 1)');
console.log('  [old .12 marker must be gone]   = ' + cnt(ai, 'getMemoryForgettingValue(memory)*.12') + '  (expect 0)');
console.log('  lastAccessAt hook               = ' + cnt(ai, 'Number(memory?.lastAccessAt)||0') + '  (expect 1)');

console.log('');
console.log('=== 4b. tuned params (industry standard) ===');
const me = load(JS + 'managers-extra.js');
const gs = load(JS + 'group-offline-auto-summary.js');
console.log('  forgetting coef .2 (not .12)    = ' + cnt(ai, 'getMemoryForgettingValue(memory)*.2') + '  (expect 1)');
console.log('  extract temp .4 / app-init      = ' + cnt(ai, 'temperature:.4,tokenCategory:"memory"') + '  (expect 1)');
console.log('  extract temp .7 / app-init      = ' + cnt(ai, 'temperature:.7,tokenCategory:"memory"') + '  (expect 0)');
console.log('  extract temp .4 / offline (x2)  = ' + cnt(of, 'temperature:.4,tokenCategory:"memory"') + '  (expect 2)');
console.log('  extract temp .7 / offline       = ' + cnt(of, 'temperature:.7,tokenCategory:"memory"') + '  (expect 0)');
console.log('  extract temp .4 / group         = ' + cnt(gs, 'temperature:.4,tokenCategory:"memory"') + '  (expect 1)');
console.log('  extract temp .7 / group         = ' + cnt(gs, 'temperature:.7,tokenCategory:"memory"') + '  (expect 0)');
console.log('  extract temp .4 / repair-memory = ' + cnt(me, 'temperature:.4,max_tokens:1e3,tokenCategory:"memory"') + '  (expect 1)');
console.log('  extract temp .7 / repair-memory = ' + cnt(me, 'temperature:.7,max_tokens:1e3,tokenCategory:"memory"') + '  (expect 0)');

console.log('');
console.log('=== 4c. P5/P6 fix guards ===');
console.log('  P6 aging cap raised to 40      = ' + cnt(ai, 'ageLimit="fading"===tier?46:40') + '  (expect 1)');
console.log('  P6 old cap 24 must be gone     = ' + cnt(ai, 'ageLimit="fading"===tier?46:24') + '  (expect 0)');
console.log('  P5 group: no frozen forgetting = ' + cnt(gs, 'forgettingScore') + '  (expect 0)');
console.log('  P5 group: no dead forgetting=  = ' + cnt(gs, 'forgetting=') + '  (expect 0)');
console.log('  P5 group: keeps retentionTier  = ' + cnt(gs, 'retentionTier:tier') + '  (expect 1)');

console.log('');
console.log('=== 4d. DOM id uniqueness (index.html) ===');
const HTML_PATH = 'D:/叉叉机/叉叉机/index.html';
const ih = load(HTML_PATH);
const allIds = [...ih.matchAll(/\sid=["']([^"']+)["']/g)].map(m => m[1]);
const idMap = Object.create(null);
for (const x of allIds) idMap[x] = (idMap[x] || 0) + 1;
const dupIds = Object.keys(idMap).filter(k => idMap[k] > 1);
console.log('  total ids                      = ' + allIds.length);
console.log('  duplicate ids                  = ' + dupIds.length + '  (expect 0)' + (dupIds.length ? ' -> ' + dupIds.join(', ') : ''));
console.log('  qzone diary title id           = ' + cnt(ih, 'id="qzone-diary-detail-title"') + '  (expect 1)');
console.log('  user diary title id            = ' + cnt(ih, 'id="diary-detail-title"') + '  (expect 1)');

console.log('');
console.log('=== 5. chinese keyword regression (vs backups) ===');
const pairs = [
  ['app-init.js', 'app-init.beforeP1.js'],
  ['offline-auto-summary.js', 'offline-auto-summary.beforeP2.js']
];
const kws = ['记忆', '关系', '总结', '概览', '时间线'];
for (const [cur, bak] of pairs) {
  const a = load(JS + cur), b = load(BAK + bak);
  const row = kws.map(k => k + ' ' + cnt(a, k) + '/' + cnt(b, k)).join('   ');
  console.log('  ' + cur + '\n    ' + row);
}

console.log('');
console.log('=== 6. no accidental file loss ===');
console.log('  index.html exists   = ' + fs.existsSync('D:/叉叉机/叉叉机/index.html'));
console.log('  css dir count       = ' + fs.readdirSync('D:/叉叉机/叉叉机/css').length);
console.log('  js dir count        = ' + fs.readdirSync('D:/叉叉机/叉叉机/js').length);
