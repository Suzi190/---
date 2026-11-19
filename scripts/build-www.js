#!/usr/bin/env node
/**
 * 把「叉叉机/」站点复制成 Capacitor 需要的 www/ 目录。
 * 只放进去真正要用的东西：未启用的死代码、0 字节占位、调试文件一律不进 APK。
 */
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const SRC = path.join(ROOT, '叉叉机');
const OUT = path.join(ROOT, 'www');

// 明确不要进 APK 的（都是已确认无人引用的死代码 / 0 字节占位）
const EXCLUDE_FILES = new Set([
  'cordova.js',              // 0 字节，旧 Cordova 残留
  'cordova_plugins.js',      // 0 字节
]);
const EXCLUDE_JS = new Set([
  'backup-export-router.js', // 未被加载的重构版（备份实际由 global-backup-v3.js 完成）
  'chat-dom-trim.js',        // 未启用的性能补丁
  'image-lazy-unload.js',    // 未启用的性能补丁
]);

function rmrf(p) {
  if (!fs.existsSync(p)) return;
  for (const name of fs.readdirSync(p)) {
    const f = path.join(p, name);
    const st = fs.lstatSync(f);
    if (st.isDirectory()) rmrf(f);
    else fs.unlinkSync(f);
  }
  fs.rmdirSync(p);
}

function copyDir(src, dst, relBase) {
  if (!fs.existsSync(dst)) fs.mkdirSync(dst, { recursive: true });
  for (const name of fs.readdirSync(src)) {
    const s = path.join(src, name);
    const d = path.join(dst, name);
    const st = fs.statSync(s);
    const rel = relBase ? relBase + '/' + name : name;
    if (st.isDirectory()) {
      if (name === 'node_modules' || name.startsWith('_bak')) continue;
      copyDir(s, d, rel);
    } else {
      if (EXCLUDE_FILES.has(name)) { skipped.push(rel); continue; }
      if (rel.startsWith('js/') && EXCLUDE_JS.has(name)) { skipped.push(rel); continue; }
      if (name.startsWith('_.') || name.endsWith('.map')) { skipped.push(rel); continue; }
      fs.copyFileSync(s, d);
      total++;
      bytes += st.size;
    }
  }
}

const skipped = [];
let total = 0, bytes = 0;

if (!fs.existsSync(SRC)) {
  console.error('[build-www] 找不到源目录: ' + SRC);
  process.exit(1);
}

console.log('[build-www] 清理旧 www/ ...');
rmrf(OUT);
fs.mkdirSync(OUT, { recursive: true });

console.log('[build-www] 复制站点文件 ...');
copyDir(SRC, OUT, '');

// ---------- 完整性校验：index.html / lazy-loader 引用的 js 必须都真实存在 ----------
console.log('[build-www] 校验资源引用 ...');
const indexHtml = fs.readFileSync(path.join(OUT, 'index.html'), 'utf8');
const refProblems = [];

// 1) index.html 里 <script src="..."> / <link href="...">
const assets = new Set();
for (const m of indexHtml.matchAll(/<script[^>]+src="([^"]+)"/g)) assets.add(m[1]);
for (const m of indexHtml.matchAll(/<link[^>]+href="([^"]+\.css[^"]*)"/g)) assets.add(m[1]);
for (const m of indexHtml.matchAll(/<img[^>]+src="([^"#]+)"/g)) assets.add(m[1]);

for (const a of assets) {
  const clean = a.split('?')[0];
  if (/^(https?:)?\/\//.test(clean) || clean.startsWith('data:')) continue;
  if (!fs.existsSync(path.join(OUT, clean))) refProblems.push('index.html -> ' + clean);
}

// 2) lazy-loader.js 注册的脚本
const llPath = path.join(OUT, 'js/lazy-loader.js');
if (fs.existsSync(llPath)) {
  const ll = fs.readFileSync(llPath, 'utf8');
  const names = new Set();
  for (const m of ll.matchAll(/["']([\w./-]+\.js)["']/g)) names.add(m[1]);
  for (const n of names) {
    if (/^(https?:)?\/\//.test(n)) continue;
    const candidates = [path.join(OUT, 'js', n), path.join(OUT, n)];
    if (!candidates.some(p => fs.existsSync(p))) refProblems.push('lazy-loader -> ' + n);
  }
}

// 3) css 里的 url(...)
for (const f of fs.readdirSync(path.join(OUT, 'css'))) {
  if (!f.endsWith('.css')) continue;
  const css = fs.readFileSync(path.join(OUT, 'css', f), 'utf8');
  for (const m of css.matchAll(/url\(\s*['"]?([^'")]+)['"]?\s*\)/g)) {
    const u = m[1];
    if (/^(https?:|data:|#)/.test(u)) continue;
    const cleanU = u.split('?')[0].split('#')[0];
    const p = cleanU.startsWith('/') ? path.join(OUT, cleanU) : path.join(OUT, 'css', cleanU);
    if (!fs.existsSync(p)) refProblems.push('css/' + f + ' -> ' + u);
  }
}

if (refProblems.length) {
  console.error('[build-www] ✗ 发现 ' + refProblems.length + ' 个失效引用：');
  refProblems.slice(0, 30).forEach(x => console.error('    ' + x));
  process.exit(1);
}

console.log('');
console.log('[build-www] ✓ 完成');
console.log('  文件数        : ' + total);
console.log('  总大小        : ' + (bytes / 1024 / 1024).toFixed(1) + ' MB');
console.log('  已排除        : ' + (skipped.length ? skipped.join(', ') : '无'));
console.log('  失效引用      : 0');
