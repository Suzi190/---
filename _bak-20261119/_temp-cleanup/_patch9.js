const fs = require('fs');
const AI = 'D:/叉叉机/叉叉机/js/app-init.js';

const buf = fs.readFileSync(AI);
let s = buf.toString('utf8');
const OLD = ':m})}async applyMemoryInvalidations(charId,hints=[],options={}){';
const NEW = ':m})},async applyMemoryInvalidations(charId,hints=[],options={}){';
const n = s.split(OLD).length - 1;
console.log('missing-comma occurrences=' + n);
if (n !== 1) { console.log('ABORT'); process.exit(1); }
s = s.split(OLD).join(NEW);
fs.writeFileSync(AI, s, 'utf8');
const out = fs.readFileSync(AI);
const t = out.toString('utf8');
console.log('bytes ' + buf.length + ' -> ' + out.length + ' (delta ' + (out.length - buf.length) + ', expected 1)');
console.log('bom=' + out[0] + ',' + out[1] + ',' + out[2] + ' fffd=' + (t.match(/\uFFFD/g) || []).length);
try {
  new (require('vm').Script)(t, { filename: 'app-init.js' });
  console.log('VM_SYNTAX_OK');
} catch (e) {
  console.log('VM_SYNTAX_FAIL: ' + e.message);
}
