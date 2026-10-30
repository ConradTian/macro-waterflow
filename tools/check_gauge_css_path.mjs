// Click-path check for the concept-card 水尺 (src/ui/gauge.js + assets/css/gauge.css) and the 专题：预期 吸力尺 (exp-gauge.css), in a FRESH
// headless Edge profile (empty cache), reached by clicking — never by ?lesson= URLs — because the bug it guards was a CSS loader that skipped
// gauge.css after exp-gauge.css had been loaded (the rects then fell back to the SVG default fill: black).
//   path A: main page → 教学 → 第 1 课 → tap 货币 M, then 新贷款 → gauge rect fills
//   path B: main page → 教学 → 专题：预期 (step through, ruler fills) → exit → 第 1 课 → M, 新贷款 → 第 2 课 → a concept card → 周期 tab
//   path C (reverse): 第 1 课 → M card first → exit → 专题：预期 → ruler fills
// Every checked shape (.gg-neutral / .gg-water / .gg-b-* / .exg-*) must have a non-black computed fill; gauge.css must be loaded exactly once.
// usage: BASE=http://localhost:8884/ node tools/check_gauge_css_path.mjs
import { spawn } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
const EDGE = 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe';
const BASE = process.env.BASE || 'http://localhost:8884/';
const sleep = ms => new Promise(r => setTimeout(r, ms));
let fails = 0; const ok = (c, m) => { if (!c) { fails++; console.log('FAIL:', m); } else console.log('ok:', m); };

async function browser(port) {
  const prof = mkdtempSync(join(tmpdir(), 'mw-gcss-'));
  const proc = spawn(EDGE, ['--headless=new', '--disable-gpu', `--user-data-dir=${prof}`, `--remote-debugging-port=${port}`, '--window-size=1200,900', 'about:blank'], { stdio: 'ignore' });
  let ws, id = 0; const pending = new Map(); const errors = [];
  for (let i = 0; i < 60 && !ws; i++) { try { const tabs = await (await fetch(`http://127.0.0.1:${port}/json`)).json(); const t = tabs.find(x => x.type === 'page'); if (t) { ws = new WebSocket(t.webSocketDebuggerUrl); await new Promise((res, rej) => { ws.onopen = res; ws.onerror = rej; }); } } catch (e) { ws = null; await sleep(250); } }
  ws.onmessage = m => { const d = JSON.parse(m.data); if (d.id && pending.has(d.id)) { pending.get(d.id)(d); pending.delete(d.id); } else if (d.method === 'Runtime.exceptionThrown') errors.push(d.params.exceptionDetails.text + ' ' + (d.params.exceptionDetails.exception?.description || '')); else if (d.method === 'Runtime.consoleAPICalled' && d.params.type === 'error') errors.push('console.error ' + d.params.args.map(a => a.value || a.description).join(' ')); };
  const send = (method, params = {}) => new Promise(res => { const i = ++id; pending.set(i, res); ws.send(JSON.stringify({ id: i, method, params })); });
  const ev = async expr => { const r = await send('Runtime.evaluate', { expression: expr, awaitPromise: true, returnByValue: true }); if (r.result.exceptionDetails) throw new Error(r.result.exceptionDetails.exception?.description || 'eval error'); return r.result.result.value; };
  const waitFor = async (expr, ms = 8000) => { const t0 = Date.now(); while (Date.now() - t0 < ms) { try { if (await ev(expr)) return true; } catch (e) { /* not yet */ } await sleep(150); } return false; };
  await send('Runtime.enable'); await send('Page.enable');
  const close = () => { try { ws.close(); } catch (e) {} proc.kill(); setTimeout(() => { try { rmSync(prof, { recursive: true, force: true }); } catch (e) {} }, 1500); };
  return { send, ev, waitFor, errors, close };
}

// computed fills of the gauge shapes inside `scope`; returns { n, black: [...] }
const FILLS = scope => `(() => {
  const els = [...document.querySelectorAll(${JSON.stringify(scope)})].flatMap(r => [...r.querySelectorAll('rect,path,circle,polygon')]);
  const shapes = els.filter(e => [...e.classList].some(c => /^(gg-|exg-)/.test(c)));
  const black = shapes.filter(e => { const s = getComputedStyle(e); return s.fill === 'rgb(0, 0, 0)' && s.display !== 'none' && s.fillOpacity !== '0'; }).map(e => e.getAttribute('class'));
  return { n: shapes.length, classes: [...new Set(shapes.map(e => e.getAttribute('class')))].slice(0, 8), black };
})()`;
const SHEETS = `[...document.styleSheets].map(s => (s.href || '').split('/').pop()).filter(Boolean)`;
const countSheet = f => `[...document.styleSheets].filter(s => (s.href || '').split(/[?#]/)[0].endsWith('/${f}')).length`;

async function openMenu(b) {
  // the lessons module loads lazily: a tap before it is ready may do nothing, so tap again until the menu is there
  for (let i = 0; i < 10; i++) {
    await b.ev(`document.getElementById('btn-teach').click()`);
    if (await b.waitFor(`!!document.querySelector('#ls-menu .ls-main .ls-item') && !document.getElementById('ls-menu').hidden`, 2500)) return true;
  }
  return false;
}
async function startLesson(b, sel, tag) {
  ok(await openMenu(b), `${tag}: 教学 menu opens`);
  await b.ev(`document.querySelector(${JSON.stringify(sel)}).click()`);
  return b.waitFor(`!!document.querySelector('#ls-card .ls-stitle')`);
}
async function exitLesson(b) { await b.ev(`(document.querySelector('#ls-card [data-act=exit]')||{click(){}}).click()`); await sleep(700); }
// step forward until a [data-term=id] is in the page (diagram part or card text); then tap it
async function tapTerm(b, id, tag) {
  for (let k = 0; k < 14; k++) {
    if (await b.ev(`!!document.querySelector('[data-term="${id}"]')`)) break;
    await b.ev(`(() => { const d = document.querySelector('#ls-card .ls-nav [data-act=do]'); if (d) d.click(); const r = document.querySelector('#ls-card .ls-nav [data-act=reveal]'); if (r) r.click(); const n = document.querySelector('#ls-card [data-act=next]'); if (n && !n.disabled) n.click(); })()`);
    await sleep(700);
  }
  // a real mouse tap (CDP Input) on the visible term: a lesson-card button first, else the diagram part; a pipe chip opens the amounts
  // popover first, whose 解释 button ([data-term]) opens the card — tap that too. Last resort: a synthetic [data-term] click (same handler).
  const CARD = `[...document.querySelectorAll('.cc-root:not([hidden]) .gg-water, .cc-root:not([hidden]) .gg-neutral, .cc-root:not([hidden]) .gg-b')].some(e => e.getClientRects().length)`;
  const realTap = async sel => {
    const p = await b.ev(`(() => { const el = [...document.querySelectorAll(${JSON.stringify(sel)})].find(e => e.getClientRects().length); if (!el) return null;
      el.scrollIntoView({ block: 'center', inline: 'center' }); const rs = [...el.getClientRects()].filter(r => r.width && r.height);
      for (const r of rs) { const x = r.x + r.width / 2, y = r.y + r.height / 2, h = document.elementFromPoint(x, y); if (h && (h === el || el.contains(h))) return [x, y, el.tagName.toLowerCase()]; }
      return null; })()`);
    if (!p) return null;
    for (const type of ['mousePressed', 'mouseReleased']) await b.send('Input.dispatchMouseEvent', { type, x: p[0], y: p[1], button: 'left', clickCount: 1 });
    return p[2];
  };
  let how = await realTap(`#ls-card [data-term="${id}"]`) || await realTap(`[data-term="${id}"]`);
  how = how ? how + ' tap' : null;
  if (how && !(await b.waitFor(CARD, 1500))) {
    const via = await realTap(`.flow-cpop:not([hidden]) [data-term="${id}"], .flow-bpop:not([hidden]) [data-term="${id}"], .fp:not([hidden]) [data-term="${id}"]`);
    if (via) how += ' → popover 解释';
  }
  if (!(await b.waitFor(CARD, 1500))) {
    await b.ev(`(() => { const el = document.createElement('button'); el.dataset.term = '${id}'; el.className = 'term'; document.body.appendChild(el); el.click(); el.remove(); })()`);
    how = (how ? how + ', no card → ' : '') + 'synthetic tap';
  }
  const shown = await b.waitFor(CARD, 6000);
  await sleep(500);   // the stylesheet may still be loading
  const f = await b.ev(FILLS('.cc-root:not([hidden])'));
  ok(shown && f.n > 0, `${tag}: concept card 「${id}」 (${how}) shows a 水尺 (${f.n} shapes: ${f.classes.join(' ')})`);
  ok(f.black.length === 0, `${tag}: 「${id}」 水尺 shapes not black ${f.black.length ? f.black.slice(0, 5).join(', ') : ''}`);
  await b.ev(`(() => { const x = document.querySelector('.cc-root button[data-cc-close], .cc-root [data-cc-close]'); if (x) x.click(); })()`);
  await sleep(300);
}
async function walkExp(b, tag) {
  ok(await openMenu(b), `${tag}: 教学 menu opens`);
  await b.ev(`document.querySelector('#ls-menu .ls-topics .ls-item[data-id="exp"]').click()`);
  ok(await b.waitFor(`!!document.querySelector('#ls-panel .exg svg')`), `${tag}: 专题：预期 starts with its panel`);
  let shapes = 0, black = [];
  for (let k = 0; k < 14; k++) {
    await sleep(600);
    const f = await b.ev(FILLS('#ls-panel'));
    shapes += f.n; black.push(...f.black);
    const more = await b.ev(`(() => { const n = document.querySelector('#ls-card [data-act=next]'); if (!n || n.disabled) return false; n.click(); return true; })()`);
    if (!more) break;
  }
  ok(shapes > 0 && black.length === 0, `${tag}: 吸力尺 / exp panels, ${shapes} shapes over the steps, none black ${black.slice(0, 5).join(', ')}`);
  await exitLesson(b);
}

async function run(port, tag, fn) {
  const mem = await memPct(); if (mem >= 85) { console.log(`RAM ${mem}% >= 85: waiting`); for (let i = 0; i < 40 && (await memPct()) >= 85; i++) await sleep(3000); }
  const b = await browser(port);
  try {
    await b.send('Page.navigate', { url: BASE + '?pause=1' });
    ok(await b.waitFor(`document.getElementById('date') && /\\d/.test(document.getElementById('date').textContent)`), `${tag}: main page up`);
    await fn(b);
    ok(await b.ev(countSheet('gauge.css')) === 1, `${tag}: gauge.css loaded exactly once (sheets: ${(await b.ev(SHEETS)).join(' ')})`);
    ok(!b.errors.length, `${tag}: no JS errors ${b.errors.slice(0, 3).join(' | ')}`);
  } catch (e) { fails++; console.log(`${tag}: driver error`, e); }
  finally { b.close(); await sleep(800); }
}
async function memPct() {
  const os = await import('node:os'); return Math.round(100 * (1 - os.freemem() / os.totalmem()));
}

await run(9351, 'A lesson-first', async b => {
  ok(await startLesson(b, '#ls-menu .ls-main .ls-item[data-id]', 'A'), 'A: 第 1 课 starts from the menu');
  await tapTerm(b, 'M', 'A'); await tapTerm(b, 'newLoans', 'A');
});
await run(9352, 'B exp-first', async b => {
  await walkExp(b, 'B');
  ok(await startLesson(b, '#ls-menu .ls-main .ls-item[data-id]', 'B'), 'B: 第 1 课 starts from the menu after the 专题');
  await tapTerm(b, 'M', 'B'); await tapTerm(b, 'newLoans', 'B');
  await exitLesson(b);
  ok(await startLesson(b, '#ls-menu .ls-main li:nth-child(2) .ls-item[data-id]', 'B'), 'B: 第 2 课 starts from the menu');
  await tapTerm(b, 'creditImpulse', 'B');
  await exitLesson(b);
  // 周期 tab (full layout)
  await b.ev(`(() => { const t = document.querySelector('#tabbar [data-tab="cycle"]'); if (t) t.click(); })()`);
  await sleep(1500);
  const f = await b.ev(FILLS('#tab-content'));
  ok(f.black.length === 0, `B: 周期 tab gauges (${f.n} gg-/exg- shapes) none black ${f.black.slice(0, 5).join(', ')}`);
});
await run(9353, 'C reverse', async b => {
  ok(await startLesson(b, '#ls-menu .ls-main .ls-item[data-id]', 'C'), 'C: 第 1 课 starts from the menu');
  await tapTerm(b, 'M', 'C');
  await exitLesson(b);
  await walkExp(b, 'C');
  ok(await startLesson(b, '#ls-menu .ls-main .ls-item[data-id]', 'C'), 'C: 第 1 课 again after the 专题');
  await tapTerm(b, 'newLoans', 'C');
});
console.log(fails ? `${fails} FAIL` : 'ALL OK');
process.exit(fails ? 1 : 0);
