// node tools/check_lesson_investor.mjs [--no-browser] [--verbose]
// Checks the capstone lesson 「投资者」 (src/data/lesson-investor.js) and its panels (src/ui/investor-lab.js):
//  1. structure   lesson shape, intro '下面分 N 步' = N steps, every panel id exists, concept ids exist, dates exist in the country's data,
//                 no 同比/环比 anywhere, practice cards exist in the blind deck and are NOT cards this lesson reveals (no spoilers)
//  2. asset table ASSET_ROWS = handover_macro.md §4.3 cell by cell (../dalio_432 is read-only; WARN if missing)
//  3. JST data    JPN_JST = recomputed from ../dalio_432/data/jst_panel.csv (WARN if missing); JPN_SIGNALS years = recomputed
//  4. claims      every claim's number is recomputed from repo data, formatted, equal to `shown`, and `shown` appears in its step's text
//  5. toy         the real-rate toy formulas: bonds, gold and equity valuation all fall as the real rate rises (they move together)
//  5b. 开阀       step 4: assets read 10 年期利率 − ▽ (engine rates.gov10y − macro.inflationExp, AUS sim 2009Q1, vals + derive), the slider
//                 starts there, the toy label says so, the panel's 「现在」 marker uses the same number (not rates.realPolicy)
//  6. browser     headless Edge runs tools/investor-lab-demo.html?selftest=1 (light + dark, iPad right panel + phone width): every panel
//                 mounts, reacts (follow the sim / tap / slide), unmounts leaving the host empty, no JS errors, no horizontal overflow,
//                 and shows the key numbers. Uses a small node static server on port 8292 (closed at the end).
// Exit code 1 on any FAIL.
import { readFileSync, existsSync } from 'node:fs';
import { spawn } from 'node:child_process';
import { createServer } from 'node:http';
import { resolve, extname, join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { LESSON_INVESTOR, ASSET_ROWS, ASSET_COLS, JPN_JST, JPN_SIGNALS, TOY, nowRate } from '../src/data/lesson-investor.js';
import { BLIND } from '../src/data/blind-cards.js';
import { CONCEPTS } from '../src/data/concepts.js';
import { AUS_Q } from '../src/data/countries/aus-quarterly.js';
import { JPN_Q } from '../src/data/countries/jpn-quarterly.js';
import { CHN_Q } from '../src/data/countries/chn-quarterly.js';
import { evalGet, buildTable, fillStep, fmtV } from '../src/ui/lessons-town.js';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const DALIO = resolve(ROOT, '../dalio_432');
const verbose = process.argv.includes('--verbose');
let fails = 0, warns = 0, oks = 0;
const FAIL = m => { fails++; console.log('FAIL ' + m); };
const WARN = m => { warns++; console.log('WARN ' + m); };
const OK = m => { oks++; if (verbose) console.log('ok   ' + m); };
const check = (c, m) => (c ? OK(m) : FAIL(m));
const MINUS = '−';
const fmt = {
  x0: v => Math.round(v) + ' 倍',
  pctile: v => Math.round(v * 100) + ' 分位',
  spct0: v => (v > 0 ? '+' : v < 0 ? MINUS : '') + Math.abs(Math.round(v * 100)) + '%',
  apct0: v => Math.abs(Math.round(v * 100)) + '%',
  n2: v => v.toFixed(2),
  raw: v => String(v),
};
const get = (o, p) => p.split('.').reduce((a, k) => (a == null ? a : a[k]), o);
const L = LESSON_INVESTOR, steps = L.steps;
// a step's text, plus the 三问 ending of the last step (course v3: rendered by the runner under the text)
const textOf = st => [].concat(st.text || [], st.ending ? [st.ending.q1, st.ending.q2, st.ending.q3] : []).join('\n');
const allText = steps.map(textOf).join('\n') + '\n' + L.oneLine + '\n' + L.title;

/* ---------- 1. structure ---------- */
const labSrc = readFileSync(join(ROOT, 'src/ui/investor-lab.js'), 'utf8');
const PANEL_IDS = JSON.parse((labSrc.match(/INVESTOR_PANEL_IDS = (\[[^\]]*\])/) || [, '[]'])[1].replace(/'/g, '"'));
check(L.id && L.title === '投资者' && Array.isArray(steps) && steps.length >= 2, 'lesson shape (id, title 投资者, steps)');
const intro = textOf(steps[0]), mN = intro.match(/下面分 (\d+) 步：([^\n]*)/);
check(steps[0].type === 'intro' && mN && +mN[1] === steps.length - 1, `intro '下面分 N 步' = ${steps.length - 1}`);
if (mN) check(mN[2].replace(/。$/, '').split('→').length === +mN[1], 'intro outline lists N items');
const pSteps = steps.filter(s => s.panel);
// course v3: one question, at most 6 steps (intro included), the lake zoom is one of them
check(steps.length <= 6 && pSteps.length === steps.length - 1 && PANEL_IDS.length === 8 && PANEL_IDS.includes('lake'), `v3: ${steps.length} steps (≤ 6), ${pSteps.length} panel steps, ${PANEL_IDS.length} panel ids incl. lake`);
check(L.question === '钱放哪？' && /钱放哪/.test(textOf(steps[0])) && /债 → 股 → 房/.test(textOf(steps[0])), 'v3: question 钱放哪？ and the 2009 order 债 → 股 → 房 in the intro');
check(pSteps.some(s => s.panel.id === 'lake'), 'v3: the lake zoom is a step');
check(!/资产缓冲池|商品河道|欠条箱|资本管|商品价格管/.test(allText), 'v3: no old glossary words in the lesson');
// the read-only sub-indices: the engine's equity constants, three styles, run on the AUS sim, no feedback into the engine
{
  const eco = readFileSync(join(ROOT, 'src/engine/economy.js'), 'utf8'), sub = readFileSync(join(ROOT, 'src/data/sub-index.js'), 'utf8');
  const cst = src => Object.fromEntries([...src.matchAll(/\b(EARN_EMA|ERP0|ERP_RP|ERP_BAD|PE_FLOOR_DEN|PE_REV|PE_MOM|PE_STEP|PE_LO|PE_HI) = ([\d.]+)/g)].map(m => [m[1], +m[2]]));
  const a = cst(eco), b = cst(sub);
  check(Object.keys(a).length === 10 && Object.keys(a).every(k => a[k] === b[k]), 'sub-index constants = the engine equity constants ' + JSON.stringify(b));
  check(!/from '\.\.\/engine|import\s/.test(sub), 'sub-index imports nothing (read-only, no feedback into the engine)');
  const { createSim } = await import('../src/engine/sim.js');
  const { subIndices } = await import('../src/data/sub-index.js');
  const sim = createSim({ data: AUS_Q, mode: 'history', country: 'AUS' });
  while (!sim.done) sim.step();
  const H = sim.history(), eq0 = H.map(s => s.assets.equity.price);
  const S = Object.fromEntries(subIndices(H).map(s => [s.k, s]));
  check(['stable', 'growth', 'cyclical'].every(k => S[k] && S[k].series.length === H.length && S[k].series.every(p => isFinite(p.price) && p.price > 0)), `sub-indices: 3 finite series over ${H.length} quarters`);
  const vol = k => { const p = S[k].series.map(x => x.price), r = p.slice(1).map((v, i) => Math.log(v / p[i])), m = r.reduce((x, y) => x + y, 0) / r.length; return Math.sqrt(r.reduce((x, y) => x + (y - m) ** 2, 0) / r.length); };
  check(vol('growth') > vol('stable') && vol('cyclical') > vol('stable'), `sub-indices: narrow / river-flow pools jump more (vol growth ${vol('growth').toFixed(3)}, cyclical ${vol('cyclical').toFixed(3)} > stable ${vol('stable').toFixed(3)})`);
  check(H.map(s => s.assets.equity.price).every((v, i) => v === eq0[i]), 'sub-indices leave the engine equity pool untouched');
}
// the sub-indices vs reality (Kenneth French portfolios, src/data/french-check.js, built by tools/build_french_check.py):
// US history sim, Q4-to-Q4 changes 1996-2021 (never 2022+). Volatility order must match reality; correlations are reported.
{
  const { FRENCH, FRENCH_RESULT: R } = await import('../src/data/french-check.js');
  const { US_Q } = await import('../src/data/us-quarterly.js');
  const { createSim } = await import('../src/engine/sim.js');
  const { subIndices } = await import('../src/data/sub-index.js');
  check(FRENCH.years[0] === 1995 && FRENCH.years.at(-1) === 2021 && ['stable', 'growth', 'cyclical'].every(k => FRENCH.styles[k].length === FRENCH.years.length && FRENCH.styles[k].every(isFinite)), 'French data: 1995–2021 only, three styles, finite');
  const sim = createSim({ data: US_Q, mode: 'history' });
  while (!sim.done) sim.step();
  const H = sim.history(), yrs = FRENCH.years.filter(y => y >= 1996 && y <= 2021);
  const q4 = ser => Object.fromEntries(ser.filter(p => /Q4$/.test(p.date)).map(p => [+p.date.slice(0, 4), p.price]));
  const chg = by => yrs.map(y => by[y] / by[y - 1] - 1);
  const mean = a => a.reduce((x, y) => x + y, 0) / a.length;
  const corr = (a, b) => { const ma = mean(a), mb = mean(b); let c = 0, va = 0, vb = 0; a.forEach((x, i) => { c += (x - ma) * (b[i] - mb); va += (x - ma) ** 2; vb += (b[i] - mb) ** 2; }); return c / Math.sqrt(va * vb); };
  const sd = a => { const l = a.map(x => Math.log(1 + x)), m = mean(l); return Math.sqrt(l.reduce((x, y) => x + (y - m) ** 2, 0) / (l.length - 1)); };
  const real = k => yrs.map(y => FRENCH.styles[k][FRENCH.years.indexOf(y)]);
  const M = Object.fromEntries(subIndices(H).map(s => [s.k, chg(q4(s.series))]));
  const eng = chg(q4(H.map(h => ({ date: h.date, price: h.assets.equity.price }))));
  const mkt = yrs.map((y, i) => mean(Object.values(FRENCH.industries).map(a => a[FRENCH.years.indexOf(y)])));
  const K = ['stable', 'growth', 'cyclical'];
  const C = Object.fromEntries(K.map(k => [k, corr(M[k], real(k))])); C.engineVsMarket = corr(eng, mkt);
  const vM = Object.fromEntries(K.map(k => [k, sd(M[k])])), vR = Object.fromEntries(K.map(k => [k, sd(real(k))]));
  const order = v => [...K].sort((a, b) => v[a] - v[b]).join(' < ');
  console.log(`info sub-indices vs French ${yrs[0]}–${yrs.at(-1)}: corr of annual changes ${K.map(k => `${k} ${C[k].toFixed(2)}`).join(', ')} (engine equity vs real market ${C.engineVsMarket.toFixed(2)})`);
  console.log(`info vol (st. dev. of annual log changes): model ${K.map(k => `${k} ${vM[k].toFixed(3)}`).join(', ')}; real ${K.map(k => `${k} ${vR[k].toFixed(3)}`).join(', ')}`);
  check(vM.cyclical > vM.stable && vR.cyclical > vR.stable, `French: 周期股 swings more than 稳股 in the model (${vM.cyclical.toFixed(3)} > ${vM.stable.toFixed(3)}) and in reality (${vR.cyclical.toFixed(3)} > ${vR.stable.toFixed(3)})`);
  check(order(vM) === order(vR), `French: volatility order model = reality (${order(vM)} | ${order(vR)})`);
  check(K.every(k => isFinite(C[k])), 'French: correlations computed');
  const drift = R && [...K.map(k => [C[k], R.corr[k]]), [C.engineVsMarket, R.corr.engineVsMarket], ...K.map(k => [vM[k], R.volModel[k]]), ...K.map(k => [vR[k], R.volReal[k]])].some(([a, b]) => Math.abs(a - b) > 0.03);
  if (!R || drift) WARN('French: FRENCH_RESULT in src/data/french-check.js is stale (the engine changed?): update it with the info lines above');
  else OK('French: FRENCH_RESULT matches the recomputed numbers');
}
for (const s of pSteps) check(PANEL_IDS.includes(s.panel.id), `panel id '${s.panel.id}' exists`);
check(new Set(pSteps.map(s => s.panel.id)).size === pSteps.length, 'each panel used once');
steps.forEach((s, i) => { if (i > 0) check(s.title && s.title.startsWith(`第 ${i} 步`), `step ${i} title numbered`); });
// course v3 (tools/COURSE-V3.md): 第 8 课, ends with the 3 practice cards -> 历史盲测 and the fixed 三问 ending, then hands over to L9 now
{
  const last = steps[steps.length - 1], e = last.ending, Qs = ['水的问题还是河道的问题？', '环上哪一步？', '谁赢谁输、钱放哪？'];
  check(L.label === '第 8 课' && last.panel?.id === 'blind' && last.next === 'now', 'course v3: 第 8 课, last step = the blind links, hands over to L9 now (现在在哪)');
  check(e && ['q1', 'q2', 'q3'].every((k, j) => typeof e[k] === 'string' && e[k].startsWith(Qs[j]) && e[k].length > Qs[j].length + 8), 'last step: the 三问 ending (q1 q2 q3, each starts with its question)');
  check(steps.slice(0, -1).every(s => !s.ending), 'only the last step has the ending');
}
for (const s of steps) for (const c of [].concat(s.concept || [])) check(!!CONCEPTS[c], `concept '${c}' exists`);
for (const d of [L.startDate, L.endDate, ...steps.map(s => s.until).filter(Boolean)]) check(AUS_Q.dates.includes(d), `date ${d} in ${L.country} data`);
for (const [name, src] of [['lesson', allText], ['lab', labSrc], ['css', readFileSync(join(ROOT, 'assets/css/investor-lab.css'), 'utf8')],
  ['lake', readFileSync(join(ROOT, 'src/ui/asset-lake.js'), 'utf8')], ['lake css', readFileSync(join(ROOT, 'assets/css/asset-lake.css'), 'utf8')], ['sub-index', readFileSync(join(ROOT, 'src/data/sub-index.js'), 'utf8')]])
  check(!/同比|环比/.test(src), `no 同比/环比 in ${name}`);
const BY = Object.fromEntries(BLIND.cards.map(c => [c.id, c]));
const revealed = new Set();
for (const s of steps) { for (const c of s.claims || []) if (c.card) revealed.add(c.card); const p = s.panel || {}; if (p.id === 'priced') [...(p.cards || []), p.extra].forEach(x => x && revealed.add(x)); }
revealed.add('AUS-2008');                                        // the fx panel quotes this card's 2009 returns
const practice = steps.find(s => s.panel?.id === 'blind')?.panel.cards || [];
check(practice.length === 3, '3 practice cards');
for (const id of practice) { check(!!BY[id], `practice card ${id} is in the deck`); check(!revealed.has(id), `practice card ${id} is not revealed by the lesson`); }
check(new Set(practice.map(id => BY[id]?.type)).size === 3, 'practice cards cover 危 / 转 / 平');

/* ---------- 2. asset table vs handover §4.3 ---------- */
const hoPath = join(DALIO, 'closeout/handover_macro.md');
if (!existsSync(hoPath)) WARN('handover_macro.md not found: asset table not compared');
else {
  const md = readFileSync(hoPath, 'utf8'), sec = md.slice(md.indexOf('**4.3'), md.indexOf('## 5.'));
  const rows = sec.split('\n').filter(l => /^\|/.test(l) && !/^\|[-|]+\|$/.test(l.trim())).map(l => l.split('|').slice(1, -1).map(x => x.trim()));
  const head = rows.shift();
  check(head && head.slice(1).join(',') === ASSET_COLS.map(c => c.name).join(','), 'asset table columns = handover §4.3');
  check(rows.length === ASSET_ROWS.length, `asset table rows = ${rows.length}`);
  rows.forEach((r, i) => {
    const R = ASSET_ROWS[i];
    check(R && R.stage === r[0] && ASSET_COLS.every((c, k) => R.cells[c.k] === r[k + 1]), `asset row '${r[0]}' matches cell by cell`);
  });
}

/* ---------- 3. JST data ---------- */
const jy = i => JPN_JST.from + i, jIdx = y => y - JPN_JST.from;
const csvPath = join(DALIO, 'data/jst_panel.csv');
if (!existsSync(csvPath)) WARN('jst_panel.csv not found: JPN_JST not recomputed');
else {
  const lines = readFileSync(csvPath, 'utf8').trim().split(/\r?\n/), H = lines[0].split(',');
  const by = {};
  for (const l of lines.slice(1)) { const r = l.split(','); if (r[0] !== 'JPN') continue; const o = Object.fromEntries(H.map((h, i) => [h, r[i] === '' ? null : +r[i]])); by[o.year] = o; }
  let lv = 1; const eq = {}; for (let y = 1980; y <= 2020; y++) { lv *= 1 + (by[y].eq_capgain ?? 0); eq[y] = lv; }
  const calc = {
    equity: y => eq[y] / eq[1989] * 100,
    credit: y => (by[y].thh + by[y].tbus) / by[y].gdp * 100,
    houseReal: y => by[y].hpnom / by[y].cpi / (by[1991].hpnom / by[1991].cpi) * 100,
    gMinusR: y => (by[y].gdp / by[y - 1].gdp - 1) * 100 - by[y].ltrate,
  };
  for (const k of Object.keys(calc)) {
    const bad = JPN_JST[k].map((v, i) => [jy(i), v, calc[k](jy(i))]).filter(([, v, c]) => Math.abs(v - c) > 0.051);
    check(!bad.length && JPN_JST[k].length === 2020 - JPN_JST.from + 1, `JPN_JST.${k} = JST recomputed${bad.length ? ' ' + JSON.stringify(bad.slice(0, 3)) : ''}`);
  }
}
const argmin = (arr, y0) => { let b = null; arr.forEach((v, i) => { if (jy(i) >= y0 && (b == null || v < arr[jIdx(b)])) b = jy(i); }); return b; };
const firstRun = (cond, y0, n = 3) => { for (let y = y0; jIdx(y + n - 1) < JPN_JST.equity.length; y++) { let ok = true; for (let k = 0; k < n; k++) ok = ok && cond(y + k); if (ok) return y; } return null; };
// CPI confirmed: the first quarter of the run of quarters with CPI >= 2% that lasts to the end of the data
const cq = JPN_Q.series.cpiYoY; let ci = cq.length; while (ci > 0 && cq[ci - 1] >= 0.02) ci--;
const cpiConfirmQ = ci < cq.length ? JPN_Q.dates[ci] : null;
const eqI = JPN_Q.series.equityIndex, eq2012 = Math.min(...JPN_Q.dates.map((d, i) => (d.startsWith('2012') ? eqI[i] : Infinity)));
const JST = {
  creditTrough: argmin(JPN_JST.credit, 1995),
  houseTrough: argmin(JPN_JST.houseReal, 1991),
  grRun: firstRun(y => JPN_JST.gMinusR[jIdx(y)] > 0, 1991),
  equityTroughYear: argmin(JPN_JST.equity, 1990),
  cpiConfirm: cpiConfirmQ ? +cpiConfirmQ.slice(0, 4) : null,
  equityMultiple: cpiConfirmQ ? eqI[ci] / eq2012 : null,
};
if (verbose) console.log('     computed', JSON.stringify({ ...JST, cpiConfirmQ, eq2012 }));
const SIG = { credit: JST.creditTrough, house: JST.houseTrough, gr: JST.grRun, cpi: JST.cpiConfirm };
for (const s of JPN_SIGNALS) check(SIG[s.id] === s.year, `signal '${s.name}' year ${s.year} = data (${SIG[s.id]})`);
check(cq.slice(ci).length >= 8, `CPI ≥ 2% for ${cq.length - ci} quarters from ${cpiConfirmQ} (not a blip)`);
// the false start 2003-07: one signal lit, equity up from 2003 to 2007, then back below the 2003 level within two years
{
  const e = y => JPN_JST.equity[jIdx(y)];
  const lit = y => JPN_SIGNALS.filter(s => y >= s.year).length;
  check(lit(2003) <= 1 && lit(2007) === 1 && e(2007) > e(2003) * 1.5 && Math.min(e(2008), e(2009)) < e(2003), '2003–07 false start: 1 signal, equity up then back');
  check(lit(2013) === 3, '2013: three signals lit');
}

/* ---------- 4. claims ---------- */
const xAt = (Q, d) => Q.series.fxPerUsd[Q.dates.indexOf(d)];
const cross = (pair, d) => { const a = xAt(AUS_Q, d); return pair === 'USD' ? 1 / a : pair === 'JPY' ? xAt(JPN_Q, d) / a : xAt(CHN_Q, d) / a; };
const specs = [];
steps.forEach((st, i) => {
  const txt = textOf(st);
  for (const c of st.claims || []) {
    const where = `step ${i} '${c.shown}'`;
    check(txt.includes(c.shown), `${where} appears in the text`);
    let v = null, f = c.fmt;
    if (c.src === 'spec') { specs.push(`${where}: ${c.note}`); continue; }
    if (c.src === 'sim') {      // an engine getter on the AUS sim (history mode, all rules on), as check_lessons.mjs evaluates claims
      let r; try { r = evalGet(AUS_Q, { id: 'invchk', rulesOn: 'all', mode: 'history', country: 'AUS' }, { get: c.get }, { from: c.from, until: c.until }); } catch (e) { r = 'ERROR ' + e.message; }
      const pass = c.eq !== undefined ? String(r) === String(c.eq) : typeof r === 'number' && (c.lt === undefined || r < c.lt) && (c.gt === undefined || r > c.gt);
      check(pass, `${where} = sim ${c.get} ${c.from}–${c.until} → ${r} (${c.note})`);
      continue;
    }
    if (c.src === 'blind') { const card = BY[c.card]; if (!card) { FAIL(`${where}: card ${c.card} missing`); continue; } v = get(card, c.path); }
    else if (c.src === 'fx') v = c.what === 'audUsd' ? 1 / xAt(AUS_Q, c.at) : 1 - cross(c.pair, c.until) / cross(c.pair, c.from);
    else if (c.src === 'jst' || c.src === 'jpnq') {
      if (c.what === 'equityAt') { v = JPN_JST.equity[jIdx(c.year)]; f = 'int'; }
      else if (c.what === 'falseStart') { v = '2003–07'; f = 'raw'; }
      else if (c.what === 'equityMultiple') { v = JST.equityMultiple; f = 'x1'; }
      else { v = JST[c.what]; f = 'raw'; }
    }
    const shown = f === 'int' ? String(Math.round(v)) : f === 'x1' ? v.toFixed(1) + ' 倍' : f === 'n2' ? fmt.n2(v) + ' 美元' : fmt[f] ? fmt[f](v) : String(v);
    check(v != null && shown === c.shown, `${where} = ${c.src}${c.card ? ' ' + c.card + ' ' + c.path : ''}${c.pair ? ' ' + c.pair : ''} → '${shown}'`);
  }
});
// the AUD fall the spec calls "about 35%": state the exact repo figure
const audFall = 1 - cross('USD', '2009Q1') / cross('USD', '2008Q2');
console.log(`info AUD vs USD, quarterly means 2008Q2 → 2009Q1: ${(audFall * 100).toFixed(1)}% (spec: about 35%, which is the daily high-to-low)`);
specs.forEach(s => console.log('spec ' + s));

/* ---------- 5. toy formulas ---------- */
{
  const bond = r => ((1 + TOY.r0) / (1 + r)) ** TOY.bondYears, gold = r => ((1 + TOY.r0) / (1 + r)) ** TOY.goldYears, pe = r => 1 / (r + TOY.erp - TOY.growth);
  let mono = true; for (let r = TOY.rMin; r < TOY.rMax; r += 0.0025) mono = mono && bond(r + 0.0025) < bond(r) && gold(r + 0.0025) < gold(r) && pe(r + 0.0025) < pe(r);
  check(mono && TOY.rMin + TOY.erp - TOY.growth > 0, 'toy: bonds, gold, equity valuation all fall as the real rate rises (finite on the slider range)');
  check(/玩具/.test(textOf(steps.find(s => s.panel?.id === 'realRate'))) && /玩具公式/.test(labSrc), 'toy formulas are labelled 玩具');
  check(/还没有用数据逐格验证/.test(textOf(steps.find(s => s.panel?.id === 'assetTable'))) && /还没有用数据逐格验证/.test(labSrc), 'asset table says it is not verified cell by cell');
}

/* ---------- 5b. step 4: assets read 开阀 = 10 年期利率 − ▽ (live engine numbers via vals / derive, as src/ui/lessons.js fills them) ---------- */
{
  const si = steps.findIndex(s => s.panel?.id === 'realRate'), st = steps[si];
  const tbl = buildTable(AUS_Q, L, st, { from: L.startDate, until: L.endDate });
  for (const d of [].concat(st.derive || [])) { const a = tbl.raw[d.a], b = tbl.raw[d.b]; tbl.raw[d.key] = typeof a === 'number' && typeof b === 'number' ? a - b : null; tbl.fmt[d.key] = d.fmt; }
  const miss = [], filled = fillStep({ text: st.text }, tbl, miss).text.join('\n');
  check(!miss.length && !/[{}]/.test(filled) && !/—/.test(filled), `step ${si}: every placeholder filled ${miss.join(' ')}`);
  // independent: the AUS sim's own snapshot at 2009Q1
  const { createSim } = await import('../src/engine/sim.js');
  const sim = createSim({ data: AUS_Q, mode: 'history', country: 'AUS' }); while (!sim.done) sim.step();
  const s9 = sim.history().find(h => h.date === '2009Q1'), open = s9.rates.gov10y - s9.macro.inflationExp;
  check(Math.abs(tbl.raw.open09 - open) < 1e-12 && Math.abs(nowRate(s9) - open) < 1e-12, `step ${si}: 开阀 2009Q1 = 10 年期 ${fmtV(s9.rates.gov10y, 'pct')} − ▽ ${fmtV(s9.macro.inflationExp, 'pct')} = ${fmtV(open, 'chg1')} (card ${fmtV(tbl.raw.open09, 'chg1')}, nowRate)`);
  check(Math.abs(tbl.raw.real09 - s9.rates.realPolicy) < 1e-12 && filled.includes(fmtV(s9.rates.realPolicy, 'chg1')), `step ${si}: 结账 政策利率 − ▼ 2009Q1 = ${fmtV(s9.rates.realPolicy, 'chg1')} shown for contrast`);
  check(st.panel.def === Math.round(open / 0.0025) * 0.0025, `step ${si}: the slider starts at 开阀 2009Q1 on its 0.25-point grid (def ${st.panel.def})`);
  check(/10 年期利率 − ▽/.test(TOY.rateName) && /10 年期/.test(st.title) && /开阀/.test(filled) && /▽/.test(filled), `step ${si}: title, text and the toy label say 开阀 = 10 年期 − ▽ (「${TOY.rateName}」)`);
  const eco = readFileSync(join(ROOT, 'src/engine/economy.js'), 'utf8');
  check(/S\.real10y = S\.gov10y - S\.piE/.test(eco) && /S\.gov10y \+ erp - \(S0\.piE/.test(eco), 'engine: bonds / gold (real10y) and the P/E use 10 年期 − ▽ (piE)');
  const rr = labSrc.slice(labSrc.indexOf('3. realRate'), labSrc.indexOf('4. priced'));
  check(/nowRate\(/.test(rr) && !/realPolicy/.test(rr) && /TOY\.rateName/.test(rr), 'realRate panel: label = TOY.rateName, 「现在」 = nowRate (10 年期 − ▽), not rates.realPolicy');
}

/* ---------- 6. headless Edge ---------- */
const EDGE = 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe';
// async (the static server lives in this process: a sync spawn would block it)
const run = (cmd, args) => new Promise(res => {
  const p = spawn(cmd, args, { stdio: ['ignore', 'pipe', 'ignore'] });
  let out = ''; p.stdout.setEncoding('utf8'); p.stdout.on('data', d => { out += d; });
  const tm = setTimeout(() => p.kill(), 120000);
  p.on('close', status => { clearTimeout(tm); res({ stdout: out, status }); });
});
async function browser() {
  if (process.argv.includes('--no-browser')) { WARN('browser checks skipped (--no-browser)'); return; }
  if (!existsSync(EDGE)) { WARN('msedge not found: browser checks skipped'); return; }
  const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.png': 'image/png', '.svg': 'image/svg+xml' };
  const srv = createServer((req, res) => {
    const p = decodeURIComponent(new URL(req.url, 'http://x').pathname), f = join(ROOT, p.endsWith('/') ? p + 'index.html' : p);
    if (!f.startsWith(ROOT) || !existsSync(f)) { res.writeHead(404); res.end(); return; }
    res.writeHead(200, { 'Content-Type': (MIME[extname(f)] || 'application/octet-stream') + '; charset=utf-8' }); res.end(readFileSync(f));
  });
  await new Promise(r => srv.listen(8292, '127.0.0.1', r));
  try {
    for (const [label, w, h, q] of [['iPad light', 1180, 820, 'host=right'], ['phone light', 390, 844, ''], ['iPad dark', 1180, 820, 'host=right&theme=dark']]) {
      const url = `http://127.0.0.1:8292/tools/investor-lab-demo.html?selftest=1&${q}`;
      const r = await run(EDGE, ['--headless=new', '--disable-gpu', '--hide-scrollbars', `--window-size=${w},${h}`, '--virtual-time-budget=30000', '--dump-dom', url]);
      const m = (r.stdout || '').match(/<pre id="result">([\s\S]*?)<\/pre>/);
      if (!m || !m[1]) { FAIL(`${label}: no selftest result (exit ${r.status})`); continue; }
      const rep = JSON.parse(m[1].replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&amp;/g, '&'));
      if (rep.boot === false) { FAIL(`${label}: boot failed ${JSON.stringify(rep.errors)}`); continue; }
      check(!rep.errors.length, `${label}: no JS errors${rep.errors.length ? ' ' + JSON.stringify(rep.errors.slice(0, 3)) : ''}`);
      for (const id of PANEL_IDS) {
        const p = rep.panels[id];
        if (!p) { FAIL(`${label}: panel ${id} not run`); continue; }
        check(p.mounted && p.unmounted && !p.errors.length, `${label}: ${id} mounts + unmounts, no errors`);
        check(p.w <= p.cw + 1, `${label}: ${id} has no horizontal overflow (${p.w} ≤ ${p.cw})`);
        check(p.text.length > 40 && !/undefined|NaN|正在取/.test(p.text), `${label}: ${id} rendered its content`);
      }
      const P = rep.panels;
      check(P.gauges?.followed, `${label}: gauges follow the sim (${P.gauges?.follow})`);
      check(['小周期位置', '大周期位置', '实际利率', '估值', '汇率'].every(t => P.gauges?.text.includes(t)), `${label}: five gauges`);
      check(P.assetTable?.clicked && /还没有用数据逐格验证/.test(P.assetTable.text), `${label}: asset table row tap + caveat`);
      check(P.realRate?.slid === '+3.00%' && /玩具公式/.test(P.realRate.text), `${label}: real-rate slider moves (${P.realRate?.slid})`);
      check(P.realRate?.reattached, `${label}: same spec re-attaches the live panel to a new host (state kept)`);
      check(['223 倍', '46 倍', '−37%', '+47%', '100 分位', '3 分位'].every(t => P.priced?.text.includes(t)) && P.priced.extra >= 8, `${label}: priced shows the card numbers (panel kept, not in the v3 lesson)`);
      check(['分水堰', '现金', '国债', '股票', '房子', '黄金', '中间那根细管', '窄池子跳得多', 'QE'].every(t => P.lake?.text.includes(t)), `${label}: lake shows the pools, the weir, the middle pipe and the rules`);
      check(/亮了 1 个信号/.test(P.timeline?.yr || '') && P.timeline.svgs >= 2, `${label}: timeline scrub to 2005 = 1 signal`);
      check(['−29.6%', '−37.0%', '−30.9%', '0.66 美元', '−24%'].every(t => P.fx?.text.includes(t)), `${label}: fx shows the AUD falls and the insurance cost`);
      const links = P.blind?.links || [];
      check(practice.every(id => links.some(h => h.endsWith('blind/?card=' + id))) && links.some(h => /\/blind\/$/.test(h)), `${label}: blind links (${links.length})`);
    }
  } finally { srv.close(); }
}
await browser();
console.log(`\n${fails ? 'FAILED' : 'PASSED'}: ${oks} ok, ${warns} warn, ${fails} fail`);
process.exit(fails ? 1 : 0);
