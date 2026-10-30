// node tools/check_lesson_exp.mjs [--no-browser] [--shots] [--shot-dir=tools/shots/exp] [--verbose]
//                                         (BASE=http://localhost:8821/ by default: serve the repo first, e.g. python -m http.server 8821)
// Checks the 专题 lesson 「专题：预期」 (src/data/lesson-exp.js) and its panels (src/ui/exp-gauge.js):
//  1. structure  ≤ 7 steps (slimmed 2026-10-30: the basic part lives in L3), the first line says 「先学完第 3 课」, intro 「下面分 N 步」 = N,
//                the advanced steps in order (rope → story → pool → gate → laws → sum), panel ids exist, concept ids exist,
//                NOT in the main line (COURSE / LESSON_ORDER / LESSONS), registered in src/ui/lessons.js TOPIC_LESSONS,
//                the last step has the 三问 ending + 「预期看▽」; RULER_STYLE (the ruler look other modules import) is exported and sane
//  2. wording    no 预报 / 水头 / 同比 / 环比 in the lesson, the panel module or its CSS
//  3. vals       every {placeholder} fills (no 「—」); every vals number equals the engine replay of the panel (same quarter, same path);
//                prints the 2022Q4 numbers
//  4. nums/facts every typed number is recomputed (engine, repo data, the Michigan download, the spec constants) and appears in its step;
//                every fact holds
//  5. engine     the panel's replay = createSim snapshot by snapshot (USA, AUS); the toy's ▽ rule = the engine's: the dean literals and the
//                price inertia are read from src/engine/economy.js, the rope params from the sim's own rule params, and the toy rule fed with
//                the AUS model's ▼ (no oil look-through there) reproduces the AUS model's ▽ quarter by quarter
//  6. five order the order of step 5 comes from computed timing: an independent re-computation from createSim snapshots gives the same turns,
//                and shuffling the places table does not change the order
//  7. browser    headless Edge (CDP) at 390×844 and 1024×768: ?lesson=exp opens it directly, every step mounts its panel (one at a time),
//                exit unmounts it, no JS errors, no horizontal scroll, panel numbers = engine numbers, sliders / buttons react, the menu lists
//                「专题：预期」 under 「专题」 outside the 9 lessons. --shots writes tools/shots/exp/*.png
// Exit code 1 on any FAIL.
import { readFileSync, mkdirSync, writeFileSync } from 'node:fs';
import { spawn } from 'node:child_process';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { LESSON_EXP, EXP_STORY, EXP_FIVE, EXP_TOY } from '../src/data/lesson-exp.js';
import * as G from '../src/ui/exp-gauge.js';
import { LESSONS, COURSE } from '../src/data/lessons.js';
import { LESSON_ORDER } from '../src/data/layers.js';
import { CONCEPTS } from '../src/data/concepts.js';
import { COUNTRY_PARAMS } from '../src/data/country-params.js';
import { US_Q } from '../src/data/us-quarterly.js';
import { AUS_Q } from '../src/data/countries/aus-quarterly.js';
import { MICH_Q } from '../src/data/exp-mich.js';
import { EXP_FX } from '../src/data/exp-fx.js';
import { FX_SPEC, FX_FORCES } from '../src/data/fx-data.js';
import { LESSON_FX } from '../src/data/lesson-fx.js';
import { createSim } from '../src/engine/sim.js';
import { buildTable, fillStep, fmtV, getPath, aggregate } from '../src/ui/lessons-town.js';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const verbose = process.argv.includes('--verbose');
let fails = 0, oks = 0;
const ok = (c, m) => { if (c) { oks++; if (verbose) console.log('ok   ' + m); } else { fails++; console.log('FAIL ' + m); } };
const L = LESSON_EXP, steps = L.steps;
const arr = x => (x == null ? [] : Array.isArray(x) ? x : [x]);
const src = f => readFileSync(resolve(ROOT, f), 'utf8');
const ECO = src('src/engine/economy.js');

/* ---------- 1. structure ---------- */
const PANELS = ['exp-ruler', 'exp-hist', 'exp-five', 'exp-loop', 'exp-rope', 'exp-story', 'exp-pool', 'exp-gate', 'exp-laws', 'exp-sum'];
ok(L.id === 'exp' && L.title === '专题：预期' && L.available === true, 'lesson id exp, title 专题：预期');
ok(steps.length >= 3 && steps.length <= 7, `≤ 7 steps (${steps.length})`);
{ const m = /下面分 (\d+) 步/.exec(arr(steps[0].text).join('')); ok(m && +m[1] === steps.length - 1, `intro says 下面分 ${m && m[1]} 步 = ${steps.length - 1}`); }
ok(arr(steps[0].text)[0].includes('先学完第 3 课'), 'first line: 「先学完第 3 课」');
ok(steps.slice(1).map(s => s.panel && s.panel.id).join() === 'exp-rope,exp-story,exp-pool,exp-gate,exp-laws,exp-sum', 'advanced steps: ' + steps.slice(1).map(s => s.panel && s.panel.id).join(' → '));
ok(!steps.some(s => ['exp-ruler', 'exp-five', 'exp-loop'].includes(s.panel && s.panel.id)), 'the basic panels (ruler, five places, loop) are not steps here (they live in L3)');
{
  const R = G.RULER_STYLE;
  ok(R && Object.isFrozen(R) && R.staff.width <= 2.5 && 2 * R.band.open.half >= 6 * R.staff.width && R.band.real.width > R.staff.width
    && ['p', 'm', 'e'].every(k => R[k] && R[k].glyph && /^var\(--exg-/.test(R[k].color)) && /^var\(--exg-blue/.test(R.blue.color) && /^var\(--exg-red/.test(R.red.color),
  `RULER_STYLE exported: staff ${R && R.staff.width}px grey, open band ${R && 2 * R.band.open.half}px wide, ▶ ▼ ▽ + blue / red as CSS variables`);
  ok(G.rulerSign(0.05, 0.03) === 'blue' && G.rulerSign(0.01, 0.03) === 'red', 'rulerSign: ▶ above ▽ = blue, below = red');
  const svg = G.gaugeSvg({ W: 150, H: 230, lo: -0.01, hi: 0.07, p: 0.037, m: 0.052, e: 0.03, target: 0.02, band: 'split' });
  const bw = [...svg.matchAll(/class="exg-band open[^"]*"[^>]*width="([\d.]+)"/g)].map(x => +x[1]), sw = /class="exg-rule"[^>]*stroke-width="([\d.]+)"/.exec(svg);
  ok(bw.length === 1 && bw[0] === 2 * G.RULER_STYLE.band.open.half && sw && +sw[1] === G.RULER_STYLE.staff.width, `gauge draws the band ${bw[0]}px wide on a ${sw && sw[1]}px staff (RULER_STYLE)`);
  const css = src('assets/css/exp-gauge.css');
  ok(/--exg-staff:/.test(css) && /\.exg-rule \{ stroke: var\(--exg-staff\)/.test(css) && !/\.exg-rule \{[^}]*var\(--text\)/.test(css), 'css: the staff is grey (--exg-staff), not the text colour');
}
steps.forEach((st, i) => {
  ok(st.panel && PANELS.includes(st.panel.id), `step ${i + 1} has an exp panel (${st.panel && st.panel.id})`);
  for (const c of arr(st.concept)) ok(!!CONCEPTS[c], `step ${i + 1} concept ${c} exists`);
  ok(i === 0 || st.title.startsWith(`第 ${i} 步`), `step ${i + 1} title numbered: ${st.title}`);
});
ok(!LESSONS.some(l => l.id === 'exp'), 'not in LESSONS (main data list)');
ok(![...COURSE.main, ...COURSE.legacy, ...COURSE.parts.flatMap(p => p.ids)].map(String).includes('exp'), 'not in COURSE (the 9 lessons / 旧版)');
ok(!LESSON_ORDER.includes('exp'), 'not in LESSON_ORDER (no layer, not counted)');
ok(COURSE.main.length === 9, 'main line 9 lessons (L9 now = 现在在哪), exp not among them');
{ const ui = src('src/ui/lessons.js'); ok(/TOPIC_LESSONS = \[LESSON_EXP, LESSON_AI_AU\]/.test(ui) && /\.\.\.TOPIC_LESSONS\]/.test(ui) && !/TOPIC_LESSONS\.push\(/.test(ui), 'registered in src/ui/lessons.js (TOPIC_LESSONS = [LESSON_EXP, LESSON_AI_AU]: 预期 first, then the AI 专题 (tools/check_lesson_ai_au.mjs); lookup)'); }
const last = steps[steps.length - 1];
ok(last.ending && ['水的问题还是河道的问题？', '环上哪一步？', '谁赢谁输、钱放哪？'].every((q, k) => String(last.ending['q' + (k + 1)]).startsWith(q)), 'last step: the 三问 ending');
ok(arr(last.text).join('').includes('预期看▽'), 'last step: 口诀 「预期看▽」');

/* ---------- 2. wording ---------- */
const lessonText = JSON.stringify(L, (k, v) => (typeof v === 'function' ? undefined : v));
for (const [name, txt] of [['lesson', lessonText], ['exp-gauge.js', src('src/ui/exp-gauge.js')], ['exp-gauge.css', src('assets/css/exp-gauge.css')], ['lesson-exp.js', src('src/data/lesson-exp.js')]])
  for (const w of ['预报', '水头', '同比', '环比']) ok(!txt.includes(w), `${name}: no 「${w}」`);

/* ---------- engine replay (shared) ---------- */
const rows = G.replay();
const rowAt = d => rows.find(r => r.date === d);
const usSim = createSim({ data: US_Q, country: 'USA' }); while (!usSim.done) usSim.step();
const usHist = usSim.history();

/* ---------- 3. vals ---------- */
const TBL = [];
steps.forEach((st, i) => {
  let tbl = null;
  if (st.vals) {
    tbl = buildTable(US_Q, L, st, { from: L.startDate, until: L.startDate });
    for (const d of arr(st.derive)) { const a = tbl.raw[d.a], b = tbl.raw[d.b]; tbl.raw[d.key] = a - b; tbl.fmt[d.key] = d.fmt; }
    for (const v of st.vals) {
      const raw = tbl.raw[v.key];
      ok(raw != null && raw !== '—', `step ${i + 1} val ${v.key} computes (${fmtV(raw, v.fmt)})`);
      if (/^real:/.test(v.get)) continue;   // real data, not the model
      // the same number from the panel's replay (same engine run, same quarter, same path)
      const m = /^at:(\d{4}Q\d):(.+)$/.exec(v.get);
      let mine;
      if (m) mine = getPath(rowAt(m[1]).snap, m[2]);
      else { const win = rows.filter(r => r.date > v.from && r.date <= v.until).map(r => r.snap); mine = aggregate(win, v.get, rowAt(v.from).snap); }
      ok(Math.abs(mine - raw) < 1e-12, `step ${i + 1} val ${v.key}: card ${fmtV(raw, v.fmt)} = panel replay ${fmtV(mine, v.fmt)}`);
    }
  }
  const miss = [];
  const f = fillStep({ ...st, ending: undefined }, tbl, miss);
  const endTxt = st.ending ? fillStep({ text: [st.ending.q1, st.ending.q2, st.ending.q3] }, tbl, miss).text.join('') : '';
  const text = arr(f.text).join('\n') + endTxt;
  ok(!miss.length && !/[{}]/.test(text), `step ${i + 1}: every placeholder filled ${miss.join(' ')}`);
  TBL[i] = { tbl, text };
});
const I22 = steps.findIndex(s => arr(s.derive).some(d => d.key === 'open22'));   // the step with the 2022Q4 开阀 / 结账 numbers (the intro recap)
ok(I22 >= 0, `a step carries the 2022Q4 numbers (step ${I22 + 1})`);
{
  const t = TBL[I22].tbl.raw, F = k => fmtV(t[k], TBL[I22].tbl.fmt[k]);
  console.log(`2022Q4 (engine): ▶ ${F('p22')}  ▼ ${F('m22')}  ▽ ${F('e22')}  开阀 ▶−▽ ${F('open22')}  到手 ▶−▼ ${F('real22')}  意外 ▼−▽ ${F('sur22')}`);
  ok(Math.abs(t.real22 - (t.p22 - t.m22)) < 1e-12, '到手 = ▶ − ▼ exactly (rates.realPolicy)');
}

/* ---------- 4. nums / facts ---------- */
const D = {
  story: EXP_STORY, eco: ECO,
  cp: iso => COUNTRY_PARAMS[iso],
  rule: (iso, k) => { const s = createSim({ data: iso === 'AUS' ? AUS_Q : US_Q, country: iso }); return s.rules.find(r => r.id === 'hh_infl_deanchor').params[k]; },
  hist: () => rows.filter(r => r.date >= '2020Q1' && r.date <= '2023Q4'),
  hist5: () => rows.filter(r => r.date >= EXP_FIVE.from && r.date <= EXP_FIVE.until),
  row: rowAt, five: () => G.fiveTurns(rows), loop: () => G.loopInfo(rows),
  toy: (p, r) => G.toyRun(p, r), pool: () => G.poolRun(),
  mich: G.mich, jpn: G.jpn, fx: G.fxAt, fxSpec: FX_SPEC, fxForces: FX_FORCES,
  q: (iso, k, d) => { const Q = iso === 'AUS' ? AUS_Q : US_Q; return Q.series[k][Q.dates.indexOf(d)]; },
  real: {
    list: (k, a, b) => US_Q.dates.map((d, i) => [d, US_Q.series[k][i]]).filter(([d]) => d >= a && d <= b).map(x => x[1]),
    avg: (k, a, b) => { const v = D.real.list(k, a, b); return v.reduce((x, y) => x + y, 0) / v.length; },
    max: (k, a, b) => Math.max(...D.real.list(k, a, b)),
  },
};
const P = (v, d) => (v < 0 ? '−' : '') + Math.abs(v * 100).toFixed(d) + '%';
const FMT = {
  pct0: (v, t) => t.replace(/^约 /, '') === P(v, 0), pct1: (v, t) => t.replace(/^约 /, '') === P(v, 1),
  q: (v, t) => t === `${v.slice(0, 4)} 年第${'一二三四'[+v[5] - 1]}季度`, str: (v, t) => v === t, nq: (v, t) => t === `${v} 个季度`,
  more8: (v, t) => t === '8 个多点' && v > 0.08 && v < 0.09, about3: (v, t) => t === '约 3 倍' && Math.round(v) === 3,
  about10: (v, t) => t.startsWith('约 10%') && Math.abs(v - 0.10) <= 0.01, near11: (v, t) => t.startsWith('接近 11%') && v < 0.11 && v > 0.105, in15to20: (v, t) => t === '15–20%' && v >= 0.15 && v <= 0.20,
  n1: (v, t) => t === v.toFixed(1), n2: (v, t) => t === v.toFixed(2), pts1: (v, t) => t === (v * 100).toFixed(1) + ' 个点', cnt: (v, t) => t === v + ' 个国家',
};
steps.forEach((st, i) => {
  for (const n of arr(st.nums)) {
    let v = null; try { v = n.f(D); } catch (e) { v = e.message; }
    ok(FMT[n.fmt] && FMT[n.fmt](v, n.t), `step ${i + 1} number 「${n.t}」 = ${typeof v === 'number' ? v.toFixed(5) : v} (${n.fmt})`);
    ok(TBL[i].text.includes(n.t), `step ${i + 1} number 「${n.t}」 is in its text`);
  }
  for (const f of arr(st.facts)) { let r = false; try { r = !!f.f(D); } catch (e) { r = false; } ok(r, `step ${i + 1} fact: ${f.note}`); }
});
// the Michigan module = the downloaded CSV (quarterly means)
{
  const csv = src('data_src/exp/MICH.csv').trim().split(/\r?\n/).slice(1).map(l => l.split(','));
  const q = {}; for (const [d, v] of csv) { const k = `${d.slice(0, 4)}Q${Math.floor((+d.slice(5, 7) - 1) / 3) + 1}`; (q[k] ||= []).push(+v); }
  const bad = MICH_Q.dates.filter((d, i) => !q[d] || q[d].length !== 3 || Math.abs(q[d].reduce((a, b) => a + b, 0) / 300 - MICH_Q.mich[i]) > 1e-5);
  ok(!bad.length && MICH_Q.dates.length > 150, `exp-mich.js = data_src/exp/MICH.csv quarterly means (${MICH_Q.dates.length} quarters) ${bad.slice(0, 3)}`);
  // the peg stories = the FRED daily files (monthly means of the quoted days)
  for (const [key, sid, field] of [['gbp', 'DEXUSUK', 'usdPerGbp'], ['thb', 'DEXTHUS', 'thbPerUsd']]) {
    const rowsCsv = src(`data_src/exp/${sid}.csv`).trim().split(/\r?\n/).slice(1).map(l => l.split(',')).filter(([, v]) => v && v !== '.' && Number.isFinite(+v));
    const mo = {}; for (const [d, v] of rowsCsv) (mo[d.slice(0, 7)] ||= []).push(+v);
    const o = EXP_FX[key], badM = o.months.filter((mm, i) => !mo[mm] || Math.abs(mo[mm].reduce((a, b) => a + b, 0) / mo[mm].length - o[field][i]) > 1e-4);
    ok(!badM.length && o.months.includes('1992-09') && o.months.includes('1998-01'), `exp-fx.js ${key} = data_src/exp/${sid}.csv monthly means (${o.months.length} months) ${badM.slice(0, 3)}`);
  }
}
// the L6 pointer: lesson-fx.js links to this lesson's 「汇率上的绳」 step
{
  const st = LESSON_FX.steps.find(s => s.lessonLink), ll = st && st.lessonLink;
  ok(ll && ll.id === 'exp' && steps[ll.step] && steps[ll.step].panel.id === 'exp-gate', `L6 「水怎么过境」 points to ?lesson=exp&step=${ll && ll.step} (${ll && steps[ll.step] && steps[ll.step].title})`);
  ok(/st\.lessonLink/.test(src('src/ui/lessons.js')), 'the runner renders the step field lessonLink');
}

/* ---------- 5. engine: replay = createSim; toy rule = engine rule ---------- */
const sameSnap = (a, b) => a.date === b.date && ['rates.policy', 'macro.inflation', 'macro.inflationExp', 'macro.unemployment', 'gov.debtGdp', 'flows.newLoans', 'household.savingRate', 'assets.bond.price', 'assets.equity.price', 'rates.realPolicy']
  .every(p => getPath(a, p) === getPath(b, p)) && a.cycles?.short?.phase === b.cycles?.short?.phase;
ok(rows.length === usHist.length && rows.every((r, k) => sameSnap(r.snap, usHist[k])), `USA: panel replay = createSim, ${rows.length} quarters, bit for bit`);
const ausRows = G.replay('AUS', AUS_Q);
{ const s = createSim({ data: AUS_Q, country: 'AUS' }); while (!s.done) s.step(); const h = s.history(); ok(ausRows.every((r, k) => sameSnap(r.snap, h[k])), 'AUS: panel replay = createSim, bit for bit'); }
{
  const m = /S\.dean = ([\d.]+) \* S0\.dean \+ ([\d.]+) \* clamp\(\(piX - p\.pi\) \/ ([\d.]+), 0, 1\)/.exec(ECO);
  ok(m && +m[1] === G.DEAN_K.keep && +m[2] === G.DEAN_K.push && +m[3] === G.DEAN_K.width, `toy dean literals = engine (${m && m.slice(1).join(', ')})`);
  const e = /S\.piE = S0\.piE \+ \(p\.speed \+ p\.extra \* S\.dean\) \* \(gapPi > 0 \? 1 : p\.down\) \* gapPi \+ p\.anchor \* \(1 - S\.dean\) \* \(K\.target - S0\.piE\)/.test(ECO);
  ok(e, 'engine ▽ update has the form the toy copies (speed + extra·dean, down, anchor·(1 − dean)·(target − ▽))');
  const pi = /S\.pi = ([\d.]+) \* S0\.pi \+ ([\d.]+) \* raw/.exec(ECO);
  ok(pi && +pi[1] === G.PRICE_K.inertia && +pi[2] === 1 - G.PRICE_K.inertia, `toy price inertia = engine (${pi && pi.slice(1).join(', ')})`);
  for (const iso of ['USA', 'AUS']) {
    const s = createSim({ data: iso === 'AUS' ? AUS_Q : US_Q, country: iso }), p = s.rules.find(r => r.id === 'hh_infl_deanchor').params, r = G.ropeOf(iso);
    ok(['pi', 'speed', 'extra', 'anchor', 'down'].every(k => p[k] === r[k]) && r.target === s.countryParams.piTarget, `rope ${iso} = the sim's own rule params (anchor ${r.anchor}, pi ${r.pi}, target ${r.target})`);
  }
  ok(G.ropeOf('cut').anchor === 0, 'rope 剪断: anchor 0');
  const ratio = G.ropePx(G.ropeOf('AUS').anchor) / G.ropePx(G.ropeOf('USA').anchor);
  ok(ratio > 2.5 && ratio < 3.2, `rope thickness ∝ anchor: AUS / US = ${ratio.toFixed(2)} (≈ 3×)`);
  ok(!(COUNTRY_PARAMS.AUS.oilLookThrough), 'AUS has no oil look-through (its ▽ follows ▼ directly)');
  const rope = G.ropeOf('AUS'); let st = { piE: ausRows[0].e, dean: 0 }, worst = 0;
  for (let k = 1; k < ausRows.length; k++) { st = G.expStep(st, ausRows[k].m, rope); worst = Math.max(worst, Math.abs(st.piE - ausRows[k].e), Math.abs(st.dean - ausRows[k].dean)); }
  ok(worst < 1e-12, `toy ▽ rule fed with the AUS model's ▼ = the AUS model's ▽ and dean, 1995–2025 (max diff ${worst.toExponential(1)})`);
  const usDean = rows.filter(r => r.date >= '2020Q1' && r.date <= '2023Q4').map(r => r.dean);
  console.log(`USA dean 2020–2023 max ${Math.max(...usDean).toFixed(3)}; toy ends: ` + ['oil', 'heat'].map(p => EXP_TOY.ropes.map(r => `${p}/${r.id} ▽ ${P(G.toyRun(p, r.id).end.e, 1)} dean ${G.toyRun(p, r.id).end.dean.toFixed(2)}`).join(', ')).join(' | '));
}

/* ---------- 6. the five-places order comes from computed timing ---------- */
{
  const F = G.fiveTurns(rows);
  // independent re-computation from createSim snapshots
  const win = usHist.map((s, k) => ({ s, k })).filter(x => x.s.date >= EXP_FIVE.from && x.s.date <= EXP_FIVE.until);
  const blue = win.find(x => x.s.rates.policy - x.s.macro.inflationExp > 0);
  const val = (k, get) => {
    const a = usHist[k], b = usHist[k - 4];
    return { loanYoY: a.flows.newLoans / b.flows.newLoans - 1, bondYoY: a.assets.bond.price / b.assets.bond.price - 1, savD: a.household.savingRate - b.household.savingRate, uD: a.macro.unemployment - b.macro.unemployment }[get];
  };
  const turns = Object.fromEntries(EXP_FIVE.places.map(p => [p.id, (win.find(x => x.k >= blue.k && (p.dir === '<=' ? val(x.k, p.get) <= p.th : val(x.k, p.get) >= p.th)) || {}).s?.date]));
  ok(F.blue === blue.s.date, `band turns blue ${F.blue}`);
  ok(F.places.every(p => p.turn === turns[p.id]), 'turn quarters = independent re-computation: ' + F.places.map(p => `${p.name} ${p.turn}`).join(', '));
  const sorted = Object.entries(turns).sort((a, b) => a[1].localeCompare(b[1]));
  ok(F.order.flat().join() === sorted.map(x => x[0]).join() || F.order.every((g, k) => g.every(id => turns[id] === F.places.find(p => p.id === g[0]).turn)), 'order sorted by computed turn: ' + F.order.map(g => g.join('+')).join(' → '));
  const saved = EXP_FIVE.places.slice(); EXP_FIVE.places.reverse();
  const F2 = G.fiveTurns(rows); EXP_FIVE.places.splice(0, EXP_FIVE.places.length, ...saved);
  ok(F2.order.map(g => g.slice().sort().join('+')).join() === F.order.map(g => g.slice().sort().join('+')).join(), 'reversing the places table does not change the order (it is not a typed list)');
  console.log('five order (engine):', F.orderText, '| lags after blue:', JSON.stringify(F.lag), '| loop:', JSON.stringify(G.loopInfo(rows)));
}

/* ---------- 7. browser ---------- */
async function browser() {
  const BASE = process.env.BASE || 'http://localhost:8821/';
  try { const r = await fetch(BASE + 'src/data/lesson-exp.js'); if (!r.ok) throw new Error(r.status); } catch (e) { ok(false, `server at ${BASE} (serve the repo: python -m http.server 8821) — ${e.message}`); return; }
  const EDGE = 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe', port = 9351;
  const proc = spawn(EDGE, ['--headless=new', '--disable-gpu', '--hide-scrollbars', `--remote-debugging-port=${port}`, '--window-size=1024,768', `--user-data-dir=${resolve(ROOT, 'tools/_edge_exp')}`, 'about:blank'], { stdio: 'ignore' });
  const sleep = ms => new Promise(r => setTimeout(r, ms));
  let ws, id = 0; const pending = new Map(), errors = [];
  for (let i = 0; i < 60 && !ws; i++) { try { const t = (await (await fetch(`http://127.0.0.1:${port}/json`)).json()).find(x => x.type === 'page'); if (t) { ws = new WebSocket(t.webSocketDebuggerUrl); await new Promise((res, rej) => { ws.onopen = res; ws.onerror = rej; }); } } catch (e) { ws = null; await sleep(250); } }
  if (!ws) { ok(false, 'headless Edge started'); proc.kill(); return; }
  ws.onmessage = m => { const d = JSON.parse(m.data); if (d.id && pending.has(d.id)) { pending.get(d.id)(d); pending.delete(d.id); } else if (d.method === 'Runtime.exceptionThrown') errors.push(d.params.exceptionDetails.text + ' ' + (d.params.exceptionDetails.exception?.description || '')); else if (d.method === 'Runtime.consoleAPICalled' && d.params.type === 'error') errors.push('console.error ' + d.params.args.map(a => a.value || a.description).join(' ')); else if (d.method === 'Network.loadingFailed' && !/favicon/.test(d.params.errorText)) errors.push('load failed ' + d.params.errorText); else if (d.method === 'Network.responseReceived' && d.params.response.status >= 400 && !/favicon/.test(d.params.response.url)) errors.push(`HTTP ${d.params.response.status} ${d.params.response.url}`); };
  const send = (method, params = {}) => new Promise(res => { const i = ++id; pending.set(i, res); ws.send(JSON.stringify({ id: i, method, params })); });
  const ev = async expr => { const r = await send('Runtime.evaluate', { expression: expr, awaitPromise: true, returnByValue: true }); if (r.result.exceptionDetails) throw new Error(r.result.exceptionDetails.exception?.description || 'eval error'); return r.result.result.value; };
  const waitFor = async (expr, ms = 8000) => { for (let t = 0; t < ms; t += 150) { if (await ev(expr).catch(() => false)) return true; await sleep(150); } return false; };
  await send('Runtime.enable'); await send('Page.enable'); await send('Network.enable');
  const shotArg = process.argv.find(a => a.startsWith('--shot-dir='));
  const shots = process.argv.includes('--shots') || !!shotArg, SHOT_DIR = resolve(ROOT, shotArg ? shotArg.slice(11) : 'tools/shots/exp'), saved = [];
  if (shots) mkdirSync(SHOT_DIR, { recursive: true });
  const SHOT_NAME = { 'exp-hist': 'recap-ruler', 'exp-rope': 'rope', 'exp-story': 'story', 'exp-pool': 'pool', 'exp-gate': 'fx-rope', 'exp-laws': 'four-laws', 'exp-sum': 'ending', 'exp-ruler': 'ruler', 'exp-five': 'five-places', 'exp-loop': 'loop' };
  const t22 = TBL[I22].tbl, F22 = k => fmtV(t22.raw[k], t22.fmt[k]);
  const HIST1 = steps.findIndex(s => s.panel.id === 'exp-hist');   // the first scrubbable history panel
  for (const [w, h] of [[390, 844], [1024, 768]]) {
    const tag = `${w}×${h}`;
    await send('Emulation.setDeviceMetricsOverride', { width: w, height: h, deviceScaleFactor: w < 500 ? 2 : 1, mobile: w < 500 });
    errors.length = 0;
    await send('Page.navigate', { url: BASE + '?pause=1&lesson=exp' });
    ok(await waitFor(`!!document.querySelector('#ls-card .ls-stitle') && !!document.querySelector('#ls-panel .exg svg')`), `${tag}: ?lesson=exp opens the lesson directly with its panel`);
    ok((await ev(`document.querySelector('#ls-card .ls-ttl').textContent`)).includes('专题：预期'), `${tag}: card title 专题：预期`);
    for (let i = 0; i < steps.length; i++) {
      if (i > 0) { await ev(`document.querySelector('#ls-card [data-act=next]').click()`); }
      const want = steps[i].panel.id;
      const up = await waitFor(`(() => { const p = document.querySelectorAll('#ls-panel .exg'); return p.length === 1 && p[0].dataset.panel === ${JSON.stringify(want)} && !!p[0].querySelector('svg, .exg-laws li'); })()`, 6000);
      ok(up, `${tag} step ${i + 1}: panel ${want} mounted (exactly one)`);
      await sleep(250);
      const lay = await ev(`(() => { const d = document.documentElement, p = document.querySelector('#ls-panel'), e = p && p.querySelector('.exg');
        return { page: d.scrollWidth - d.clientWidth, body: document.body.scrollWidth - window.innerWidth, pnl: e ? e.scrollWidth - e.clientWidth : -1,
          svgOut: e ? [...e.querySelectorAll('svg')].some(s => s.getBoundingClientRect().right > p.getBoundingClientRect().right + 1) : true,
          card: document.querySelector('#ls-card .ls-body').textContent }; })()`);
      ok(lay.page <= 0 && lay.body <= 0 && lay.pnl <= 0 && !lay.svgOut, `${tag} step ${i + 1}: no horizontal scroll (page ${lay.page}, panel ${lay.pnl}, svg out ${lay.svgOut})`);
      ok(!/—|\{[a-z]/i.test(lay.card.replace(/1966–1980|–/g, '')), `${tag} step ${i + 1}: card text has no 「—」 / unfilled placeholder`);
      if (i === I22) {
        const ro = await ev(`document.querySelector('#ls-panel .exg').textContent`);
        ok(['p22', 'm22', 'e22', 'open22', 'real22'].every(k => ro.includes(F22(k))) && lay.card.includes(F22('open22')) && lay.card.includes(F22('real22')), `${tag} step ${i + 1}: panel and card show the engine's 2022Q4 numbers ${['p22', 'm22', 'e22', 'open22', 'real22'].map(F22).join(' ')}`);
        // the ruler look (RULER_STYLE): a wide band on a thin grey staff
        const look = await ev(`(() => { const g = document.querySelector('#ls-panel .exg-gauge'), st = g.querySelector('.exg-rule'), b = g.querySelector('.exg-band.open');
          return { sw: st.getBoundingClientRect().width, bw: b.getBoundingClientRect().width, sc: getComputedStyle(st).stroke, tc: getComputedStyle(document.body).color, bf: getComputedStyle(b).fill }; })()`);
        ok(look.bw >= 5 * look.sw && look.sc !== look.tc && look.bf !== look.sc, `${tag} step ${i + 1}: the ruler reads as a band (band ${look.bw.toFixed(1)}px vs staff ${look.sw.toFixed(1)}px; staff ${look.sc}, not the text colour ${look.tc})`);
      }
      if (i === HIST1) {   // slider reacts
        const r = await ev(`(() => { const s = document.querySelector('#ls-panel [data-exg-k]'); s.value = 0; s.dispatchEvent(new Event('input', { bubbles: true })); return document.querySelector('#ls-panel .exg-slr b').textContent; })()`);
        ok(r === '2020Q1', `${tag} step ${i + 1}: slider scrubs (${r})`);
        const k = rows.findIndex(x => x.date === '2022Q1');
        await ev(`(() => { const s = document.querySelector('#ls-panel [data-exg-k]'); s.value = ${k - rows.findIndex(x => x.date === '2020Q1')}; s.dispatchEvent(new Event('input', { bubbles: true })); })()`);
        const t = await ev(`document.querySelector('#ls-panel .exg-ro').textContent`);
        ok(t.includes(G.pc(rows[k].p)) && t.includes(G.pc(rows[k].m)) && t.includes(G.pc(rows[k].e)), `${tag} step ${i + 1}: readout at 2022Q1 = engine (${t.slice(0, 40)})`);
      }
      if (steps[i].panel.id === 'exp-five') {   // five places: DOM order = computed rank, lit set + numbers = engine at several quarters
        const F = G.fiveTurns(rows), from = rows.findIndex(x => x.date === EXP_FIVE.from);
        for (const d of ['2022Q4', '2023Q2', '2023Q4', '2024Q1', '2024Q4']) {
          await ev(`(() => { const s = document.querySelector('#ls-panel [data-exg-k]'); s.value = ${rows.findIndex(x => x.date === d) - from}; s.dispatchEvent(new Event('input', { bubbles: true })); })()`);
          const dom = await ev(`[...document.querySelectorAll('#ls-panel .exg-pl')].map(n => ({ id: n.dataset.place, lit: n.classList.contains('lit'), t: n.textContent }))`);
          const K = rows.findIndex(x => x.date === d), s = usHist[K], y = usHist[K - 4];
          const expLit = F.places.filter(p => p.turn && d >= p.turn).map(p => p.id).sort().join();
          const domIds = dom.filter(x => x.id !== 'hole');
          const rankOk = domIds.every((x, j) => !j || (F.places.find(p => p.id === x.id).rank || 9) >= (F.places.find(p => p.id === domIds[j - 1].id).rank || 9));
          const nums = { pump: G.sg(s.flows.newLoans / y.flows.newLoans - 1, 0), lake: G.pc(s.household.savingRate), pool: G.sg(s.assets.bond.price / y.assets.bond.price - 1, 0), river: G.pc(s.macro.unemployment), hole: G.pc(s.gov.debtGdp) };
          ok(rankOk && domIds.filter(x => x.lit).map(x => x.id).sort().join() === expLit && dom.every(x => x.t.includes(nums[x.id])), `${tag} step ${i + 1} @${d}: icons in computed order, lit = {${expLit}}, numbers = engine`);
        }
      }
      if (steps[i].panel.id === 'exp-rope') {   // rope toy buttons
        for (const [p, r] of [['oil', 'cut'], ['heat', 'AUS'], ['heat', 'USA']]) {
          await ev(`document.querySelector('#ls-panel [data-exg="path:${p}"]').click()`); await ev(`document.querySelector('#ls-panel [data-exg="rope:${r}"]').click()`);
          const t = await ev(`document.querySelector('#ls-panel .exg-ro').textContent`), end = G.toyRun(p, r).end;
          ok(t.includes(G.pc(end.e)) && t.includes(G.ropeWord(end.dean, r === 'cut')), `${tag} step ${i + 1}: toy ${p}/${r} → ▽ ${G.pc(end.e)}, 绳 ${G.ropeWord(end.dean, r === 'cut')}`);
        }
      }
      if (steps[i].panel.id === 'exp-gate') {   // the gate: ▶差 from the data, ▽汇 slider, story lines = the FRED / repo data
        const gap = G.audGap('2008Q2'), txt0 = await ev(`document.querySelector('#ls-panel .exg').textContent`);
        await ev(`(() => { const s = document.querySelector('#ls-panel [data-exg-dep]'); s.value = 80; s.dispatchEvent(new Event('input', { bubbles: true })); })()`);
        const txt1 = await ev(`document.querySelector('#ls-panel .exg').textContent`);
        const push = (gap - 0.08) * 100, want = (push >= 0 ? '+' : '−') + Math.abs(push).toFixed(1) + ' 个点';
        ok(txt0.includes((gap * 100).toFixed(1) + ' 个点') && txt1.includes('真推力 = ' + want), `${tag} step ${i + 1}: gate ▶差 ${(gap * 100).toFixed(1)} from the data; ▽汇 8% → 真推力 ${want}`);
        for (const id of ['gbp', 'thb', 'aud']) {
          await ev(`document.querySelector('#ls-panel [data-exg="story:${id}"]').click()`);
          const line = await ev(`document.querySelector('#ls-panel [data-story-line]').textContent`);
          ok(line === G.gateStory(id).line && /\d/.test(line), `${tag} step ${i + 1}: story ${id}: 「${line}」`);
        }
        await ev(`document.querySelector('#ls-panel [data-exg="story:thb"]').click()`);
      }
      if (shots) {
        const pid = steps[i].panel.id;
        if (pid === 'exp-rope') { await ev(`document.querySelector('#ls-panel [data-exg="path:heat"]').click()`); await ev(`document.querySelector('#ls-panel [data-exg="rope:USA"]').click()`); }
        if (pid === 'exp-hist') await ev(`(() => { const s = document.querySelector('#ls-panel [data-exg-k]'); s.value = ${rows.findIndex(x => x.date === (steps[i].panel.date || '2022Q1')) - rows.findIndex(x => x.date === '2020Q1')}; s.dispatchEvent(new Event('input', { bubbles: true })); })()`);
        if (pid === 'exp-five') await ev(`(() => { const s = document.querySelector('#ls-panel [data-exg-k]'); s.value = ${rows.findIndex(x => x.date === '2023Q4') - rows.findIndex(x => x.date === EXP_FIVE.from)}; s.dispatchEvent(new Event('input', { bubbles: true })); })()`);
        await sleep(300);
        const r = await send('Page.captureScreenshot', { format: 'png' });
        const f = resolve(SHOT_DIR, `exp-s${i}-${SHOT_NAME[pid] || pid}-${w}x${h}.png`); writeFileSync(f, Buffer.from(r.result.data, 'base64')); saved.push(f);
      }
    }
    ok(await ev(`!!document.querySelector('#ls-card .ls-end')`), `${tag}: last step shows the 三问 block`);
    await ev(`document.querySelector('#ls-card [data-act=exit]').click()`);
    ok(await waitFor(`!document.querySelector('#ls-panel') && !document.querySelector('.exg') && !document.querySelector('#diagram.ls-pnl-on')`), `${tag}: exit unmounts the panel cleanly`);
    ok(!errors.length, `${tag}: no JS errors ${errors.slice(0, 3).join(' | ')}`);
    // the menu
    errors.length = 0;
    await send('Page.navigate', { url: BASE + '?pause=1&menu=1' });
    ok(await waitFor(`!!document.querySelector('#ls-menu .ls-topics')`), `${tag}: menu has the 专题 group`);
    const menu = await ev(`(() => ({ lead: document.querySelector('#ls-menu .ls-lead').textContent, main: document.querySelectorAll('#ls-menu .ls-main .ls-item').length,
      inMain: [...document.querySelectorAll('#ls-menu .ls-main .ls-item')].some(b => b.dataset.id === 'exp'), sec: document.querySelector('#ls-menu .ls-topic-h').textContent, parts: document.querySelectorAll('#ls-menu h3.ls-sec').length,
      item: (document.querySelector('#ls-menu .ls-topics .ls-item[data-id="exp"]') || {}).textContent || '' }))()`);
    ok(menu.main === 9 && menu.parts === 4 && /9 课/.test(menu.lead) && !menu.inMain, `${tag}: the 9 main lessons (${menu.main}, 「${menu.lead.slice(0, 18)}」), exp not among them`);
    ok(menu.sec.startsWith('专题') && menu.item.includes('专题：预期'), `${tag}: menu shows 「专题：预期」 under 「专题」`);
    if (shots && w === 390) { const r = await send('Page.captureScreenshot', { format: 'png' }); const f = resolve(SHOT_DIR, `exp-menu-${w}x${h}.png`); writeFileSync(f, Buffer.from(r.result.data, 'base64')); saved.push(f); }
    await ev(`document.querySelector('#ls-menu .ls-topics .ls-item[data-id="exp"]').click()`);
    ok(await waitFor(`!!document.querySelector('#ls-panel .exg[data-panel="${steps[0].panel.id}"]')`), `${tag}: tapping it in the menu starts the lesson`);
    ok(!errors.length, `${tag}: menu, no JS errors ${errors.slice(0, 3).join(' | ')}`);
    // the L6 pointer opens this lesson at 「汇率上的绳」
    const fi = LESSON_FX.steps.findIndex(s => s.lessonLink);
    await send('Page.navigate', { url: BASE + `?pause=1&lesson=fx&step=${fi}` });
    ok(await waitFor(`!!document.querySelector('#ls-card a.ls-lessonlink')`), `${tag}: L6 step ${fi + 1} shows the pointer to 「汇率上的绳」`);
    const href = await ev(`document.querySelector('#ls-card a.ls-lessonlink').href`);
    await send('Page.navigate', { url: href });
    ok(await waitFor(`!!document.querySelector('#ls-panel .exg[data-panel="exp-gate"]') && document.querySelector('#ls-card .ls-stitle').textContent.includes('汇率上的绳')`), `${tag}: the pointer opens 专题：预期 at 「汇率上的绳」 (${href.replace(BASE, '')})`);
    ok(!errors.length, `${tag}: L6 pointer, no JS errors ${errors.slice(0, 3).join(' | ')}`);
  }
  if (saved.length) console.log('screenshots:\n  ' + saved.join('\n  '));
  ws.close(); proc.kill();
}
if (!process.argv.includes('--no-browser')) await browser();

console.log(`\ncheck_lesson_exp: ${oks} ok, ${fails} FAIL`);
process.exit(fails ? 1 : 0);
