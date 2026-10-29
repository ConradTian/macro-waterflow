// node tools/check_view.mjs   (serve the repo root first: python -m http.server 8183; BASE=http://localhost:PORT/ overrides)
// CDP check of (1) the left curves view (toggle, per-quarter re-render, shared x axis, B2 marker, 推不动 stretch, lesson steps with view:)
// and (2) the two-window quarter sync over BroadcastChannel (a follower page reaches the leader's t, goes back, ignores other scenarios).
import { spawn } from 'node:child_process';
const EDGE = 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe';
const port = 9355, BASE = process.env.BASE || 'http://localhost:8183/';
const proc = spawn(EDGE, ['--headless=new', '--disable-gpu', `--remote-debugging-port=${port}`, '--window-size=1200,900', 'about:blank'], { stdio: 'ignore' });
const sleep = ms => new Promise(r => setTimeout(r, ms));
const allLayers = u => (/^about:/.test(u) ? u : u + (u.includes('?') ? '&' : '?') + 'layers=all');   // progressive diagram: this check wants the whole diagram (layers: tools/check_layers.mjs)
const errors = [];
let fails = 0; const ok = (c, m) => { if (!c) { fails++; console.log('FAIL:', m); } else console.log('ok:', m); };

// one CDP client per page (a second page shares the browser context, so BroadcastChannel reaches it)
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
  return {
    send, ev, close: () => ws.close(),
    go: async url => { await send('Page.navigate', { url: allLayers(url) }); await sleep(2200); },
    click: sel => ev(`(()=>{const b=document.querySelector(${JSON.stringify(sel)}); if(!b) return 'missing'; b.click(); return 'ok'})()`),
    count: sel => ev(`document.querySelectorAll(${JSON.stringify(sel)}).length`),
    text: sel => ev(`(document.querySelector(${JSON.stringify(sel)})||{}).textContent||''`),
  };
}
const tabs = async () => (await (await fetch(`http://127.0.0.1:${port}/json`)).json()).filter(x => x.type === 'page');
const date = c => c.ev(`document.querySelector('#date').textContent`);

try {
  // pages are made with Target.createTarget: the initial about:blank tab lives in another browser context (no shared storage / BroadcastChannel)
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

  // ---- 1. the curves view ----
  await A.go(BASE + '?pause=1&tab=cycle&t=53');
  ok(await A.ev(`document.body.dataset.view`) === 'flow', 'starts on the water diagram');
  ok(await A.ev(`!document.querySelector('#view-toggle').hidden`) && (await A.text('#view-toggle')).includes('曲线'), 'toggle shows 📈 曲线');
  ok(await A.ev(`document.getElementById('wave-view').hidden`), 'wave view hidden');
  await A.click('#view-toggle'); await sleep(600);
  ok(await A.ev(`document.body.dataset.view`) === 'waves' && (await A.text('#view-toggle')).includes('水流'), 'toggle -> waves, button says 💧 水流');
  ok(!(await A.ev(`document.getElementById('wave-view').hidden`)), 'wave view visible');
  ok(await A.count('#wave-view svg.wvw-chart') === 2 && await A.count('#wave-view svg.wv-svg') === 3, 'three charts (long, quarterly, long band)');
  ok(await A.count('#diagram .flow-svg') === 1, 'flow diagram DOM stays alive underneath');
  const vb = await A.ev(`[...document.querySelectorAll('#wave-view svg.wvw-chart')].map(s => s.getAttribute('viewBox').split(' ')[2])`);
  ok(vb.length === 2 && vb[0] === vb[1], 'quarterly chart and long band share the same width / x axis: ' + vb);
  const gx = await A.ev(`(()=>{const q = [...document.querySelectorAll('#wave-view svg.wvw-chart')].map(s => [...s.querySelectorAll('.cy-now-l')].map(l => l.getAttribute('x1'))); return q})()`);
  ok(gx[0][0] === gx[1][0], 'the 现在 line is at the same x in both: ' + gx);
  ok(await A.count('#wave-view .wv-b2l') >= 1, 'B2 marker on the long band (2008)');
  ok(await A.count('#wave-view .wv-nopush') >= 1, '推不动 stretch marked on the quarterly chart');
  ok((await A.text('#wave-view .wvw-now')).includes('2008Q2'), 'header shows the current quarter');
  const d0 = await date(A);
  await A.click('#btn-step'); await sleep(500);
  const d1 = await date(A);
  ok(d1 !== d0 && (await A.text('#wave-view .wvw-now')).includes(d1), `stepping re-renders the view (${d0} -> ${d1})`);
  ok(await A.ev(`document.querySelector('#wave-view svg.wvw-chart').getBoundingClientRect().width > 250`), 'chart has a real width');
  // the tab section button
  await A.click('#view-toggle'); await sleep(300);
  ok(await A.ev(`document.body.dataset.view`) === 'flow' && await A.ev(`document.getElementById('wave-view').hidden`), 'toggle back -> flow');
  ok((await A.text('.wv-btn[data-act="wv-left"]')).includes('放到左边对照'), 'tab button 放到左边对照');
  await A.click('.wv-btn[data-act="wv-left"]'); await sleep(500);
  ok(await A.ev(`document.body.dataset.view`) === 'waves', 'tab button switches the left side');
  ok(await A.ev(`document.querySelector('.wv-btn[data-act="wv-win"]') !== null`), '⧉ 第二个窗口 button present (BroadcastChannel exists)');
  // mw:view event
  await A.ev(`document.dispatchEvent(new CustomEvent('mw:view', { detail: { view: 'flow' } }))`); await sleep(300);
  ok(await A.ev(`document.body.dataset.view`) === 'flow', 'mw:view event switches the view');
  // URL and old checks
  await A.go(BASE + '?pause=1&view=waves&t=20');
  ok(await A.ev(`document.body.dataset.view`) === 'waves' && await A.count('#wave-view svg.wvw-chart') === 2, '?view=waves boots on the curves');
  ok(await A.count('#wave-view .wv-b2l') === 0 && await A.count('#wave-view .wv-nopush') === 0, 'no B2 / 推不动 marker yet at 1996Q?');
  // free mode: no toggle
  await A.go(BASE + 'free/?pause=1&view=waves');
  ok(await A.ev(`document.getElementById('view-toggle').hidden && document.getElementById('wave-view').hidden`), 'free mode: no curves view');
  // town lesson: toggle hidden, wave view hidden
  await A.go(BASE + '?pause=1&lesson=0&view=waves');
  ok(await A.ev(`document.getElementById('wave-view').hidden`), 'town lesson shows the town, not the curves');
  // lesson 3b: waves steps switch the left view, leaving restores flow
  await A.go(BASE + '?pause=1&lesson=3b&step=3');
  ok(await A.ev(`document.body.dataset.view`) === 'waves' && await A.count('#wave-view svg.wvw-chart') === 2, 'lesson 3b step 4 (view: waves) shows the curves');
  await A.go(BASE + '?pause=1&lesson=3b&step=2');
  ok(await A.ev(`document.body.dataset.view`) === 'flow', 'lesson 3b step 3 (view: flow) shows the water');
  await A.go(BASE + '?pause=1&lesson=3b&step=3');
  await A.click('#ls-card [data-act=exit]'); await sleep(600);
  ok(await A.ev(`document.body.dataset.view`) === 'flow', 'leaving the lesson restores flow');
  await A.click('#btn-teach'); await sleep(600);
  ok((await A.ev(`document.querySelector('.ls-sheet-body').textContent`)).includes('3½') || (await A.ev(`document.querySelector('.ls-sheet-body').textContent`)).includes('两个环'), 'menu lists lesson 3b');
  ok(await A.ev(`document.querySelectorAll('.ls-item[data-id="3b"]').length`) === 1, 'lesson 3b listed exactly once');

  // ---- 2. two windows ----
  await A.go(BASE + '?pause=1&tab=cycle&t=10');
  const B = await newPage(BASE + '?follow=1&pause=1&view=waves&tab=cycle');
  await sleep(2500);
  ok(await B.ev(`document.body.dataset.follow`) === '1', 'follower page flagged');
  ok(await date(B) === await date(A), `follower asks on start and reaches the leader: A ${await date(A)} / B ${await date(B)}`);
  ok(await B.ev(`document.querySelector('#btn-play').disabled`), 'follower cannot play');
  ok((await B.text('#mode-badge')).includes('跟随'), 'follower badge says 跟随');
  for (let k = 0; k < 3; k++) { await A.click('#btn-step'); await sleep(400); }
  await sleep(600);
  ok(await date(B) === await date(A), `leader stepped 3: A ${await date(A)} / B ${await date(B)}`);
  ok((await B.text('#wave-view .wvw-now')).includes(await date(A)), 'follower curves view follows too');
  // backwards: a message with a smaller t -> reset + step
  await A.ev(`new BroadcastChannel('macro-waterflow').postMessage({ t: 5, mode: 'history', scenario: 'us', date: 'x', from: 'tester' })`); await sleep(900);
  ok(await date(B) === '1996Q2', 'smaller t: follower resets and steps to it: ' + await date(B));
  // other scenario ignored
  await A.ev(`new BroadcastChannel('macro-waterflow').postMessage({ t: 2, mode: 'history', scenario: 'town', date: 'x', from: 'tester' })`); await sleep(500);
  ok(await date(B) === '1996Q2', 'town message ignored');
  await A.ev(`new BroadcastChannel('macro-waterflow').postMessage({ t: 2, mode: 'free', scenario: 'us', date: 'x', from: 'tester' })`); await sleep(500);
  ok(await date(B) === '1996Q2', 'other-mode message ignored');
  // the leader is not moved by the follower
  ok(await A.ev(`document.body.dataset.follow`) === '', 'leader is not a follower');
  // the 跟随 toggle: A follows, B (follower) is silent so A stays; then B stops following and steps -> A follows B
  await A.ev(`document.dispatchEvent(new CustomEvent('mw:follow', { detail: { on: true } }))`); await sleep(500);
  ok(await A.ev(`document.body.dataset.follow`) === '1', '跟随 toggle (event) turns following on');
  await B.ev(`document.dispatchEvent(new CustomEvent('mw:follow', { detail: { on: false } }))`); await sleep(400);
  await B.click('#btn-step'); await sleep(900);
  ok(await date(A) === await date(B), `after swapping roles A follows B: A ${await date(A)} / B ${await date(B)}`);
  B.close();
  console.log('errors:', errors.length ? errors : 'none');
  if (errors.length) fails++;
  A.close();
} catch (e) { console.log('driver error', e); fails++; }
finally { proc.kill(); }
console.log(fails ? `${fails} FAIL` : 'ALL OK');
process.exit(fails ? 1 : 0);
