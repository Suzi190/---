/* 生成一张真实可用的测试角色卡（合法 PNG + tEXt/chara）与一份附加世界书 */
const fs = require('fs');
const zlib = require('zlib');

const table = (function () {
  const t = new Int32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = (c & 1) ? (0xedb88320 ^ (c >>> 1)) : (c >>> 1);
    t[n] = c;
  }
  return t;
})();
function crc32(buf) {
  let crc = 0xffffffff;
  for (let i = 0; i < buf.length; i++) crc = table[(crc ^ buf[i]) & 0xff] ^ (crc >>> 8);
  return (crc ^ 0xffffffff) >>> 0;
}
function chunk(type, data) {
  const len = Buffer.alloc(4); len.writeUInt32BE(data.length, 0);
  const t = Buffer.from(type, 'latin1');
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(Buffer.concat([t, data])), 0);
  return Buffer.concat([len, t, data, crc]);
}
function makePng(w, h, texts) {
  const sig = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(w, 0); ihdr.writeUInt32BE(h, 4);
  ihdr[8] = 8; ihdr[9] = 2; ihdr[10] = 0; ihdr[11] = 0; ihdr[12] = 0;
  const stride = 1 + w * 3;
  const raw = Buffer.alloc(h * stride);
  for (let y = 0; y < h; y++) {
    raw[y * stride] = 0;
    for (let x = 0; x < w; x++) {
      const o = y * stride + 1 + x * 3;
      const k = (x + y) / (w + h);
      raw[o] = Math.round(110 + 90 * k);
      raw[o + 1] = Math.round(80 + 60 * k);
      raw[o + 2] = Math.round(170 + 60 * (1 - k));
    }
  }
  const parts = [sig, chunk('IHDR', ihdr)];
  texts.forEach(tc => {
    const data = Buffer.concat([
      Buffer.from(tc.k, 'latin1'), Buffer.from([0]), Buffer.from(tc.v, 'latin1')
    ]);
    parts.push(chunk('tEXt', data));
  });
  parts.push(chunk('IDAT', zlib.deflateSync(raw)), chunk('IEND', Buffer.alloc(0)));
  return Buffer.concat(parts);
}

const card = {
  spec: 'chara_card_v2',
  spec_version: '2.0',
  data: {
    name: '林晚',
    description: '林晚，27 岁，老城区一间小画室的店主，画了十年水彩。手指常年沾着洗不掉的颜料。\n说话慢，声音偏低，不太会主动找话题，但聊起画画或旧电影会停不下来。',
    personality: '安静、慢热、有点固执。不喜欢被催促，讨厌客套话。对熟悉的人会露出很笨拙的幽默感。',
    scenario: '雨天的傍晚，画室里只开了一盏台灯，窗外的雨顺着玻璃往下淌。',
    first_mes: '（抬头看了你一眼，把笔在布上蹭了蹭）……伞没带吧。先坐，等雨小点再走。',
    mes_example: '<START>\n{{user}}: 这幅画的是什么？\n{{char}}: （侧了侧身让你看清）教堂后面那条巷子。我小时候住那儿。\n画完才发现我把墙画高了，不过……算了，看着还行。',
    system_prompt: '保持话少、慢节奏。不要主动提供大段信息，回答多为一两句，偶尔停顿。',
    post_history_instructions: '不要用括号描述过多动作，最多一句话。',
    tags: ['日常', '治愈', '慢热'],
    creator: '测试用',
    character_book: {
      name: '林晚的世界书',
      entries: [
        { keys: ['画室', 'studio'], comment: '画室', content: '画室在老城区梧桐巷 17 号二楼，面积很小，靠窗摆一张旧木桌，墙上钉着二十多张没画完的水彩。楼下是家修表铺，老板姓周。', enabled: true, insertion_order: 100, constant: true },
        { keys: ['颜料', '水彩'], comment: '颜料习惯', content: '林晚只用一种老牌子的块状水彩，用到最后会舍不得丢。她有一个铁盒，里面装着十几块只剩指甲盖大小的颜料。', enabled: true, insertion_order: 90, constant: false },
        { keys: ['周师傅', '修表'], comment: '楼下周师傅', content: '楼下的周师傅六十多岁，耳朵不好，但记得林晚每一幅画的样子。他会在下雨天多给她留一把伞。', enabled: true, insertion_order: 80, constant: false },
        { keys: ['旧电影'], comment: '旧电影', content: '林晚喜欢九十年代的老电影，尤其是雨天场景。她有一台老投影仪，偶尔在画室墙上放片，用白布当幕。', enabled: true, insertion_order: 70, constant: false },
        { keys: ['猫'], comment: '画室的猫', content: '画室有只流浪橘猫，林晚会留一碗水，但不承认是自己的猫。', enabled: true, insertion_order: 60, constant: false },
        { keys: ['弃用'], comment: '这条是关掉的测试条目', content: '如果你看到这段，说明禁用过滤失效了。', enabled: false, insertion_order: 10, constant: false }
      ]
    }
  }
};

const b64 = Buffer.from(JSON.stringify(card), 'utf8').toString('base64');
const png = makePng(160, 160, [{ k: 'chara', v: b64 }]);
fs.writeFileSync('D:/叉叉机/测试角色卡-林晚.png', png);

const wb = {
  name: '附加测试世界书',
  entries: {
    '0': { uid: 0, key: ['梧桐巷', '老城区'], comment: '梧桐巷', content: '梧桐巷在城西，整条街都是老房子，两边种着梧桐。夏天下暴雨时巷子会积水，走路要贴着墙根。', constant: true, disable: false },
    '1': { uid: 1, key: ['修表铺'], comment: '修表铺', content: '修表铺的玻璃柜里摆着几十只旧表，大多没人来取。柜台上有台收音机，整天放着本地戏曲。', constant: false, disable: false },
    '2': { uid: 2, key: ['雨'], comment: '这里的雨', content: '这座城的雨常从傍晚开始，一下就是一整夜。老城区排水不好，屋里的墙会返潮。', constant: false, disable: false },
    '3': { uid: 3, key: ['不要的'], comment: '这条也关着', content: '看到这段说明过滤失效。', constant: false, disable: true }
  }
};
fs.writeFileSync('D:/叉叉机/测试世界书-附加.json', JSON.stringify(wb, null, 2), 'utf8');

console.log('card png: ' + png.length + ' bytes');
console.log('worldbook json written');
