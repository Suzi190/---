// 用法: node _grep.js <pattern> [目录] [每文件最多显示条数]
const fs = require('fs');
const path = require('path');
const pat = process.argv[2];
const dir = process.argv[3] || 'D:/叉叉机/叉叉机/js';
const maxPerFile = Number(process.argv[4] || 3);
const outFile = process.argv[5] || 'D:/叉叉机/_grep-out.txt';
if (!pat) { console.log('need pattern'); process.exit(1); }

const isSingle = fs.statSync(dir).isFile();
const baseDir = isSingle ? path.dirname(dir) : dir;
const files = isSingle ? [path.basename(dir)] : fs.readdirSync(dir).filter(f => f.endsWith('.js') || f.endsWith('.html'));
let re;
try { re = new RegExp(pat, 'g'); } catch (e) { console.log('bad regex'); process.exit(1); }

let out = [], totalHits = 0, filesHit = 0;
for (const f of files) {
  const p = path.join(baseDir, f);
  let s;
  try { s = fs.readFileSync(p, 'utf8'); } catch (e) { continue; }
  const hits = [];
  let m;
  re.lastIndex = 0;
  while ((m = re.exec(s)) !== null) {
    hits.push(m.index);
    if (m.index === re.lastIndex) re.lastIndex++;
  }
  if (!hits.length) continue;
  filesHit++;
  totalHits += hits.length;
  out.push('\n### ' + f + '  (' + hits.length + ' hits)');
  hits.slice(0, maxPerFile).forEach(i => {
    const seg = s.slice(Math.max(0, i - 130), i + 200).replace(/\r?\n/g, ' ');
    out.push('  @' + i + ' … ' + seg);
  });
  if (hits.length > maxPerFile) out.push('  … +' + (hits.length - maxPerFile) + ' more in this file');
}
out.push('\n== total ' + totalHits + ' hits in ' + filesHit + ' files ==');
const txt = out.join('\n');
fs.writeFileSync(outFile, txt, 'utf8');
console.log('written ' + txt.length + ' chars -> ' + outFile + '  (total ' + totalHits + ' hits / ' + filesHit + ' files)');
