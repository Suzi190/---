const fs = require('fs');
const AI = 'D:/叉叉机/叉叉机/js/app-init.js';

const NEW_METHODS = [
  'markSupersededForPromptBlock(memories=[]){return(Array.isArray(memories)?memories:[]).map(m=>{if(!m||"object"!=typeof m)return m;if("superseded"!==String(m?.status||"").trim().toLowerCase())return m;const t=String(m?.content||"").trim();return t?{...m,content:`（这是以前的说法，后来变了）${t}`}:m})}',
  'async applyMemoryInvalidations(charId,hints=[],options={}){try{const list=(Array.isArray(hints)?hints:[]).map(item=>"string"==typeof item?{oldHint:item.trim(),reason:""}:{oldHint:String(item?.oldHint||item?.memory||item?.hint||"").trim(),reason:String(item?.reason||"").trim()}).filter(item=>item.oldHint.length>=4);if(!list.length)return 0;const memories=Array.isArray(options?.memories)?options.memories:await this.getMemories(charId),candidates=(Array.isArray(memories)?memories:[]).filter(m=>m&&"object"==typeof m).filter(m=>"superseded"!==String(m?.status||"").trim().toLowerCase()).filter(m=>{const t=String(m?.type||"").trim().toLowerCase();return"overview"!==t&&"summary"!==t}).filter(m=>"manual"!==String(m?.source||"").trim().toLowerCase());if(!candidates.length)return 0;let marked=0;const nowAt=Date.now();for(const hint of list){const hintText=this.normalizeMemoryCompareText(hint.oldHint),hintKeywords=this.extractTopKeywordsFromText(hint.oldHint,10);if(!hintText)continue;let best=null,bestRate=0;for(const memory of candidates){if(memory.__invalidated)continue;const contentText=this.normalizeMemoryCompareText(String(memory?.content||""));if(!contentText)continue;let rate=0;if(hintKeywords.length){const hit=hintKeywords.filter(k=>contentText.includes(k)).length;rate=hit/hintKeywords.length}else if(contentText.includes(hintText)||hintText.includes(contentText))rate=1;if(rate>=.5&&rate>bestRate){best=memory;bestRate=rate}}if(!best)continue;try{await db.longTermMemories.update(best.id,{status:"superseded",validUntil:nowAt,supersededBy:String(options?.newMemoryId||""),supersededReason:hint.reason||hint.oldHint,invalidatedAt:nowAt}),best.__invalidated=!0,marked++}catch(_){}}return marked}catch(_){return 0}},'
].join('');

const patches = [
  {
    name: 'insert markSupersededForPromptBlock + applyMemoryInvalidations',
    OLD: 'getMemoryRecencyBonus(memory,options={}){',
    NEW: NEW_METHODS + 'getMemoryRecencyBonus(memory,options={}){'
  },
  {
    name: 'superseded downweight x0.35 in score',
    OLD: 'score+=this.getMemoryRecencyBonus(memory,options),',
    NEW: 'score+=this.getMemoryRecencyBonus(memory,options),"superseded"===String(memory?.status||"").trim().toLowerCase()&&(score=Math.round(35*score/100)),'
  },
  {
    name: 'annotate superseded at prompt render entry',
    OLD: 'appMemories=this.getMemoryAppPromptMemories(sourceMemories,contextMessages,{limit:options?.limit||28});',
    NEW: 'appMemories=this.markSupersededForPromptBlock(this.getMemoryAppPromptMemories(sourceMemories,contextMessages,{limit:options?.limit||28}));'
  }
];

const buf = fs.readFileSync(AI);
let s = buf.toString('utf8');
const beforeChars = s.length;
let expectedDelta = 0, abort = false;
for (const p of patches) {
  const n = s.split(p.OLD).length - 1;
  console.log('[' + p.name + '] occurrences=' + n);
  if (n !== 1) abort = true;
  expectedDelta += (p.NEW.length - p.OLD.length) * n;
}
if (abort) { console.log('ABORT: anchor not unique'); process.exit(1); }
for (const p of patches) s = s.split(p.OLD).join(p.NEW);
fs.writeFileSync(AI, s, 'utf8');
const out = fs.readFileSync(AI);
const t = out.toString('utf8');
console.log('bytes ' + buf.length + ' -> ' + out.length + ' (delta ' + (out.length - buf.length) + ', expected ' + expectedDelta + ')');
console.log('bom=' + out[0] + ',' + out[1] + ',' + out[2] + ' fffd=' + (t.match(/\uFFFD/g) || []).length);
console.log('chars ' + beforeChars + ' -> ' + t.length + ' delta=' + (t.length - beforeChars));
