// _verify-p5p6.js —— 反向验证：只改了应该改的地方，没碰别的
const fs = require('fs');
const A = 'D:/叉叉机/叉叉机/js/app-init.js';
const Ab = 'D:/叉叉机/_bak-20261119-r4/app-init.beforeP6.js';
const G = 'D:/叉叉机/叉叉机/js/group-offline-auto-summary.js';
const Gb = 'D:/叉叉机/_bak-20261119-r4/group-offline.beforeP5.js';

// P6 反向：把当前 40 换回 24，应与备份逐字节全等
const aNow = fs.readFileSync(A, 'utf8');
const aBack = aNow.split('ageLimit="fading"===tier?46:40').join('ageLimit="fading"===tier?46:24');
const aBak = fs.readFileSync(Ab, 'utf8');
console.log('P6  反向还原 === 备份 : ' + (aBack === aBak) + '   (当前 ' + aNow.length + ' / 备份 ' + aBak.length + ')');

// P5 反向：对备份应用同样的两处删除，应与当前逐字节全等
let gBack = fs.readFileSync(Gb, 'utf8');
gBack = gBack.split(',forgetting="carved"===tier?0:"fading"===tier?70:20;').join(';');
gBack = gBack.split(',forgettingScore:forgetting,').join(',');
const gNow = fs.readFileSync(G, 'utf8');
console.log('P5  反向还原 === 当前 : ' + (gBack === gNow) + '   (备份 ' + fs.readFileSync(Gb, 'utf8').length + ' / 当前 ' + gNow.length + ')');

// 差异长度校验
console.log('   P5 减少 ' + (fs.readFileSync(Gb, 'utf8').length - gNow.length) + ' 字节（预期 78）');
