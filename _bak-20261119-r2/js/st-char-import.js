/* ============================================================
 * st-char-import.js
 * SillyTavern 角色卡导入（PNG / JSON），配套世界书逐条导入。
 *
 * 设计要点：
 *  1. 不改 index.html —— 按钮与弹窗全部由本脚本注入
 *  2. 世界书【逐条】写入角色的「局部世界书」：
 *        SyncStorage: local-worldbook-entries-<charId> = [{id,title,content,category,enabled,...}]
 *     由 app-init.js 的 getLocalWorldbook() 拼成 "[标题]: 内容" 逐行注入 prompt
 *  3. 兼容：V1 卡 / V2 卡 / V3 卡 / 独立世界书 JSON（entries 为对象或数组）
 * ============================================================ */
(function () {
  'use strict';
  if (window.STCharImport) return;

  var VERSION = '20261119r1';
  var DEFAULT_AVATAR = "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 100 100'%3E%3Crect width='100' height='100' fill='%23b8a9c9'/%3E%3C/svg%3E";
  var MAX_ENTRY_CHARS = 4000;     // 单条世界书内容上限，防超长
  var TOKEN_WARN_CHARS = 6000;    // 启用的世界书总字数超过此值就提示

  /* ---------------- 基础工具 ---------------- */

  function esc(s) {
    return String(s == null ? '' : s)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  }

  function trim(s, max) {
    var t = String(s == null ? '' : s).replace(/\r\n/g, '\n').trim();
    return max && t.length > max ? t.slice(0, max) : t;
  }

  var _seq = 0;
  function uid() {
    // 纯数字 id，和项目里 Date.now() 风格一致，但保证同毫秒内不重复
    _seq = (_seq + 1) % 1000;
    return Date.now() * 1000 + _seq;
  }

  function toast(msg, type) {
    try {
      if (typeof window.showToast === 'function') { window.showToast(msg); return; }
    } catch (e) { }
    try {
      if (typeof window.showQQToast === 'function') { window.showQQToast(msg); return; }
    } catch (e) { }
    var el = document.createElement('div');
    el.textContent = msg;
    el.style.cssText = 'position:fixed;left:50%;top:18%;transform:translate(-50%,-50%);z-index:2147483600;'
      + 'background:rgba(0,0,0,.82);color:#fff;padding:10px 18px;border-radius:10px;font-size:13px;'
      + 'max-width:80vw;line-height:1.5;pointer-events:none;transition:opacity .3s;';
    document.body.appendChild(el);
    setTimeout(function () { el.style.opacity = '0'; }, (type === 'error' ? 2600 : 1800));
    setTimeout(function () { try { el.remove(); } catch (e) { } }, 3200);
  }

  /* ---------------- 二进制 → 文本 ---------------- */

  function readFileAsArrayBuffer(file) {
    return new Promise(function (resolve, reject) {
      var fr = new FileReader();
      fr.onload = function () { resolve(fr.result); };
      fr.onerror = function () { reject(new Error('文件读取失败')); };
      fr.readAsArrayBuffer(file);
    });
  }

  function readFileAsText(file) {
    return new Promise(function (resolve, reject) {
      var fr = new FileReader();
      fr.onload = function () { resolve(String(fr.result || '')); };
      fr.onerror = function () { reject(new Error('文件读取失败')); };
      fr.readAsText(file, 'utf-8');
    });
  }

  function readFileAsDataUrl(file) {
    return new Promise(function (resolve, reject) {
      var fr = new FileReader();
      fr.onload = function () { resolve(String(fr.result || '')); };
      fr.onerror = function () { reject(new Error('文件读取失败')); };
      fr.readAsDataURL(file);
    });
  }

  function base64ToUtf8(b64) {
    var clean = String(b64 || '').replace(/[\r\n\s]/g, '');
    var bin = atob(clean);
    var len = bin.length;
    var bytes = new Uint8Array(len);
    for (var i = 0; i < len; i++) bytes[i] = bin.charCodeAt(i);
    if (typeof TextDecoder === 'function') return new TextDecoder('utf-8').decode(bytes);
    var out = '';
    for (var j = 0; j < len; j++) out += '%' + ('00' + bytes[j].toString(16)).slice(-2);
    try { return decodeURIComponent(out); } catch (e) { return bin; }
  }

  var PNG_SIG = [137, 80, 78, 71, 13, 10, 26, 10];

  /* 从 PNG 中抽出所有文本块，返回 { chara: '...', ccv3: '...', ... } */
  function parsePngTextChunks(buffer) {
    var bytes = new Uint8Array(buffer);
    var out = {};
    var ok = true;
    for (var s = 0; s < 8; s++) { if (bytes[s] !== PNG_SIG[s]) { ok = false; break; } }
    if (!ok) throw new Error('不是有效的 PNG 文件');

    var dv = new DataView(buffer);
    var off = 8;
    while (off + 8 <= bytes.length) {
      var len = dv.getUint32(off);
      var type = String.fromCharCode(bytes[off + 4], bytes[off + 5], bytes[off + 6], bytes[off + 7]);
      var dataStart = off + 8;
      if (dataStart + len > bytes.length) break;

      if (type === 'tEXt' || type === 'iTXt') {
        var chunk = bytes.subarray(dataStart, dataStart + len);
        var z = -1;
        for (var i = 0; i < chunk.length; i++) { if (chunk[i] === 0) { z = i; break; } }
        if (z > 0) {
          var keyword = '';
          for (var k = 0; k < z; k++) keyword += String.fromCharCode(chunk[k]);
          var text = '';
          if (type === 'tEXt') {
            for (var t = z + 1; t < chunk.length; t++) text += String.fromCharCode(chunk[t]);
          } else {
            // iTXt: keyword\0 [压缩标志1][压缩方法1] 语言tag\0 翻译关键词\0 正文(UTF-8)
            var p = z + 3;
            while (p < chunk.length && chunk[p] !== 0) p++;  // 跳过 languageTag
            p++;
            while (p < chunk.length && chunk[p] !== 0) p++;  // 跳过 translatedKeyword
            p++;
            var sub = chunk.subarray(p);
            if (typeof TextDecoder === 'function') text = new TextDecoder('utf-8').decode(sub);
            else { for (var q = 0; q < sub.length; q++) text += String.fromCharCode(sub[q]); }
          }
          if (keyword) out[keyword] = text;
        }
      }
      off = dataStart + len + 4; // 跳过数据 + CRC
    }
    return out;
  }

  /* ---------------- 角色卡解析 ---------------- */

  function pickText() {
    for (var i = 0; i < arguments.length; i += 2) {
      var obj = arguments[i], keys = arguments[i + 1];
      if (!obj) continue;
      for (var j = 0; j < keys.length; j++) {
        var v = obj[keys[j]];
        if (v != null && String(v).trim() !== '') return String(v).trim();
      }
    }
    return '';
  }

  /* 统一成 V2 data 的形状；V1 卡直接当 data 用 */
  function unwrapCard(raw) {
    if (!raw || typeof raw !== 'object') throw new Error('卡片内容为空或格式不正确');
    if (raw.data && typeof raw.data === 'object' && (raw.spec || raw.spec_version)) return raw.data;
    if (raw.data && typeof raw.data === 'object' && raw.data.name) return raw.data;
    return raw; // V1
  }

  /* 把 description / personality / scenario ... 拼成一段人设 prompt */
  function buildPromptText(d, name) {
    var parts = [];
    var desc = pickText(d, ['description']);
    var pers = pickText(d, ['personality']);
    var scen = pickText(d, ['scenario']);
    var sysp = pickText(d, ['system_prompt']);
    var exam = pickText(d, ['mes_example']);
    var post = pickText(d, ['post_history_instructions']);

    parts.push('【角色名】\n' + name);
    if (desc) parts.push('【人物设定】\n' + desc);
    if (pers) parts.push('【性格】\n' + pers);
    if (scen) parts.push('【场景背景】\n' + scen);
    if (sysp) parts.push('【系统指令】\n' + sysp);
    if (exam) parts.push('【说话示例】\n' + exam);
    if (post) parts.push('【补充要求】\n' + post);

    return parts.join('\n\n');
  }

  /* character_book 里的条目拆成数组；entries 可能是对象(原生世界书)也可能是数组(V2) */
  function extractBookEntries(book) {
    if (!book) return [];
    var raw = book.entries;
    var list = [];
    if (Array.isArray(raw)) list = raw;
    else if (raw && typeof raw === 'object') {
      list = Object.keys(raw).map(function (k) { return raw[k]; });
    }
    var out = [];
    for (var i = 0; i < list.length; i++) {
      var e = list[i];
      if (!e || typeof e !== 'object') continue;
      if (e.enabled === false || e.disable === true) continue;   // ST 里已关闭的条目直接跳过
      var content = trim(e.content, 0);
      if (!content) continue;

      var keys = [];
      if (Array.isArray(e.keys)) keys = e.keys;
      else if (Array.isArray(e.key)) keys = e.key;
      else if (typeof e.key === 'string' && e.key) keys = [e.key];
      keys = keys.map(function (x) { return String(x || '').trim(); }).filter(Boolean);

      var title = pickText(e, ['comment', 'name', 'title']);
      if (!title) title = keys.length ? keys.slice(0, 3).join('/') : ('条目 ' + (i + 1));

      out.push({
        title: title.slice(0, 80),
        content: content,
        keys: keys,
        constant: e.constant === true || e.constant === 1,
        sourceEnabled: e.enabled !== false && e.disable !== true,
        order: Number(e.insertion_order != null ? e.insertion_order : e.order) || 100
      });
    }
    /* 常驻条目优先（基础设定先铺垫），同组内按 insertion_order */
    out.sort(function (a, b) {
      if (a.constant !== b.constant) return a.constant ? -1 : 1;
      return a.order - b.order;
    });
    return out;
  }

  /* ---------------- 与项目对接 ---------------- */

  function saveLocalEntries(charId, entries) {
    if (!charId) throw new Error('缺少角色 ID');
    try {
      if (typeof window.saveLocalWorldbookEntries === 'function') {
        window.saveLocalWorldbookEntries(charId, entries);
        return 'fn';
      }
    } catch (e) { /* 落到下面 */ }
    if (!window.SyncStorage) throw new Error('存储层不可用（SyncStorage 未就绪）');
    window.SyncStorage.setItem('local-worldbook-entries-' + charId, JSON.stringify(entries));
    return 'storage';
  }

  function getLocalEntries(charId) {
    try {
      if (typeof window.getLocalWorldbookEntries === 'function') {
        var a = window.getLocalWorldbookEntries(charId);
        return Array.isArray(a) ? a : [];
      }
    } catch (e) { }
    try {
      return JSON.parse(window.SyncStorage.getItem('local-worldbook-entries-' + charId) || '[]');
    } catch (e) { return []; }
  }

  function getContactManager() {
    if (window.ContactManager && typeof window.ContactManager.addContact === 'function') return window.ContactManager;
    return null;
  }

  /* ---------------- 文件解析入口 ---------------- */

  function extOf(name) {
    var s = String(name || '');
    var i = s.lastIndexOf('.');
    return i < 0 ? '' : s.slice(i + 1).toLowerCase();
  }

  /* 解析角色卡文件 → 角色字段 + 世界书条目 */
  async function parseCardFile(file) {
    var ext = extOf(file && file.name);
    var card = null, avatar = DEFAULT_AVATAR, format = '';

    if (ext === 'png') {
      var buf = await readFileAsArrayBuffer(file);
      var chunks;
      try { chunks = parsePngTextChunks(buf); }
      catch (e) { throw new Error('PNG 解析失败：' + e.message); }

      var b64 = chunks.chara || chunks.ccv3 || chunks.character || chunks.ccv2 || '';
      if (!b64) throw new Error('这张 PNG 里没有角色卡数据，可能不是 SillyTavern 角色卡');
      var jsonText;
      try { jsonText = base64ToUtf8(b64); }
      catch (e) { throw new Error('卡片数据解码失败：' + e.message); }
      try { card = JSON.parse(jsonText); }
      catch (e) { throw new Error('卡片 JSON 解析失败（文件可能已损坏）'); }

      try { avatar = await readFileAsDataUrl(file); } catch (e) { avatar = DEFAULT_AVATAR; }
      format = 'PNG 角色卡';
    } else if (ext === 'json') {
      var txt = await readFileAsText(file);
      if (!txt.trim()) throw new Error('文件是空的');
      var parsed;
      try { parsed = JSON.parse(txt); }
      catch (e) { throw new Error('JSON 解析失败（文件可能已损坏）'); }
      if (Array.isArray(parsed)) parsed = parsed[0];
      card = parsed;
      format = 'JSON 角色卡';
    } else if (ext === 'charx') {
      throw new Error('暂不支持 .charx（压缩卡），请在酒馆里导出为 .png 或 .json');
    } else {
      throw new Error('只支持 .png / .json 文件，当前是 .' + ext);
    }

    var d = unwrapCard(card);
    var name = pickText(d, ['name', 'char_name']) || pickText(card, ['name']);
    if (!name) throw new Error('卡片里没有角色名，可能不是角色卡');

    var promptText = buildPromptText(d, name);
    var greeting = pickText(d, ['first_mes', 'first_message', 'greeting']);
    if (!greeting && Array.isArray(d.alternate_greetings) && d.alternate_greetings.length) {
      greeting = trim(d.alternate_greetings[0], 0);
    }

    var tags = ['AI 角色'];
    if (Array.isArray(d.tags)) {
      d.tags.forEach(function (t) {
        var v = trim(t, 20);
        if (v && tags.indexOf(v) < 0 && tags.length < 8) tags.push(v);
      });
    }

    var book = d.character_book || card.character_book || null;
    var bookName = (book && pickText(book, ['name'])) || (name + ' 世界书');

    return {
      ok: true,
      format: format,
      fileName: file.name,
      fileSize: file.size,
      name: name,
      remark: name,
      avatar: avatar,
      prompt: promptText,
      greeting: greeting,
      tags: tags,
      bookName: bookName,
      bookItems: extractBookEntries(book),
      extras: []
    };
  }

  /* 解析附加世界书文件（ST 导出的 .json），合并进同一角色 */
  async function parseWorldbookFile(file) {
    var ext = extOf(file && file.name);
    if (ext !== 'json') throw new Error('世界书只支持 .json 文件');
    var txt = await readFileAsText(file);
    var raw;
    try { raw = JSON.parse(txt); } catch (e) { throw new Error('JSON 解析失败：' + file.name); }
    if (Array.isArray(raw)) raw = raw[0];

    var book = null;
    if (raw && raw.entries) book = raw;
    else if (raw && raw.data && raw.data.character_book) book = raw.data.character_book;
    else throw new Error('这个文件里没有世界书条目（entries）：' + file.name);

    var items = extractBookEntries(book);
    if (!items.length) throw new Error('世界书条目全是空的：' + file.name);

    return {
      ok: true,
      fileName: file.name,
      bookName: pickText(book, ['name', 'title']) || file.name.replace(/\.json$/i, ''),
      bookItems: items
    };
  }

  /* ---------------- 导入提交 ---------------- */

  /* 把预览列表里勾选的条目转成「局部世界书」条目（逐条，绝不合并） */
  function buildLocalEntries(items) {
    var out = [];
    for (var i = 0; i < items.length; i++) {
      var it = items[i];
      if (!it || !it._sel) continue;
      var content = trim(it.content, MAX_ENTRY_CHARS);
      if (!content) continue;
      out.push({
        id: uid(),
        title: trim(it.title, 80) || ('条目 ' + (i + 1)),
        content: content,
        category: trim(it.category, 40) || '导入世界书',
        enabled: true,
        isGlobalRef: false
      });
    }
    return out;
  }

  async function doImport() {
    var st = state;
    if (!st || !st.card || st.busy) return;

    var cm = getContactManager();
    if (!cm) { toast('联系人模块还没就绪，请稍后再点一次', 'error'); return; }

    var localEntries = buildLocalEntries(st.items || []);
    if (!localEntries.length && (st.items || []).length > 0) {
      if (!confirm('你一条世界书都没勾选，角色会没有人设之外的世界设定。仍要继续吗？')) return;
    }

    var charId = 'char-' + Date.now();
    var persona = {
      id: charId,
      name: st.card.name,
      gender: 'none',
      remark: st.card.remark || st.card.name,
      avatar: st.card.avatar || DEFAULT_AVATAR,
      tags: st.card.tags || ['AI 角色'],
      prompt: st.card.prompt,
      greeting: st.card.greeting || '',
      voiceId: 'zh-CN-XiaoxiaoNeural',
      type: 'friend',
      contactGroup: '未分组'
    };

    st.busy = true;
    setFooterText('正在创建角色…');
    try {
      var added = await cm.addContact(persona, { skipRender: false, refreshBalance: false });
      if (added === false) { throw new Error('角色保存失败（该角色可能已在通讯录中）'); }
    } catch (e) {
      st.busy = false;
      setFooterText('');
      toast('导入失败：' + (e && e.message ? e.message : e), 'error');
      return;
    }

    /* 写世界书：逐条追加到该角色的局部世界书 */
    var savedCount = 0;
    if (localEntries.length) {
      setFooterText('正在写入世界书 ' + localEntries.length + ' 条…');
      try {
        var existing = getLocalEntries(charId);
        var merged = existing.concat(localEntries);
        saveLocalEntries(charId, merged);
        savedCount = localEntries.length;
      } catch (e) {
        toast('角色已创建，但世界书写入失败：' + (e && e.message ? e.message : e), 'error');
        console.error('[st-char-import] 世界书写入失败', e);
      }
    }

    st.busy = false;
    closeModal();

    var msg = '✅ 已导入「' + st.card.name + '」';
    if (savedCount) msg += '，世界书 ' + savedCount + ' 条';
    toast(msg);

    try {
      if (typeof window.renderContactsList === 'function') window.renderContactsList();
    } catch (e) { }
    try {
      if (typeof window.renderLocalWorldbookList === 'function') window.renderLocalWorldbookList();
    } catch (e) { }
    try {
      window.dispatchEvent(new CustomEvent('mix:contacts-updated', { detail: { charId: charId } }));
    } catch (e) { }

    console.log('[st-char-import] 导入完成', { charId: charId, entries: savedCount });
  }

  /* ---------------- UI ---------------- */

  var state = { card: null, items: [], extras: [], onlyConstant: false, busy: false };
  var modalEl = null;

  function setFooterText(txt) {
    var el = document.getElementById('st-import-status');
    if (el) el.textContent = txt || '';
  }

  function buildModal() {
    var mask = document.createElement('div');
    mask.id = 'st-import-mask';
    mask.style.cssText = 'position:fixed;inset:0;z-index:2147483500;background:rgba(0,0,0,.45);'
      + 'display:none;align-items:center;justify-content:center;padding:16px;';

    mask.innerHTML = ''
      + '<div id="st-import-box" style="width:100%;max-width:460px;max-height:88vh;display:flex;flex-direction:column;'
      + 'background:#fff;border-radius:16px;overflow:hidden;box-shadow:0 12px 40px rgba(0,0,0,.28);">'
      + '  <div style="display:flex;align-items:center;justify-content:space-between;padding:14px 16px;'
      + '       border-bottom:1px solid #f0f0f0;">'
      + '    <div style="font-size:15px;font-weight:700;color:#111;">导入角色卡</div>'
      + '    <div id="st-import-x" style="font-size:22px;line-height:1;color:#aaa;cursor:pointer;padding:0 4px;">&times;</div>'
      + '  </div>'
      + '  <div style="padding:14px 16px;overflow:auto;flex:1;">'
      + '    <div style="font-size:12px;color:#888;line-height:1.7;margin-bottom:10px;">'
      + '      支持 SillyTavern 角色卡：<b>.png</b>（含内嵌数据）或 <b>.json</b>。'
      + '      卡内世界书会<b>逐条</b>写进该角色的「局部世界书」。'
      + '    </div>'
      + '    <div style="font-size:12px;font-weight:600;color:#444;margin:10px 0 6px;">① 角色卡</div>'
      + '    <input type="file" id="st-import-card-file" accept=".png,.json" '
      + '      style="width:100%;font-size:12px;padding:8px;border:1px dashed #d0c4e8;border-radius:10px;background:#faf8ff;">'
      + '    <div style="font-size:12px;font-weight:600;color:#444;margin:12px 0 6px;">② 附加世界书（可选，可多选）</div>'
      + '    <input type="file" id="st-import-book-file" accept=".json" multiple '
      + '      style="width:100%;font-size:12px;padding:8px;border:1px dashed #d0c4e8;border-radius:10px;background:#faf8ff;">'
      + '    <div id="st-import-preview" style="margin-top:14px;"></div>'
      + '  </div>'
      + '  <div style="display:flex;align-items:center;gap:8px;padding:12px 16px;border-top:1px solid #f0f0f0;background:#fcfcfc;">'
      + '    <div id="st-import-status" style="flex:1;font-size:11px;color:#888;line-height:1.4;"></div>'
      + '    <button id="st-import-cancel" type="button" style="padding:9px 16px;border:none;border-radius:10px;'
      + '      background:#eee;color:#444;font-size:13px;font-weight:600;cursor:pointer;">取消</button>'
      + '    <button id="st-import-ok" type="button" disabled style="padding:9px 18px;border:none;border-radius:10px;'
      + '      background:#7c4dff;color:#fff;font-size:13px;font-weight:600;cursor:pointer;opacity:.45;">确认导入</button>'
      + '  </div>'
      + '</div>';

    document.body.appendChild(mask);

    document.getElementById('st-import-x').addEventListener('click', closeModal);
    document.getElementById('st-import-cancel').addEventListener('click', closeModal);
    document.getElementById('st-import-ok').addEventListener('click', doImport);
    document.getElementById('st-import-card-file').addEventListener('change', onCardFileChange);
    document.getElementById('st-import-book-file').addEventListener('change', onBookFileChange);

    mask.addEventListener('click', function (e) { if (e.target === mask) closeModal(); });

    return mask;
  }

  function openModal() {
    if (!modalEl) modalEl = buildModal();
    state.card = null;
    state.items = [];
    state.extras = [];
    state.onlyConstant = false;
    state.busy = false;
    renderPreview();
    modalEl.style.display = 'flex';
  }

  function closeModal() {
    if (modalEl) modalEl.style.display = 'none';
    setFooterText('');
  }



  /* ---------------- 预览 ---------------- */

  function rebuildItems() {
    var items = [];
    if (state.card && state.card.bookItems && state.card.bookItems.length) {
      state.card.bookItems.forEach(function (it) {
        items.push({
          title: it.title, content: it.content, constant: it.constant,
          category: state.card.bookName,
          _default: it.sourceEnabled !== false,
          _sel: it.sourceEnabled !== false
        });
      });
    }
    state.extras.forEach(function (ex) {
      (ex.bookItems || []).forEach(function (it) {
        items.push({
          title: it.title, content: it.content, constant: it.constant,
          category: ex.bookName,
          _default: it.sourceEnabled !== false,
          _sel: it.sourceEnabled !== false
        });
      });
    });
    state.items = items;
    applyOnlyConstant();
  }

  function applyOnlyConstant() {
    var only = !!state.onlyConstant;
    state.items.forEach(function (it) {
      it._sel = only ? !!(it.constant && it._default) : it._default;
    });
  }

  function selectedStats() {
    var n = 0, chars = 0;
    state.items.forEach(function (it) {
      if (!it._sel) return;
      n++;
      chars += String(it.content || '').length;
    });
    return { count: n, chars: chars, total: state.items.length };
  }

  function renderPreview() {
    var box = document.getElementById('st-import-preview');
    var okBtn = document.getElementById('st-import-ok');
    if (!box) return;

    if (!state.card) {
      box.innerHTML = '<div style="padding:18px 0;text-align:center;color:#bbb;font-size:12px;">'
        + '还没有选择角色卡</div>';
      if (okBtn) { okBtn.disabled = true; okBtn.style.opacity = '.45'; }
      return;
    }

    var c = state.card;
    var st = selectedStats();
    var warn = st.chars > TOKEN_WARN_CHARS;
    var sizeKb = (c.fileSize / 1024).toFixed(1);

    var html = ''
      + '<div style="display:flex;gap:12px;align-items:center;padding:10px;background:#faf8ff;border-radius:12px;">'
      + '  <img src="' + esc(c.avatar) + '" alt="" style="width:54px;height:54px;border-radius:12px;object-fit:cover;background:#e8e0f5;">'
      + '  <div style="flex:1;min-width:0;">'
      + '    <div style="font-size:14px;font-weight:700;color:#222;">' + esc(c.name) + '</div>'
      + '    <div style="font-size:11px;color:#999;margin-top:2px;">'
      + esc(c.format) + ' · ' + sizeKb + ' KB</div>'
      + '    <div style="font-size:11px;color:#999;margin-top:1px;">人设 '
      + String(c.prompt || '').length + ' 字 · 开场白 '
      + String(c.greeting || '').length + ' 字</div>'
      + '  </div>'
      + '</div>';

    box.innerHTML = html + renderBookSection(st, warn);
    if (okBtn) { okBtn.disabled = false; okBtn.style.opacity = '1'; }
    bindPreviewEvents();
  }

  /* 世界书条目列表 */
  function renderBookSection(st, warn) {
    if (!state.items.length) {
      return '<div style="margin-top:14px;padding:12px;background:#fff8e1;border-radius:10px;'
        + 'font-size:11px;color:#8d6e00;line-height:1.6;">'
        + '这张卡没有内嵌世界书。你可以在下面「②附加世界书」里再选 .json 文件，'
        + '或者导入后在聊天设置里手动添加。</div>';
    }

    var html = ''
      + '<div style="display:flex;align-items:center;justify-content:space-between;margin:14px 0 6px;">'
      + '  <div style="font-size:12px;font-weight:600;color:#444;">世界书条目</div>'
      + '  <label style="display:flex;align-items:center;gap:5px;font-size:11px;color:#7c4dff;cursor:pointer;">'
      + '    <input type="checkbox" id="st-import-only-const"' + (state.onlyConstant ? ' checked' : '') + '>'
      + '    只启用常驻条目'
      + '  </label>'
      + '</div>'
      + '<div id="st-import-stat" style="font-size:11px;'
      + (warn ? 'color:#e64a19;font-weight:600;' : 'color:#888;') + 'margin-bottom:6px;">'
      + '共 ' + st.total + ' 条，已勾选 ' + st.count + ' 条，约 ' + st.chars + ' 字'
      + (warn ? '（偏多，会明显占用上下文，建议只启用常驻条目）' : '')
      + '</div>'
      + '<div id="st-import-list" style="max-height:210px;overflow:auto;'
      + 'border:1px solid #f0f0f0;border-radius:10px;padding:2px 10px;">';

    state.items.forEach(function (it, idx) {
      var tag = it.constant
        ? '<span style="color:#7c4dff;font-size:10px;margin-left:5px;">常驻</span>' : '';
      var preview = trim(String(it.content || '').replace(/\n+/g, ' '), 60);
      html += ''
        + '<label style="display:flex;gap:8px;padding:7px 0;border-bottom:1px solid #f7f7f7;'
        + 'align-items:flex-start;cursor:pointer;">'
        + '  <input type="checkbox" data-idx="' + idx + '"' + (it._sel ? ' checked' : '')
        + '    style="margin-top:3px;flex:none;">'
        + '  <div style="flex:1;min-width:0;">'
        + '    <div style="font-size:12px;color:#333;line-height:1.5;">' + esc(it.title)
        + '      <span style="color:#bbb;font-size:10px;margin-left:5px;">'
        + String(it.content || '').length + ' 字</span>' + tag + '</div>'
        + '    <div style="font-size:11px;color:#aaa;overflow:hidden;text-overflow:ellipsis;'
        + 'white-space:nowrap;">' + esc(preview) + '</div>'
        + '  </div>'
        + '</label>';
    });

    return html + '</div>';
  }

  /* 只刷新那行统计文字，不重绘整张列表（避免闪动/丢滚动位置） */
  function refreshStat() {
    var stat = document.getElementById('st-import-stat');
    if (!stat) return;
    var s = selectedStats();
    var w = s.chars > TOKEN_WARN_CHARS;
    stat.textContent = '共 ' + s.total + ' 条，已勾选 ' + s.count + ' 条，约 ' + s.chars + ' 字'
      + (w ? '（偏多，会明显占用上下文，建议只启用常驻条目）' : '');
    stat.style.color = w ? '#e64a19' : '#888';
    stat.style.fontWeight = w ? '600' : '400';
  }

  function bindPreviewEvents() {
    var list = document.getElementById('st-import-list');
    if (list) {
      list.addEventListener('change', function (e) {
        var t = e.target;
        if (!t || t.tagName !== 'INPUT' || !t.hasAttribute('data-idx')) return;
        var i = Number(t.getAttribute('data-idx'));
        if (state.items[i]) state.items[i]._sel = !!t.checked;
        refreshStat();
      });
    }
    var oc = document.getElementById('st-import-only-const');
    if (oc) {
      oc.addEventListener('change', function () {
        state.onlyConstant = !!oc.checked;
        applyOnlyConstant();
        renderPreview();
      });
    }
  }

  /* ---------------- 文件选择 ---------------- */

  async function onCardFileChange(e) {
    var file = e.target.files && e.target.files[0];
    if (!file) return;
    setFooterText('正在解析角色卡…');
    try {
      var card = await parseCardFile(file);
      state.card = card;
      rebuildItems();
      setFooterText('');
      renderPreview();
      if (card.bookItems.length) {
        toast('已识别「' + card.name + '」，世界书 ' + card.bookItems.length + ' 条');
      } else {
        toast('已识别「' + card.name + '」（卡内无世界书）');
      }
    } catch (err) {
      state.card = null;
      state.items = [];
      setFooterText('');
      renderPreview();
      toast(err && err.message ? err.message : '解析失败', 'error');
      e.target.value = '';
      console.error('[st-char-import] 角色卡解析失败', err);
    }
  }

  async function onBookFileChange(e) {
    var files = Array.prototype.slice.call(e.target.files || []);
    if (!files.length) return;
    setFooterText('正在解析世界书…');
    var okCount = 0, fails = [];
    for (var i = 0; i < files.length; i++) {
      try {
        var bk = await parseWorldbookFile(files[i]);
        state.extras.push(bk);
        okCount++;
      } catch (err) {
        fails.push((files[i].name || '文件') + '：' + (err && err.message ? err.message : '解析失败'));
      }
    }
    rebuildItems();
    setFooterText('');
    renderPreview();
    if (fails.length) toast(fails[0], 'error');
    else if (okCount) toast('已加入 ' + okCount + ' 个世界书文件');
    e.target.value = '';
  }

  /* ---------------- 按钮注入 ---------------- */

  function ensureButton() {
    var box = document.getElementById('qq-contacts-buttons');
    if (!box) return false;
    if (document.getElementById('st-char-import-btn')) return true;

    var btn = document.createElement('button');
    btn.id = 'st-char-import-btn';
    btn.type = 'button';
    btn.textContent = '导入角色卡';
    btn.style.cssText = 'flex:1;padding:10px 4px;background:#7c4dff;color:#fff;border:none;'
      + 'border-radius:10px;font-size:0.74rem;font-weight:600;cursor:pointer;white-space:nowrap;';
    btn.addEventListener('click', function (e) {
      e.preventDefault();
      e.stopPropagation();
      openModal();
    });
    box.appendChild(btn);
    return true;
  }

  function boot() {
    var tries = 0;
    var timer = setInterval(function () {
      tries++;
      if (ensureButton() || tries >= 150) clearInterval(timer);
    }, 700);

    try {
      window.addEventListener('mix:db-ready', function () { setTimeout(ensureButton, 300); });
    } catch (e) { }
    try {
      window.addEventListener('mix:contacts-updated', function () { setTimeout(ensureButton, 300); });
    } catch (e) { }
  }

  window.STCharImport = {
    version: VERSION,
    open: openModal,
    close: closeModal,
    parseCardFile: parseCardFile,
    parseWorldbookFile: parseWorldbookFile,
    ensureButton: ensureButton,
    /* 以下仅供调试/自检，正常使用不需要 */
    _test: {
      base64ToUtf8: base64ToUtf8,
      parsePngTextChunks: parsePngTextChunks,
      extractBookEntries: extractBookEntries,
      buildLocalEntries: buildLocalEntries,
      buildPromptText: buildPromptText,
      unwrapCard: unwrapCard
    }
  };

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot);
  } else {
    boot();
  }

  console.log('[st-char-import] 已加载 v' + VERSION);
})();
