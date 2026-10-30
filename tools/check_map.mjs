// node tools/check_map.mjs   (serve the repo root first: python -m http.server 8185; BASE=http://localhost:PORT/ overrides)
// CDP check of the 🌍 地图 page: opens, seven boxes, select = card and NO navigation, not-ready enter is disabled, USA enter returns to the
// main screen (US sim keeps its state), year slider, pipe toggles, mw:map event, ?map=1&select=, ?country= boot hook, phone layout, no JS errors.
// Geometry (iPad 1180×820, phone 390, desktop 1920×1000): boxes do not overlap, every pipe has an arrowhead ≥ ARROW_MIN px, no pipe passes
// through a box interior, the two lanes of a two-way pair do not overlap; selection fades all other pipes and labels only its own.
// 1440×900: the AUS 地下 tip does not cover the AUS box; the year span (1995–2025) never wraps; box 河 rows read 河 物价 x%.
// 吸力尺 at the gates (iPad, 390, 1440): ▶差 = the data, only CNY has a rope, bar only ≥ 768px, the card's 利率平价 line, no overflow at 390.
// SHOTS=<folder> saves the 2008 CHN-selected screenshots (1440, 390, 390 card) there.
import { spawn } from 'node:child_process';
const EDGE = 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe';
const port = +process.env.CDP_PORT || 9361, BASE = process.env.BASE || 'http://localhost:8185/';
const proc = spawn(EDGE, ['--headless=new', '--disable-gpu', `--remote-debugging-port=${port}`, '--window-size=1180,820', 'about:blank'], { stdio: 'ignore' });
const sleep = ms => new Promise(r => setTimeout(r, ms));
const allLayers = u => (/^about:/.test(u) ? u : u + (u.includes('?') ? '&' : '?') + 'layers=all');   // progressive diagram: this check wants the whole diagram (layers: tools/check_layers.mjs)
const errors = [], navs = [];
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
    else if (d.method === 'Page.frameNavigated' && !d.params.frame.parentId) navs.push(d.params.frame.url);
  };
  const send = (method, params = {}) => new Promise(res => { const i = ++id; pending.set(i, res); ws.send(JSON.stringify({ id: i, method, params })); });
  const ev = async expr => { const r = await send('Runtime.evaluate', { expression: expr, awaitPromise: true, returnByValue: true }); if (r.result.exceptionDetails) throw new Error(r.result.exceptionDetails.exception?.description || 'eval error'); return r.result.result.value; };
  await send('Runtime.enable'); await send('Page.enable');
  return {
    send, ev, close: () => ws.close(),
    go: async url => { await send('Page.navigate', { url: allLayers(url) }); await sleep(2300); },
    click: sel => ev(`(()=>{const b=document.querySelector(${JSON.stringify(sel)}); if(!b) return 'missing'; b.dispatchEvent(new MouseEvent('click',{bubbles:true,cancelable:true})); return 'ok'})()`),
    count: sel => ev(`document.querySelectorAll(${JSON.stringify(sel)}).length`),
    text: sel => ev(`(document.querySelector(${JSON.stringify(sel)})||{}).textContent||''`),
    viewport: (w, h) => send('Emulation.setDeviceMetricsOverride', { width: w, height: h, deviceScaleFactor: 1, mobile: w < 500 }),
  };
}
const tabs = async () => (await (await fetch(`http://127.0.0.1:${port}/json`)).json()).filter(x => x.type === 'page');
const mapOpen = c => c.ev(`!document.getElementById('world-map').hidden && document.body.dataset.map === '1'`);
const setYear = (c, y) => c.ev(`(()=>{const s=document.querySelector('.wm-slider'); s.value=${y}; s.dispatchEvent(new Event('input',{bubbles:true})); return 1})()`);
const pipes = (c, k) => c.count(`.wm-pipe[data-k="${k}"]`);
// geometry of what is drawn: box overlaps, arrowhead size, pipes through a box interior, the two lanes of a two-way pair overlapping.
const ARROW_MIN = 12;
const GEOM = `(() => {
  const svg = document.querySelector('.wm-svg'), W = +svg.getAttribute('width');
  const bb = el => { const b = el.getBBox(); return { x: b.x, y: b.y, w: b.width, h: b.height }; };
  const boxes = [...svg.querySelectorAll('.wm-box')].map(g => ({ id: g.dataset.iso, r: bb(g.querySelector('.wm-rect')) }));
  const pr = svg.querySelector('.wm-prect'); if (pr) boxes.push({ id: 'POOL', r: bb(pr) });
  const ov = [];
  for (let i = 0; i < boxes.length; i++) for (let j = i + 1; j < boxes.length; j++) {
    const a = boxes[i].r, b = boxes[j].r;
    if (a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y) ov.push(boxes[i].id + '/' + boxes[j].id);
  }
  const outside = boxes.filter(b => b.r.x < -1 || b.r.x + b.r.w > W + 1).map(b => b.id);
  const ps = [...svg.querySelectorAll('.wm-pipe')].filter(g => getComputedStyle(g).display !== 'none');
  const D = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1]);
  const small = [], intr = [], lanes = {}, samp = {};
  let minAh = 1e9;
  for (const g of ps) {
    const id = g.dataset.from + '>' + g.dataset.to, poly = g.querySelector('.wm-arrow');
    const pt = poly ? poly.getAttribute('points').trim().split(/\\s+/).map(s => s.split(',').map(Number)) : [];
    if (pt.length < 3) { small.push(id + ':none'); continue; }
    const l = pt[1], r = pt[pt.length - 1], wd = D(l, r), ln = D(pt[0], [(l[0] + r[0]) / 2, (l[1] + r[1]) / 2]), sz = Math.min(wd, ln);
    minAh = Math.min(minAh, sz);
    if (sz < ${ARROW_MIN}) small.push(id + ':' + sz.toFixed(1));
    const path = g.querySelector('.wm-bed'), L = path.getTotalLength(), S = [];
    for (let i = 0; i <= 40; i++) { const q = path.getPointAtLength(L * i / 40); S.push([q.x, q.y]); }
    samp[id] = { S, w: +g.dataset.w, k: g.dataset.k };
    for (const b of boxes) {
      if (b.id === g.dataset.from || b.id === g.dataset.to) continue;
      const r = b.r, n = S.filter(([x, y]) => x > r.x + 1 && x < r.x + r.w - 1 && y > r.y + 1 && y < r.y + r.h - 1).length;
      if (n) intr.push(id + ' through ' + b.id + ' (' + n + '/41)');
    }
  }
  const segD = (p, a, b) => { const dx = b[0] - a[0], dy = b[1] - a[1], l2 = dx * dx + dy * dy || 1, t = Math.max(0, Math.min(1, ((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / l2)); return Math.hypot(p[0] - a[0] - t * dx, p[1] - a[1] - t * dy); };
  const pairOv = []; let nPairs = 0;
  for (const id in samp) {
    const [f, t] = id.split('>'), back = samp[t + '>' + f];
    if (!back || f > t || samp[id].k !== 'trade') continue;
    nPairs++;
    const A = samp[id], need = (A.w + back.w) / 2 - 0.75;
    let mn = 1e9;
    for (const p of A.S.slice(3, -3)) for (let i = 1; i < back.S.length; i++) mn = Math.min(mn, segD(p, back.S[i - 1], back.S[i]));
    if (mn < need) pairOv.push(id + ' gap ' + mn.toFixed(1) + ' < ' + need.toFixed(1));
  }
  return { n: ps.length, ov, outside, small, minAh: +minAh.toFixed(1), intr, nPairs, pairOv };
})()`;
async function geom(c, label, pairs = true) {
  const g = await c.ev(GEOM);
  ok(g.n > 0 && !g.ov.length && !g.outside.length, `[${label}] boxes + reservoir do not overlap and sit inside the stage (${g.ov.join(', ') || 'no overlap'}${g.outside.length ? '; outside: ' + g.outside : ''})`);
  ok(!g.small.length, `[${label}] every visible pipe (${g.n}) has an arrowhead ≥ ${ARROW_MIN}px (smallest ${g.minAh}px)${g.small.length ? ': ' + g.small.join(', ') : ''}`);
  ok(!g.intr.length, `[${label}] no pipe passes through a box interior${g.intr.length ? ': ' + g.intr.join('; ') : ''}`);
  if (pairs) ok(g.nPairs > 0 && !g.pairOv.length, `[${label}] two-way pairs drawn as separate lanes that do not overlap (${g.nPairs} pairs)${g.pairOv.length ? ': ' + g.pairOv.join('; ') : ''}`);
}
const FOCUS = `(() => {
  const svg = document.querySelector('.wm-svg'), sel = document.querySelector('.wm-box.sel')?.dataset.iso || null;
  const op = g => +getComputedStyle(g).opacity;
  const ps = [...svg.querySelectorAll('.wm-pipe')], hl = ps.filter(g => g.classList.contains('hl')), other = ps.filter(g => !g.classList.contains('hl'));
  const chips = [...svg.querySelectorAll('.wm-chip')].map(c => c.dataset.from + '>' + c.dataset.to);
  return { sel, nHl: hl.length, hlOp: Math.min(...hl.map(op)), otherOp: other.length ? Math.max(...other.map(op)) : 0, chips,
    chipsOk: !sel || chips.every(k => k.split('>').includes(sel) || (sel === 'USA' && k.endsWith('>POOL'))), hlLab: hl.length };
})()`;

// mini 吸力尺 at the gates: every non-US box shows ▶差 = its policy rate − the US one (= the data), the USA its own ▶, no ROW ruler;
// only CNY has a rope (to the 官方价 line, 有绳（钉住）); the bar only from 768px; each ruler sits inside the stage and covers no box,
// no sluice and no other ruler. The tooltip carries the ▽汇 note; no 同比 / 环比.
const PARITY = '真推力 = 利差 − 预期贬值（利率平价）', NO_FX_EXP = '▽汇（预期汇率变化）没有数据：闸用利差 + 恐慌代替';
const RULER = `import('/src/data/world.js').then(m => {
  const W = m.WORLD, k = W.years.indexOf(+document.querySelector('.wm-slider').value), pr = i => W.countries[i].policyRate[k];
  const s = document.querySelector('.wm-stage').getBoundingClientRect(), R = q => { const r = q.getBoundingClientRect(); return { l: r.left, t: r.top, r: r.right, b: r.bottom }; };
  const hit = (a, b) => a.l < b.r - 0.5 && a.r > b.l + 0.5 && a.t < b.b - 0.5 && a.b > b.t + 0.5;
  const fmt = v => (Math.abs(v) < 0.0005 ? '' : v > 0 ? '+' : '−') + Math.abs(v * 100).toFixed(1) + '点';
  const rects = [...document.querySelectorAll('.wm-box')].map(g => ({ id: 'box ' + g.dataset.iso, r: R(g.querySelector('.wm-rect')) }))
    .concat([...document.querySelectorAll('.wm-sluice')].map(g => ({ id: 'sluice ' + g.dataset.iso, r: R(g.querySelector('.wm-sl-bg')) })), [{ id: 'pool', r: R(document.querySelector('.wm-prect')) }],
      [...document.querySelectorAll('.wm-chip')].map(g => ({ id: 'label ' + g.textContent, r: R(g.querySelector('rect')) })));
  const out = { isos: [], bad: [], ropes: [], bars: [], outside: [], cover: [], peg: '', tipOk: true, words: false };
  const rs = [...document.querySelectorAll('.wm-ruler')];
  for (const g of rs) {
    const iso = g.dataset.iso, txt = g.querySelector('.wm-r-t').textContent.replace(/\\s+/g, ' ').trim(), tip = g.querySelector('title').textContent;
    out.isos.push(iso); out.bars.push(g.dataset.bar === '1' && !!g.querySelector('.wm-r-band'));
    if (iso === 'USA') { if (Math.abs(+g.dataset.p - pr('USA')) > 1e-12 || !/^▶ \\d+\\.\\d%$/.test(txt)) out.bad.push(iso + ' ' + txt); }
    else { const want = pr(iso) - pr('USA'); if (Math.abs(+g.dataset.gap - want) > 1e-12 || txt !== '▶差 ' + fmt(want)) out.bad.push(iso + ' ' + txt + ' want ' + fmt(want)); }
    if (g.querySelector('.wm-rope')) { out.ropes.push(iso); out.peg = g.querySelector('.wm-peg-t')?.textContent || ''; }
    if (!tip.includes(${JSON.stringify(NO_FX_EXP)})) out.tipOk = false;
    if (/同比|环比/.test(tip + txt)) out.words = true;
    const r = R(g.querySelector('.wm-r-bg')), peg = g.querySelector('.wm-peg'), rr = peg ? R(peg) : null;
    for (const q of [r, rr].filter(Boolean)) if (q.l < s.left - 1 || q.r > s.right + 1) out.outside.push(iso);
    for (const o of rects) if (hit(r, o.r) || (rr && o.id !== 'sluice ' + iso && hit(rr, o.r))) out.cover.push(iso + '/' + o.id);
    for (const h of rs) if (h !== g && hit(r, R(h.querySelector('.wm-r-bg')))) out.cover.push(iso + '/ruler ' + h.dataset.iso);
  }
  return out;
})`;
async function rulers(c, label, bar) {
  const r = await c.ev(RULER);
  ok(r.isos.join(',') === 'USA,GBR,EA,CHN,JPN,AUS' && !r.bad.length, `[${label}] 吸力尺: every non-US box shows ▶差 = its policy rate − the US one (= the data), the USA its own ▶, no ROW ruler (${r.isos.join(',')})${r.bad.length ? ': ' + r.bad.join('; ') : ''}`);
  ok(r.ropes.join(',') === 'CHN' && r.peg.includes('官方价') && r.peg.includes('有绳（钉住）'), `[${label}] only CNY has a rope, to the 官方价 line, labelled 有绳（钉住） (ropes: ${r.ropes.join(',') || 'none'} · ${r.peg})`);
  ok(r.bars.every(b => b === bar), `[${label}] ruler bar ${bar ? 'shown (≥ 768px)' : 'hidden: ▶差 number only (< 768px)'}: ${r.bars.join(',')}`);
  ok(!r.outside.length && !r.cover.length, `[${label}] every ruler inside the stage, covering no box / sluice / other ruler, and no pipe label on it${r.outside.length ? '; outside: ' + r.outside : ''}${r.cover.length ? '; covers: ' + r.cover.join(', ') : ''}`);
  ok(r.tipOk && !r.words, `[${label}] each ruler tooltip carries the ▽汇 note; no 同比 / 环比`);
}
async function rulerCard(c, iso, label) {
  const k = await c.ev(`(()=>{const d=document.querySelector('.wm-card .wm-rc[data-ruler="${iso}"]'); if(!d) return null; const c=document.querySelector('.wm-card'); return { par: (d.querySelector('[data-parity]')||{}).textContent, rope: d.querySelector('[data-rope]')?.dataset.rope, ropeT: (d.querySelector('[data-rope]')||{}).textContent, txt: d.textContent, x: c.scrollWidth <= c.clientWidth + 1 }})()`);
  ok(k && k.par === PARITY && k.txt.includes(NO_FX_EXP) && k.x && !/同比|环比/.test(k.txt), `[${label}] ${iso} card: one 吸力尺 block with 「${PARITY}」 and the ▽汇 note, no sideways overflow: ${k && k.txt.replace(/\s+/g, ' ').slice(0, 90)}`);
  ok(k && (iso === 'CHN' ? k.rope === 'peg' && k.ropeT.includes('有绳（钉住）') : k.rope === 'float' && k.ropeT.includes('没绳（浮动）')), `[${label}] ${iso} card: ${iso === 'CHN' ? '有绳（钉住）' : '没绳（浮动）'} (${k && k.ropeT})`);
}
// year-slider drag throttle: 30 input events 16 ms apart between pointerdown and pointerup. The year label follows every event,
// the map redraws at most once per ~120 ms (≤ DRAG_MAX), and after release the map + card show the final year.
const DRAG_MAX = 8;
const DRAG = `new Promise(res => {
  const s = document.querySelector('.wm-slider'), svg = document.querySelector('.wm-svg'), r0 = +svg.dataset.redraws;
  s.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true }));
  let i = 0, lab = true, slow = 0; const t0 = performance.now();
  const step = () => {
    const y = 1995 + (i * 7) % 31, a = performance.now(); s.value = y; s.dispatchEvent(new Event('input', { bubbles: true })); slow = Math.max(slow, performance.now() - a);
    if (document.querySelector('.wm-yv').textContent !== String(y)) lab = false;
    if (++i < 30) return setTimeout(step, 16);
    const during = +svg.dataset.redraws - r0, ms = performance.now() - t0, fin = s.value, dragMs = +svg.dataset.ms;
    s.dispatchEvent(new PointerEvent('pointerup', { bubbles: true }));
    setTimeout(() => res({ during, ms: Math.round(ms), lab, slow: +slow.toFixed(1), fin, mapY: svg.dataset.year, fast: svg.dataset.fast, card: (document.querySelector('.wm-card h3') || {}).textContent || '', dragMs, fullMs: +svg.dataset.ms }), 300);
  };
  step();
})`;
async function dragCheck(c, label) {
  const d = await c.ev(DRAG);
  ok(d.during <= DRAG_MAX && d.lab, `[${label}] drag throttle: ${d.during} map redraws during a 30-event drag (${d.ms} ms; ≤ ${DRAG_MAX}), year label followed every event, slowest input handler ${d.slow} ms (mid-drag redraw ${d.dragMs} ms, full redraw ${d.fullMs} ms)`);
  ok(d.mapY === d.fin && d.fast === '0' && (d.card.includes(d.fin) || !d.card), `[${label}] after release: one full (not fast) redraw, map + card show the final year ${d.fin} (map ${d.mapY}, card ${d.card.slice(0, 20)})`);
}
const SHOTS = process.env.SHOTS || '';            // a folder: save the 吸力尺 screenshots there (1440 + 390, 2008, CHN selected)
async function shot(c, name) {
  if (!SHOTS) return;
  const fs = await import('node:fs'), path = await import('node:path');
  fs.mkdirSync(SHOTS, { recursive: true });
  const r = await c.send('Page.captureScreenshot', { format: 'png' });
  const f = path.resolve(SHOTS, name); fs.writeFileSync(f, Buffer.from(r.result.data, 'base64')); console.log('   shot:', f);
}

try {
  let ver = null;
  for (let i = 0; i < 40 && !ver; i++) { try { ver = await (await fetch(`http://127.0.0.1:${port}/json/version`)).json(); } catch (e) { await sleep(250); } }
  const bw = new WebSocket(ver.webSocketDebuggerUrl); await new Promise((res, rej) => { bw.onopen = res; bw.onerror = rej; });
  const before = new Set((await tabs()).map(x => x.id));
  bw.send(JSON.stringify({ id: 1, method: 'Target.createTarget', params: { url: 'about:blank' } }));
  let tab = null; for (let i = 0; i < 40 && !tab; i++) { await sleep(150); tab = (await tabs()).find(x => !before.has(x.id)); }
  const A = await client(tab);
  await A.viewport(1180, 820);

  // ---- 1. open from the button; the US sim keeps its state ----
  await A.go(BASE + '?pause=1&t=53');
  const date0 = await A.text('#date');
  ok(date0 === '2008Q2', 'main screen at 2008Q2 (t=53): ' + date0);
  ok(await A.ev(`!!document.getElementById('btn-map') && document.getElementById('btn-map').textContent.includes('地图')`), '🌍 地图 button in the top bar');
  ok(!(await mapOpen(A)), 'map closed at first');
  await A.click('#btn-map'); await sleep(700);
  ok(await mapOpen(A), 'button opens the map overlay');
  ok(await A.ev(`location.search.includes('map=1')`), 'URL carries ?map=1 while open');
  ok(await A.count('.wm-box') === 7, 'seven boxes: ' + await A.ev(`[...document.querySelectorAll('.wm-box')].map(b=>b.dataset.iso).join(',')`));
  ok(await A.ev(`document.querySelector('.wm-slider').value`) === '2008', 'year slider starts at the game year (2008)');
  ok((await A.text('.wm-yv')) === '2008' && await A.ev(`document.querySelector('.wm-res').hidden`), '2008: no 保留样本 label');
  ok((await A.text('.wm-back')).includes('回到美国水流图'), 'back button text');
  ok((await A.text('.wm-pool')).includes('最大的湖') && (await A.text('.wm-pool')).includes('储备占') && (await A.text('.wm-pool')).includes('美联储加息 = 最大的湖吸力变大'), 'v3: the US lake = 最大的湖：美元 · 储备占 x%, captioned 美联储加息: ' + (await A.text('.wm-pt')));
  ok(await A.count('.wm-pool rect[style*="--c-"]') >= 3, 'reserve legend bar has currency segments');
  // trade pipes: every named pair above the threshold + ALL 其他国家 (ROW) pipes, grey, at their TRUE width (one scale), drawn behind
  const tp = await A.ev(`[...document.querySelectorAll('.wm-pipe[data-k="trade"]')].map(g => ({ f: g.dataset.from, t: g.dataset.to, v: +g.dataset.v, w: +g.dataset.w, row: g.dataset.row === '1',
    col: getComputedStyle(g.querySelector('.wm-dash')).stroke, i: [...g.parentNode.children].indexOf(g) }))`);
  const rowP = tp.filter(p => p.row), namP = tp.filter(p => !p.row);
  const rowAll = await A.ev(`import('/src/data/world.js').then(m => { const k = m.WORLD.years.indexOf(2008), I = ['USA','GBR','EA','CHN','JPN','AUS']; let n = 0; for (const a of I) { if (m.WORLD.trade.ROW[a][k] > 0) n++; if (m.WORLD.trade[a].ROW[k] > 0) n++; } return n; })`);
  ok(rowP.length === rowAll && rowP.length >= 10, `all 其他国家 (ROW) trade pipes drawn (${rowP.length} of ${rowAll}), never thinned out`);
  const unit = tp.map(p => (p.w - 1.6) / Math.sqrt(p.v));
  ok(Math.max(...unit) - Math.min(...unit) < 1e-3 * Math.max(...unit), `ROW and named pipes share ONE width scale (true thickness): (w − 1.6)/√v spread ${(Math.max(...unit) - Math.min(...unit)).toExponential(1)}`);
  ok(rowP.length && rowP.every(p => p.col === rowP[0].col) && namP.length && rowP[0].col !== namP[0].col, `ROW pipes are grey (${rowP[0]?.col}), named pipes green (${namP[0]?.col})`);
  ok(Math.max(...rowP.map(p => p.i)) < Math.min(...namP.map(p => p.i)), 'ROW pipes are drawn first (behind the named ones)');
  const pairs = ps => [['AUS', 'CHN'], ['JPN', 'CHN'], ['JPN', 'USA']].map(([a, b]) => ps.some(p => (p.f === a && p.t === b) || (p.f === b && p.t === a)));
  ok(pairs(namP).every(Boolean), `2008: AUS↔CHN, JPN↔CHN, JPN↔USA pipes present (${pairs(namP)})`);
  ok(namP.length >= 12, `named pairs above the threshold: ${namP.length} pipes (was top-8 incl. ROW)`);
  // FX sluices
  ok(await A.count('.wm-sluice[data-term="fx"]') === 6 && !(await A.count('.wm-sluice[data-iso="ROW"]')), 'a FX sluice under each of the six country boxes (not ROW), data-term="fx"');
  ok((await A.text('.wm-sluice[data-iso="USA"]')).includes('美元指数') && (await A.text('.wm-sluice[data-iso="AUS"]')).includes('澳元'), `sluices: USA ${await A.text('.wm-sluice[data-iso="USA"]')} · AUS ${await A.text('.wm-sluice[data-iso="AUS"]')}`);
  await A.click('.wm-sluice[data-iso="AUS"] .wm-sl-bg'); await sleep(600);
  const fxc = await A.ev(`(()=>{const r=document.getElementById('concept-root'); return r && !r.hidden ? { t: r.querySelector('.cc-title')?.textContent, five: r.querySelectorAll('.fxr-card li').length, go: !!r.querySelector('[data-fxr-lesson="fx"]'), top: +getComputedStyle(r).zIndex } : null})()`);
  ok(fxc && fxc.t === '汇率' && fxc.five === 5 && fxc.go, `tapping the AUS sluice opens the 汇率 card (five forces + 「去上「汇率」课」): ${JSON.stringify(fxc)}`);
  ok(await mapOpen(A) && !(await A.ev(`document.querySelector('.wm-box.sel')`)), 'the sluice tap neither closes the map nor selects / deselects');
  await A.ev(`document.querySelector('#concept-root [data-cc-close]').click()`); await sleep(200);
  await rulers(A, 'iPad 2008', true);
  ok(!(await A.ev(`[...document.querySelectorAll('.wm-box')].some(b => b.textContent.includes('▽汇'))`)), '吸力尺: the ▽汇 note is not written on any box (tooltip / card only)');
  await A.click('.wm-ruler[data-iso="JPN"] .wm-r-bg'); await sleep(300);
  ok(await mapOpen(A) && await A.ev(`document.querySelector('.wm-box.sel')?.dataset.iso`) === 'JPN' && await A.ev(`document.querySelector('.wm-ruler.sel')?.dataset.iso`) === 'JPN', 'tapping the JPN 吸力尺 selects JPN (map stays open)');
  await rulerCard(A, 'JPN', 'iPad 2008');
  await A.click('.wm-box[data-iso="CHN"]'); await sleep(300);
  await rulerCard(A, 'CHN', 'iPad 2008');
  await A.click('.wm-box[data-iso="USA"]'); await sleep(300);
  await rulerCard(A, 'USA', 'iPad 2008');
  await A.click('.wm-bg'); await sleep(200);
  ok(await pipes(A, 'cap') >= 1 && await A.count('.wm-pipe[data-k="cap"][data-to="POOL"]') === await pipes(A, 'cap'), 'capital pipes end in the US bond pool: ' + await pipes(A, 'cap'));
  ok(await A.ev(`getComputedStyle(document.body).backgroundColor`) !== 'rgb(15, 20, 27)', 'light theme by default');
  ok(await A.ev(`(()=>{const r=document.querySelector('.wm-svg').getBoundingClientRect(); return [...document.querySelectorAll('.wm-box')].every(b=>{const q=b.getBoundingClientRect(); return q.left>=r.left-1&&q.right<=r.right+1&&q.top>=r.top-1})})()`), 'all boxes inside the stage');
  // box readings present
  const txt = await A.ev(`document.querySelector('.wm-box[data-iso="USA"]').textContent.replace(/\\s+/g, ' ')`), nL = await A.ev(`document.querySelectorAll('.wm-box .wm-layers').length`);
  ok(['河', '湖', '吸力', '地下'].every(w => txt.includes(w)) && !txt.includes('大环') && nL === 7, `v3: every box shows the 3-layer icon (河 / 湖吸力 / 地下), not the four numbers: ${nL} boxes · ${txt.slice(0, 80)}`);
  // 地下 wording: the direction is spelled out (洞深 = more private debt than its own average), never the old 低 / 高 N点
  const gwRows = await A.ev(`[...document.querySelectorAll('.wm-box .wm-l-ground text')].map(t => t.textContent.replace(/\\s+/g, ' ').trim())`);
  ok(gwRows.length === 7 && gwRows.every(s => /^地下 (洞深 \+\d+点|洞浅 −\d+点|平常|—)$/.test(s)), `v3 fix: every box's 地下 row reads 洞深 +N点 / 洞浅 −N点 / 平常: ${gwRows.join(' · ')}`);
  const boxAll = await A.ev(`[...document.querySelectorAll('.wm-box')].map(b => b.textContent).join(' ')`);
  ok(!/大环|同比|环比/.test(boxAll), 'v3 fix: no box text contains 大环 / 同比 / 环比');
  // 河 wording matches the card (物价比一年前): the box row says 河 物价 x%, never 通胀
  const rvRows = await A.ev(`[...document.querySelectorAll('.wm-box .wm-l-river text')].map(t => t.textContent.replace(/\\s+/g, ' ').trim())`);
  ok(rvRows.length === 7 && rvRows.every(s => /^河 (物价 −?\d+\.\d%|—)$/.test(s)),`map fix 2: every box's 河 row reads 河 物价 x% (same word as the card): ${rvRows.join(' · ')}`);
  const hintDef = await A.text('.wm-hint .wm-def[data-def="gw"]');
  ok(/^地下 = 私人欠款占 GDP，比自己 1995–2025 平均高（洞更深）或低多少个百分点/.test(hintDef) && await A.ev(`(()=>{const e=document.querySelector('.wm-hint .wm-def'); return !!e && e.getBoundingClientRect().height > 0})()`), 'v3 fix: the map legend carries the 地下 definition line (visible): ' + hintDef);
  ok(await A.count('.wm-box .wm-l-ground .wm-l-hit[data-def="gw"]') === 7, 'v3 fix: every box has a tappable 地下 row');
  await A.click('.wm-box[data-iso="JPN"] .wm-l-hit'); await sleep(300);
  const tip = await A.ev(`(()=>{const t=document.querySelector('.wm-tip'); if(!t||t.hidden) return null; const r=t.getBoundingClientRect(), s=document.querySelector('.wm-stage').getBoundingClientRect(); const h=document.querySelector('.wm-box[data-iso="JPN"] .wm-l-hit').getBoundingClientRect(); return { iso: t.dataset.iso, txt: t.textContent, inside: r.left >= s.left - 1 && r.right <= s.right + 1, near: Math.min(Math.abs(r.top - h.bottom), Math.abs(r.bottom - h.top)) < 12 && r.left < h.right && r.right > h.left, sel: document.querySelector('.wm-box.sel')?.dataset.iso }})()`);
  ok(tip && tip.iso === 'JPN' && tip.sel === 'JPN' && tip.txt.includes('地下 = 私人欠款占 GDP') && tip.txt.includes('洞更深') && tip.inside && tip.near,'v3 fix: tapping JPN\'s 地下 row selects it and shows the definition inside the stage: ' + JSON.stringify(tip));
  ok((await A.text('.wm-card .wm-def[data-def="gw"]')).includes('私人欠款占 GDP'), 'v3 fix: the selected card repeats the definition under its 地下 layer');
  await A.click('.wm-bg'); await sleep(200);
  ok(await A.ev(`document.querySelector('.wm-tip').hidden && !document.querySelector('.wm-box.sel')`), 'tapping empty space hides the definition and deselects');
  ok(await A.count('.wm-seg button[data-kind="debt"]') === 1, 'v3: a 地下·美元债 (地下连地下) layer button');
  await geom(A, 'iPad 2008');
  const lab0 = await A.count('.wm-chip');
  ok(lab0 >= 3 && lab0 <= 8, `no selection: only the biggest flows carry a number (${lab0} labels, 3..8)`);
  ok(await A.count('.wm-pipe .wm-chevs path.wm-chev') >= await A.count('.wm-pipe'), 'every pipe carries ≥ 1 chevron along the way (direction readable in a still picture)');

  // ---- 2. select does not navigate ----
  const nav0 = navs.length;
  await A.click('.wm-box[data-iso="AUS"]'); await sleep(300);
  ok(await A.ev(`document.querySelector('.wm-box.sel')?.dataset.iso`) === 'AUS', 'tap selects AUS');
  ok(await mapOpen(A) && navs.length === nav0, 'selecting does not navigate or close (navigations: ' + (navs.length - nav0) + ')');
  const cl = await A.ev(`[...document.querySelectorAll('.wm-card .wm-lys > .wm-ly')].map(d => ({ c: d.className.replace('wm-ly ', ''), k: d.querySelector('.wm-ly-k').textContent, t: d.textContent.replace(/\\s+/g, ' ').trim() }))`);
  ok((await A.text('.wm-card')).includes('澳洲') && cl.length === 3 && cl.map(x => x.k).join('/') === '河/湖吸力/地下' && !(await A.count('.wm-card .wm-rd')),
    'v3 fix: card shows the name and the same three layers as the box (河 / 湖吸力 / 地下), not the old four readings: ' + cl.map(x => x.k).join('/'));
  ok(/物价比一年前 −?\d/.test(cl[0]?.t) && cl[0].t.includes('GDP') && /实际利率 −?\d/.test(cl[1]?.t) && /政策利率 \d/.test(cl[1].t) && /洞深 \+\d+点|洞浅 −\d+点|平常/.test(cl[2]?.t) && /私人欠款占 GDP \d+%/.test(cl[2].t),
    'card layers: 河 = 物价比一年前 + GDP · 湖吸力 = 实际利率 + 政策利率 detail · 地下 = 洞深/洞浅 + 私人欠款占 GDP: ' + cl.map(x => x.t).join(' | '));
  const cardAll = await A.text('.wm-card');
  ok(!/大环|同比|环比/.test(cardAll) && !cardAll.includes('实际房价'), 'v3 fix: card text has no 大环 / 同比 / 环比, no old 资产 reading');
  ok(/1995–2025 平均/.test(await A.text('.wm-card .wm-def[data-def="gw"]')), 'card: the 地下 definition line names the baseline window (1995–2025)');
  ok(await A.count('.wm-card .wm-one') === 1 && await A.count('.wm-card .wm-fx') === 1, 'card keeps the one-liner and the FX reactor block');
  ok(await A.count('.wm-partners li') === 3, 'card lists the top 3 trade partners');
  await sleep(500);
  const rx = await A.ev(`(()=>{const b=document.querySelector('.wm-card .wm-fx .fxr-box'); return b ? { pipes: b.querySelectorAll('[data-fxr-pipe]').length, date: b.dataset.date, con: (b.querySelector('.fxr-con')||{}).textContent } : null})()`);
  ok(rx && rx.pipes === 2 && rx.date === '2008Q4', `AUS card carries the FX reactor (2008Q4): ${JSON.stringify(rx)}`);
  await A.click('.wm-card [data-fxr-pipe="cap"]'); await sleep(200);
  ok(await A.ev(`!!document.querySelector('.wm-card .fxr-forces[open]') && document.querySelector('.wm-card .fxr-grp.hl')?.dataset.grp === 'cap' && document.querySelector('.wm-box.sel')?.dataset.iso === 'AUS'`), 'tapping a reactor pipe in the card opens its five forces (selection kept)');
  ok((await A.text('.wm-card')).includes('汇率') && (await A.text('.wm-card')).includes('AUD'), 'card shows FX per USD: ' + (await A.text('.wm-line')));
  ok(await A.ev(`document.querySelector('.wm-svg').classList.contains('has-sel') && document.querySelectorAll('.wm-pipe.hl').length > 0`), 'selected box lights its pipes, others fade');
  await sleep(300);                                          // let the opacity transition finish
  const fo = await A.ev(FOCUS);
  ok(fo.sel === 'AUS' && fo.nHl > 0 && fo.hlOp >= 0.99 && fo.otherOp <= 0.1, `selection focus: AUS pipes at full strength (${fo.nHl}, opacity ${fo.hlOp}), all others faded to ≤ 0.1 (${fo.otherOp})`);
  ok(fo.chipsOk && fo.chips.length >= Math.min(fo.nHl, 4), `selection labels: only AUS pipes carry numbers (${fo.chips.length} labels: ${fo.chips.slice(0, 6).join(' ')}…)`);
  await geom(A, 'iPad 2008 AUS selected');
  const enter = await A.ev(`(()=>{const b=document.querySelector('.wm-enter'); return b ? { dis: b.disabled, t: b.textContent.trim() } : null})()`);
  const ready = await A.ev(`import('/src/data/countries/index.js').then(m => ({ ...m.COUNTRY_READY }))`);
  if (!ready.AUS) ok(enter && enter.dis && enter.t === '细图制作中', 'not-ready AUS: enter button disabled, says 细图制作中: ' + JSON.stringify(enter));
  else ok(enter && !enter.dis && enter.t.includes('进入'), 'ready AUS: enter button active: ' + JSON.stringify(enter));
  if (!ready.AUS) { await A.click('.wm-enter'); await sleep(400); ok(navs.length === nav0 && await mapOpen(A), 'clicking the disabled button does nothing'); }
  await sleep(500);
  console.log('   coverage line:', JSON.stringify(await A.text('.wm-cover')));
  // empty space deselects
  await A.click('.wm-bg'); await sleep(200);
  ok(await A.ev(`!document.querySelector('.wm-box.sel') && !document.querySelector('.wm-svg').classList.contains('has-sel')`), 'tapping empty space deselects');
  ok((await A.text('.wm-card')).includes('点一个框'), 'card goes back to the hint');
  // tapping a pipe / the pool is "empty space", never enters
  await A.click('.wm-box[data-iso="CHN"]'); await sleep(200);
  ok(await A.ev(`document.querySelector('.wm-box.sel')?.dataset.iso`) === 'CHN' && navs.length === nav0, 'CHN selected');

  // ---- 3. year slider ----
  await A.click('.wm-box[data-iso="USA"]'); await sleep(200);
  const g08 = await A.text('.wm-box[data-iso="USA"]'), card08 = await A.text('.wm-card h3');
  await setYear(A, 2018); await sleep(300);
  ok((await A.text('.wm-yv')) === '2018' && (await A.text('.wm-box[data-iso="USA"]')) !== g08, 'slider to 2018 changes the readings');
  ok(await A.ev(`document.querySelector('.wm-res').hidden`) && (await A.text('.wm-card h3')).includes('2018') && card08.includes('2008'), 'card follows the year; no 保留样本 at 2018');
  await setYear(A, 2024); await sleep(300);
  ok(!(await A.ev(`document.querySelector('.wm-res').hidden`)) && (await A.text('.wm-res')).includes('保留样本'), '2024 shows 保留样本');
  ok((await A.text('.wm-card h3')).includes('保留样本'), 'card h3 also marks 保留样本');
  ok((await A.text('.wm-card .wm-fx')).includes('美元指数'), 'USA card: the dollar index block (美元对一篮子货币)');
  await setYear(A, 2025); await sleep(300);
  await A.click('.wm-bg'); await sleep(200);
  const d25 = await A.ev(`[...document.querySelectorAll('.wm-pipe[data-k="trade"]:not([data-row])')].map(g => g.dataset.from + '>' + g.dataset.to)`);
  const need = ['AUS>CHN', 'CHN>AUS', 'JPN>CHN', 'CHN>JPN', 'JPN>USA', 'USA>JPN'];
  ok(need.every(k => d25.includes(k)), `2025, nothing selected: both directions of AUS↔CHN, JPN↔CHN, JPN↔USA drawn (${need.filter(k => !d25.includes(k)).join(',') || 'all'})`);
  await geom(A, 'iPad 2025');
  for (const [k, nm] of [['capital', '资本'], ['reserve', '储备'], ['trade', '贸易']]) {
    await A.click(`.wm-seg [data-kind="${k}"]`); await sleep(200);
    if (k !== 'reserve') await geom(A, `iPad 2025 ${nm}`, k === 'trade');   // 资本: one-way pipes into the reservoir, no pairs
    else ok(await A.count('.wm-pipe') === 0 && await A.count('.wm-pool') === 1, 'iPad 2025 储备: no pipes, the reservoir');
  }
  await A.click('.wm-seg [data-kind="all"]'); await sleep(200);
  await A.click('.wm-box[data-iso="AUS"]'); await sleep(400);
  await geom(A, 'iPad 2025 AUS selected');
  const fo25 = await A.ev(FOCUS);
  ok(fo25.otherOp <= 0.1 && fo25.chipsOk, `2025 AUS: others faded (${fo25.otherOp}), labels only on AUS pipes (${fo25.chips.length})`);
  await A.click('.wm-bg'); await sleep(200);
  await A.click('.wm-box[data-iso="USA"]'); await sleep(200);
  await dragCheck(A, 'iPad USA selected');
  await setYear(A, 1995); await sleep(300);
  ok((await A.text('.wm-yv')) === '1995' && await A.count('.wm-box') === 7, '1995 (null-heavy year) renders: ' + await A.text('.wm-box[data-iso="EA"]'));
  await setYear(A, 2008); await sleep(200);

  // ---- 4. pipe toggles ----
  await A.click('.wm-seg [data-kind="trade"]'); await sleep(250);
  ok(await pipes(A, 'cap') === 0 && await pipes(A, 'trade') > 8, '贸易 only: no capital pipes, more trade pipes: ' + await pipes(A, 'trade'));
  await A.click('.wm-seg [data-kind="capital"]'); await sleep(250);
  ok(await pipes(A, 'trade') === 0 && await pipes(A, 'cap') >= 1, '资本 only: no trade pipes');
  await A.click('.wm-seg [data-kind="reserve"]'); await sleep(250);
  ok(await pipes(A, 'trade') === 0 && await pipes(A, 'cap') === 0 && await A.count('.wm-pool') === 1, '储备 only: no pipes, the reservoir stays');
  ok(await A.ev(`document.querySelector('.wm-seg [data-kind="reserve"]').getAttribute('aria-pressed') === 'true'`), 'toggle shows pressed state');
  await A.click('.wm-seg [data-kind="all"]'); await sleep(250);
  ok(await pipes(A, 'trade') > 0 && await pipes(A, 'cap') > 0, '全部: both kinds again');

  // ---- 5. USA enter returns to the main screen ----
  await A.click('.wm-box[data-iso="USA"]'); await sleep(250);
  ok((await A.text('.wm-enter')).includes('进入') && !(await A.ev(`document.querySelector('.wm-enter').disabled`)), 'USA enter button active');
  await A.click('.wm-enter'); await sleep(500);
  ok(!(await mapOpen(A)) && navs.length === nav0, 'USA enter closes the map, no reload');
  ok(await A.text('#date') === date0 && !(await A.ev(`location.search.includes('map=1')`)), 'US sim state kept (' + date0 + '), ?map=1 removed');
  // back button
  await A.click('#btn-map'); await sleep(500);
  ok(await mapOpen(A) && await A.ev(`document.querySelector('.wm-slider').value`) === '2008', 'reopened');
  await A.click('.wm-back'); await sleep(400);
  ok(!(await mapOpen(A)) && await A.text('#date') === date0, '← 回到美国水流图 returns');

  // ---- 6. mw:map event ----
  await A.ev(`document.dispatchEvent(new CustomEvent('mw:map', { detail: { open: true, select: 'GBR' } }))`); await sleep(700);
  ok(await mapOpen(A) && await A.ev(`document.querySelector('.wm-box.sel')?.dataset.iso`) === 'GBR', 'mw:map {open, select:GBR} opens with GBR selected');
  await A.ev(`document.dispatchEvent(new CustomEvent('mw:map', { detail: { open: false } }))`); await sleep(300);
  ok(!(await mapOpen(A)), 'mw:map {open:false} closes');

  // ---- 7. a ready country: enter navigates to ?country=ISO (readiness forced in the page); then the boot hook ----
  await A.ev(`import('/src/data/countries/index.js').then(m => { m.COUNTRY_READY.GBR = true; })`);
  await A.ev(`document.dispatchEvent(new CustomEvent('mw:map', { detail: { open: true, select: 'GBR' } }))`); await sleep(700);
  const e2 = await A.ev(`(()=>{const b=document.querySelector('.wm-enter'); return { dis: b.disabled, t: b.textContent.trim() }})()`);
  ok(!e2.dis && e2.t.includes('进入') && e2.t.includes('英国'), 'forced-ready GBR: enter button active: ' + e2.t);
  const n1 = navs.length;
  await A.click('.wm-enter'); await sleep(2800);
  ok(navs.length > n1 && /[?&]country=GBR/.test(navs[navs.length - 1]), 'enter navigates to ?country=GBR: ' + navs[navs.length - 1]);
  const gbrReady = await A.ev(`import('/src/data/countries/index.js').then(m => !!m.COUNTRY_READY.GBR)`);
  if (!gbrReady) {
    ok(await A.text('#mode-badge') === '历史' && (await A.text('#toast-msg')).includes('还没做好'), 'GBR not ready after reload: falls back to the USA with a toast: ' + (await A.text('#toast-msg')));
  } else {
    ok((await A.text('#mode-badge')).includes('英国'), 'GBR ready: badge shows 英国 · 历史: ' + (await A.text('#mode-badge')));
  }
  await A.go(BASE + '?pause=1&country=XYZ');
  ok(await A.text('#mode-badge') === '历史' && /\d{4}Q\d/.test(await A.text('#date')), 'unknown ?country= falls back to the USA');

  // ---- 8. ?map=1 URL ----
  await A.go(BASE + '?pause=1&t=53&map=1&select=AUS&year=2018');
  ok(await mapOpen(A) && await A.ev(`document.querySelector('.wm-box.sel')?.dataset.iso`) === 'AUS' && await A.ev(`document.querySelector('.wm-slider').value`) === '2018', '?map=1&select=AUS&year=2018 opens that state');
  await A.go(BASE + '?pause=1&t=53&map=1');
  ok(await mapOpen(A) && await A.ev(`document.querySelector('.wm-slider').value`) === '2008', '?map=1 opens at the game year');
  // dark theme still readable (tokens)
  await A.go(BASE + '?pause=1&t=53&map=1&theme=dark');
  ok(await mapOpen(A) && await A.ev(`getComputedStyle(document.querySelector('.wm')).backgroundColor`) !== 'rgb(243, 245, 248)', '?theme=dark: the map follows the dark tokens');

  // ---- 9. phone ----
  await A.viewport(390, 844);
  await A.go(BASE + '?pause=1&t=53&map=1');
  ok(await mapOpen(A) && await A.count('.wm-box') === 7, 'phone 390: map opens with seven boxes');
  ok(await A.ev(`(()=>{const r=document.querySelector('.wm-stage').getBoundingClientRect(); return [...document.querySelectorAll('.wm-box')].every(b=>{const q=b.getBoundingClientRect(); return q.left>=r.left-1&&q.right<=r.right+1})})()`), 'phone: no box sticks out sideways');
  ok(await A.ev(`document.documentElement.scrollWidth <= innerWidth + 1`), 'phone: no horizontal page scroll');
  const phL = await A.count('.wm-chip');
  ok(phL >= 1 && phL <= 3, `phone 390, nothing selected: at most 3 amount labels (${phL})`);
  const phTop = await A.ev(`(()=>{const t=document.querySelector('.wm-top'); return [...t.querySelectorAll('button')].every(b=>{const r=b.getBoundingClientRect(); return r.left>=-1&&r.right<=innerWidth+1}) && t.scrollWidth <= t.clientWidth + 1})()`);
  ok(phTop, 'phone 390: the back button and all five layer buttons are fully on screen (no clipped / sideways-scrolling top bar)');
  const phBox = await A.ev(`[...document.querySelectorAll('.wm-box .wm-rect')].map(r=>Math.round(r.getBBox().width))`);
  ok(Math.min(...phBox) >= 130 && await A.count('.wm-box.cmp') === 7 && !(await A.count('.wm-box .wm-g')), `phone 390: bigger compact boxes (min width ${Math.min(...phBox)} ≥ 130), numbers only, no GDP line until tapped`);
  await A.click('.wm-box[data-iso="GBR"]'); await sleep(400);
  const phX = await A.ev(`(()=>{const b=document.querySelector('.wm-box.sel'); return { iso: b.dataset.iso, cmp: b.classList.contains('cmp'), w: Math.round(b.querySelector('.wm-rect').getBBox().width), gdp: !!b.querySelector('.wm-g'), rv: b.querySelector('.wm-l-river text').textContent.replace(/\\s+/g,' ').trim(), others: document.querySelectorAll('.wm-box.cmp').length }})()`);
  ok(phX.iso === 'GBR' && !phX.cmp && phX.w >= 170 && phX.gdp && /^河 物价 /.test(phX.rv) && phX.others === 6, `phone 390: tap expands the box (GBR ${phX.w}px, GDP + long words: ${phX.rv}), the other six stay compact`);
  await geom(A, 'phone 2008 GBR expanded');
  await A.click('.wm-bg'); await sleep(300);
  await dragCheck(A, 'phone 390');
  await setYear(A, 2008); await sleep(300);
  await shot(A, 'map-390-2008.png');
  await geom(A, 'phone 2008');
  await setYear(A, 2025); await sleep(300);
  await geom(A, 'phone 2025');
  await setYear(A, 2008); await sleep(300);
  for (const iso of ['AUS', 'ROW', 'USA']) {
    await A.click(`.wm-box[data-iso="${iso}"]`); await sleep(400);
    const vis = await A.ev(`(()=>{const b=document.querySelector('.wm-box.sel .wm-rect').getBoundingClientRect(), c=document.querySelector('.wm-card').getBoundingClientRect(), s=document.querySelector('.wm-stage').getBoundingClientRect(); return { top: b.top, bottom: b.bottom, cardTop: c.top, stageTop: s.top }})()`);
    ok(vis.bottom <= vis.cardTop + 1 && vis.top >= vis.stageTop - 1, `phone: selected ${iso} is fully above the card (${Math.round(vis.bottom)} <= ${Math.round(vis.cardTop)})`);
  }
  ok(await A.ev(`(()=>{const c=document.querySelector('.wm-card'); return c.scrollHeight <= c.clientHeight + 1 || getComputedStyle(c).overflowY === 'auto'})()`), 'phone: card scrolls if tall');
  await A.click('.wm-box[data-iso="EA"] .wm-l-hit'); await sleep(400);
  const ptip = await A.ev(`(()=>{const t=document.querySelector('.wm-tip'), r=t.getBoundingClientRect(), s=document.querySelector('.wm-stage').getBoundingClientRect(), c=document.querySelector('.wm-card'), h=document.querySelector('.wm-box[data-iso="EA"] .wm-l-hit').getBoundingClientRect(); return { shown: !t.hidden, inside: r.left >= s.left - 1 && r.right <= s.right + 1 && (Math.min(Math.abs(r.top - h.bottom), Math.abs(r.bottom - h.top)) < 12), w: Math.round(r.width), cardDef: (c.querySelector('.wm-def')||{}).textContent || '', cardX: c.scrollWidth <= c.clientWidth + 1, lys: c.querySelectorAll('.wm-ly').length }})()`);
  ok(ptip.shown && ptip.inside && ptip.lys === 3 && ptip.cardX && ptip.cardDef.includes('1999–2025'), `phone: EA 地下 tap shows the definition inside the stage (${ptip.w}px), card has 3 layers, no sideways overflow, EA baseline 1999–2025: ${ptip.cardDef}`);
  ok(await A.ev(`document.documentElement.scrollWidth <= innerWidth + 1`), 'phone: still no horizontal page scroll with the definition open');
  // 吸力尺 at 390: number only, inside the stage, no overflow; CHN selected = the 2008 screenshot
  await A.go(BASE + '?pause=1&t=53&map=1&year=2008&select=CHN'); await sleep(400);
  await rulers(A, 'phone 390 2008', false);
  await rulerCard(A, 'CHN', 'phone 390 2008');
  ok(await A.ev(`document.documentElement.scrollWidth <= innerWidth + 1 && (()=>{const s=document.querySelector('.wm-stage'); return s.scrollWidth <= s.clientWidth + 1})()`), 'phone 390: no horizontal overflow (page or stage) with the rulers drawn');
  await geom(A, 'phone 2008 CHN selected');
  await shot(A, 'map-ruler-390-2008-CHN.png');
  await A.ev(`(()=>{const d=document.querySelector('.wm-card .wm-rc'); if(d) d.scrollIntoView({block:'center'}); return 1})()`); await sleep(300);
  await shot(A, 'map-ruler-390-2008-CHN-card.png');

  // ---- 9b. 1440×900 (map fix 2): AUS sits at the bottom; its 地下 tip must not cover the box, the year span never wraps ----
  await A.viewport(1440, 900);
  await A.go(BASE + '?pause=1&t=53&map=1&year=2008&select=AUS');
  await A.click('.wm-box[data-iso="AUS"] .wm-l-hit'); await sleep(400);
  const t14 = await A.ev(`(()=>{const t=document.querySelector('.wm-tip'), r=t.getBoundingClientRect(), s=document.querySelector('.wm-stage').getBoundingClientRect(), b=document.querySelector('.wm-box[data-iso="AUS"] .wm-rect').getBoundingClientRect(), h=document.querySelector('.wm-box[data-iso="AUS"] .wm-l-hit').getBoundingClientRect();
    const cover = !(r.right <= b.left + 1 || r.left >= b.right - 1 || r.bottom <= b.top + 1 || r.top >= b.bottom - 1);
    const near = (Math.min(Math.abs(r.top - h.bottom), Math.abs(r.bottom - h.top)) < 12 && r.left < h.right && r.right > h.left) || (Math.min(Math.abs(r.right - b.left), Math.abs(r.left - b.right)) < 12 && r.top < h.bottom && r.bottom > h.top);
    return { shown: !t.hidden, iso: t.dataset.iso, inside: r.left >= s.left - 1 && r.right <= s.right + 1 && r.top >= s.top - 1 && r.bottom <= s.bottom + 1, cover, near, tip: [r.left, r.top, r.right, r.bottom].map(Math.round), box: [b.left, b.top, b.right, b.bottom].map(Math.round) }})()`);
  ok(t14.shown && t14.iso === 'AUS' && t14.inside && !t14.cover && t14.near, `1440: AUS 地下 tip opens beside / below the row, inside the stage, not covering the AUS box: ${JSON.stringify(t14)}`);
  const nw14 = await A.ev(`[...document.querySelectorAll('.wm-card .wm-ly .wm-nw, .wm-tip .wm-nw')].map(e => ({ t: e.textContent, lines: new Set([...e.getClientRects()].map(q => Math.round(q.top))).size }))`);
  ok(nw14.length >= 3 && nw14.every(e => /^\d{4}–\d{4}$/.test(e.t) && e.lines === 1), `1440: the year span 1995–2025 never breaks (card 地下 line + definition + tip): ${JSON.stringify(nw14)}`);
  await A.go(BASE + '?pause=1&t=53&map=1&year=2008&select=CHN'); await sleep(400);
  await rulers(A, '1440 2008 CHN selected', true);
  await rulerCard(A, 'CHN', '1440 2008');
  await shot(A, 'map-ruler-1440-2008-CHN.png');
  await A.click('.wm-bg'); await sleep(200);
  await dragCheck(A, '1440');
  await setYear(A, 2008); await sleep(300);
  await shot(A, 'map-1440-2008.png');

  // ---- 10. desktop 1920×1000: the same geometry rules ----
  await A.viewport(1920, 1000);
  await A.go(BASE + '?pause=1&t=53&map=1&year=2025');
  await geom(A, 'desktop 2025');
  await A.go(BASE + '?pause=1&t=53&map=1&year=2008&select=CHN');
  await geom(A, 'desktop 2008 CHN selected');
  await A.viewport(1180, 820);

  console.log('errors:', errors.length ? errors : 'none');
  if (errors.length) fails++;
  A.close();
} catch (e) { console.log('driver error', e); fails++; }
finally { proc.kill(); }
console.log(fails ? `${fails} FAIL` : 'ALL OK');
process.exit(fails ? 1 : 0);
