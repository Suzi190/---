/* memory-access-touch-patch.js 自检（P4：记忆访问记账，让遗忘曲线闭环） */
const fs = require('fs');
const vm = require('vm');

const LOG = [];
function say(s) { LOG.push(s); }
let pass = 0, fail = 0;
function ok(name, cond, extra) {
  if (cond) { pass++; say('  PASS  ' + name); }
  else { fail++; say('  FAIL  ' + name + (extra !== undefined ? '   << ' + extra : '')); }
}

/* ---------------- mock 环境 ---------------- */
const updates = [];
let updateShouldThrow = false;

global.window = global;
global.setInterval = () => 0;          // 不让轮询定时器拖住进程
global.clearInterval = () => { };

global.db = {
  longTermMemories: {
    update: async function (id, patch) {
      if (updateShouldThrow) throw new Error('boom');
      updates.push({ id: id, patch: patch });
      return 1;
    }
  }
};

let origCalls = 0;
let origThrow = false;
global.MemoryManager = {
  getMemoryAppPromptMemories: function (memories) {
    origCalls++;
    if (origThrow) throw new Error('orig-boom');
    return memories;
  }
};

vm.runInThisContext(fs.readFileSync('D:/叉叉机/叉叉机/js/memory-access-touch-patch.js', 'utf8'));
const MT = global.MemoryAccessTouch;

function flush() { return new Promise(r => setTimeout(r, 0)); }
function resetAll() {
  updates.length = 0;
  origCalls = 0;
  updateShouldThrow = false;
  origThrow = false;
  MT.resetStats();
  MT.resetThrottle();
}

say('=== memory-access-touch 自检 ' + MT.version + ' ===');
say('');

/* ---------------- T1 安装 ---------------- */
say('[T1] 安装');
ok('window.MemoryAccessTouch 存在', !!MT);
ok('已包装 MemoryManager.getMemoryAppPromptMemories', MT.isInstalled() === true);
ok('原函数被保存下来', typeof MemoryManager.getMemoryAppPromptMemories.__accessTouchOriginal === 'function');
ok('重复 install 不重复包装', (function () {
  const cur = MemoryManager.getMemoryAppPromptMemories;
  MT.install();
  return MemoryManager.getMemoryAppPromptMemories === cur;
})());
ok('配置常量正确（5 分钟 / 0.6）', (function () {
  const c = MT._test.config();
  return c.TOUCH_MIN_GAP === 300000 && c.ADVANCE_RATIO === 0.6;
})());

/* ---------------- T2 透传不改变业务结果 ---------------- */
say('');
say('[T2] 包装后行为不变');
(async function run() {
  resetAll();
  const fakeOut = [{ id: 1, content: 'A' }, { id: 2, content: 'B' }];
  const got = MemoryManager.getMemoryAppPromptMemories(fakeOut, []);
  ok('返回值就是原函数的返回（同一个引用）', got === fakeOut);
  ok('原函数被调用 1 次', origCalls === 1);
  await flush();
  ok('记账写入 2 条', updates.length === 2, JSON.stringify(updates.map(u => u.id)));
  ok('id 正确', updates.map(u => u.id).join(',') === '1,2', updates.map(u => u.id).join(','));

  /* ---------------- T3 记账内容正确 ---------------- */
  say('');
  say('[T3] lastAccessAt 部分推进 / accessCount 累加');
  resetAll();
  const now = Date.now();
  const tenDaysAgo = now - 10 * 86400000;
  const m = { id: 7, content: '十天前的记忆', eventTime: tenDaysAgo, accessCount: 3 };
  MemoryManager.getMemoryAppPromptMemories([m], []);
  await flush();
  const w = updates[0];
  ok('写入了 1 条', updates.length === 1);
  ok('accessCount 3 -> 4', w.patch.accessCount === 4, w.patch.accessCount);
  const expectAdvance = Math.round(tenDaysAgo + (now - tenDaysAgo) * 0.6);
  ok('lastAccessAt ≈ 基准 + 60% 间隔（不是直接置 now）',
    Math.abs(w.patch.lastAccessAt - expectAdvance) <= 2,
    'got=' + w.patch.lastAccessAt + ' expect=' + expectAdvance);
  ok('lastAccessAt 明显小于 now（没有完全重置）',
    w.patch.lastAccessAt < now - 86400000 * 3,
    'diffDays=' + ((now - w.patch.lastAccessAt) / 86400000).toFixed(2));
  ok('内存对象同步被更新', m.lastAccessAt === w.patch.lastAccessAt && m.accessCount === 4);
  ok('原本没有 lastAccessAt 时也能算', (function () {
    const t = MT._test.nextAccessTs({ eventTime: now - 1000 }, now);
    return t > now - 1000 && t <= now;
  })());
  ok('完全没有时间字段时退回 now', MT._test.nextAccessTs({}, now) === now);
  ok('resolveBaseTs 优先级：lastAccessAt > eventTime', (function () {
    return MT._test.resolveBaseTs({ lastAccessAt: 111, eventTime: 222 }) === 111;
  })());
  ok('resolveBaseTs 无字段时为 0', MT._test.resolveBaseTs({}) === 0);

  /* ---------------- T4 节流 ---------------- */
  say('');
  say('[T4] 5 分钟节流（避免每轮狂写 IndexedDB）');
  resetAll();
  const m4 = { id: 11, content: 'x', eventTime: now - 86400000 };
  MemoryManager.getMemoryAppPromptMemories([m4], []);
  await flush();
  ok('第 1 轮写入 1 条', updates.length === 1);
  MemoryManager.getMemoryAppPromptMemories([m4], []);
  MemoryManager.getMemoryAppPromptMemories([m4], []);
  await flush();
  ok('紧接着的 2 轮不再写入（仍为 1 条）', updates.length === 1, updates.length);
  ok('throttled 计数为 2', MT.stats().throttled === 2, MT.stats().throttled);

  /* ---------------- T5 节流是每个 id 独立的 ---------------- */
  say('');
  say('[T5] 节流按条目独立');
  MemoryManager.getMemoryAppPromptMemories([{ id: 12, content: 'y' }], []);
  await flush();
  ok('新 id 不受旧 id 节流影响', updates.length === 2, updates.length);

  /* ---------------- T6 节流可重置（模拟 5 分钟后） ---------------- */
  say('');
  say('[T6] 重置节流后再写一次');
  MT.resetThrottle();
  MemoryManager.getMemoryAppPromptMemories([m4], []);
  await flush();
  ok('重置后又写入一条', updates.length === 3, updates.length);

  /* ---------------- T7 异常输入 ---------------- */
  say('');
  say('[T7] 异常输入不崩');
  resetAll();
  const before7 = updates.length;
  await MT._test.touchMemories(null);
  await MT._test.touchMemories(undefined);
  await MT._test.touchMemories('not-an-array');
  await MT._test.touchMemories([]);
  await MT._test.touchMemories([null, undefined, 0, 'str', []]);
  ok('非数组 / 空 / 脏元素都不写入', updates.length === before7, updates.length);
  ok('不抛异常', true);

  /* ---------------- T8 无 id 的条目跳过 ---------------- */
  say('');
  say('[T8] 没有 id 或 id 为空的条目跳过');
  resetAll();
  await MT._test.touchMemories([{ content: 'no id' }, { id: null }, { id: undefined }, { id: '' }, { id: 99, content: 'ok' }]);
  ok('只写入有 id 的那一条', updates.length === 1 && updates[0].id === 99, JSON.stringify(updates.map(u => u.id)));

  /* ---------------- T9 db 不可用 ---------------- */
  say('');
  say('[T9] db 未就绪时静默返回');
  resetAll();
  const savedDb = global.db;
  global.db = undefined;
  let threw9 = false;
  try { await MT._test.touchMemories([{ id: 500, content: 'z' }]); } catch (_) { threw9 = true; }
  ok('不抛异常', !threw9);
  ok('noDb 计数 +1', MT.stats().noDb === 1, MT.stats().noDb);
  global.db = savedDb;

  /* ---------------- T10 原函数异常要透传（不能吞业务错误） ---------------- */
  say('');
  say('[T10] 原函数抛错时照常向外抛');
  resetAll();
  origThrow = true;
  let threw10 = false;
  try { MemoryManager.getMemoryAppPromptMemories([], []); } catch (_) { threw10 = true; }
  ok('异常透传，未被包装吞掉', threw10 === true);
  await flush();
  ok('抛错时不写库', updates.length === 0, updates.length);
  origThrow = false;

  /* ---------------- T11 写库失败不影响主流程 ---------------- */
  say('');
  say('[T11] 写库失败只记 failed，不影响调用方');
  resetAll();
  updateShouldThrow = true;
  let threw11 = false;
  try {
    MemoryManager.getMemoryAppPromptMemories([{ id: 600, content: 'w' }], []);
    await flush();
  } catch (_) { threw11 = true; }
  ok('不抛异常', !threw11);
  ok('failed 计数 +1', MT.stats().failed === 1, MT.stats().failed);

  /* ---------------- T12 打分链路不受影响 ---------------- */
  say('');
  say('[T12] 调用次数与返回长度统计');
  resetAll();
  const r12 = MemoryManager.getMemoryAppPromptMemories([{ id: 1 }, { id: 2 }, { id: 3 }], []);
  ok('返回 3 条', r12.length === 3);
  await flush();
  ok('calls 计数 +1', MT.stats().calls === 1, MT.stats().calls);
  ok('picked = 3', MT.stats().picked === 3, MT.stats().picked);
  ok('touched = 3', MT.stats().touched === 3, MT.stats().touched);

  /* ---------------- 汇总 ---------------- */
  say('');
  say('================================');
  say('通过 ' + pass + ' / 合计 ' + (pass + fail) + (fail ? '  [有失败]' : '  [全部通过]'));
  fs.writeFileSync('D:/叉叉机/_test-memory-out.txt', LOG.join('\n'), 'utf8');
  process.exit(fail ? 1 : 0);
})().catch(e => {
  LOG.push('EXCEPTION: ' + (e && e.stack || e));
  fs.writeFileSync('D:/叉叉机/_test-memory-out.txt', LOG.join('\n'), 'utf8');
  process.exit(1);
});
