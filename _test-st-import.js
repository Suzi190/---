/* st-char-import.js 自检脚本（Node 环境模拟浏览器） */
const fs = require('fs');
const vm = require('vm');

const FILE = 'D:/叉叉机/叉叉机/js/st-char-import.js';
const OUT = 'D:/叉叉机/_test-out.txt';
const log = [];
function say(s) { log.push(s); }

/* ---------- 浏览器最小 mock ---------- */
global.window = global;
global.setInterval = () => 0;
global.clearInterval = () => { };
global.document = {
  readyState: 'complete',
  addEventListener() { },
  getElementById() { return null; },
  createElement() {
    return { style: {}, appendChild() { }, addEventListener() { }, setAttribute() { }, remove() { }, querySelector() { return null; } };
  },
  body: { appendChild() { } }
};
global.FileReader = class {
  readAsArrayBuffer(file) {
    this.result = file._buf.buffer.slice(file._buf.byteOffset, file._buf.byteOffset + file._buf.byteLength);
    setTimeout(() => { if (this.onload) this.onload(); }, 0);
  }
  readAsText(file) {
    this.result = file._buf.toString('utf8');
    setTimeout(() => { if (this.onload) this.onload(); }, 0);
  }
  readAsDataURL(file) {
    this.result = 'data:image/png;base64,' + file._buf.toString('base64');
    setTimeout(() => { if (this.onload) this.onload(); }, 0);
  }
};
const _stdout = console.log;
console.log = function () { };

/* ---------- 工具 ---------- */
let pass = 0, fail = 0;
function ok(cond, name, extra) {
  if (cond) { pass++; say('  PASS  ' + name); }
  else { fail++; say('  FAIL  ' + name + (extra ? '   << ' + extra : '')); }
}

function makePng(keyword, textValue) {
  const sig = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
  const kw = Buffer.from(keyword, 'latin1');
  const data = Buffer.concat([kw, Buffer.from([0]), Buffer.from(textValue, 'latin1')]);
  const len = Buffer.alloc(4); len.writeUInt32BE(data.length, 0);
  const type = Buffer.from('tEXt', 'latin1');
  const crc = Buffer.alloc(4);
  return Buffer.concat([sig, len, type, data, crc]);
}
function mkFile(name, buf) { return { name: name, size: buf.length, _buf: buf }; }
function b64(s) { return Buffer.from(s, 'utf8').toString('base64'); }

/* ---------- 载入被测脚本 ---------- */
vm.runInThisContext(fs.readFileSync(FILE, 'utf8'), { filename: 'st-char-import.js' });
const API = global.window.STCharImport;
const T = API && API._test;
console.log = _stdout;

say('=== st-char-import 自检 v' + (API && API.version) + ' ===\n');
ok(!!API, '脚本已挂载 window.STCharImport');
ok(!!T, '调试接口 _test 可用');


/* ---------- T1 base64 → UTF-8 ---------- */
(function () {
  say('\n[T1] base64 解码 UTF-8');
  const s = '中文测试 · 剑与魔法';
  ok(T.base64ToUtf8(b64(s)) === s, '中文往返一致');
  ok(T.base64ToUtf8('') === '', '空串安全');
})();

/* ---------- T2 V2 PNG 卡 ---------- */
const v2card = {
  spec: 'chara_card_v2', spec_version: '2.0',
  data: {
    name: '测试角色',
    description: '这是人物设定',
    personality: '冷淡',
    scenario: '雨夜的街道',
    first_mes: '你好啊',
    mes_example: '<START>示例',
    system_prompt: '系统指令X',
    post_history_instructions: '后置要求Y',
    tags: ['幻想', '测试'],
    character_book: {
      name: '测试世界书',
      entries: [
        { keys: ['剑'], content: '第一条内容：剑的来历', enabled: true, comment: '条目A', insertion_order: 100, constant: false },
        { key: ['魔法'], content: '第二条内容：魔法体系', enabled: true, comment: '条目B', insertion_order: 90, constant: true },
        { keys: ['废弃'], content: '这条是禁用的', enabled: false, comment: '条目C', insertion_order: 50 },
        { keys: ['空'], content: '   ', enabled: true, comment: '条目D', insertion_order: 10 }
      ]
    }
  }
};
const v2png = makePng('chara', b64(JSON.stringify(v2card)));

(async function () {
  say('\n[T2] V2 PNG 卡解析');
  let r = await API.parseCardFile(mkFile('card.png', v2png));
  ok(r.name === '测试角色', '角色名', r.name);
  ok(r.greeting === '你好啊', '开场白 first_mes', r.greeting);
  ok(r.prompt.indexOf('【人物设定】') >= 0 && r.prompt.indexOf('这是人物设定') >= 0, 'prompt 含人物设定');
  ok(r.prompt.indexOf('【性格】') >= 0 && r.prompt.indexOf('冷淡') >= 0, 'prompt 含性格');
  ok(r.prompt.indexOf('【场景背景】') >= 0, 'prompt 含场景');
  ok(r.prompt.indexOf('【系统指令】') >= 0, 'prompt 含系统指令');
  ok(r.prompt.indexOf('【说话示例】') >= 0, 'prompt 含说话示例');
  ok(r.prompt.indexOf('【补充要求】') >= 0, 'prompt 含补充要求');
  ok(r.tags.indexOf('AI 角色') === 0 && r.tags.indexOf('幻想') > 0, 'tags 合并', JSON.stringify(r.tags));
  ok(r.avatar.indexOf('data:image/png;base64,') === 0, '头像取自 PNG 本体');
  ok(r.format === 'PNG 角色卡', '格式识别', r.format);

  /* 关键：世界书逐条拆开、过滤禁用与空白、按 order 排序 */
  ok(r.bookItems.length === 2, '世界书保留 2 条（禁用/空白被过滤）', String(r.bookItems.length));
  ok(r.bookItems[0].title === '条目B', '按 order 排序：第一条是条目B', r.bookItems[0].title);
  ok(r.bookItems[1].title === '条目A', '第二条是条目A', r.bookItems[1].title);
  ok(r.bookItems[0].content === '第二条内容：魔法体系', '内容各自独立(A)', r.bookItems[0].content);
  ok(r.bookItems[1].content === '第一条内容：剑的来历', '内容各自独立(B)', r.bookItems[1].content);
  ok(r.bookItems[0].constant === true && r.bookItems[1].constant === false, '常驻标记正确');
  ok(r.bookItems[1].keys[0] === '剑', 'keys 提取正确', JSON.stringify(r.bookItems[1].keys));

  /* ---------- T3 buildLocalEntries：一条一条写，绝不合并 ---------- */
  say('\n[T3] 写入局部世界书的条目（逐条、不合并）');
  const staged = r.bookItems.map(it => ({
    title: it.title, content: it.content, constant: it.constant,
    category: r.bookName, _default: it.sourceEnabled !== false, _sel: true
  }));
  let local = T.buildLocalEntries(staged);
  ok(local.length === 2, '2 条独立条目', String(local.length));
  ok(local[0].content !== local[1].content, '两条内容没有合并成一条');
  ok(local.every(e => e.enabled === true), '全部 enabled');
  ok(local.every(e => !e.isGlobalRef), '不是全局引用');
  ok(local.every(e => e.category === '测试世界书'), 'category = 世界书名', local[0] && local[0].category);
  const ids = local.map(e => String(e.id));
  ok(new Set(ids).size === ids.length, 'id 全唯一，不会互相覆盖', ids.join(','));
  ok(local.every(e => typeof e.id === 'number'), 'id 是数字');

  const many = [];
  for (let i = 0; i < 200; i++) many.push({ title: 't' + i, content: 'c' + i, _sel: true, category: 'x' });
  const manyLocal = T.buildLocalEntries(many);
  const manyIds = manyLocal.map(e => String(e.id));
  ok(manyLocal.length === 200 && new Set(manyIds).size === 200, '200 条同批导入 id 不重复');

  const partial = T.buildLocalEntries([
    { title: 'a', content: 'A', _sel: true, category: 'x' },
    { title: 'b', content: 'B', _sel: false, category: 'x' }
  ]);
  ok(partial.length === 1 && partial[0].title === 'a', '未勾选的条目不写入');

  /* ---------- T4 V1 卡 ---------- */
  say('\n[T4] V1 扁平卡解析');
  const v1 = { name: 'V1角色', description: 'V1描述', first_mes: 'hi v1', personality: '活泼' };
  const r1 = await API.parseCardFile(mkFile('v1.json', Buffer.from(JSON.stringify(v1), 'utf8')));
  ok(r1.name === 'V1角色', 'V1 名字', r1.name);
  ok(r1.greeting === 'hi v1', 'V1 开场白', r1.greeting);
  ok(r1.prompt.indexOf('V1描述') >= 0, 'V1 prompt 含描述');
  ok(r1.bookItems.length === 0, 'V1 无世界书');
  ok(r1.avatar.indexOf('data:image/svg') === 0, 'JSON 卡用默认头像');

  /* ---------- T5 独立世界书 JSON（entries 为对象） ---------- */
  say('\n[T5] 独立世界书 JSON（entries 是对象，ST 原生导出格式）');
  const wb = {
    entries: {
      '0': { uid: 0, key: ['钟楼'], comment: '钟楼', content: '钟楼每晚十二点响', constant: true, disable: false },
      '1': { uid: 1, key: ['秘密'], comment: '秘密', content: '地下有个密室', constant: false, disable: false },
      '2': { uid: 2, key: ['关掉'], comment: '关掉的', content: '不该出现', constant: false, disable: true }
    }
  };
  const wbRes = await API.parseWorldbookFile(mkFile('book.json', Buffer.from(JSON.stringify(wb), 'utf8')));
  ok(wbRes.bookItems.length === 2, '对象格式 entries 解析出 2 条（disable 的排除）', String(wbRes.bookItems.length));
  ok(wbRes.bookItems[0].content === '钟楼每晚十二点响', '内容正确', wbRes.bookItems[0].content);
  ok(wbRes.bookName === 'book', '世界书名兜底用文件名', wbRes.bookName);
  const wbStaged = wbRes.bookItems.map(it => ({
    title: it.title, content: it.content, constant: it.constant,
    category: wbRes.bookName, _sel: true
  }));
  const wbLocal = T.buildLocalEntries(wbStaged);
  ok(wbLocal.length === 2 && wbLocal[0].content !== wbLocal[1].content, '独立世界书同样逐条写入');

  /* ---------- T6 异常输入 ---------- */
  say('\n[T6] 异常输入处理');
  let e1 = null; try { await API.parseCardFile(mkFile('bad.png', Buffer.from('not a png'))); } catch (e) { e1 = e; }
  ok(!!e1, '非 PNG 文件报错', e1 && e1.message);

  const noData = makePng('Comment', 'hello');
  let e2 = null; try { await API.parseCardFile(mkFile('nodata.png', noData)); } catch (e) { e2 = e; }
  ok(!!e2 && e2.message.indexOf('没有角色卡数据') >= 0, 'PNG 无 chara 块时报错', e2 && e2.message);

  let e3 = null; try { await API.parseCardFile(mkFile('x.txt', Buffer.from('hi'))); } catch (e) { e3 = e; }
  ok(!!e3 && e3.message.indexOf('只支持') >= 0, '不支持的扩展名报错', e3 && e3.message);

  let e4 = null; try { await API.parseWorldbookFile(mkFile('empty.json', Buffer.from('{"a":1}'))); } catch (e) { e4 = e; }
  ok(!!e4 && e4.message.indexOf('entries') >= 0, '没有 entries 的世界书报错', e4 && e4.message);

  /* ---------- T7 兼容：ccv3 键名 ---------- */
  say('\n[T7] 兼容性：其他 chunk 键名');
  const png2 = makePng('ccv3', b64(JSON.stringify({ name: 'V3角色', description: 'V3设定' })));
  const r3 = await API.parseCardFile(mkFile('v3.png', png2));
  ok(r3.name === 'V3角色', '识别 ccv3 键', r3.name);

  /* ---------- 汇总 ---------- */
  say('\n================================');
  say('通过 ' + pass + ' / 合计 ' + (pass + fail) + (fail ? '  [有失败]' : '  [全部通过]'));
  fs.writeFileSync(OUT, log.join('\n'), 'utf8');
  _stdout(log.join('\n'));
  _stdout('\n[written] ' + OUT);
  process.exit(fail ? 1 : 0);
})();
