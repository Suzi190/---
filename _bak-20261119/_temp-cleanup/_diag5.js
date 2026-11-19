const fs = require('fs');
const path = require('path');
const BASE = 'D:/叉叉机';

const targets = ['_recover.html', '_restored.html', '_index-broken-backup.html', '叉叉机/index.html'];

for (const t of targets) {
  const p = path.join(BASE, t);
  if (!fs.existsSync(p)) { console.log('--- ' + t + ' : NOT FOUND ---'); continue; }
  const buf = fs.readFileSync(p);
  const s = buf.toString('utf8');
  const fffd = (s.match(/\uFFFD/g) || []).length;
  const baseDir = path.dirname(p);

  const linkRe = /<link[^>]*href="([^"]+)"[^>]*>/gi;
  let m, ok = 0, miss = 0;
  const misses = [];
  while ((m = linkRe.exec(s))) {
    const h = m[1].split('?')[0];
    if (/^(https?:|data:)/.test(h)) continue;
    const rel = h.replace(/^\.\//, '');
    if (fs.existsSync(path.join(baseDir, rel))) ok++; else { miss++; misses.push(h); }
  }
  const srcRe = /<script[^>]*src="([^"]+)"/gi;
  let sok = 0, smiss = 0;
  const smisses = [];
  while ((m = srcRe.exec(s))) {
    const h = m[1].split('?')[0];
    if (/^(https?:|data:)/.test(h)) continue;
    const rel = h.replace(/^\.\//, '');
    if (fs.existsSync(path.join(baseDir, rel))) sok++; else { smiss++; smisses.push(h); }
  }

  console.log('--- ' + t + ' ---');
  console.log('  bytes=' + buf.length + ' chars=' + s.length + ' fffd=' + fffd);
  console.log('  css  OK=' + ok + ' MISS=' + miss + (miss ? '  e.g. ' + misses.slice(0, 3).join(', ') : ''));
  console.log('  js   OK=' + sok + ' MISS=' + smiss + (smiss ? '  e.g. ' + smisses.slice(0, 3).join(', ') : ''));
}
