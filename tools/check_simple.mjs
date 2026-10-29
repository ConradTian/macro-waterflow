// node tools/check_simple.mjs   (serve the repo root first: python -m http.server 8251; BASE=http://localhost:PORT/ overrides)
// CDP check of SIMPLE MODE (src/ui/simple.js + the layout state in app.js): the default page is the diagram + the two cycle dials + 本季看点 + 「更多」;
// 更多 opens the 4 tabs and is remembered (localStorage 'mw.layout'), ◂ 简洁 goes back; ?full=1 / ?tab= / ?full=0 override without storing;
// a dial tap opens 周期; a 下一步 item opens 周期; the time controls work in simple mode; a lesson step with tab: shows that tab and leaves the
// stored choice alone; free mode and the AUS view; iPad / phone layout (更多 on screen, phone = dials side by side); no JS errors.
import { spawn } from 'node:child_process';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
const EDGE = 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe';
const port = 9395, BASE = process.env.BASE || 'http://localhost:8251/';
const profile = mkdtempSync(join(tmpdir(), 'mw-simple-'));   // fresh profile: localStorage starts empty
const proc = spawn(EDGE, ['--headless=new', '--disable-gpu', `--user-data-dir=${profile}`, `--remote-debugging-port=${port}`, '--window-size=1180,820', 'about:blank'], { stdio: 'ignore' });
const sleep = ms => new Promise(r => setTimeout(r, ms));
const allLayers = u => (/^about:/.test(u) ? u : u + (u.includes('?') ? '&' : '?') + 'layers=all');   // progressive diagram: this check wants the whole diagram (layers: tools/check_layers.mjs)
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
const go = async (path, wait = 2600) => { await send('Page.navigate', { url: allLayers(BASE + path) }); await sleep(wait); };
const click = async (sel, wait = 600) => { const r = await ev(`(()=>{const b=document.querySelector(${JSON.stringify(sel)}); if(!b) return 'missing'; b.click(); return 'ok'})()`); await sleep(wait); return r; };
const shown = sel => ev(`(()=>{const e=document.querySelector(${JSON.stringify(sel)}); return !!e && e.getClientRects().length > 0 && getComputedStyle(e).display !== 'none'})()`);
const stored = () => ev(`(()=>{try{return localStorage.getItem('mw.layout')}catch(e){return 'ERR'}})()`);
const layout = () => ev(`document.body.dataset.layout`);
const selTab = () => ev(`(document.querySelector('#tabbar [aria-selected="true"]')||{}).dataset?.tab || ''`);

try {
  await send('Runtime.enable'); await send('Page.enable');

  // ---- 1. default = simple ----
  await go('?pause=1&t=52&debug=1');
  ok(await stored() === null, 'fresh profile: nothing stored');
  ok(await layout() === 'simple', 'default layout = simple');
  ok(await shown('#simple') && !(await shown('#tabbar')) && !(await shown('#tab-content')), 'simple panel shown, tab bar + tab content hidden');
  ok(await shown('#diagram .flow-svg') && await shown('#objective') && await shown('#headline'), 'diagram, 总目标 and 本季看点 strips still shown');
  ok(await ev(`document.querySelectorAll('#simple .sp-dial svg.cy-dial').length`) === 2, 'two dials (the 周期 tab drawing)');
  const lab = await ev(`JSON.stringify([window.__mw.snap().cycles.long.label, window.__mw.snap().cycles.short.label])`);
  const nows = await ev(`JSON.stringify([...document.querySelectorAll('#simple .sp-now b')].map(b => b.textContent))`);
  ok(lab === nows, 'dial labels = engine labels: ' + nows);
  ok(await ev(`document.querySelectorAll('#simple .sp-dial .cy-node.cur').length`) === 2, 'each dial marks its current node');
  ok(await ev(`document.querySelectorAll('#simple .sp-list li').length`) >= 1 && await shown('#simple .sp-hl'), 'iPad: 本季看点 details on the right: ' + await ev(`document.querySelectorAll('#simple .sp-list li').length`) + ' rows');
  ok(await ev(`document.querySelector('#simple .sp-h small').textContent`) === '2008Q1', '本季看点 details dated 2008Q1');
  ok(await ev(`(()=>{const r=document.querySelector('.sp-more').getBoundingClientRect(); return r.height > 40 && r.bottom <= innerHeight + 1})()`), 'iPad: 「更多」 fully on screen');
  ok(await ev(`(()=>{const d=document.querySelector('#diagram').getBoundingClientRect(), s=document.querySelector('#simple').getBoundingClientRect(); return s.left >= d.right - 1})()`), 'iPad: dials right of the diagram');

  // ---- 2. time controls work in simple mode ----
  await click('#btn-step');
  ok(await ev(`document.querySelector('#date').textContent`) === '2008Q2' && await ev(`document.querySelector('#simple .sp-h small').textContent`) === '2008Q2', '⏭ steps and the simple panel follows (2008Q2)');
  await click('#btn-back', 900);
  ok(await ev(`document.querySelector('#date').textContent`) === '2008Q1' && await ev(`document.querySelector('#simple .sp-h small').textContent`) === '2008Q1', '⏮ goes back and the simple panel follows (2008Q1)');
  ok(await shown('#view-toggle'), '曲线 view toggle still there');
  await click('#view-toggle', 1200);
  ok(await ev(`document.body.dataset.view`) === 'waves' && await shown('#wave-view'), '曲线 view opens over the diagram in simple mode');
  await click('#view-toggle', 600);
  ok(await ev(`document.body.dataset.view`) === 'flow', '… and back to 水流');

  // ---- 3. 更多 -> full, remembered; ◂ 简洁 -> simple, remembered ----
  await click('#simple [data-act="more"]', 1200);
  ok(await layout() === 'full' && await shown('#tabbar') && await shown('#tab-content') && !(await shown('#simple')), '更多 opens the full layout');
  ok(await selTab() === 'ledger' && (await ev(`document.querySelector('#tab-content').textContent.length`)) > 50, 'full layout shows the current tab (流水账) with content');
  ok(await stored() === 'full', 'choice stored: full');
  await go('?pause=1&t=52');
  ok(await layout() === 'full' && await shown('#tabbar'), 'reload: full remembered');
  ok(await shown('#tabbar .tb-simple'), '◂ 简洁 button in the tab bar');
  await click('#tabbar .tb-simple', 900);
  ok(await layout() === 'simple' && await shown('#simple') && !(await shown('#tabbar')), '◂ 简洁 goes back to simple');
  ok(await stored() === 'simple', 'choice stored: simple');
  await go('?pause=1&t=52');
  ok(await layout() === 'simple', 'reload: simple remembered');

  // ---- 4. dial tap -> 周期; 下一步 item -> 周期 ----
  await click('#simple .sp-dial[data-kind="short"]', 1500);
  ok(await layout() === 'full' && await selTab() === 'cycle' && await ev(`!!document.querySelector('#tab-content .cy-dials')`), 'dial tap opens the full layout on 周期');
  await click('#tabbar .tb-simple', 900);
  await click('#simple .sp-dial[data-kind="long"]', 1500);
  ok(await layout() === 'full' && await selTab() === 'cycle', 'long dial tap too');
  await click('#tabbar .tb-simple', 900);
  if (await ev(`!!document.querySelector('#simple .sp-item[data-i="next"]')`)) {
    await click('#simple .sp-item[data-i="next"]', 1500);
    ok(await layout() === 'full' && await selTab() === 'cycle', '下一步 item opens 周期');
    await click('#tabbar .tb-simple', 900);
  }
  // keyboard on a dial
  await ev(`document.querySelector('#simple .sp-dial').focus()`);
  await send('Input.dispatchKeyEvent', { type: 'keyDown', key: 'Enter', code: 'Enter', windowsVirtualKeyCode: 13 }); await sleep(1200);
  ok(await layout() === 'full' && await selTab() === 'cycle', 'Enter on a focused dial opens 周期');
  await click('#tabbar .tb-simple', 900);
  // mw:layout event (for other modules)
  await ev(`document.dispatchEvent(new CustomEvent('mw:layout', { detail: { layout: 'full', tab: 'assets', save: false } }))`); await sleep(1200);
  ok(await layout() === 'full' && await selTab() === 'assets' && await stored() === 'simple', 'mw:layout event opens 资产 without storing');
  await ev(`document.dispatchEvent(new CustomEvent('mw:layout', { detail: { layout: 'simple', save: false } }))`); await sleep(600);
  ok(await layout() === 'simple', 'mw:layout back to simple');

  // ---- 5. URL overrides (never stored) ----
  await go('?pause=1&t=52&full=1');
  ok(await layout() === 'full' && await stored() === 'simple', '?full=1 opens full, stored choice untouched');
  await go('?pause=1&t=52&tab=assets');
  ok(await layout() === 'full' && await selTab() === 'assets', '?tab=assets opens full on 资产');
  await ev(`localStorage.setItem('mw.layout','full')`);
  await go('?pause=1&t=52&full=0');
  ok(await layout() === 'simple' && await stored() === 'full', '?full=0 forces simple, stored choice untouched');
  await ev(`localStorage.setItem('mw.layout','simple')`);

  // ---- 6. a lesson step that needs a tab ----
  const pick = await ev(`import('./src/data/lessons.js').then(m => { for (const L of m.LESSONS) { if (L.country || L.scenario === 'town') continue; const i = L.steps.findIndex(s => s.tab && (s.type !== 'reveal' || !s.question)); if (i >= 0) return JSON.stringify({ id: String(L.id), i, tab: L.steps[i].tab }); } return '' })`);
  ok(!!pick, 'found a US lesson step with tab: ' + pick);
  if (pick) {
    const P = JSON.parse(pick);
    await go(`?pause=1&lesson=${encodeURIComponent(P.id)}&step=${P.i}&nozoom=1`, 3500);
    ok(await ev(`document.body.classList.contains('lesson-on')`) && await shown('#ls-card'), 'lesson card shown');
    ok(await shown('#tabbar') && await shown('#tab-content') && !(await shown('#simple')), 'lesson runs in the full layout');
    ok(await selTab() === P.tab, `the step's tab is open: ${await selTab()} (wants ${P.tab})`);
    ok(!(await shown('#tabbar .tb-simple')), '◂ 简洁 hidden during a lesson');
    ok(await stored() === 'simple' && await layout() === 'simple', 'a lesson does not change the stored choice');
    await click('#ls-card [data-act=exit]', 1500);
    ok(!(await ev(`document.body.classList.contains('lesson-on')`)) && await shown('#simple') && !(await shown('#tabbar')), 'leaving the lesson returns to simple');
    ok(await ev(`document.querySelectorAll('#simple .sp-dial svg').length`) === 2, '… with the dials drawn');
  }
  // starting a lesson from the 教学 menu while in simple
  await go('?pause=1&t=52');
  await click('#btn-teach', 900);
  await click('#ls-menu .ls-item[data-id="3b"]:not([disabled])', 2500);
  if (await ev(`document.body.classList.contains('lesson-on')`)) ok(await shown('#tabbar') && await selTab() === 'cycle', 'lesson 3½ from the menu: full layout on 周期');

  // ---- 7. free mode + AUS ----
  await go('free/index.html?pause=1&t=20');
  ok(await layout() === 'simple' && await ev(`document.querySelectorAll('#simple .sp-dial svg').length`) === 2, 'free mode: simple with the two dials');
  await click('#simple [data-act="more"]', 1200);
  ok(await layout() === 'full' && await shown('#tabbar'), 'free mode: 更多 opens the tabs');
  await click('#tabbar .tb-simple', 600);
  await go('?country=AUS&forceCountry=1&t=110&pause=1', 3000);
  ok(await layout() === 'simple' && await ev(`document.querySelectorAll('#simple .sp-dial svg').length`) === 2, 'AUS view: simple with the two dials');
  const aus = await ev(`document.querySelector('#simple').innerText`);
  ok(!/美元|(?<![澳英日欧央])联储|美国/.test(aus), 'AUS simple panel: no 美元 / 联储 / 美国');

  // ---- 8. town (screenshot helper) ----
  await go('?pause=1&scenario=town');
  ok(await ev(`!!document.querySelector('#simple .sp-empty')`) && await shown('#simple .sp-more'), 'town: a note instead of the dials, 更多 still there');

  // ---- 9. phone 390 ----
  await send('Emulation.setDeviceMetricsOverride', { width: 390, height: 844, deviceScaleFactor: 2, mobile: true });
  await go('?pause=1&t=52');
  const ph = await ev(`(()=>{const d=[...document.querySelectorAll('#simple .sp-dial')].map(x=>x.getBoundingClientRect()); const m=document.querySelector('.sp-more').getBoundingClientRect(), g=document.querySelector('#diagram').getBoundingClientRect(); return JSON.stringify({ row: d.length === 2 && Math.abs(d[0].top - d[1].top) < 2 && d[1].left > d[0].right - 1, under: d[0].top >= g.bottom - 1, more: m.bottom <= innerHeight + 1 && m.height > 40, dialsOn: d[0].bottom <= m.top + 1, overflowX: document.documentElement.scrollWidth > innerWidth })})()`);
  const P2 = JSON.parse(ph);
  ok(P2.row && P2.under, 'phone: the dials sit side by side under the diagram');
  ok(P2.more && P2.dialsOn, 'phone: dials and 「更多」 fit on screen');
  ok(!P2.overflowX, 'phone: no horizontal scroll');
  ok(!(await shown('#simple .sp-hl')), 'phone: 本季看点 details stay in the strip (not repeated)');
  await click('#simple [data-act="more"]', 1200);
  ok(await shown('#tabbar') && await ev(`document.querySelector('#tabbar .tb-simple').getBoundingClientRect().right <= innerWidth + 1`), 'phone: full layout, ◂ 简洁 fits in the tab bar');
  await send('Emulation.clearDeviceMetricsOverride');

  console.log('errors:', errors.length ? errors : 'none');
  ok(!errors.length, 'no JS errors');
} catch (e) { console.log('driver error', e); fails++; }
finally { try { ws.close(); } catch (e) { /* ignore */ } proc.kill(); }
console.log(fails ? `${fails} FAIL` : 'ALL OK');
process.exit(fails ? 1 : 0);
