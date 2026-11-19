const fs = require('fs');
const AI = 'D:/叉叉机/叉叉机/js/app-init.js';

const buf = fs.readFileSync(AI);
let s = buf.toString('utf8');
const beforeChars = s.length;
const beforeBytes = buf.length;

// ---- patch 1: trigger invalidation right after keyMemories write loop ----
const A1_OLD = '"created"===saved?._writeAction&&addedCount++}let goalUpdateCount';
const A1_NEW = '"created"===saved?._writeAction&&addedCount++}try{const invalidationHints=Array.isArray(normalizedExtraction.invalidates)?normalizedExtraction.invalidates:[];invalidationHints.length&&(await this.applyMemoryInvalidations(charId,invalidationHints))}catch(_){}let goalUpdateCount';

// ---- patch 2: add invalidates rule into every prompt output-requirements block ----
const A2_OLD = '\\n- 直接输出 JSON 对象，不要解释';
const A2_NEW = '\\n- invalidates：若本次新内容明确推翻了【已有记忆】里的某条（改口、更正、立场反转，例如以前讨厌现在喜欢），把被推翻那条的大意写进 invalidates 数组（字符串数组）；没有就输出 []\\n- 直接输出 JSON 对象，不要解释';

const n1 = s.split(A1_OLD).length - 1;
const n2 = s.split(A2_OLD).length - 1;
console.log('patch1 loop-trigger occurrences=' + n1 + ' (require 1)');
console.log('patch2 prompt-rule occurrences=' + n2 + ' (require >=1)');
if (n1 !== 1 || n2 < 1) { console.log('ABORT'); process.exit(1); }

s = s.split(A1_OLD).join(A1_NEW);
s = s.split(A2_OLD).join(A2_NEW);

fs.writeFileSync(AI, s, 'utf8');
const out = fs.readFileSync(AI);
const t = out.toString('utf8');
const expectedChars = (A1_NEW.length - A1_OLD.length) + (A2_NEW.length - A2_OLD.length) * n2;
console.log('bytes ' + beforeBytes + ' -> ' + out.length + ' (delta ' + (out.length - beforeBytes) + ')');
console.log('chars ' + beforeChars + ' -> ' + t.length + ' (delta ' + (t.length - beforeChars) + ', expected ' + expectedChars + ')');
console.log('bom=' + out[0] + ',' + out[1] + ',' + out[2] + ' fffd=' + (t.match(/\uFFFD/g) || []).length);
try {
  new (require('vm').Script)(t, { filename: 'app-init.js' });
  console.log('VM_SYNTAX_OK');
} catch (e) {
  console.log('VM_SYNTAX_FAIL: ' + e.message);
}
