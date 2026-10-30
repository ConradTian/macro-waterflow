// node tools/check_lesson_ai_au.mjs [--no-browser] [--shots] [--verbose]     (BASE=http://localhost:8981/ by default: serve the repo first,
//                                                                            e.g. python -m http.server 8981)
// Checks the 专题 「专题：AI 抗冲击（澳洲家庭）」 (src/data/lesson-ai-au.js) and its card panels (src/ui/ai-au-panel.js):
//  1. structure  11 steps in the order M1..M8, A1, A2, END; titles start with their id; registered in src/ui/lessons.js TOPIC_LESSONS
//                (not in the main line); every step glows parts / pipes that exist in src/data/layers.js; concepts exist; the last step has
//                the 三问 + 「这是用框架演示的样板，不是个人建议」; A1 carries the SITU-AWARE v2 honest line verbatim
//  2. numbers    no ASCII digit in a raw text outside a {placeholder} (whitelist: step ids in titles, B1 / B2, 「第 N 课」); every placeholder is
//                either an AI_NUMS key — recomputed HERE from the raw real-data files with our own code and format, and equal — or an
//                AI_FACTS entry with a value, a source and a date; every facts claim holds
//  3. A2 table   every 信念仓位 option × {平常, 收紧, AI 信用压力} sums to 100 and equals the rule encoded here; default = 60/10/10/10/10;
//                exactly two risk-control buttons; their label; no 「卡点挪了」
//  4. wording    no 同比 / 环比 / 预报 / 卡点挪了 in the lesson (filled), lesson-ai-au.js, ai-au-panel.js, ai-au.css
//  5. browser    headless Edge (CDP), ONE fixed profile tools/_edge_ai (+ --disk-cache-size=1 --no-first-run --no-default-browser-check), closed
//                at the end: ?lesson=ai-au opens directly; every step: title, filled numbers, glow on the diagram, card panel where expected; the
//                A2 buttons produce the right tables; the 三问 block; no horizontal scroll at 390×844 and 1024×768; the 专题 menu lists it;
//                no JS errors. --shots writes tools/shots/ai-au/ai-<step>-<w>x<h>.png for M2, M4, M8, A2
// Prints the peer's quoted figures next to the data (information, not a FAIL). Exit code 1 on any FAIL.
import { readFileSync, mkdirSync, writeFileSync } from 'node:fs';
import { spawn } from 'node:child_process';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { USA_REAL } from '../src/data/real/usa-real.js';
import { AUS_REAL } from '../src/data/real/aus-real.js';
import { JPN_Q } from '../src/data/countries/jpn-quarterly.js';
import { realSnapshot, realLastDate } from '../src/data/real/real-snapshot.js';
import { countryParams } from '../src/data/country-params.js';
import { LESSON_AI_AU, AI_NUMS, AI_FACTS, AI_ALLOC, AI_HONEST, AI_NO_ADVICE, AI_STEP_IDS, aiAllocTable, aiRiskLabel, bindAiData, aiBound, aiText, aiFacts } from '../src/data/lesson-ai-au.js';
import { LESSONS, COURSE } from '../src/data/lessons.js';
import { LAYERS, LESSON_ORDER } from '../src/data/layers.js';
import { CONCEPTS } from '../src/data/concepts.js';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const verbose = process.argv.includes('--verbose');
let fails = 0, oks = 0;
const ok = (c, m) => { if (c) { oks++; if (verbose) console.log('ok   ' + m); } else { fails++; console.log('FAIL ' + m); } };
const src = f => readFileSync(resolve(ROOT, f), 'utf8');
const arr = x => (x == null ? [] : Array.isArray(x) ? x : [x]);
const L = LESSON_AI_AU, steps = L.steps;
const HONEST = '我们用公开数据做的卡点雷达和行业动量，回测里扣掉成本后都没有稳定跑赢大盘：市场比公开数据快。所以卡点只当背景，不当择时信号';
const NO_ADVICE = '这是用框架演示的样板，不是个人建议';
const RISK = n => `风险控制，不是赚钱信号；历史上只有 ${n} 次收紧，证据不足`;
const Q3 = ['水的问题还是河道的问题？', '环上哪一步？', '谁赢谁输、钱放哪？'];
const ORDER = ['M1', 'M2', 'M3', 'M4', 'M5', 'M6', 'M7', 'M8', 'A1', 'A2', 'END'];

/* ---------- 1. structure ---------- */
ok(L.id === 'ai-au' && L.title === '专题：AI 抗冲击（澳洲家庭）' && L.available === true && L.kind === 'topic', 'lesson id ai-au, title 专题：AI 抗冲击（澳洲家庭）');
ok(steps.length === 11 && steps.length <= 11, `11 steps (${steps.length})`);
ok(JSON.stringify(steps.map(s => s.sid)) === JSON.stringify(ORDER) && JSON.stringify(AI_STEP_IDS) === JSON.stringify(ORDER), `step order M1..M8, A1, A2, END (${steps.map(s => s.sid).join(' ')})`);
steps.forEach(s => { if (s.sid !== 'END') ok(s.title.startsWith(s.sid + ' '), `${s.sid}: title starts with its id (${s.title})`); });
ok(!aiBound() && arr(steps[2].text).join('').includes('…'), 'before the data is bound the texts show 「…」, never a typed number');
bindAiData({ USA_REAL, AUS_REAL, JPN_Q, realSnapshot, realLastDate });
{
  const ui = src('src/ui/lessons.js');
  ok(/TOPIC_LESSONS = \[LESSON_EXP, LESSON_AI_AU\]/.test(ui) && /import \{ LESSON_AI_AU \} from '\.\.\/data\/lesson-ai-au\.js'/.test(ui), 'src/ui/lessons.js: TOPIC_LESSONS = [LESSON_EXP, LESSON_AI_AU]');
  ok(/PANEL_MODS\.aiau = /.test(ui) && /aiau: \['ai-k', 'ai-alloc'\]/.test(ui) && /mountAiPanel/.test(ui) && /unmountAiPanel/.test(ui), 'src/ui/lessons.js: panel module ai-au-panel.js registered (card panels ai-k, ai-alloc)');
  ok(!LESSONS.some(l => l.id === 'ai-au') && !COURSE.main.includes('ai-au') && !LESSON_ORDER.includes('ai-au'), 'not in the main line (LESSONS / COURSE / LESSON_ORDER)');
}
const PARTS = new Set(LAYERS.flatMap(l => l.parts || [])), PIPES = new Set(LAYERS.flatMap(l => l.pipes || []));
steps.forEach(s => {
  const g = s.glow || {};
  ok(arr(g.parts).length > 0 && arr(g.parts).every(p => PARTS.has(p)) && arr(g.pipes).every(p => PIPES.has(p)),
    `${s.sid}: glow uses layers.js part / pipe ids (${arr(g.parts).join(',')} | ${arr(g.pipes).join(',')})`);
  for (const c of arr(s.concept)) ok(!!CONCEPTS[c], `${s.sid}: concept ${c} exists`);
  ok(/^\*\*结论/.test(s.text[0]), `${s.sid}: conclusion first (bold 结论…)`);
});
ok(steps.find(s => s.sid === 'M2').panel?.id === 'ai-k' && steps.find(s => s.sid === 'A2').panel?.id === 'ai-alloc' && steps.filter(s => s.panel).length === 2, 'panels: M2 ai-k, A2 ai-alloc, no other');
const last = steps[steps.length - 1];
ok(last.ending && Q3.every((q, k) => String(last.ending['q' + (k + 1)]).startsWith(q)), 'last step: the 三问 ending');
ok(AI_NO_ADVICE === NO_ADVICE && last.text.join('').includes(NO_ADVICE) && last.ending.q3.includes(NO_ADVICE), 'last step: 「这是用框架演示的样板，不是个人建议」 in the text and in 三问 ③');
ok(AI_HONEST === HONEST && steps.find(s => s.sid === 'A1').text.join('').includes(HONEST), 'A1: the SITU-AWARE v2 honest line, verbatim');

/* ---------- 2. numbers ---------- */
const num = v => typeof v === 'number' && Number.isFinite(v);
const lastOf = (D, k) => { let i = D.dates.length - 1; while (i >= 0 && !num(D.series[k][i])) i--; return { v: D.series[k][i], d: D.dates[i], i }; };
const val = (D, k, d) => D.series[k][D.dates.indexOf(d)];
const qx = d => `${d.slice(0, 4)} 年第${['一', '二', '三', '四'][+d[5] - 1]}季度`;
const p1 = v => `${(v * 100).toFixed(1)}%`, p0 = v => `${Math.round(v * 100)}%`, p2 = v => `${(v * 100).toFixed(2)}%`;
const s0 = v => `${v < 0 ? '−' : '+'}${Math.abs(Math.round(v * 100))}%`, pt = v => `${v < 0 ? '−' : '+'}${Math.abs(v * 100).toFixed(1)} 个点`;
const E = {};
{
  const uc = lastOf(USA_REAL, 'cpiYoY'), ac = lastOf(AUS_REAL, 'cpiYoY'), u10 = lastOf(USA_REAL, 'gov10y'), a10 = lastOf(AUS_REAL, 'gov10y');
  Object.assign(E, { uCpi: p1(uc.v), uCpiQ: qx(uc.d), aCpi: p1(ac.v), aCpiQ: qx(ac.d), u10: p1(u10.v), u10Q: qx(u10.d), a10: p1(a10.v), a10Q: qx(a10.d),
    u10d: pt(u10.v - USA_REAL.series.gov10y[u10.i - 4]), a10d: pt(a10.v - AUS_REAL.series.gov10y[a10.i - 4]),
    uTgt: `${+(countryParams('USA').piTarget * 100).toFixed(1)}%`, aTgt: `${+(countryParams('AUS').piTarget * 100).toFixed(1)}%` });
  const up = lastOf(USA_REAL, 'policyRate'); Object.assign(E, { uPol: p2(up.v), uPolQ: qx(up.d) });
  // RBA path: the lowest quarter since 2025Q1 (first one), the highest before it since 2023Q1 (first one), the latest
  const P = AUS_REAL.series.policyRate, D = AUS_REAL.dates;
  let lo = D.indexOf('2025Q1'); for (let i = lo; i < D.length; i++) if (num(P[i]) && P[i] < P[lo]) lo = i;
  let hi = D.indexOf('2023Q1'); for (let i = hi; i <= lo; i++) if (num(P[i]) && P[i] > P[hi]) hi = i;
  const an = lastOf(AUS_REAL, 'policyRate');
  Object.assign(E, { rbaHi: p2(P[hi]), rbaHiQ: qx(D[hi]), rbaLo: p2(P[lo]), rbaLoQ: qx(D[lo]), rbaNow: p2(an.v), rbaNowQ: qx(an.d) });
  const C = USA_REAL.series.cape, ci = C.map((v, i) => [v, i]).filter(([v]) => num(v)), cl = lastOf(USA_REAL, 'cape');
  Object.assign(E, { uCape: cl.v.toFixed(1), uCapeQ: qx(cl.d), uCapeAvg: (ci.reduce((s, [v]) => s + v, 0) / ci.length).toFixed(1), capeFrom: qx(USA_REAL.dates[ci[0][1]]) });
  const H = AUS_REAL.series.hhDebtGdp, h0 = D.indexOf('2021Q1'), h1 = D.indexOf('2023Q4');
  let hp = h0, hl = h0; for (let i = h0; i <= h1; i++) { if (H[i] > H[hp]) hp = i; if (H[i] < H[hl]) hl = i; }
  const hn = lastOf(AUS_REAL, 'hhDebtGdp');
  Object.assign(E, { aHhPk: p0(H[hp]), aHhPkQ: qx(D[hp]), aHhLo: p0(H[hl]), aHhLoQ: qx(D[hl]), aHh25: p0(val(AUS_REAL, 'hhDebtGdp', '2025Q4')), aHh25Q: qx('2025Q4'), aHhNow: p0(hn.v), aHhNowQ: qx(hn.d) });
  Object.assign(E, { aud08: s0(val(AUS_REAL, 'fxPerUsd', '2007Q4') / val(AUS_REAL, 'fxPerUsd', '2008Q4') - 1), jpy08: s0(val(JPN_Q, 'fxPerUsd', '2007Q4') / val(JPN_Q, 'fxPerUsd', '2008Q4') - 1), fxQ: qx('2008Q4') });
  for (const iso of ['USA', 'AUS']) E[iso === 'USA' ? 'uLong' : 'aLong'] = realSnapshot(iso, realLastDate(iso)).cycles.long.label;
  // the hypothetical example's own parameters (spec: A$700k house, A$300k liquid, 60 / 0–10 / 10 / 10 / 10, 6-month fund, 9 months, 5 points)
  Object.assign(E, { house: 'A$700k', liquid: 'A$300k', eqPct: '60%', tiltMax: '10%', tiltMin: '0%', cashPct: '10%', bondPct: '10%', goldPct: '10%', emerg: '6', stage: '9', drift: '5' });
}
ok(Object.keys(AI_NUMS).every(k => k in E), `every AI_NUMS key is recomputed here (${Object.keys(AI_NUMS).filter(k => !(k in E)).join(',') || 'all'})`);
for (const k of Object.keys(AI_NUMS)) ok(aiText(k) === E[k], `{${k}} = ${aiText(k)} (data: ${E[k]})`);
for (const [k, f] of Object.entries(AI_FACTS)) ok(f && f.v && f.src && /^\d{4}-\d{2}(-\d{2})?$/.test(f.date) && !(k in AI_NUMS), `AI_FACTS.${k} = 「${f.v}」 has a source and a date (${f.date})`);
const rawOf = s => [s.title.replace(/^(M\d|A\d) /, ''), ...s.rawText, ...(s.rawEnding ? Object.values(s.rawEnding) : [])];
steps.forEach(s => {
  const raw = rawOf(s).join(' ');
  const keys = [...raw.matchAll(/\{(\w+)\}/g)].map(m => m[1]);
  ok(keys.every(k => AI_NUMS[k] || AI_FACTS[k]), `${s.sid}: every placeholder is AI_NUMS or AI_FACTS (${keys.filter(k => !AI_NUMS[k] && !AI_FACTS[k]).join(',') || keys.length + ' keys'})`);
  const left = raw.replace(/\{\w+\}/g, '').replace(/B[12]/g, '').replace(/第 \d 课/g, '');
  ok(!/[0-9]/.test(left), `${s.sid}: no typed digit outside a placeholder${/[0-9]/.test(left) ? ' — ' + left.match(/.{0,12}[0-9].{0,12}/)[0] : ''}`);
  const filled = [s.title, ...s.text, ...(s.ending ? Object.values(s.ending) : [])].join(' ');
  ok(!/\{\w+\}|…|—|undefined|NaN|null/.test(filled), `${s.sid}: filled text has no placeholder / … / — / undefined`);
  for (const f of arr(s.facts)) ok(!!f.f(aiFacts()), `${s.sid}: fact — ${f.note}`);
});
ok(!/[0-9]/.test(HONEST + NO_ADVICE), 'the honest line and the no-advice line carry no digit');

/* ---------- 3. A2 table ---------- */
const want = (t, trig) => trig === 'tight' ? { eq: 65 - t, tilt: t / 2, cash: 15 + t / 2, bond: 10, gold: 10 }
  : trig === 'credit' ? { eq: 65 - t, tilt: 0, cash: 15, bond: 10 + t, gold: 10 } : { eq: 70 - t, tilt: t, cash: 10, bond: 10, gold: 10 };
ok(JSON.stringify(aiAllocTable()) === JSON.stringify({ eq: 60, tilt: 10, cash: 10, bond: 10, gold: 10 }), 'A2 default: 60 / 10 / 10 / 10 / 10 (tilt 10 by default)');
ok(JSON.stringify(AI_ALLOC.tiltOptions) === '[0,5,10]' && AI_ALLOC.house === 700000 && AI_ALLOC.liquid === 300000 && AI_ALLOC.mortgage === 0, 'A2: 信念仓位 0 / 5 / 10; house A$700k no mortgage; A$300k liquid');
for (const t of AI_ALLOC.tiltOptions) for (const trig of [null, 'tight', 'credit']) {
  const T = aiAllocTable(t, trig), sum = Object.values(T).reduce((a, b) => a + b, 0);
  ok(Math.abs(sum - 100) < 1e-9 && JSON.stringify(T) === JSON.stringify(want(t, trig)), `A2 table tilt ${t} ${trig || '平常'}: ${Object.values(T).join('/')} sums to ${sum}`);
}
ok(AI_ALLOC.triggers.map(t => t.name).join('|') === '收紧|AI 信用压力', 'exactly two risk-control buttons: 收紧, AI 信用压力');
ok(aiRiskLabel() === RISK(AI_FACTS.nTight.v) && AI_FACTS.nTight.v === '4', `risk label: 「${aiRiskLabel()}」`);
ok(JSON.stringify(AI_ALLOC.excluded) === JSON.stringify(['澳洲银行股', '澳洲 REIT']), 'excluded: AU banks and AU REITs');

/* ---------- 4. wording ---------- */
const BAN = /同比|环比|预报|卡点挪了/;
for (const f of ['src/data/lesson-ai-au.js', 'src/ui/ai-au-panel.js', 'assets/css/ai-au.css']) ok(!BAN.test(src(f)), `${f}: no 同比 / 环比 / 预报 / 卡点挪了`);
ok(!BAN.test(JSON.stringify(steps.map(s => [s.title, s.text, s.ending]))), 'filled lesson text: no 同比 / 环比 / 预报 / 卡点挪了');

/* ---------- peer figures vs data (information) ---------- */
console.log('\npeer figure  vs  data:');
for (const [what, peer, data] of [['US CPI', '~3.8%', `${E.uCpi} (${E.uCpiQ})`], ['AUS CPI', '~4%', `${E.aCpi} (${E.aCpiQ}); ${p1(val(AUS_REAL, 'cpiYoY', realLastDate('AUS')))} at the L9 quarter ${realLastDate('AUS')}`],
  ['US 10y', '~4.9%', `${E.u10} (${E.u10Q})`], ['AUS 10y', '~5.1%', `${E.a10} (${E.a10Q})`], ['RBA path', '(per data)', `${E.rbaHi} ${E.rbaHiQ} → ${E.rbaLo} ${E.rbaLoQ} → ${E.rbaNow} ${E.rbaNowQ}`],
  ['AU hh debt/GDP', '118 → 109 → 114%', `${E.aHhPk} (${E.aHhPkQ}) → ${E.aHhLo} (${E.aHhLoQ}) → ${E.aHh25} (${E.aHh25Q}); latest ${E.aHhNow} (${E.aHhNowQ})`],
  ['AUD 2008', '−24%', E.aud08], ['JPY 2008', '+18%', E.jpy08]]) console.log(`  ${what.padEnd(15)} ${peer.padEnd(18)} ${data}`);

/* ---------- 5. browser ---------- */
const SHOTS = ['M2', 'M4', 'M8', 'A2'];
async function browser() {
  const BASE = process.env.BASE || 'http://localhost:8981/';
  try { const r = await fetch(BASE + 'src/data/lesson-ai-au.js'); if (!r.ok) throw new Error(r.status); } catch (e) { ok(false, `server at ${BASE} (serve the repo: python -m http.server 8981) — ${e.message}`); return; }
  const EDGE = 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe', port = +(process.env.CDP_PORT || 9391);
  const proc = spawn(EDGE, ['--headless=new', '--disable-gpu', '--hide-scrollbars', `--remote-debugging-port=${port}`, '--window-size=1024,768',
    `--user-data-dir=${resolve(ROOT, 'tools/_edge_ai')}`, '--disk-cache-size=1', '--no-first-run', '--no-default-browser-check', 'about:blank'], { stdio: 'ignore' });
  const exited = new Promise(r => proc.on('exit', r));
  const sleep = ms => new Promise(r => setTimeout(r, ms));
  let ws, id = 0; const pending = new Map(), errors = [];
  try {
    for (let i = 0; i < 60 && !ws; i++) { try { const t = (await (await fetch(`http://127.0.0.1:${port}/json`)).json()).find(x => x.type === 'page'); if (t) { ws = new WebSocket(t.webSocketDebuggerUrl); await new Promise((res, rej) => { ws.onopen = res; ws.onerror = rej; }); } } catch (e) { ws = null; await sleep(250); } }
    if (!ws) { ok(false, 'headless Edge started'); return; }
    ws.onmessage = m => { const d = JSON.parse(m.data); if (d.id && pending.has(d.id)) { pending.get(d.id)(d); pending.delete(d.id); } else if (d.method === 'Runtime.exceptionThrown') errors.push(d.params.exceptionDetails.text + ' ' + (d.params.exceptionDetails.exception?.description || '')); else if (d.method === 'Runtime.consoleAPICalled' && d.params.type === 'error') errors.push('console.error ' + d.params.args.map(a => a.value || a.description).join(' ')); else if (d.method === 'Network.loadingFailed' && !/favicon/.test(d.params.errorText) && !/ERR_ABORTED/.test(d.params.errorText)) errors.push('load failed ' + d.params.errorText); else if (d.method === 'Network.responseReceived' && d.params.response.status >= 400 && !/favicon/.test(d.params.response.url)) errors.push(`HTTP ${d.params.response.status} ${d.params.response.url}`); };
    const send = (method, params = {}) => new Promise(res => { const i = ++id; pending.set(i, res); ws.send(JSON.stringify({ id: i, method, params })); });
    const ev = async expr => { const r = await send('Runtime.evaluate', { expression: expr, awaitPromise: true, returnByValue: true }); if (r.result.exceptionDetails) throw new Error(r.result.exceptionDetails.exception?.description || 'eval error'); return r.result.result.value; };
    const waitFor = async (expr, ms = 8000) => { for (let t = 0; t < ms; t += 150) { if (await ev(expr).catch(() => false)) return true; await sleep(150); } return false; };
    await send('Runtime.enable'); await send('Page.enable'); await send('Network.enable');
    await send('Storage.clearDataForOrigin', { origin: new URL(BASE).origin, storageTypes: 'all' });
    const shots = process.argv.includes('--shots'), SHOT_DIR = resolve(ROOT, 'tools/shots/ai-au'), saved = [];
    if (shots) mkdirSync(SHOT_DIR, { recursive: true });
    const shoot = async name => { await ev(`(() => { const a = document.querySelector('#ls-card .aiau'), b = document.querySelector('#ls-card .ls-body'); if (!a || !b) return;   // the card panel into view (card body scroll only)
        const ra = a.getBoundingClientRect(), rb = b.getBoundingClientRect();
        b.scrollTop += a.dataset.panel === 'ai-alloc' ? ra.top - rb.top - 6 : Math.max(0, ra.bottom - rb.bottom + 6); })()`); await new Promise(r => setTimeout(r, 200)); const r = await send('Page.captureScreenshot', { format: 'png' }); const f = resolve(SHOT_DIR, name); writeFileSync(f, Buffer.from(r.result.data, 'base64')); saved.push(f); };
    const readTable = `(() => { const t = document.querySelector('#ls-card .aiau[data-panel="ai-alloc"] .aiau-t'); if (!t) return null;
      const o = {}; t.querySelectorAll('tbody tr[data-b]').forEach(tr => { const td = [...tr.querySelectorAll('td')].map(c => c.firstChild.textContent); o[tr.dataset.b] = td; }); return o; })()`;
    const tblEq = (got, T, col) => got && Object.keys(T).every(k => got[k] && got[k][col] === `${T[k]}%`);
    for (const [w, h] of [[390, 844], [1024, 768]]) {
      const tag = `${w}×${h}`;
      await send('Emulation.setDeviceMetricsOverride', { width: w, height: h, deviceScaleFactor: w < 500 ? 2 : 1, mobile: w < 500 });
      errors.length = 0;
      await send('Page.navigate', { url: BASE + '?pause=1&lesson=ai-au' });
      ok(await waitFor(`!!document.querySelector('#ls-card .ls-stitle') && document.querySelector('#ls-card .ls-stitle').textContent.startsWith('M1')`, 15000), `${tag}: ?lesson=ai-au opens the lesson directly at M1`);
      ok((await ev(`(document.querySelector('#ls-card .ls-ttl') || {}).textContent || ''`)).includes('专题：AI 抗冲击（澳洲家庭）'), `${tag}: card title 「专题：AI 抗冲击（澳洲家庭）」`);
      for (let i = 0; i < steps.length; i++) {
        const st = steps[i];
        if (i > 0) await ev(`document.querySelector('#ls-card [data-act=next]').click()`);
        ok(await waitFor(`(document.querySelector('#ls-card .ls-stitle') || {}).textContent === ${JSON.stringify(st.title)}`), `${tag} ${st.sid}: step title 「${st.title}」`);
        // the step's OWN glow (flash fires 450 ms after entering): every glow part lights at least one element, and at least one of its pipes
        const gp = JSON.stringify(arr(st.glow.parts)), gq = JSON.stringify(arr(st.glow.pipes));
        const glow = await waitFor(`(() => { const lit = [...document.querySelectorAll('#diagram .lk-hl')];
          const parts = ${gp}.every(p => lit.some(n => (n.getAttribute('data-part') || '').split(/\\s+/).includes(p)));
          const pipes = !${gq}.length || lit.some(n => n.hasAttribute('data-pipe'));
          return parts && pipes; })()`, 3000);
        const unlit = glow ? [] : await ev(`(() => { const lit = [...document.querySelectorAll('#diagram .lk-hl')]; return ${gp}.filter(p => !lit.some(n => (n.getAttribute('data-part') || '').split(/\\s+/).includes(p))); })()`);
        ok(glow, `${tag} ${st.sid}: its own parts glow on the main diagram (${arr(st.glow.parts).join(',')})${unlit.length ? ' — not lit: ' + unlit.join(',') : ''}`);
        if (st.panel) ok(await waitFor(`document.querySelectorAll('#ls-card .aiau').length === 1 && document.querySelector('#ls-card .aiau').dataset.panel === ${JSON.stringify(st.panel.id)}`), `${tag} ${st.sid}: card panel ${st.panel.id} (exactly one)`);
        else ok(!(await ev(`!!document.querySelector('.aiau') || !!document.querySelector('#ls-panel')`)), `${tag} ${st.sid}: no panel over the diagram, no stale card panel`);
        const lay = await ev(`(() => { const d = document.documentElement, b = document.querySelector('#ls-card .ls-body'), a = document.querySelector('.aiau');
          return { page: d.scrollWidth - d.clientWidth, body: document.body.scrollWidth - window.innerWidth, card: b ? b.scrollWidth - b.clientWidth : 0, pnl: a ? a.scrollWidth - a.clientWidth : 0,
            text: b ? b.textContent : '', all: document.body.innerText }; })()`);
        ok(lay.page <= 0 && lay.body <= 0 && lay.card <= 0 && lay.pnl <= 0, `${tag} ${st.sid}: no horizontal scroll (page ${lay.page}, body ${lay.body}, card ${lay.card}, panel ${lay.pnl})`);
        ok(!/…|—|\{\w+\}|undefined|NaN/.test(lay.text), `${tag} ${st.sid}: card text has no 「…」 / 「—」 / unfilled placeholder`);
        const keys = [...new Set([...st.rawText.join(' ').matchAll(/\{(\w+)\}/g)].map(m => m[1]))];
        const miss = keys.filter(k => !lay.text.includes(E[k] ?? AI_FACTS[k].v));
        ok(!miss.length, `${tag} ${st.sid}: card shows the data numbers (${keys.length} keys)${miss.length ? ' — missing ' + miss.join(',') : ''}`);
        ok(!/同比|环比|卡点挪了/.test(lay.all), `${tag} ${st.sid}: page has no 同比 / 环比 / 卡点挪了`);
        if (st.sid === 'A1') ok(lay.text.includes(HONEST), `${tag} A1: the honest line on the card`);
        if (st.sid === 'A2') {
          ok(tblEq(await ev(readTable), want(10, null), 0), `${tag} A2: default table 60/10/10/10/10 on the card`);
          ok((await ev(`document.querySelector('.aiau-risk').textContent`)) === RISK(4), `${tag} A2: risk label under the buttons`);
          ok((await ev(`[...document.querySelectorAll('.aiau [data-ai=trig]')].map(b => b.textContent).join('|')`)) === '平常|收紧|AI 信用压力', `${tag} A2: buttons 平常 / 收紧 / AI 信用压力 (no 卡点挪了)`);
          // phone: the A2 table is taller than the card, so the shots use the card's own ⤢ (tall) button, as a viewer would
          const tall = shots && w < 500 && !(await ev(`document.querySelector('#ls-card').classList.contains('tall')`));
          if (tall) { await ev(`document.querySelector('#ls-card [data-act=expand]').click()`); await sleep(300); }
          if (shots) await shoot(`ai-A2-${w}x${h}.png`);
          for (const [t, trig] of [[10, 'tight'], [10, 'credit'], [5, 'tight'], [0, 'credit'], [5, 'credit']]) {
            await ev(`document.querySelector('.aiau [data-ai=tilt][data-v="${t}"]').click()`);
            await ev(`document.querySelector('.aiau [data-ai=trig][data-v="${trig}"]').click()`);
            const g = await ev(readTable);
            ok(tblEq(g, want(t, null), 0) && tblEq(g, want(t, trig), 1), `${tag} A2: 信念仓位 ${t}% + ${trig}: normal ${Object.values(want(t, null)).join('/')} → ${Object.values(want(t, trig)).join('/')}`);
            if (shots && t === 10 && trig === 'tight') await shoot(`ai-A2-tight-${w}x${h}.png`);
            const ov = await ev(`(() => { const a = document.querySelector('.aiau'); return a.scrollWidth - a.clientWidth + Math.max(0, document.documentElement.scrollWidth - document.documentElement.clientWidth); })()`);
            ok(ov <= 0, `${tag} A2 (${t}, ${trig}): no horizontal scroll (${ov})`);
          }
          await ev(`document.querySelector('.aiau [data-ai=tilt][data-v="10"]').click()`); await ev(`document.querySelector('.aiau [data-ai=trig][data-v="none"]').click()`);
          ok(tblEq(await ev(readTable), want(10, null), 0) && (await ev(`document.querySelectorAll('.aiau-t thead th').length`)) === 2, `${tag} A2: 平常 restores the one-column table`);
          if (tall) { await ev(`document.querySelector('#ls-card [data-act=expand]').click()`); await sleep(200); }
        } else if (shots && SHOTS.includes(st.sid)) { await sleep(200); await shoot(`ai-${st.sid}-${w}x${h}.png`); }
      }
      const end = await ev(`(() => { const e = document.querySelector('#ls-card .ls-end'); return e ? e.textContent : ''; })()`);
      ok(!!end && end.includes(NO_ADVICE) && Q3.every(q => end.includes(q)) && end.includes(E.uLong) && end.includes(E.aLong), `${tag}: last step shows the 三问 with 「${NO_ADVICE}」`);
      await ev(`document.querySelector('#ls-card [data-act=prev]').click()`);
      ok(await waitFor(`document.querySelectorAll('#ls-card .aiau[data-panel="ai-alloc"]').length === 1`), `${tag}: 上一步 back to A2 remounts its card panel`);
      await ev(`document.querySelector('#ls-card [data-act=exit]').click()`);
      ok(await waitFor(`!document.querySelector('.aiau') && !document.querySelector('#ls-panel') && document.querySelectorAll('#diagram .lk-hl').length === 0`, 5000), `${tag}: exit unmounts the panel and the glow`);
      ok(!errors.length, `${tag}: no JS errors ${errors.slice(0, 3).join(' | ')}`);
      errors.length = 0;
      await send('Page.navigate', { url: BASE + '?pause=1&menu=1' });
      ok(await waitFor(`!!document.querySelector('#ls-menu .ls-topics .ls-item[data-id="ai-au"]')`), `${tag}: the 专题 menu lists the lesson`);
      ok((await ev(`document.querySelector('#ls-menu .ls-topics .ls-item[data-id="ai-au"]').textContent`)).includes('专题：AI 抗冲击（澳洲家庭）') && !(await ev(`!!document.querySelector('#ls-menu .ls-main .ls-item[data-id="ai-au"]')`)), `${tag}: menu item under 专题, not in the main line`);
      await ev(`document.querySelector('#ls-menu .ls-topics .ls-item[data-id="ai-au"]').click()`);
      ok(await waitFor(`(document.querySelector('#ls-card .ls-stitle') || {}).textContent?.startsWith('M1')`), `${tag}: tapping it in the menu starts the lesson`);
      ok(!errors.length, `${tag}: menu, no JS errors ${errors.slice(0, 3).join(' | ')}`);
    }
    if (saved.length) console.log('screenshots:\n  ' + saved.join('\n  '));
  } finally {
    try { if (ws && ws.readyState === 1) { ws.send(JSON.stringify({ id: ++id, method: 'Browser.close' })); } } catch (e) { /* ignore */ }
    await Promise.race([exited, sleep(4000)]);
    try { proc.kill(); } catch (e) { /* ignore */ }
    try { ws && ws.close(); } catch (e) { /* ignore */ }
  }
}
if (!process.argv.includes('--no-browser')) await browser();

console.log(`\ncheck_lesson_ai_au: ${oks} ok, ${fails} FAIL`);
process.exit(fails ? 1 : 0);
