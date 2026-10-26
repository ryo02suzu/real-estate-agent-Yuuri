// 作業場：ブラウザでシーンを 1 回だけ読み込み、cmd/ に置いた命令（JSON）を順に実行して out/ に書く
// npm i playwright（Chromium の SwiftShader で WebGL を使う）
const { chromium } = require('playwright');
const fs = require('fs');
const url = process.argv[2] || 'http://127.0.0.1:4180/bake.html';
fs.mkdirSync('cmd', { recursive: true }); fs.mkdirSync('res', { recursive: true });
const log = (...a) => fs.appendFileSync('session.log', new Date().toISOString().slice(11, 19) + ' ' + a.join(' ') + '\n');
(async () => {
  const b = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-webgl', '--ignore-gpu-blocklist', '--enable-unsafe-swiftshader', '--proxy-bypass-list=<-loopback>;localhost;127.0.0.1', '--js-flags=--max-old-space-size=14000', '--enable-precise-memory-info'] });
  const p = await b.newPage({ viewport: { width: 400, height: 280 } });
  p.on('console', (m) => { const t = m.text(); if (!/Unknown extension|GPU stall/.test(t)) log('console', m.type(), t.slice(0, 300)); });
  p.on('pageerror', (e) => log('pageerror', String(e).slice(0, 500)));
  p.on('crash', () => { log('CRASH'); process.exit(2); });
  log('loading', url);
  await p.goto(url);
  await p.waitForFunction(() => window.__ready || window.__err, null, { timeout: 0, polling: 2000 });
  log('ready', JSON.stringify(await p.evaluate(() => window.__ready || window.__err)));
  fs.writeFileSync('res/ready.json', JSON.stringify(await p.evaluate(() => window.__ready || window.__err)));
  for (;;) {
    const files = fs.readdirSync('cmd').filter((f) => f.endsWith('.json')).sort();
    for (const f of files) {
      const c = JSON.parse(fs.readFileSync('cmd/' + f, 'utf8')); fs.unlinkSync('cmd/' + f);
      if (c.quit) { log('quit'); await b.close(); process.exit(0); }
      try {
        log('run', c.id, c.js.slice(0, 120));
        const r = await p.evaluate(c.js);
        if (c.save) {
          // store[name] を分割して取り出してファイルへ
          const info = r; const parts = [];
          const n = Math.ceil(info.bytes / (8 << 20));
          for (let i = 0; i < n; i++) parts.push(Buffer.from(await p.evaluate(([nm, i]) => window.bake.chunk(nm, i), [info.name, i]), 'base64'));
          fs.writeFileSync(c.save, Buffer.concat(parts));
          fs.writeFileSync(c.save + '.json', JSON.stringify(info));
        }
        fs.writeFileSync('res/' + c.id + '.json', JSON.stringify({ ok: true, r }));
        log('done', c.id, JSON.stringify(r).slice(0, 200));
      } catch (e) { fs.writeFileSync('res/' + c.id + '.json', JSON.stringify({ ok: false, e: String(e).slice(0, 1000) })); log('error', c.id, String(e).slice(0, 300)); }
    }
    await new Promise((r) => setTimeout(r, 1000));
  }
})().catch((e) => { log('fatal', String(e)); process.exit(1); });
