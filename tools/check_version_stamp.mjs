// Checks the cache-busting stamp written by tools/stamp_version.mjs. Run it before every push:
//     node tools/stamp_version.mjs && node tools/check_version_stamp.mjs --static
//   1. static (no browser): in index.html, free/index.html, blind/index.html exactly one BEGIN/END block; its import map has every
//      src/**/*.js module (keys relative to the page) with its CURRENT hash and nothing else; window.MW_CSS_V has every assets/css/*.css
//      with its current hash; every static <link rel=stylesheet> / <script type=module src> carries the current ?v=; the import map comes
//      before the first module script; re-stamping would change nothing. Fails = "you forgot to stamp".
//   2. browser (skipped with --static): a fresh headless Edge profile (empty cache) at BASE:
//      main page click-through (教学 → 第 1 课 → tap 货币 M → card 水尺 → exit → 教学 → 专题：预期, three steps → exit → 第 2 课 → 周期 tab),
//      free/ and blind/: every request for a module under src/ and every stylesheet under assets/css carries ?v=<current hash>, no
//      unversioned request at all, gauge.js and gauge.css (both lazy) are among them, every stylesheet in document.styleSheets is stamped
//      and linked once, the 水尺 rects are not black, the pages work (date ticks / cards dealt), no JS errors.
// usage: BASE=http://localhost:8884/ node tools/check_version_stamp.mjs [--static]
import { readFileSync, mkdtempSync, rmSync } from 'node:fs';
import { spawn } from 'node:child_process';
import { tmpdir, freemem, totalmem } from 'node:os';
import { join } from 'node:path';
import { ROOT, PAGES, BEGIN, END, collect, prefixOf, stampPage } from './stamp_version.mjs';

let fails = 0; const ok = (c, m) => { if (!c) { fails++; console.log('FAIL:', m); } else console.log('ok:', m); };
const sums = collect();
const nMod = Object.keys(sums.modules).length, nCss = Object.keys(sums.css).length;

/* ------------------------------------------------------------------ 1. static */
for (const page of PAGES) {
  const text = readFileSync(join(ROOT, page), 'utf8'), pre = prefixOf(page);
  const b0 = text.indexOf(BEGIN), b1 = text.indexOf(END);
  ok(b0 >= 0 && b1 > b0 && text.indexOf(BEGIN, b0 + 1) < 0, `${page}: one stamp block`);
  if (b0 < 0 || b1 < b0) continue;
  const blk = text.slice(b0, b1);
  let map = null;
  try { map = JSON.parse(/<script type="importmap">([\s\S]*?)<\/script>/.exec(blk)[1]).imports; } catch (e) { /* reported below */ }
  ok(!!map, `${page}: import map parses`);
  if (map) {
    const bad = [];
    for (const [f, h] of Object.entries(sums.modules)) if (map[pre + f] !== `${pre}${f}?v=${h}`) bad.push(`${f} (${map[pre + f] ? 'stale ' + map[pre + f].split('?v=')[1] : 'missing'} -> ${h})`);
    const extra = Object.keys(map).filter(k => !sums.modules[k.slice(pre.length)] || !k.startsWith(pre));
    ok(!bad.length, `${page}: all ${nMod} modules mapped with their current hash ${bad.slice(0, 6).join(', ')}${bad.length > 6 ? ` … +${bad.length - 6}` : ''}`);
    ok(!extra.length, `${page}: no stale keys in the import map ${extra.slice(0, 5).join(', ')}`);
  }
  let css = null;
  try { css = JSON.parse(/window\.MW_CSS_V = (\{[^}]*\})/.exec(blk)[1]); } catch (e) { /* reported below */ }
  const cbad = css ? Object.entries(sums.css).filter(([f, h]) => css[f] !== h).map(([f]) => f) : ['(no MW_CSS_V)'];
  ok(css && !cbad.length && Object.keys(css).length === nCss, `${page}: MW_CSS_V has all ${nCss} stylesheets with their current hash ${cbad.join(', ')}`);
  const links = [...text.matchAll(/<link\b[^>]*rel="stylesheet"[^>]*href="([^"]+)"/g)].map(m => m[1]);
  const lbad = links.filter(h => { const m = /assets\/css\/([\w.-]+\.css)\?v=([0-9a-f]+)$/.exec(h); return !m || sums.css[m[1]] !== m[2]; });
  ok(links.length > 0 && !lbad.length, `${page}: ${links.length} static stylesheet links carry the current ?v= ${lbad.join(' ')}`);
  const mods = [...text.matchAll(/<script\b[^>]*type="module"[^>]*src="([^"]+)"/g)].map(m => m[1]);
  const mbad = mods.filter(s => { const [u, v] = s.split('?v='); return sums.modules[u.slice(pre.length)] !== v; });
  ok(mods.length > 0 && !mbad.length, `${page}: entry module ${mods.join(' ')} carries the current ?v= ${mbad.join(' ')}`);
  const im = text.indexOf('<script type="importmap">'), firstMod = text.search(/<script\b[^>]*type="module"/);
  ok(im >= 0 && im < firstMod && im < text.indexOf('</head>'), `${page}: import map in <head>, before the first module script`);
  ok(stampPage(page, text, sums) === text, `${page}: up to date (re-stamping changes nothing)`);
}
if (process.argv.includes('--static')) {
  console.log(fails ? `\n${fails} FAIL — run: node tools/stamp_version.mjs` : '\nSTAMP UP TO DATE');
  process.exit(fails ? 1 : 0);
}

/* ------------------------------------------------------------------ 2. browser */
const EDGE = 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe';
const BASE = process.env.BASE || 'http://localhost:8884/';
const ORIGIN = new URL(BASE).origin, ROOTURL = new URL(BASE).href;
const sleep = ms => new Promise(r => setTimeout(r, ms));
const memPct = () => Math.round(100 * (1 - freemem() / totalmem()));

async function browser(port) {
  for (let i = 0; i < 40 && memPct() >= 85; i++) { if (!i) console.log(`RAM ${memPct()}% >= 85%: waiting`); await sleep(3000); }
  const prof = mkdtempSync(join(tmpdir(), 'mw-vstamp-'));
  const proc = spawn(EDGE, ['--headless=new', '--disable-gpu', `--user-data-dir=${prof}`, `--remote-debugging-port=${port}`, '--window-size=1200,900', 'about:blank'], { stdio: 'ignore' });
  let ws, id = 0; const pending = new Map(); const errors = [], reqs = [];
  for (let i = 0; i < 60 && !ws; i++) { try { const t = (await (await fetch(`http://127.0.0.1:${port}/json`)).json()).find(x => x.type === 'page'); if (t) { ws = new WebSocket(t.webSocketDebuggerUrl); await new Promise((a, b) => { ws.onopen = a; ws.onerror = b; }); } } catch (e) { ws = null; await sleep(250); } }
  if (!ws) throw new Error('no headless Edge on port ' + port);
  ws.onmessage = m => {
    const d = JSON.parse(m.data);
    if (d.id && pending.has(d.id)) { pending.get(d.id)(d); pending.delete(d.id); }
    else if (d.method === 'Network.requestWillBeSent') reqs.push(d.params.request.url);
    else if (d.method === 'Runtime.exceptionThrown') errors.push(d.params.exceptionDetails.text + ' ' + (d.params.exceptionDetails.exception?.description || ''));
    else if (d.method === 'Runtime.consoleAPICalled' && d.params.type === 'error') errors.push('console.error ' + d.params.args.map(a => a.value || a.description).join(' '));
    else if (d.method === 'Log.entryAdded' && d.params.entry.level === 'error' && !/favicon/.test(d.params.entry.url || '')) errors.push('log ' + d.params.entry.text + ' ' + (d.params.entry.url || ''));
  };
  ws.onclose = () => { for (const [, res] of pending) res({ error: 'socket closed' }); pending.clear(); };
  const send = (method, params = {}) => new Promise((res, rej) => {
    const i = ++id, t = setTimeout(() => { pending.delete(i); rej(new Error(`${method} timed out`)); }, 30000);
    pending.set(i, d => { clearTimeout(t); if (d.error) rej(new Error(`${method}: ${JSON.stringify(d.error)}`)); else res(d); });
    ws.send(JSON.stringify({ id: i, method, params }));
  });
  const ev = async expr => { const r = await send('Runtime.evaluate', { expression: expr, awaitPromise: true, returnByValue: true }); if (r.result.exceptionDetails) throw new Error(r.result.exceptionDetails.exception?.description || 'eval error'); return r.result.result.value; };
  const waitFor = async (expr, ms = 8000) => { const t0 = Date.now(); while (Date.now() - t0 < ms) { try { if (await ev(expr)) return true; } catch (e) { /* not yet */ } await sleep(150); } return false; };
  await send('Runtime.enable'); await send('Page.enable'); await send('Network.enable'); await send('Log.enable');
  await send('Network.setCacheDisabled', { cacheDisabled: false });
  const close = async () => { try { ws.close(); } catch (e) {} proc.kill(); await sleep(1000); try { rmSync(prof, { recursive: true, force: true }); } catch (e) {} };
  return { send, ev, waitFor, errors, reqs, close };
}

// every same-origin request for src/**/*.js and assets/css/*.css: stamped with the current hash
function checkRequests(tag, reqs, must) {
  const mine = [...new Set(reqs.filter(u => u.startsWith(ORIGIN)))];
  const js = mine.filter(u => /\/src\/.+\.js(\?|$)/.test(u)), css = mine.filter(u => /\/assets\/css\/[^/]+\.css(\?|$)/.test(u));
  const wrong = [];
  for (const u of js) { const [p, v] = u.split('?v='); const f = p.slice(ROOTURL.length); if (!v || sums.modules[f] !== v) wrong.push(u.slice(ORIGIN.length)); }
  for (const u of css) { const [p, v] = u.split('?v='); const f = p.split('/').pop(); if (!v || sums.css[f] !== v) wrong.push(u.slice(ORIGIN.length)); }
  ok(js.length > 0 && !wrong.length, `${tag}: ${js.length} module + ${css.length} stylesheet requests, all with the current ?v= ${wrong.slice(0, 6).join(' ')}`);
  for (const f of must) {
    // f = a stylesheet name ('gauge.css') or a module path from the site root ('src/ui/gauge.js')
    const hit = mine.find(u => f.endsWith('.css') ? u.split('?')[0].endsWith('/assets/css/' + f) : u.split('?')[0] === ROOTURL + f);
    const want = f.endsWith('.css') ? sums.css[f] : sums.modules[f];
    ok(hit && hit.endsWith('?v=' + want), `${tag}: ${f} requested as ${hit ? hit.split('/').pop() : '(not requested)'} (want ?v=${want})`);
  }
}
const SHEETS = `(() => { const s = [...document.styleSheets].map(x => x.href).filter(h => h && h.includes('/assets/css/'));
  return { all: s.map(h => h.split('/').pop()), bare: s.filter(h => !/\\?v=[0-9a-f]+$/.test(h)).map(h => h.split('/').pop()),
    dup: s.filter((h, i) => s.indexOf(h) !== i).map(h => h.split('/').pop()), v: typeof window.MW_CSS_V === 'object' && Object.keys(window.MW_CSS_V).length,
    order: (() => { const im = document.querySelector('script[type=importmap]'), m = document.querySelector('script[type=module]');
      return !!im && !!m && !!(im.compareDocumentPosition(m) & Node.DOCUMENT_POSITION_FOLLOWING); })() }; })()`;
function checkSheets(tag, s) {
  ok(s.v === nCss, `${tag}: window.MW_CSS_V has ${s.v} stylesheets`);
  ok(s.order, `${tag}: import map precedes the module script in the live DOM`);
  ok(!s.bare.length, `${tag}: all ${s.all.length} stylesheets carry ?v= ${s.bare.join(' ')}`);
  ok(!s.dup.length, `${tag}: no stylesheet linked twice ${s.dup.join(' ')}`);
}
const BLACK = scope => `(() => { const sh = [...document.querySelectorAll(${JSON.stringify(scope)})].flatMap(r => [...r.querySelectorAll('rect,path,circle,polygon')])
  .filter(e => [...e.classList].some(c => /^(gg-|exg-)/.test(c)));
  return { n: sh.length, black: sh.filter(e => getComputedStyle(e).fill === 'rgb(0, 0, 0)' && getComputedStyle(e).fillOpacity !== '0').map(e => e.getAttribute('class')) }; })()`;

async function openMenu(b) {
  for (let i = 0; i < 10; i++) {
    await b.ev(`document.getElementById('btn-teach').click()`);
    if (await b.waitFor(`!!document.querySelector('#ls-menu .ls-main .ls-item') && !document.getElementById('ls-menu').hidden`, 2500)) return true;
  }
  return false;
}
async function realTap(b, sel) {
  const p = await b.ev(`(() => { const el = [...document.querySelectorAll(${JSON.stringify(sel)})].find(e => e.getClientRects().length); if (!el) return null;
    el.scrollIntoView({ block: 'center' }); const r = el.getBoundingClientRect(); const x = r.x + r.width / 2, y = r.y + r.height / 2, h = document.elementFromPoint(x, y);
    return h && (h === el || el.contains(h)) ? [x, y] : null; })()`);
  if (!p) return false;
  for (const type of ['mousePressed', 'mouseReleased']) await b.send('Input.dispatchMouseEvent', { type, x: p[0], y: p[1], button: 'left', clickCount: 1 });
  return true;
}

async function mainPage(port) {
  const b = await browser(port), tag = 'index.html';
  try {
    await b.send('Page.navigate', { url: BASE + '?pause=1' });
    ok(await b.waitFor(`/\\d{4}Q\\d/.test((document.getElementById('date') || {}).textContent || '')`, 10000), `${tag}: the app boots (date ${await b.ev(`(document.getElementById('date')||{}).textContent`)})`);
    // 第 1 课 → 货币 M → the concept card 水尺 (lazy gauge.js + injected gauge.css)
    ok(await openMenu(b), `${tag}: 教学 menu opens`);
    await b.ev(`document.querySelector('#ls-menu .ls-main .ls-item[data-id]').click()`);
    ok(await b.waitFor(`!!document.querySelector('#ls-card .ls-stitle')`), `${tag}: 第 1 课 starts`);
    await sleep(800);
    const tapped = await realTap(b, '#ls-card [data-term="M"]') || await realTap(b, '[data-term="M"]');
    const card = `[...document.querySelectorAll('.cc-root:not([hidden]) .gg-water')].some(e => e.getClientRects().length)`;
    if (!(await b.waitFor(card, 3000))) await b.ev(`(() => { const el = document.createElement('button'); el.dataset.term = 'M'; document.body.appendChild(el); el.click(); el.remove(); })()`);
    ok(await b.waitFor(card, 6000), `${tag}: tapping 货币 M (${tapped ? 'real tap' : 'synthetic'}) opens its card with the 水尺`);
    await sleep(600);
    const g = await b.ev(BLACK('.cc-root:not([hidden])'));
    ok(g.n > 0 && !g.black.length, `${tag}: card 水尺 ${g.n} shapes, none black ${g.black.join(' ')}`);
    await b.ev(`(document.querySelector('.cc-root [data-cc-close]') || { click() {} }).click()`);
    await b.ev(`(document.querySelector('#ls-card [data-act=exit]') || { click() {} }).click()`); await sleep(700);
    // 专题：预期 (exp-gauge.js + exp-gauge.css), a few steps
    ok(await openMenu(b), `${tag}: 教学 menu opens again`);
    await b.ev(`document.querySelector('#ls-menu .ls-topics .ls-item[data-id="exp"]').click()`);
    ok(await b.waitFor(`!!document.querySelector('#ls-panel .exg svg')`), `${tag}: 专题：预期 starts with its 吸力尺 panel`);
    // the ruler is on the first step (the slimmed 专题's later panels are toys without ruler shapes): count shapes there, then step on and only check for black
    const e = await b.ev(BLACK('#ls-panel'));
    ok(e.n > 0 && !e.black.length, `${tag}: 专题 ruler panel ${e.n} shapes, none black ${e.black.join(' ')}`);
    for (let k = 0; k < 3; k++) { await b.ev(`(() => { const n = document.querySelector('#ls-card [data-act=next]'); if (n && !n.disabled) n.click(); })()`); await sleep(600); }
    const e3 = await b.ev(BLACK('#ls-panel'));
    ok(!e3.black.length, `${tag}: 专题 step 3 panel, none black ${e3.black.join(' ')}`);
    await b.ev(`(document.querySelector('#ls-card [data-act=exit]') || { click() {} }).click()`); await sleep(700);
    // 第 2 课 (other lazy modules), then the 周期 tab
    ok(await openMenu(b), `${tag}: 教学 menu opens a third time`);
    await b.ev(`document.querySelector('#ls-menu .ls-main li:nth-child(2) .ls-item[data-id]').click()`);
    ok(await b.waitFor(`!!document.querySelector('#ls-card .ls-stitle')`), `${tag}: 第 2 课 starts`);
    for (let k = 0; k < 3; k++) { await b.ev(`(() => { const n = document.querySelector('#ls-card [data-act=next]'); if (n && !n.disabled) n.click(); })()`); await sleep(600); }
    await b.ev(`(document.querySelector('#ls-card [data-act=exit]') || { click() {} }).click()`); await sleep(700);
    await b.ev(`(document.querySelector('#tabbar [data-tab="cycle"]') || { click() {} }).click()`);
    ok(await b.waitFor(`!!document.querySelector('#tab-content') && document.querySelector('#tab-content').textContent.trim().length > 20`, 5000), `${tag}: 周期 tab renders`);
    await sleep(800);
    checkRequests(tag, b.reqs, ['src/app.js', 'src/ui/gauge.js', 'src/ui/concepts.js', 'src/ui/lessons.js', 'src/ui/exp-gauge.js', 'gauge.css', 'exp-gauge.css', 'causal.css', 'real-mode.css']);
    checkSheets(tag, await b.ev(SHEETS));
    // the two hooks on their own (after the request check: the observer path may request the bare URL first, the setter path never does)
    const hk = await b.ev(`(async () => {
      const u = new URL('./assets/css/blind.css', document.baseURI).href, out = {};
      const a = document.createElement('link'); a.rel = 'stylesheet'; a.href = u; out.setter = a.getAttribute('href');                       // property setter
      const c = document.createElement('link'); c.rel = 'stylesheet'; c.setAttribute('href', u); document.head.appendChild(c);              // observer
      await new Promise(r => setTimeout(r, 0)); out.observer = c.getAttribute('href');
      const d = document.createElement('link'); d.rel = 'stylesheet'; d.href = u; document.head.appendChild(d);                              // same URL again
      await new Promise(r => setTimeout(r, 0)); out.dupDropped = !d.isConnected && c.isConnected;
      const e = document.createElement('link'); e.rel = 'stylesheet'; e.href = u + '?x=1'; out.query = e.getAttribute('href');              // has a query: untouched
      c.remove(); return out; })()`);
    const want = `blind.css?v=${sums.css['blind.css']}`;
    ok(hk.setter.endsWith(want), `${tag}: link.href = '.../blind.css' becomes ${hk.setter.split('/').pop()}`);
    ok(hk.observer.endsWith(want), `${tag}: setAttribute('href') + append is stamped by the observer: ${hk.observer.split('/').pop()}`);
    ok(hk.dupDropped, `${tag}: a second link to an already linked stylesheet is dropped`);
    ok(hk.query.endsWith('blind.css?x=1'), `${tag}: an href that already has a query is left alone`);
    ok(!b.errors.length, `${tag}: no JS errors ${b.errors.slice(0, 3).join(' | ')}`);
  } catch (err) { fails++; console.log(`${tag}: driver error`, err); }
  finally { await b.close(); }
}
async function freePage(port) {
  const b = await browser(port), tag = 'free/index.html';
  try {
    await b.send('Page.navigate', { url: BASE + 'free/?pause=1&t=10' });
    ok(await b.waitFor(`/^\\d{4}Q\\d/.test((document.getElementById('date') || {}).textContent || '') && document.getElementById('date').textContent !== '1995Q1'`, 10000),
      `${tag}: the free run boots and runs to ?t=10 (${await b.ev(`(document.getElementById('date') || {}).textContent`)})`);
    const d0 = await b.ev(`document.getElementById('date').textContent`);
    await b.ev(`(document.getElementById('btn-step') || { click() {} }).click()`); await sleep(1500);
    const d1 = await b.ev(`document.getElementById('date').textContent`);
    ok(d1 !== d0, `${tag}: time moves (${d0} → ${d1})`);
    checkRequests(tag, b.reqs, ['src/app.js', 'src/engine/sim.js']);
    checkSheets(tag, await b.ev(SHEETS));
    ok(!b.errors.length, `${tag}: no JS errors ${b.errors.slice(0, 3).join(' | ')}`);
  } catch (err) { fails++; console.log(`${tag}: driver error`, err); }
  finally { await b.close(); }
}
async function blindPage(port) {
  const b = await browser(port), tag = 'blind/index.html';
  try {
    await b.send('Page.navigate', { url: BASE + 'blind/' });
    ok(await b.waitFor(`!document.querySelector('#bl-main .bl-load') && document.querySelector('#bl-main').children.length > 0`, 12000), `${tag}: the deck is dealt`);
    await sleep(800);
    checkRequests(tag, b.reqs, ['src/blind/main.js', 'src/data/blind-cards.js']);
    checkSheets(tag, await b.ev(SHEETS));
    ok(!b.errors.length, `${tag}: no JS errors ${b.errors.slice(0, 3).join(' | ')}`);
  } catch (err) { fails++; console.log(`${tag}: driver error`, err); }
  finally { await b.close(); }
}

await mainPage(9371);
await freePage(9372);
await blindPage(9373);
console.log(fails ? `\n${fails} FAIL` : '\nALL VERSION-STAMP CHECKS PASSED');
process.exit(fails ? 1 : 0);
