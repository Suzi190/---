const fs = require('fs');
const P = 'D:/叉叉机/叉叉机/js/offline-auto-summary.js';

const PATCHES = [
  {
    name: 'sourceWindowKey',
    OLD: 'sourceWindowKey:`overview:${result.charId}`',
    NEW: 'sourceWindowKey:`overview:continue:${result.charId}`'
  },
  {
    name: 'dedupeKey',
    OLD: 'dedupeKey:`overview:${String(result.charId)}`',
    NEW: 'dedupeKey:`overview:continue:${String(result.charId)}`'
  }
];

const buf = fs.readFileSync(P);
console.log('before_bytes=' + buf.length + ' bom=' + buf[0] + ',' + buf[1] + ',' + buf[2]);
let s = buf.toString('utf8');
const beforeChars = s.length;
const beforeFFFD = (s.match(/\uFFFD/g) || []).length;

let abort = false;
for (const p of PATCHES) {
  const n = s.split(p.OLD).length - 1;
  console.log('check ' + p.name + ': occurrences=' + n);
  if (n !== 1) { abort = true; }
}
if (abort) {
  console.log('ABORT: not unique, nothing written');
  process.exit(1);
}

for (const p of PATCHES) {
  s = s.split(p.OLD).join(p.NEW);
}

fs.writeFileSync(P, s, 'utf8');

const out = fs.readFileSync(P);
const t = out.toString('utf8');
console.log('after_bytes=' + out.length + ' bom=' + out[0] + ',' + out[1] + ',' + out[2]);
console.log('chars_before=' + beforeChars + ' chars_after=' + t.length + ' delta=' + (t.length - beforeChars) + ' (expect +18)');
console.log('fffd_before=' + beforeFFFD + ' fffd_after=' + (t.match(/\uFFFD/g) || []).length);
for (const p of PATCHES) {
  console.log(p.name + ' NEW_present=' + (t.indexOf(p.NEW) !== -1) + ' OLD_gone=' + (t.indexOf(p.OLD) === -1));
}
console.log('online_key_intact_check: offline-key-without-continue count=' + (t.split('dedupeKey:`overview:${String(result.charId)}`').length - 1));
