// node tools/check_backtest.mjs [--verbose]
// Checks the walk-forward backtest (tools/backtest_real.mjs, tools/BACKTEST.md):
//   1. the wrapper runs the same code: real-snapshot.js loaded with injected data == the app's realTimeline on the full data
//   2. no look-ahead in the pipeline: the reading at t computed on the data CUT at t == the app's full-sample reading at t (every t >= 1999Q1),
//      and == the reading at t computed on the full-length data with every value after t replaced by garbage (also for the one-sided and
//      publication-lag vintages, whose construction must not read anything after t either)
//   3. inputs that can't affect a reading: the output gap (CBO for the US, the HP estimate for AUS) is not read by any lamp or dial
//   4. the replicas in the backtest match the app: b2Now (real-snapshot.js build), 河溢 / 河干 bands (objective.js lampsAt), the US households
//      series is linear between its Q2 points (so 'flat after the last Q2 dated <= t' is its one-sided version)
//   5. the forecasts made at t read nothing after t (scramble everything after a cut, forecasts before the cut do not move)
//   6. src/data/real/backtest.js and the tables in tools/BACKTEST.md are exactly what the script generates
import fs from 'node:fs';
import { realTimeline, realSnapshot } from '../src/data/real/real-snapshot.js';
import { lampsAt } from '../src/ui/objective.js';
import { REAL, ISOS, TRAIN_FROM, OUT_FILE, timelineOn, vintage, readingOf, sig, runBacktest, fileText, ctx, DOC_FILE, docSection, docTables, forecastAt, LEVEL_U, LEVEL_PI, uStarOf } from './backtest_real.mjs';

const verbose = process.argv.includes('--verbose');
let fails = 0;
const assert = (c, m) => { if (!c) { fails++; console.log('  FAIL:', m); } else console.log('  ok:', m); };
const num = x => typeof x === 'number' && Number.isFinite(x);
const full = (T, t) => sig(readingOf(T, t)) + JSON.stringify(T.inputs);   // reading + every lamp / dial input

for (const iso of ISOS) {
  const D = REAL[iso], n = D.dates.length, t0 = D.dates.indexOf(TRAIN_FROM);
  const APP = realTimeline(iso);
  console.log(`\n=== ${iso} ===`);

  // 1. wrapper fidelity
  const W = await timelineOn(iso, D);
  let bad = []; for (let t = 0; t < n; t++) if (full(W[t], t) !== full(APP[t], t)) bad.push(D.dates[t]);
  assert(bad.length === 0, `${iso}: real-snapshot.js run through the backtest wrapper == the app's realTimeline, all ${n} quarters (${bad.slice(0, 5).join(' ') || 'identical'})`);

  // 2a. cut at t == full sample at t
  bad = []; const early = [];
  for (let t = 8; t < n; t++) {
    const tl = await timelineOn(iso, vintage(iso, t, 'cut'));
    if (full(tl[t], t) !== full(APP[t], t)) (t >= t0 ? bad : early).push(D.dates[t]);
  }
  assert(bad.length === 0, `${iso}: reading at t on the data cut at t == the app's full-sample reading, every t ${TRAIN_FROM}..${D.dates.at(-1)} (${bad.length} differ${bad.length ? ': ' + bad.slice(0, 6).join(' ') : ''})`);
  console.log(`  info: before ${TRAIN_FROM} ${early.length} quarters differ (${early[0] || '—'}..${early.at(-1) || '—'}): the app back-fills the BIS DSR before its 1999Q1 start with that first value (look-ahead before 1999 only; the backtest starts at ${TRAIN_FROM})`);

  // 2b. garbage after t: same reading at t, for the cut / one-sided / publication-lag vintages
  const garbage = t => { const S = {}; for (const [k, a] of Object.entries(D.series)) S[k] = a.map((v, s) => (s > t && num(v) ? v * 3 + 0.123 : v)); return { ...D, series: S }; };
  for (const kind of ['cut', 'rt', 'lag']) {
    bad = [];
    for (let t = t0; t < n - 1; t += 3) {
      const ref = vintage(iso, t, kind);
      const orig = REAL[iso]; REAL[iso] = garbage(t);
      let v2; try { v2 = vintage(iso, t, kind); } finally { REAL[iso] = orig; }
      const sameData = JSON.stringify(ref.series) === JSON.stringify(v2.series);
      const a = await timelineOn(iso, ref), b = await timelineOn(iso, v2);
      if (!sameData || full(a[t], t) !== full(b[t], t)) bad.push(D.dates[t]);
      // and the full-length garbage data through the app code: reading at t unchanged
      if (kind === 'cut') { const g = await timelineOn(iso, garbage(t)); if (full(g[t], t) !== full(APP[t], t)) bad.push(D.dates[t] + '(full-length)'); }
    }
    assert(bad.length === 0, `${iso}: vintage '${kind}' at t is built from data <= t only (values after t set to garbage: same series, same reading; every 3rd quarter) ${bad.slice(0, 5).join(' ')}`);
  }

  // 3. the output gap is never read by a lamp or dial
  {
    const S = { ...D.series, outputGap: D.series.outputGap.map(() => null), gdpPotential: D.series.gdpPotential.map(() => null) };
    const G = await timelineOn(iso, { ...D, series: S });
    bad = []; for (let t = 0; t < n; t++) if (sig(readingOf(G[t], t)) !== sig(readingOf(APP[t], t))) bad.push(D.dates[t]);
    assert(bad.length === 0, `${iso}: output gap (${iso === 'USA' ? 'CBO, revised with hindsight' : 'one-sided HP estimate'}) removed -> every lamp and dial reading identical (${bad.length} differ)`);
  }

  // 4. replicas
  bad = []; for (let t = 0; t < n; t++) { const r = readingOf(APP[t], t), s = realSnapshot(iso, t); if (r.b2Now !== !!s.real.b2Now) bad.push(D.dates[t]); }
  assert(bad.length === 0, `${iso}: backtest b2Now == realSnapshot().real.b2Now (null outside ①/② read as false), every quarter`);
  const C = ctx(iso, APP.map((T, t) => readingOf(T, t)));
  bad = [];
  for (let t = 0; t < n; t++) {
    const u = D.series.unemployment[t], pi = D.series.cpiYoY[t];
    const L = lampsAt({ t, macro: { inflation: pi, unemployment: u }, bank: {}, gov: {} }, iso);
    if (num(u) && L.find(x => x.id === 'drought').level !== LEVEL_U(u - uStarOf(C, t))) bad.push('u' + D.dates[t]);
    if (num(pi) && L.find(x => x.id === 'flood').level !== LEVEL_PI(Math.abs(pi - C.cp.piTarget))) bad.push('pi' + D.dates[t]);
  }
  assert(bad.length === 0, `${iso}: 河溢 / 河干 bands in the backtest == objective.js lampsAt (${bad.slice(0, 4).join(' ') || 'all quarters'})`);
  if (D.series.households) {
    const h = D.series.households, q2 = D.dates.map((d, i) => (d.endsWith('Q2') ? i : -1)).filter(i => i >= 0);
    let worst = 0;
    for (let k = 0; k + 1 < q2.length; k++) for (let s = q2[k] + 1; s < q2[k + 1]; s++) worst = Math.max(worst, Math.abs(h[s] - (h[q2[k]] + (h[q2[k + 1]] - h[q2[k]]) * (s - q2[k]) / 4)) / h[s]);
    assert(worst < 2e-4, `${iso}: households is linear between Q2 points up to the file's 5-digit rounding (worst rel. error ${worst.toExponential(1)}), so the one-sided version holds the last Q2 value`);
  }

  // 5. forecasts at t read nothing after t
  bad = [];
  for (const cut of ['2005Q4', '2010Q4', '2015Q4', '2019Q4', '2023Q4'].map(d => D.dates.indexOf(d))) {
    const C2 = ctx(iso, C.R.map((r, s) => (s > cut && r ? { ...r, cls: r.cls === '收紧' ? '扩张' : '收紧' } : r)));
    for (const v of ['u', 'pi']) {
      C2.X = { ...C2.X, [v]: C.X[v].map((x, s) => (s > cut && num(x) ? x * 2 + 0.05 : x)) };
      for (let t = C.t0 + 4; t <= cut; t++) {
        if (!num(C.X[v][t]) || !num(C.X[v][t - 4])) continue;
        if (JSON.stringify(forecastAt(C, v, t)) !== JSON.stringify(forecastAt(C2, v, t))) bad.push(`${v}@${D.dates[t]}`);
      }
    }
  }
  assert(bad.length === 0, `${iso}: every forecast made at t (no change, persistence, drift, phase mean, framework sign) is unchanged when all data and readings after t are scrambled`);
}

// 6. the generated file
console.log('\n=== generated file ===');
const res = await runBacktest();
const lf = s => s.replace(/\r\n/g, '\n');   // a Windows checkout (core.autocrlf) has CRLF; compare content, not line endings
const want = fileText(res), have = fs.existsSync(OUT_FILE) ? lf(fs.readFileSync(OUT_FILE, 'utf8')) : '';
assert(want === have, `src/data/real/backtest.js matches what tools/backtest_real.mjs generates (${Buffer.byteLength(have)} bytes; regenerate with --write)`);
const doc = fs.existsSync(DOC_FILE) ? lf(fs.readFileSync(DOC_FILE, 'utf8')) : '';
assert(docSection(doc) === docTables(res), 'tools/BACKTEST.md: the tables between the markers match the script (regenerate with --write)');
for (const w of ['同比', '环比']) assert(!doc.includes(w) && !want.includes(w), `BACKTEST.md / backtest.js never write ${w}`);
for (const iso of ISOS) {
  const R = res.countries[iso].__R;
  const tl = realTimeline(iso), D = REAL[iso];
  let k = 0; for (let t = D.dates.indexOf(TRAIN_FROM); t < D.dates.length; t++) if (sig(R.cut[t]) !== sig(readingOf(tl[t], t))) k++;
  assert(k === 0, `${iso}: the walk-forward readings in the run ('cut' vintage) == the app's readings (${k} differ)`);
  if (verbose) console.log(`  ${iso} one-sided vintage B differs from the app at: ${res.countries[iso].vintageDiff.cutVsRt.join(' ') || 'none'}`);
}

console.log(`\n${fails ? fails + ' FAIL' : 'all checks passed'}`);
process.exit(fails ? 1 : 0);
