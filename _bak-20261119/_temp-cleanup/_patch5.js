const fs = require('fs');
const P = 'D:/叉叉机/叉叉机/js/app-init.js';

const PATCHES = [
  {
    name: 'A timeline-filter',
    OLD: 'if(!msg||"user"!==msg.role&&"char"!==msg.role)return null;',
    NEW: 'if(!msg||"user"!==msg.role&&"char"!==msg.role)return null;if(msg.isOfflineMsg||msg.isOfflineSeparator||msg.fromOffline||msg.offlineContinue||msg.fromOfflineBridge)return null;'
  },
  {
    name: 'B progress-filter',
    OLD: 'const source=String(memory?.source||"").trim().toLowerCase(),windowKey=String(memory?.sourceWindowKey||"").trim().toLowerCase();return sourceMarkers',
    NEW: 'const source=String(memory?.source||"").trim().toLowerCase(),windowKey=String(memory?.sourceWindowKey||"").trim().toLowerCase(),offlineTrack=String(memory?.offlineMode||"").trim();if(offlineTrack||windowKey.startsWith("offline-continue:")||windowKey.startsWith("offline-theater:")||windowKey.startsWith("group-offline:")||windowKey.startsWith("overview:continue:"))return maxRound;return sourceMarkers'
  }
];

const buf = fs.readFileSync(P);
console.log('before_bytes=' + buf.length + ' bom=' + buf[0] + ',' + buf[1] + ',' + buf[2]);
let s = buf.toString('utf8');
const beforeChars = s.length;
const beforeFFFD = (s.match(/\uFFFD/g) || []).length;

let abort = false;
let expectedDelta = 0;
for (const p of PATCHES) {
  const n = s.split(p.OLD).length - 1;
  console.log('check ' + p.name + ': occurrences=' + n);
  if (n !== 1) abort = true;
  expectedDelta += p.NEW.length - p.OLD.length;
}
if (abort) {
  console.log('ABORT: anchor not unique, nothing written');
  process.exit(1);
}

for (const p of PATCHES) {
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
