const http = require('http');

const paths = [
  '/',
  '/css/styles-critical.css',
  '/css/styles-pages.css',
  '/css/styles-components.css',
  '/css/sonnet-page.css',
  '/js/utils-core.js',
  '/js/app-init.js',
  '/js/chat-features.js',
  '/js/offline-auto-summary.js',
  '/js/vendor/dexie.min.js'
];

function get(p) {
  return new Promise((resolve) => {
    const req = http.get('http://127.0.0.1:8123' + p, { timeout: 10000 }, (res) => {
      let n = 0;
      res.on('data', (d) => { n += d.length; });
      res.on('end', () => resolve({ s: res.statusCode, n: n, ct: String(res.headers['content-type'] || '') }));
    });
    req.on('error', (e) => resolve({ s: 'ERR', n: 0, ct: e.message }));
    req.on('timeout', () => { req.destroy(); resolve({ s: 'TIMEOUT', n: 0, ct: '' }); });
  });
}

(async () => {
  let allOk = true;
  for (const p of paths) {
    const r = await get(p);
    if (r.s !== 200) allOk = false;
    console.log(p.padEnd(30) + ' ' + String(r.s).padEnd(5) + ' ' + String(r.n).padStart(7) + ' bytes  ' + r.ct.split(';')[0]);
  }
  console.log('');
  console.log(allOk ? 'ALL_200_OK' : 'SOME_FAILED');
})();
