const fs = require('fs');
const P = 'D:/叉叉机/叉叉机/js/group-offline-auto-summary.js';

const PATCHES = [
  {
    name: 'A signature',
    OLD: 'const saved=await async function persistMemories(groupId,items){',
    NEW: 'const saved=await async function persistMemories(groupId,items,roundStart,roundEnd){'
  },
  {
    name: 'B call',
    OLD: '}(id,items);return Config.setLastRound(id,rounds.length)',
    NEW: '}(id,items,roundStart,roundEnd);return Config.setLastRound(id,rounds.length)'
  },
  {
    name: 'C fields',
    OLD: 'source:"group-offline-auto-summary",eventTime:Date.now()',
    NEW: 'source:"group-offline-auto-summary",offlineMode:"group-offline",sourceWindowKey:`group-offline:${groupId}:${roundStart}-${roundEnd}`,dedupeKey:`group-offline:${groupId}:${roundStart}-${roundEnd}:${count}`,eventTime:Date.now()'
  },
  {
    name: 'D rounds',
    OLD: 'targetMessages=[].concat(...targetRounds);',
    NEW: 'targetMessages=[].concat(...targetRounds),roundStart=options.forceRun?Math.max(0,rounds.length-interval):lastRound,roundEnd=roundStart+targetRounds.length;'
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
  if (n !== 1) abort = true;
}
if (abort) {
  console.log('ABORT: anchor not unique, nothing written');
  process.exit(1);
}

let expectedDelta = 0;
for (const p of PATCHES) {
  expectedDelta += p.NEW.length - p.OLD.length;
  s = s.split(p.OLD).join(p.NEW);
}

fs.writeFileSync(P, s, 'utf8');

const out = fs.readFileSync(P);
const t = out.toString('utf8');
console.log('after_bytes=' + out.length + ' bom=' + out[0] + ',' + out[1] + ',' + out[2]);
console.log('chars_before=' + beforeChars + ' chars_after=' + t.length + ' delta=' + (t.length - beforeChars) + ' expected=' + expectedDelta);
console.log('fffd_before=' + beforeFFFD + ' fffd_after=' + (t.match(/\uFFFD/g) || []).length);
for (const p of PATCHES) {
  console.log(p.name + ' OLD_gone=' + (t.indexOf(p.OLD) === -1) + ' NEW_present=' + (t.indexOf(p.NEW) !== -1));
}
console.log('has_offlineMode=' + (t.indexOf('offlineMode:"group-offline"') !== -1));
console.log('has_sourceWindowKey=' + (t.indexOf('sourceWindowKey:`group-offline:') !== -1));
console.log('has_dedupeKey=' + (t.indexOf('dedupeKey:`group-offline:') !== -1));
