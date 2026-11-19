const fs = require('fs');

const CF = 'D:/叉叉机/叉叉机/js/chat-features.js';
const AI = 'D:/叉叉机/叉叉机/js/app-init.js';

function apply(file, patches, label) {
  const buf = fs.readFileSync(file);
  let s = buf.toString('utf8');
  const beforeChars = s.length;
  const beforeFFFD = (s.match(/\uFFFD/g) || []).length;
  let expectedDelta = 0;
  let abort = false;
  for (const p of patches) {
    const n = s.split(p.OLD).length - 1;
    console.log('  [' + label + '] ' + p.name + ' occurrences=' + n);
    if (n !== 1) abort = true;
    expectedDelta += (p.NEW.length - p.OLD.length) * n;
  }
  if (abort) {
    console.log('  ABORT ' + label + ': anchor not unique, file NOT written');
    return false;
  }
  for (const p of patches) s = s.split(p.OLD).join(p.NEW);
  fs.writeFileSync(file, s, 'utf8');
  const out = fs.readFileSync(file);
  const t = out.toString('utf8');
  console.log('  [' + label + '] bytes ' + buf.length + ' -> ' + out.length + ' (delta ' + (out.length - buf.length) + ', expected ' + expectedDelta + ')');
  console.log('  [' + label + '] bom=' + out[0] + ',' + out[1] + ',' + out[2] + ' fffd ' + beforeFFFD + ' -> ' + (t.match(/\uFFFD/g) || []).length);
  console.log('  [' + label + '] chars ' + beforeChars + ' -> ' + t.length + ' delta=' + (t.length - beforeChars));
  return true;
}

console.log('=== P1-a: chat-features.js enable includeTopK ===');
apply(CF, [
  { name: 'includeTopK !1 -> !0', OLD: 'includeSummary:!0,includeTopK:!1,includeHiddenTimeline:!1', NEW: 'includeSummary:!0,includeTopK:!0,includeHiddenTimeline:!1' }
], 'CF');

console.log('=== P1-b: app-init.js add recency scoring ===');
apply(AI, [
  {
    name: 'new getMemoryRecencyBonus method',
    OLD: 'scoreMemoryForAppPrompt(memory,contextMessages=[],options={}){',
    NEW: 'getMemoryRecencyBonus(memory,options={}){try{const memoryTs=this.getMemoryOrderValue(memory,0);if(!(Number.isFinite(memoryTs)&&memoryTs>0))return 0;const nowTs=Number.isFinite(Number(options?.now))?Number(options.now):Date.now(),ageDays=Math.max(0,(nowTs-memoryTs)/864e5),retention=String(memory?.retentionTier||"").trim().toLowerCase();return"carved"===retention?12:Number((12*Math.exp(-ageDays/90)).toFixed(2))}catch(_){return 0}},scoreMemoryForAppPrompt(memory,contextMessages=[],options={}){'
  },
  {
    name: 'apply recency into score',
    OLD: 'asksDate&&Number.isFinite(explicitDate)&&(score+=16),',
    NEW: 'asksDate&&Number.isFinite(explicitDate)&&(score+=16),score+=this.getMemoryRecencyBonus(memory,options),'
  }
], 'AI');
