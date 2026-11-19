#!/usr/bin/env node
/**
 * 对 `npx cap add android` 生成的 Android 工程打补丁。
 * 必须在 cap add 之后、gradlew 之前运行。
 *
 * 做四件事：
 *  1. 用 android-overlay/ 覆盖 MainActivity、MixNativeBridge 插件、全屏主题
 *  2. AndroidManifest 补权限（通知 / 保活 / 老系统存储）+ 键盘 adjustResize
 *  3. 换 App 图标
 *  4. 校验关键文件都在，缺一个就 fail（不让出一个功能残缺的包）
 */
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const ANDROID = path.join(ROOT, 'android');
const OVERLAY = path.join(ROOT, 'android-overlay');
const SITE = path.join(ROOT, '叉叉机');

function die(msg) {
  console.error('[patch-android] ✗ ' + msg);
  process.exit(1);
}

if (!fs.existsSync(ANDROID)) die('android/ 不存在，请先运行 npx cap add android');

// ---------- 1. 覆盖 overlay（Java 单独处理，见下） ----------
function copyTree(src, dst, skipJava) {
  for (const name of fs.readdirSync(src)) {
    const s = path.join(src, name);
    const d = path.join(dst, name);
    const st = fs.statSync(s);
    if (st.isDirectory()) {
      if (skipJava && name === 'java' && /src[\\/]main$/.test(dst)) continue;
      if (!fs.existsSync(d)) fs.mkdirSync(d, { recursive: true });
      copyTree(s, d, skipJava);
    } else {
      if (!fs.existsSync(path.dirname(d))) fs.mkdirSync(path.dirname(d), { recursive: true });
      fs.copyFileSync(s, d);
      console.log('  overlay -> ' + path.relative(ANDROID, d).replace(/\\/g, '/'));
    }
  }
}
console.log('[patch-android] 覆盖原生源码 / 资源 ...');
copyTree(OVERLAY, ANDROID, true);

// ---------- 1b. Java 源码：跟着 Capacitor 的 namespace 走 ----------
// Capacitor 按 capacitor.config.json 的 appId 决定包名，但万一它改用别的 namespace，
// 直接按固定路径拷贝就会"拷了个寂寞"——App 跑的还是原生模板，全屏和键盘逻辑全部失效。
// 所以这里先读出真实 namespace，再把 package 声明和目录一起改成它。
const gradlePath = path.join(ANDROID, 'app/build.gradle');
let namespace = 'com.chachaji.app';
if (fs.existsSync(gradlePath)) {
  const g = fs.readFileSync(gradlePath, 'utf8');
  const m = g.match(/namespace\s*=?\s*['"]([^'"]+)['"]/);
  if (m) namespace = m[1];
}
console.log('[patch-android] Android namespace = ' + namespace);

if (namespace !== 'com.chachaji.app') {
  console.log('[patch-android] namespace 与默认不同，自动重定位 Java 源码');
}

const pkgPath = namespace.split('.').join('/');
const javaSrcDir = path.join(OVERLAY, 'app/src/main/java/com/chachaji/app');
const javaDstDir = path.join(ANDROID, 'app/src/main/java', pkgPath);

if (fs.existsSync(javaSrcDir)) {
  if (!fs.existsSync(javaDstDir)) fs.mkdirSync(javaDstDir, { recursive: true });
  for (const f of fs.readdirSync(javaSrcDir)) {
    if (!f.endsWith('.java')) continue;
    let code = fs.readFileSync(path.join(javaSrcDir, f), 'utf8');
    if (namespace !== 'com.chachaji.app') {
      code = code.replace(/^package\s+com\.chachaji\.app;/m, 'package ' + namespace + ';');
    }
    fs.writeFileSync(path.join(javaDstDir, f), code, 'utf8');
    console.log('  java -> ' + path.join('app/src/main/java', pkgPath, f).replace(/\\/g, '/'));
  }
  // 清掉可能因 namespace 不同而残留的错误包目录，避免出现两个 MainActivity
  const staleDir = path.join(ANDROID, 'app/src/main/java/com/chachaji/app');
  if (namespace !== 'com.chachaji.app' && fs.existsSync(staleDir)) {
    for (const f of fs.readdirSync(staleDir)) fs.unlinkSync(path.join(staleDir, f));
    try { fs.rmdirSync(staleDir); } catch (_) {}
  }
} else {
  die('android-overlay 里找不到 Java 源码目录');
}

// ---------- 2. 补 AndroidManifest ----------
const manifestPath = path.join(ANDROID, 'app/src/main/AndroidManifest.xml');
if (!fs.existsSync(manifestPath)) die('找不到 AndroidManifest.xml');
let mf = fs.readFileSync(manifestPath, 'utf8');

const PERMISSIONS = [
  'android.permission.INTERNET',
  'android.permission.POST_NOTIFICATIONS',
  'android.permission.VIBRATE',
  'android.permission.WAKE_LOCK',
  'android.permission.FOREGROUND_SERVICE',
  'android.permission.FOREGROUND_SERVICE_DATA_SYNC',
  'android.permission.RECEIVE_BOOT_COMPLETED',
  'android.permission.ACCESS_NETWORK_STATE',
];

let addedPerms = 0;
for (const p of PERMISSIONS) {
  if (mf.includes('android:name="' + p + '"')) continue;
  mf = mf.replace(/(<manifest\b[^>]*>)/, '$1\n    <uses-permission android:name="' + p + '" />');
  addedPerms++;
}

// 老系统（Android 9 及以下）导出到公共 Downloads 需要写权限
if (!mf.includes('WRITE_EXTERNAL_STORAGE')) {
  mf = mf.replace(/(<manifest\b[^>]*>)/,
    '$1\n    <uses-permission android:name="android.permission.WRITE_EXTERNAL_STORAGE" android:maxSdkVersion="28" />');
  addedPerms++;
}

// 键盘：确保 adjustResize（配合 MainActivity 的 insets 逻辑，双保险）
if (!/android:windowSoftInputMode="[^"]*adjustResize/.test(mf)) {
  if (/android:windowSoftInputMode="[^"]*"/.test(mf)) {
    mf = mf.replace(/android:windowSoftInputMode="[^"]*"/, 'android:windowSoftInputMode="adjustResize"');
  } else {
    mf = mf.replace(/(<activity\b)/, '$1\n            android:windowSoftInputMode="adjustResize"');
  }
  addedPerms++;
}

// 确保 configChanges 含 keyboard|keyboardHidden，否则键盘弹出时 Activity 会重建
const need = ['keyboard', 'keyboardHidden', 'orientation', 'screenSize', 'smallestScreenSize', 'screenLayout', 'density', 'uiMode', 'locale', 'layoutDirection', 'fontScale'];
const cm = mf.match(/android:configChanges="([^"]*)"/);
if (cm) {
  const cur = cm[1].split('|').map(x => x.trim());
  const merged = Array.from(new Set([...cur, ...need]));
  mf = mf.replace(/android:configChanges="[^"]*"/, 'android:configChanges="' + merged.join('|') + '"');
} else {
  mf = mf.replace(/(<activity\b)/, '$1\n            android:configChanges="' + need.join('|') + '"');
}

fs.writeFileSync(manifestPath, mf, 'utf8');
console.log('[patch-android] Manifest 补丁完成（' + addedPerms + ' 处新增）');

// ---------- 3. 图标 ----------
const iconSrc = path.join(SITE, 'icon-512.png');
const resDir = path.join(ANDROID, 'app/src/main/res');
if (fs.existsSync(iconSrc)) {
  // 删掉自适应图标 XML，否则会盖住我们换的 png
  const anydpi = path.join(resDir, 'mipmap-anydpi-v26');
  if (fs.existsSync(anydpi)) {
    for (const f of fs.readdirSync(anydpi)) fs.unlinkSync(path.join(anydpi, f));
  }
  let n = 0;
  for (const d of fs.readdirSync(resDir)) {
    if (!d.startsWith('mipmap-')) continue;
    for (const name of ['ic_launcher.png', 'ic_launcher_round.png', 'ic_launcher_foreground.png']) {
      fs.copyFileSync(iconSrc, path.join(resDir, d, name));
      n++;
    }
  }
  console.log('[patch-android] 图标已替换（' + n + ' 个文件）');
} else {
  console.log('[patch-android] ! 未找到 icon-512.png，沿用默认图标');
}

// ---------- 4. 校验 ----------
console.log('[patch-android] 校验关键文件 ...');
const MUST = [
  'app/src/main/java/' + pkgPath + '/MainActivity.java',
  'app/src/main/java/' + pkgPath + '/MixNativeBridgePlugin.java',
  'app/src/main/res/values/styles.xml',
  'app/src/main/AndroidManifest.xml',
];
const missing = MUST.filter(f => !fs.existsSync(path.join(ANDROID, f)));
if (missing.length) die('缺少文件：' + missing.join(', '));

const mainJava = fs.readFileSync(path.join(ANDROID, MUST[0]), 'utf8');
if (!mainJava.includes('MixNativeBridgePlugin.class')) die('MainActivity 未注册 MixNativeBridgePlugin');
if (!mainJava.includes('setDecorFitsSystemWindows')) die('MainActivity 缺少全屏逻辑');
if (!mainJava.includes('setPadding')) die('MainActivity 缺少键盘 insets 逻辑');

const pluginJava = fs.readFileSync(path.join(ANDROID, MUST[1]), 'utf8');
const REQUIRED_METHODS = [
  'startFileSaveSession', 'appendFileSaveChunk', 'finishFileSaveSession', 'abortFileSaveSession',
  'saveFileToDownloads', 'checkNotificationPermission', 'requestNotificationPermission', 'showNotification',
  'startForegroundTask', 'stopForegroundTask',
];
const lost = REQUIRED_METHODS.filter(x => !pluginJava.includes(x));
if (lost.length) die('插件缺少方法：' + lost.join(', '));

const finalMf = fs.readFileSync(manifestPath, 'utf8');
if (!finalMf.includes('POST_NOTIFICATIONS')) die('Manifest 缺 POST_NOTIFICATIONS');
if (!/windowSoftInputMode="[^"]*adjustResize/.test(finalMf)) die('Manifest 缺 adjustResize');

// 最关键的一条：确认 Manifest 里的 Activity 真的指向我们改过的那个类，
// 而不是 Capacitor 自动生成的空壳模板。
const actMatch = finalMf.match(/<activity[^>]*android:name="([^"]+)"/);
if (actMatch) {
  let cls = actMatch[1];
  if (cls.startsWith('.')) cls = namespace + cls;
  else if (cls.indexOf('.') < 0) cls = namespace + '.' + cls;
  const rel = 'app/src/main/java/' + cls.split('.').join('/') + '.java';
  const full = path.join(ANDROID, rel);
  if (!fs.existsSync(full)) die('Manifest 指向的 Activity 不存在：' + rel);
  const code = fs.readFileSync(full, 'utf8');
  if (!code.includes('setPadding')) die('Manifest 指向的 Activity 不是我们改过的版本（缺键盘逻辑）：' + rel);
  if (!code.includes('MixNativeBridgePlugin.class')) die('该 Activity 没有注册 MixNativeBridge 插件：' + rel);
  console.log('[patch-android] Activity 校验通过：' + cls);
} else {
  die('Manifest 里找不到 <activity android:name=...>');
}

console.log('[patch-android] ✓ 全部通过（含 10 个插件方法、通知权限、键盘 adjustResize、Activity 指向）');
