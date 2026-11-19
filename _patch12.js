const fs = require('fs');
const AI = 'D:/叉叉机/叉叉机/js/app-init.js';
const BAK = 'D:/叉叉机/_bak-20261119/app-init.beforeP3.js';

fs.copyFileSync(AI, BAK);
console.log('backup -> ' + BAK + ' (' + fs.statSync(BAK).size + ' bytes)');

const patches = [
  {
    name: 'P3-a: wire forgetting value into recall scoring',
    OLD: '"superseded"===String(memory?.status||"").trim().toLowerCase()&&(score=Math.round(35*score/100)),',
    NEW: '"superseded"===String(memory?.status||"").trim().toLowerCase()&&(score=Math.round(35*score/100)),(()=>{try{score-=Math.round(getMemoryForgettingValue(memory)*.12)}catch(_){}})(),'
  },
  {
    name: 'P3-b: forgetting age respects lastAccessAt (spacing effect hook)',
    OLD: 'const importance=getMemoryImportanceValue(memory),ageDays=getMemoryAgeDays(memory),',
    NEW: 'const importance=getMemoryImportanceValue(memory),lastAccessTs=Number(memory?.lastAccessAt)||0,ageDays=getMemoryAgeDays(lastAccessTs>0?{...memory,eventTime:lastAccessTs}:memory),'
  }
];

const buf = fs.readFileSync(AI);
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
fs.writeFileSync(AI, s, 'utf8');

const out = fs.readFileSync(AI);
const t = out.toString('utf8');
console.log('bytes ' + buf.length + ' -> ' + out.length + ' (delta ' + (out.length - buf.length) + ')');
console.log('chars ' + beforeChars + ' -> ' + t.length + ' (delta ' + (t.length - beforeChars) + ', expected ' + expected + ')');
console.log('bom=' + out[0] + ',' + out[1] + ',' + out[2] + ' fffd=' + (t.match(/\uFFFD/g) || []).length);
try {
  new (require('vm').Script)(t, { filename: 'app-init.js' });
  console.log('VM_SYNTAX_OK');
} catch (e) {
  console.log('VM_SYNTAX_FAIL: ' + e.message);
}
