// node tools/check_real_data.mjs [--verbose]   Checks the REAL-data layer (src/data/real/*): coverage, no NaN, overlap with the engine's
// data files, realSnapshot shape vs the engine snapshot, and the real cycle dials next to the model's (USA, AUS).
import { USA_REAL } from '../src/data/real/usa-real.js';
import { AUS_REAL } from '../src/data/real/aus-real.js';
import { realSnapshot, realTimeline, realLastDate, PROXY } from '../src/data/real/real-snapshot.js';
import { US_Q } from '../src/data/us-quarterly.js';
import { AUS_Q } from '../src/data/countries/aus-quarterly.js';
import { createSim } from '../src/engine/sim.js';

const verbose = process.argv.includes('--verbose');
let fails = 0, warns = 0;
const assert = (c, m) => { if (!c) { fails++; console.log('  FAIL:', m); } else if (verbose) console.log('  ok:', m); };
const warn = (c, m) => { if (!c) { warns++; console.log('  WARN:', m); } };
const num = x => typeof x === 'number' && Number.isFinite(x);
const pad = (s, n) => String(s).padEnd(n);
const REAL = { USA: USA_REAL, AUS: AUS_REAL }, MODEL_DATA = { USA: US_Q, AUS: AUS_Q };
const LEVELS = new Set(['gdpNominal', 'houseIndex', 'equityIndex', 'cape', 'goldIndex', 'oilPrice', 'bankCredit', 'fxPerUsd']);

// ---------------------------------------------------------------- 1. coverage + no NaN + grid
for (const iso of ['USA', 'AUS']) {
  const D = REAL[iso], M = MODEL_DATA[iso];
  console.log(`\n=== ${iso}: coverage (grid ${D.dates[0]}..${D.dates.at(-1)}, ${D.dates.length} quarters; lastRealDate ${D.lastRealDate}) ===`);
  assert(D.dates[0] === '1995Q1' && D.dates.slice(0, M.dates.length).every((d, i) => d === M.dates[i]), `${iso}: grid starts with the engine grid (${M.dates.length} quarters)`);
  assert(D.dates.length > M.dates.length, `${iso}: grid extends past ${M.dates.at(-1)}`);
  assert(D.reservedFrom === '2022Q1', `${iso}: reservedFrom 2022Q1`);
  assert(realLastDate(iso) === D.lastRealDate && /^\d{4}Q[1-4]$/.test(D.lastRealDate), `${iso}: lastRealDate ${D.lastRealDate}`);
  let bad = 0;
  console.log('  ' + pad('series', 22) + pad('first', 8) + pad('last', 8) + 'notes');
  for (const [k, a] of Object.entries(D.series)) {
    assert(a.length === D.dates.length, `${iso}.${k}: length = grid`);
    for (const x of a) if (!(x === null || num(x))) bad++;
    const f = D.meta.firstReal[k], l = D.meta.lastReal[k];
    const nn = a.map((x, i) => (x == null ? -1 : i)).filter(i => i >= 0);
    assert((nn.length ? D.dates[nn[0]] : null) === f && (nn.length ? D.dates[nn.at(-1)] : null) === l, `${iso}.${k}: meta.firstReal/lastReal match the data`);
    assert(D.meta.sources[k], `${iso}.${k}: has a source`);
    const notes = [];
    if (D.meta.partial[k]) notes.push('部分 ' + D.meta.partial[k].join(','));
    if (D.meta.extended[k]) notes.push(`extended ${D.meta.extended[k].from}..${D.meta.extended[k].to}`);
    if (k in M.series) notes.push('in engine file'); else notes.push('NEW');
    console.log('  ' + pad(k, 22) + pad(f ?? '—', 8) + pad(l ?? '—', 8) + notes.join('; '));
  }
  assert(bad === 0, `${iso}: no NaN / non-number values (${bad})`);
  const need = ['policyRate', 'cpiYoY', 'unemployment', 'gdpNominal', 'outputGap', 'outC', 'outI', 'outG', 'outNX', iso === 'USA' ? 'm2Gdp' : 'm3Gdp', ...(iso === 'USA' ? ['badLoans'] : [])];
  for (const k of need) assert(D.meta.lastReal[k] && D.meta.lastReal[k] > '2025Q4', `${iso}.${k}: real past 2025Q4 (${D.meta.lastReal[k]})`);
  for (const k of Object.keys(M.series)) assert(k in D.series, `${iso}: engine series ${k} present in the real file`);
  // outlets sum to GDP (US exact; AUS with the ABS statistical discrepancy)
  let worst = 0;
  D.dates.forEach((_, i) => {
    const p = ['outC', 'outI', 'outG', 'outNX', 'outDiscrepancy'].map(k => D.series[k]?.[i] ?? (k === 'outDiscrepancy' ? 0 : null));
    if (p.every(num)) worst = Math.max(worst, Math.abs(p.reduce((a, b) => a + b, 0) - 1));
  });
  assert(worst < 0.002, `${iso}: C + I + G + NX (+ discrepancy) = GDP within 0.2pp (worst ${(worst * 100).toFixed(3)}pp)`);
  if (iso === 'AUS') {
    const dis = D.series.outDiscrepancy.filter(num).map(Math.abs);
    console.log(`  AUS statistical discrepancy (E): mean |.| ${(dis.reduce((a, b) => a + b, 0) / dis.length * 100).toFixed(2)}% of GDP, max ${(Math.max(...dis) * 100).toFixed(2)}%`);
  }
  // ---- overlap with the engine file (1995Q1..2025Q4): same definitions should agree up to revisions
  console.log(`  overlap with the engine file (${M.dates[0]}..${M.dates.at(-1)}): mean |diff| (levels: mean |relative diff|)`);
  const rows = [];
  for (const k of Object.keys(M.series)) {
    if (!(k in D.series)) continue;
    const d = [];
    M.dates.forEach((_, i) => { const a = D.series[k][i], b = M.series[k][i]; if (num(a) && num(b)) d.push(LEVELS.has(k) ? Math.abs(a / b - 1) : Math.abs(a - b)); });
    if (!d.length) { rows.push(`${k}: no overlap`); continue; }
    const m = d.reduce((x, y) => x + y, 0) / d.length;
    rows.push(`${k} ${LEVELS.has(k) ? (m * 100).toFixed(1) + '%' : (m * 100).toFixed(2) + 'pp'}`);
  }
  for (let i = 0; i < rows.length; i += 4) console.log('    ' + rows.slice(i, i + 4).map(r => pad(r, 30)).join(''));
}

// ---------------------------------------------------------------- 2. realSnapshot shape vs the engine snapshot
function walkShape(eng, rea, path, out) {
  if (eng === null || eng === undefined) return;
  if (Array.isArray(eng)) { if (!(rea === null || Array.isArray(rea))) out.push(`${path}: engine array, real ${typeof rea}`); return; }
  if (typeof eng === 'number') { if (!(rea === null || num(rea))) out.push(`${path}: engine number, real ${rea}`); return; }
  if (typeof eng === 'boolean') { if (!(rea === null || typeof rea === 'boolean')) out.push(`${path}: engine boolean, real ${typeof rea}`); return; }
  if (typeof eng === 'string') { if (typeof rea !== 'string') out.push(`${path}: engine string, real ${typeof rea}`); return; }
  if (typeof eng === 'object') {
    if (rea === null) return;
    if (typeof rea !== 'object') { out.push(`${path}: engine object, real ${typeof rea}`); return; }
    for (const k of Object.keys(eng)) {
      if (!(k in rea)) { out.push(`${path}.${k}: missing in real`); continue; }
      walkShape(eng[k], rea[k], `${path}.${k}`, out);
    }
  }
}
const SHARED = ['macro', 'rates', 'money', 'debt', 'bank', 'household', 'firm', 'gov', 'assets', 'flows', 'border', 'budget', 'iou', 'extra'];
for (const iso of ['USA', 'AUS']) {
  console.log(`\n=== ${iso}: realSnapshot shape vs the engine snapshot ===`);
  const sim = createSim({ data: MODEL_DATA[iso], mode: 'history', country: iso });
  while (!sim.done) sim.step();
  const hist = sim.history();
  const D = REAL[iso];
  let bad = [], nanN = 0, missOnly = 0;
  for (const t of [0, 40, 100, hist.length - 1]) {
    const e = hist[t], r = realSnapshot(iso, t);
    for (const g of SHARED) walkShape(e[g], r[g], g, bad);
    // lamps: same keys, each with level / value / bands / axis / label
    for (const k of Object.keys(e.lights)) {
      const L = r.lights[k];
      if (!L || !['green', 'yellow', 'red'].includes(L.level) || !num(L.value) || !Array.isArray(L.bands) || !Array.isArray(L.axis)) bad.push(`lights.${k} @${t}`);
    }
    for (const side of ['long', 'short']) for (const k of Object.keys(e.cycles[side])) if (!(k in r.cycles[side])) bad.push(`cycles.${side}.${k} @${t}`);
  }
  for (let t = 0; t < D.dates.length; t++) {
    const r = realSnapshot(iso, t);
    const stack = [[r, '']];
    while (stack.length) {
      const [o, p] = stack.pop();
      for (const [k, v] of Object.entries(o)) {
        if (typeof v === 'number' && !Number.isFinite(v) && !(p.includes('bands') || k === 'lo' || k === 'hi')) nanN++;
        else if (v && typeof v === 'object') stack.push([v, p + '.' + k]);
      }
    }
    // every null in the shared groups is declared model-only
    const nulls = [];
    const walkN = (o, p) => { for (const [k, v] of Object.entries(o)) { const q = p ? p + '.' + k : k; if (v === null) nulls.push(q); else if (v && typeof v === 'object' && !Array.isArray(v)) walkN(v, q); } };
    for (const g of SHARED) if (r[g] === null) nulls.push(g); else walkN(r[g], g);
    missOnly += nulls.filter(p => !r.modelOnly.includes(p) && !r.notYet.includes(p)).length;
    if (r.modelOnly.some(p => r.notYet.includes(p))) missOnly++;
  }
  // flow splits, bank approval, capex pipeline, springs are model-only in every quarter
  const s0 = realSnapshot(iso, 60);
  for (const p of ['flows.toHousing', 'flows.toConsumption', 'bank.approval', 'firm.capexPipeline', 'flows.rent', 'flows.dividends', 'flows.coupons'].filter(p => !(iso === 'USA' && p === 'flows.coupons')))
    assert(s0.modelOnly.includes(p), `${iso}: ${p} is model-only`);
  assert(bad.length === 0, `${iso}: shared fields have the engine's shape (${bad.slice(0, 6).join('; ') || 'all match'})`);
  assert(nanN === 0, `${iso}: no NaN / Infinity in any real snapshot (${nanN})`);
  assert(missOnly === 0, `${iso}: every null field is listed in exactly one of snap.modelOnly / snap.notYet (${missOnly} not)`);
  assert(realSnapshot(iso, D.lastRealDate)?.date === D.lastRealDate && realSnapshot(iso, '1990Q1') === null, `${iso}: realSnapshot accepts 'YYYYQn', null outside the grid`);
  const s = realSnapshot(iso, D.lastRealDate);
  console.log(`  ${D.lastRealDate}: policy ${(s.rates.policy * 100).toFixed(2)}%, CPI ${(s.macro.inflation * 100).toFixed(1)}%, u ${(s.macro.unemployment * 100).toFixed(1)}%, gap ${(s.macro.outputGap * 100).toFixed(1)}%, ` +
    `M/GDP ${(s.money.M / s.macro.gdpNominal * 100).toFixed(0)}%, DSR ${num(s.household.dsr) ? (s.household.dsr * 100).toFixed(1) + '%' : '—'}, bad ${num(s.bank.badLoanRate) ? (s.bank.badLoanRate * 100).toFixed(2) + '%' : '—'}, ` +
    `outlets C ${(s.outlets.C * 100).toFixed(1)} I ${(s.outlets.I * 100).toFixed(1)} G ${(s.outlets.G * 100).toFixed(1)} NX ${(s.outlets.NX * 100).toFixed(1)}`);
  console.log(`  lamps: ${Object.entries(s.lights).map(([k, l]) => `${k} ${l.level} (${l.value.toFixed(3)})`).join(', ')}`);
  console.log(`  dials: long ${s.cycles.long.label}${s.cycles.long.fork ? ' fork ' + s.cycles.long.fork : ''} | short ${s.cycles.short.label}`);
  console.log(`  modelOnly (${s.modelOnly.length}): ${s.modelOnly.join(', ')}`);
  console.log(`  notYet at ${D.lastRealDate} (${s.notYet.length}): ${s.notYet.join(', ') || 'none'}`);
  const sl = realSnapshot(iso, D.dates.length - 1);
  console.log(`  grid end ${sl.date}: afterLastReal ${sl.real.afterLastReal}; notYet ${sl.notYet.join(', ') || 'none'}`);
  console.log(`  filled inputs at ${D.lastRealDate}: ${s.real.filled.join(', ') || 'none'}; partial: ${s.real.partial.join(', ') || 'none'}`);
}

// ---------------------------------------------------------------- 3. real dials next to the model's
const SC = { expand: 'E', hotP: 'P', hotA: 'A', tight: 'T', ease: 'C' };
const code = c => (SC[c.short.key] || '?');
const lcode = c => String(c.long.stage) + (c.long.fork === 'B2' ? 'b' : c.long.fork === 'B1' ? 'p' : ' ');
function changes(arr, dates, f) {
  const out = [];
  arr.forEach((c, i) => { if (i === 0 || f(c) !== f(arr[i - 1])) out.push(`${dates[i]} ${f(c)}`); });
  return out;
}
for (const iso of ['USA', 'AUS']) {
  const D = REAL[iso];
  const R = realTimeline(iso).map(x => x.cycles);
  const sim = createSim({ data: MODEL_DATA[iso], mode: 'history', country: iso });
  while (!sim.done) sim.step();
  const Mh = sim.history().map(x => x.cycles);
  console.log(`\n=== ${iso}: cycle dials, real vs model (short: E 扩张, P 过热·物价, A 过热·资产, T 收紧, C 降息; long: stage digit, b = B2 fork, p = B1) ===`);
  console.log('        short Q1-Q4 real | model        long real | model');
  for (let y = 1995; y <= Number(D.dates.at(-1).slice(0, 4)); y++) {
    const q = [1, 2, 3, 4].map(k => D.dates.indexOf(`${y}Q${k}`));
    const rs = q.map(i => (i >= 0 ? code(R[i]) : ' ')).join(''), ms = q.map(i => (i >= 0 && Mh[i] ? code(Mh[i]) : ' ')).join('');
    const rl = q.map(i => (i >= 0 ? lcode(R[i]) : '  ')).join(''), ml = q.map(i => (i >= 0 && Mh[i] ? lcode(Mh[i]) : '  ')).join('');
    console.log(`  ${y}  ${rs} | ${ms}          ${rl}| ${ml}`);
  }
  console.log('  real long changes : ' + changes(R, D.dates, c => c.long.label + (c.long.fork ? '/' + c.long.fork : '')).join(' → '));
  console.log('  model long changes: ' + changes(Mh, MODEL_DATA[iso].dates, c => c.long.label + (c.long.fork ? '/' + c.long.fork : '')).join(' → '));
  console.log('  real short changes : ' + changes(R, D.dates, c => c.short.label).join(' → '));
  // expectations
  const I = d => D.dates.indexOf(d);
  const share = (a, b, ph) => { let h = 0, n = 0; for (let i = I(a); i <= I(b); i++) { n++; if (R[i].short.phase === ph || (R[i + 1] && R[i + 1].short.phase === ph)) h++; } return [h, n]; };
  const firstIn = (a, b, pred) => { for (let i = I(a); i <= I(b); i++) if (pred(R[i])) return D.dates[i]; return null; };
  if (iso === 'USA') {
    for (const [a, b] of [['2004Q3', '2006Q2'], ['2022Q2', '2023Q3']]) { const [h, n] = share(a, b, 'tight'); assert(h * 2 > n, `USA real: 收紧 in most of ${a}..${b} (${h}/${n})`); }
    for (const [a, b] of [['2007Q4', '2008Q2'], ['2019Q3', '2019Q4'], ['2024Q3', '2025Q1']]) { const e = firstIn(a, b, c => c.short.phase === 'ease'); assert(e, `USA real: 降息 from ${a} (first ${e})`); }
    const b2 = firstIn('2006Q1', '2009Q4', c => c.long.fork === 'B2'); assert(b2 && b2 >= '2007Q1' && b2 <= '2008Q4', `USA real: B2 fork around 2007-08 (${b2})`);
  } else {
    const e1 = firstIn('2011Q4', '2012Q2', c => c.short.phase === 'ease'); assert(e1, `AUS real: 降息 from the 2011Q4 cut (${e1})`);
    const [h1, n1] = share('2011Q4', '2016Q3', 'ease'); warn(h1 * 2 > n1, `AUS real: 降息 in most of 2011Q4..2016Q3 (${h1}/${n1})`);
    const e2 = firstIn('2019Q2', '2020Q2', c => c.short.phase === 'ease'); assert(e2, `AUS real: 降息 in 2019Q2..2020Q2 (${e2})`);
    const [h2, n2] = share('2022Q2', '2023Q4', 'tight'); assert(h2 * 2 > n2, `AUS real: 收紧 in most of 2022Q2..2023Q4 (${h2}/${n2})`);
  }
}

console.log('\nproxies:'); for (const [k, v] of Object.entries(PROXY)) console.log(`  ${k}: ${v}`);
console.log(`\n${fails ? fails + ' FAIL' : 'all checks passed'}${warns ? `, ${warns} warning(s)` : ''}`);
process.exit(fails ? 1 : 0);
