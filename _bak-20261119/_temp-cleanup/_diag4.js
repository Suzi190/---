const fs = require('fs');
const path = require('path');
const ROOT = 'D:/叉叉机/叉叉机';

console.log('=== CSS files ===');
const cssDir = path.join(ROOT, 'css');
for (const f of fs.readdirSync(cssDir)) {
  const p = path.join(cssDir, f);
  if (!fs.statSync(p).isFile()) continue;
  const buf = fs.readFileSync(p);
  const s = buf.toString('utf8');
  const fffd = (s.match(/\uFFFD/g) || []).length;
  const ob = s.split('{').length - 1;
  const cb = s.split('}').length - 1;
  console.log(f + ' | bytes=' + buf.length + ' | fffd=' + fffd + ' | braces=' + ob + '/' + cb + ' | tail=' + JSON.stringify(s.slice(-50)));
}

console.log('');
console.log('=== index.html <link> refs ===');
const html = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
const linkRe = /<link[^>]*href="([^"]+)"/g;
let m;
const links = [];
while ((m = linkRe.exec(html))) links.push(m[1]);
console.log('count=' + links.length);
for (const h of links) {
  const rel = h.replace(/^\.\//, '');
  if (/^(https?:|data:)/.test(rel)) { console.log('  EXT   ' + h); continue; }
  const p = path.join(ROOT, rel);
  console.log('  ' + (fs.existsSync(p) ? 'OK   ' : 'MISS ') + h);
}

console.log('');
console.log('=== index.html <script src> refs ===');
const srcRe = /<script[^>]*src="([^"]+)"/g;
const srcs = [];
while ((m = srcRe.exec(html))) srcs.push(m[1]);
console.log('count=' + srcs.length);
for (const h of srcs) {
  const rel = h.replace(/^\.\//, '');
  if (/^(https?:|data:)/.test(rel)) { console.log('  EXT   ' + h); continue; }
  const p = path.join(ROOT, rel);
  console.log('  ' + (fs.existsSync(p) ? 'OK   ' : 'MISS ') + h);
}
