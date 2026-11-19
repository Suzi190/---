const fs = require('fs');
const F = 'D:/叉叉机/叉叉机/js/offline-auto-summary.js';

const patches = [
  {
    name: 'normalizeAutoExtraction add invalidates',
    OLD: 'highLevelOverview:normalizeExtractedMemoryItem(source.highLevelOverview||source.overview||source.globalOverview)||null}}',
    NEW: 'highLevelOverview:normalizeExtractedMemoryItem(source.highLevelOverview||source.overview||source.globalOverview)||null,invalidates:(Array.isArray(source.invalidates)?source.invalidates:[]).map(item=>"string"==typeof item?item.trim():String(item?.oldHint||item?.memory||item?.hint||"").trim()).filter(Boolean).slice(0,3)}}'
  },
  {
    name: 'prompt add invalidates rule',
    OLD: '\\n- 直接输出 JSON 对象，不要解释',
    NEW: '\\n- invalidates：若本次新内容明确推翻了【已有记忆】里的某条（改口、更正、立场反转，例如以前讨厌现在喜欢），把被推翻那条的大意写进 invalidates 数组（字符串数组）；没有就输出 []\\n- 直接输出 JSON 对象，不要解释'
  },
  {
    name: 'trigger invalidation after continue write loop',
    OLD: '||addedEventCount++}return LastViewTarget.continue=',
    NEW: '||addedEventCount++}try{const invalidationHints=Array.isArray(extraction.invalidates)?extraction.invalidates:[];invalidationHints.length&&"function"==typeof MemoryManager?.applyMemoryInvalidations&&(await MemoryManager.applyMemoryInvalidations(result.charId,invalidationHints))}catch(_){}return LastViewTarget.continue='
  }
];

const buf = fs.readFileSync(F);
let s = buf.toString('utf8');
const beforeChars = s.length;
let expected = 0, abort = false;
for (const p of patches) {
  const n = s.split(p.OLD).length - 1;
  console.log('[' + p.name + '] occurrences=' + n);
  if (n !== 1) abort = true;
  expected += (p.NEW.length - p.OLD.length) * n;
}
if (abort) { console.log('ABORT: anchor not unique'); process.exit(1); }
for (const p of patches) s = s.split(p.OLD).join(p.NEW);
fs.writeFileSync(F, s, 'utf8');
const out = fs.readFileSync(F);
const t = out.toString('utf8');
console.log('bytes ' + buf.length + ' -> ' + out.length + ' (delta ' + (out.length - buf.length) + ')');
console.log('chars ' + beforeChars + ' -> ' + t.length + ' (delta ' + (t.length - beforeChars) + ', expected ' + expected + ')');
console.log('bom=' + out[0] + ',' + out[1] + ',' + out[2] + ' fffd=' + (t.match(/\uFFFD/g) || []).length);
try {
  new (require('vm').Script)(t, { filename: 'offline-auto-summary.js' });
  console.log('VM_SYNTAX_OK');
} catch (e) {
  console.log('VM_SYNTAX_FAIL: ' + e.message);
}
