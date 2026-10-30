// node tools/check_lesson_now.mjs [--no-browser] [--shots] [--verbose]     (BASE=http://localhost:8883/ by default: serve the repo first,
//                                                                          e.g. python -m http.server 8883)
// Checks the capstone 「第 9 课：现在在哪」 (src/data/lesson-now.js) and its panels (src/ui/now-panel.js):
//  1. structure  ≤ 7 steps, intro 「下面分 N 步」 = N, every step mounts a now-* panel, concepts exist, the last step has the 三问 ending and
//                「这是读图，不是预测」; main line L9 (COURSE / LESSONS / LESSON_ORDER, inv → now); panels dispatched by src/ui/lessons.js
//                (block 「lesson now (C3)」)
//  2. wording    no 同比 / 环比 / 预报 in the lesson (filled), lesson-now.js, now-panel.js, now-panel.css
//  3. numbers    every {placeholder} is recomputed HERE from realSnapshot (own code, own formats) and equals the lesson's; the private debt
//                ratio also equals the raw BIS series; every digit left in the texts is a listed constant (no typed data number)
//  4. facts      every non-numeric claim holds on today's data
//  5. browser    headless Edge (CDP) at 390×844 and 1024×768: ?lesson=now opens directly, every step mounts exactly one now-* panel (the 闸 step
//                also the FX reactor), card + panel text carry the recomputed numbers, no 「—」 / unfilled placeholder, no horizontal scroll,
//                the last step shows the 三问 + 「这是读图，不是预测」, exit unmounts everything, the menu lists the lesson, no JS errors.
//                --shots writes tools/shots/c3/now-*.png
// Exit code 1 on any FAIL.
import { readFileSync, mkdirSync, writeFileSync } from 'node:fs';
import { spawn } from 'node:child_process';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { realSnapshot, realDates, realLastDate, realData } from '../src/data/real/real-snapshot.js';
import { FX_FIT } from '../src/data/fx-fit.js';
import { groundwaterDepth } from '../src/ui/flow.js';
import { countryParams } from '../src/data/country-params.js';
import { LESSON_NOW, NOW_NUMS, NOW_TRUTH, bindNowData, nowValue, nowText, nowBound, nowFacts } from '../src/data/lesson-now.js';
import { LESSONS, COURSE } from '../src/data/lessons.js';
import { LESSON_ORDER } from '../src/data/layers.js';
import { CONCEPTS } from '../src/data/concepts.js';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const verbose = process.argv.includes('--verbose');
let fails = 0, oks = 0;
const ok = (c, m) => { if (c) { oks++; if (verbose) console.log('ok   ' + m); } else { fails++; console.log('FAIL ' + m); } };
const src = f => readFileSync(resolve(ROOT, f), 'utf8');
const arr = x => (x == null ? [] : Array.isArray(x) ? x : [x]);
const L = LESSON_NOW, steps = L.steps;

/* ---------- 1. structure ---------- */
const PANELS = ['now-map', 'now-river', 'now-ground', 'now-lake', 'now-ruler', 'now-gate', 'now-sum'];
ok(L.id === 'now' && L.label === '第 9 课' && L.title === '现在在哪' && L.available === true, 'lesson id now, 第 9 课 · 现在在哪');
ok(steps.length >= 3 && steps.length <= 7, `≤ 7 steps (${steps.length})`);
ok(!nowBound() && arr(steps[1].text).join('').includes('…') && !/\d\.\d%/.test(arr(steps[1].text).join('')), 'before the real data is bound the texts show 「…」, never a typed number');
bindNowData({ realSnapshot, realDates, realLastDate, groundwaterDepth, FX_FIT });
{ const m = /下面分 (\d+) 步/.exec(arr(steps[0].text).join('')); ok(m && +m[1] === steps.length - 1, `intro says 下面分 ${m && m[1]} 步 = ${steps.length - 1}`); }
steps.forEach((st, i) => {
  ok(st.panel && PANELS.includes(st.panel.id), `step ${i + 1} has a now-* panel (${st.panel && st.panel.id})`);
  for (const c of arr(st.concept)) ok(!!CONCEPTS[c], `step ${i + 1} concept ${c} exists`);
  ok(i === 0 || st.title.startsWith(`第 ${i} 步`), `step ${i + 1} title numbered: ${st.title}`);
});
const last = steps[steps.length - 1];
ok(last.ending && ['水的问题还是河道的问题？', '环上哪一步？', '谁赢谁输、钱放哪？'].every((q, k) => String(last.ending['q' + (k + 1)]).startsWith(q)), 'last step: the 三问 ending');
ok(NOW_TRUTH === '这是读图，不是预测' && arr(last.text).join('').includes(NOW_TRUTH) && String(last.ending.q3).includes(NOW_TRUTH), 'last step: 「这是读图，不是预测」 in the text and in 三问 ③');
ok(arr(steps[0].text).join('').includes(NOW_TRUTH), 'intro: 「这是读图，不是预测」');
// main line L9 (2026-10-30): the last lesson of COURSE (part 「你」), last in LESSONS, inv hands over to it; no layer of its own
// (src/data/layers.js LESSON_ORDER ends with 'now', LESSON_LAYER.now = null: it shows every layer)
ok(LESSONS.filter(l => l.id === 'now').length === 1 && LESSONS[LESSONS.length - 1] === L && COURSE.main.length === 9 && COURSE.main[8] === 'now' && !COURSE.legacy.map(String).includes('now'),
  'main line L9: last in LESSONS and in COURSE.main (9 lessons), not under 旧版');
ok(COURSE.parts[COURSE.parts.length - 1].ids.slice(-1)[0] === 'now', 'COURSE: now is the last lesson of the last part');
{ const inv = LESSONS.find(l => l.id === 'inv'); ok(inv && inv.steps[inv.steps.length - 1].next === 'now' && last.next == null, 'inv (L8) hands over to now; now is the end of the line (no next)'); }
ok(LESSON_ORDER.indexOf('now') === LESSON_ORDER.length - 1 && LESSON_ORDER.length === 9, `src/data/layers.js: LESSON_ORDER ends with 'now' (L9) — needs the one-line layers.js change`);
{
  const ui = src('src/ui/lessons.js');
  const blk = /\/\/ --- lesson now \(C3\) ---[\s\S]*?\/\/ --- end lesson now \(C3\) ---/.exec(ui);
  ok(blk && !/TOPIC_LESSONS\.push\(LESSON_NOW\)/.test(ui) && /PANEL_MODS\.now = /.test(blk[0]),
    'src/ui/lessons.js: one marked block registers the panel module; the lesson is no longer a 专题 (no TOPIC_LESSONS.push)');
  ok((ui.match(/(\/\/|\/\*) C3 now/g) || []).length === 3 && /isNowPanel\(spec\) \? 'now'/.test(ui) && /kind === 'now'\) return m\.mountNowPanel/.test(ui) && /pnl\.kind === 'now'\) m\.unmountNowPanel/.test(ui),
    'src/ui/lessons.js: the three tagged dispatch lines (panelKind, mountPanel, dropPanel)');
  ok(/TOPIC_LESSONS = \[LESSON_EXP\]/.test(ui), 'src/ui/lessons.js: TOPIC_LESSONS = [LESSON_EXP] line unchanged (check_lesson_exp reads it)');
}

/* ---------- 2. wording ---------- */
const filled = steps.map(st => [st.title, ...arr(st.text), ...(st.ending ? Object.values(st.ending) : [])].join('\n')).join('\n');
for (const [name, txt] of [['lesson (filled)', filled], ['lesson-now.js', src('src/data/lesson-now.js')], ['now-panel.js', src('src/ui/now-panel.js')], ['now-panel.css', src('assets/css/now-panel.css')]])
  for (const w of ['同比', '环比', '预报']) ok(!txt.includes(w), `${name}: no 「${w}」`);
ok(!/—|…|\{\w+\}/.test(filled), 'every placeholder fills (no 「—」 / 「…」 / {key} left)');

/* ---------- 3. numbers: recomputed here from realSnapshot ---------- */
const num = v => typeof v === 'number' && Number.isFinite(v);
const neg0 = (v, d) => +Math.abs(v).toFixed(d) === 0;
const F = {   // own formats (same spec as the lesson's, written again)
  pct: v => (v < 0 && !neg0(v * 100, 1) ? '−' : '') + Math.abs(v * 100).toFixed(1) + '%',
  pct0: v => Math.abs(v * 100).toFixed(0) + '%',
  tgt: v => String(Math.round(v * 1000) / 10) + '%',
  chg: v => (neg0(v * 100, 1) ? '' : v > 0 ? '+' : '−') + Math.abs(v * 100).toFixed(1) + '%',
  pts: v => (neg0(v * 100, 1) ? '' : v > 0 ? '+' : '−') + Math.abs(v * 100).toFixed(1) + ' 个点',
  x2: v => v.toFixed(2) + ' 倍', n1: v => v.toFixed(1), n2: v => v.toFixed(2),
  q: d => `${d.slice(0, 4)} 年第${['一', '二', '三', '四'][+d[5] - 1]}季度`,
};
const E = {};   // key -> { v, s }
const put = (k, v, f) => { E[k] = { v, s: F[f](v) }; };
const C = {};
for (const iso of ['USA', 'AUS']) {
  const p = iso === 'USA' ? 'u' : 'a', D = realDates(iso), d = realLastDate(iso), t = D.indexOf(d), s = realSnapshot(iso, t);
  const all = D.slice(0, t + 1).map((x, i) => realSnapshot(iso, i));
  const avg = a => a.reduce((x, y) => x + y, 0) / a.length;
  put(`d${iso === 'USA' ? 'U' : 'A'}`, d, 'q');
  put(p + 'Infl', s.macro.inflation, 'pct'); put(p + 'Tgt', countryParams(iso).piTarget, 'tgt');
  put(p + 'U', s.macro.unemployment, 'pct'); put(p + 'Uavg', avg(all.map(x => x.macro.unemployment).filter(num)), 'pct');
  put(p + 'Gap', s.macro.outputGap, 'chg');
  const pv = all.map(x => (num(x.iou.bankTotal) && num(x.macro.gdpNominal) ? x.iou.bankTotal / x.macro.gdpNominal : null));
  let k = t; while (k >= 0 && !num(pv[k])) k--;
  put(p + 'Pvt', pv[k], 'pct0'); put(p + 'PvtAvg', avg(pv.filter(num)), 'pct0'); put(p + 'PvtDate', D[k], 'q');
  ok(Math.abs(pv[k] - realData(iso).series.privateCreditGdp[k]) < 1e-9, `${iso}: 洞 = the BIS private credit / GDP series at ${D[k]} (${pv[k]})`);
  const V = s.lights.valuation;
  put(p + 'House', V.parts.house, 'x2'); put(p + 'Eq', V.parts.equity, 'x2');
  put(p + 'BondR', s.rates.gov10y - s.macro.inflation, 'pts');
  put(p + 'Gold', s.assets.gold.price / realSnapshot(iso, t - 4).assets.gold.price - 1, 'chg');
  put(p + 'Pol', s.rates.policy, 'pct'); put(p + 'Band', s.rates.policy - s.macro.inflation, 'chg');
  ok(Math.abs(s.rates.realPolicy - (s.rates.policy - s.macro.inflation)) < 1e-12 && s.macro.inflationExp === null, `${iso}: band = ▶ − ▼ = rates.realPolicy (inflationExp null in real mode)`);
  if (iso === 'USA') put('uCape', s.assets.equity.pe, 'n1');
  put('vY', V.bands[1].lo, 'n2'); put('vR', V.bands[2].lo, 'n2');
  C[iso] = { s, t, D, b2: all.filter(x => x.cycles.long.fork === 'B2').map(x => x.date), pend: all.filter(x => x.cycles.long.forkPending).length };
  console.log(`${iso} ${d}: ▼ ${E[p + 'Infl'].s} (调度线 ${E[p + 'Tgt'].s}) · 失业 ${E[p + 'U'].s} vs ${E[p + 'Uavg'].s} · 缺口 ${E[p + 'Gap'].s} · 洞 ${E[p + 'Pvt'].s} (${D[k]}) vs ${E[p + 'PvtAvg'].s} · ` +
    `${s.cycles.long.label} fork ${s.cycles.long.fork} pending ${JSON.stringify(s.cycles.long.forkPending)} · 房 ${E[p + 'House'].s} 股 ${E[p + 'Eq'].s} · 债 ${E[p + 'BondR'].s} 金 ${E[p + 'Gold'].s} · ▶ ${E[p + 'Pol'].s} ▶−▼ ${E[p + 'Band'].s} · ${s.cycles.short.label}`);
}
{ // the gate (AUS)
  const D = realDates('AUS'), d = realLastDate('AUS'), t = D.indexOf(d), a = realSnapshot('AUS', t), a4 = realSnapshot('AUS', t - 4);
  let g = 0; for (let k = 0; k < 4; k++) { const x = realSnapshot('AUS', t - k); g += x.rates.policy - realSnapshot('USA', x.date).rates.policy; }
  put('audUsd', 1 / a.border.fxPerUsd, 'n2'); put('audYoY', a4.border.fxPerUsd / a.border.fxPerUsd - 1, 'chg'); put('audFrom', a4.date, 'q');
  put('gap4', g / 4, 'pts'); put('gapMean', FX_FIT.countries.AUS.mean.rate / 100, 'pts'); put('fxrDate', FX_FIT.dates[FX_FIT.dates.length - 1], 'q');
  const push = FX_FIT.countries.AUS.coef.rate * (g / 4 * 100 - FX_FIT.countries.AUS.mean.rate);
  E.pushW = { v: push > 0.05 ? '往强推' : push < -0.05 ? '往弱推' : '几乎不推' }; E.pushW.s = E.pushW.v;
  ok(Math.abs(nowFacts().gate.push - push) < 1e-9, `闸: the push (the reactor's own fit: coef × (gap − normal)) = ${push.toFixed(2)} log points`);
  console.log(`AUS ${d} 闸: 1 澳元 = ${E.audUsd.s} 美元, 比一年前 ${E.audYoY.s}; 利差（四季平均）${E.gap4.s} vs 平常 ${E.gapMean.s} → ${E.pushW.s}; reactor ${FX_FIT.dates[FX_FIT.dates.length - 1]}`);
}
for (const [k, e] of Object.entries(E)) {
  ok(k in NOW_NUMS, `placeholder ${k} exists in NOW_NUMS`);
  const v = nowValue(k);
  ok((typeof e.v === 'number' ? Math.abs(v - e.v) < 1e-12 : v === e.v) && nowText(k) === e.s, `${k}: lesson ${nowText(k)} = realSnapshot ${e.s}`);
}
// every numeric placeholder the texts use is recomputed above (the word keys are checked as facts / words below)
const WORD_KEYS = new Set(['uRiver', 'aRiver', 'uPvtCmp', 'aPvtCmp', 'uHole', 'aHole', 'uPvtNote', 'aPvtNote', 'uLong', 'aLong', 'uLift', 'aLift', 'uB2', 'aB2', 'uShort', 'aShort',
  'uHouseW', 'aHouseW', 'uEqW', 'aEqW', 'uLake', 'aLake', 'uBandW', 'aBandW', 'audMoved', 'riverCon', 'liftCon', 'longCon']);
const rawAll = steps.map(st => [...st.rawText, ...(st.rawEnding ? Object.values(st.rawEnding) : [])].join('\n')).join('\n');
const used = [...new Set([...rawAll.matchAll(/\{(\w+)\}/g)].map(m => m[1]))];
for (const k of used) ok(E[k] || WORD_KEYS.has(k), `text placeholder {${k}} is recomputed or a checked word`);
// word keys: recomputed here
{
  const W = (k, want) => ok(nowText(k) === want, `${k}: 「${nowText(k)}」 = 「${want}」`);
  const u = C.USA.s, a = C.AUS.s;
  W('uLong', u.cycles.long.label); W('aLong', a.cycles.long.label); W('uShort', u.cycles.short.label); W('aShort', a.cycles.short.label);
  W('uB2', C.USA.b2.length ? `${F.q(C.USA.b2[0])}到 ${F.q(C.USA.b2[C.USA.b2.length - 1])}` : '1995 年以来没有');
  W('aB2', C.AUS.b2.length ? `${F.q(C.AUS.b2[0])}到 ${F.q(C.AUS.b2[C.AUS.b2.length - 1])}` : `1995 年以来没跌破过，只有 ${C.AUS.pend} 季「待确认」`);
  const lv = v => (v >= 1.35 ? '贵' : v >= 1.15 ? '偏贵' : '不贵');
  W('uHouseW', lv(u.lights.valuation.parts.house)); W('aHouseW', lv(a.lights.valuation.parts.house)); W('uEqW', lv(u.lights.valuation.parts.equity)); W('aEqW', lv(a.lights.valuation.parts.equity));
  W('uBandW', (u.rates.realPolicy >= 0 ? '蓝' : '红') + (Math.abs(u.rates.realPolicy) < 0.005 ? '，贴着 0' : ''));
  W('aBandW', (a.rates.realPolicy >= 0 ? '蓝' : '红') + (Math.abs(a.rates.realPolicy) < 0.005 ? '，贴着 0' : ''));
  W('audMoved', E.audYoY.v > 0.005 ? '变强' : E.audYoY.v < -0.005 ? '变弱' : '基本没变');
  for (const iso of ['USA', 'AUS']) {
    const L2 = C[iso].s.cycles.long, p = iso === 'USA' ? 'u' : 'a';
    const want = L2.fork === 'B2' || L2.stage === 5 ? '已跌破吸程线（B2）' : L2.forkPending ? null : L2.forkEvidence ? null : '没跌破吸程线；这一段长周期不读 B2 证据（B2 只在 ① ② 段判断），B2 没确认，也不在待确认';
    if (want) W(p + 'Lift', want);
    else ok(nowText(p + 'Lift').includes(L2.forkPending ? 'B2 待确认' : '离吸程线还有'), `${p}Lift reads the B2 evidence (${nowText(p + 'Lift')})`);
    ok(groundwaterDepth(L2) === (L2.forkEvidence ? groundwaterDepth(L2) : null), `${iso}: 吸程线 distance = flow.js groundwaterDepth (the diagram's own reading; null when the stage reads no B2 evidence)`);
  }
}
// digits typed in the texts: only these constants (each with its reason)
{
  const ALLOWED = new Map([
    ['8', `前 8 课 = the main-line lessons before now (${COURSE.main.indexOf('now')})`], [String(steps.length - 1), '下面分 N 步'], ['2022', `保留样本 from ${realData('USA').reservedFrom}`],
    ['1995', `the real grid starts ${realDates('USA')[0]}`], ['1996–2021', `FX_FIT normal window ${FX_FIT.fit?.join?.('–') || ''}`], ['10', '10 年国债'], ['1', '1 澳元 / 1 倍'], ['0', '贴着 0'], ['6', '第 6 课 (汇率)'],
  ]);
  ok(realData('USA').reservedFrom.startsWith('2022') && realDates('USA')[0].startsWith('1995') && COURSE.main.indexOf('now') === 8 && COURSE.main[5] === 'fx', 'the allowed constants match the data (2022 保留样本, 1995 grid start, 前 8 课 = the lessons before now, 第 6 课 = fx)');
  for (const st of steps) {
    const bare = [...st.rawText, ...(st.rawEnding ? Object.values(st.rawEnding) : [])].join(' ').replace(/\{\w+\}/g, '').replace(/B[12]/g, '');
    const nums = bare.match(/\d{4}–\d{4}|\d+(?:\.\d+)?/g) || [];
    const bad = nums.filter(n => !ALLOWED.has(n));
    ok(!bad.length, `${st.title}: no typed data number in the text (${nums.join(' ') || 'none'}${bad.length ? ' — not allowed: ' + bad.join(' ') : ''})`);
  }
}

/* ---------- 4. facts ---------- */
const FX = nowFacts();
steps.forEach((st, i) => { for (const f of st.facts || []) ok(!!f.f(FX), `step ${i + 1} fact: ${f.note}`); });

/* ---------- 5. browser ---------- */
// numbers each panel must show (the same recomputed strings)
const PANEL_KEYS = {
  'now-map': [], 'now-river': ['uInfl', 'aInfl', 'uTgt', 'aTgt', 'uU', 'aU', 'uUavg', 'aUavg', 'uGap', 'aGap'],
  'now-ground': ['uPvt', 'aPvt', 'uPvtAvg', 'aPvtAvg'], 'now-lake': ['uHouse', 'aHouse', 'uEq', 'aEq', 'uCape', 'uBondR', 'aBondR', 'uGold', 'aGold', 'uBand', 'aBand', 'vY', 'vR'],
  'now-ruler': ['uPol', 'aPol', 'uInfl', 'aInfl', 'uBand', 'aBand'], 'now-gate': ['audUsd', 'audYoY', 'gap4', 'gapMean', 'pushW'],
  'now-sum': ['uInfl', 'aInfl', 'uU', 'aU', 'uPvt', 'aPvt', 'uHouse', 'aHouse', 'uEq', 'aEq', 'uBand', 'aBand', 'audYoY'],
};
const SHOT = ['0-map', '1-river', '2-ground', '3-lake', '4-ruler', '5-gate', '6-sum'];
async function browser() {
  const BASE = process.env.BASE || 'http://localhost:8883/';
  try { const r = await fetch(BASE + 'src/data/lesson-now.js'); if (!r.ok) throw new Error(r.status); } catch (e) { ok(false, `server at ${BASE} (serve the repo: python -m http.server 8883) — ${e.message}`); return; }
  const EDGE = 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe', port = 9363;
  const proc = spawn(EDGE, ['--headless=new', '--disable-gpu', '--hide-scrollbars', `--remote-debugging-port=${port}`, '--window-size=1024,768', `--user-data-dir=${resolve(ROOT, 'tools/_edge_now')}`, 'about:blank'], { stdio: 'ignore' });
  const sleep = ms => new Promise(r => setTimeout(r, ms));
  let ws, id = 0; const pending = new Map(), errors = [];
  for (let i = 0; i < 60 && !ws; i++) { try { const t = (await (await fetch(`http://127.0.0.1:${port}/json`)).json()).find(x => x.type === 'page'); if (t) { ws = new WebSocket(t.webSocketDebuggerUrl); await new Promise((res, rej) => { ws.onopen = res; ws.onerror = rej; }); } } catch (e) { ws = null; await sleep(250); } }
  if (!ws) { ok(false, 'headless Edge started'); proc.kill(); return; }
  ws.onmessage = m => { const d = JSON.parse(m.data); if (d.id && pending.has(d.id)) { pending.get(d.id)(d); pending.delete(d.id); } else if (d.method === 'Runtime.exceptionThrown') errors.push(d.params.exceptionDetails.text + ' ' + (d.params.exceptionDetails.exception?.description || '')); else if (d.method === 'Runtime.consoleAPICalled' && d.params.type === 'error') errors.push('console.error ' + d.params.args.map(a => a.value || a.description).join(' ')); else if (d.method === 'Network.loadingFailed' && !/favicon/.test(d.params.errorText) && !/ERR_ABORTED/.test(d.params.errorText)) errors.push('load failed ' + d.params.errorText); else if (d.method === 'Network.responseReceived' && d.params.response.status >= 400 && !/favicon/.test(d.params.response.url)) errors.push(`HTTP ${d.params.response.status} ${d.params.response.url}`); };
  const send = (method, params = {}) => new Promise(res => { const i = ++id; pending.set(i, res); ws.send(JSON.stringify({ id: i, method, params })); });
  const ev = async expr => { const r = await send('Runtime.evaluate', { expression: expr, awaitPromise: true, returnByValue: true }); if (r.result.exceptionDetails) throw new Error(r.result.exceptionDetails.exception?.description || 'eval error'); return r.result.result.value; };
  const waitFor = async (expr, ms = 8000) => { for (let t = 0; t < ms; t += 150) { if (await ev(expr).catch(() => false)) return true; await sleep(150); } return false; };
  await send('Runtime.enable'); await send('Page.enable'); await send('Network.enable');
  const shots = process.argv.includes('--shots'), SHOT_DIR = resolve(ROOT, 'tools/shots/c3'), saved = [];
  if (shots) mkdirSync(SHOT_DIR, { recursive: true });
  for (const [w, h] of [[390, 844], [1024, 768]]) {
    const tag = `${w}×${h}`;
    await send('Emulation.setDeviceMetricsOverride', { width: w, height: h, deviceScaleFactor: w < 500 ? 2 : 1, mobile: w < 500 });
    errors.length = 0;
    await send('Page.navigate', { url: BASE + '?pause=1&lesson=now' });
    ok(await waitFor(`!!document.querySelector('#ls-card .ls-stitle') && !!document.querySelector('#ls-panel .nowp .nowp-map')`, 12000), `${tag}: ?lesson=now opens the lesson directly with its panel`);
    ok((await ev(`document.querySelector('#ls-card .ls-ttl').textContent`)).includes('第 9 课 · 现在在哪'), `${tag}: card title 「第 9 课 · 现在在哪」`);
    for (let i = 0; i < steps.length; i++) {
      if (i > 0) await ev(`document.querySelector('#ls-card [data-act=next]').click()`);
      const want = steps[i].panel.id;
      const up = await waitFor(`(() => { const p = document.querySelectorAll('#ls-panel .nowp'); return p.length === 1 && p[0].dataset.panel === ${JSON.stringify(want)} && !!p[0].querySelector('svg, .nowp-map, .nowp-pool')${want === 'now-gate' ? ` && !!p[0].querySelector('.fxr-box')` : ''}; })()`, 8000);
      ok(up, `${tag} step ${i + 1}: panel ${want} mounted (exactly one)${want === 'now-gate' ? ' + the FX reactor' : ''}`);
      await sleep(300);
      const lay = await ev(`(() => { const d = document.documentElement, p = document.querySelector('#ls-panel'), e = p && p.querySelector('.nowp');
        return { page: d.scrollWidth - d.clientWidth, body: document.body.scrollWidth - window.innerWidth, pnl: e ? e.scrollWidth - e.clientWidth : -1, host: p ? p.scrollWidth - p.clientWidth : -1,
          out: e ? [...e.querySelectorAll('svg, .nowp-c, .nowp-mc, .fxr-box')].some(s => s.getBoundingClientRect().right > p.getBoundingClientRect().right + 1) : true,
          card: document.querySelector('#ls-card .ls-body').textContent, panel: e ? e.textContent : '', fxr: (p.querySelector('.fxr-box') || {}).dataset?.date || null }; })()`);
      ok(lay.page <= 0 && lay.body <= 0 && lay.pnl <= 0 && lay.host <= 0 && !lay.out, `${tag} step ${i + 1}: no horizontal scroll (page ${lay.page}, panel ${lay.pnl}, host ${lay.host}, out ${lay.out})`);
      ok(!/—|…|\{\w+\}/.test(lay.card), `${tag} step ${i + 1}: card text has no 「—」 / 「…」 / unfilled placeholder`);
      const ks = [...new Set([...(steps[i].rawText.join(' ') + ' ' + (steps[i].rawEnding ? Object.values(steps[i].rawEnding).join(' ') : '')).matchAll(/\{(\w+)\}/g)].map(m => m[1]))].filter(k => E[k]);
      const missC = ks.filter(k => !lay.card.includes(E[k].s));
      ok(!missC.length, `${tag} step ${i + 1}: card shows the realSnapshot numbers (${ks.map(k => E[k].s).join(' ')})${missC.length ? ' — missing ' + missC.join(',') : ''}`);
      const pk = PANEL_KEYS[want], missP = pk.filter(k => !lay.panel.includes(E[k].s));
      if (pk.length) ok(!missP.length, `${tag} step ${i + 1}: panel ${want} shows the realSnapshot numbers${missP.length ? ' — missing ' + missP.map(k => k + '=' + E[k].s).join(',') : ''}`);
      ok(!/undefined|NaN|null/.test(lay.panel), `${tag} step ${i + 1}: panel text has no undefined / NaN / null`);
      if (want === 'now-gate') ok(lay.fxr === FX_FIT.dates[FX_FIT.dates.length - 1], `${tag} step ${i + 1}: the FX reactor sits at its last fitted quarter (${lay.fxr})`);
      if (shots) { const r = await send('Page.captureScreenshot', { format: 'png' }); const f = resolve(SHOT_DIR, `now-${SHOT[i] || i}-${w}x${h}.png`); writeFileSync(f, Buffer.from(r.result.data, 'base64')); saved.push(f); }
    }
    const end = await ev(`(() => { const e = document.querySelector('#ls-card .ls-end'); return e ? e.textContent : ''; })()`);
    ok(!!end && end.includes(NOW_TRUTH) && ['水的问题还是河道的问题？', '环上哪一步？', '谁赢谁输、钱放哪？'].every(q => end.includes(q)), `${tag}: last step shows the 三问 block with 「${NOW_TRUTH}」`);
    if (shots) {   // the 三问 block, scrolled into view
      await ev(`(() => { const e = document.querySelector('#ls-card .ls-end'); if (e) e.scrollIntoView({ block: 'start' }); })()`); await sleep(250);
      const r = await send('Page.captureScreenshot', { format: 'png' }); const f = resolve(SHOT_DIR, `now-6-sum-ending-${w}x${h}.png`); writeFileSync(f, Buffer.from(r.result.data, 'base64')); saved.push(f);
    }
    // back one step and forward again: the panel swaps cleanly (never two)
    await ev(`document.querySelector('#ls-card [data-act=prev]').click()`);
    ok(await waitFor(`document.querySelectorAll('#ls-panel .nowp').length === 1 && document.querySelector('#ls-panel .nowp').dataset.panel === 'now-gate'`), `${tag}: 上一步 remounts the previous panel (one at a time)`);
    await ev(`document.querySelector('#ls-card [data-act=next]').click()`);
    ok(await waitFor(`document.querySelectorAll('#ls-panel .nowp').length === 1 && document.querySelector('#ls-panel .nowp').dataset.panel === 'now-sum' && !document.querySelector('.fxr-panel')`), `${tag}: leaving the 闸 step unmounts the FX reactor`);
    await ev(`document.querySelector('#ls-card [data-act=exit]').click()`);
    ok(await waitFor(`!document.querySelector('#ls-panel') && !document.querySelector('.nowp') && !document.querySelector('.fxr-panel') && !document.querySelector('#diagram.ls-pnl-on')`), `${tag}: exit unmounts the panel cleanly`);
    ok(!errors.length, `${tag}: no JS errors ${errors.slice(0, 3).join(' | ')}`);
    // the menu
    errors.length = 0;
    await send('Page.navigate', { url: BASE + '?pause=1&menu=1' });
    ok(await waitFor(`!!document.querySelector('#ls-menu .ls-main .ls-item[data-id="now"]')`), `${tag}: the menu lists the lesson in the main line`);
    const menu = await ev(`(() => ({ main: [...document.querySelectorAll('#ls-menu .ls-main .ls-item')].map(b => b.dataset.id), parts: document.querySelectorAll('#ls-menu h3.ls-sec').length,
      lead: (document.querySelector('#ls-menu .ls-lead') || {}).textContent || '', topic: !!document.querySelector('#ls-menu .ls-topics .ls-item[data-id="now"]'),
      item: (document.querySelector('#ls-menu .ls-main .ls-item[data-id="now"]') || {}).textContent || '', no: ((document.querySelector('#ls-menu .ls-main .ls-item[data-id="now"] .ls-no')) || {}).textContent || '' }))()`);
    ok(menu.main.length === 9 && menu.main[8] === 'now' && menu.parts === 4 && /9 课/.test(menu.lead) && !menu.topic && menu.item.includes('现在在哪') && menu.no === '9',
      `${tag}: menu item 「9 · 现在在哪」 last of the main line (${menu.main.length} lessons, ${menu.parts} parts, 「${menu.lead.slice(0, 18)}」), not under 专题`);
    await ev(`document.querySelector('#ls-menu .ls-main .ls-item[data-id="now"]').click()`);
    ok(await waitFor(`!!document.querySelector('#ls-panel .nowp[data-panel="now-map"]')`), `${tag}: tapping it in the menu starts the lesson`);
    ok(!errors.length, `${tag}: menu, no JS errors ${errors.slice(0, 3).join(' | ')}`);
  }
  if (saved.length) console.log('screenshots:\n  ' + saved.join('\n  '));
  ws.close(); proc.kill();
}
if (!process.argv.includes('--no-browser')) await browser();

console.log(`\ncheck_lesson_now: ${oks} ok, ${fails} FAIL`);
process.exit(fails ? 1 : 0);
