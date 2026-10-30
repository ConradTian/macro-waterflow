// node tools/check_ruler_main.mjs [--shots]   (serve the repo root first: python -m http.server 8892; BASE=http://localhost:PORT/ overrides; CDP 9892)
// CDP check of the 吸力尺 on the main diagram (src/ui/flow.js RULER SLOT; tools/DESIGN-v3.md 「Parked: 吸力尺」, user GO 「水尺上墙」):
//  1. US 2008Q4 / 2021Q4 / 2023Q4: ▶ / ▽ / ▼ / the band carry exactly the snapshot's rates.policy / macro.inflationExp / macro.inflation /
//     ▶ − ▽, and the snapshot equals the 专题 replay (exp-gauge.js replay); the marks sit at their values on the ruler's own scale
//  2. the band colour = rulerSign(▶, ▽) (class + the RULER_STYLE colour); the band is >= 5x wider than the staff (screen px)
//  3. the 调度线 = cp.piTarget; ▽ hangs on the rope (slack from macro.deanchor); the 0-stop shows only when ▶ < 0.5%
//  4. the thin CPI → ▼ line exists: it starts on the 测流断面 (CPI row) and ends at ▼
//  5. texts: the 央行 tag 「到手 ▶−▼ x%」 with the title 「到手实际利率 ▶ − ▼（结账）」; the ruler's title says 「开阀看 ▽，结账看 ▼」;
//     the legend card has the 4 physical rules and the mnemonic ends 「预期看▽」
//  6. the flash: a step where the band flips colour lights the parts in the order of exp-gauge.js fiveTurns().order
//  7. 真实 mode 2026Q3: no ▽, the band = ▶ − ▼, labelled 结账读数
//  8. phone 390 x 844: only ▶ / ▽ / the band until a tap on the ruler; the tap adds ▼, the rope and the 调度线; no horizontal scroll
//  9. no JS errors
// --shots writes tools/shots/ruler-main/*.png: US 2021Q4 and 2023Q4 at 390x844 (河 place + the tap state), 1024x768, 1440x900; 真实 2026Q3 at 1024.
import { spawn } from 'node:child_process';
import { mkdtempSync, mkdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { replay, fiveTurns, rulerSign, RULER_STYLE, ropeOf } from '../src/ui/exp-gauge.js';
import { realSnapshot } from '../src/data/real/real-snapshot.js';

const EDGE = 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe';
const port = 9892, BASE = process.env.BASE || 'http://localhost:8892/', SHOTS = process.argv.includes('--shots');
const profile = mkdtempSync(join(tmpdir(), 'mw-rlm-'));
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
const go = async (path, wait = 3000) => { await send('Page.navigate', { url: BASE + path }); await sleep(wait); };
const size = (w, h) => send('Emulation.setDeviceMetricsOverride', { width: w, height: h, deviceScaleFactor: w < 768 ? 2 : 1, mobile: w < 768 });
const shotDir = new URL('./shots/ruler-main/', import.meta.url);
const shot = async name => { if (!SHOTS) return; mkdirSync(shotDir, { recursive: true }); writeFileSync(new URL(name + '.png', shotDir), Buffer.from((await send('Page.captureScreenshot', { format: 'png' })).result.data, 'base64')); console.log('   shot', decodeURIComponent(new URL(name + '.png', shotDir).pathname)); };

const ROWS = replay();
const tOf = d => ROWS.findIndex(r => r.date === d);
const near = (a, b, eps = 1e-12) => typeof a === 'number' && typeof b === 'number' && Math.abs(a - b) <= eps;

// the ruler as drawn (viewBox units + screen px); vis = not hidden by display anywhere up to the svg, and has a box
const PROBE = `(()=>{
  const svg = document.querySelector('#diagram .flow-svg'), q = s => svg.querySelector(s), slot = q('[data-ruler-slot]'), rl = slot.querySelector('.rl');
  const vis = n => { if (!n) return false; for (let x = n; x && x !== svg; x = x.parentNode) { if (x.getAttribute && x.getAttribute('display') === 'none') return false; const s = getComputedStyle(x); if (s.display === 'none' || s.visibility === 'hidden') return false; } const r = n.getBoundingClientRect(); return r.width > 0 || r.height > 0; };
  const pts = n => (n.getAttribute('points') || '').trim().split(/\\s+/).filter(Boolean).map(p => p.split(',').map(Number));
  const num = n => n && n.dataset.v != null && n.dataset.v !== '' ? +n.dataset.v : null;
  const P = rl.querySelector('.rl-p'), E = rl.querySelector('.rl-e'), M = rl.querySelector('.rl-m'), B = rl.querySelector('.rl-band'), ST = rl.querySelector('.rl-staff');
  const rope = rl.querySelector('path.rl-rope'), knot = rl.querySelector('.rl-knot'), tgt = rl.querySelector('.rl-tgt'), stop = rl.querySelector('.rl-stop');
  // the CPI → ▼ line: two pieces with data-lk cpiLine (outer in the back layer, inner in the slot); they must join
  const cpi = svg.querySelector('[data-lk="cpiLine"]'), cps = [...svg.querySelectorAll('[data-lk="cpiLine"] path.rl-cpi')];
  const ends = p => { if (!p || !(p.getAttribute('d') || '').trim()) return null; const L = p.getTotalLength(), a = p.getPointAtLength(0), b = p.getPointAtLength(L); return [[a.x, a.y], [b.x, b.y]]; };
  const E2 = cps.map(ends), joined = E2.length === 2 && E2.every(Boolean) && Math.hypot(E2[0][1][0] - E2[1][0][0], E2[0][1][1] - E2[1][0][1]) < 0.5;
  const cpiP = cps[cps.length - 1];
  const end = () => (joined ? [E2[0][0], E2[1][1]] : null);
  const cpiText = svg.querySelector('[data-node="cpi"] text');
  const rr = q('[data-node="realRate"]'), rrT = rr && rr.querySelector('text'), rrTitle = rr && rr.querySelector('title');
  return JSON.stringify({
    scale: { lo: +rl.dataset.lo, hi: +rl.dataset.hi, top: +rl.dataset.top, bot: +rl.dataset.bot },
    p: num(P), e: num(E), m: num(M), pPts: pts(P), ePts: pts(E), mPts: pts(M),
    band: B ? { ...B.dataset, cls: B.getAttribute('class'), fill: B.style.getPropertyValue('fill'), y: +B.getAttribute('y'), h: +B.getAttribute('height'), wpx: B.getBoundingClientRect().width } : null,
    staffPx: ST.getBoundingClientRect().width, staffFill: ST.style.getPropertyValue('fill'),
    vis: { p: vis(P), e: vis(E), m: vis(M), band: vis(B), staff: vis(ST), rope: vis(rope) && !!(rope.getAttribute('d') || '').trim() || vis(knot), tgt: vis(tgt), stop: vis(stop), cpi: cps.length === 2 && cps.every(vis) },
    taut: rope.dataset.taut, tgtV: tgt.dataset.v != null ? +tgt.dataset.v : null, ropeD: rope.getAttribute('d'),
    cpiEnds: end(), cpiX0: cpiText ? cpiText.getBBox().x : null, cpiTxt: cpiText ? cpiText.textContent : null,
    name: slot.querySelector('.sk-n').textContent, val: slot.querySelector('.sk-v').textContent, title: slot.querySelector(':scope > title').textContent,
    save: slot.querySelector('[data-lk="suctionSave"]') ? slot.querySelector('[data-lk="suctionSave"]').textContent : null,
    pump: slot.querySelector('[data-lk="suctionPump"]') ? slot.querySelector('[data-lk="suctionPump"]').textContent : null,
    ids: ['suction', 'suctionSave', 'suctionPump'].map(k => !!svg.querySelector('[data-lk="' + k + '"]')),
    layer: slot.getAttribute('data-layer'), cpiLayer: cpi && cpi.getAttribute('data-layer'),
    rrText: rrT ? rrT.textContent : null, rrTitle: rrTitle ? rrTitle.textContent : null,
    hs: document.documentElement.scrollWidth <= innerWidth,
  });
})()`;
const SNAP = `JSON.stringify((s => ({ date: s.date, p: s.rates.policy, e: s.macro.inflationExp, m: s.macro.inflation, dean: s.macro.deanchor }))(window.__mw.snap()))`;
const yOf = (S, v) => S.top + (S.hi - Math.max(S.lo, Math.min(S.hi, v))) / (S.hi - S.lo) * (S.bot - S.top);

try {
  await send('Runtime.enable'); await send('Page.enable');
  await size(1024, 768);
  const target = ropeOf('USA').target;

  // ---- 1-5. three US quarters on the desktop ----
  for (const date of ['2008Q4', '2021Q4', '2023Q4']) {
    const t = tOf(date);
    await go(`?pause=1&layers=all&debug=1&t=${t}`);
    const S = JSON.parse(await ev(SNAP)), G = JSON.parse(await ev(PROBE)), row = ROWS[t];
    ok(S.date === date, `${date}: on the quarter (${S.date})`);
    ok(near(S.p, row.p) && near(S.e, row.e) && near(S.m, row.m) && near(S.dean, row.dean), `${date}: snapshot = the 专题 replay (▶ ${S.p}, ▽ ${S.e}, ▼ ${S.m}, dean ${S.dean})`);
    ok(G.p === S.p && G.e === S.e && G.m === S.m, `${date}: ▶ ${G.p} / ▽ ${G.e} / ▼ ${G.m} = snapshot rates.policy / macro.inflationExp / macro.inflation`);
    const band = S.p - S.e;
    ok(G.band && +G.band.v === band && +G.band.top === S.p && +G.band.bot === S.e, `${date}: band ▶ − ▽ = ${(band * 100).toFixed(2)}% (drawn ${G.band && (+G.band.v * 100).toFixed(2)}%)`);
    const sign = rulerSign(S.p, S.e);
    ok(G.band && G.band.sign === sign && G.band.cls.split(' ').includes(sign) && G.band.fill === RULER_STYLE[sign].color, `${date}: band colour = rulerSign → ${sign} (${G.band && G.band.fill})`);
    ok(G.band && G.band.wpx >= 5 * G.staffPx && G.staffPx > 0, `${date}: band ${G.band && G.band.wpx.toFixed(1)} px >= 5 x staff ${G.staffPx.toFixed(2)} px`);
    ok(G.staffFill === RULER_STYLE.staff.color, `${date}: staff = RULER_STYLE grey (${G.staffFill})`);
    // positions: ▶ tip, ▽ / ▼ apex at their values on the ruler's scale; the band spans ▶ .. ▽
    const sc = G.scale;
    ok(Math.abs(G.pPts[0][1] - yOf(sc, S.p)) < 0.02 && Math.abs(G.ePts[0][1] - yOf(sc, S.e)) < 0.02 && Math.abs(G.mPts[0][1] - yOf(sc, S.m)) < 0.02,
      `${date}: marks at their values (▶ y ${G.pPts[0][1]}, ▽ y ${G.ePts[0][1]}, ▼ y ${G.mPts[0][1]})`);
    const bt = Math.min(yOf(sc, S.p), yOf(sc, S.e)), bb = Math.max(yOf(sc, S.p), yOf(sc, S.e));
    ok(Math.abs(G.band.y - bt) < 0.02 || (G.band.h <= 1.6 && G.band.y <= bt && G.band.y + G.band.h >= bb), `${date}: band spans ▶..▽ (y ${G.band.y} h ${G.band.h})`);
    ok(G.vis.p && G.vis.e && G.vis.m && G.vis.band && G.vis.staff && G.vis.tgt, `${date}: ▶ ▽ ▼ band staff 调度线 visible on the desktop`);
    ok(G.tgtV === target, `${date}: 调度线 = cp.piTarget ${target}`);
    ok(G.vis.rope && G.taut === 'false', `${date}: ▽ hangs on the rope; slack read from macro.deanchor (${G.ropeD})`);
    ok(G.vis.stop === (S.p < 0.005), `${date}: 0-stop ${G.vis.stop ? 'shown' : 'hidden'} (▶ ${(S.p * 100).toFixed(2)}% ${S.p < 0.005 ? '<' : '>='} 0.5%)`);
    ok(G.vis.cpi && G.cpiEnds && G.cpiEnds[0][0] <= G.cpiX0 && Math.abs(G.cpiEnds[0][1] - 64) < 3 && Math.abs(G.cpiEnds[1][0] - G.mPts[0][0]) < 0.6 && Math.abs(G.cpiEnds[1][1] - G.mPts[1][1]) < 2,
      `${date}: CPI → ▼ line from the 测流断面 (${G.cpiTxt} at x ${G.cpiX0 && G.cpiX0.toFixed(1)}; line ${JSON.stringify(G.cpiEnds && G.cpiEnds.map(p => p.map(v => +v.toFixed(1))))}) to ▼`);
    ok(G.ids.every(Boolean) && G.layer === 'L-short' && G.cpiLayer === 'L-short', `${date}: ids suction / suctionSave / suctionPump kept, ruler + CPI line in L-short`);
    ok(G.name === '吸力' && /^[+−]?\d/.test(G.val), `${date}: name 「${G.name}」, reading 「${G.val}」`);
    ok(G.save === '存湖' + (sign === 'blue' ? '划算↑' : '不划算') && G.pump === '抽水' + (sign === 'blue' ? '贵↑' : '便宜'), `${date}: arrows follow the band (${G.save} / ${G.pump})`);
    ok(/开阀看 ▽，结账看 ▼/.test(G.title), `${date}: the ruler's title says 「开阀看 ▽，结账看 ▼」`);
    ok(/^到手 ▶−▼ /.test(G.rrText) && /到手实际利率 ▶ − ▼（结账）/.test(G.rrTitle), `${date}: 央行 tag 「${G.rrText}」, title 「${G.rrTitle && G.rrTitle.slice(0, 20)}…」`);
    if (date !== '2008Q4') await shot(`desk-1024-${date}`);
  }
  // legend card + mnemonic
  { const L = JSON.parse(await ev(`JSON.stringify((() => { const l = document.querySelector('.flow-legend'); return { laws: [...l.querySelectorAll('.fl-law')].map(n => n.dataset.law), mn: l.querySelector('.fl-mn').textContent, n: [...l.querySelectorAll('.fl-law')].map(n => n.textContent.split('\\n').length) }; })())`));
    ok(L.laws.join(' ') === '质量守恒 按势差流动 一阶滞后 带延迟的反馈控制' && L.n.every(x => x === 1), `legend card: the 4 physical rules, one line each (${L.laws.join(' / ')})`);
    ok(/预期看▽$/.test(L.mn), `mnemonic ends 「预期看▽」 (${L.mn})`);
    ok(await ev(`(()=>{const s=document.querySelector('#diagram .flow-svg'); return ![...s.querySelectorAll('text')].some(t => /质量守恒|一阶滞后/.test(t.textContent))})()`), 'the 4 rules are in the legend card only (not drawn in the picture)'); }
  ok(await ev(`(()=>{const s=document.querySelector('#diagram'); return !/同比|环比/.test(s.textContent + [...s.querySelectorAll('title')].map(t=>t.textContent).join(''))})()`), 'no 同比 / 环比 on the diagram');

  // ---- 6. the flash order = fiveTurns().order ----
  { const F = fiveTurns();
    let k = ROWS.findIndex((r, i) => i > 0 && r.date >= '2020Q1' && rulerSign(r.p, r.e) !== rulerSign(ROWS[i - 1].p, ROWS[i - 1].e));
    // this machine may ask for reduced motion (then the order is still recorded, but nothing animates): emulate the default
    await send('Emulation.setEmulatedMedia', { features: [{ name: 'prefers-reduced-motion', value: 'no-preference' }] });
    await go(`?pause=1&layers=all&debug=1&t=${k - 1}`);
    await ev(`document.getElementById('btn-step').click()`); await sleep(150);
    const X = JSON.parse(await ev(`JSON.stringify((() => {
      const svg = document.querySelector('#diagram .flow-svg'), slot = svg.querySelector('[data-ruler-slot]');
      const ix = n => n && n.dataset.rlFlash != null ? +n.dataset.rlFlash : null, dl = n => n ? parseFloat(n.style.getPropertyValue('animation-delay')) : null;
      const parts = { lake: [svg.querySelector('rect[data-node="cash"]')], pool: ['poolBond', 'poolGold', 'poolEquity', 'poolHousing'].map(p => svg.querySelector('rect.tank[data-node="' + p + '"]')),
        pump: [svg.querySelector('g.pump.main[data-pipe="newLoans"]')], river: [svg.querySelector('rect.node[data-node="channel"]')] };
      const out = {}; for (const k in parts) out[k] = parts[k].map(n => ({ i: ix(n), d: dl(n), on: !!n && n.classList.contains('rl-flash') }));
      return { date: window.__mw.snap().date, parts: out, order: slot.dataset.flash, at: slot.dataset.flashAt };
    })())`));
    const want = F.order;
    ok(X.date === ROWS[k].date, `flash: stepped ${ROWS[k - 1].date} → ${X.date} (the band turns ${rulerSign(ROWS[k].p, ROWS[k].e)})`);
    const got = want.map((g, i) => g.every(id => X.parts[id].every(p => p.i === i && p.on)));
    ok(Object.keys(X.parts).every(id => want.flat().includes(id)), `flash: every part maps to a fiveTurns place (${Object.keys(X.parts).join(', ')})`);
    const delays = want.map(g => X.parts[g[0]][0].d);
    ok(got.every(Boolean) && delays.every((d, i) => i === 0 || d > delays[i - 1]), `flash order = fiveTurns ${JSON.stringify(want)} (${F.orderText}); delays ${delays.join(' / ')} ms`);
    ok(X.order === want.map(g => g.join('+')).join('>'), `flash log 「${X.order}」 = fiveTurns order`);
    // a re-render of the same quarter does not flash again; a step with no sign change and no widening past a step does not flash
    await sleep(2400);
    ok(await ev(`document.querySelectorAll('#diagram .flow-svg .rl-flash').length === 0`), 'flash: short (gone after ~2 s)');
    // the same quarter drawn again (resize / band ranges) does not flash again
    await ev(`window.dispatchEvent(new Event('resize'))`); await sleep(300);
    ok(await ev(`document.querySelectorAll('#diagram .flow-svg .rl-flash').length === 0`), 'flash: no repeat on a re-render of the same step');
    // reduced motion: no animation, the order is still kept
    await send('Emulation.setEmulatedMedia', { features: [{ name: 'prefers-reduced-motion', value: 'reduce' }] });
    await go(`?pause=1&layers=all&debug=1&t=${k - 1}`);
    await ev(`document.getElementById('btn-step').click()`); await sleep(150);
    ok(await ev(`(()=>{const s=document.querySelector('#diagram [data-ruler-slot]'); return document.querySelectorAll('#diagram .flow-svg .rl-flash').length === 0 && s.dataset.flash === ${JSON.stringify(want.map(g => g.join('+')).join('>'))}})()`), 'flash: reduced motion = no animation (order still logged)');
    await send('Emulation.setEmulatedMedia', { features: [] });
  }

  // 1440 x 900
  await size(1440, 900);
  for (const date of ['2021Q4', '2023Q4']) {
    await go(`?pause=1&layers=all&debug=1&t=${tOf(date)}`);
    const G = JSON.parse(await ev(PROBE));
    ok(G.vis.p && G.vis.e && G.vis.m && G.vis.band && G.vis.cpi && G.band.wpx >= 5 * G.staffPx, `1440 ${date}: ruler drawn (band ${G.band.wpx.toFixed(1)} px, staff ${G.staffPx.toFixed(2)} px)`);
    ok(G.hs, `1440 ${date}: no horizontal scroll`);
    await shot(`desk-1440-${date}`);
  }

  // ---- 7. 真实 mode 2026Q3 ----
  await size(1024, 768);
  { const RS = realSnapshot('USA', 126);
    // the model ends at 2025Q4 (t 123): open 真实 there, then step on the real data to 2026Q3
    await go('?pause=1&layers=all&mode=real&t=123', 3800);
    let G = JSON.parse(await ev(PROBE));
    for (let i = 0; i < 6 && !(G.p === RS.rates.policy && G.m === RS.macro.inflation); i++) {
      await ev(`document.getElementById('btn-step').click()`); await sleep(900);
      G = JSON.parse(await ev(PROBE));
    }
    ok(RS && RS.date === '2026Q3' && G.p === RS.rates.policy && G.m === RS.macro.inflation, `real: on ${RS && RS.date} (▶ ${G.p}, ▼ ${G.m} = the real snapshot)`);
    ok(!G.vis.e && G.e == null, '真实 2026Q3: ▽ hidden (no inflationExp in the real data)');
    ok(G.name === '结账读数' && G.band && G.band.cls.includes('real'), `真实 2026Q3: the band is labelled 「${G.name}」`);
    ok(G.p === RS.rates.policy && G.m === RS.macro.inflation && +G.band.v === G.p - G.m && +G.band.bot === G.m, `真实 2026Q3: band = ▶ ${G.p} − ▼ ${G.m} = ${G.band && G.band.v}`);
    ok(G.band.sign === rulerSign(G.p, G.m) && G.band.fill === RULER_STYLE[G.band.sign].color, `真实 2026Q3: band colour = rulerSign → ${G.band.sign}`);
    ok(G.vis.p && G.vis.m && G.vis.band && !G.vis.rope, '真实 2026Q3: ▶ ▼ band shown, no rope');
    ok(/结账/.test(G.title), '真实 2026Q3: title explains 结账读数');
    await shot('real-1024-2026Q3');
  }

  // ---- 8. phone ----
  await size(390, 844);
  for (const date of ['2021Q4', '2023Q4']) {
    await go(`?pause=1&layers=all&debug=1&t=${tOf(date)}`);
    for (const place of ['river', 'lake']) {
      await ev(`document.querySelector('.flow-places [data-place="${place}"]').click()`); await sleep(450);
      let G = JSON.parse(await ev(PROBE));
      ok(G.vis.p && G.vis.e && G.vis.band && !G.vis.m && !G.vis.rope && !G.vis.tgt && !G.vis.stop && !G.vis.cpi, `phone ${date} ${place}: only ▶ / ▽ / band before a tap (${JSON.stringify(G.vis)})`);
      ok(G.hs, `phone ${date} ${place}: no horizontal scroll at 390`);
      if (place === 'river') await shot(`phone-${date}-river`);
      await ev(`document.querySelector('#diagram [data-ruler-slot] .rl-staff').dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }))`); await sleep(300);
      G = JSON.parse(await ev(PROBE));
      ok(G.vis.m && G.vis.rope && G.vis.tgt && G.vis.p && G.vis.e && G.vis.band, `phone ${date} ${place}: a tap adds ▼, the rope and the 调度线`);
      if (place === 'river') await shot(`phone-${date}-river-tap`);
      await ev(`document.querySelector('#diagram [data-ruler-slot] .rl-staff').dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }))`); await sleep(250);
      G = JSON.parse(await ev(PROBE));
      ok(!G.vis.m && !G.vis.rope, `phone ${date} ${place}: tap again hides them`);
    }
  }
  await send('Emulation.clearDeviceMetricsOverride');

  console.log('errors:', errors.length ? errors : 'none');
  ok(!errors.length, 'no JS errors');
} catch (e) { console.log('driver error', e); fails++; }
finally { try { ws.close(); } catch (e) { /* ignore */ } proc.kill(); }
console.log(fails ? `${fails} FAIL` : 'ALL OK');
process.exit(fails ? 1 : 0);
