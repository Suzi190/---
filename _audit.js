// _audit.js —— 全局体检：脚本加载链路 / 缺失文件 / 未定义全局函数 / 重复 ID
const fs = require('fs');
const path = require('path');

const ROOT = 'D:/叉叉机/叉叉机';
const JS = ROOT + '/js/';
const read = p => fs.readFileSync(p, 'utf8');
const exists = p => fs.existsSync(p);

const html = read(ROOT + '/index.html');
const ll = read(JS + 'lazy-loader.js');
const dirFiles = fs.readdirSync(JS).filter(f => f.endsWith('.js'));

// ---------- 1. index.html 的 script / link ----------
console.log('=== 1. index.html 引用的资源 ===');
const htmlScripts = [...html.matchAll(/<script[^>]*\ssrc=["']([^"']+)["']/gi)].map(m => m[1]);
const htmlLinks = [...html.matchAll(/<link[^>]*\shref=["']([^"']+)["']/gi)].map(m => m[1]).filter(h => !/^(https?:)?\/\//.test(h));
let bad = 0;
for (const s of htmlScripts) {
  const p = path.join(ROOT, s.split('?')[0]);
  if (!exists(p)) { console.log('  [缺失] script ' + s); bad++; }
}
for (const l of htmlLinks) {
  const p = path.join(ROOT, l.split('?')[0]);
  if (!exists(p)) { console.log('  [缺失] link ' + l); bad++; }
}
console.log('  script ' + htmlScripts.length + ' 个, link ' + htmlLinks.length + ' 个, 缺失 ' + bad + ' 个');

// ---------- 2. lazy-loader 注册的所有 js ----------
const llRefs = [...ll.matchAll(/["']js\/([\w\-.]+\.js)(?:\?[^"']*)?["']/g)].map(m => m[1]);
const llSet = new Set(llRefs);
console.log('');
console.log('=== 2. lazy-loader 注册的脚本 ===');
console.log('  注册 ' + llSet.size + ' 个');
let missing2 = 0;
for (const f of llSet) if (!exists(JS + f)) { console.log('  [缺失] ' + f); missing2++; }
console.log('  文件缺失 ' + missing2 + ' 个');

// ---------- 3. 从未被加载的 js 文件 ----------
const htmlSet = new Set(htmlScripts.map(s => path.basename(s.split('?')[0])));
console.log('');
console.log('=== 3. 既不在 index.html 也不在 lazy-loader 的 js ===');
const orphans = dirFiles.filter(f => !llSet.has(f) && !htmlSet.has(f));
console.log('  共 ' + orphans.length + ' 个：');
for (const f of orphans) console.log('    ' + f + '  (' + Math.round(fs.statSync(JS + f).size / 1024) + 'KB)');

// ---------- 4. window.XXX(...) 调用但全项目无定义 ----------
console.log('');
console.log('=== 4. 全局函数：调用了但没定义 ===');
const all = dirFiles.map(f => ({ f, s: read(JS + f) }));
const defined = new Set();
for (const { s } of all) {
  for (const m of s.matchAll(/window\.([A-Za-z_$][\w$]*)\s*=(?!=)/g)) defined.add(m[1]);
  for (const m of s.matchAll(/function\s+([A-Za-z_$][\w$]*)\s*\(/g)) defined.add(m[1]);
  for (const m of s.matchAll(/window\[["']([\w$]+)["']\]\s*=(?!=)/g)) defined.add(m[1]);
}
const called = new Map();
for (const { f, s } of all) {
  for (const m of s.matchAll(/window\.([A-Za-z_$][\w$]*)\s*\(/g)) {
    if (!called.has(m[1])) called.set(m[1], new Set());
    called.get(m[1]).add(f);
  }
}
const undef = [...called.keys()].filter(k => !defined.has(k)).sort();
console.log('  定义 ' + defined.size + ' 个 / 调用 ' + called.size + ' 个 / 疑似未定义 ' + undef.length + ' 个');
for (const u of undef) console.log('    window.' + u + '  ← ' + [...called.get(u)].join(', '));

// ---------- 5. index.html 重复 id ----------
console.log('');
console.log('=== 5. index.html 重复 id ===');
const ids = [...html.matchAll(/\sid=["']([^"']+)["']/g)].map(m => m[1]);
const idCount = {};
for (const i of ids) idCount[i] = (idCount[i] || 0) + 1;
const dup = Object.entries(idCount).filter(([, c]) => c > 1);
console.log('  id 总数 ' + ids.length + ', 重复 ' + dup.length + ' 个' + (dup.length ? ': ' + dup.map(([k, c]) => k + '×' + c).join(', ') : ''));

// ---------- 6. 疑似调试残留 ----------
console.log('');
console.log('=== 6. 调试残留 ===');
for (const { f, s } of all) {
  const dbg = (s.match(/debugger\s*;/g) || []).length;
  if (dbg > 0) console.log('  debugger: ' + f + ' ×' + dbg);
}
console.log('  （TODO/FIXME 在压缩代码里多半是注释残留，不列）');
