/* 记忆访问记账补丁（P4）
 * ------------------------------------------------------------------
 * 背景：app-init.js 的记忆遗忘曲线（P3）会读 memory.lastAccessAt 来做
 *       “间隔重复”加分（越久没被召回 → 遗忘值越高 → 下一轮分数越低），
 *       但全项目没有任何地方写入 lastAccessAt → 遗忘曲线实际是死的，
 *       永远退回用 eventTime 算年龄。
 *
 * 本补丁包装 MemoryManager.getMemoryAppPromptMemories —— 这是唯一把
 * 记忆挑出来注入 prompt 的入口 —— 对最终进入 prompt 的记忆记一次访问：
 *       lastAccessAt = 上次基准 + (now - 上次基准) * 0.6
 *       accessCount += 1
 *
 * 设计要点：
 *   1) 部分推进 60%，不是直接置为 now。直接置 now 会让“常被召回的那几条”
 *      永远处于“刚刚访问过”，遗忘值恒为 0 → 回声室，新记忆永远挤不进来。
 *      推进 60% 既强化记忆，又保留年龄衰减，符合间隔重复语义。
 *   2) 同一条记忆 5 分钟内只写一次。遗忘曲线按“天”算，5 分钟粒度足够，
 *      大幅减少每轮对话对 IndexedDB 的写入。
 *   3) 全程异步 + 静默失败，绝不阻塞、绝不影响 prompt 构建。
 *   4) 不改 app-init.js 一个字节，纯运行时包装，删掉本文件即完全回滚。
 * ------------------------------------------------------------------
 */
(function () {
  if (typeof window === 'undefined' || window.MemoryAccessTouch && window.MemoryAccessTouch.__installed) return;

  var VERSION = '20261119r1';
  var TOUCH_MIN_GAP = 5 * 60 * 1000;   // 同一条记忆的最小写入间隔（5 分钟）
  var ADVANCE_RATIO = 0.6;             // 每次召回把“最后访问时间”往现在推进的比例
  var INSTALL_PATIENCE = 20000;        // 等 MemoryManager 就绪的最长时间
  var INSTALL_INTERVAL = 250;

  var lastTouchAt = Object.create(null);
  var stats = { calls: 0, picked: 0, touched: 0, throttled: 0, failed: 0, noDb: 0 };

  /* 记忆的“上次访问基准”：优先 lastAccessAt，其次事件时间，最后创建时间 */
  function resolveBaseTs(memory) {
    if (!memory || typeof memory !== 'object') return 0;
    var candidates = [memory.lastAccessAt, memory.eventTime, memory.timestamp, memory.createdAt, memory.time];
    for (var i = 0; i < candidates.length; i++) {
      var n = Number(candidates[i]);
      if (Number.isFinite(n) && n > 0) return n;
    }
    return 0;
  }

  /* 新的 lastAccessAt：从基准向 now 推进 ADVANCE_RATIO */
  function nextAccessTs(memory, now) {
    var base = resolveBaseTs(memory);
    if (!(base > 0)) return now;
    if (base >= now) return now;
    var next = Math.round(base + (now - base) * ADVANCE_RATIO);
    if (next > now) next = now;
    if (next <= base) next = base + 1;
    return next;
  }

  /* 真正的记账逻辑（异步、静默） */
  async function touchMemories(memories) {
    try {
      var list = Array.isArray(memories) ? memories : [];
      if (!list.length) return;
      if (typeof db === 'undefined' || !db || !db.longTermMemories) { stats.noDb++; return; }
      var table = db.longTermMemories;
      var now = Date.now();
      var jobs = [];
      for (var i = 0; i < list.length; i++) {
        var m = list[i];
        if (!m || typeof m !== 'object') continue;
        var id = m.id;
        if (id === null || id === undefined || id === '') continue;
        var key = String(id);
        if (now - (lastTouchAt[key] || 0) < TOUCH_MIN_GAP) { stats.throttled++; continue; }
        lastTouchAt[key] = now;
        var nextTs = nextAccessTs(m, now);
        var nextCount = (Number(m.accessCount) || 0) + 1;
        /* 同步更新内存里的对象，让本轮后续（如 UI、后续打分）看到新值 */
        m.lastAccessAt = nextTs;
        m.accessCount = nextCount;
        stats.picked++;
        jobs.push({ id: id, patch: { lastAccessAt: nextTs, accessCount: nextCount } });
      }
      if (!jobs.length) return;
      for (var j = 0; j < jobs.length; j++) {
        try {
          await table.update(jobs[j].id, jobs[j].patch);
          stats.touched++;
        } catch (_) {
          stats.failed++;
        }
      }
    } catch (_) {
      /* 静默：记账失败不能影响聊天 */
    }
  }

  /* 安装包装 */
  function install() {
    try {
      if (typeof MemoryManager === 'undefined' || !MemoryManager) return false;
      var orig = MemoryManager.getMemoryAppPromptMemories;
      if (typeof orig !== 'function') return false;
      if (orig.__accessTouchWrapped) return true;
      var wrapped = function () {
        var out = orig.apply(this, arguments);
        stats.calls++;
        try {
          Promise.resolve().then(function () { return touchMemories(out); });
        } catch (_) { }
        return out;
      };
      wrapped.__accessTouchWrapped = true;
      wrapped.__accessTouchVersion = VERSION;
      wrapped.__accessTouchOriginal = orig;
      MemoryManager.getMemoryAppPromptMemories = wrapped;
      return true;
    } catch (_) {
      return false;
    }
  }

  /* ---------------- 启动：立即试，失败就轮询等 MemoryManager 就绪 ---------------- */
  var installTimer = null;
  var installStartAt = 0;

  function tryInstall() {
    if (install()) {
      if (installTimer) { clearInterval(installTimer); installTimer = null; }
      return true;
    }
    return false;
  }

  function scheduleInstall() {
    if (tryInstall()) return;
    installStartAt = Date.now();
    installTimer = setInterval(function () {
      if (tryInstall()) return;
      if (Date.now() - installStartAt > INSTALL_PATIENCE) {
        clearInterval(installTimer);
        installTimer = null;
        try { console.warn('[memory-access-touch] 等不到 MemoryManager，本次未安装'); } catch (_) { }
      }
    }, INSTALL_INTERVAL);
  }

  /* ---------------- 对外接口（含自检钩子） ---------------- */
  window.MemoryAccessTouch = {
    __installed: true,
    version: VERSION,
    install: install,
    isInstalled: function () {
      try {
        return !!(typeof MemoryManager !== 'undefined' && MemoryManager &&
          MemoryManager.getMemoryAppPromptMemories &&
          MemoryManager.getMemoryAppPromptMemories.__accessTouchWrapped);
      } catch (_) { return false; }
    },
    stats: function () { return Object.assign({}, stats); },
    resetStats: function () { stats = { calls: 0, picked: 0, touched: 0, throttled: 0, failed: 0, noDb: 0 }; },
    resetThrottle: function () { lastTouchAt = Object.create(null); },
    _test: {
      resolveBaseTs: resolveBaseTs,
      nextAccessTs: nextAccessTs,
      touchMemories: touchMemories,
      config: function () { return { TOUCH_MIN_GAP: TOUCH_MIN_GAP, ADVANCE_RATIO: ADVANCE_RATIO }; }
    }
  };

  scheduleInstall();
})();
