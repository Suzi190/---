const fs = require('fs');
const P = 'D:/叉叉机/叉叉机/js/offline-auto-summary.js';

const OLD = 'const lastRound=Config.getLastContinueRound(charId),lastSession=Config.getLastContinueSession(charId),safeTotalRounds=Math.max(0,Number(totalRounds)||0);return sessionId&&lastSession&&lastSession!==sessionId||lastRound>safeTotalRounds?0:Math.max(0,Math.min(lastRound,safeTotalRounds))';

const NEW = 'const lastRound=Config.getLastContinueRound(charId),safeTotalRounds=Math.max(0,Number(totalRounds)||0);return Math.max(0,Math.min(lastRound,safeTotalRounds))';

const buf = fs.readFileSync(P);
console.log('before_bytes=' + buf.length);
console.log('before_bom=' + buf[0] + ',' + buf[1] + ',' + buf[2]);
let s = buf.toString('utf8');
const beforeChars = s.length;

const n = s.split(OLD).length - 1;
console.log('occurrences_of_OLD=' + n);
if (n !== 1) {
  console.log('ABORT: target not unique, nothing written');
  process.exit(1);
}

s = s.replace(OLD, NEW);
fs.writeFileSync(P, s, 'utf8');

const out = fs.readFileSync(P);
const t = out.toString('utf8');
console.log('after_bytes=' + out.length);
console.log('after_bom=' + out[0] + ',' + out[1] + ',' + out[2]);
console.log('chars_before=' + beforeChars + ' chars_after=' + t.length + ' delta=' + (t.length - beforeChars));
console.log('fffd_count=' + (t.match(/\uFFFD/g) || []).length);
console.log('OLD_gone=' + (t.indexOf(OLD) === -1));
console.log('NEW_present=' + (t.indexOf(NEW) !== -1));
console.log('signature_intact=' + (t.indexOf('function getSessionAwareLastContinueRound(charId,sessionId,totalRounds)') !== -1));
console.log('lastSession_gone=' + (t.indexOf('getLastContinueSession(charId),safeTotalRounds') === -1));
