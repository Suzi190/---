const fs = require('fs');
const RB = 'D:/$RECYCLE.BIN/S-1-5-21-3185581366-3180426199-462943831-1001/';
const cands = [
  '$R4OMSYO/index.html',
  '$R8EUCXZ/index.html',
  '$R0A37S0/000信书/index.html',
  '$RAZG4L6/000余岁机/index.html',
  '$RVC8IAF/MIU/index.html'
];
const out = [];
for (const c of cands) {
  try {
    const s = fs.readFileSync(RB + c, 'utf8');
    const title = (s.match(/<title>([\s\S]{0,40}?)<\/title>/) || [, '?'])[1];
    out.push([
      c,
      'size=' + s.length,
      'title=' + title.trim(),
      'mix-auth=' + s.includes('mix-auth-title'),
      'desk-editor=' + s.includes('desk-editor'),
      'anni=' + s.includes('anniversary'),
      'desk-grid=' + s.includes('desk-grid')
    ].join(' | '));
  } catch (e) {
    out.push(c + ' | ERR ' + e.message);
  }
}
fs.writeFileSync('D:/叉叉机/_diag3.txt', out.join('\n'), 'utf8');
console.log(out.join('\n'));
