const fs = require('fs');
const vm = require('vm');

global.window = global;
global.setInterval = () => 0;
global.clearInterval = () => { };
global.document = {
  readyState: 'complete', addEventListener() { }, getElementById() { return null; },
  createElement() { return { style: {}, appendChild() { }, addEventListener() { }, setAttribute() { }, remove() { }, querySelector() { return null; } }; },
  body: { appendChild() { } }
};
global.FileReader = class {
  readAsArrayBuffer(f) { this.result = f._buf.buffer.slice(f._buf.byteOffset, f._buf.byteOffset + f._buf.byteLength); setTimeout(() => this.onload && this.onload(), 0); }
  readAsText(f) { this.result = f._buf.toString('utf8'); setTimeout(() => this.onload && this.onload(), 0); }
  readAsDataURL(f) { this.result = 'data:image/png;base64,' + f._buf.toString('base64'); setTimeout(() => this.onload && this.onload(), 0); }
};
const _l = console.log; console.log = () => { };
vm.runInThisContext(fs.readFileSync('D:/叉叉机/叉叉机/js/st-char-import.js', 'utf8'));
console.log = _l;

const out = [];
function say(s) { out.push(s); }

(async () => {
  const png = fs.readFileSync('D:/叉叉机/测试角色卡-林晚.png');
  const r = await window.STCharImport.parseCardFile({ name: '测试角色卡-林晚.png', size: png.length, _buf: png });
  say('name       = ' + r.name);
  say('format     = ' + r.format + '  (' + r.fileSize + ' bytes)');
  say('greeting   = ' + JSON.stringify(r.greeting).slice(0, 60));
  say('tags       = ' + JSON.stringify(r.tags));
  say('avatar     = ' + r.avatar.slice(0, 40) + '...  (' + r.avatar.length + ' chars)');
  say('prompt 字数 = ' + r.prompt.length);
  say('bookName   = ' + r.bookName);
  say('bookItems  = ' + r.bookItems.length + ' 条');
  r.bookItems.forEach((it, i) => {
    say('   [' + i + '] ' + it.title + '  ' + it.content.length + '字  常驻=' + it.constant + '  keys=' + JSON.stringify(it.keys));
  });

  const staged = r.bookItems.map(it => ({
    title: it.title, content: it.content, constant: it.constant,
    category: r.bookName, _default: true, _sel: true
  }));
  const local = window.STCharImport._test.buildLocalEntries(staged);
  say('\n写入局部世界书：' + local.length + ' 条，id 全唯一=' + (new Set(local.map(e => String(e.id))).size === local.length));
  say('样例: ' + JSON.stringify(local[0]).slice(0, 160));

  const wbBuf = fs.readFileSync('D:/叉叉机/测试世界书-附加.json');
  const wb = await window.STCharImport.parseWorldbookFile({ name: '测试世界书-附加.json', size: wbBuf.length, _buf: wbBuf });
  say('\n附加世界书：' + wb.bookName + ' → ' + wb.bookItems.length + ' 条');
  wb.bookItems.forEach((it, i) => say('   [' + i + '] ' + it.title + '  ' + it.content.length + '字'));

  say('\n[OK] 端到端解析通过');
  fs.writeFileSync('D:/叉叉机/_verify-real-out.txt', out.join('\n'), 'utf8');
  _l(out.join('\n'));
})();
