// node tools/check_d_lessons.mjs [--shots]
//   Starts its own static server on port 8303 (BASE=http://localhost:PORT/ uses a server you already run); CDP port 9403.
// CDP check of the two big lessons wired into the real app (contract: tools/D-CONTRACT.md 「接线」):
//  1. menu      教学 menu: 主线 → 接下来 (汇率, 投资者) → 选学 → 旧版; every lesson listed exactly once; no 制作中 placeholder; 世界 1 under 旧版
//  2. fx        opened from the menu; every step: the step's panel (fx-lab.js .fxp) is mounted in #ls-panel over the diagram column, exactly one,
//               the flow diagram hidden under it; the map step has no panel; 下一步 unmounts the previous panel; 退出教学 unmounts and returns to simple
//  3. handover  m5 (last step) 下一课 → fx; fx (last step) 下一课 → inv in the AUS view (?country=AUS&lesson=inv)
//  4. inv       every step: gauges / realRate / priced / timeline / fx / blind over the diagram, assetTable in the lesson card with the diagram
//               visible (a row tap flashes the pools); the blind step has the three practice-card links; 退出教学 → the US root page, simple mode
//  5. phone 390 the same panels fit (no sideways scroll), menu; no JS errors anywhere.
// --shots writes tools/shots/d-<name>-<pad|phone>.png (FX anchor + calculator, investor gauges / asset table / blind links, the menu).
import { spawn } from 'node:child_process';
import { createServer } from 'node:http';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, statSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname, extname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const EDGE = 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe';
const SRV_PORT = 8303, CDP = 9403, SHOTS = process.argv.includes('--shots');
const BASE = process.env.BASE || `http://localhost:${SRV_PORT}/`;
const SHOT_DIR = join(ROOT, 'tools', 'shots');
const sleep = ms => new Promise(r => setTimeout(r, ms));

// ---- own static server (unless BASE is given) ----
let server = null;
if (!process.env.BASE) {
  const TYPES = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.mjs': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.json': 'application/json', '.png': 'image/png', '.svg': 'image/svg+xml', '.csv': 'text/csv' };
  server = createServer((req, res) => {
    try {
      let f = join(ROOT, decodeURIComponent(new URL(req.url, 'http://x').pathname));
      if (!f.startsWith(ROOT)) { res.writeHead(403); return res.end(); }
      try { if (statSync(f).isDirectory()) f = join(f, 'index.html'); } catch (e) { /* 404 below */ }
      const b = readFileSync(f);
      res.writeHead(200, { 'Content-Type': TYPES[extname(f).toLowerCase()] || 'application/octet-stream', 'Cache-Control': 'no-store' }); res.end(b);
    } catch (e) { res.writeHead(404); res.end('not found'); }
  });
  await new Promise(r => server.listen(SRV_PORT, '127.0.0.1', r));
}

const profile = mkdtempSync(join(tmpdir(), 'mw-dles-'));   // fresh profile: localStorage starts empty (simple layout)
const proc = spawn(EDGE, ['--headless=new', '--disable-gpu', '--hide-scrollbars', `--user-data-dir=${profile}`, `--remote-debugging-port=${CDP}`, '--window-size=1180,820', 'about:blank'], { stdio: 'ignore' });
const errors = [];
let fails = 0, oks = 0;
const ok = (c, m) => { if (!c) { fails++; console.log('FAIL:', m); } else { oks++; console.log('ok:', m); } };

let ws, id = 0; const pending = new Map();
for (let i = 0; i < 40 && !ws; i++) {
  try { const t = (await (await fetch(`http://127.0.0.1:${CDP}/json`)).json()).find(x => x.type === 'page'); if (t) { ws = new WebSocket(t.webSocketDebuggerUrl); await new Promise((res, rej) => { ws.onopen = res; ws.onerror = rej; }); } } catch (e) { await sleep(250); }
}
if (!ws) { console.log('FAIL: no CDP connection'); proc.kill(); if (server) server.close(); process.exit(1); }
ws.onmessage = m => {
  const d = JSON.parse(m.data);
  if (d.id && pending.has(d.id)) { pending.get(d.id)(d); pending.delete(d.id); }
  else if (d.method === 'Runtime.exceptionThrown') errors.push(d.params.exceptionDetails.text + ' ' + (d.params.exceptionDetails.exception?.description || ''));
  else if (d.method === 'Runtime.consoleAPICalled' && d.params.type === 'error') errors.push('console.error ' + d.params.args.map(a => a.value || a.description).join(' '));
};
const send = (method, params = {}) => new Promise(res => { const i = ++id; pending.set(i, res); ws.send(JSON.stringify({ id: i, method, params })); });
const ev = async expr => { const r = await send('Runtime.evaluate', { expression: expr, awaitPromise: true, returnByValue: true }); if (r.result.exceptionDetails) throw new Error(r.result.exceptionDetails.exception?.description || 'eval error'); return r.result.result.value; };
const go = async (path, wait = 3000) => { await send('Page.navigate', { url: BASE + path }); await sleep(wait); };
const click = async (sel, wait = 700) => { const r = await ev(`(()=>{const b=document.querySelector(${JSON.stringify(sel)}); if(!b) return 'missing'; b.click(); return 'ok'})()`); await sleep(wait); return r; };
const shown = sel => ev(`(()=>{const e=document.querySelector(${JSON.stringify(sel)}); return !!e && e.getClientRects().length > 0 && getComputedStyle(e).display !== 'none' && getComputedStyle(e).visibility !== 'hidden'})()`);
const shot = async name => {
  if (!SHOTS) return;
  mkdirSync(SHOT_DIR, { recursive: true });
  const r = await send('Page.captureScreenshot', { format: 'png' });
  const f = join(SHOT_DIR, `d-${name}.png`); writeFileSync(f, Buffer.from(r.result.data, 'base64')); console.log('   shot', f);
};
// state of the lesson screen: lesson / step on the card, panels in the document, where they sit, diagram hidden or not
const state = () => ev(`(()=>{
  const c = document.querySelector('#ls-card'), dia = document.querySelector('#diagram'), fw = dia && dia.querySelector('.flow-wrap');
  const p = [...document.querySelectorAll('.fxp, .ivl')];
  return JSON.stringify({
    on: document.body.classList.contains('lesson-on'), lesson: c && c.dataset.lesson, step: c ? +c.dataset.step : -1,
    panels: p.map(e => ({ cls: e.className.split(' ')[0], id: e.dataset.panel, host: e.parentElement && (e.parentElement.id || e.parentElement.className), w: Math.round(e.getBoundingClientRect().width), h: Math.round(e.getBoundingClientRect().height) })),
    lsPanel: !!document.querySelector('#ls-panel'), flowHidden: !!fw && getComputedStyle(fw).visibility === 'hidden',
    overflowX: document.documentElement.scrollWidth > innerWidth + 1,
    country: new URLSearchParams(location.search).get('country') || 'USA', layout: document.body.dataset.layout,
    map: document.body.dataset.map || '', badge: (document.querySelector('#mode-badge') || {}).textContent || '' });
})()`).then(JSON.parse);
const lessons = async () => JSON.parse(await ev(`import('./src/data/lessons.js').then(m => JSON.stringify({ course: m.COURSE, ids: m.LESSONS.map(l => String(l.id)), fx: m.LESSONS.find(l => l.id === 'fx'), inv: m.LESSONS.find(l => l.id === 'inv'), m5: m.LESSONS.find(l => l.id === 'm5').steps.length }))`));
// where a panel step puts its panel (src/ui/lessons.js panelWhere): 投资者 assetTable in the card, everything else over the diagram
const where = (L, st) => (L.kind === 'capstone' && st.panel.id === 'assetTable' ? 'card' : 'diagram');

async function walk(L, tag, shotsAt) {
  for (let i = 0; i < L.steps.length; i++) {
    const st = L.steps[i], w = `${tag} ${L.id} step ${i + 1}`;
    if (i > 0) { await click('#ls-card [data-act=next]', 1400); }
    const s = await state();
    ok(s.on && s.lesson === L.id && s.step === i, `${w}: on the card (${s.lesson} #${s.step})`);
    const cls = L.kind === 'fx' ? 'fxp' : 'ivl';
    if (st.panel) {
      ok(s.panels.length === 1 && s.panels[0].cls === cls && s.panels[0].id === st.panel.id, `${w}: exactly one panel, ${cls}[data-panel=${st.panel.id}] (${JSON.stringify(s.panels)})`);
      const wh = where(L, st);
      if (wh === 'diagram') ok(s.lsPanel && s.panels[0]?.host === 'ls-panel' && s.flowHidden, `${w}: panel over the diagram column (#ls-panel), flow diagram hidden under it`);
      else ok(!s.lsPanel && /ls-pnl-card/.test(s.panels[0]?.host || '') && !s.flowHidden, `${w}: panel in the lesson card, diagram visible`);
      ok(s.panels[0] && s.panels[0].w >= 240 && s.panels[0].h >= 120, `${w}: panel has a size (${s.panels[0]?.w}×${s.panels[0]?.h})`);
      ok(!s.overflowX, `${w}: no sideways scroll`);
    } else {
      ok(s.panels.length === 0 && !s.lsPanel && !s.flowHidden, `${w}: no panel (the previous one was unmounted), diagram back`);
      if (st.map && st.map.open) ok(s.map === '1', `${w}: the step opened the world map`);
    }
    if (shotsAt[i]) await shot(shotsAt[i]);
  }
}

try {
  await send('Runtime.enable'); await send('Page.enable');
  for (const dev of ['pad', 'phone']) {
    console.log(`\n===== ${dev} =====`);
    if (dev === 'phone') await send('Emulation.setDeviceMetricsOverride', { width: 390, height: 844, deviceScaleFactor: 2, mobile: true });
    else await send('Emulation.setDeviceMetricsOverride', { width: 1180, height: 820, deviceScaleFactor: 1, mobile: false });

    // ---- 1. the 教学 menu ----
    await go('?pause=1');
    const D = await lessons();
    await click('#btn-teach', 1000);
    const menu = JSON.parse(await ev(`(()=>{const b=document.querySelector('#ls-menu .ls-sheet-body'); const secs=[...b.querySelectorAll('h3.ls-sec')].map(h=>h.firstChild.textContent.trim());
      const ids=[...b.querySelectorAll('.ls-item')].map(x=>x.dataset.id); const later=[...b.querySelectorAll('.ls-later .ls-item')].map(x=>({id:x.dataset.id, dis:x.disabled, no:x.querySelector('.ls-no').textContent, rec:(x.querySelector('.ls-rec')||{}).textContent||''}));
      const old=[...b.querySelectorAll('.ls-old .ls-item')].map(x=>x.dataset.id);
      return JSON.stringify({secs, ids, later, old, soon: /制作中/.test(b.textContent), open: !document.querySelector('#ls-menu').hidden})})()`));
    ok(menu.open, 'menu opens');
    ok(menu.secs.join() === '主线,接下来,选学', 'sections in order: 主线, 接下来, 选学 (+ 旧版 collapsed): ' + menu.secs.join());
    ok(menu.later.map(x => x.id).join() === 'fx,inv' && menu.later.every(x => !x.dis), '接下来 = 汇率, 投资者, both enabled: ' + JSON.stringify(menu.later));
    ok(menu.later.map(x => x.rec).join() === '推荐 6,推荐 7', 'recommended path continues: 推荐 6 / 7');
    ok(!menu.soon, 'no 制作中 placeholder');
    ok(menu.old.includes('w1') && !menu.ids.filter(x => x === 'w1').slice(1).length, '世界 1 under 旧版课程');
    const counts = {}; menu.ids.forEach(x => { counts[x] = (counts[x] || 0) + 1; });
    ok(Object.values(counts).every(n => n === 1), 'every menu item appears once');
    ok(D.ids.every(x => counts[x] === 1), 'every lesson of LESSONS is in the menu exactly once' + (D.ids.filter(x => counts[x] !== 1).length ? ': missing/dup ' + D.ids.filter(x => counts[x] !== 1) : ''));
    // scroll the sheet so the screenshot shows the end of 主线 + 接下来 + 选学
    await ev(`(()=>{const b=document.querySelector('#ls-menu .ls-sheet-body'), h=b.querySelector('.ls-later').previousElementSibling; b.scrollTop = h.offsetTop - b.offsetTop - ${dev === 'pad' ? 140 : 200};})()`);
    await sleep(300);
    await shot(`menu-${dev}`);

    // ---- 2. 汇率 from the menu: every step ----
    await click('#ls-menu .ls-item[data-id="fx"]', 2500);
    await walk(D.fx, dev, { 1: `fx-anchor-${dev}`, 7: `fx-calc-${dev}` });
    const nx = await ev(`(document.querySelector('#ls-card [data-act=nextlesson]')||{}).textContent || ''`);
    ok(/下一课：投资者/.test(nx), 'fx last step: 下一课 → 投资者: ' + nx);
    // ‹ 上一步 swaps the panel back (fx-conf -> fx-calc -> map step -> fx-conf)
    await click('#ls-card [data-act=prev]', 1200);
    let s = await state(); ok(s.step === 6 && s.panels.length === 0 && s.map === '1', '上一步 to the map step: calculator unmounted');
    await click('#ls-card [data-act=prev]', 1200);
    s = await state(); ok(s.step === 5 && s.panels.length === 1 && s.panels[0].id === 'fx-conf' && s.map === '', '上一步 again: fx-conf mounted, map closed');
    // exit from a panel step: unmounted, back to simple in the US
    await click('#ls-card [data-act=exit]', 1500);
    s = await state();
    ok(!s.on && s.panels.length === 0 && !s.lsPanel && !s.flowHidden, 'fx exit: panel unmounted, #ls-panel gone, diagram visible');
    ok(s.layout === 'simple' && await shown('#simple') && !(await shown('#tabbar')), 'fx exit: simple mode');

    // ---- 3. handover m5 -> fx -> inv ----
    await go(`?pause=1&lesson=m5&step=${D.m5 - 1}`, 3500);
    const n5 = await ev(`(document.querySelector('#ls-card [data-act=nextlesson]')||{}).textContent || ''`);
    ok(/下一课：汇率/.test(n5), 'm5 last step: 下一课 → 汇率: ' + n5);
    await click('#ls-card [data-act=nextlesson]', 2500);
    s = await state();
    ok(s.on && s.lesson === 'fx' && s.step === 0 && s.panels.length === 1 && s.panels[0].id === 'fx-frame', 'm5 → fx: fx step 1 with fx-frame');
    await go(`?pause=1&lesson=fx&step=${D.fx.steps.length - 1}`, 3500);
    await click('#ls-card [data-act=nextlesson]', 4500);
    s = await state();
    ok(s.country === 'AUS' && s.on && s.lesson === 'inv' && s.step === 0, 'fx → inv: the AUS view, 投资者 step 1 (' + s.country + ' ' + s.lesson + ')');
    ok(/澳洲/.test(s.badge), 'AUS badge: ' + s.badge);

    // ---- 4. 投资者: every step (it runs paused only if the URL says so: use the URL to keep it still) ----
    await go('?pause=1&country=AUS&lesson=inv', 4000);
    await walk(D.inv, dev, {});
    // walk again for the screenshots / interactions (gauges, asset table, blind)
    await go('?pause=1&country=AUS&lesson=inv&step=1', 4000);
    await sleep(800);
    s = await state();
    ok(s.panels[0]?.id === 'gauges' && await ev(`document.querySelectorAll('#ls-panel .ivl-g').length`) === 5, 'gauges: five gauges over the diagram');
    await shot(`inv-gauges-${dev}`);
    await click('#ls-card [data-act=next]', 1500);
    const rows = await ev(`document.querySelectorAll('#ls-card .ls-pnl-card .ivl [data-act]').length`);
    ok(rows > 5, 'asset table: tappable rows / headers in the card: ' + rows);
    const tapped = await ev(`(()=>{const r=[...document.querySelectorAll('#ls-card .ls-pnl-card .ivl [data-act]')].find(b=>/row/.test(b.dataset.act)); if(!r) return 'none'; r.click(); return r.dataset.act})()`);
    await sleep(500);
    const lit = await ev(`document.querySelectorAll('#diagram .lk-hl').length`);
    ok(tapped !== 'none' && lit > 0, `asset table: a row tap (${tapped}) flashes the pools in the visible diagram (${lit} lit)`);
    await ev(`(()=>{const b=document.querySelector('#ls-card .ls-body'); const p=b&&b.querySelector('.ls-pnl-card'); if(p) b.scrollTop=p.offsetTop-8;})()`);
    await sleep(300);
    await shot(`inv-assets-${dev}`);
    await go(`?pause=1&country=AUS&lesson=inv&step=${D.inv.steps.length - 1}`, 4000);
    const links = await ev(`[...document.querySelectorAll('#ls-panel a[href]')].map(a=>a.getAttribute('href')).join(' | ')`);
    ok((links.match(/blind\/\?card=/g) || []).length === 3 && /USA-2006/.test(links) && /AUS-2015/.test(links), 'blind step: three practice-card links: ' + links);
    await shot(`inv-blind-${dev}`);
    // exit: back to the US root page, simple mode, nothing mounted
    await click('#ls-card [data-act=exit]', 4500);
    s = await state();
    ok(s.country === 'USA' && !/lesson=/.test(await ev('location.search')) && !s.on, 'inv exit: back on the US root page (' + await ev('location.href') + ')');
    ok(!/澳洲/.test(s.badge) && s.layout === 'simple' && await shown('#simple') && !(await shown('#tabbar')), 'inv exit: US, simple mode (' + s.badge + ', ' + s.layout + ')');
    ok(s.panels.length === 0 && !s.lsPanel, 'inv exit: no panel left');
    const done = await ev(`(()=>{try{return JSON.stringify(JSON.parse(localStorage.getItem('mw.lessons.v1')).done)}catch(e){return ''}})()`);
    ok(/"inv":true/.test(done) && /"fx":true/.test(done), 'reaching the last step marks 汇率 and 投资者 done: ' + done);
  }
  await send('Emulation.clearDeviceMetricsOverride');
  console.log('\nerrors:', errors.length ? errors : 'none');
  ok(!errors.length, 'no JS errors');
} catch (e) { console.log('driver error', e); fails++; }
finally { try { ws.close(); } catch (e) { /* ignore */ } proc.kill(); if (server) server.close(); }
console.log(fails ? `FAILED: ${oks} ok, ${fails} FAIL` : `ALL OK: ${oks} ok`);
process.exit(fails ? 1 : 0);
