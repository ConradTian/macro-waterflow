// node tools/check_real_mode.mjs [--shots]   (serve the repo root first: python -m http.server 8681; BASE=http://localhost:PORT/ overrides)
// CDP check of the 「真实 / 模型」 mode (src/app.js "real mode", src/ui/real-mode.js, tools/REAL-DATA.md):
//   the toggle persists (localStorage 'mw.mode'; ?mode=real is not stored); lessons force 模型 and the choice comes back after;
//   play + 接管 disabled in 真实; ⏮ / ⏭ / the scrubber step and stop at lastRealDate (USA 2026Q3, AUS 2026Q2); the badge text (long / 390px short);
//   the four outlets = the real snapshot's; model-only fields greyed (.v-est), not-yet fields faded (.v-none, name only, no 「—」;
//   at 2026Q1 at most 3 visible 「—」 in the diagram); twin dials (simple panel + 周期 tab);
//   溃坝 lamp on real US: red 2008Q4, green 2015; 「真实 x」 hints only inside 保留样本 in 模型 mode; no JS errors; no horizontal scroll at 390px.
//   --shots: also saves the screenshots to tools/shots/real-mode/ (USA 2008Q4 / AUS 2009Q1, 真实 + 模型, 390×844 / 1024×768 / 1920×1000).
import { spawn } from 'node:child_process';
import { mkdtempSync, mkdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { realSnapshot, realDates, realLastDate } from '../src/data/real/real-snapshot.js';
const EDGE = 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe';
const port = 9481, BASE = process.env.BASE || 'http://localhost:8681/';
const SHOTS = process.argv.includes('--shots');
const HERE = dirname(fileURLToPath(import.meta.url));
const profile = mkdtempSync(join(tmpdir(), 'mw-real-'));   // fresh profile: localStorage starts empty
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
const size = (w, h) => send('Emulation.setDeviceMetricsOverride', { width: w, height: h, deviceScaleFactor: 1, mobile: false });
const go = async (path, wait = 2800) => { await send('Page.navigate', { url: BASE + path }); await sleep(wait); };
const click = async (sel, wait = 700) => { const r = await ev(`(()=>{const b=document.querySelector(${JSON.stringify(sel)}); if(!b) return 'missing'; b.click(); return 'ok'})()`); await sleep(wait); return r; };
const text = sel => ev(`(document.querySelector(${JSON.stringify(sel)})||{}).textContent ?? null`);
const date = () => text('#date');
const stored = () => ev(`(()=>{try{return localStorage.getItem('mw.mode')}catch(e){return 'ERR'}})()`);
const isRealOn = () => ev(`document.body.classList.contains('rm-real')`);
const visText = sel => ev(`(()=>{const e=document.querySelector(${JSON.stringify(sel)}); if(!e) return null; const w=document.createTreeWalker(e, NodeFilter.SHOW_TEXT); let s=''; while(w.nextNode()){const p=w.currentNode.parentElement; if(p && getComputedStyle(p).display!=='none') s+=w.currentNode.textContent;} return s})()`);
// visible 「—」 characters inside #diagram (the drawing + the 本季水量 bar; not the 真实数据 legend tag)
const dashCount = () => ev(`(()=>{const e=document.querySelector('#diagram'); const w=document.createTreeWalker(e, NodeFilter.SHOW_TEXT); let n=0; while(w.nextNode()){const p=w.currentNode.parentElement; if(p.closest('.rm-tag')) continue; const cs=getComputedStyle(p); if(cs.display==='none'||cs.visibility==='hidden'||p.getClientRects().length===0) continue; n+=(w.currentNode.textContent.match(/—/g)||[]).length;} return n})()`);
const noHScroll = () => ev(`document.documentElement.scrollWidth <= innerWidth && document.body.scrollWidth <= innerWidth`);
const shot = async name => {
  if (!SHOTS) return;
  const dir = join(HERE, 'shots', 'real-mode'); mkdirSync(dir, { recursive: true });
  const r = await send('Page.captureScreenshot', { format: 'png' });
  writeFileSync(join(dir, name + '.png'), Buffer.from(r.result.data, 'base64'));
  console.log('shot:', join('tools', 'shots', 'real-mode', name + '.png'));
};
const pctW = v => { const a = Math.abs(v) * 100, s = String(Math.round(a)); return (v < 0 && +s > 0 ? '−' : '') + s + '%'; };   // flow.js pctTxt(x, whole)
const qIdx = (iso, d) => realDates(iso).indexOf(d);

try {
  await send('Runtime.enable'); await send('Page.enable');
  await size(1024, 768);

  // ---- 1. toggle: default 模型, persists, ?mode=real not stored ----
  await go('?pause=1&t=55&layers=all');
  ok(await stored() === null, 'fresh profile: nothing stored');
  ok(await ev(`!!document.querySelector('#rm-toggle') && !document.querySelector('#rm-toggle').hidden`), 'toggle shown in the time bar (USA)');
  ok(!(await isRealOn()) && await ev(`document.querySelector('#rm-toggle [data-m="model"]').getAttribute('aria-pressed')`) === 'true', 'default = 模型');
  ok(await ev(`!!document.querySelector('.timebar .tb-dt #rm-toggle, .timebar .tb-dt + #rm-toggle')`), 'toggle sits right after the date / badge');
  await click('#rm-toggle [data-m="real"]', 1200);
  ok(await isRealOn() && await stored() === 'real', '真实 tapped: on and stored');
  ok(await date() === '2008Q4', 'same quarter after the switch: ' + await date());
  await go('?pause=1&t=55&layers=all');
  ok(await isRealOn(), 'reload: 真实 remembered');
  await click('#rm-toggle [data-m="model"]', 1000);
  ok(!(await isRealOn()) && await stored() === 'model', '模型 tapped: off and stored');
  await go('?pause=1&t=55&mode=real&layers=all');
  ok(await isRealOn() && await stored() === 'model', '?mode=real opens 真实 without storing it');
  await go('?pause=1&t=55&layers=all');
  ok(!(await isRealOn()), '… the stored 模型 comes back without the URL');

  // ---- 2. 真实 mode, USA 2008Q4: badge, play / 接管 off, values ----
  await click('#rm-toggle [data-m="real"]', 1200);
  const lastUS = realLastDate('USA');
  ok(await visText('#mode-badge') === `真实数据 · 截至 ${lastUS}`, 'badge (iPad): ' + await visText('#mode-badge'));
  ok(await ev(`document.querySelector('#btn-play').disabled && document.querySelector('#btn-play').title === '真实数据只能逐季看'`), 'play disabled, tooltip 真实数据只能逐季看');
  ok(await ev(`(()=>{const b=document.querySelector('#tabbar [data-tab="takeover"]'); return !!b && b.disabled && b.title.includes('真实数据只能逐季看')})()`), '接管 tab disabled with the tooltip');
  await click('#btn-play', 1500);
  ok(await date() === '2008Q4', 'play does nothing in 真实: ' + await date());
  const R = realSnapshot('USA', '2008Q4');
  const outs = await ev(`[...document.querySelectorAll('.chip.outc text')].map(t => t.textContent)`);
  const want = [R.outlets.C, R.outlets.I, R.outlets.G, R.outlets.NX].map(pctW);
  ok(JSON.stringify(outs) === JSON.stringify(want), `USA outlets = real (BEA): ${outs} vs ${want}`);
  ok(await ev(`!document.querySelector('.chip.outc.v-est, .chip.outc.v-none')`), 'outlets are not greyed');
  ok(await ev(`document.querySelector('.chip[data-pipe="newLoans"]').classList.contains('v-est') && document.querySelector('.chip[data-pipe="toHousing"]').classList.contains('v-est')`), 'model-only flows (放贷, 买房) greyed (.v-est)');
  ok(R.modelOnly.includes('bank.approval') && await ev(`[...document.querySelectorAll('.flow-svg text.v-est')].some(t => t.textContent.startsWith('审批'))`), 'bank approval (modelOnly) greyed');
  ok(R.modelOnly.includes('firm.profit') && await ev(`[...document.querySelectorAll('.flow-svg text.v-est')].some(t => t.textContent.startsWith('利润'))`), 'firm profit (modelOnly) greyed');
  ok(await ev(`[...document.querySelectorAll('.flow-svg text')].some(t => t.textContent.startsWith('政策利率') && !t.classList.contains('v-est'))`), 'policy rate (real) not greyed');
  ok(await ev(`[...document.querySelectorAll('.flow-svg text')].some(t => t.textContent === 'CPI ' + (${R.macro.inflation} * 100).toFixed(1) + '%')`), 'CPI = real: ' + (R.macro.inflation * 100).toFixed(1) + '%');
  ok(await ev(`!document.querySelector('#rm-tag').hidden && document.querySelector('#rm-tag').textContent.includes('模型估算')`), 'diagram tag: 灰字 = 模型估算');
  ok(await ev(`document.querySelector('.flow-budget').classList.contains('v-est') && document.querySelector('.flow-budget').textContent.includes('模型估算')`), '本季水量 bar tagged 模型估算');
  ok(await ev(`document.querySelector('#headline').hidden`), '本季看点 strip hidden in 真实 (it describes the model)');
  // twin dials (simple panel)
  ok(await ev(`document.querySelectorAll('#simple .sp-twins .sp-dial').length`) === 4, 'simple panel: 4 dials (模型 | 真实 × 大 / 小)');
  ok(await ev(`[...document.querySelectorAll('#simple .sp-src')].map(s => s.textContent).join(',')`) === '模型,真实,模型,真实', 'dial labels 模型 / 真实');
  const realLab = await ev(`[...document.querySelectorAll('#simple .sp-real .sp-now b')].map(b => b.textContent).join('|')`);
  ok(realLab === `${R.cycles.long.label}|${R.cycles.short.label}`, 'real dials = realSnapshot cycles: ' + realLab);
  ok(R.cycles.long.fork === 'B2' && (await text('#simple .sp-real .sp-b2')) === 'B2 已确认', 'USA 2008Q4 real long dial: B2 已确认');
  // 溃坝 lamp
  ok(await ev(`document.querySelector('.ob-lamp[data-lamp="burst"]').dataset.level`) === 'red', '溃坝 lamp red, real US 2008Q4');
  // 总目标 strip: the score and 泛滥 / 干涸 / 透支 are the model's -> grey + 「模型估算」; 溃坝 is real (not greyed)
  ok(await ev(`document.querySelector('#objective .ob-sc').classList.contains('v-est') && (document.querySelector('#objective .ob-est')||{}).textContent === '模型估算'`), '总目标 score greyed + 「模型估算」 tag');
  ok(await ev(`['flood','drought','overdraft'].every(k => document.querySelector('.ob-lamp[data-lamp="'+k+'"]').classList.contains('v-est')) && !document.querySelector('.ob-lamp[data-lamp="burst"]').classList.contains('v-est')`), '泛滥 / 干涸 / 透支 greyed (模型估算), 溃坝 not');
  await click('.ob-lamp[data-lamp="drought"]', 500);
  ok((await text('#objective .ob-pop') || '').includes('真实模式下这一项仍是模型算的'), 'tap 干涸: 「真实模式下这一项仍是模型算的」');
  await click('.ob-lamp[data-lamp="drought"]', 400);
  ok(await noHScroll(), 'no horizontal scroll (iPad)');
  await shot('usa-2008Q4-real-ipad');

  // ---- 3. 周期 tab: twin dials, B2 card ----
  await go('?pause=1&t=55&tab=cycle&layers=all', 3200);
  ok(await isRealOn(), '周期 tab, 真实 (stored)');
  ok(await ev(`document.querySelectorAll('#tab-content .cy-twin').length`) === 2 && await ev(`document.querySelectorAll('#tab-content .cy-twin svg.cy-dial').length`) === 4, '周期 tab: twin dials in both cards (4 drawings)');
  ok((await ev(`[...document.querySelectorAll('#tab-content .cy-twin figcaption .cy-src')].map(s => s.textContent).join(',')`)) === '模型,真实,模型,真实', '周期 tab: labels 模型 / 真实');
  ok(await ev(`!document.querySelector('#tab-content .cy-pin-btn')`), 'no 盯住 buttons in 真实 (no play)');
  ok(await ev(`document.querySelector('#tab-content .cy-trail') && document.querySelector('#tab-content').textContent.includes('轨迹带（真实数据）')`), 'trail band drawn from the real dials');
  await go('?pause=1&t=55&tab=takeover&layers=all', 2600);
  ok(await ev(`document.querySelector('#tab-content .rm-locked') && document.querySelector('#tab-content').textContent.includes('真实数据只能逐季看')`), '接管 page (by URL) shows the lock card');
  await click('#tab-content [data-act="rm-model"]', 1200);
  ok(!(await isRealOn()) && await stored() === 'model' && await ev(`!document.querySelector('#tab-content .rm-locked') && document.querySelector('#tab-content').textContent.length > 50`), '「切回模型」 goes back to 模型 and the 接管 page');
  await click('#rm-toggle [data-m="real"]', 1200);

  // ---- 4. stepping: ⏮ / ⏭ / scrubber, stop at lastRealDate ----
  await go('?pause=1&t=55&full=0&layers=all');
  await click('#btn-step', 900);
  ok(await date() === '2009Q1', '⏭ one quarter: ' + await date());
  await click('#btn-back', 1500);
  ok(await date() === '2008Q4', '⏮ one quarter back: ' + await date());
  await go('?pause=1&t=123&full=0&layers=all', 3200);
  ok(await date() === '2025Q4', 'start 2025Q4 (the model\'s last quarter)');
  await click('#btn-step', 900);
  ok(await date() === '2026Q1' && await dashCount() <= 3, `USA 2026Q1 (after the model's range): at most 3 visible 「—」 in the diagram (${await dashCount()})`);
  for (let i = 0; i < 3; i++) await click('#btn-step', 700);
  ok(await date() === lastUS, `⏭ goes past the model to the last real quarter and stops: ${await date()} (lastRealDate ${lastUS})`);
  ok(await ev(`document.querySelector('#btn-step').disabled`), '⏭ disabled at lastRealDate');
  ok(await ev(`[...document.querySelectorAll('#simple .sp-model')].length === 0 && document.querySelectorAll('#simple .sp-none').length === 2`), 'after the model\'s range: the model dials say so (模型只算到 …)');
  const R2 = realSnapshot('USA', lastUS);
  ok(R2.notYet.includes('household.dsr') && await ev(`[...document.querySelectorAll('.flow-svg text')].some(t => t.textContent === 'DSR' && t.classList.contains('v-none') && +getComputedStyle(t).opacity < .5)`), `${lastUS}: DSR not published yet → the name only, faded (.v-none)`);
  ok(await ev(`document.querySelector('.chip[data-pipe="newLoans"]').classList.contains('v-none') && document.querySelector('.chip[data-pipe="newLoans"] text').textContent === '抽水' && +getComputedStyle(document.querySelector('.chip[data-pipe="newLoans"]')).opacity < .5`), `${lastUS}: model-only flows after the model's range → 「抽水」 chip faded (.v-none), no 「—」`);
  ok(await ev(`[...document.querySelectorAll('.flow-svg .chip.v-none text, .flow-svg text.v-none')].every(t => !t.textContent.includes('—'))`), `${lastUS}: no 「—」 in any faded chip / text`);
  ok(await ev(`[...document.querySelectorAll('.chip.outc')].every(c => !c.classList.contains('v-none') && +getComputedStyle(c).opacity === 1)`), `${lastUS}: real values (outlets) stay crisp`);
  ok(await ev(`[...document.querySelectorAll('.chip.outc text')].every(t => /%$/.test(t.textContent))`), `${lastUS}: outlets still real`);
  ok(await text('#objective .ob-n') === '—' && await ev(`['flood','drought','overdraft'].every(k => document.querySelector('.ob-lamp[data-lamp="'+k+'"]').dataset.level === 'none')`)
    && await ev(`['red','yellow','green'].includes(document.querySelector('.ob-lamp[data-lamp="burst"]').dataset.level)`), `${lastUS}: 总目标 score 「—」, 泛滥 / 干涸 / 透支 grey 「—」, 溃坝 still real`);
  await click('#btn-back', 1200);
  ok(await date() === realDates('USA')[qIdx('USA', lastUS) - 1], '⏮ from lastRealDate: ' + await date());
  // scrubber: open, drag to the end, back to 2008Q4
  if (!(await ev(`!document.querySelector('#scrub-panel').hidden`))) await click('#scrub-handle', 900);
  ok(+(await ev(`document.querySelector('#scrub-range').max`)) === qIdx('USA', lastUS), 'scrubber range ends at lastRealDate: max ' + await ev(`document.querySelector('#scrub-range').max`));
  ok(await ev(`!document.querySelector('#scrub-range').disabled`), 'scrubber works in 真实');
  const drag = async t => { await ev(`(()=>{const r=document.querySelector('#scrub-range'); r.value=${t}; r.dispatchEvent(new Event('input',{bubbles:true})); r.dispatchEvent(new Event('change',{bubbles:true}));})()`); await sleep(1800); };
  await drag(999);
  ok(await date() === lastUS, 'scrubber to the far end stops at lastRealDate: ' + await date());
  await drag(55);
  ok(await date() === '2008Q4', 'scrubber back to 2008Q4: ' + await date());
  ok(await ev(`document.querySelectorAll('#scrub-tris .scrub-tri').length`) > 0 && (await ev(`document.querySelector('#scrub-tris .scrub-tri').title`)).includes('真实数据'), 'scrubber triangles = long-cycle changes on real data');
  // 溃坝 green in 2015
  await drag(qIdx('USA', '2015Q2'));
  ok(await date() === '2015Q2' && await ev(`document.querySelector('.ob-lamp[data-lamp="burst"]').dataset.level`) === 'green', '溃坝 lamp green, real US 2015Q2');
  ok(await ev(`document.querySelectorAll('.flow-svg .rhint:not([display])').length`) === 0, 'no 「真实 x」 hints in 真实 mode');

  // ---- 5. 「真实 x」 in 模型 mode: only inside 保留样本 (2022+) ----
  await click('#rm-toggle [data-m="model"]', 1200);
  ok(await date() === '2015Q2' && await ev(`[...document.querySelectorAll('.flow-svg .rhint')].filter(t => t.textContent).length`) === 0, '模型 2015Q2: no 「真实 x」');
  ok(await ev(`!document.querySelector('#objective .v-est, #objective .ob-est')`), '模型 mode: 总目标 strip not greyed');
  await go('?pause=1&t=112&layers=all');
  const hints = await ev(`[...document.querySelectorAll('.flow-svg .rhint')].map(t => t.textContent).filter(Boolean)`);
  const R3 = realSnapshot('USA', 112);
  ok(hints.length === 3 && hints.every(h => h.startsWith('真实')), '模型 2023Q1 (保留样本): 3 hints ' + JSON.stringify(hints));
  ok(hints.includes('真实失业 ' + (R3.macro.unemployment * 100).toFixed(1) + '%') && hints.includes('真实 ' + Math.round(R3.assets.housing.price)), '… with the real unemployment and house price');
  // … and inside the known US model-gap windows (MODEL_GAPS unemployment rows: 2006Q1–2008Q2, 2009Q3–2013Q4, 2024Q1–2025Q4)
  await go(`?pause=1&t=${qIdx('USA', '2007Q1')}&layers=all`);
  const gh = await ev(`[...document.querySelectorAll('.flow-svg .rhint')].map(t => t.textContent).filter(Boolean)`);
  const R4 = realSnapshot('USA', '2007Q1'), mU = await ev(`[...document.querySelectorAll('.flow-svg text')].find(t => t.textContent.startsWith('失业 '))?.textContent`);
  ok(await date() === '2007Q1' && gh.includes('真实失业 ' + (R4.macro.unemployment * 100).toFixed(1) + '%'), `模型 2007Q1 (model-gap window): 「真实」 shows — ${mU} vs ${JSON.stringify(gh)}`);
  await go(`?pause=1&t=${qIdx('USA', '2004Q1')}&layers=all`);
  ok(await date() === '2004Q1' && await ev(`[...document.querySelectorAll('.flow-svg .rhint')].filter(t => t.textContent).length`) === 0, '模型 2004Q1 (no gap window, before 保留样本): no 「真实」');

  // ---- 6. lessons force 模型, the choice comes back after ----
  await go('?pause=1&t=55&layers=all');
  await click('#rm-toggle [data-m="real"]', 1200);
  ok(await isRealOn() && await stored() === 'real', 'stored 真实 before the lesson');
  await go('?lesson=m2&step=0', 3600);           // a US lesson (lesson 0 runs in the town, where the toggle is hidden anyway)
  ok(await ev(`document.body.classList.contains('lesson-on')`), 'lesson running (m2, US history run)');
  ok(!(await isRealOn()) && !(await text('#mode-badge')).includes('真实'), 'lesson forces 模型 (badge: ' + await text('#mode-badge') + ')');
  ok(await ev(`document.querySelector('#rm-toggle').classList.contains('forced') && [...document.querySelectorAll('#rm-toggle button')].every(b => b.disabled)`), 'toggle disabled during the lesson');
  ok(await stored() === 'real', '… the stored choice is untouched');
  await click('.ls-exit', 2200);
  ok(!(await ev(`document.body.classList.contains('lesson-on')`)) && await isRealOn(), 'lesson exit: 真实 comes back');

  // ---- 7. AUS 2009Q1: badge, B2 pending, outlets, stops at 2026Q2 ----
  await go('?country=AUS&pause=1&t=56&layers=all', 3200);
  const lastAU = realLastDate('AUS');
  ok(await isRealOn() && await date() === '2009Q1', 'AUS 真实 2009Q1');
  ok(await visText('#mode-badge') === `澳洲 · 真实数据 · 截至 ${lastAU}`, 'AUS badge: ' + await visText('#mode-badge'));
  const A = realSnapshot('AUS', '2009Q1');
  const aouts = await ev(`[...document.querySelectorAll('.chip.outc text')].map(t => t.textContent)`);
  const awant = [A.outlets.C, A.outlets.I, A.outlets.G, A.outlets.NX].map(pctW);
  ok(JSON.stringify(aouts) === JSON.stringify(awant), `AUS outlets = real (ABS 5206.0): ${aouts} vs ${awant}`);
  ok(A.cycles.long.forkPending && (await text('#simple .sp-real .sp-b2')).startsWith('B2 待确认'), 'AUS 2009Q1 real long dial: ' + await text('#simple .sp-real .sp-b2'));
  ok((await text('#simple .sp-real .sp-bonus') || '').includes('加分项'), 'AUS real dial shows the 加分项: ' + await text('#simple .sp-real .sp-bonus'));
  ok(await ev(`document.querySelector('.ob-lamp[data-lamp="burst"]').dataset.level`) === 'yellow', 'AUS 2009Q1 溃坝 yellow (B2 evidence holds, not confirmed)');
  await shot('aus-2009Q1-real-ipad');
  await go(`?country=AUS&pause=1&t=${qIdx('AUS', lastAU) - 1}&layers=all`, 3200);
  for (let i = 0; i < 3; i++) await click('#btn-step', 700);
  ok(await date() === lastAU && await ev(`document.querySelector('#btn-step').disabled`), `AUS ⏭ stops at ${lastAU}: ${await date()}`);
  await go(`?country=AUS&pause=1&t=123&layers=all`, 3200);
  await click('#btn-step', 900);
  ok(await date() === '2026Q1' && await dashCount() <= 3, `AUS 2026Q1: at most 3 visible 「—」 in the diagram (${await dashCount()})`);
  ok(await ev(`document.querySelector('.chip[data-pipe="newLoans"]').classList.contains('v-none') && document.querySelector('.flow-budget .fb-none')?.title.includes('模型只算到')`), 'AUS 2026Q1: 放贷 faded, 本季水量 row has the full sentence as its tooltip');
  // other countries / the town: no toggle
  await go('?country=JPN&forceCountry=1&pause=1&t=20', 3000);
  ok((await text('#mode-badge')).includes('日本') && await ev(`!document.querySelector('#rm-toggle') || document.querySelector('#rm-toggle').hidden`) && !(await isRealOn()), 'another country (JPN): no toggle (' + await text('#mode-badge') + ')');
  await go('?scenario=town&pause=1', 2600);
  ok(await ev(`!document.querySelector('#rm-toggle') || document.querySelector('#rm-toggle').hidden`) && !(await isRealOn()), 'town: no toggle');

  // ---- 8. 390px phone: badge short, no horizontal scroll ----
  await size(390, 844);
  for (const [q, nm] of [['?pause=1&t=55&layers=all', 'usa-2008Q4-real-390'], ['?country=AUS&pause=1&t=56&layers=all', 'aus-2009Q1-real-390'], ['?pause=1&t=55&tab=cycle&layers=all', null]]) {
    await go(q, 3000);
    ok(await isRealOn() && await noHScroll(), `390px ${q}: 真实, no horizontal scroll`);
    if (nm) await shot(nm);
  }
  ok(await visText('#mode-badge') === `真实 · 至 ${lastUS.slice(2)}`, '390px badge: ' + await visText('#mode-badge'));
  ok(await ev(`(()=>{const t=document.querySelector('#btn-teach').getBoundingClientRect(); return t.right <= innerWidth})()`), '390px: 教学 still on screen');
  // 本季水量 after the model's range: one line with an ellipsis, inside the diagram box (it overlapped the panel on a phone); tap = the sentence
  await size(390, 700);
  await go('?country=AUS&pause=1&t=123&full=0&layers=all', 3000);
  await click('#btn-step', 900);
  ok(await date() === '2026Q1' && await ev(`(()=>{const f=document.querySelector('.flow-budget .fb-none'), s=f.querySelector('small'), d=document.querySelector('#diagram').getBoundingClientRect(), b=f.getBoundingClientRect();
    return b.height <= 40 && getComputedStyle(s).whiteSpace === 'nowrap' && getComputedStyle(s).textOverflow === 'ellipsis' && b.bottom <= d.bottom + 1})()`), '390×700 AUS 2026Q1: 本季水量 row is one line (ellipsis), inside the diagram box');
  await click('.flow-budget .fb-none', 400);
  ok(await ev(`(()=>{const s=document.querySelector('.flow-budget .fb-none small'); return document.querySelector('.flow-budget').classList.contains('open') && getComputedStyle(s).whiteSpace === 'normal' && s.getBoundingClientRect().height > 0})()`), '… tap: the whole sentence opens above the bar');
  await click('.flow-budget .fb-none', 400);
  ok(await ev(`!document.querySelector('.flow-budget').classList.contains('open')`), '… tap again: closed');
  await size(390, 844);
  await click('#rm-toggle [data-m="model"]', 1200);
  for (const [q, nm] of [['?pause=1&t=55&layers=all', 'usa-2008Q4-model-390'], ['?country=AUS&pause=1&t=56&layers=all', 'aus-2009Q1-model-390'], ['?pause=1&t=112&layers=all', null]]) {
    await go(q, 3000);
    ok(!(await isRealOn()) && await noHScroll(), `390px ${q}: 模型, no horizontal scroll`);
    if (nm) await shot(nm);
  }
  ok(await ev(`(()=>{const t=document.querySelector('#btn-teach').getBoundingClientRect(); return t.right <= innerWidth})()`), '390px 模型 (toggle + 4 time buttons): 教学 still on screen');

  // ---- 9. screenshots: 模型 iPad, both modes desktop + ultrawide ----
  await size(1024, 768);
  await go('?pause=1&t=55&layers=all'); await shot('usa-2008Q4-model-ipad');
  await go('?country=AUS&pause=1&t=56&layers=all'); await shot('aus-2009Q1-model-ipad');
  await size(1920, 1000);
  await go('?pause=1&t=55&layers=all'); ok(await noHScroll(), 'desktop 1920: no horizontal scroll'); await shot('usa-2008Q4-model-desktop');
  await go('?country=AUS&pause=1&t=56&layers=all'); await shot('aus-2009Q1-model-desktop');
  await go('?pause=1&t=55&mode=real&layers=all'); ok(await isRealOn() && await noHScroll(), 'desktop 1920 真实: no horizontal scroll'); await shot('usa-2008Q4-real-desktop');
  await go('?country=AUS&pause=1&t=56&mode=real&layers=all'); await shot('aus-2009Q1-real-desktop');
  await size(2560, 1080);
  await go('?pause=1&t=55&mode=real&layers=all');
  ok(await isRealOn() && await noHScroll() && await ev(`(()=>{const m=document.querySelector('.sp-more').getBoundingClientRect(); return m.bottom <= innerHeight + 1})()`), 'ultrawide 2560×1080 真实: no horizontal scroll, 更多 on screen');
  await shot('usa-2008Q4-real-ultrawide');
} catch (e) {
  fails++; console.log('FAIL: exception', e.message);
} finally {
  ok(errors.length === 0, 'no JS errors' + (errors.length ? ': ' + errors.slice(0, 5).join(' | ') : ''));
  console.log(fails ? `\n${fails} FAILED` : '\nALL OK');
  try { ws.close(); } catch (e) { /* ignore */ }
  proc.kill();
  process.exit(fails ? 1 : 0);
}
