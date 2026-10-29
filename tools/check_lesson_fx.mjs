// node tools/check_lesson_fx.mjs [--no-browser] [--shots]
//   (serve the repo root first for the browser part: python -m http.server 8281; BASE=http://127.0.0.1:PORT/ overrides; CDP port 9481)
// Checks the 「汇率」 lesson (src/data/lesson-fx.js) and its panels (src/ui/fx-lab.js):
//  1. data      src/data/fx-data.js series equal the raw FRED csvs (data_src/world/fred); the spec numbers appear in the research handover
//               (../dalio_432/closeout/handover_macro.md, read only, skipped when absent)
//  2. shape     course v3 L6 (tools/COURSE-V3.md): intro + 6 steps: the FX reactor (AUS) -> five forces (reactor, drill-downs = the five
//               fx-lab panels) -> trade pipes (map AUS) -> reserve currency (map USA) -> the AUD case (reactor with date chips 2003 / 2008 /
//               2011 / 2025) -> calculator; every panel id exists; the last step has the 三问 ending and points at m5 (第 7 课)
//  3. numbers   every number typed in a step's title/text/ending and in its drill-downs' texts is listed in step.nums / drill.nums, and each
//               nums entry recomputes (from the repo's data, the FX reactor, the engine or the spec) to exactly the typed string; every facts
//               claim holds
//  4. words     no 同比/环比 in the lesson text or the panel code
//  5. calc      the two presets land on the research base (±0.05) inside its range; the panel's AUD/CNY equals the checker's
//  6. browser   headless Edge: every panel mounts and unmounts in tools/fx-lab-demo.html with no JS errors, at iPad 1180×820 and phone 390×844;
//               charts drawn, no sideways overflow, hover tooltip, calculator slider/preset/checkbox react. --shots saves tools/shots/<panel>-<pad|phone>.png
import { readFileSync, existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { spawn } from 'node:child_process';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { dirname, resolve } from 'node:path';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const imp = p => import(pathToFileURL(resolve(ROOT, p)).href);
let fails = 0, oks = 0;
const ok = (c, m) => { if (!c) { fails++; console.log('FAIL:', m); } else { oks++; if (process.env.VERBOSE) console.log('ok:', m); } };
const section = t => console.log('\n== ' + t);

const { LESSON_FX } = await imp('src/data/lesson-fx.js');
const { FX_SPEC, JPY_ANNUAL, UK_MONTHLY, FX_FORCES } = await imp('src/data/fx-data.js');
const FXL = await imp('src/ui/fx-lab.js');
const { WORLD } = await imp('src/data/world.js');
const { US_Q } = await imp('src/data/us-quarterly.js');
const Q = { USA: US_Q };
for (const [iso, f] of [['AUS', 'aus'], ['CHN', 'chn'], ['GBR', 'gbr'], ['JPN', 'jpn']]) Q[iso] = Object.values(await imp(`src/data/countries/${f}-quarterly.js`)).find(v => v && v.dates);
const { computeFxReactor, usdIndexAt } = await imp('src/ui/fx-reactor.js');
const { USD_INDEX } = await imp('src/data/usd-index.js');
const { COUNTRY_DATA } = await imp('src/data/countries/index.js');
const { evalGet } = await imp('src/ui/lessons-town.js');
const { FX_FIT } = await imp('src/data/fx-fit.js');
const RX = { AUS: await COUNTRY_DATA.AUS(), USA: await COUNTRY_DATA.USA(), JPN: await COUNTRY_DATA.JPN() };   // the reactor reads the same data objects as the app (loadCountry)
const fxrCache = {};
const csv = name => readFileSync(resolve(ROOT, 'data_src/world/fred', name), 'utf8').trim().split(/\r?\n/).slice(1).map(l => l.split(',')).map(([d, v]) => [d.slice(0, 7), +v]);
const CSV = { EXJPUS: csv('EXJPUS.csv'), EXUSUK: csv('EXUSUK.csv'), GILT: csv('IRLTLT01GBM156N.csv') };
const mean = a => a.reduce((x, y) => x + y, 0) / a.length;
const getPath = (o, p) => p.split('.').reduce((a, k) => (a == null ? a : a[k]), o);

/* ---------- D: the getters the lesson's nums/facts use ---------- */
const D = {
  spec: FX_SPEC,
  q(iso, s, d) { const X = Q[iso], i = X.dates.indexOf(d); if (i < 0) throw new Error(`no ${iso} ${d}`); const v = X.series[s][i]; if (v == null) throw new Error(`null ${iso}.${s}@${d}`); return v; },
  qy(iso, s, y) { return mean([1, 2, 3, 4].map(k => D.q(iso, s, `${y}Q${k}`))); },
  qavg(iso, s, from, until) { const X = Q[iso]; return mean(X.series[s].slice(X.dates.indexOf(from), X.dates.indexOf(until) + 1)); },
  audcny(y) { return mean([1, 2, 3, 4].map(k => D.q('CHN', 'fxPerUsd', `${y}Q${k}`) / D.q('AUS', 'fxPerUsd', `${y}Q${k}`))); },
  uk(s, m) { const r = (s === 'gilt10y' ? CSV.GILT : CSV.EXUSUK).find(x => x[0] === m); if (!r) throw new Error('no UK ' + s + ' ' + m); return r[1]; },
  ukCsv(name) { return name.startsWith('IRLTLT01GB') ? CSV.GILT : CSV.EXUSUK; },
  jpy(y) { return mean(CSV.EXJPUS.filter(x => x[0].startsWith(y + '-')).map(x => x[1])); },
  w(path, y) { const a = getPath(WORLD, path); const i = WORLD.years.indexOf(y); if (!Array.isArray(a) || i < 0 || a[i] == null) throw new Error('no world ' + path + '@' + y); return a[i]; },
  // the FX reactor (AUS vs USA) at a quarter, exactly as the lesson panel draws it (src/ui/fx-reactor.js computeFxReactor)
  fxr(d) { const r = (fxrCache[d] ||= computeFxReactor(RX.AUS, RX.USA, d, 'AUS')); if (!r.ok) throw new Error('reactor ' + d + ': ' + r.reason); return r; },
  // another fitted country's reactor (JPN: the 避险货币 next to the AUD), and the 1-year fit itself (src/data/fx-fit.js)
  fxrOf(iso, d) { if (iso === 'AUS') return D.fxr(d); const k = iso + ':' + d, r = (fxrCache[k] ||= computeFxReactor(RX[iso], RX.USA, d, iso)); if (!r.ok) throw new Error('reactor ' + k + ': ' + r.reason); return r; },
  fit: FX_FIT,
  usd(d) { const u = usdIndexAt(d); if (u.chg == null) throw new Error('no USD index ' + d); return u; },
  ore(d) { const i = USD_INDEX.dates.indexOf(d), v = USD_INDEX.ironOre[i]; if (i < 0 || v == null) throw new Error('no iron ore ' + d); return v; },
  // an engine getter (src/ui/lessons-town.js evalGet) on that country's sim, history mode, all rules on
  sim(iso, get, from, until = from) { return evalGet(Q[iso], { id: 'fxchk-' + iso, rulesOn: 'all', mode: 'history', country: iso }, { get }, { from, until }); },
};
const FMT = {
  int: v => (Number.isInteger(v) ? String(v) : 'non-int ' + v), n0: v => String(Math.round(v)), n1: v => v.toFixed(1), n2: v => v.toFixed(2),
  pct0: v => (v * 100).toFixed(0), pct1: v => (v * 100).toFixed(1), pp1: v => (v * 100).toFixed(1), x1: v => v.toFixed(1),
};

/* ---------- 1. data ---------- */
section('1. data: fx-data.js vs the raw csvs, spec vs the research handover');
JPY_ANNUAL.years.forEach((y, i) => ok(Math.abs(JPY_ANNUAL.jpyPerUsd[i] - +D.jpy(y).toFixed(2)) < 1e-9, `JPY ${y} = ${JPY_ANNUAL.jpyPerUsd[i]} (csv ${D.jpy(y).toFixed(2)})`));
UK_MONTHLY.months.forEach((m, i) => {
  ok(UK_MONTHLY.usdPerGbp[i] === D.uk('usdPerGbp', m), `GBP ${m} = ${UK_MONTHLY.usdPerGbp[i]}`);
  ok(Math.abs(UK_MONTHLY.gilt10y[i] - D.uk('gilt10y', m)) < 5e-5, `gilt ${m} = ${UK_MONTHLY.gilt10y[i]}`);
});
ok(UK_MONTHLY.months.length === UK_MONTHLY.usdPerGbp.length && UK_MONTHLY.months.length === UK_MONTHLY.gilt10y.length, 'UK arrays aligned');
const HO = resolve(ROOT, '../dalio_432/closeout/handover_macro.md');
if (existsSync(HO)) {
  const h = readFileSync(HO, 'utf8');
  const sec = h.slice(h.indexOf('4.2 汇率公式'), h.indexOf('4.3'));
  for (const s of ['1 年 0.05', '5 年 0.22', '20 年 0.75', '40 年 0.86', '0.32', '17 国', '1973–2020', 'Δs ≈ 1.0·(π−π*) − 0.6·(i−i*) − 0.8·(g−g*) − k·ΔToT + RP', '约用 0.3',
    '基准约 6.0，区间 5.2–7.0', '基准约 4.0，区间 3.4–4.6', '美元/人民币约 6.71', '澳元/人民币约 4.65', '经常账户几乎没有作用'])
    ok(sec.includes(s), 'handover §4.2 says: ' + s);
  const v = FX_SPEC;
  ok(v.r2.find(x => x.h === 1).r2 === 0.05 && v.r2.find(x => x.h === 5).r2 === 0.22 && v.r2.find(x => x.h === 20).r2 === 0.75 && v.r2.find(x => x.h === 40).r2 === 0.86, 'FX_SPEC.r2 = handover');
  ok(v.scen.usdcny.spot === 6.71 && v.scen.usdcny.mid === 6.0 && v.scen.usdcny.lo === 5.2 && v.scen.usdcny.hi === 7.0, 'FX_SPEC usdcny = handover');
  ok(v.scen.audcny.spot === 4.65 && v.scen.audcny.mid === 4.0 && v.scen.audcny.lo === 3.4 && v.scen.audcny.hi === 4.6, 'FX_SPEC audcny = handover');
  ok(v.rule.infl === 1.0 && v.rule.rate === 0.6 && v.rule.prod === 0.8 && v.catchUpG === 0.3 && v.r2Full5y === 0.32, 'FX_SPEC rule/catch-up/R² full = handover');
} else console.log('  (handover not found, spec cross-check skipped)');
// numbers only the approved spec gives (2y/10y R², fitted coefficients, AUD/CNY references)
ok(FX_SPEC.r2.find(x => x.h === 2).r2 === 0.10 && FX_SPEC.r2.find(x => x.h === 10).r2 === 0.23, 'R² 2y 0.10, 10y 0.23 (spec)');
ok(FX_SPEC.fit5y.infl === 1.46 && FX_SPEC.fit5y.rate === -0.62 && FX_SPEC.fit5y.prod === -0.82 && FX_SPEC.fit5y.ca === 0, 'fitted 5y coefficients (spec)');
ok(JSON.stringify(FX_SPEC.audcnyRef.map(r => r.v)) === '[6,6.7,4.65]', 'AUD/CNY references 6.0 / 6.7 / 4.65 (spec)');
ok(FX_FORCES.map(f => f.key).join() === 'infl,rate,prod,tot,conf', 'five forces in formula order');

/* ---------- 2. shape ---------- */
section('2. lesson shape');
const L = LESSON_FX, S = L.steps;
ok(L.id === 'fx' && L.kind === 'fx' && L.label === '第 6 课' && L.title && L.oneLine && L.available === true, 'id fx, kind fx, label 第 6 课, title/oneLine, available');
ok(S.length === 7 && S[0].type === 'intro' && S.slice(1).every(s => s.type === 'reveal'), '7 steps: intro + 6 reveal');
const TYPES = ['intro', 'reveal'];
const PANEL_OK = id => FXL.FX_PANELS.includes(id) || id === 'fx-reactor';
const drillsOf = s => (Array.isArray(s.drills) ? s.drills : []);
S.forEach((s, i) => {
  ok(TYPES.includes(s.type) && s.title && Array.isArray(s.text) && s.text.length >= 2, `step ${i} has type/title/text`);
  if (s.panel) ok(PANEL_OK(s.panel.id), `step ${i} panel ${s.panel.id} exists`);
  if (i >= 1) ok(s.title.startsWith(`第 ${i} 步`), `step ${i} title numbered: ${s.title}`);
  ok(/^\*\*结论：/.test(s.text[0]), `step ${i} opens with the conclusion`);
  drillsOf(s).forEach((d, k) => ok(d.label && d.panel && FXL.FX_PANELS.includes(d.panel.id) && Array.isArray(d.text) && d.text.length >= 2 && /^\*\*/.test(d.text[0]), `step ${i} drill ${k + 1} (${d.label}): fx-lab panel ${d.panel && d.panel.id}, text opens with the conclusion`));
  if (s.panel && s.panel.id === 'fx-reactor') {
    const ds = [s.panel.date, ...(s.panel.dates || [])];
    ok(s.panel.iso === 'AUS' && ds.every(d => { try { return D.fxr(d).ok; } catch (e) { return false; } }), `step ${i} reactor: AUS, every date has a reactor (${ds.join(' ')})`);
  }
});
{
  const intro = S[0].text.find(t => /^下面分 \d+ 步/.test(t)), n = intro ? +intro.match(/\d+/)[0] : 0;
  const items = intro ? intro.replace(/^下面分 \d+ 步：/, '').replace(/。$/, '').split('→').map(x => x.trim()) : [];
  ok(n === S.length - 1 && items.length === n, `intro: 下面分 ${n} 步 lists ${items.length} items`);
}
ok(S.map(s => (s.panel ? s.panel.id : '-')).join() === '-,fx-reactor,fx-reactor,-,-,fx-reactor,fx-calc', 'panel per step: (diagram) reactor reactor (map) (map) reactor calc');
ok(S[1].panel.date === '2025Q4' && !S[1].panel.forces && S[2].panel.forces === true, 'step 1: the reactor (AUS, 2025Q4); step 2: the same with the five forces open');
ok(drillsOf(S[2]).map(d => d.panel.id).join() === 'fx-anchor,fx-pipe,fx-prod,fx-tot,fx-conf', 'step 2 drill-downs: the five forces in formula order (anchor pipe prod tot conf)');
ok((S[5].panel.dates || []).join() === '2003Q4,2008Q4,2011Q2,2025Q4' && drillsOf(S[5]).map(d => d.panel.id).join() === 'fx-pipe,fx-tot', 'step 5 (AUD case): reactor at 2003 / 2008 / 2011 / 2025, drill-downs pipe + tot');
ok(['fx-anchor', 'fx-pipe', 'fx-prod', 'fx-tot', 'fx-conf', 'fx-calc'].every(id => S.some(s => (s.panel && s.panel.id === id) || drillsOf(s).some(d => d.panel.id === id))), 'every fx-lab panel except fx-frame is used (as a step panel or a drill-down)');
ok(S[3].map && S[3].map.open === true && S[3].map.select === 'AUS' && !S[3].panel, 'step 3 (trade pipes) opens the world map on Australia (no panel)');
ok(S[4].map && S[4].map.open === true && S[4].map.select === 'USA' && !S[4].panel, 'step 4 (reserve currency) opens the world map on the USA (no panel)');
ok(S.every((s, i) => i === 3 || i === 4 || !s.map || s.map.open === false), 'only steps 3 and 4 open the map');
ok(S[3].text.join('').includes('贸易差额') && S[3].text.join('').includes('约等于 0') && FX_SPEC.fit5y.ca === 0, 'step 3: the trade balance barely moves FX (JST 5y current-account coefficient ≈ 0)');
ok(S[6].panel.preset === 'usdcny' && S[6].next === 'm5', 'calculator step: preset usdcny, next = m5 (第 7 课, course v3)');
ok(S[6].text[S[6].text.length - 1].includes('八个视角'), 'last line points to the next lesson (同一个季度，八个视角)');
ok(S[6].text.some(t => t.includes('粗算') && t.includes('R²')), 'calculator says plainly it is a rough guide with low R²');
ok(drillsOf(S[2])[0].text.join('').includes('漏水'), 'anchor drill: water analogy (reservoirs leaking)');
{
  const e = S[6].ending, Qs = ['水的问题还是河道的问题？', '环上哪一步？', '谁赢谁输、钱放哪？'];
  ok(e && ['q1', 'q2', 'q3'].every((k, j) => typeof e[k] === 'string' && e[k].startsWith(Qs[j]) && e[k].length > Qs[j].length + 8), 'last step: the 三问 ending (q1 q2 q3, each starts with its question)');
  ok(S.slice(0, -1).every(s => !s.ending), 'only the last step has the ending');
}

/* ---------- 3. numbers ---------- */
section('3. every typed number recomputes from the data or the spec');
const ALLOW = [/\*\*/g, /(?<![\d.])(19|20)\d{2}Q[1-4]/g, /(?<![\d.])(19|20)\d{2}(?![\d.])/g, /\d{1,2}\s*月/g, /第\s*\d+\s*[步课]/g, /分\s*\d+\s*步/g, /\bB[12]\b/g];
const tokens = t => { let s = t; for (const r of ALLOW) s = s.replace(r, ' '); return s.match(/\d+(?:\.\d+)?/g) || []; };
// one text unit = a step (title + text + ending) or a drill-down (label + text); a drill object shared by two steps is checked once
const units = [], seenDrill = new Set();
S.forEach((s, i) => {
  units.push({ w: `step ${i}`, all: [s.title, ...s.text, ...(s.ending ? [s.ending.q1, s.ending.q2, s.ending.q3] : [])].join('\n'), nums: s.nums, facts: s.facts });
  drillsOf(s).forEach(d => { if (seenDrill.has(d)) return; seenDrill.add(d); units.push({ w: `step ${i} drill 「${d.label}」`, all: [d.label, ...d.text].join('\n'), nums: d.nums, facts: d.facts }); });
});
let nNums = 0, nFacts = 0;
for (const u of units) {
  const listed = new Set((u.nums || []).map(n => n.t));
  for (const tk of tokens(u.all)) ok(listed.has(tk), `${u.w}: typed number ${tk} is listed in nums`);
  for (const n of u.nums || []) {
    let v, got;
    try { v = n.f(D); got = FMT[n.fmt](v); } catch (e) { got = 'ERROR ' + e.message; }
    ok(got === n.t, `${u.w}: ${n.t} = ${got} (${n.fmt}${typeof v === 'number' ? ', raw ' + +v.toFixed(5) : ''})`);
    ok(tokens(u.all).includes(n.t), `${u.w}: nums ${n.t} appears in the text`);
    nNums++;
  }
  for (const c of u.facts || []) { let r = false; try { r = !!c.f(D); } catch (e) { r = false; console.log('  error', e.message); } ok(r, `${u.w} fact: ${c.note}`); nFacts++; }
}
console.log(`  numbers checked: ${nNums}, facts: ${nFacts} (${units.length} text units: ${S.length} steps + ${units.length - S.length} drill-downs)`);

/* ---------- 4. words ---------- */
section('4. words');
const lessonText = JSON.stringify(L, (k, v) => (typeof v === 'function' ? undefined : v));
const panelCode = readFileSync(resolve(ROOT, 'src/ui/fx-lab.js'), 'utf8') + readFileSync(resolve(ROOT, 'src/data/fx-data.js'), 'utf8');
ok(!/同比|环比/.test(lessonText + panelCode), 'no 同比/环比 anywhere (lesson, panels, data)');

/* ---------- 5. calculator ---------- */
section('5. calculator');
for (const [k, p] of Object.entries(FXL.CALC_PRESETS)) {
  const r = FXL.fxCalc(p, p.def, true);
  ok(Math.abs(r.rate - p.mid) <= 0.05 && r.rate >= p.lo && r.rate <= p.hi, `${k}: default inputs land on the base ${p.mid} (got ${r.rate.toFixed(3)}, ${r.perYear.toFixed(2)}%/yr)`);
  const sum = Object.values(r.parts).reduce((a, b) => a + b, 0);
  ok(Math.abs(sum - r.perYear) < 1e-12, `${k}: parts add up`);
  ok(Math.abs(r.parts.prod + 0.8 * 0.3 * p.def.prod) < 1e-12, `${k}: g term scaled by 0.3 (catch-up)`);
  const hot = FXL.fxCalc(p, { ...p.def, infl: p.def.infl + 1 }, true);
  ok(hot.rate > r.rate, `${k}: more home inflation -> weaker CNY (bigger number)`);
  const hi = FXL.fxCalc(p, { ...p.def, rate: p.def.rate + 1 }, true);
  ok(hi.rate < r.rate, `${k}: higher home rate -> stronger CNY`);
  const t = FXL.todayReadings(p.peer);
  ok(Number.isFinite(t.infl) && Number.isFinite(t.rate), `${k}: today's readings ${t.infl.toFixed(2)} / ${t.rate.toFixed(2)} pts`);
}
for (let y = 2001; y <= 2025; y++) ok(Math.abs(FXL.audcnyYear(y) - D.audcny(y)) < 1e-12, `panel AUD/CNY ${y} = checker`);

/* ---------- 6. browser ---------- */
if (!process.argv.includes('--no-browser')) await browser();
console.log(`\n${fails ? 'FAILED' : 'ALL OK'}: ${oks} ok, ${fails} fail`);
process.exit(fails ? 1 : 0);

async function browser() {
  section('6. headless Edge (tools/fx-lab-demo.html)');
  const EDGE = 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe';
  const port = 9481, BASE = process.env.BASE || 'http://127.0.0.1:8281/';
  try { await fetch(BASE + 'tools/fx-lab-demo.html'); } catch (e) { ok(false, 'server not reachable at ' + BASE + ' (python -m http.server 8281)'); return; }
  const prof = resolve((await import('node:os')).tmpdir(), 'fx-lesson-edge-profile');
  const proc = spawn(EDGE, ['--headless=new', '--disable-gpu', '--hide-scrollbars', `--remote-debugging-port=${port}`, `--user-data-dir=${prof}`, '--window-size=1180,820', 'about:blank'], { stdio: 'ignore' });
  const sleep = ms => new Promise(r => setTimeout(r, ms));
  const errors = [];
  try {
    let ver = null;
    for (let i = 0; i < 60 && !ver; i++) { try { ver = await (await fetch(`http://127.0.0.1:${port}/json/version`)).json(); } catch (e) { await sleep(250); } }
    const tabs = async () => (await (await fetch(`http://127.0.0.1:${port}/json`)).json()).filter(x => x.type === 'page');
    let tab = null; for (let i = 0; i < 40 && !tab; i++) { tab = (await tabs())[0]; if (!tab) await sleep(150); }
    const ws = new WebSocket(tab.webSocketDebuggerUrl);
    await new Promise((res, rej) => { ws.onopen = res; ws.onerror = rej; });
    let id = 0; const pending = new Map();
    ws.onmessage = m => {
      const d = JSON.parse(m.data);
      if (d.id && pending.has(d.id)) { pending.get(d.id)(d); pending.delete(d.id); }
      else if (d.method === 'Runtime.exceptionThrown') errors.push(d.params.exceptionDetails.text + ' ' + (d.params.exceptionDetails.exception?.description || ''));
      else if (d.method === 'Runtime.consoleAPICalled' && d.params.type === 'error') errors.push('console.error ' + d.params.args.map(a => a.value || a.description).join(' '));
      else if (d.method === 'Log.entryAdded' && d.params.entry.level === 'error') errors.push('log ' + d.params.entry.text + ' ' + (d.params.entry.url || ''));
    };
    const send = (method, params = {}) => new Promise(res => { const i = ++id; pending.set(i, res); ws.send(JSON.stringify({ id: i, method, params })); });
    const ev = async expr => { const r = await send('Runtime.evaluate', { expression: expr, awaitPromise: true, returnByValue: true }); if (r.result.exceptionDetails) throw new Error(r.result.exceptionDetails.exception?.description || 'eval error'); return r.result.result.value; };
    await send('Runtime.enable'); await send('Page.enable'); await send('Log.enable');
    const viewport = (w, h) => send('Emulation.setDeviceMetricsOverride', { width: w, height: h, deviceScaleFactor: 1, mobile: w < 500 });
    const go = async q => { await send('Page.navigate', { url: BASE + 'tools/fx-lab-demo.html?' + q }); for (let i = 0; i < 40; i++) { await sleep(150); if (await ev('window.__done === true').catch(() => false)) break; } await sleep(250); };
    const shots = process.argv.includes('--shots');
    if (shots) mkdirSync(resolve(ROOT, 'tools/shots'), { recursive: true });
    const saved = [];
    for (const [dev, w, h] of [['pad', 1180, 820], ['phone', 390, 844]]) {
      await viewport(w, h);
      for (const pid of FXL.FX_PANELS) {
        const e0 = errors.length;
        await go(`panel=${pid}${pid === 'fx-calc' ? '&preset=usdcny' : ''}`);
        const st = await ev(`(()=>{const r=document.querySelector('.fxp'); if(!r) return null; const svgs=[...r.querySelectorAll('svg')];
          return { mounted: window.__mounted, id: r.dataset.panel, svgs: svgs.length, drawn: svgs.every(s => s.querySelector('path,rect,circle,line')),
            over: r.scrollWidth - r.clientWidth, wide: svgs.every(s => s.getBoundingClientRect().right <= r.getBoundingClientRect().right + 1),
            fs: Math.min(...[...r.querySelectorAll('svg text')].map(t => parseFloat(getComputedStyle(t).fontSize))) } })()`);
        ok(st && st.mounted && st.id === pid, `${dev} ${pid}: mounted`);
        ok(st && st.svgs >= 1 && st.drawn, `${dev} ${pid}: ${st && st.svgs} chart(s) drawn`);
        ok(st && st.over <= 1 && st.wide, `${dev} ${pid}: no sideways overflow (${st && st.over}px)`);
        ok(st && st.fs >= 11, `${dev} ${pid}: chart text >= 11px (${st && st.fs})`);
        if (['fx-pipe', 'fx-prod', 'fx-tot', 'fx-conf', 'fx-anchor'].includes(pid)) {
          const tip = await ev(`(()=>{const s=document.querySelector('.fxp ${pid === 'fx-anchor' ? '.fxp-bar' : '.fxp-chart svg'}'); const b=s.getBoundingClientRect();
            s.dispatchEvent(new PointerEvent('pointermove',{bubbles:true,clientX:b.left+b.width*0.6,clientY:b.top+b.height*0.5,pointerType:'mouse'}));
            const t=document.querySelector('.fxp-tip'); return t && !t.hidden ? t.textContent : ''})()`);
          ok(tip.length > 4, `${dev} ${pid}: hover tooltip: ${tip.slice(0, 50)}`);
          await ev(`(()=>{const s=document.querySelector('.fxp ${pid === 'fx-anchor' ? '.fxp-bar' : '.fxp-chart svg'}'); s.dispatchEvent(new PointerEvent('pointerleave',{bubbles:true,pointerType:'mouse'})); return 1})()`);
        }
        if (pid === 'fx-calc') {
          const r0 = await ev(`document.querySelector('[data-o="rate"]').textContent`);
          ok(r0 === FXL.fxCalc(FXL.CALC_PRESETS.usdcny, FXL.CALC_PRESETS.usdcny.def).rate.toFixed(2), `${dev} calc shows ${r0}`);
          const r1 = await ev(`(()=>{const i=document.querySelector('input[data-s="infl"]'); i.value=2; i.dispatchEvent(new Event('input',{bubbles:true})); return document.querySelector('[data-o="rate"]').textContent})()`);
          ok(+r1 > +r0, `${dev} calc: inflation slider up -> weaker CNY (${r0} -> ${r1})`);
          const r2 = await ev(`(()=>{document.querySelector('[data-preset="audcny"]').click(); return [document.querySelector('[data-o="rate"]').textContent, document.querySelector('.fxp-big').textContent]})()`);
          ok(Math.abs(+r2[0] - FX_SPEC.scen.audcny.mid) <= 0.05 && r2[1].includes('澳元'), `${dev} calc: preset AUD/CNY -> ${r2[0]}`);
          const r3 = await ev(`(()=>{const c=document.querySelector('[data-catch]'); c.checked=false; c.dispatchEvent(new Event('change',{bubbles:true})); return document.querySelector('[data-o="rate"]').textContent})()`);
          ok(+r3 < +r2[0], `${dev} calc: without the catch-up scaling g pushes CNY stronger (${r2[0]} -> ${r3})`);
          await go('panel=fx-calc&preset=usdcny');
        }
        if (shots) {
          const f = resolve(ROOT, `tools/shots/${pid}-${dev}.png`);
          const r = await send('Page.captureScreenshot', { format: 'png' }); writeFileSync(f, Buffer.from(r.result.data, 'base64')); saved.push(f);
          if (pid === 'fx-calc') { await ev(`document.querySelector('[data-preset="audcny"]').click()`); await sleep(100); const f2 = resolve(ROOT, `tools/shots/fx-calc-audcny-${dev}.png`); const r2 = await send('Page.captureScreenshot', { format: 'png' }); writeFileSync(f2, Buffer.from(r2.result.data, 'base64')); saved.push(f2); }
        }
        await ev('window.__fx.unmountFxPanel()');
        const left = await ev(`({ n: document.querySelectorAll('.fxp').length, host: document.getElementById('host').children.length })`);
        ok(left.n === 0 && left.host === 0, `${dev} ${pid}: unmount leaves the host empty`);
        ok(errors.length === e0, `${dev} ${pid}: no JS errors` + (errors.length > e0 ? ': ' + errors.slice(e0).join(' | ') : ''));
      }
      // walk the lesson steps in one page (mount -> replace -> unmount), and a remount after unmount
      const e1 = errors.length;
      await go('step=0');
      // every step, then each of its drill-downs (the reactor steps mount no fx-lab panel: the reactor is checked in the app by check_d_lessons)
      const walk = await ev(`(()=>{const out=[], S=window.__fx.LESSON_FX.steps, cnt=()=>document.querySelectorAll('.fxp').length + ':' + (document.querySelector('.fxp')?.dataset.panel||'-');
        for (let i=0;i<S.length;i++){ window.__fx.show(i); out.push(cnt()); for (const d of (S[i].drills||[])) { window.__fx.show(i, d.panel); out.push(cnt()); } }
        window.__fx.unmountFxPanel(); window.__fx.unmountFxPanel(); out.push(document.querySelectorAll('.fxp').length); return out.join(',')})()`);
      const want = S.flatMap(s => [s.panel && FXL.FX_PANELS.includes(s.panel.id) ? '1:' + s.panel.id : '0:-', ...drillsOf(s).map(d => '1:' + d.panel.id)]).concat('0').join();
      ok(walk === want, `${dev} lesson walk (steps + drill-downs): one fx-lab panel at a time, reactor/map steps none, double unmount safe (${walk})`);
      const bad = await ev(`window.__fx.mountFxPanel(document.getElementById('host'), { id: 'nope' }) === null && document.querySelectorAll('.fxp').length === 0`);
      ok(bad, `${dev} unknown panel id -> null, nothing mounted`);
      // resize redraw: the chart follows the host width
      await ev(`document.getElementById('host').style.width=''`);
      await ev(`window.__fx.show(2, { id: 'fx-pipe' })`);
      const w0 = await ev(`document.querySelector('.fxp-chart svg').getAttribute('width')`);
      await ev(`document.getElementById('host').style.width='300px'`); await sleep(300);
      const w1 = await ev(`document.querySelector('.fxp-chart svg').getAttribute('width')`);
      ok(+w1 < +w0, `${dev} chart redraws on resize (${w0} -> ${w1})`);
      ok(errors.length === e1, `${dev} lesson walk: no JS errors` + (errors.length > e1 ? ': ' + errors.slice(e1).join(' | ') : ''));
      // dark theme still renders
      const e2 = errors.length;
      await go('panel=fx-tot&theme=dark');
      ok(await ev(`getComputedStyle(document.querySelector('.fxp')).backgroundColor !== 'rgb(255, 255, 255)'`), `${dev} dark theme uses the dark surface`);
      if (shots && dev === 'pad') { const f = resolve(ROOT, 'tools/shots/fx-tot-pad-dark.png'); const r = await send('Page.captureScreenshot', { format: 'png' }); writeFileSync(f, Buffer.from(r.result.data, 'base64')); saved.push(f); }
      ok(errors.length === e2, `${dev} dark: no JS errors`);
    }
    if (saved.length) console.log('  screenshots:\n   ' + saved.join('\n   '));
    ws.close();
  } finally { proc.kill(); }
}
