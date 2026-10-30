// node tools/check_layers.mjs [--shots]   (serve the repo root first: python -m http.server 8351; BASE=http://localhost:PORT/ overrides; CDP 9551)
// CDP check of the PROGRESSIVE DIAGRAM (tools/COURSE-V3.md; src/data/layers.js, src/ui/progress.js, app.js syncLayers, flow.js tagLayers):
//  1. a first-time viewer sees L-water only (+ the 「显示全部」 toggle); every diagram part carries a data-layer; no untagged part
//  2. markDone m1 .. inv step by step: the layers appear in order (diagram, dials, lamps, border band, map button); persisted across a reload
//  3. mw:lesson-active { id } shows that lesson's layer + the earlier ones whatever the progress; { id: null } goes back; a ?lesson= URL too
//  4. 「显示全部」: everything, persisted in localStorage mw.layers.all across a reload; ?layers=all = everything, not stored
//  5. full mode (「更多」) = everything; back to 简洁 = layers again
//  6. town lessons keep their own part control (body.parts-on + data-vis; layers off)
//  7. no dangling pipes / chips / pump icons in any state; pipe count == chip count, border pipes last
//  8. phone 390: no horizontal scroll, the toggle on screen; no JS errors
// --shots writes tools/shots/layers/{ipad,phone}-<state>.png (iPad 1180x820, phone 390x844) for L-water, +L-channel ... +L-border, all, toggle
import { spawn } from 'node:child_process';
import { mkdtempSync, mkdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
const EDGE = 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe';
const port = 9551, BASE = process.env.BASE || 'http://localhost:8351/', SHOTS = process.argv.includes('--shots');
const profile = mkdtempSync(join(tmpdir(), 'mw-layers-'));   // fresh profile: localStorage starts empty
const proc = spawn(EDGE, ['--headless=new', '--disable-gpu', '--hide-scrollbars', `--user-data-dir=${profile}`, `--remote-debugging-port=${port}`, '--window-size=1180,820', 'about:blank'], { stdio: 'ignore' });
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
const go = async (path, wait = 2600) => { await send('Page.navigate', { url: BASE + path }); await sleep(wait); };
const click = async (sel, wait = 700) => { const r = await ev(`(()=>{const b=document.querySelector(${JSON.stringify(sel)}); if(!b) return 'missing'; b.click(); return 'ok'})()`); await sleep(wait); return r; };
const shown = sel => ev(`(()=>{const e=document.querySelector(${JSON.stringify(sel)}); return !!e && e.getClientRects().length > 0 && getComputedStyle(e).display !== 'none'})()`);
const layersAttr = () => ev(`document.body.classList.contains('layers-on') ? (document.body.dataset.layers || '') : 'OFF'`);
const markDone = async lid => { await ev(`import('./src/ui/progress.js').then(m => m.markDone(${JSON.stringify(lid)}))`); await sleep(500); };
const lessonActive = async lid => { await ev(`document.dispatchEvent(new CustomEvent('mw:lesson-active', { detail: { id: ${JSON.stringify(lid)} } }))`); await sleep(500); };
const ALL = ['L-water', 'L-channel', 'L-short', 'L-long', 'L-gov', 'L-border', 'L-assets'];
const upTo = k => ALL.slice(0, k + 1).join(' ');
const shotDir = new URL('./shots/layers/', import.meta.url);
const shot = async name => { if (!SHOTS) return; mkdirSync(shotDir, { recursive: true }); writeFileSync(new URL(name + '.png', shotDir), Buffer.from((await send('Page.captureScreenshot', { format: 'png' })).result.data, 'base64')); };

// per layer: [shown, total] of the tagged diagram elements (an element counts as shown when it renders: no display:none on it or an ancestor)
const STATE = `(()=>{
  const svg = document.querySelector('#diagram .flow-svg'), out = {};
  const vis = n => n.getClientRects().length > 0 || (n.getBBox && (()=>{ for (let x = n; x && x !== svg; x = x.parentNode) if (getComputedStyle(x).display === 'none') return false; return true; })());
  for (const n of svg.querySelectorAll('[data-layer]')) { const L = n.dataset.layer; out[L] = out[L] || [0, 0]; out[L][1]++; if (vis(n)) out[L][0]++; }
  return JSON.stringify(out);
})()`;
// dangling: a pipe on screen while one of its end parts is hidden (outNX may point at the hidden border: net exports leave the country),
// or a chip / pump icon on screen without its pipe
const DANGLE = `import('./src/ui/flow.js').then(F => {
  const svg = document.querySelector('#diagram .flow-svg');
  const disp = n => { for (let x = n; x && x !== svg; x = x.parentNode) if (getComputedStyle(x).display === 'none' || getComputedStyle(x).visibility === 'hidden') return false; return true; };
  const partOn = p => [...svg.querySelectorAll('[data-part~="' + p + '"], [data-node="' + p + '"]')].some(disp);
  const bad = [];
  for (const e of F.PIPE_ENDS) {
    const els = [...svg.querySelectorAll('[data-pipe="' + e.k + '"]')];
    const on = els.map(disp);              // [pipe, chip, icon?] in document order
    if (!on[0] && on.slice(1).some(Boolean)) bad.push(e.k + ': chip / icon on screen without its pipe');
    if (on[0] && !(partOn(e.from) && (partOn(e.to) || (e.k === 'outNX')))) bad.push(e.k + ' (' + e.from + ' -> ' + e.to + ') shown with a hidden end');
  }
  const kids = svg.children, nP = kids[1].children.length, nC = kids[2].children.length;
  const last3 = [...kids[1].children].slice(-3).map(g => g.dataset.pipe).join(',');
  return JSON.stringify({ bad, nP, nC, last3 });
})`;

// 本季水量 bar: the terms on screen (incl. the grey 其他泵 / 其他排水 remainders) sum to the shown total -> { sum, net, text }
const BUDGET = `(()=>{
  const bar = document.querySelector('#diagram .flow-budget'), on = n => n.getClientRects().length > 0;
  const val = b => { const t = b.textContent.replace(/[,，\\s]/g, ''); const m = /([−-]?[\\d.]+)(k|万)?/.exec(t); return m ? parseFloat(m[1].replace('−', '-')) * (m[2] === 'k' ? 1000 : 1) : 0; };
  const side = sel => [...bar.querySelectorAll(sel + ' b')].filter(on).reduce((a, b) => a + val(b), 0);
  const netEl = bar.querySelector('.fb-detail .fb-net'), sg = /▼/.test(netEl.textContent) ? -1 : 1;
  return JSON.stringify({ sum: side('.fb-grp.pump') - side('.fb-grp.drain'), net: sg * Math.abs(val(netEl)), text: bar.querySelector('.fb-eq').innerText.replace(/\\s+/g, ' ') });
})()`;
// 「还有 n 层没显示（…）」 hint (flow.js syncLayerHint): the one on screen (desktop: in the toolbar row; phone: under the place switch)
const HINT = `(()=>{ const h = [...document.querySelectorAll('#diagram .flow-lhint')].find(n => !n.hidden && n.getClientRects().length > 0);
  return JSON.stringify(h ? { on: true, n: +h.dataset.n, txt: h.textContent, oneLine: h.scrollHeight <= 34 && h.getBoundingClientRect().height <= 34 } : { on: false }); })()`;
const hint = async () => JSON.parse(await ev(HINT));
const budgetOk = async label => { const B = JSON.parse(await ev(BUDGET)); ok(Math.abs(B.net) > 1 && Math.abs(B.sum - B.net) <= 2, `${label}: 本季水量 terms on screen add up (${B.text} = ${B.net}; sum ${B.sum})`); return B; };

try {
  await send('Runtime.enable'); await send('Page.enable');
  await send('Emulation.setDeviceMetricsOverride', { width: 1180, height: 820, deviceScaleFactor: 1, mobile: false });

  // ---- 1. first-time viewer ----
  await go('?pause=1&t=60');
  ok(await ev(`localStorage.getItem('mw.course') === null && localStorage.getItem('mw.layers.all') === null`), 'fresh profile: no progress, no toggle stored');
  ok(await layersAttr() === 'L-water', 'first-time viewer: L-water only (' + await layersAttr() + ')');
  let S = JSON.parse(await ev(STATE));
  ok(ALL.every(L => S[L] && S[L][1] > 0), 'every layer tags some diagram elements: ' + ALL.map(L => `${L} ${S[L] ? S[L][1] : 0}`).join(', '));
  ok(S['L-water'][0] > 0 && ALL.slice(1).every(L => S[L][0] === 0), 'only L-water elements render: ' + JSON.stringify(S));
  ok(await ev(`[...document.querySelectorAll('#diagram .flow-svg [data-part]')].every(n => n.dataset.layer)`), 'every [data-part] element of the diagram has a data-layer');
  ok(await ev(`(()=>{const s=document.querySelector('#diagram .flow-svg'); const v=n=>getComputedStyle(n).display!=='none'&&n.getClientRects().length>0;
    return v(s.querySelector('g[data-pipe="newLoans"]')) && v(s.querySelector('rect[data-node="bank"]')) && v(s.querySelector('rect[data-node="household"]')) && v(s.querySelector('rect[data-node="cash"]'))
      && !v(s.querySelector('rect[data-node="poolEquity"]')) && !v(s.querySelector('rect[data-node="iou"]')) && !v(s.querySelector('rect[data-node="gov"]')) && !v(s.querySelector('[data-node="section"]'))
      && !v(s.querySelector('[data-node="approval"]')) && !s.classList.contains('has-border')})()`), 'L-water: pump 放贷 + bank box, household, cash on; pools, 欠条箱, government, 断面, approval, border off');
  ok(await shown('#objective') && !(await shown('#objective .ob-lamps')), 'objective strip on, its 4 lamps hidden (L-gov)');
  ok(await ev(`document.querySelectorAll('#simple .sp-dial').length`) === 0 && await shown('#simple .sp-locked'), 'simple panel: no dial yet, a short note instead');
  ok(await shown('#layers-toggle') && await ev(`document.querySelector('#layers-toggle').getAttribute('aria-pressed')`) === 'false', '「显示全部」 toggle on screen, not pressed');
  ok(await ev(`(()=>{const d=document.querySelector('#diagram').getBoundingClientRect(), b=document.querySelector('#layers-toggle').getBoundingClientRect(); return b.right <= d.right + 1 && b.top >= d.top - 1 && b.right > d.left + d.width * 0.6 && b.top < d.top + 60})()`), 'toggle sits at the top right of the diagram');
  ok(+(await ev(`getComputedStyle(document.querySelector('#btn-map')).opacity`)) < 0.9, '🌍 地图 button dimmed before L-border');
  let D = JSON.parse(await ev(DANGLE));
  ok(!D.bad.length, 'L-water: no dangling pipes ' + D.bad.join(' | '));
  ok(D.nP === D.nC && D.last3 === 'exports,imports,foreignBonds', `pipe count == chip count (${D.nP}/${D.nC}), border pipes last (${D.last3})`);
  const B1 = await budgetOk('L-water');
  ok(/其他泵/.test(B1.text) && !/QE|赤字/.test(B1.text), 'L-water: QE / 赤字 hidden, a grey 其他泵 term instead');
  // 本季看点 (strip + simple panel list): nothing from a layer not learned yet (dials, 灯, 央行 / 吸力, the lake pools, groundwater,
  // government, 闸, 外国); the left-out items are only counted (「还有 N 个看点在还没学到的部分」)
  {
    const HL = `JSON.stringify([document.querySelector('#headline')?.textContent || '', document.querySelector('#simple .sp-hl')?.textContent || ''])`;
    const LATER = /周期|灯|央行|吸力|政策利率|房价|股价|国债|金价|房产池|股票池|国债池|黄金池|吸程线|地下水|政府|闸|外国/;
    const [strip, side] = JSON.parse(await ev(HL));
    ok(strip.includes('本季看点') && !LATER.test(strip) && !LATER.test(side), `L-water: 本季看点 names no hidden layer (strip "${strip.slice(0, 80)}" | panel "${side.slice(0, 80)}")`);
  }
  await shot('ipad-1-water');

  // ---- 2. markDone m1 .. inv ----
  const seq = [['m1', 0], ['shk', 1], ['m2', 2], ['m3', 3], ['m4', 4], ['fx', 5], ['m5', 5], ['inv', 6]];
  for (const [lid, k] of seq) {
    await markDone(lid);
    const la = await layersAttr();
    ok(la === upTo(k), `markDone ${lid}: layers = ${la}`);
    S = JSON.parse(await ev(STATE));
    ok(ALL.every((L, j) => (j <= k ? S[L][0] > 0 : S[L][0] === 0)), `markDone ${lid}: exactly the layers up to ${ALL[k]} render`);
    D = JSON.parse(await ev(DANGLE));
    ok(!D.bad.length, `markDone ${lid}: no dangling pipes ` + D.bad.join(' | '));
    const dials = await ev(`JSON.stringify([...document.querySelectorAll('#simple .sp-dial')].map(d => d.dataset.kind))`);
    ok(dials === JSON.stringify(k >= 3 ? ['long', 'short'] : k >= 2 ? ['short'] : []), `markDone ${lid}: dials ${dials}`);
    ok((await shown('#objective .ob-lamps')) === (k >= 4), `markDone ${lid}: lamps ${k >= 4 ? 'on' : 'off'}`);
    ok((await ev(`document.querySelector('#diagram .flow-svg').classList.contains('has-border')`)) === (k >= 5), `markDone ${lid}: border band ${k >= 5 ? 'on' : 'off'}`);
    if (lid === 'm2') ok(await ev(`(()=>{const s=document.querySelector('#diagram .flow-svg'); const v=n=>getComputedStyle(n).display!=='none'&&n.getClientRects().length>0; return v(s.querySelector('[data-node="poolHousing"]')) && v(s.querySelector('g[data-pipe="collateral"]')) && v(s.querySelector('.valve[data-valve="policyRate"]')) && !v(s.querySelector('.vband'))})()`),
      'L-short: house pool, collateral loop, policy-rate valve on; 历史正常区间 bands still off');
    if (lid === 'm4') { const B = await budgetOk('L-gov'); ok(!/其他/.test(B.text), 'L-gov: QE / 赤字 shown, no 其他 terms'); }
    if (lid === 'fx') ok(+(await ev(`getComputedStyle(document.querySelector('#btn-map')).opacity`)) > 0.95, 'L-border: 🌍 地图 button no longer dimmed');
    if (lid === 'shk') {      // only L1 / L2 learned: the hint names the 5 hidden layers; a tap = 显示全部
      const H = await hint();
      ok(H.on && H.n === ALL.length - 2 && /还有 5 层没显示（吸力、地下、政府、国境…）/.test(H.txt) && H.oneLine, `L1/L2 learned: the hint 「${H.txt}」 (count ${H.n}), one line`);
      await click('#diagram .flow-tools .flow-lhint');
      ok(await layersAttr() === 'OFF' && await ev(`document.querySelector('#layers-toggle').getAttribute('aria-pressed')`) === 'true', 'tapping the hint = 显示全部: every layer shows');
      ok(!(await hint()).on, 'all layers shown: no hint');
      await click('#layers-toggle');
      ok(await layersAttr() === upTo(1), 'toggle off again: back to L1 / L2');
    }
    if (lid === 'inv') ok(!(await hint()).on, 'all 7 layers learned: no hint');
  }
  ok(await ev(`JSON.stringify(JSON.parse(localStorage.getItem('mw.course')).done)`) === JSON.stringify(seq.map(s => s[0])), 'progress stored in localStorage mw.course');
  await go('?pause=1&t=60');
  ok(await layersAttr() === upTo(6), 'reload: all 7 layers learned (persisted)');

  // ---- 3. lesson active, whatever the progress ----
  await ev(`localStorage.removeItem('mw.course')`);
  await go('?pause=1&t=60');
  ok(await layersAttr() === 'L-water', 'progress cleared: L-water again');
  await lessonActive('m3');
  ok(await layersAttr() === upTo(3), 'mw:lesson-active m3 on a fresh viewer: up to L-long (' + await layersAttr() + ')');
  ok(!(await hint()).on, 'during a lesson (mw:lesson-active m3): no 「还有 n 层没显示」 hint (the lesson owns the layers)');
  ok(await ev(`document.querySelectorAll('#simple .sp-dial').length`) === 2 || await ev(`document.body.dataset.layout`) === 'simple', 'm3: dials follow');
  await lessonActive('m5');
  ok(await layersAttr() === upTo(5), 'mw:lesson-active m5 (no layer of its own): up to L-border');
  await lessonActive('3b');
  ok(await layersAttr() === 'OFF', 'mw:lesson-active of an old lesson: the whole diagram');
  await lessonActive(null);
  ok(await layersAttr() === 'L-water', 'mw:lesson-active null: back to the learned layers');
  await markDone('m4');
  await lessonActive('shk');
  ok(await layersAttr() === upTo(1), 'lesson shk while m4 is done: L-water + L-channel only');
  await lessonActive(null);
  ok(await layersAttr() === upTo(4), '… and back to the learned L-water .. L-gov');
  await ev(`localStorage.removeItem('mw.course')`);
  await go('?pause=1&lesson=m3&step=0&nozoom=1', 3500);     // step 0 = the water diagram (a curves step covers it, toggle included)
  ok(await ev(`document.body.classList.contains('lesson-on')`) && await layersAttr() === upTo(3), 'a ?lesson=m3 URL on a fresh viewer: up to L-long (' + await layersAttr() + ')');
  ok(await shown('#layers-toggle'), 'toggle available during a lesson');
  ok(!(await hint()).on, 'lesson m3 (URL): no hint');
  D = JSON.parse(await ev(DANGLE));
  ok(!D.bad.length, 'lesson m3: no dangling pipes ' + D.bad.join(' | '));
  await click('#ls-card [data-act=exit]', 1500);
  ok(await layersAttr() === 'L-water', 'leaving the lesson: back to L-water (' + await layersAttr() + ')');

  // ---- 4. 显示全部 ----
  await go('?pause=1&t=60');
  await click('#layers-toggle');
  ok(await layersAttr() === 'OFF' && await ev(`document.querySelector('#layers-toggle').getAttribute('aria-pressed')`) === 'true', '「显示全部」: everything, toggle pressed');
  S = JSON.parse(await ev(STATE));
  ok(ALL.every(L => S[L][0] > 0), '「显示全部」: every layer renders');
  ok(await ev(`!document.querySelector('#headline .hl-hidden') && document.querySelectorAll('#headline .hl-item').length > 0`), '「显示全部」: the 本季看点 strip lists its items again (no 没学到 line), without a reload');
  ok(await ev(`localStorage.getItem('mw.layers.all')`) === '1', 'toggle stored (mw.layers.all = 1)');
  await shot('ipad-8-toggle-on');
  await go('?pause=1&t=60');
  ok(await layersAttr() === 'OFF' && await ev(`document.querySelector('#layers-toggle').getAttribute('aria-pressed')`) === 'true', 'reload: 显示全部 remembered');
  await lessonActive('m2');
  ok(await layersAttr() === 'OFF', '显示全部 also wins during a lesson');
  await lessonActive(null);
  await click('#layers-toggle');
  ok(await layersAttr() === 'L-water' && await ev(`localStorage.getItem('mw.layers.all')`) === '0', 'toggle off: back to L-water, stored 0');
  await go('?pause=1&t=60&layers=all');
  ok(await layersAttr() === 'OFF' && await ev(`localStorage.getItem('mw.layers.all')`) === '0', '?layers=all: everything, nothing stored');

  // ---- 5. full mode ----
  await go('?pause=1&t=60');
  await click('#simple [data-act="more"]', 1200);
  ok(await ev(`document.body.dataset.layout`) === 'full' && await layersAttr() === 'OFF', 'full mode (更多): everything');
  ok(!(await shown('#layers-toggle')), 'full mode: no toggle (nothing is hidden)');
  ok(await shown('#objective .ob-lamps'), 'full mode: lamps on');
  await click('#tabbar .tb-simple', 900);
  ok(await layersAttr() === 'L-water', '◂ 简洁: layers again');

  // ---- 6. town ----
  await go('?pause=1&lesson=m1', 3500);
  ok(await ev(`document.body.classList.contains('parts-on') && !document.body.classList.contains('layers-on')`), 'town lesson m1: its own parts (parts-on), layers off');
  ok(await ev(`document.body.dataset.vis`) === 'bank household iou', 'town lesson parts untouched: ' + await ev(`document.body.dataset.vis`));
  ok(!(await shown('#layers-toggle')), 'town lesson: no toggle');
  D = JSON.parse(await ev(DANGLE));
  ok(!D.bad.length, 'town lesson: no dangling pipes ' + D.bad.join(' | '));
  await go('?pause=1&scenario=town');
  ok(await layersAttr() === 'OFF', 'town scenario: layers off');

  // ---- screenshots of every state (URL ?layers=<id>: screenshots only, never stored) ----
  if (SHOTS) {
    const states = [['1-water', 'L-water'], ['2-channel', 'L-channel'], ['3-short', 'L-short'], ['4-long', 'L-long'], ['5-gov', 'L-gov'], ['6-border', 'L-border'], ['7-all', 'all']];
    for (const [n, L] of states) { await go(`?pause=1&t=60&layers=${L}`); await shot('ipad-' + n); }
    await send('Emulation.setDeviceMetricsOverride', { width: 390, height: 844, deviceScaleFactor: 2, mobile: true });
    for (const [n, L] of states) { await go(`?pause=1&t=60&layers=${L}`); await shot('phone-' + n); }
    await go('?pause=1&t=60&layers=all'); await click('#layers-toggle'); await sleep(300); await shot('phone-8-toggle-on');
    await click('#layers-toggle'); await sleep(300);
    await send('Emulation.setDeviceMetricsOverride', { width: 1180, height: 820, deviceScaleFactor: 1, mobile: false });
  }

  // ---- 7. phone ----
  await ev(`localStorage.clear()`);
  await send('Emulation.setDeviceMetricsOverride', { width: 390, height: 844, deviceScaleFactor: 2, mobile: true });
  await go('?pause=1&t=60');
  ok(await layersAttr() === 'L-water', 'phone: fresh viewer L-water');
  { const H = await hint(); ok(H.on && H.n === ALL.length - 1 && H.oneLine, `phone 390: the hint is one line under the place switch (「${H.txt}」)`); }
  ok(await ev(`document.documentElement.scrollWidth <= innerWidth`), 'phone: no horizontal scroll');
  ok(await ev(`(()=>{const b=document.querySelector('#layers-toggle').getBoundingClientRect(); return b.width > 0 && b.left >= 0 && b.right <= innerWidth && b.height >= 28})()`), 'phone: toggle on screen, tappable');
  D = JSON.parse(await ev(DANGLE));
  ok(!D.bad.length, 'phone: no dangling pipes ' + D.bad.join(' | '));
  await markDone('fx');
  ok(await layersAttr() === upTo(5) && await ev(`document.documentElement.scrollWidth <= innerWidth`), 'phone: up to L-border, still no horizontal scroll');
  D = JSON.parse(await ev(DANGLE));
  ok(!D.bad.length, 'phone L-border: no dangling pipes (净出口 gate) ' + D.bad.join(' | '));
  await send('Emulation.clearDeviceMetricsOverride');

  console.log('errors:', errors.length ? errors : 'none');
  ok(!errors.length, 'no JS errors');
} catch (e) { console.log('driver error', e); fails++; }
finally { try { ws.close(); } catch (e) { /* ignore */ } proc.kill(); }
console.log(fails ? `${fails} FAIL` : 'ALL OK');
process.exit(fails ? 1 : 0);
