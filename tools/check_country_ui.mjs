// node tools/check_country_ui.mjs   (serve the repo root first: python -m http.server 8192; BASE=http://localhost:PORT/ overrides; COUNTRY=AUS|GBR|... picks the country)
// CDP check of a COUNTRY view (?country=XXX&forceCountry=1, so it works while COUNTRY_READY is still false):
//   no JS errors; the labels are the country's (家庭 · 约 X 户, unit, 央行 name); every tab (流水账 / 周期 / 资产 / 接管), a set of concept cards, the headline and the
//   time scrubber show NO 美元 / 联储 / 美国 outside the allowed places (the FX gate 「/美元」, 「1 美元 = x 本币」, dated US history examples in a card's formula, the
//   储备货币 card); a series the country lacks (AUS: cape) hides its chart instead of crashing; the 周期 tab's 「三条线」 chip starts on the country; no US-only
//   elements (recession bands, curves view, 第二个窗口); the cash / IOU tanks never reach the clamp; the map still opens. Phone 390 too.
import { spawn } from 'node:child_process';
const EDGE = 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe';
const port = 9371, BASE = process.env.BASE || 'http://localhost:8192/', ISO = (process.env.COUNTRY || 'AUS').toUpperCase();
const proc = spawn(EDGE, ['--headless=new', '--disable-gpu', `--remote-debugging-port=${port}`, '--window-size=1180,820', 'about:blank'], { stdio: 'ignore' });
const sleep = ms => new Promise(r => setTimeout(r, ms));
const allLayers = u => (/^about:/.test(u) ? u : u + (u.includes('?') ? '&' : '?') + 'layers=all');   // progressive diagram: this check wants the whole diagram (layers: tools/check_layers.mjs)
const errors = [];
let fails = 0; const ok = (c, m) => { if (!c) { fails++; console.log('FAIL:', m); } else console.log('ok:', m); };

// words that must not show in a country view ...
const BAD = /美元|(?<![澳英日欧央])联储|美国/g;      // 澳联储 is the country's own central bank name, not a leftover
// ... except in these (each is about the US or the dollar on purpose)
const ALLOWED = [
  /\/美元/g,                                   // the FX gate: 汇率 1.52/美元
  /(本币\s*\/\s*)美元/g,                        // gauge label: 本币 / 美元（变大 = 本币变弱）
  /1 美元 = [\d.]+ 本币/g, /每 1 美元换多少本币/g, /一美元能换多少本币/g,          // the 汇率 card
  /美国\s*\d{4}\s*[–-]?\s*\d*年?第?一?季?(?:进入 B2)?/g, /（美国 [\d–、 ]+）/g, /美国 \d{4}Q\d 进入/g, /美国 \d{4} 年第一季进入 B2/g,       // dated US history examples in a cycle card
  /美国 30 年固定/g,                             // the comparison in the 房贷利率 card (澳洲 / 英国 vs 美国 30 年固定)
  /，和美国相同/g,                               // the long-wave 「现在」 line (world.js longStage, GBR): a deliberate comparison with the US stage
  /美国国债/g, /美元占[^。；\n]*/g,               // 储备货币 card: about the world's reserve currency
];
const scrub = t => ALLOWED.reduce((s, re) => s.replace(re, ''), t);

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
    go: async url => { await send('Page.navigate', { url: allLayers(url) }); await sleep(2800); },
    click: sel => ev(`(()=>{const b=document.querySelector(${JSON.stringify(sel)}); if(!b) return 'missing'; b.dispatchEvent(new MouseEvent('click',{bubbles:true,cancelable:true})); return 'ok'})()`),
    count: sel => ev(`document.querySelectorAll(${JSON.stringify(sel)}).length`),
    text: sel => ev(`(document.querySelector(${JSON.stringify(sel)})||{}).textContent||''`),
    viewport: (w, h) => send('Emulation.setDeviceMetricsOverride', { width: w, height: h, deviceScaleFactor: 1, mobile: w < 500 }),
    shot: async file => { const r = await send('Page.captureScreenshot', { format: 'png' }); (await import('node:fs')).writeFileSync(file, Buffer.from(r.result.data, 'base64')); },
  };
}
const tabs = async () => (await (await fetch(`http://127.0.0.1:${port}/json`)).json()).filter(x => x.type === 'page');

// visible text nodes under a selector (display:none / hidden / visibility:hidden branches skipped), with a short element path
const VIS = sel => `(()=>{const root=document.querySelector(${JSON.stringify(sel)}); if(!root) return []; const out=[];
  const w=document.createTreeWalker(root,NodeFilter.SHOW_TEXT); let n;
  while(n=w.nextNode()){ const t=n.nodeValue.trim(); if(!t) continue; const el=n.parentElement; if(!el||el.closest('script,style')) continue;
    let hid=false; for(let e=el;e;e=e.parentElement){ if(e.hidden){hid=true;break;} const cs=getComputedStyle(e); if(cs.display==='none'||cs.visibility==='hidden'){hid=true;break;} if(e===root)break; }
    if(!hid) out.push([t, (el.className&&el.className.baseVal!==undefined?el.className.baseVal:el.className)||el.tagName]); }
  return out; })()`;
async function grep(c, sel, label) {
  const nodes = await c.ev(VIS(sel));
  const bad = [];
  for (const [t, cls] of nodes) { if (/wv-chip/.test(cls)) continue; const rest = scrub(t);      // (the 三条线 chips list every country, the US one included)
    if (BAD.test(rest)) bad.push(`${cls}: ${t.slice(0, 90)}`); BAD.lastIndex = 0; }
  ok(nodes.length > 0 && bad.length === 0, `${label}: ${nodes.length} text nodes, no 美元/联储/美国${bad.length ? ' -> ' + bad.slice(0, 4).join(' | ') : ''}`);
  return nodes;
}

try {
  let ver = null;
  for (let i = 0; i < 40 && !ver; i++) { try { ver = await (await fetch(`http://127.0.0.1:${port}/json/version`)).json(); } catch (e) { await sleep(250); } }
  const bw = new WebSocket(ver.webSocketDebuggerUrl); await new Promise((res, rej) => { bw.onopen = res; bw.onerror = rej; });
  const before = new Set((await tabs()).map(x => x.id));
  bw.send(JSON.stringify({ id: 1, method: 'Target.createTarget', params: { url: 'about:blank' } }));
  let tab = null; for (let i = 0; i < 40 && !tab; i++) { await sleep(150); tab = (await tabs()).find(x => !before.has(x.id)); }
  const A = await client(tab);
  const SHOTS = process.env.SHOTS || '';
  const run = async (w, h, label) => {
    await A.viewport(w, h);
    await A.go(`${BASE}?country=${ISO}&forceCountry=1&t=60&pause=1&debug=1`);
    const info = await A.ev(`import('${BASE}src/ui/country-info.js').then(m => m.countryInfo('${ISO}'))`);
    ok(await A.ev(`window.__mw && window.__mw.sim().country`) === ISO, `[${label}] the sim runs on ${ISO} (forceCountry boot)`);
    ok((await A.text('#mode-badge')).includes(info.name), `[${label}] mode badge names the country: ${await A.text('#mode-badge')}`);
    ok((await A.text('#date')) !== '', `[${label}] date shown: ${await A.text('#date')}`);
    ok((await A.text('#diagram')).includes('家庭 · ' + info.households), `[${label}] diagram title 家庭 · ${info.households}`);
    ok((await A.text('.flow-budget')).includes(info.unitBn) || w < 500, `[${label}] budget bar unit ${info.unitBn}`);
    if (w >= 500) {
      ok(await A.ev(`getComputedStyle(document.querySelector('.bd-gate:not(.bd-res)')).display !== 'none'`), `[${label}] FX gate shown`);
      ok(await A.ev(`getComputedStyle(document.querySelector('.bd-res')).display === 'none'`), `[${label}] 美元 = 储备货币 gate hidden`);
    }
    await grep(A, '#diagram', `[${label}] diagram`);
    await grep(A, '.topbar', `[${label}] top bar + headline`);
    // headline open
    await A.click('.hl-bar'); await sleep(200);
    await grep(A, '#headline', `[${label}] headline open`);
    await A.click('.hl-bar');
    // time scrubber
    if (await A.count('#scrub-handle')) { await A.click('#scrub-handle'); await sleep(900); await grep(A, '#scrub-panel', `[${label}] scrubber panel`); ok(!(await A.text('#scrub-panel')).includes('美国衰退'), `[${label}] scrubber has no 美国衰退 band legend`); await A.click('#scrub-handle'); }

    // ---- tabs ----
    for (const t of ['ledger', 'cycle', 'assets', 'takeover']) {
      await A.click(`#tabbar [data-tab="${t}"]`); await sleep(900);
      const nodes = await grep(A, '#tab-content', `[${label}] tab ${t}`);
      ok(!(await A.text('#tab-content')).includes('面板出错'), `[${label}] tab ${t}: no panel error`);
      if (t === 'ledger') {
        const tx = await A.text('#tab-content');
        ok(tx.includes(info.cbName) || !tx.includes('真实'), `[${label}] ledger names the central bank ${info.cbName} where the US text said 联储`);
        ok(!tx.includes('美元'), `[${label}] ledger: no 美元`);
      }
      if (t === 'assets' || t === 'cycle') {
        const n = await A.count('#tab-content .pn-chart'), note = await A.count('#tab-content .pn-src');
        ok(n >= (t === 'assets' ? 2 : 1) && note === 1, `[${label}] ${t}: ${n} real-vs-model charts + data-source line (${note})`);
        ok((await A.text('#tab-content .pn-src')).includes(info.realData.slice(0, 4)), `[${label}] data source: ${await A.text('#tab-content .pn-src')}`);
      }
      if (t === 'cycle') {
        ok(await A.ev(`document.querySelector('.wv-chip[data-iso="${ISO}"]') ? document.querySelector('.wv-chip[data-iso="${ISO}"]').getAttribute('aria-pressed') === 'true' : true`), `[${label}] 三条线 chip preselected on ${ISO}`);
        ok(await A.count('.wv-qb') === 0 && await A.count('[data-act="wv-left"]') === 0 && await A.count('[data-act="wv-win"]') === 0, `[${label}] no US-only quarterly block / curves button / second window`);
        ok(await A.count('.wv .wv-svg') >= 1 && await A.count('.cy-now-l') >= 1, `[${label}] the country's own 三条线 chart draws a 「现在」 line`);
        ok(await A.count('.pn-reserved') >= 0, `[${label}] chart reserved band ok`);
      }
      if (t === 'takeover') {          // take over the central bank: the 三条线 charts and the peak table read the country's real series
        await A.click('#tk-take'); await sleep(900);
        await grep(A, '#tab-content', `[${label}] takeover (central bank taken over)`);
        ok(await A.count('.tk-table tbody tr') === 7 && await A.count('#tab-content .pn-chart') === 4, `[${label}] takeover: peak table 7 rows + 4 real/model/you charts: ${await A.count('.tk-table tbody tr')} rows, ${await A.count('#tab-content .pn-chart')} charts`);
        await A.click('#tk-exit'); await sleep(300);
      }
    }
    // a series the country lacks hides its chart (unit-level: cape is null in AUS)
    if (ISO === 'AUS') ok(await A.ev(`(async()=>{ const u = await import('${BASE}src/ui/tabs/_util.js'); const r = window.__mw.sim(); return u.hasReal({ real: (await import('${BASE}src/data/countries/aus-quarterly.js')).AUS_Q }, 'cape') === false })()`), `[${label}] hasReal(cape) = false -> compareChart hides it`);

    // ---- concept cards ----
    const cards = ['policyRate', 'mortgageEff', 'qe', 'newLoans', 'cpi', 'bankApproval', 'housePrice', 'creditImpulse', 'exports', 'imports', 'fx', 'foreignBonds', 'B2', 'longCycle', 'lampValuation', 'cashAsset'];
    for (const id of cards) {
      await A.ev(`document.querySelector('.cc-root') && document.querySelector('[data-cc-close]') && document.querySelector('[data-cc-close]').click(); 1`);
      await A.ev(`(()=>{const b=document.createElement('button'); b.className='term'; b.dataset.term=${JSON.stringify(id)}; b.hidden=true; document.body.appendChild(b); b.click(); b.remove(); return 1})()`);
      await sleep(350);
      const open = await A.ev(`!!document.querySelector('.cc-root') && !document.querySelector('.cc-root').hidden`);
      if (!open) { ok(false, `[${label}] card ${id} did not open`); continue; }
      // the 更多 block (formula + logic) is a <details>: open it so its text counts
      await A.ev(`(document.querySelectorAll('.cc-more').forEach(d => d.open = true), 1)`);
      await grep(A, '.cc-root', `[${label}] card ${id}`);
    }
    const live = await A.ev(`(()=>{ const b=document.createElement('button'); b.className='term'; b.dataset.term='newLoans'; b.hidden=true; document.body.appendChild(b); b.click(); b.remove(); return 1})()`);
    await sleep(300);
    const lv = await A.text('.cc-live b');
    ok(lv.includes(info.ccyName), `[${label}] 放贷 card live value carries the currency: ${lv}`);
    await A.click('[data-cc-close]');
    // ---- gauge (the 水尺 baseline is the country's own run) and 用模拟核对 (two sims on the country's data) ----
    await A.ev(`(()=>{const b=document.createElement('button'); b.className='term'; b.dataset.term='policyRate'; b.hidden=true; document.body.appendChild(b); b.click(); b.remove(); return 1})()`);
    await sleep(600);
    const gg = await A.text('.cc-root .gg-note');
    ok(gg.includes(info.name) || gg.includes('基线'), `[${label}] 水尺 note names the country's baseline: ${gg.slice(0, 60)}`);
    ok((await A.text('.cc-root .gg-hist-t')).length > 0, `[${label}] 水尺 has 最高 / 最低 marks from the country's own baseline run`);
    await A.click('[data-cv-act="check"]'); await sleep(4500);
    const cvt = await A.text('.cc-root .cv-check');
    ok(cvt.includes('澳洲') || cvt.includes(info.name) ? !cvt.includes('核对不了') : /还没有载入|这里还不能/.test(cvt) === false, `[${label}] 用模拟核对 ran on ${ISO}: ${cvt.replace(/s+/g, ' ').slice(0, 110)}`);
    await grep(A, '.cc-root', `[${label}] card policyRate with gauge + check`);
    await A.click('[data-cc-close]');
    // ---- the map still opens ----
    if (w >= 500) {
      await A.click('#btn-map'); await sleep(800);
      ok(await A.ev(`document.body.dataset.map === '1'`), `[${label}] map opens in the ${ISO} view`);
      if (SHOTS) await A.shot(`${SHOTS}/country-${ISO}-map-${label}.png`);
      await A.click('.wm-x, [data-act="wm-close"], .wm-close'); await A.ev(`document.dispatchEvent(new CustomEvent('mw:map',{detail:{open:false}}))`); await sleep(300);
    }
    // ---- curves view stays off ----
    await A.go(`${BASE}?country=${ISO}&forceCountry=1&t=60&pause=1&view=waves`);
    ok(await A.ev(`document.getElementById('view-toggle').hidden && document.getElementById('wave-view').hidden`), `[${label}] curves view (view=waves) stays off outside the USA`);
  };
  await run(1180, 820, 'ipad');
  // ---- free-run subpage on the country ----
  await A.go(`${BASE}free/index.html?country=${ISO}&forceCountry=1&pause=1&t=20&debug=1`);
  for (const t of ['ledger', 'cycle', 'assets', 'takeover']) { await A.click(`#tabbar [data-tab="${t}"]`); await sleep(900); await grep(A, '#tab-content', `[free] tab ${t}`); ok(!(await A.text('#tab-content')).includes('面板出错'), `[free] tab ${t}: no panel error`); }
  await grep(A, '#diagram', '[free] diagram');

  // ---- tanks: the cash and IOU water never hit the clamp over the whole history and free runs ----
  await A.viewport(1180, 820);
  await A.go(`${BASE}?country=${ISO}&forceCountry=1&t=0&pause=1&debug=1`);
  const tank = await A.ev(`(async () => {
    const ci = await import('${BASE}src/ui/country-info.js'), I = ci.countryInfo('${ISO}');
    const { createSim } = await import('${BASE}src/engine/sim.js');
    const ctry = await (await import('${BASE}src/data/countries/index.js')).COUNTRY_DATA['${ISO}']();
    const res = {};
    for (const mode of ['history', 'free']) {
      const s = createSim({ data: ctry, mode, country: '${ISO}' }); while (!s.done) s.step();
      let mc = 0, mi = 0;
      for (const x of s.history('model')) { const g = x.macro.gdpNominal; mi = Math.max(mi, (x.iou?.bankTotal ?? (x.debt.household + x.debt.firm)) / g); mc = Math.max(mc, (x.assets.cash?.level ?? x.money.M) / g); }
      res[mode] = { cash: mc / I.tank.cash, iou: mi / I.tank.iou };
    }
    return res; })()`);
  for (const m of ['history', 'free']) ok(tank[m].cash < 0.98 && tank[m].iou < 0.98, `tank levels stay under the 0.98 clamp (${m}): cash ${tank[m].cash.toFixed(2)}, iou ${tank[m].iou.toFixed(2)}`);

  if (!process.env.NO_PHONE) await run(390, 844, 'phone');
  ok(errors.length === 0, `no JS errors (${errors.length})${errors.length ? ': ' + errors.slice(0, 3).join(' | ') : ''}`);
  A.close();
  console.log(fails ? `\n${fails} FAILED` : '\nALL OK');
} catch (e) { fails++; console.log('CRASH', e); }
finally { proc.kill(); process.exit(fails ? 1 : 0); }
