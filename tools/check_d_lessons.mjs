// node tools/check_d_lessons.mjs [--shots]
//   Starts its own static server on port 8343 (BASE=http://localhost:PORT/ uses a server you already run); CDP port 9443.
// CDP check of the course v3 (tools/COURSE-V3.md; contract tools/D-CONTRACT.md 「接线」 / 「课程 v3」) in the real app, iPad 1180×820 and phone 390×844:
//  1. menu      教学 menu: the 4 parts (一个国家怎么运转 / 它怎么出毛病 / 国与国之间 / 你) with the 8 lessons in order, badges 1–8, the 「沙盒」 link,
//               旧版课程 (collapsed) with everything else (Capex 5, 自由运行 7, 0.5, 世界 1 / 2 …); every lesson listed exactly once
//  2. chain     m1 is started from the menu and the whole course is walked step by step through every 下一课: m1 → shk → m2 → m3 → m4 → fx →
//               m5 → inv (inv in the AUS view). Every step: on the card, mw:lesson-active { id } names the lesson, exactly one panel of the right
//               module in the right host (shock-lab .skp / FX reactor .fxr-panel / fx-lab .fxp / investor-lab .ivl), none on a sim / map
//               step (the diagram back), no sideways scroll. The last step of each lesson shows the 三问 ending (3 rows) and the 下一课 button
//               names the next lesson; reaching it marks the lesson done (mw.lessons.v1 and src/ui/progress.js mw.course)
//  3. course v3 L5 化债四个出口 (reveal); L6 the reactor (AUS 2025Q4), the five forces open, a drill-down swaps in the fx-lab panel and
//               「回到汇率闸」 brings the reactor back, the AUD case date chips remount the reactor; L7 外国人 sub-step = the AUS reactor over
//               the diagram (2008Q3 → 2009Q1 chips), 「回到美国」 = the US diagram again, no country switch; L8 asset-table row flash, the
//               three blind links, exit → the US root page in simple mode, mw:lesson-active { id: null }
//  4. fx        ‹ 上一步 swaps panels back (calc → AUD reactor → map), exit from a panel step unmounts it and returns to simple
//  5. no JS errors anywhere.
// --shots writes tools/shots/d-<name>-<pad|phone>.png: menu, ending (L5), l5-exits, l6-reactor, l6-aud, l7-aus, inv-gauges / inv-assets / inv-blind.
import { spawn } from 'node:child_process';
import { createServer } from 'node:http';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, statSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname, extname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const EDGE = 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe';
const SRV_PORT = 8343, CDP = 9443, SHOTS = process.argv.includes('--shots');
const BASE = process.env.BASE || `http://localhost:${SRV_PORT}/`;
const SHOT_DIR = join(ROOT, 'tools', 'shots');
const sleep = ms => new Promise(r => setTimeout(r, ms));
const allLayers = u => (/^about:/.test(u) ? u : u + (u.includes('?') ? '&' : '?') + 'layers=all');   // progressive diagram: this check wants the whole diagram (layers: tools/check_layers.mjs)

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
const go = async (path, wait = 3000) => { await send('Page.navigate', { url: allLayers(BASE + path) }); await sleep(wait); };
const click = async (sel, wait = 700) => { const r = await ev(`(()=>{const b=document.querySelector(${JSON.stringify(sel)}); if(!b) return 'missing'; b.click(); return 'ok'})()`); await sleep(wait); return r; };
const shown = sel => ev(`(()=>{const e=document.querySelector(${JSON.stringify(sel)}); return !!e && e.getClientRects().length > 0 && getComputedStyle(e).display !== 'none' && getComputedStyle(e).visibility !== 'hidden'})()`);
const shot = async name => {
  if (!SHOTS) return;
  mkdirSync(SHOT_DIR, { recursive: true });
  const r = await send('Page.captureScreenshot', { format: 'png' });
  const f = join(SHOT_DIR, `d-${name}.png`); writeFileSync(f, Buffer.from(r.result.data, 'base64')); console.log('   shot', f);
};
const scrollCard = sel => ev(`(()=>{const b=document.querySelector('#ls-card .ls-body'), e=b&&b.querySelector(${JSON.stringify(sel)}); if(!e) return false; b.scrollTop = e.offsetTop - b.offsetTop - 6; return true})()`);
// state of the lesson screen: lesson / step on the card, panels in the document, where they sit, diagram hidden or not, the 三问 ending
const state = () => ev(`(()=>{
  const c = document.querySelector('#ls-card'), dia = document.querySelector('#diagram'), fw = dia && dia.querySelector('.flow-wrap');
  const p = [...document.querySelectorAll('.fxp, .ivl, .skp, .fxr-panel')];
  return JSON.stringify({
    on: document.body.classList.contains('lesson-on'), lesson: c && c.dataset.lesson, step: c ? +c.dataset.step : -1,
    panels: p.map(e => ({ cls: e.classList[0], id: e.classList.contains('fxr-panel') ? 'fx-reactor' : e.dataset.panel, date: e.dataset.date || '',
      host: e.closest('#ls-panel') ? 'ls-panel' : e.closest('.ls-pnl-card') ? 'ls-pnl-card' : (e.parentElement && (e.parentElement.id || e.parentElement.className)),
      w: Math.round(e.getBoundingClientRect().width), h: Math.round(e.getBoundingClientRect().height), text: e.textContent.slice(0, 400) })),
    lsPanel: !!document.querySelector('#ls-panel'), pnlOn: !!dia && dia.classList.contains('ls-pnl-on'), flowHidden: !!fw && getComputedStyle(fw).visibility === 'hidden',
    chips: [...document.querySelectorAll('#ls-panel .ls-fxr-d')].map(b => b.dataset.date + (b.classList.contains('on') ? '*' : '')).join(' '),
    overflowX: document.documentElement.scrollWidth > innerWidth + 1,
    country: new URLSearchParams(location.search).get('country') || 'USA', layout: document.body.dataset.layout,
    map: document.body.dataset.map || '', badge: (document.querySelector('#mode-badge') || {}).textContent || '',
    end: [...document.querySelectorAll('#ls-card .ls-end li')].map(li => li.textContent), drill: !!document.querySelector('#ls-card .ls-drill-txt'),
    next: (document.querySelector('#ls-card [data-act=nextlesson]') || {}).textContent || '', nextDis: !!document.querySelector('#ls-card [data-act=next]')?.disabled,
    active: (window.__la || []).length ? window.__la[window.__la.length - 1] : 'none' });
})()`).then(JSON.parse);
const course = async () => JSON.parse(await ev(`import('./src/data/lessons.js').then(m => JSON.stringify({ course: m.COURSE, ids: m.LESSONS.map(l => String(l.id)),
  L: Object.fromEntries(m.COURSE.main.map(id => { const l = m.LESSONS.find(x => String(x.id) === String(id)); return [id, { id: l.id, kind: l.kind, title: l.title, label: l.label, country: l.country || 'USA',
    steps: l.steps.map(s => ({ type: s.type, title: s.title, panel: s.panel || null, map: s.map || null, drills: (s.drills || []).map(d => ({ label: d.label, panel: d.panel })), drillCta: !!s.drillCta, ending: !!s.ending, next: s.next ?? null, question: !!s.question })) }]; })) }))`));
// the module / class of a panel spec (src/ui/lessons.js panelKind) and its host (panelWhere: 投资者 assetTable in the card, everything else over the diagram)
const clsOf = (L, sp) => (sp.id === 'fx-reactor' ? 'fxr-panel' : /^shk-/.test(sp.id) ? 'skp' : /^fx-/.test(sp.id) ? 'fxp' : L.kind === 'fx' ? 'fxp' : L.kind === 'shocks' ? 'skp' : 'ivl');
const whereOf = (L, sp) => (L.kind === 'capstone' && sp.id === 'assetTable' ? 'card' : 'diagram');
// a step whose 下一步 is gated (town action, predict) or whose answer is hidden (reveal question): tap the gate
const resolveGate = () => ev(`(()=>{const c=document.querySelector('#ls-card'); const b=c.querySelector('[data-act=do]')||c.querySelector('[data-act=reveal]')||c.querySelector('.ls-opt[data-act=pick]:not([disabled])'); if(b){b.click(); return b.dataset.act} return ''})()`);

function checkPanel(L, st, s, w, sp = st.panel) {
  if (sp) {
    const cls = clsOf(L, sp);
    ok(s.panels.length === 1 && s.panels[0].cls === cls && s.panels[0].id === sp.id, `${w}: exactly one panel, ${cls}${sp.id === 'fx-reactor' ? '' : `[data-panel=${sp.id}]`} (${JSON.stringify(s.panels.map(p => p.cls + ':' + p.id))})`);
    if (whereOf(L, sp) === 'diagram') ok(s.lsPanel && s.panels[0]?.host === 'ls-panel' && s.flowHidden, `${w}: panel over the diagram column (#ls-panel), flow diagram hidden under it`);
    else ok(!s.lsPanel && s.panels[0]?.host === 'ls-pnl-card' && !s.flowHidden, `${w}: panel in the lesson card, diagram visible`);
    ok(s.panels[0] && s.panels[0].w >= 240 && s.panels[0].h >= 100, `${w}: panel has a size (${s.panels[0]?.w}×${s.panels[0]?.h})`);
    if (sp.id === 'fx-reactor') {
      ok(s.panels[0]?.date === sp.date && /汇率闸 · 澳洲/.test(s.panels[0]?.text || ''), `${w}: the AUS reactor at ${sp.date} (${s.panels[0]?.date})`);
      ok(s.chips === (sp.dates || []).map(d => d + (d === sp.date ? '*' : '')).join(' '), `${w}: date chips ${s.chips || '(none)'}`);
    }
  } else {
    ok(s.panels.length === 0 && !s.lsPanel && !s.pnlOn, `${w}: no panel (the previous one was unmounted), diagram back`);
    if (st.map && st.map.open) ok(s.map === '1', `${w}: the step opened the world map`);
  }
  ok(!s.overflowX, `${w}: no sideways scroll`);
}

try {
  await send('Runtime.enable'); await send('Page.enable');
  // record mw:lesson-active on every page (the runner sends { id } on start / step change, { id: null } on exit)
  await send('Page.addScriptToEvaluateOnNewDocument', { source: `window.__la=[]; document.addEventListener('mw:lesson-active', e => window.__la.push(e.detail ? e.detail.id : 'undefined'));` });
  for (const dev of ['pad', 'phone']) {
    console.log(`\n===== ${dev} =====`);
    if (dev === 'phone') await send('Emulation.setDeviceMetricsOverride', { width: 390, height: 844, deviceScaleFactor: 2, mobile: true });
    else await send('Emulation.setDeviceMetricsOverride', { width: 1180, height: 820, deviceScaleFactor: 1, mobile: false });
    await go('?pause=1&nozoom=1');
    await ev(`(()=>{try{localStorage.removeItem('mw.lessons.v1'); localStorage.removeItem('mw.course')}catch(e){} return 1})()`);
    await go('?pause=1&nozoom=1');                              // reload: progress.js caches mw.course in memory

    // ---- 1. the 教学 menu ----
    const D = await course();
    await click('#btn-teach', 1000);
    const menu = JSON.parse(await ev(`(()=>{const b=document.querySelector('#ls-menu .ls-sheet-body'); const secs=[...b.querySelectorAll('h3.ls-sec')].map(h=>h.textContent.replace(/^[一二三四]/,'').trim());
      const ids=[...b.querySelectorAll('.ls-item')].map(x=>x.dataset.id); const main=[...b.querySelectorAll('.ls-main .ls-item')].map(x=>({id:x.dataset.id, dis:x.disabled, no:x.querySelector('.ls-no').textContent}));
      const old=[...b.querySelectorAll('.ls-old .ls-item')].map(x=>x.dataset.id); const sand=b.querySelector('.ls-free-link');
      const order=[...b.children].map(e=>e.classList.contains('ls-free-link')?'sandbox':e.classList.contains('ls-old')?'old':e.matches('h3.ls-sec')?'part':'').filter(Boolean).join(',');
      return JSON.stringify({secs, ids, main, old, order, sand: sand ? sand.textContent + ' ' + sand.getAttribute('href') : '', soon: /制作中/.test(b.textContent), oldOpen: b.querySelector('.ls-old').open, open: !document.querySelector('#ls-menu').hidden})})()`));
    ok(menu.open, 'menu opens');
    ok(menu.secs.join() === D.course.parts.map(p => p.name).join() && menu.secs.join() === '一个国家怎么运转,它怎么出毛病,国与国之间,你', 'the 4 parts in order: ' + menu.secs.join(' / '));
    ok(menu.main.map(x => x.id).join() === D.course.main.join() && D.course.main.join() === 'm1,shk,m2,m3,m4,fx,m5,inv', 'the 8 lessons in course order: ' + menu.main.map(x => x.id).join(' → '));
    ok(menu.main.map(x => x.no).join() === '1,2,3,4,5,6,7,8' && menu.main.every(x => !x.dis), 'badges 1–8, all enabled');
    ok(menu.order === 'part,part,part,part,sandbox,old', 'order: 4 parts → 沙盒 link → 旧版课程 (' + menu.order + ')');
    ok(/沙盒/.test(menu.sand) && /free\//.test(menu.sand) && !/自由运行/.test(menu.sand), '沙盒 link (free mode): ' + menu.sand);
    ok(!menu.oldOpen && ['0', '0b', '5', '7', 'w1', 'w2'].every(x => menu.old.includes(x)), '旧版课程 (collapsed) holds lesson 0, 0.5, Capex 5, 自由运行 7, 世界 1 / 2');
    ok(!menu.soon, 'no 制作中 placeholder');
    const counts = {}; menu.ids.forEach(x => { counts[x] = (counts[x] || 0) + 1; });
    ok(Object.values(counts).every(n => n === 1), 'every menu item appears once');
    ok(D.ids.every(x => counts[x] === 1), 'every lesson of LESSONS is in the menu exactly once' + (D.ids.filter(x => counts[x] !== 1).length ? ': missing/dup ' + D.ids.filter(x => counts[x] !== 1) : ''));
    await shot(`menu-${dev}`);

    // ---- 2. the whole chain from the menu: m1 → shk → m2 → m3 → m4 → fx → m5 → inv ----
    await click('#ls-menu .ls-item[data-id="m1"]', 2500);
    const ORDER = D.course.main;
    for (let k = 0; k < ORDER.length; k++) {
      const L = D.L[ORDER[k]], tag = `${dev} L${k + 1} ${L.id}`;
      for (let i = 0; i < L.steps.length; i++) {
        const st = L.steps[i], w = `${tag} step ${i + 1}`;
        if (i > 0) {
          if (await ev(`!!document.querySelector('#ls-card [data-act=next]')?.disabled`)) { await resolveGate(); await sleep(900); }
          await click('#ls-card [data-act=next]', st.panel && st.panel.id === 'fx-reactor' ? 1700 : 1300);
        }
        let s = await state();
        ok(s.on && s.lesson === String(L.id) && s.step === i, `${w}: on the card (${s.lesson} #${s.step})`);
        ok(s.active === String(L.id), `${w}: mw:lesson-active { id: ${s.active} }`);
        checkPanel(L, st, s, w);
        // ---- 3. course-v3 specifics
        if (L.id === 'm4' && /化债四个出口/.test(st.title)) {
          await resolveGate(); await sleep(700);
          const t = await ev(`document.querySelector('#ls-card .ls-body').textContent`);
          ok(['增长', '没人被砍', '通胀', '拿现金、国债的人', '金融压制', '存钱的人', '违约', '债主'].every(x => t.includes(x)) && /金融压制 \+ 增长/.test(t), `${w}: 化债四个出口 and who pays; answer = 金融压制 + 增长`);
          await scrollCard('.ls-stitle'); await sleep(250);
          await shot(`l5-exits-${dev}`);
          await scrollCard('.ls-explain'); await sleep(250);
          await shot(`l5-exits-answer-${dev}`);
        }
        if (L.id === 'fx' && i === 1) {
          ok(/澳元比一年前变强 1%/.test(s.panels[0]?.text || '') && await ev(`!!document.querySelector('#ls-panel .fxr-svg path')`), `${w}: reactor drawn, needle +1% (${(s.panels[0]?.text || '').slice(0, 60)})`);
          await shot(`l6-reactor-${dev}`);
        }
        if (L.id === 'fx' && i === 2) {
          ok(await ev(`!!document.querySelector('#ls-panel .fxr-forces[open]')`), `${w}: the five forces are open`);
          ok(await ev(`document.querySelectorAll('#ls-card .ls-drills [data-act=drill]').length`) === 5, `${w}: five drill-down buttons`);
          await click('#ls-card [data-act=drill][data-k="1"]', 1300);
          s = await state();
          checkPanel(L, st, s, `${w} drill 利差`, st.drills[1].panel);
          ok(s.drill && s.panels[0]?.id === 'fx-pipe', `${w}: drill 利差 → fx-pipe over the diagram, drill text in the card`);
          await click('#ls-card [data-act=drill][data-k="-1"]', 1500);
          s = await state();
          ok(!s.drill && s.panels.length === 1 && s.panels[0].id === 'fx-reactor', `${w}: 回到汇率闸 → the reactor again`);
        }
        if (L.id === 'fx' && i === 5) {
          await click('#ls-panel .ls-fxr-d[data-date="2011Q2"]', 1300);
          s = await state();
          ok(s.panels.length === 1 && s.panels[0].date === '2011Q2' && /偏贵 44%/.test(s.panels[0].text) && /2011Q2\*/.test(s.chips), `${w}: chip 2011Q2 remounts the reactor (比 PPP 锚偏贵 44%)`);
          await shot(`l6-aud-${dev}`);
          await click('#ls-panel .ls-fxr-d[data-date="2008Q4"]', 1300);
          s = await state();
          ok(s.panels.length === 1 && s.panels[0].date === '2008Q4' && /变弱 24%/.test(s.panels[0].text), `${w}: chip 2008Q4 (澳元比一年前变弱 24%)`);
        }
        if (L.id === 'm5' && st.drillCta) {
          ok(s.panels.length === 0 && s.country === 'USA', `${w}: 外国人 card on the US diagram`);
          await click('#ls-card [data-act=drill][data-k="0"]', 1700);
          s = await state();
          checkPanel(L, st, s, `${w} sub-step`, st.drills[0].panel);
          ok(s.drill && s.country === 'USA', `${w}: sub-step = the AUS reactor over the diagram, drill text in the card, still the US sim (no switch)`);
          await click('#ls-panel .ls-fxr-d[data-date="2009Q1"]', 1300);
          s = await state();
          ok(s.panels[0]?.date === '2009Q1' && /变弱 27%/.test(s.panels[0]?.text || ''), `${w}: chip 2009Q1: 澳元比一年前变弱 27%`);
          await shot(`l7-aus-${dev}`);
          await click('#ls-card [data-act=drill][data-k="-1"]', 1300);
          s = await state();
          ok(!s.drill && s.panels.length === 0 && !s.lsPanel && !s.pnlOn && s.country === 'USA' && s.step === i, `${w}: 回到美国 → the US diagram, same step`);
        }
        if (i === L.steps.length - 1) {
          if (await ev(`!!document.querySelector('#ls-card [data-act=reveal], #ls-card .ls-opt[data-act=pick]:not([disabled])')`)) { await resolveGate(); await sleep(900); }
          s = await state();
          ok(s.end.length === 3 && ['水的问题还是河道的问题？', '环上哪一步？', '谁赢谁输、钱放哪？'].every((q, j) => s.end[j].includes(q)) && !/[{}]|undefined|NaN/.test(s.end.join('')), `${tag}: the 三问 ending (3 rows)`);
          const done = await ev(`(()=>{try{return [JSON.parse(localStorage.getItem('mw.lessons.v1')).done[${JSON.stringify(String(L.id))}]===true, (JSON.parse(localStorage.getItem('mw.course')||'{}').done||[]).includes(${JSON.stringify(String(L.id))})]}catch(e){return [false,false]}})()`);
          ok(done[0] && done[1], `${tag}: reaching the last step marks it done (mw.lessons.v1 ${done[0]}, progress.js mw.course ${done[1]})`);
          if (L.id === 'm4' && SHOTS) {                     // the 三问 block: on the phone the card is made tall (⤢) so all three rows show
            if (dev === 'phone') await click('#ls-card [data-act=expand]', 400);
            await scrollCard('.ls-end'); await sleep(250); await shot(`ending-${dev}`);
            if (dev === 'phone') await click('#ls-card [data-act=expand]', 400);
          }
          if (k < ORDER.length - 1) {
            const N = D.L[ORDER[k + 1]];
            ok(s.next.includes('下一课') && s.next.includes(N.title), `${tag}: 下一课 → ${N.title} (${s.next})`);
            await click('#ls-card [data-act=nextlesson]', N.country !== L.country ? 5000 : 2500);
          } else ok(!s.next, `${tag}: the end of the line (no 下一课)`);
        }
      }
    }
    // ---- L8 投资者 specifics (still on its last step, AUS view) ----
    let s = await state();
    ok(s.country === 'AUS' && s.lesson === 'inv' && /澳洲/.test(s.badge), 'inv runs in the AUS view: ' + s.badge);
    const links = await ev(`[...document.querySelectorAll('#ls-panel a[href]')].map(a=>a.getAttribute('href')).join(' | ')`);
    ok((links.match(/blind\/\?card=/g) || []).length === 3 && /USA-2006/.test(links) && /AUS-2015/.test(links), 'blind step: three practice-card links: ' + links);
    await shot(`inv-blind-${dev}`);
    await go('?pause=1&country=AUS&lesson=inv&step=1', 4000);
    await sleep(600);
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
    await scrollCard('.ls-pnl-card'); await sleep(300);
    await shot(`inv-assets-${dev}`);
    // exit: back to the US root page, simple mode, nothing mounted, mw:lesson-active null was sent
    const la = await ev(`(()=>{document.querySelector('#ls-card [data-act=exit]').click(); return window.__la.slice(-1)[0]})()`);
    ok(la === null, 'exit sends mw:lesson-active { id: null }');
    await sleep(4500);
    s = await state();
    ok(s.country === 'USA' && !/lesson=/.test(await ev('location.search')) && !s.on, 'inv exit: back on the US root page (' + await ev('location.href') + ')');
    ok(!/澳洲/.test(s.badge) && s.layout === 'simple' && await shown('#simple') && !(await shown('#tabbar')), 'inv exit: US, simple mode (' + s.badge + ', ' + s.layout + ')');
    ok(s.panels.length === 0 && !s.lsPanel, 'inv exit: no panel left');
    const prog = await ev(`(()=>{try{return (JSON.parse(localStorage.getItem('mw.course')).done||[]).join()}catch(e){return ''}})()`);
    ok(D.course.main.every(x => prog.split(',').includes(x)), 'progress.js mw.course has all 8 lessons: ' + prog);

    // ---- 4. 汇率: ‹ 上一步 swaps panels back, exit from a panel step ----
    await go(`?pause=1&lesson=fx&step=${D.L.fx.steps.length - 1}`, 3500);
    s = await state(); ok(s.panels.length === 1 && s.panels[0].id === 'fx-calc', 'fx last step: the calculator');
    await click('#ls-card [data-act=prev]', 1700);
    s = await state(); ok(s.step === 5 && s.panels.length === 1 && s.panels[0].id === 'fx-reactor' && s.panels[0].date === '2003Q4', '上一步 → the AUD case: calculator unmounted, reactor at 2003Q4');
    await click('#ls-card [data-act=prev]', 1500);
    s = await state(); ok(s.step === 4 && s.panels.length === 0 && s.map === '1', '上一步 → the reserve-currency map step: reactor unmounted, map open');
    await click('#ls-card [data-act=prev]', 1200); await click('#ls-card [data-act=prev]', 1700);
    s = await state(); ok(s.step === 2 && s.panels.length === 1 && s.panels[0].id === 'fx-reactor' && s.map === '', '上一步 ×2 → the five forces: reactor back, map closed');
    await click('#ls-card [data-act=exit]', 1500);
    s = await state();
    ok(!s.on && s.panels.length === 0 && !s.lsPanel && !s.flowHidden, 'fx exit: panel unmounted, #ls-panel gone, diagram visible');
    ok(s.layout === 'simple' && await shown('#simple') && !(await shown('#tabbar')), 'fx exit: simple mode');
  }
  await send('Emulation.clearDeviceMetricsOverride');
  console.log('\nerrors:', errors.length ? errors : 'none');
  ok(!errors.length, 'no JS errors');
} catch (e) { console.log('driver error', e); fails++; }
finally { try { ws.close(); } catch (e) { /* ignore */ } proc.kill(); if (server) server.close(); }
console.log(fails ? `FAILED: ${oks} ok, ${fails} FAIL` : `ALL OK: ${oks} ok`);
process.exit(fails ? 1 : 0);
