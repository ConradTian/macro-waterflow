// node tools/check_panel_drag.mjs   (serve the repo root first: python -m http.server 8781; BASE=http://localhost:PORT/ overrides)
// CDP check of the PANEL GRIP (src/ui/panel-grip.js, app.css "PANEL GRIP"): on a 390×700 phone a grabber bar sits on top of the bottom panel.
//   mouse drag (pointer events) and touch drag up / down snap to default · about half · about 75% of .main; the diagram keeps its
//   default height at default and scales down (not cut off) when raised; a tap toggles default <-> 75%; ↑ / ↓ / Home / End;
//   role=separator + aria-orientation + aria-valuenow; a tab tap at default raises to 75% (not stored) unless the viewer set a height;
//   localStorage 'mw.panelH' survives a reload; blocked storage (localStorage throws) still works; hidden during a lesson (the lesson
//   sizes itself); simple mode too; no horizontal scroll at 390; no JS errors; 1024×768 and 1920×1000: no grip and the element boxes
//   are the same whatever is stored (and the same as tools/shots/panel/before-boxes.json when that file is there).
import { spawn } from 'node:child_process';
import { mkdtempSync, existsSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
const EDGE = 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe';
const port = 9621, BASE = process.env.BASE || 'http://localhost:8781/';
const HERE = dirname(fileURLToPath(import.meta.url));
const profile = mkdtempSync(join(tmpdir(), 'mw-grip-'));   // fresh profile: localStorage starts empty
const proc = spawn(EDGE, ['--headless=new', '--disable-gpu', '--hide-scrollbars', `--user-data-dir=${profile}`, `--remote-debugging-port=${port}`, '--window-size=1024,768', 'about:blank'], { stdio: 'ignore' });
const sleep = ms => new Promise(r => setTimeout(r, ms));
const errors = [];
let fails = 0; const ok = (c, m) => { if (!c) { fails++; console.log('FAIL:', m); } else console.log('ok:', m); };

let ws, id = 0; const pending = new Map();
for (let i = 0; i < 40 && !ws; i++) {
  try { const t = (await (await fetch(`http://127.0.0.1:${port}/json`)).json()).find(x => x.type === 'page'); if (t) { ws = new WebSocket(t.webSocketDebuggerUrl); await new Promise((res, rej) => { ws.onopen = res; ws.onerror = rej; }); } } catch (e) { await sleep(250); }
}
ws.onmessage = m => {
  const d = JSON.parse(m.data);
  if (d.id && pending.has(d.id)) { pending.get(d.id)(d); pending.delete(d.id); }
  else if (d.method === 'Runtime.exceptionThrown') errors.push(d.params.exceptionDetails.text + ' ' + (d.params.exceptionDetails.exception?.description || ''));
  else if (d.method === 'Runtime.consoleAPICalled' && d.params.type === 'error') errors.push('console.error ' + d.params.args.map(a => a.value || a.description).join(' '));
};
const send = (method, params = {}) => new Promise(res => { const i = ++id; pending.set(i, res); ws.send(JSON.stringify({ id: i, method, params })); });
const ev = async expr => { const r = await send('Runtime.evaluate', { expression: expr, awaitPromise: true, returnByValue: true }); if (r.result.exceptionDetails) throw new Error(r.result.exceptionDetails.exception?.description || 'eval error'); return r.result.result.value; };
const size = (w, h) => send('Emulation.setDeviceMetricsOverride', { width: w, height: h, deviceScaleFactor: 1, mobile: w < 768 });
const go = async (path, wait = 2800) => { await send('Page.navigate', { url: BASE + path }); await sleep(wait); };
const click = async (sel, wait = 600) => { const r = await ev(`(()=>{const b=document.querySelector(${JSON.stringify(sel)}); if(!b) return 'missing'; b.click(); return 'ok'})()`); await sleep(wait); return r; };
const level = () => ev(`document.body.dataset.panel || 'default'`);
const stored = () => ev(`(()=>{try{return localStorage.getItem('mw.panelH')}catch(e){return 'ERR'}})()`);
const clearStore = () => ev(`(()=>{try{localStorage.removeItem('mw.panelH')}catch(e){}})()`);
const noHScroll = () => ev(`document.documentElement.scrollWidth <= innerWidth && document.body.scrollWidth <= innerWidth`);
// geometry: .main height, .panel height / .main, the diagram's height, the svg inside the diagram box
const geo = () => ev(`(()=>{const R=s=>document.querySelector(s).getBoundingClientRect(); const m=R('.main'), p=R('.main > .panel'), d=R('#diagram'), s=R('#diagram .flow-svg');
  return { mainH: m.height, panelH: p.height, frac: p.height / m.height, diagH: d.height, svgH: s.height, svgIn: s.top >= d.top - 1 && s.bottom <= d.bottom + 1 && s.width > 0,
    defDiag: Math.min(innerWidth * 1.38, innerHeight * 0.56) } })()`);
const gripBox = () => ev(`(()=>{const g=document.querySelector('#panel-grip'); if(!g) return null; const r=g.getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2, h: r.height, shown: getComputedStyle(g).display !== 'none' && r.height > 0 } })()`);
const key = async k => { await ev(`document.querySelector('#panel-grip').dispatchEvent(new KeyboardEvent('keydown', { key: '${k}', bubbles: true, cancelable: true }))`); await sleep(250); };
// a drag with the mouse (Chrome turns it into pointer events) or with one finger (touch emulation -> touch + pointer events)
async function mouseDrag(dy, steps = 8) {
  const g = await gripBox();
  await send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: g.x, y: g.y });
  await send('Input.dispatchMouseEvent', { type: 'mousePressed', x: g.x, y: g.y, button: 'left', buttons: 1, clickCount: 1 });
  for (let i = 1; i <= steps; i++) await send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: g.x, y: g.y + dy * i / steps, button: 'left', buttons: 1 });
  const mid = await geo();
  await send('Input.dispatchMouseEvent', { type: 'mouseReleased', x: g.x, y: g.y + dy, button: 'left', buttons: 0, clickCount: 1 });
  await sleep(300);
  return mid;
}
async function touchDrag(dy, steps = 8) {
  const g = await gripBox();
  await send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: g.x, y: g.y }] });
  for (let i = 1; i <= steps; i++) await send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: g.x, y: g.y + dy * i / steps }] });
  const mid = await geo();
  await send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
  await sleep(300);
  return mid;
}
const near = (a, b, tol = 0.04) => Math.abs(a - b) <= tol;
const SEL = ['.topbar', '.timebar', '#objective', '#headline', '#diagram', '#diagram .flow-svg', '#diagram .flow-budget', '.panel', '#simple', '#tab-content', '#tabbar', '.sp-dial', '.sp-more', '.main'];
const boxes = () => ev(`(()=>{const o={}; for (const s of ${JSON.stringify(SEL)}) { const e=document.querySelector(s); if(!e){o[s]=null;continue;} const r=e.getBoundingClientRect(); o[s]=[r.x,r.y,r.width,r.height].map(v=>Math.round(v*10)/10).join(','); } return o})()`);

try {
  await send('Runtime.enable'); await send('Page.enable');
  await size(390, 700);

  // ---- 1. the grip, default layout unchanged ----
  await go('?pause=1&t=52&full=1&tab=cycle&layers=all');
  ok(await stored() === null && await level() === 'default', 'fresh profile: nothing stored, default height');
  const g0 = await gripBox();
  ok(g0 && g0.shown, 'phone: grip shown on top of the panel');
  ok(await ev(`(()=>{const g=document.querySelector('#panel-grip'); return g.parentElement.matches('.main > .panel') && g === g.parentElement.firstElementChild})()`), 'grip = first child of .panel');
  ok(await ev(`(()=>{const g=document.querySelector('#panel-grip'); return g.getAttribute('role')==='separator' && g.getAttribute('aria-orientation')==='horizontal' && g.tabIndex===0 && !!g.getAttribute('aria-label') && g.hasAttribute('aria-valuenow')})()`), 'role=separator, aria-orientation, focusable, aria-label, aria-valuenow');
  ok(await ev(`getComputedStyle(document.querySelector('#panel-grip')).touchAction`) === 'none', 'touch-action: none on the grip');
  ok(await ev(`(()=>{const g=document.querySelector('#panel-grip'); const r=g.getBoundingClientRect(), b=getComputedStyle(g,'::before'); return r.height + (parseFloat(b.top) < 0 ? -parseFloat(b.top) : 0) >= 32})()`), 'hit area >= 32px tall');
  ok(await ev(`(()=>{const i=document.querySelector('#panel-grip i').getBoundingClientRect(); return i.width >= 30 && i.height >= 4})()`), 'visible grabber bar');
  let G = await geo();
  ok(Math.abs(G.diagH - G.defDiag) < 1.5, `default: the diagram keeps its phone height (${G.diagH.toFixed(1)} = min(100vw×1.38, 56dvh) ${G.defDiag.toFixed(1)})`);
  const defFrac = G.frac;
  ok(await noHScroll(), 'no horizontal scroll at 390 (default)');

  // ---- 2. mouse drag (pointer events): up to 75%, down to default, to half ----
  let mid = await mouseDrag(-400);
  ok(mid.panelH > G.panelH + 100 && await ev(`document.body.dataset.panel`) !== 'drag', `mouse drag: the panel follows the pointer (${G.panelH.toFixed(0)} -> ${mid.panelH.toFixed(0)}px mid-drag)`);
  G = await geo();
  ok(await level() === 'max' && near(G.frac, 0.75), `mouse drag up: snaps to 75% (${(G.frac * 100).toFixed(1)}%)`);
  ok(G.svgIn && G.svgH > 40, `75%: the diagram scales down and stays whole (svg ${G.svgH.toFixed(0)}px inside the diagram box)`);
  ok(await stored() === 'max', 'stored mw.panelH = max');
  ok(+(await ev(`document.querySelector('#panel-grip').getAttribute('aria-valuenow')`)) === 75, 'aria-valuenow = 75');
  ok(await noHScroll(), 'no horizontal scroll at 390 (75%)');
  await mouseDrag(500);
  G = await geo();
  ok(await level() === 'default' && Math.abs(G.diagH - G.defDiag) < 1.5, 'mouse drag down: back to the default (diagram back to its height)');
  // drag to about half: the panel's centre ends near 50% of .main
  const toHalf = G.panelH - G.mainH * 0.5;
  await mouseDrag(toHalf + 10);   // a little short of half: still snaps to half
  G = await geo();
  ok(await level() === 'half' && near(G.frac, 0.5), `mouse drag to the middle: snaps to about half (${(G.frac * 100).toFixed(1)}%)`);
  await mouseDrag(-30);           // a small move up from half: back to half (nearest), not to 75%
  ok(await level() === 'half', 'a small drag snaps back to the nearest point (half)');

  // ---- 3. tap toggles, keyboard ----
  await key('Home');
  ok(await level() === 'default', 'Home: default');
  await click('#panel-grip', 300);   // a click without movement = tap
  ok(await level() === 'max', 'tap (click) at default: 75%');
  await click('#panel-grip', 300);
  ok(await level() === 'default', 'tap again: default');
  await sleep(500);
  await mouseDrag(0, 0);             // a real mouse press + release without moving: pointer events + click, one toggle
  ok(await level() === 'max', 'mouse tap (pointerdown/up + click): 75%, toggled once');
  await sleep(500);
  await mouseDrag(0, 0);
  ok(await level() === 'default', 'mouse tap again: default');
  await key('ArrowUp'); ok(await level() === 'half', '↑: half');
  await key('ArrowUp'); ok(await level() === 'max', '↑: 75%');
  await key('ArrowUp'); ok(await level() === 'max', '↑ at 75%: stays');
  await key('ArrowDown'); ok(await level() === 'half', '↓: half');
  await key('ArrowDown'); ok(await level() === 'default', '↓: default');
  await key('End'); ok(await level() === 'max', 'End: 75%');
  await key('Enter'); ok(await level() === 'default', 'Enter: toggles back to default');

  // ---- 4. touch drag ----
  await send('Emulation.setTouchEmulationEnabled', { enabled: true, maxTouchPoints: 1 });
  await go('?pause=1&t=52&full=1&tab=cycle&layers=all');
  ok(await level() === 'default', 'reload: default (stored default)');
  const p0 = (await geo()).panelH;
  mid = await touchDrag(-400);
  ok(mid.panelH > p0 + 100, `touch drag: the panel follows the finger (${p0.toFixed(0)} -> ${mid.panelH.toFixed(0)}px mid-drag)`);
  G = await geo();
  ok(await level() === 'max' && near(G.frac, 0.75), `touch drag up: 75% (${(G.frac * 100).toFixed(1)}%)`);
  await touchDrag(500);
  ok(await level() === 'default', 'touch drag down: default');
  G = await geo();
  await touchDrag(G.panelH - G.mainH * 0.5);
  ok(await level() === 'half', 'touch drag to the middle: half');
  await sleep(700);                  // a second touch right after the first would be a double-tap gesture
  await touchDrag(0, 1);
  ok(await level() === 'default', 'touch tap at half: default (one toggle, not two)');
  await sleep(700);
  await touchDrag(0, 1);
  ok(await level() === 'max', 'touch tap at default: 75%');
  await sleep(500);
  G = await geo();
  await touchDrag(G.panelH - G.mainH * 0.5);
  ok(await level() === 'half', 'touch drag down from 75% to the middle: half');
  await send('Emulation.setTouchEmulationEnabled', { enabled: false });

  // ---- 5. persistence across reload ----
  ok(await stored() === 'half', 'stored mw.panelH = half');
  await go('?pause=1&t=52&full=1&tab=ledger&layers=all');
  G = await geo();
  ok(await level() === 'half' && near(G.frac, 0.5), `reload: half remembered (${(G.frac * 100).toFixed(1)}%)`);

  // ---- 6. tab tap auto-raise ----
  await clearStore();
  await go('?pause=1&t=52&full=1&tab=ledger&layers=all');
  ok(await level() === 'default', 'nothing stored: default');
  await click('#tabbar [data-tab="assets"]', 900);
  G = await geo();
  ok(await level() === 'max' && near(G.frac, 0.75) && await ev(`document.querySelector('#tabbar [aria-selected="true"]').dataset.tab`) === 'assets', 'tab tap (资产) at default: the panel rises to 75%');
  ok(await stored() === null, '… the auto-raise is not stored');
  await click('#tabbar [data-tab="cycle"]', 700);
  ok(await level() === 'max', 'another tab tap: stays at 75%');
  await key('Home');                       // the viewer sets the default height themselves
  ok(await stored() === 'default', 'viewer chose default: stored');
  await click('#tabbar [data-tab="ledger"]', 700);
  ok(await level() === 'default', 'tab tap after the viewer chose a height: their height is kept');
  await key('ArrowUp');
  await click('#tabbar [data-tab="assets"]', 700);
  ok(await level() === 'half', 'viewer at half: a tab tap keeps half');
  ok(await noHScroll(), 'no horizontal scroll at 390 (half, 资产 tab)');

  // ---- 7. simple mode ----
  await clearStore();
  await go('?pause=1&t=52&full=0&layers=all');
  ok(await ev(`document.body.dataset.layout`) === 'simple' && (await gripBox()).shown, 'simple mode: grip shown');
  const dial0 = await ev(`document.querySelector('#simple .sp-dial svg').getBoundingClientRect().height`);
  await mouseDrag(-400);
  G = await geo();
  const dial1 = await ev(`document.querySelector('#simple .sp-dial svg').getBoundingClientRect().height`);
  ok(await level() === 'max' && near(G.frac, 0.75) && G.svgIn, `simple mode drag up: 75%, diagram whole (svg ${G.svgH.toFixed(0)}px)`);
  ok(dial1 > dial0 + 20, `simple mode raised: the dials grow (${dial0.toFixed(0)} -> ${dial1.toFixed(0)}px)`);
  await click('.sp-more', 900);
  ok(await ev(`document.body.dataset.layout`) === 'full' && await level() === 'max', '更多 → full layout keeps the height');
  await click('#tabbar .tb-simple', 900);
  ok(await ev(`document.body.dataset.layout`) === 'simple' && await level() === 'max', '◂ 简洁 keeps the height');
  ok(await noHScroll(), 'no horizontal scroll at 390 (simple, 75%)');

  // ---- 8. blocked storage ----
  const blockId = (await send('Page.addScriptToEvaluateOnNewDocument', { source: `Object.defineProperty(window, 'localStorage', { configurable: true, get() { throw new DOMException('blocked', 'SecurityError'); } });` })).result.identifier;
  const errsBefore = errors.length;
  await go('?pause=1&t=52&full=1&tab=cycle&layers=all');
  ok(await ev(`(()=>{try{localStorage; return false}catch(e){return true}})()`), 'storage blocked (localStorage throws)');
  ok(await level() === 'default' && (await gripBox()).shown, 'blocked storage: page boots, default height, grip shown');
  await click('#panel-grip', 300);
  ok(await level() === 'max', 'blocked storage: tap still raises to 75%');
  await mouseDrag(500);
  ok(await level() === 'default', 'blocked storage: drag down still works');
  await click('#tabbar [data-tab="assets"]', 700);
  ok(errors.length === errsBefore, 'blocked storage: no JS errors');
  await send('Page.removeScriptToEvaluateOnNewDocument', { identifier: blockId });

  // ---- 9. lesson: grip hidden, the lesson's own sizing ----
  await go('?pause=1&t=52&full=1&tab=cycle&layers=all');
  await key('End');
  ok(await stored() === 'max', 'stored 75% before the lesson');
  await go('?lesson=m2&step=0', 3600);
  ok(await ev(`document.body.classList.contains('lesson-on')`), 'lesson running (m2)');
  ok(!(await gripBox()).shown, 'lesson: grip hidden');
  G = await geo();
  ok(Math.abs(G.diagH - 700 * 0.46) < 2, `lesson: the diagram keeps the lesson height 46dvh (${G.diagH.toFixed(1)}), stored 75% ignored`);
  ok(await ev(`(()=>{const c=document.querySelector('.ls-card'); if(!c) return false; const r=c.getBoundingClientRect(); return !c.hidden && r.height > 40 && r.bottom <= innerHeight + 1})()`), 'lesson card shown and on screen');
  await click('.ls-exit', 2200);
  ok(!(await ev(`document.body.classList.contains('lesson-on')`)) && await level() === 'max' && (await gripBox()).shown, 'lesson exit: grip back, the stored 75% again');

  // ---- 10. iPad / desktop: unchanged ----
  const before = existsSync(join(HERE, 'shots', 'panel', 'before-boxes.json')) ? JSON.parse(readFileSync(join(HERE, 'shots', 'panel', 'before-boxes.json'), 'utf8')) : null;
  for (const [w, h] of [[1024, 768], [1920, 1000]]) {
    await size(w, h);
    for (const [nm, q] of [['full', '?pause=1&t=52&full=1&layers=all'], ['simple', '?pause=1&t=52&full=0&layers=all'], ['cycle', '?pause=1&t=52&tab=cycle&layers=all']]) {
      await clearStore();
      await go(q);
      const a = await boxes();
      ok(!(await gripBox()).shown && !(await ev(`document.querySelector('.panel-grip-probe') && getComputedStyle(document.querySelector('.panel-grip-probe')).display !== 'none'`)), `${w}×${h} ${nm}: no grip`);
      await ev(`(()=>{try{localStorage.setItem('mw.panelH','max')}catch(e){}})()`);
      await go(q);
      const b = await boxes();
      ok(JSON.stringify(a) === JSON.stringify(b), `${w}×${h} ${nm}: same element boxes with a stored 75%`);
      if (nm !== 'simple') { await click('#tabbar [data-tab="assets"]', 700); const c = await boxes(); ok(c['#diagram'] === a['#diagram'] && c['.panel'] === a['.panel'], `${w}×${h} ${nm}: a tab tap changes nothing`); }
      if (before && before[`${w}x${h}-${nm}`]) ok(JSON.stringify(before[`${w}x${h}-${nm}`]) === JSON.stringify(a), `${w}×${h} ${nm}: boxes = before the change (tools/shots/panel/before-boxes.json)`);
      ok(await noHScroll(), `${w}×${h} ${nm}: no horizontal scroll`);
    }
  }
} catch (e) {
  fails++; console.log('FAIL: exception', e.message);
} finally {
  ok(errors.length === 0, 'no JS errors' + (errors.length ? ': ' + errors.slice(0, 5).join(' | ') : ''));
  console.log(fails ? `\n${fails} FAILED` : '\nALL OK');
  try { ws.close(); } catch (e) { /* ignore */ }
  proc.kill();
  process.exit(fails ? 1 : 0);
}
