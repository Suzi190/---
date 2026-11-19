/* 契约检查：memory-access-touch-patch.js 依赖的 4 个接口在真实文件里是否还成立
 * 任何一项变红，说明 app-init.js / db-manager-full.js 被改动，补丁需要跟着改 */
const fs = require('fs');
function read(p) { return fs.readFileSync(p, 'utf8'); }

const JS = 'D:/叉叉机/叉叉机/js/';
const ai = read(JS + 'app-init.js');
const dbm = read(JS + 'db-manager-full.js');
const patch = read(JS + 'memory-access-touch-patch.js');
const ll = read(JS + 'lazy-loader.js');

let pass = 0, fail = 0;
function ok(n, c, e) {
  if (c) { pass++; console.log('  PASS  ' + n); }
  else { fail++; console.log('  FAIL  ' + n + (e !== undefined ? '   << ' + e : '')); }
}
function cnt(s, k) { return s.split(k).length - 1; }

console.log('=== memory-access-touch 契约检查 ===');
console.log('');

console.log('[A] app-init.js 提供的接口');
ok('MemoryManager 是全局对象字面量', cnt(ai, 'MemoryManager={') === 1, cnt(ai, 'MemoryManager={'));
ok('getMemoryAppPromptMemories 是 MemoryManager 的方法', cnt(ai, 'getMemoryAppPromptMemories(memories=[]') === 1);
ok('getMemoryAppPromptMemories 只有 1 处调用（注入 prompt 的唯一入口）', cnt(ai, 'this.getMemoryAppPromptMemories(') === 1, cnt(ai, 'this.getMemoryAppPromptMemories('));
ok('遗忘曲线读 lastAccessAt（P3）', cnt(ai, 'Number(memory?.lastAccessAt)||0') === 1);
ok('遗忘曲线把 lastAccessAt 塞进 eventTime 算年龄', cnt(ai, 'getMemoryAgeDays(lastAccessTs>0?') === 1);
ok('getMemoryAgeDays 只认 eventTime/timestamp/time', cnt(ai, 'function getMemoryAgeDays(memory)') === 1);

console.log('');
console.log('[B] 数据库表结构');
ok('longTermMemories 表存在且主键是 ++id（数字自增）', cnt(dbm, 'longTermMemories:"++id') === 1);

console.log('');
console.log('[C] 补丁自身');
ok('写 lastAccessAt', cnt(patch, 'lastAccessAt') >= 3, cnt(patch, 'lastAccessAt'));
ok('写 accessCount', cnt(patch, 'accessCount') >= 3, cnt(patch, 'accessCount'));
ok('字段名与读端完全一致（大小写照抄）', patch.indexOf('lastAccessAt: nextTs') > 0);
ok('有节流常量', patch.indexOf('TOUCH_MIN_GAP') > 0);
ok('有部分推进比例', patch.indexOf('ADVANCE_RATIO') > 0);
ok('包装标记 __accessTouchWrapped', patch.indexOf('__accessTouchWrapped') > 0);
ok('无 BOM / 无坏字符', (function () {
  const b = fs.readFileSync(JS + 'memory-access-touch-patch.js');
  return b[0] !== 0xEF && patch.split('\uFFFD').length - 1 === 0;
})());

console.log('');
console.log('[D] 加载顺序（补丁必须在 app-init.js 之后）');
const iCrit = ll.indexOf('criticalScripts=[');
const iBg = ll.indexOf('backgroundScripts=');
const iApp = ll.indexOf('app-init.js');
const iPatch = ll.indexOf('memory-access-touch-patch.js');
ok('已注册到 lazy-loader', iPatch > 0);
ok('在 criticalScripts 数组区间内', iCrit > 0 && iCrit < iPatch && iPatch < iBg, 'crit=' + iCrit + ' patch=' + iPatch + ' bg=' + iBg);
ok('排在 app-init.js 之后', iPatch > iApp, 'app=' + iApp);
ok('加载器是串行队列（script.async=!1）', ll.indexOf('script.async=!1') > 0);

console.log('');
console.log('================================');
console.log('通过 ' + pass + ' / 合计 ' + (pass + fail) + (fail ? '  [有失败]' : '  [全部通过]'));
process.exit(fail ? 1 : 0);
