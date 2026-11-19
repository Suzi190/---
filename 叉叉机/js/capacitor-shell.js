/**
 * 叉叉机 Android 外壳适配层（只在内置 APK 里生效，浏览器里几乎不做任何事）
 *
 * 为什么需要它：
 *  - Android 的 WebView 不支持 env(safe-area-inset-*)，全屏后顶部内容会被状态栏压住
 *    或反过来留一条黑边，所以要由原生把真实数值传进来，再把 CSS 里的 env() 换掉。
 *  - js/keyboard-viewport-fix.js 是给"浏览器"写的兜底：输入框聚焦等 280ms 再滚动、
 *    失焦后强制 scrollTo(0,0)。在原生 resize 已经生效的外壳里，这套逻辑只会打架
 *    （表现为键盘弹起时页面先跳一下、收起后又莫名回顶部）。所以在最前面把它关掉。
 */
(function () {
  'use strict';

  var isNative = detectNative();

  /**
   * 判断当前是不是内置 APK。
   *
   * ⚠️ 不能只看 window.Capacitor：Capacitor 的原生桥是在页面开始加载之后才注入的，
   *    本文件放在 index.html 的 <head> 最前面，执行时有可能还拿不到 Capacitor。
   *    一旦这里误判成"不是 App"，下面整套原生适配（安全区变量、键盘平移中和）都不会安装，
   *    用户看到的就是"输入框又飞到屏幕中间 + 下面一大块深色"。
   *
   * 兜底特征：Capacitor Android 的内置页面地址恒为 https://localhost/。
   */
  function detectNative() {
    try {
      if (window.Capacitor && typeof window.Capacitor.isNativePlatform === 'function' && window.Capacitor.isNativePlatform()) return true;
    } catch (_) {}
    try {
      if (location && location.hostname === 'localhost' && /Android/i.test(navigator.userAgent || '')) return true;
    } catch (_) {}
    return false;
  }

  // ---------- 关键：在任何脚本之前关掉浏览器版键盘兜底 ----------
  // keyboard-viewport-fix.js 的第一行是 if(!window.__keyboardViewportFixInstalled)。
  // 这里提前置 true，它就会整体跳过安装，不再和原生 resize 抢着滚动页面。
  if (isNative) window.__keyboardViewportFixInstalled = true;

  var root = document.documentElement;
  var lastInsets = { top: 0, bottom: 0, keyboard: 0 };

  function px(n) {
    return Math.max(0, Math.round(n || 0)) + 'px';
  }

  function applyInsets(top, bottom, keyboard) {
    lastInsets = { top: top, bottom: bottom, keyboard: keyboard };
    root.style.setProperty('--sat', px(top));
    // 键盘弹起时导航栏已被键盘遮住，底部安全区必须归零，
    // 否则输入框和键盘之间会凭空多出一道导航栏高度的缝。
    root.style.setProperty('--sab', px(keyboard > 0 ? 0 : bottom));
    root.style.setProperty('--kb-height', px(keyboard));
    root.classList.toggle('is-keyboard-open', keyboard > 0);
    // --keyboard-height 交给项目自己的 first-paint.js 维护，这里不抢，避免两边打架抖动
    root.style.setProperty('--safe-area-total', px(top + (keyboard > 0 ? 0 : bottom)));
  }

  // 原生 MainActivity 会高频调用这个（键盘动画期间逐帧）
  window.__ccjNativeInsets = function (insets) {
    if (!insets) return;
    applyInsets(insets.top || 0, insets.bottom || 0, insets.keyboard || 0);
  };

  // ---------- 把 CSS 里的 env(safe-area-inset-*) 换成有值的变量 ----------
  // Android WebView 下 env() 恒为 0，直接改写样式表是最省事、语义最等价的做法。
  var envPatched = false;
  var REPLACEMENTS = [
    [/env\(\s*safe-area-inset-top\s*,\s*[^)]*\)/g, 'var(--sat, 0px)'],
    [/env\(\s*safe-area-inset-top\s*\)/g, 'var(--sat, 0px)'],
    [/env\(\s*safe-area-inset-bottom\s*,\s*[^)]*\)/g, 'var(--sab, 0px)'],
    [/env\(\s*safe-area-inset-bottom\s*\)/g, 'var(--sab, 0px)'],
    [/env\(\s*safe-area-inset-left\s*,\s*[^)]*\)/g, '0px'],
    [/env\(\s*safe-area-inset-left\s*\)/g, '0px'],
    [/env\(\s*safe-area-inset-right\s*,\s*[^)]*\)/g, '0px'],
    [/env\(\s*safe-area-inset-right\s*\)/g, '0px']
  ];

  function patchValue(v) {
    if (!v || v.indexOf('env(safe-area') < 0) return null;
    var out = v;
    for (var i = 0; i < REPLACEMENTS.length; i++) out = out.replace(REPLACEMENTS[i][0], REPLACEMENTS[i][1]);
    return out === v ? null : out;
  }

  function patchStyleSheets(force) {
    if (envPatched && !force) return;
    envPatched = true;
    var sheets = document.styleSheets;
    for (var i = 0; i < sheets.length; i++) {
      var rules;
      try {
        rules = sheets[i].cssRules;
      } catch (_) {
        continue; // 跨域样式表，跳过
      }
      if (!rules) continue;
      walkRules(rules);
    }
  }

  function walkRules(rules) {
    for (var i = 0; i < rules.length; i++) {
      var rule = rules[i];
      if (rule.style && rule.style.length) {
        for (var j = 0; j < rule.style.length; j++) {
          var prop = rule.style[j];
          if (!prop) continue;
          var val = rule.style.getPropertyValue(prop);
          var next = patchValue(val);
          if (next !== null) {
            try {
              rule.style.setProperty(prop, next, rule.style.getPropertyPriority(prop));
            } catch (_) {}
          }
        }
      }
      if (rule.cssRules) walkRules(rule.cssRules);
    }
  }

  var nativeInited = false;

  function initNative() {
    if (nativeInited) return;
    nativeInited = true;

    // 万一早期没判定成 App，keyboard-viewport-fix.js 可能已经装上了，
    // 这里再置一遍标志（对它本身无效，但能挡住后续重复安装）
    window.__keyboardViewportFixInstalled = true;

    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', function () { patchStyleSheets(); });
    } else {
      patchStyleSheets();
    }
    // 后加载的样式表（懒加载）再补一次
    window.addEventListener('load', function () { setTimeout(function () { patchStyleSheets(true); }, 0); });
    root.classList.add('ccj-native');

    setupBackButton();
    setupNotifications();
    setupViewportSync();
    neutralizeKeyboardShift();
  }

  function tryNativeInit() {
    if (nativeInited) return;
    if (detectNative()) initNative();
  }

  // 注意：真正的调用点在文件最末尾 ——
  // 因为 initNative 里要用到的 KB_SHIFT_CSS 等 var 变量在文件后半段才赋值，
  // 在这里立刻调用会拿到 undefined（历史上就是因此在 <style> 里注入了 "undefined"，
  // 那套"中和键盘平移"的样式从来没生效，输入框才会飞到屏幕中间）。


  // ==========================================================
  //  返回键 / 侧滑返回
  //  Android 的边缘侧滑手势和返回键都会走 backButton 事件。
  //  默认行为是 finish() 直接关闭 App —— 这就是"滑一下就退出"的原因。
  //  这里改成：能退回上一页就退回，已经在主屏则最小化到后台。
  // ==========================================================
  var MAIN_SCREEN_IDS = { 'main-screen': 1 };
  var SUB_PAGE_ID = /-(page|count|loading|loading-text|empty|panel|panel-title|title)$/;

  function findTopVisiblePage() {
    var all = document.querySelectorAll('[id$="-page"], [class*="-page"]');
    var best = null, bestZ = -1, bestOrder = -1;
    for (var i = 0; i < all.length; i++) {
      var el = all[i];
      if (!el || !el.id) continue;
      if (MAIN_SCREEN_IDS[el.id]) continue;
      // cece-mbti-char-page-count 这类是页面内部的子元素，不当页面处理
      if (SUB_PAGE_ID.test(el.id) && !/^[\w-]+-page$/.test(el.id)) continue;
      var cs;
      try { cs = getComputedStyle(el); } catch (_) { continue; }
      if (cs.display === 'none' || cs.visibility === 'hidden') continue;
      if (parseFloat(cs.opacity || '1') === 0) continue;
      if (!el.offsetWidth || !el.offsetHeight) continue;
      if (el.offsetHeight < 240) continue;
      if (cs.position !== 'fixed' && cs.position !== 'absolute') continue;
      var z = parseInt(cs.zIndex, 10);
      if (isNaN(z)) z = 0;
      if (z > bestZ || (z === bestZ && i > bestOrder)) {
        bestZ = z; bestOrder = i; best = el;
      }
    }
    return best;
  }

  function closePage(el) {
    // 优先点它自己的返回/关闭按钮，让项目走完整清理流程
    var sel = '[class*="back-btn"],[class*="-back"],[data-back],[class*="close-btn"],[class*="-close"]';
    var btn = null;
    try { btn = el.querySelector(sel); } catch (_) {}
    if (btn && btn.offsetParent !== null) {
      try { btn.click(); return true; } catch (_) {}
    }
    // 兜底：收起这一层
    try {
      el.style.display = 'none';
      el.classList.remove('active', 'show', 'is-open', 'visible', 'page-active');
      return true;
    } catch (_) { return false; }
  }

  function setupBackButton() {
    var App = window.Capacitor && window.Capacitor.Plugins && window.Capacitor.Plugins.App;
    if (!App || typeof App.addListener !== 'function') return;

    App.addListener('backButton', function () {
      // 页面可自行接管（例如聊天页先关表情面板）
      try {
        if (typeof window.__ccjHandleBack === 'function' && window.__ccjHandleBack() === true) return;
      } catch (_) {}

      var page = findTopVisiblePage();
      if (page && closePage(page)) return;

      // 已在主屏：最小化，不退出
      try {
        if (typeof App.minimizeApp === 'function') App.minimizeApp();
      } catch (_) {}
    });
  }

  // ==========================================================
  //  通知权限
  // ==========================================================
  function setupNotifications() {
    var bridge = window.Capacitor && window.Capacitor.Plugins && window.Capacitor.Plugins.MixNativeBridge;
    if (!bridge || typeof bridge.requestNotificationPermission !== 'function') return;

    var asked = false;
    function ask() {
      if (asked) return;
      asked = true;
      try {
        var r = bridge.checkNotificationPermission();
        if (r && typeof r.then === 'function') {
          r.then(function (res) {
            if (res && res.permission === 'granted') return;
            try { bridge.requestNotificationPermission(); } catch (_) {}
          }).catch(function () {
            try { bridge.requestNotificationPermission(); } catch (_) {}
          });
        } else {
          bridge.requestNotificationPermission();
        }
      } catch (_) {}
    }

    // 等首屏稳定再弹，避免和启动动画抢资源；也给用户一点心理准备
    setTimeout(ask, 1800);
  }

  // ==========================================================
  //  视口高度兜底
  //  原生已经会让 WebView 随键盘缩放，这里只是确保 --app-height 跟着变，
  //  避免页面用 100dvh 算出错误高度。
  // ==========================================================
  function setupViewportSync() {
    var raf = null;
    function sync() {
      raf = null;
      var h = window.innerHeight;
      if (!h || h < 120) return;
      try {
        // ① --app-height：整屏高度（键盘收起的值由 first-paint.js 维护，这里跟随真实视口）
        var cur = root.style.getPropertyValue('--app-height');
        if (cur !== h + 'px') root.style.setProperty('--app-height', h + 'px');
        // ② --active-viewport-height：聊天页/整页容器的实际高度，必须是"当前真正能用的那块"。
        //    原生把 WebView 压矮后 innerHeight 就是它；first-paint.js 是拿 visualViewport 算的，
        //    在个别 ROM 上它不跟着变，容器就会比键盘上沿高一大截 → 输入栏被键盘盖住。
        //    这里用行内 !important 写死成真实视口高（行内 important 优先级最高，压得过 first-paint）。
        //    虚拟屏幕预览模式（has-custom-screen-size 且非 fill-screen-mode）下不碰，
        //    否则会把用户自定义的预览尺寸顶掉。
        var fillMode = !root.classList.contains('has-custom-screen-size') ||
          root.classList.contains('is-fill-screen-mode');
        if (fillMode) root.style.setProperty('--active-viewport-height', h + 'px', 'important');
      } catch (_) {}
    }
    function schedule() {
      if (raf) return;
      raf = window.requestAnimationFrame ? window.requestAnimationFrame(sync) : setTimeout(sync, 16);
    }
    window.addEventListener('resize', schedule, { passive: true });
    window.addEventListener('orientationchange', function () { setTimeout(schedule, 260); });
    schedule();
  }

  // ==========================================================
  //  中和 first-paint.js 的「输入栏上移」补偿
  //
  //  first-paint.js 在键盘弹起时会给 --keyboard-bottom-overlap 赋值（约等于键盘高度），
  //  然后用它把聊天输入栏 transform: translateY(-overlap)，同时把聊天页容器
  //  --active-viewport-height 收成 visualViewport 的高度。
  //
  //  这是给「容器会跟着变矮」的场景写的一层保险，在我们外壳里会双重生效：
  //  MainActivity 已经把 WebView 的真实高度压掉了键盘，容器本来就已经变矮，
  //  那层平移再执行一次，输入栏就被顶到屏幕中间、下面空出一大块黑。
  //
  //  所以这里用特异性更高的规则（html.ccj-native body #id，比 first-paint 的
  //  #id 高一级，不依赖加载顺序）把平移压成 0 —— 容器已经让位，不需要再平移。
  //  顺带把消息区的 padding 还原成键盘关闭时的常量，避免底部多出一整屏空白。
  // ==========================================================
  var KB_SHIFT_CSS =
    // ① 最狠也最稳的一刀：把驱动补偿的 CSS 变量直接钉成 0。
    //    first-paint.js 是用 element.style.setProperty 写的【行内】普通声明，
    //    而带 !important 的样式表声明优先级高于行内普通声明，所以这里能压住它。
    //    这样不管它内部怎么算、以后又加了什么用这个变量的样式，都不会再动输入栏。
    'html.ccj-native{' +
    '--keyboard-bottom-overlap:0px !important;' +
    '--keyboard-offset-top:0px !important;' +
    '}' +
    // ② 兜底：把用到它的那几个选择器的 transform / padding 也按死
    'html.ccj-native body #chat-input-area,' +
    'html.ccj-native body #group-chat-input-area,' +
    'html.ccj-native body #offline-mode-footer,' +
    'html.ccj-native body #group-offline-mode-footer' +
    '{transform:none !important;transition:none !important;}' +
    'html.ccj-native body #chat-messages.chat-detail-content,' +
    'html.ccj-native body #group-chat-messages.chat-detail-content' +
    '{padding-bottom:12px !important;scroll-padding-bottom:20px !important;}';

  function neutralizeKeyboardShift() {
    function inject() {
      try {
        var old = document.getElementById('ccj-kb-shift-fix');
        if (old) {
          // 已经注入过：内容正常就不动；万一被写成了 "undefined"（历史坑），重写一遍
          if (old.textContent && old.textContent.indexOf('ccj-native') >= 0) return;
          old.parentNode && old.parentNode.removeChild(old);
        }
        var st = document.createElement('style');
        st.id = 'ccj-kb-shift-fix';
        st.textContent = KB_SHIFT_CSS;
        (document.head || document.documentElement).appendChild(st);
      } catch (_) {}
    }
    inject();
    // 懒加载的样式表可能后到，load 之后再补一次；有 id 去重，重复调用无副作用
    window.addEventListener('load', function () { setTimeout(inject, 0); });
  }

  // ==========================================================
  //  启动原生适配
  //
  //  必须放在文件最末尾：上面 KB_SHIFT_CSS 等用 var 声明的变量到这里才有值。
  //  （历史上把 initNative() 写在文件前半段，var 提升导致注入 <style> 的内容是
  //    "undefined"，键盘平移中和整个失效 —— 这就是"输入框又飞起来"的根因。）
  // ==========================================================
  if (isNative) {
    initNative();
  } else {
    // Capacitor 桥可能晚于本脚本注入：DOM 解析完成、load、以及几个时间点各补试一次。
    // initNative 是幂等的，重复调用没有副作用。
    document.addEventListener('DOMContentLoaded', tryNativeInit);
    window.addEventListener('load', tryNativeInit);
    [200, 600, 1500, 3000].forEach(function (ms) { setTimeout(tryNativeInit, ms); });
  }
})();

