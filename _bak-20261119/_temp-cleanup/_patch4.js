const fs = require('fs');
const P = 'D:/叉叉机/叉叉机/js/group-offline-auto-summary.js';

const OLD = '}(id,items,roundStart,roundEnd);return Config.setLastRound(id,rounds.length)';
const NEW = '}(id,items,roundStart,roundEnd);return Config.setLastRound(id,roundEnd)';

const buf = fs.readFileSync(P);
console.log('before_bytes=' + buf.length + ' bom=' + buf[0] + ',' + buf[1] + ',' + buf[2]);
let s = buf.toString('utf8');
const beforeChars = s.length;

const n = s.split(OLD).length - 1;
console.log('occurrences=' + n);
if (n !== 1) {
  console.log('ABORT: anchor not unique, nothing written');
  process.exit(1);
}

s = s.replace(OLD, NEW);
fs.writeFileSync(P, s, 'utf8');

const out = fs.readFileSync(P);
const t = out.toString('utf8');
console.log('after_bytes=' + out.length + ' bom=' + out[0] + ',' + out[1] + ',' + out[2]);
console.log('chars_before=' + beforeChars + ' chars_after=' + t.length + ' delta=' + (t.length - beforeChars) + ' expected=-7');
console.log('fffd=' + (t.match(/\uFFFD/g) || []).length);
console.log('OLD_gone=' + (t.indexOf(OLD) === -1));
console.log('NEW_present=' + (t.indexOf(NEW) !== -1));
console.log('leftover_rounds_length_in_setLastRound=' + (t.split('setLastRound(id,rounds.length)').length - 1));
