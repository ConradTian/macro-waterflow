// node tools/check_scrubber.mjs   (serve the repo root first: python -m http.server 8189; BASE=http://localhost:PORT/ overrides)
// CDP check of the time scrubber + ⏮ 退一季: collapsed by default and remembered, seek forward / backward (state equals a fresh run to the same t),
// keyboard, drag pauses, marks (recession bands, hatch, stage triangles from the engine), lesson lock, takeover confirm, two-window sync,
// free mode, country view, town, and no JS errors.
import { spawn } from 'node:child_process';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
const EDGE = 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe';
const port = 9361, BASE = process.env.BASE || 'http://localhost:8189/';
const profile = mkdtempSync(join(tmpdir(), 'mw-scrub-'));
const proc = spawn(EDGE, ['--headless=new', '--disable-gpu', `--user-data-dir=${profile}`, `--remote-debugging-port=${port}`, '--window-size=1200,900', 'about:blank'], { stdio: 'ignore' });
const sleep = ms => new Promise(r => setTimeout(r, ms));
const allLayers = u => (/^about:/.test(u) ? u : u + (u.includes('?') ? '&' : '?') + 'layers=all');   // progressive diagram: this check wants the whole diagram (layers: tools/check_layers.mjs)
const errors = [];
let fails = 0; const ok = (c, m) => { if (!c) { fails++; console.log('FAIL:', m); } else console.log('ok:', m); };

async function client(tab) {
  const ws = new WebSocket(tab.webSocketDebuggerUrl);
  await new Promise((res, rej) => { ws.onopen = res; ws.onerror = rej; });
  let id = 0; const pending = new Map();
  ws.onmessage = m => {
    const d = JSON.parse(m.data);
    if (d.id && pending.has(d.id)) { pending.get(d.id)(d); pending.delete(d.id); }
    else if (d.method === 'Runtime.exceptionThrown') errors.push(d.params.exceptionDetails.text + ' ' + (d.params.exceptionDetails.exception?.description || ''));
    else if (d.method === 'Runtime.consoleAPICalled' && d.params.type === 'error') errors.push('console.error ' + d.params.args.map(a => a.value || a.description).join(' '));
  };
  const send = (method, params = {}) => new Promise(res => { const i = ++id; pending.set(i, res); ws.send(JSON.stringify({ id: i, method, params })); });
  const ev = async expr => { const r = await send('Runtime.evaluate', { expression: expr, awaitPromise: true, returnByValue: true }); if (r.result.exceptionDetails) throw new Error(r.result.exceptionDetails.exception?.description || 'eval error'); return r.result.result.value; };
  await send('Runtime.enable'); await send('Page.enable');
  const c = {
    send, ev, close: () => ws.close(),
    go: async (url, wait = 2300) => { await send('Page.navigate', { url: allLayers(url) }); await sleep(wait); },
    click: sel => ev(`(()=>{const b=document.querySelector(${JSON.stringify(sel)}); if(!b) return 'missing'; b.click(); return 'ok'})()`),
    count: sel => ev(`document.querySelectorAll(${JSON.stringify(sel)}).length`),
    text: sel => ev(`(document.querySelector(${JSON.stringify(sel)})||{}).textContent||''`),
    date: () => ev(`document.querySelector('#date').textContent`),
    hidden: sel => ev(`(()=>{const n=document.querySelector(${JSON.stringify(sel)}); return !n || n.hidden || n.offsetParent === null})()`),
    // the open/closed state lives in localStorage: set it, then reload
    open: async (url, o = false, wait = 2300) => { await send('Page.navigate', { url: allLayers(url) }); await sleep(500); await ev(`localStorage.setItem('mw.scrubber.open', ${o ? "'1'" : "'0'"})`); await send('Page.navigate', { url: allLayers(url) }); await sleep(wait); },
    // drag = input events while moving, change on release
    drag: async (t, release = true) => { await ev(`(()=>{const r=document.querySelector('#scrub-range'); r.value=${t}; r.dispatchEvent(new Event('input',{bubbles:true})); return 1})()`); if (release) { await ev(`document.querySelector('#scrub-range').dispatchEvent(new Event('change',{bubbles:true}))`); await sleep(500); } },
    key: async key => { const code = { ArrowRight: 39, ArrowLeft: 37 }[key]; for (const type of ['keyDown', 'keyUp']) await send('Input.dispatchKeyEvent', { type, key, code: key, windowsVirtualKeyCode: code, nativeVirtualKeyCode: code }); await sleep(450); },
    // what the engine says at this quarter (the model snapshot, needs ?debug=1) + the visible panel / headline text: compares a seek with a fresh run
    sig: () => ev(`JSON.stringify(window.__mw.sim().snapshot()) + '|' + ['#tab-content','#headline'].map(s => (document.querySelector(s)||{}).innerText||'').join('|')`),
  };
  return c;
}
const ql = t => `${1995 + Math.floor(t / 4)}Q${(t % 4) + 1}`;
const tabs = async () => (await (await fetch(`http://127.0.0.1:${port}/json`)).json()).filter(x => x.type === 'page');

try {
  let ver = null;
  for (let i = 0; i < 40 && !ver; i++) { try { ver = await (await fetch(`http://127.0.0.1:${port}/json/version`)).json(); } catch (e) { await sleep(250); } }
  const bw = new WebSocket(ver.webSocketDebuggerUrl); await new Promise((res, rej) => { bw.onopen = res; bw.onerror = rej; });
  let bid = 0;
  const newPage = async url => {
    const before = new Set((await tabs()).map(x => x.id));
    bw.send(JSON.stringify({ id: ++bid, method: 'Target.createTarget', params: { url: allLayers(url) } }));
    for (let i = 0; i < 40; i++) { await sleep(150); const t = (await tabs()).find(x => !before.has(x.id)); if (t) return client(t); }
    throw new Error('no new page');
  };
  const A = await newPage('about:blank');
  await A.send('Emulation.setDeviceMetricsOverride', { width: 1180, height: 820, deviceScaleFactor: 1, mobile: false });

  // ---- 1. collapsed by default, expand, remember ----
  await A.go(BASE + '?pause=1&t=52'); await A.ev(`localStorage.clear()`); await A.go(BASE + '?pause=1&t=52');
  ok(await A.count('#scrub-handle') === 1 && !(await A.hidden('#scrub-handle')), 'the 「⌄ 拖动」 handle is there');
  ok((await A.text('#scrub-handle')).includes('拖动'), 'handle text: ' + await A.text('#scrub-handle'));
  ok(await A.hidden('#scrub-panel'), 'collapsed by default (no stored state)');
  ok(await A.ev(`document.querySelector('.topbar .progress') && document.querySelector('.progress i').getBoundingClientRect().width > 100`), 'the thin progress line stays');
  ok(await A.date() === '2008Q1', 'booted at t=52 (2008Q1): ' + await A.date());
  await A.click('#scrub-handle'); await sleep(300);
  ok(!(await A.hidden('#scrub-panel')) && (await A.text('#scrub-handle')).includes('收起'), 'tap -> expanded, handle says 收起');
  ok(await A.ev(`document.querySelector('#scrub-range').getBoundingClientRect().height >= 36 && document.querySelector('#scrub-q').getBoundingClientRect().height >= 36`), 'touch target >= 36px');
  ok(await A.ev(`document.querySelector('#scrub-range').value`) === '52' && (await A.text('#scrub-q')) === '2008Q1', 'slider sits at t=52, label 2008Q1');
  ok(await A.ev(`localStorage.getItem('mw.scrubber.open')`) === '1', 'open state stored');
  await A.go(BASE + '?pause=1&t=52');
  ok(!(await A.hidden('#scrub-panel')), 'reload: stays expanded');
  await A.click('#scrub-handle'); await sleep(200);
  ok(await A.hidden('#scrub-panel') && (await A.text('#scrub-handle')).includes('拖动'), 'tap again -> collapsed');
  await A.go(BASE + '?pause=1&t=52');
  ok(await A.hidden('#scrub-panel'), 'reload: stays collapsed');

  // ---- 2. marks (from the engine at runtime) ----
  // full=1: section 3 compares the visible tab panel after a seek with a fresh ?tab=ledger run (the default page is the simple layout)
  await A.open(BASE + '?pause=1&t=52&debug=1&full=1', true);
  for (let i = 0; i < 30 && !(await A.count('.scrub-tri')); i++) await sleep(250);
  ok(await A.count('.sm-band') === 3, 'recession bands: ' + await A.count('.sm-band') + ' (WAVES.usQ.recessions has 3)');
  ok(await A.count('.sm-hatch') === 1, 'hatched 保留样本 from reservedFrom');
  const hatch = await A.ev(`(()=>{const h=document.querySelector('.sm-hatch').getBoundingClientRect(), m=document.querySelector('.scrub-marks').getBoundingClientRect(); return (h.left-m.left)/m.width})()`);
  ok(Math.abs(hatch - 108 / 123) < 0.01, 'hatch starts at 2022Q1 (t=108): ' + hatch.toFixed(3));
  const band0 = await A.ev(`(()=>{const h=document.querySelector('.sm-band').getBoundingClientRect(), m=document.querySelector('.scrub-marks').getBoundingClientRect(); return (h.left-m.left)/m.width})()`);
  ok(Math.abs(band0 - 25 / 123) < 0.01, 'first band starts at 2001Q2 (t=25): ' + band0.toFixed(3));
  const tris = await A.ev(`[...document.querySelectorAll('.scrub-tri')].map(b => [+b.dataset.t, b.textContent, b.title])`);
  ok(tris.length > 0, 'stage triangles rendered: ' + JSON.stringify(tris.map(x => x.slice(0, 2))));
  // the same list straight from the engine (a fresh run in the page)
  const eng = await A.ev(`(async()=>{ const { createSim } = await import('/src/engine/sim.js'); const { US_Q } = await import('/src/data/us-quarterly.js');
    const s = createSim({ data: US_Q, mode: 'history', country: 'USA' }); const out = []; let prev = null, fork = false;
    const look = (sn, t) => { const L = sn.cycles && sn.cycles.long; if (!L) return; if (prev != null && L.stage !== prev) out.push([t, 'stage' + L.stage]); prev = L.stage; if (!fork && L.fork === 'B2') { fork = true; out.push([t, 'B2']); } };
    look(s.snapshot(), 0); while (!s.done) { s.step(); look(s.snapshot(), s.t); } return out; })()`);
  ok(eng.length === tris.length && eng.every((e, i) => e[0] === tris[i][0]), 'triangles = engine stage changes + first B2 fork: ' + JSON.stringify(eng));
  ok(tris.every(x => /^(\d{4}Q\d) /.test(x[2])), 'every triangle has a hover label with its date');
  ok(tris.some(x => x[1].includes('B2')) === eng.some(e => e[1] === 'B2'), 'B2 mark present iff the engine forks to B2');
  const triSz = await A.ev(`(()=>{const r=document.querySelector('.scrub-tri').getBoundingClientRect(); return [r.width, r.height]})()`);
  console.log('   triangle button size', triSz);
  // hover shows the label, tap jumps
  const t0 = tris[0];
  await A.ev(`document.querySelector('.scrub-tri').dispatchEvent(new MouseEvent('mouseenter'))`);
  ok((await A.text('#scrub-note')).includes(ql(t0[0])), 'hover shows the label in the note line: ' + await A.text('#scrub-note'));
  await A.click('.scrub-tri'); await sleep(600);
  ok(await A.date() === ql(t0[0]), `tap a triangle jumps there: ${await A.date()} (expected ${ql(t0[0])})`);

  // ---- 3. seek forward / backward == a fresh run ----
  await A.drag(80, false);
  ok((await A.text('#scrub-q')) === ql(80) && await A.date() === ql(t0[0]), 'dragging shows the quarter live (' + await A.text('#scrub-q') + ') without moving the game yet');
  await A.ev(`document.querySelector('#scrub-range').dispatchEvent(new Event('change',{bubbles:true}))`); await sleep(700);
  ok(await A.date() === ql(80), 'release jumps forward to ' + ql(80) + ': ' + await A.date());
  const f80 = await A.sig();
  await A.drag(30);
  ok(await A.date() === ql(30), 'release jumps backward to ' + ql(30) + ': ' + await A.date());
  const b30 = await A.sig();
  ok(Math.abs(parseFloat(await A.ev(`document.querySelector('#progress-bar').style.width`)) - 100 * 30 / 123) < 0.01, 'progress line follows');
  await A.open(BASE + '?pause=1&t=80&tab=ledger&debug=1', true); const fresh80 = await A.sig();
  await A.open(BASE + '?pause=1&t=30&tab=ledger&debug=1', true); const fresh30 = await A.sig();
  ok(f80 === fresh80, 'forward seek to 80 == fresh run to 80 (engine snapshot + panel + headline, ' + f80.length + ' chars)');
  ok(b30 === fresh30, 'backward seek to 30 == fresh run to 30 (' + b30.length + ' chars)');
  // the full jump across history leaves no pause toast
  await A.drag(123);
  ok(await A.date() === '2025Q4' && await A.hidden('#toast'), 'seek to the end (2025Q4) shows no pause toast');
  await A.drag(0);
  ok(await A.date() === '1995Q1' && await A.hidden('#toast'), 'seek to the start (1995Q1)');

  // ---- 4. keyboard, drag pauses ----
  await A.open(BASE + '?pause=1&t=52', true);
  await A.ev(`document.querySelector('#scrub-range').focus()`);
  await A.key('ArrowRight');
  ok(await A.date() === '2008Q2', '→ moves one quarter: ' + await A.date());
  await A.key('ArrowLeft'); await A.key('ArrowLeft');
  ok(await A.date() === '2007Q4', '← ← moves two back: ' + await A.date());
  await A.open(BASE + '?t=2', true, 1800);   // plays
  ok(await A.text('#btn-play') === '⏸', 'game is playing');
  await A.drag(40, false);
  ok(await A.text('#btn-play') === '▶', 'dragging pauses the game');
  await A.drag(40);
  await sleep(1500);
  ok(await A.date() === ql(40), 'stays paused after the jump: ' + await A.date());

  // ---- 5. ⏮ ----
  await A.go(BASE + '?pause=1&t=52');
  ok(await A.count('#btn-back') === 1 && (await A.text('#btn-back')).includes('⏮'), '⏮ button next to ⏭');
  ok(await A.ev(`document.querySelector('#btn-back').nextElementSibling.id`) === 'btn-step', '⏮ sits right before ⏭');
  const sizes = await A.ev(`['#btn-back','#btn-step'].map(s => { const r = document.querySelector(s).getBoundingClientRect(); return [r.width, r.height]; })`);
  ok(sizes[0][0] === sizes[1][0] && sizes[0][1] === sizes[1][1], 'same look/size as ⏭: ' + JSON.stringify(sizes));
  await A.click('#btn-back'); await sleep(500);
  ok(await A.date() === '2007Q4', '⏮ goes back one quarter: ' + await A.date());
  await A.click('#btn-step'); await sleep(500);
  ok(await A.date() === '2008Q1', '⏭ after ⏮ goes forward again: ' + await A.date());
  await A.go(BASE + '?pause=1&t=0');
  ok(await A.ev(`document.querySelector('#btn-back').disabled`), '⏮ disabled at t=0');
  await A.click('#btn-step'); await sleep(400);
  ok(!(await A.ev(`document.querySelector('#btn-back').disabled`)), '⏮ enabled at t=1');
  await A.click('#btn-back'); await sleep(400);
  ok(await A.date() === '1995Q1' && await A.ev(`document.querySelector('#btn-back').disabled`), '⏮ back to 1995Q1 -> disabled again');
  await A.go(BASE + '?pause=1&t=60&tab=cycle&debug=1');
  const before = await A.sig();
  await A.click('#btn-back'); await A.click('#btn-step'); await sleep(500);
  ok(await A.sig() === before, '⏮ then ⏭ returns to the identical screen (60)');

  // ---- 6. takeover confirm ----
  await A.open(BASE + '?pause=1&tab=takeover&t=40', true);
  await A.click('#tk-take'); await sleep(300);
  ok((await A.text('#mode-badge')) !== '' && await A.ev(`!!document.querySelector('#tk-exit')`), 'central bank taken over');
  await A.drag(45);
  ok(await A.date() === ql(45) && await A.hidden('.scrub-confirm'), 'forward seek while taken over: no confirm, ' + await A.date());
  await A.drag(20, true);
  ok(!(await A.hidden('.scrub-confirm')) && (await A.text('.scrub-confirm')).includes('往回拖会清掉你的接管操作，继续吗？'), 'backward seek asks first: ' + await A.text('.scrub-confirm'));
  ok(await A.ev(`document.querySelector('.scrub-confirm [data-a="no"]') && document.querySelector('.scrub-confirm [data-a="yes"]') && true`), 'small in-app confirm with 取消 / 继续 (not window.confirm)');
  ok(await A.date() === ql(45), 'nothing moved while the question is open');
  await A.click('.scrub-confirm [data-a="no"]'); await sleep(400);
  ok(await A.date() === ql(45) && await A.hidden('.scrub-confirm') && await A.ev(`document.querySelector('#scrub-range').value`) === '45', 'cancel: stays at ' + await A.date() + ', slider snaps back');
  await A.click('#btn-back'); await sleep(300);
  ok(!(await A.hidden('.scrub-confirm')), '⏮ asks too');
  await A.click('.scrub-confirm [data-a="no"]');
  await A.drag(20, true); await sleep(200);
  await A.click('.scrub-confirm [data-a="yes"]'); await sleep(600);
  ok(await A.date() === ql(20) && await A.hidden('.scrub-confirm'), '继续: jumps back to ' + await A.date());
  ok(!(await A.text('#mode-badge')).includes('接管'), 'takeover cleared: badge ' + await A.text('#mode-badge'));

  // ---- 7. lessons lock it ----
  await A.open(BASE + '?pause=1&lesson=3b&step=2', true, 3000);
  ok(await A.ev(`document.querySelector('#scrub-range').disabled`), 'in a lesson the slider is disabled');
  ok(await A.ev(`document.querySelector('#scrub-range').title`) === '上课时由课程控制时间', 'tooltip: ' + await A.ev(`document.querySelector('#scrub-range').title`));
  ok(await A.ev(`document.querySelector('#btn-back').disabled && document.querySelector('#btn-back').title`) === '上课时由课程控制时间', '⏮ locked too');
  ok((await A.text('#scrub-note')).includes('上课时由课程控制时间'), 'the note line says so (touch has no tooltip)');
  const dl = await A.date(); await A.drag(5); ok(await A.date() === dl, 'dragging does nothing in a lesson');
  await A.click('#ls-card [data-act=exit]'); await sleep(800);
  ok(!(await A.ev(`document.querySelector('#scrub-range').disabled`)) && !(await A.ev(`document.querySelector('#btn-back').disabled`)), 'leaving the lesson unlocks both');
  // town lesson: hidden
  await A.open(BASE + '?pause=1&lesson=0', true, 3000);
  ok(await A.hidden('#scrub-handle') && await A.hidden('#scrub-panel') && await A.ev(`document.querySelector('#btn-back').disabled`), 'town lesson: scrubber hidden, ⏮ off');
  await A.open(BASE + '?pause=1&scenario=town', true);
  ok(await A.hidden('#scrub-handle') && await A.hidden('#scrub-panel'), 'town scenario: scrubber hidden');

  // ---- 8. free mode ----
  await A.open(BASE + 'free/?pause=1&t=10', true);
  for (let i = 0; i < 40 && !(await A.count('.scrub-tri')); i++) await sleep(250);
  ok(await A.ev(`document.querySelector('#scrub-range').max`) === '223', 'free mode: slider to 2050Q4 (max 223)');
  ok(await A.count('.sm-band') === 0 && await A.count('.sm-hatch') === 0, 'free mode: no recession bands / hatch');
  ok(await A.count('.scrub-tri') > 0, 'free mode: stage triangles ' + await A.count('.scrub-tri'));
  ok((await A.text('.sm-free')).includes('之后是模型自由运行'), 'free mode note: ' + await A.text('.sm-free'));
  const fx = await A.ev(`(()=>{const h=document.querySelector('.sm-free').getBoundingClientRect(), m=document.querySelector('.scrub-marks').getBoundingClientRect(); return (h.left-m.left)/m.width})()`);
  ok(Math.abs(fx - 123 / 223) < 0.01, 'the note starts after 2025Q4: ' + fx.toFixed(3));
  await A.drag(150);
  ok(await A.date() === ql(150), 'free mode seek to 2032: ' + await A.date());
  ok(await A.count('#btn-back') === 1, 'free page has ⏮');

  // ---- 9. country view ----
  await A.open(BASE + '?pause=1&country=AUS&t=30', true);
  const aus = (await A.text('#mode-badge')).includes('澳洲');
  if (aus) {
    for (let i = 0; i < 30 && !(await A.count('.scrub-tri')); i++) await sleep(250);
    ok(await A.count('.sm-band') === 0, 'AUS: no US recession bands');
    await A.drag(70);
    ok(await A.date() === ql(70) && (await A.text('#mode-badge')).includes('澳洲'), 'AUS: seek works on its own data: ' + await A.date());
  } else console.log('note: AUS view not ready, falls back to the USA (country test skipped)');

  // the country data runs through the same code (the view itself may not be ready yet: check the marks on the data directly)
  const ausMarks = await A.ev(`(async()=>{ const { createSim } = await import('/src/engine/sim.js'); const { computeStageMarks } = await import('/src/ui/scrubber.js');
    const { AUS_Q } = await import('/src/data/countries/aus-quarterly.js'); const m = computeStageMarks(createSim, AUS_Q, 'history', 'AUS');
    return { n: m.length, reserved: AUS_Q.reservedFrom, dates: AUS_Q.dates.length }; })()`);
  ok(ausMarks.n >= 0 && ausMarks.dates === 124 && ausMarks.reserved === '2022Q1', 'AUS data: stage marks computed without errors: ' + JSON.stringify(ausMarks));

  // ---- 10. two windows ----
  await A.open(BASE + '?pause=1&t=10', true);
  const B = await newPage(BASE + '?follow=1&pause=1');
  await sleep(2500);
  await B.ev(`localStorage.setItem('mw.scrubber.open','1')`); await B.go(BASE + '?follow=1&pause=1', 2500);
  ok(await B.ev(`document.querySelector('#scrub-range').disabled`) && await B.ev(`document.querySelector('#btn-back').disabled`), 'follower: slider and ⏮ disabled');
  ok((await B.ev(`document.querySelector('#scrub-range').title`)).includes('跟随'), 'follower tooltip: ' + await B.ev(`document.querySelector('#scrub-range').title`));
  await A.drag(70); await sleep(900);
  ok(await B.date() === ql(70), `leader seek forward reaches the follower: A ${await A.date()} / B ${await B.date()}`);
  await A.drag(25); await sleep(900);
  ok(await B.date() === ql(25), `leader seek backward reaches the follower: A ${await A.date()} / B ${await B.date()}`);
  B.close();

  console.log('errors:', errors.length ? errors : 'none');
  if (errors.length) fails++;
  A.close();
} catch (e) { console.log('driver error', e); fails++; }
finally { proc.kill(); }
console.log(fails ? `${fails} FAIL` : 'ALL OK');
process.exit(fails ? 1 : 0);
