const fs = require('fs');
const P = 'D:/叉叉机/叉叉机/index.html';
const b = fs.readFileSync(P);
console.log('size=', b.length);
console.log('bom=', b[0], b[1], b[2]);
const s = b.toString('utf8');
console.log('replacement_chars=', (s.match(/\uFFFD/g) || []).length);
console.log('has_叉叉机=', s.includes('叉叉机'));
console.log('has_主屏幕=', s.includes('主屏幕'));
// 典型「UTF-8 被当 GBK 读再存」的乱码特征
console.log('has_鏂囦欢=', s.includes('鏂囦欢'));
console.log('has_涓绘=', s.includes('涓绘'));
console.log('--- head 600 ---');
console.log(s.slice(0, 600));
console.log('--- around desk-editor.css link ---');
const i = s.indexOf('desk-editor.css');
console.log(i >= 0 ? s.slice(i - 120, i + 60) : 'NOT FOUND');
