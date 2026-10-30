// node tools/check_v3_picture.mjs [--shots]   (serve the repo root first: python -m http.server 8831; BASE=http://localhost:PORT/ overrides; CDP 9831)
// CDP check of the v3.1 water picture (tools/DESIGN-v3.md; src/ui/flow.js): the three places 河 / 湖 / 地下 drawn as one picture.
//  1. the river is a RING: household -> 测流断面 (channel) -> 企业 (firm) -> 分水堰 (weir) -> back to the household, in that order along
//     the ring path; 工资 / 利润 / 利息 / 税 (and the spring wire) leave from the weir box
//  2. the groundwater band lies BELOW the river (y) and spans the width; its water table is below the 吸程线 exactly when the long cycle is
//     B2 or stage ⑤ (US 2004Q1 / 2008Q4 / 2015Q1, read from the snapshot); 「地下的洞 = 欠款 x% GDP」 = the snapshot's private debt / GDP
//  3. the RULER SLOT group (the 吸力 knob) exists with its reserved box (>= 26 x 110 viewBox units, >= 38 x 150 px at 1440 x 900),
//     beside the cash lake / central bank, and the knob sits inside it
//  4. phone 390 x 844: the place switch 河 / 湖 / 地下 (default 河); each place shows its own part of the picture and the knob stays on screen;
//     no horizontal scroll; the panel grip is still there
//  5. the valCapex caption (「历史模式里关着：…」) is visible in history mode (desktop line; phone: the 湖 card and a tap on the chip)
//  6. no JS errors
//  v3.1 polish: the 曲线 / 显示全部 buttons cover no diagram box or label (1024, 1440; they sit in the toolbar row above the drawing);
//     the drawing is >= 90% of its column at 1440; the caption lines wait behind 「说明」; phone: the selected place's drawing is
//     >= 55% of the height between the place switch and the panel grip, the card is 1–2 lines + 「更多」; the item-3 chips
//     (利息 / 抵押品 / 转移 / 利润 / 订单) overlap no box, label or chip, and 利息 is off the deep-pump shaft
// --shots writes tools/shots/v31/*.png: US 2008Q4 and 2015Q1 at 390x844 (each place), 1024x768, 1440x900, and the real mode at 1024x768.
import { spawn } from 'node:child_process';
import { mkdtempSync, mkdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
const EDGE = 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe';
const port = 9831, BASE = process.env.BASE || 'http://localhost:8831/', SHOTS = process.argv.includes('--shots');
const profile = mkdtempSync(join(tmpdir(), 'mw-v31-'));
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
const shotDir = new URL('./shots/v31/', import.meta.url);
const shot = async name => { if (!SHOTS) return; mkdirSync(shotDir, { recursive: true }); writeFileSync(new URL(name + '.png', shotDir), Buffer.from((await send('Page.captureScreenshot', { format: 'png' })).result.data, 'base64')); console.log('   shot', new URL(name + '.png', shotDir).pathname); };
const T = { '2004Q1': 36, '2008Q4': 55, '2015Q1': 80 };

// geometry in viewBox units (getBBox + the element's own translate, enough for the groups used here)
const GEO = `(()=>{
  const svg = document.querySelector('#diagram .flow-svg');
  const bb = n => { if (!n) return null; const b = n.getBBox(); let x = b.x, y = b.y; const tf = n.getAttribute('transform'); const m = tf && /translate\\(([-\\d.]+)[ ,]+([-\\d.]+)\\)/.exec(tf); if (m) { x += +m[1]; y += +m[2]; } return { x, y, w: b.width, h: b.height, cx: x + b.width / 2, cy: y + b.height / 2, b: y + b.height }; };
  const q = s => svg.querySelector(s);
  const ring = q('[data-lk="ring"] .loop-ring');
  const L = ring.getTotalLength(), N = 600, pts = [];
  for (let i = 0; i < N; i++) { const p = ring.getPointAtLength(L * i / N); pts.push([p.x, p.y]); }
  const at = box => { let best = 0, bd = 1e9; for (let i = 0; i < N; i++) { const d = Math.hypot(pts[i][0] - box.cx, pts[i][1] - box.cy); if (d < bd) { bd = d; best = i; } } return { i: best, d: bd }; };
  const boxes = { household: bb(q('rect[data-node="household"]')), channel: bb(q('rect.frame[data-part~="channel"]')), firm: bb(q('rect[data-node="firm"]')), weir: bb(q('[data-lk="weir"] .weir-box')) };
  const pos = {}; for (const k in boxes) pos[k] = at(boxes[k]);
  const start = k => { const p = q('[data-pipe="' + k + '"] path.bed'); const s = p.getPointAtLength(0); return [s.x, s.y]; };
  const mouths = {}; for (const k of ['wages', 'profits', 'interestPaid', 'taxes']) mouths[k] = start(k);
  const sw = q('[data-lk="springWire"] path'); const s0 = sw.getPointAtLength(0);
  const gw = bb(q('[data-lk="groundwater"] .gw-band')) || bb(q('rect[data-node="iou"]'));
  const tab = q('[data-lk="groundwater"] .gw-table'), lift = q('[data-lk="liftLine"] .gw-lift');
  const yOf = p => { const m = /M\\s*[-\\d.]+[ ,]+([-\\d.]+)/.exec(p.getAttribute('d') || ''); return m ? +m[1] : NaN; };
  const hole = q('[data-lk="groundwater"] .gw-hole') || q('.gw-hole');
  const slot = q('[data-ruler-slot]'), rbox = slot && slot.querySelector('.ruler-box'), dial = slot && slot.querySelector('.sk-dial');
  const rb = rbox ? { x: +rbox.getAttribute('x'), y: +rbox.getAttribute('y'), w: +rbox.getAttribute('width'), h: +rbox.getAttribute('height') } : null;
  const db = dial ? (() => { const r = dial.getBoundingClientRect(), s = rbox.getBoundingClientRect(); return { in: r.left >= s.left - 1 && r.right <= s.right + 1 && r.top >= s.top - 1 && r.bottom <= s.bottom + 1 }; })() : null;
  const cash = bb(q('rect[data-node="cash"]')), cb = bb(q('rect[data-node="cb"]'));
  const rpx = rbox ? rbox.getBoundingClientRect() : null;
  return JSON.stringify({ boxes, pos, mouths, spring0: [s0.x, s0.y], gw, ringB: bb(ring), tableY: yOf(tab), liftY: yOf(lift), hole: hole ? hole.textContent : null,
    rb, db, cash, cb, rpx: rpx ? [rpx.width, rpx.height] : null, vb: svg.getAttribute('viewBox') });
})()`;
const SNAP = `(()=>{ const s = window.__mw.snap(), L = s.cycles && s.cycles.long; const iou = s.iou && s.iou.bankTotal != null ? s.iou.bankTotal : ((s.debt && s.debt.household) || 0) + ((s.debt && s.debt.firm) || 0);
  return JSON.stringify({ date: s.date, fork: L ? L.fork : null, stage: L ? L.stage : null, debt: iou / s.macro.gdpNominal }); })()`;
// v3.1 polish probes (screen px). BOXES = every visible diagram box (nodes, tanks, the 测流断面 frame, weir, ruler slot) and label (svg text).
const VIS = `const vis = n => { if (!n) return false; for (let x = n; x && x.tagName !== 'svg'; x = x.parentNode) { const s = getComputedStyle(x); if (s.display === 'none' || s.visibility === 'hidden' || +s.opacity === 0) return false; } const r = n.getBoundingClientRect(); return r.width > 0 && r.height > 0; };
  const R = n => n.getBoundingClientRect(); const hit = (a, b, t = 0.5) => a.left < b.right - t && b.left < a.right - t && a.top < b.bottom - t && b.top < a.bottom - t;`;
const TOGGLES = `(()=>{ ${VIS}
  const svg = document.querySelector('#diagram .flow-svg');
  const btns = [...document.querySelectorAll('#diagram > .view-toggle, #diagram > .layers-toggle')].filter(b => !b.hidden && b.getClientRects().length);
  const boxes = [...svg.querySelectorAll('rect.node, rect.frame, .weir-box, .ruler-box, text, g.chip > rect.bg, .valve')].filter(vis);
  const bad = [];
  for (const b of btns) for (const n of boxes) if (hit(R(b), R(n))) bad.push(b.id + ' x ' + (n.getAttribute('data-node') || n.textContent.trim().slice(0, 12) || n.getAttribute('class')));
  return JSON.stringify({ n: btns.length, names: btns.map(b => b.id), bad: bad.slice(0, 8) });
})()`;
const WIDTH = `(()=>{ const svg = document.querySelector('#diagram .flow-svg'), col = document.querySelector('#diagram'), vb = svg.viewBox.baseVal, m = svg.getScreenCTM();
  return JSON.stringify({ drawn: m.a * vb.width, col: col.getBoundingClientRect().width }); })()`;
const CHIPS = `(()=>{ ${VIS}
  const svg = document.querySelector('#diagram .flow-svg'), q = s => svg.querySelector(s);
  const others = [...svg.querySelectorAll('rect.node, rect.frame, .weir-box, .ruler-box, text:not(.chip text), g.chip > rect.bg')].filter(vis);
  const bad = [];
  for (const k of ['interestPaid', 'collateral', 'transfers', 'profits', 'govPurchases']) {
    const c = q('g.chip[data-pipe="' + k + '"]'); if (!vis(c)) { bad.push(k + ' chip not shown'); continue; }
    const bg = c.querySelector('rect.bg'), r = R(bg);
    for (const n of others) if (n !== bg && !c.contains(n) && hit(r, R(n), 1)) bad.push(k + ' x ' + (n.getAttribute('data-node') || (n.closest('g.chip') && n.closest('g.chip').dataset.pipe + ' chip') || n.textContent.trim().slice(0, 10) || n.getAttribute('class')));
  }
  const shaft = q('[data-pipe="fiscalInjection"] path.bed');
  if (shaft && hit(R(q('g.chip[data-pipe="interestPaid"] rect.bg')), R(shaft), 1)) bad.push('interestPaid x the deep-pump shaft');
  return JSON.stringify({ bad });
})()`;
const inBox = (p, b, pad = 3) => p[0] >= b.x - pad && p[0] <= b.x + b.w + pad && p[1] >= b.y - pad && p[1] <= b.y + b.h + pad;

try {
  await send('Runtime.enable'); await send('Page.enable');
  await size(1024, 768);

  // ---- 1-2. ring, weir, groundwater at three quarters ----
  for (const date of ['2004Q1', '2008Q4', '2015Q1']) {
    await go(`?pause=1&layers=all&debug=1&t=${T[date]}`);
    const S = JSON.parse(await ev(SNAP)), G = JSON.parse(await ev(GEO));
    ok(S.date === date, `${date}: on the quarter (${S.date})`);
    if (date === '2008Q4') {
      const p = G.pos, rel = k => (p[k].i - p.household.i + 600) % 600;
      ok(['household', 'channel', 'firm', 'weir'].every(k => p[k].d < 30), 'ring passes the household, 测流断面, firm and weir: ' + JSON.stringify(Object.fromEntries(Object.entries(p).map(([k, v]) => [k, Math.round(v.d)]))));
      ok(rel('channel') < rel('firm') && rel('firm') < rel('weir'), `ring order household -> 测流断面 -> 企业 -> 分水堰 -> household (${['channel', 'firm', 'weir'].map(k => k + ' ' + rel(k)).join(', ')})`);
      for (const k in G.mouths) ok(inBox(G.mouths[k], G.boxes.weir), `${k} leaves from the 分水堰 (start ${G.mouths[k].map(v => v.toFixed(0))}; weir ${G.boxes.weir.x.toFixed(0)},${G.boxes.weir.y.toFixed(0)} ${G.boxes.weir.w.toFixed(0)}x${G.boxes.weir.h.toFixed(0)})`);
      ok(inBox(G.spring0, G.boxes.weir), 'the spring wire (票息 / 分红 / 租金) starts at the 分水堰');
      ok(G.gw && G.gw.y > G.ringB.b && G.gw.y > G.boxes.household.b && G.gw.y > G.boxes.channel.b, `groundwater band below the river (band top ${G.gw && G.gw.y.toFixed(0)} > ring bottom ${G.ringB.b.toFixed(0)})`);
      ok(G.gw && G.gw.w >= 370, `groundwater band spans the width (${G.gw && G.gw.w.toFixed(0)})`);
    }
    const want = S.fork === 'B2' || S.stage === 5 || S.stage === '⑤';
    ok(isFinite(G.tableY) && isFinite(G.liftY) && (G.tableY > G.liftY) === want, `${date}: water table ${want ? 'below' : 'above'} the 吸程线 (fork ${S.fork}, stage ${S.stage}; table y ${G.tableY}, line y ${G.liftY})`);
    const pctTxt = Math.round(S.debt * 100) + '%';
    ok(G.hole === `地下的洞 = 欠款 ${pctTxt} GDP`, `${date}: 「${G.hole}」 = snapshot private debt / GDP ${pctTxt}`);
    if (date === '2008Q4') {
      ok(G.rb && G.rb.w >= 26 && G.rb.h >= 110, `RULER SLOT reserved box ${G.rb && G.rb.w}x${G.rb && G.rb.h} (viewBox units)`);
      ok(G.db && G.db.in, 'the 吸力 knob sits inside the RULER SLOT box');
      ok(G.rb && G.cash && Math.abs(G.rb.x + G.rb.w - G.cash.x) < 10 && G.rb.y <= G.cash.y + 5 && G.rb.y + G.rb.h >= G.cash.b - 5, 'the slot stands beside the cash lake / central bank, as tall as the lake row');
      // v3.1 polish: the caption lines sit behind 「说明」 in the toolbar row (a drop-down over the drawing)
      ok(await ev(`(()=>{const t=document.querySelector('.flow-v3cap .v3-vc'); return !!t && !t.hidden && t.getClientRects().length === 0})()`), 'history mode: the valCapex caption waits behind 「说明」 (not taking height)');
      await ev(`document.querySelector('.flow-tools .ft-more').click()`); await sleep(250);
      ok(await ev(`(()=>{const t=document.querySelector('.flow-v3cap .v3-vc'); return !!t && t.getClientRects().length > 0 && /历史模式里关着：模型的股价比真实早两年见顶，接上会更不稳；沙盒里是开的/.test(t.textContent)})()`), 'history mode: 「说明」 shows the valCapex caption line');
      await ev(`document.querySelector('.flow-tools .ft-more').click()`); await sleep(200);
      const C = JSON.parse(await ev(CHIPS));
      ok(!C.bad.length, `item-3 chips (利息 / 抵押品 / 转移 / 利润 / 订单) overlap no box, label or other chip; 利息 is off the shaft${C.bad.length ? ': ' + C.bad.join(' | ') : ''}`);
      const B = JSON.parse(await ev(TOGGLES));
      ok(B.n >= 1 && !B.bad.length, `1024x768: the toggle buttons (${B.names.join(', ')}) cover no diagram box or label${B.bad.length ? ': ' + B.bad.join(' | ') : ''}`);
      ok(await ev(`(()=>{const c=document.querySelector('.flow-svg g.chip[data-pipe="valCapex"]'); return !!c && /股价·关/.test(c.textContent) && c.classList.contains('shut')})()`), 'history mode: the valCapex chip reads 股价·关 (grey)');
      await shot('desk-1024-2008Q4');
    }
    if (date === '2015Q1') await shot('desk-1024-2015Q1');
  }
  ok(await ev(`(()=>{ const s=document.querySelector('#diagram .flow-svg'); return [...s.querySelectorAll('text')].every(t => !/地下水 −|水 \\d+%|欠条/.test(t.textContent)) })()`), 'no inherited 「地下水 −x% / 水 y%」 / 欠条 labels');

  // 1440 x 900: the slot is at least ~40 x 160 px
  await size(1440, 900);
  await go('?pause=1&layers=all&debug=1&t=55');
  let G = JSON.parse(await ev(GEO));
  ok(G.rpx && G.rpx[0] >= 38 && G.rpx[1] >= 150, `1440x900: RULER SLOT on screen ${G.rpx && G.rpx.map(v => v.toFixed(0)).join('x')} px (room for a ~40x160 gauge)`);
  { const B = JSON.parse(await ev(TOGGLES));
    ok(B.n >= 1 && !B.bad.length, `1440x900: the toggle buttons (${B.names.join(', ')}) cover no diagram box or label${B.bad.length ? ': ' + B.bad.join(' | ') : ''}`);
    const W = JSON.parse(await ev(WIDTH));
    ok(W.drawn >= 0.9 * W.col, `1440x900: the drawing is ${W.drawn.toFixed(0)} px wide in a ${W.col.toFixed(0)} px column (${(100 * W.drawn / W.col).toFixed(0)}% >= 90%)`); }
  await shot('desk-1440-2008Q4');
  await go('?pause=1&layers=all&debug=1&t=80'); await shot('desk-1440-2015Q1');

  // real mode at 1024 (still draws; screenshots)
  await size(1024, 768);
  await go('?pause=1&layers=all&mode=real&t=55', 3800);
  ok(await ev(`!!document.querySelector('#diagram .flow-svg [data-lk="groundwater"]') && document.querySelectorAll('#diagram .flow-svg .v-est').length > 0`), 'real mode 2008Q4: the picture draws, model estimates greyed');
  await shot('real-1024-2008Q4');
  await go('?pause=1&layers=all&mode=real&t=80', 3800); await shot('real-1024-2015Q1');

  // ---- 4. phone: one place at a time ----
  await size(390, 844);
  for (const date of ['2008Q4', '2015Q1']) {
    await go(`?pause=1&layers=all&debug=1&t=${T[date]}`);
    const sw = JSON.parse(await ev(`JSON.stringify([...document.querySelectorAll('.flow-places [data-place]')].map(b => [b.dataset.place, b.textContent.trim(), b.getAttribute('aria-pressed')]))`));
    ok(sw.length === 3 && sw.map(x => x[1]).join(' ') === '河 湖 地下' && sw[0][2] === 'true', `${date} phone: place switch 河 / 湖 / 地下, default 河 (${JSON.stringify(sw)})`);
    // (v3.1 polish: each place is scaled up and cropped, drag sideways for the rest; the ground band is wider than the crop, so its
    //  own drawing = the 地下的洞 line)
    for (const [place, sel] of [['river', 'rect.frame[data-part~="channel"]'], ['lake', 'rect[data-node="poolEquity"]'], ['ground', '[data-lk="groundwater"] .gw-hole']]) {
      await ev(`document.querySelector('.flow-places [data-place="${place}"]').click()`); await sleep(500);
      const r = JSON.parse(await ev(`(()=>{
        const svg = document.querySelector('#diagram .flow-svg'), s = svg.getBoundingClientRect(), w = document.querySelector('.flow-wrap');
        const vis = n => { if (!n) return false; for (let x = n; x && x !== svg; x = x.parentNode) if (getComputedStyle(x).display === 'none') return false; const r = n.getBoundingClientRect(); return r.width > 0 && r.left >= s.left - 2 && r.right <= s.right + 2 && r.top >= s.top - 2 && r.bottom <= s.bottom + 2; };
        const knob = svg.querySelector('[data-ruler-slot] .sk-dial');
        const rr = n => { const r = n.getBoundingClientRect(); return [Math.round(r.left), Math.round(r.top), Math.round(r.width), Math.round(r.height)]; };
        return JSON.stringify({ place: w.dataset.place, main: vis(svg.querySelector(${JSON.stringify(sel)})), knob: vis(knob), kr: rr(knob), svg: rr(svg), vb: svg.getAttribute('viewBox'),
          pressed: document.querySelector('.flow-places [data-place="${place}"]').getAttribute('aria-pressed'), card: (document.querySelector('.flow-place-card') || {}).textContent || '', hs: document.documentElement.scrollWidth <= innerWidth,
          drawnH: (() => { const m = svg.getScreenCTM(), vb = svg.viewBox.baseVal; return m.d * vb.height; })(),
          room: document.querySelector('#panel-grip').getBoundingClientRect().top - document.querySelector('.flow-places').getBoundingClientRect().bottom,
          cardH: Math.round(document.querySelector('.flow-place-card').getBoundingClientRect().height), more: !!document.querySelector('.flow-place-card .fpc-more') });
      })()`));
      ok(r.drawnH >= 0.55 * r.room, `${date} phone ${place}: the drawing is ${r.drawnH.toFixed(0)} px tall, ${(100 * r.drawnH / r.room).toFixed(0)}% of the ${r.room.toFixed(0)} px between the place switch and the panel grip (>= 55%)`);
      ok(r.cardH <= 60 && r.more, `${date} phone ${place}: the card is short (${r.cardH} px, 1–2 lines) with 「更多」`);
      ok(r.place === place && r.pressed === 'true', `${date} phone ${place}: switched (${r.place}, viewBox ${r.vb})`);
      ok(r.main, `${date} phone ${place}: the place's own drawing is on screen`);
      ok(r.knob, `${date} phone ${place}: the 吸力 knob stays visible (${r.kr} in svg ${r.svg})`);
      ok(r.hs, `${date} phone ${place}: no horizontal scroll at 390`);
      if (place === 'lake') ok(/历史模式里关着/.test(r.card), `${date} phone 湖: the card carries the valCapex caption`);
      await shot(`phone-${date}-${place}`);
    }
    await ev(`document.querySelector('.flow-places [data-place="river"]').click()`); await sleep(300);
  }
  // phone: a tap on the 股价·关 chip shows the sentence
  await ev(`document.querySelector('.flow-places [data-place="lake"]').click()`); await sleep(400);
  await ev(`(()=>{const c=document.querySelector('.flow-svg g.chip[data-pipe="valCapex"]'); c.dispatchEvent(new MouseEvent('click',{bubbles:true,cancelable:true}))})()`); await sleep(400);
  ok(await ev(`(()=>{const p=document.querySelector('.flow-cpop'); return !!p && !p.hidden && /历史模式里关着/.test(p.textContent)})()`), 'phone: tapping the 股价·关 chip shows 「历史模式里关着：…」');
  ok(await ev(`(()=>{const g=document.querySelector('#panel-grip'); return !!g && g.getClientRects().length > 0})()`), 'phone: the panel grip is still there');
  // phone lesson: the whole picture (no place switch)
  await go('?pause=1&lesson=m3&step=0&nozoom=1', 3800);
  ok(await ev(`document.body.classList.contains('lesson-on') && !(document.querySelector('.flow-places') && document.querySelector('.flow-places').getClientRects().length)`), 'phone lesson: the whole picture, no place switch');
  await send('Emulation.clearDeviceMetricsOverride');

  console.log('errors:', errors.length ? errors : 'none');
  ok(!errors.length, 'no JS errors');
} catch (e) { console.log('driver error', e); fails++; }
finally { try { ws.close(); } catch (e) { /* ignore */ } proc.kill(); }
console.log(fails ? `${fails} FAIL` : 'ALL OK');
process.exit(fails ? 1 : 0);
