// node tools/check_map.mjs   (serve the repo root first: python -m http.server 8185; BASE=http://localhost:PORT/ overrides)
// CDP check of the 🌍 地图 page: opens, seven boxes, select = card and NO navigation, not-ready enter is disabled, USA enter returns to the
// main screen (US sim keeps its state), year slider, pipe toggles, mw:map event, ?map=1&select=, ?country= boot hook, phone layout, no JS errors.
// Geometry (iPad 1180×820, phone 390, desktop 1920×1000): boxes do not overlap, every pipe has an arrowhead ≥ ARROW_MIN px, no pipe passes
// through a box interior, the two lanes of a two-way pair do not overlap; selection fades all other pipes and labels only its own.
import { spawn } from 'node:child_process';
const EDGE = 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe';
const port = 9361, BASE = process.env.BASE || 'http://localhost:8185/';
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
  ok(await pipes(A, 'cap') >= 1 && await A.count('.wm-pipe[data-k="cap"][data-to="POOL"]') === await pipes(A, 'cap'), 'capital pipes end in the US bond pool: ' + await pipes(A, 'cap'));
  ok(await A.ev(`getComputedStyle(document.body).backgroundColor`) !== 'rgb(15, 20, 27)', 'light theme by default');
  ok(await A.ev(`(()=>{const r=document.querySelector('.wm-svg').getBoundingClientRect(); return [...document.querySelectorAll('.wm-box')].every(b=>{const q=b.getBoundingClientRect(); return q.left>=r.left-1&&q.right<=r.right+1&&q.top>=r.top-1})})()`), 'all boxes inside the stage');
  // box readings present
  const txt = await A.ev(`document.querySelector('.wm-box[data-iso="USA"]').textContent.replace(/\\s+/g, ' ')`), nL = await A.ev(`document.querySelectorAll('.wm-box .wm-layers').length`);
  ok(['河', '湖', '吸力', '地下'].every(w => txt.includes(w)) && !txt.includes('大环') && nL === 7, `v3: every box shows the 3-layer icon (河 / 湖吸力 / 地下), not the four numbers: ${nL} boxes · ${txt.slice(0, 80)}`);
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
  ok((await A.text('.wm-card')).includes('澳洲') && await A.count('.wm-card .wm-rd > div') === 4, 'card shows the name and four readings');
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
