const fs = require('fs');
const P = 'D:/叉叉机/叉叉机/js/offline-auto-summary.js';

const OLD = 'return Math.max(0,Math.min(lastRound,safeTotalRounds))}const Engine=';
const NEW = 'return lastRound>safeTotalRounds?0:Math.max(0,Math.min(lastRound,safeTotalRounds))}const Engine=';

const buf = fs.readFileSync(P);
console.log('before_bytes=' + buf.length);
let s = buf.toString('utf8');
const beforeChars = s.length;
const beforeFFFD = (s.match(/\uFFFD/g) || []).length;

const n = s.split(OLD).length - 1;
console.log('anchor occurrences=' + n);
if (n !== 1) {
  console.log('ABORT: anchor not unique');
  process.exit(1);
}

s = s.split(OLD).join(NEW);
fs.writeFileSync(P, s, 'utf8');

const out = fs.readFileSync(P);
const t = out.toString('utf8');
console.log('after_bytes=' + out.length + ' delta=' + (t.length - beforeChars) + ' expected=' + (NEW.length - OLD.length));
console.log('bom=' + out[0] + ',' + out[1] + ',' + out[2]);
console.log('fffd_before=' + beforeFFFD + ' fffd_after=' + (t.match(/\uFFFD/g) || []).length);
console.log('NEW_present=' + (t.indexOf(NEW) !== -1));
console.log('old_logic_gone=' + (t.indexOf('return Math.max(0,Math.min(lastRound,safeTotalRounds))}const Engine=') === -1));
