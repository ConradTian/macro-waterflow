// node tools/check_fx_reactor.mjs   (the browser part needs the repo root served: python -m http.server 8321; BASE=http://localhost:PORT/ overrides;
//                                    NOBROWSER=1 runs the data part only)
// FX reactor (src/ui/fx-reactor.js) + the dollar index (src/data/usd-index.js):
//   1. every number of computeFxReactor is recomputed here, independently, from the quarterly data (5 countries x every quarter with a year
//      of history): needle = the actual change 本币比一年前, the two pipes = the formula's groups, 说不清 = needle − pipes, the PPP anchor.
//      GBR / EA / CHN: the JST 5-year rule; missing inputs (生产率, 信心, the size of 贸易条件) are null, never a number. CHN: managed.
//   1b. the 1-year fit (src/data/fx-fit.js, AUS + JPN; 1 年尺度拟合，探索性) is recomputed from the RAW files: VIX (data_src/world/fred_vix),
//      ABS terms of trade (data_src/world/abs), WTI oil (data_src/world/fred/MCOILWTICO.csv) and the countries' fx / CPI / policy rate:
//      every input, the OLS coefficients, Newey-West t (4 lags), R², the hold-out error, the VIX-form choice; the hold-out flag (fit sample
//      ends 2021Q4, 2022+ never enters, R.fit.hold); the reactor's forces = coef × (x − mean) scaled to %; the risk signs (AUD risk, JPY haven).
//   2. the SVG: the needle sits at the actual change, the 公式 tick at the pipes' sum, the 说不清 bracket spans exactly the two.
//   3. usd-index.js is rebuilt from the raw FRED CSVs (DTWEXBGS daily -> quarterly mean; TWEXBMTH before 2006, scaled at 2006Q1).
//   4. the AUD story: 2003–11 iron ore rises, from 2012 it falls; the fit shrinks 说不清 at 2008Q4 / 2011Q2 / 2015Q2 against the JST rule.
//      AUD/CNY from the data against the spec's reference values 6.0 / 6.7 (spec: FX_SPEC.audcnyRef) and 4.65 (spec: 2026-10 spot).
//   5. browser: the AUS border band draws the reactor and its readings equal the numbers; a pipe tap opens the five forces; the phone
//      净出口 gate popover carries the reactor; the USA band shows the dollar index; mountFxReactor() works as a lesson panel.
import { readFileSync } from 'node:fs';
import { spawn } from 'node:child_process';
import { fileURLToPath, pathToFileURL } from 'node:url';
import path from 'node:path';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const imp = p => import(pathToFileURL(path.join(ROOT, p)).href);
let fails = 0, oks = 0;
const ok = (c, m) => { if (!c) { fails++; console.log('FAIL:', m); } else { oks++; if (process.env.VERBOSE) console.log('ok:', m); } };
const say = (c, m) => { ok(c, m); if (!process.env.VERBOSE && c) console.log('ok:', m); };
const near = (a, b, e = 1e-9) => (a == null && b == null) || (typeof a === 'number' && typeof b === 'number' && Math.abs(a - b) <= e * Math.max(1, Math.abs(b)));

const FXR = await imp('src/ui/fx-reactor.js');
const { FX_FIT } = await imp('src/data/fx-fit.js');
const { FX_SPEC } = await imp('src/data/fx-data.js');
const { USD_INDEX } = await imp('src/data/usd-index.js');
const US = (await imp('src/data/us-quarterly.js')).US_Q;
const C = {
  AUS: (await imp('src/data/countries/aus-quarterly.js')).AUS_Q, GBR: (await imp('src/data/countries/gbr-quarterly.js')).GBR_Q,
  JPN: (await imp('src/data/countries/jpn-quarterly.js')).JPN_Q, EA: (await imp('src/data/countries/ea-quarterly.js')).EA_Q,
  CHN: (await imp('src/data/countries/chn-quarterly.js')).CHN_Q,
};

/* ---------- 1. independent recompute ---------- */
const v = x => (typeof x === 'number' && isFinite(x) ? x : null);
function anchorRef(H) {            // PPP: cumulative quarterly share of the yearly inflation gap since 1995Q1, height = mean log deviation 1995–2021 = 0
  const n = H.dates.length, raw = [], fx = H.series.fxPerUsd, ph = H.series.cpiYoY, pu = US.series.cpiYoY;
  let acc = 0;
  for (let i = 0; i < n; i++) {
    if (i === 0) { raw.push(0); continue; }
    const a = v(ph[i]), b = v(pu[US.dates.indexOf(H.dates[i])]);
    if (a == null || b == null) { raw.push(null); continue; }
    acc += Math.log((1 + a) / (1 + b)) / 4; raw.push(acc);
  }
  let s = 0, m = 0;
  for (let i = 0; i <= H.dates.indexOf('2021Q4'); i++) if (v(fx[i]) != null && raw[i] != null) { s += Math.log(fx[i]) - raw[i]; m++; }
  return raw.map(r => (r == null ? null : Math.exp(r + s / m)));
}
let n = 0, nMiss = 0;
const jstRef = {};   // the JST-rule 说不清 for AUS / JPN too (section 4 compares it with the fit)
for (const [iso, H] of Object.entries(C)) {
  const A = anchorRef(H), FIT = !!FX_FIT.countries[iso];
  for (let i = 4; i < H.dates.length; i++) {
    const d = H.dates[i], j = US.dates.indexOf(d), S = H.series, U = US.series;
    const R = FXR.computeFxReactor(H, US, d, iso);
    const fx = v(S.fxPerUsd[i]), fx4 = v(S.fxPerUsd[i - 4]);
    if (fx == null || fx4 == null) { ok(!R.ok, `${iso} ${d}: no FX -> not ok`); continue; }
    const actual = (fx4 / fx - 1) * 100;
    const infl = v(S.cpiYoY[i]) != null && v(U.cpiYoY[j]) != null ? -FX_SPEC.rule.infl * (S.cpiYoY[i] - U.cpiYoY[j]) * 100 : null;
    let g = 0, gn = 0; for (let k = 0; k < 4; k++) { const a = v(S.policyRate[i - k]), b = v(U.policyRate[j - k]); if (a != null && b != null) { g += a - b; gn++; } }
    const rate = gn === 4 ? FX_SPEC.rule.rate * (g / 4) * 100 : null;
    const cap = rate ?? 0, goods = infl ?? 0;
    n++;
    ok(R.ok && near(R.actual, actual), `${iso} ${d}: needle = actual change ${actual.toFixed(3)}% (got ${R.actual})`);
    ok(near(R.anchor?.level, A[i], 1e-9) && near(R.anchor.value, (A[i] / fx - 1) * 100) && near(R.anchor.pos, (fx4 / A[i] - 1) * 100), `${iso} ${d}: PPP anchor ${A[i]}`);
    ok(R.anchor.word === (Math.abs(R.anchor.value) < 5 ? '差不多' : R.anchor.value > 0 ? '偏贵' : '偏便宜'), `${iso} ${d}: 偏贵/偏便宜 word`);
    if (FIT) {   // the fitted countries: inputs equal to the JST path's, numbers in 1b
      (jstRef[iso] ||= {})[d] = actual - (cap + goods);
      ok(near(R.forces.infl.input, infl == null ? null : -infl / FX_SPEC.rule.infl) && near(R.forces.rate.input, rate == null ? null : rate / FX_SPEC.rule.rate), `${iso} ${d}: fitted reactor keeps the same 通胀差 / 利差 inputs`);
      ok(R.fit && R.fit.hold === (d >= FX_FIT.hold[0]) && R.managed === false, `${iso} ${d}: hold-out flag = (date >= ${FX_FIT.hold[0]})`);
      continue;
    }
    ok(R.fit === null && R.managed === (iso === 'CHN'), `${iso} ${d}: JST rule (no fit)${iso === 'CHN' ? ', managed currency' : ''}`);
    ok(near(R.forces.infl.c, infl) && near(R.forces.rate.c, rate), `${iso} ${d}: 通胀差 ${infl} / 利差 ${rate} terms`);
    ok(near(R.pipes.cap.c, cap) && near(R.pipes.goods.c, goods), `${iso} ${d}: 资本管 = 利差 + 信心, 商品价格管 = 通胀差 + 生产率 + 贸易条件`);
    ok(near(R.model, cap + goods) && near(R.unexplained, actual - (cap + goods)), `${iso} ${d}: 说不清 = needle − pipes (${R.unexplained})`);
    ok(R.forces.prod.c === null && R.forces.conf.c === null && R.forces.tot.c === null && /没有数据/.test(R.forces.prod.note + R.forces.conf.note) , `${iso} ${d}: 生产率 / 信心 / 贸易条件 size are 没有数据, not numbers`);
    ok(R.forces.tot.dir === 0 && /没有数据/.test(R.forces.tot.note), `${iso} ${d}: no terms-of-trade series -> 没有数据`);
    if (R.pipes.cap.missing.includes('rate') || R.pipes.goods.missing.includes('infl')) nMiss++;
  }
}
say(n > 500 && fails === 0, `recomputed ${n} country-quarters (${oks} assertions so far), ${nMiss} with a missing CPI / rate input`);
say(!FXR.computeFxReactor(C.AUS, US, '1995Q3', 'AUS').ok && !FXR.computeFxReactor(US, US, '2008Q4', 'USA').ok, 'less than a year of history / USA itself: not ok, with a reason');

/* ---------- 1b. the 1-year fit, from the raw files ---------- */
{
  const RAWD = path.join(ROOT, 'data_src/world');
  const lines = f => readFileSync(path.join(RAWD, f), 'utf8').replace(/^﻿/, '').trim().split(/\r?\n/);
  const qKey = (y, m) => `${y}Q${Math.floor((m - 1) / 3) + 1}`;
  const groupQ = (rows, agg) => { const m = {}; for (const [q, x] of rows) (m[q] ||= []).push(x); const o = {}; for (const q in m) o[q] = agg(m[q]); return o; };
  const mean = a => a.reduce((s, x) => s + x, 0) / a.length;
  // VIX: daily -> quarterly mean and max
  const vixRows = lines('fred_vix/VIXCLS.csv').slice(1).map(l => l.split(',')).filter(r => r[1] && r[1] !== '.').map(r => [qKey(+r[0].slice(0, 4), +r[0].slice(5, 7)), +r[1]]);
  const vA = groupQ(vixRows, mean), vM = groupQ(vixRows, a => Math.max(...a));
  // ABS terms of trade: ANA_AGG TTR, index (M5), seasonally adjusted (TSEST 20)
  const ah = lines('abs/ana_agg_ttr.csv'), hd = ah[0].split(','), ci = k => hd.indexOf(k);
  const tot = {};
  for (const l of ah.slice(1)) { const r = l.split(','); if (r[ci('MEASURE')] === 'M5' && r[ci('TSEST')] === '20' && r[ci('FREQ')] === 'Q' && r[ci('OBS_VALUE')] !== '') tot[r[ci('TIME_PERIOD')].replace('-', '')] = +r[ci('OBS_VALUE')]; }
  // WTI oil, monthly -> quarterly mean
  const oil = groupQ(lines('fred/MCOILWTICO.csv').slice(1).map(l => l.split(',')).filter(r => r[1] && r[1] !== '.').map(r => [qKey(+r[0].slice(0, 4), +r[0].slice(5, 7)), +r[1]]), mean);
  const qm4 = q => `${+q.slice(0, 4) - 1}Q${q.slice(5)}`;
  const relx = (a, b, e = 2e-5) => (a == null && b == null) || (a != null && b != null && Math.abs(a - b) <= e * Math.max(1, Math.abs(b)));
  say(FX_FIT.dates.join() === C.AUS.dates.join() && FX_FIT.dates.join() === C.JPN.dates.join() && FX_FIT.label === '1 年尺度拟合，探索性', 'fx-fit.js dates = the countries\' dates; label 1 年尺度拟合，探索性');
  say(FX_FIT.dates.every((d, i) => relx(FX_FIT.vixAvg[i], vA[d], 6e-5) && relx(FX_FIT.vixMax[i], vM[d], 6e-5)), 'VIX quarterly mean / max = VIXCLS.csv (daily; stored to 5 digits)');
  // small linear algebra (k <= 6)
  const inv = M => {
    const n = M.length, A = M.map((r, i) => [...r, ...M.map((_, j) => (i === j ? 1 : 0))]);
    for (let c = 0; c < n; c++) {
      let p = c; for (let r = c + 1; r < n; r++) if (Math.abs(A[r][c]) > Math.abs(A[p][c])) p = r;
      [A[c], A[p]] = [A[p], A[c]];
      const v0 = A[c][c]; for (let j = 0; j < 2 * n; j++) A[c][j] /= v0;
      for (let r = 0; r < n; r++) if (r !== c) { const f = A[r][c]; for (let j = 0; j < 2 * n; j++) A[r][j] -= f * A[c][j]; }
    }
    return A.map(r => r.slice(n));
  };
  const mm = (A, B) => A.map(r => B[0].map((_, j) => r.reduce((s, x, k) => s + x * B[k][j], 0)));
  const T = A => A[0].map((_, j) => A.map(r => r[j]));
  function ols(y, X, L = FX_FIT.lags) {   // OLS + Newey-West (Bartlett, L lags, x n/(n-k)), as tools/build_fx_fit.py
    const n = y.length, k = X[0].length, Xi = inv(mm(T(X), X));
    const b = mm(Xi, mm(T(X), y.map(q => [q]))).map(r => r[0]);
    const u = y.map((q, t) => q - X[t].reduce((s, x, j) => s + x * b[j], 0));
    const S = Array.from({ length: k }, () => new Array(k).fill(0));
    for (let l = 0; l <= L; l++) {
      const w = l === 0 ? 1 : 1 - l / (L + 1);
      for (let t = l; t < n; t++) for (let a = 0; a < k; a++) for (let c = 0; c < k; c++) {
        const g = X[t][a] * u[t] * X[t - l][c] * u[t - l];
        S[a][c] += w * g; if (l) S[c][a] += w * g;
      }
    }
    const V = mm(mm(Xi, S), Xi).map(r => r.map(x => x * n / (n - k)));
    const ym = mean(y), r2 = 1 - u.reduce((s, x) => s + x * x, 0) / y.reduce((s, x) => s + (x - ym) ** 2, 0);
    return { b, t: b.map((x, j) => x / Math.sqrt(V[j][j])), r2, rmse: Math.sqrt(mean(u.map(x => x * x))) };
  }
  const KEYS = ['infl', 'rate', 'tot', 'vix'];
  for (const iso of ['AUS', 'JPN']) {
    const H = C[iso], F = FX_FIT.countries[iso], S = H.series, U = US.series, ds = H.dates;
    // inputs from the raw / quarterly files
    const raw = { y: [], infl: [], rate: [], tot: [], vAvg: [], vMax: [], vAvgChg: [], vMaxChg: [] };
    ds.forEach((d, i) => {
      const j = US.dates.indexOf(d);
      raw.y.push(i >= 4 && v(S.fxPerUsd[i]) != null && v(S.fxPerUsd[i - 4]) != null ? 100 * Math.log(S.fxPerUsd[i - 4] / S.fxPerUsd[i]) : null);
      raw.infl.push(v(S.cpiYoY[i]) != null && v(U.cpiYoY[j]) != null ? 100 * (S.cpiYoY[i] - U.cpiYoY[j]) : null);
      let g = 0, gn = 0;
      for (let k = 0; k < 4 && i - k >= 0; k++) { const a = v(S.policyRate[i - k]), b = v(U.policyRate[j - k]); if (a != null && b != null) { g += 100 * (a - b); gn++; } }
      raw.rate.push(gn === 4 ? g / 4 : null);
      const src = iso === 'AUS' ? tot : oil;
      raw.tot.push(src[d] != null && src[qm4(d)] != null ? 100 * Math.log(src[d] / src[qm4(d)]) : null);
      raw.vAvg.push(vA[d]); raw.vMax.push(vM[d]); raw.vAvgChg.push(vA[d] - vA[qm4(d)]); raw.vMaxChg.push(vM[d] - vM[qm4(d)]);
    });
    const idx = ds.map((d, i) => i);
    const fitI = idx.filter(i => ds[i] >= FX_FIT.fit[0] && ds[i] <= FX_FIT.fit[1]);
    const holdI = idx.filter(i => ds[i] >= FX_FIT.hold[0] && ds[i] <= FX_FIT.hold[1]);
    const form = { vixAvgChg: raw.vAvgChg, vixAvg: raw.vAvg, vixMaxChg: raw.vMaxChg, vixMax: raw.vMax };
    const vixOf = f => { const a = form[f]; if (/Chg$/.test(f)) return a; const m = mean(fitI.map(i => a[i])); return a.map(x => x - m); };
    const run = (f, I = fitI) => {
      const vx = vixOf(f), use = I.filter(i => [raw.y, raw.infl, raw.rate, raw.tot, vx].every(a => v(a[i]) != null));
      const r = ols(use.map(i => raw.y[i]), use.map(i => [1, raw.infl[i], raw.rate[i], raw.tot[i], vx[i]]));
      const hu = holdI.map(i => raw.y[i] - (r.b[0] + r.b[1] * raw.infl[i] + r.b[2] * raw.rate[i] + r.b[3] * raw.tot[i] + r.b[4] * vx[i]));
      return { ...r, n: use.length, first: ds[use[0]], last: ds[use[use.length - 1]], hold: Math.sqrt(mean(hu.map(x => x * x))), vx };
    };
    const all = Object.fromEntries(Object.keys(form).map(f => [f, run(f)]));
    const best = Object.keys(all).reduce((a, f) => (all[f].hold < all[a].hold ? f : a));
    const R0 = all[best];
    say(F.vix === best && Object.keys(form).every(f => relx(F.tried.vix[f].rmseHold, all[f].hold, 1e-3)), `${iso}: VIX form ${best} has the lowest hold-out error (${Object.keys(form).map(f => `${f} ${all[f].hold.toFixed(2)}`).join(', ')})`);
    // the inputs stored in fx-fit.js = recomputed
    const xs = { y: raw.y, infl: raw.infl, rate: raw.rate, tot: raw.tot, vix: R0.vx };
    say(Object.keys(xs).every(k => ds.every((d, i) => relx(F.x[k][i], xs[k][i], 1e-5))), `${iso}: fx-fit.js inputs (y, 通胀差, 利差, 贸易条件 ${F.tot}, VIX) = recomputed from the raw files`);
    // coefficients, t, R², errors
    const names = ['const', ...KEYS];
    say(names.every((k, j) => relx(F.coef[k], R0.b[j], 1e-5) && relx(F.t[k], R0.t[j], 1e-3)) && relx(F.stats.r2, R0.r2, 1e-3) && relx(F.stats.rmseIn, R0.rmse, 1e-3)
      && relx(F.stats.rmseHold, R0.hold, 1e-3) && F.stats.n === R0.n,
      `${iso}: OLS + Newey-West recomputed: ${names.map((k, j) => `${k} ${R0.b[j].toFixed(3)} (t ${R0.t[j].toFixed(2)})`).join(', ')}; R² ${R0.r2.toFixed(3)}, hold-out rmse ${R0.hold.toFixed(2)}`);
    const zero = Math.sqrt(mean(holdI.map(i => raw.y[i] ** 2)));
    say(relx(F.stats.rmseHoldZero, zero, 1e-3), `${iso}: hold-out error of guessing 「不变」 ${zero.toFixed(2)} (the fit: ${R0.hold.toFixed(2)})`);
    // the hold-out flag: the sample ends 2021Q4 and 2022+ never enters; adding it would change the coefficients
    const withHold = run(best, [...fitI, ...holdI]);
    say(R0.first === FX_FIT.fit[0] && R0.last === FX_FIT.fit[1] && F.stats.last === '2021Q4' && FX_FIT.hold[0] === '2022Q1' && holdI.length === F.stats.nHold
      && Math.abs(withHold.b[2] - R0.b[2]) > 1e-4,
      `${iso}: hold-out respected: fit ${R0.first}–${R0.last} (n ${R0.n}); 2022Q1+ (${holdI.length} quarters) excluded (with them the 利差 coef would be ${withHold.b[2].toFixed(3)}, not ${R0.b[2].toFixed(3)})`);
    const used = fitI.filter(i => v(xs.y[i]) != null);
    const mu = Object.fromEntries(['y', ...KEYS].map(k => [k, mean(used.map(i => xs[k][i]))]));
    say(['y', ...KEYS].every(k => relx(F.mean[k], mu[k], 1e-5) || Math.abs(F.mean[k] - mu[k]) < 1e-9), `${iso}: 1996–2021 means (the 「平常」 each force is measured from)`);
    // the reactor shows exactly coef × (x − mean), scaled to %; pipes = 资本管 (利差 + 信心) / 商品价格管 (通胀差 + 贸易条件); 生产率 不计入
    let bad = 0, nq = 0;
    ds.forEach((d, i) => {
      const R = FXR.computeFxReactor(H, US, d, iso);
      if (!R.ok) return;
      nq++;
      const cl = Object.fromEntries(KEYS.map(k => [k, v(F.x[k][i]) != null ? F.coef[k] * (F.x[k][i] - F.mean[k]) : null]));
      const m = KEYS.reduce((s, k) => s + (cl[k] ?? 0), 0), sc = Math.abs(m) > 1e-9 ? (Math.exp(m / 100) - 1) * 100 / m : 1, c = k => (cl[k] == null ? null : cl[k] * sc);
      const good = near(R.forces.infl.c, c('infl')) && near(R.forces.rate.c, c('rate')) && near(R.forces.tot.c, c('tot')) && near(R.forces.conf.c, c('vix'))
        && R.forces.prod.c === null && R.forces.prod.skipped && near(R.pipes.cap.c, (c('rate') ?? 0) + (c('vix') ?? 0)) && near(R.pipes.goods.c, (c('infl') ?? 0) + (c('tot') ?? 0))
        && near(R.model, (Math.exp(m / 100) - 1) * 100) && near(R.unexplained, R.actual - R.model) && R.fit.hold === (d >= FX_FIT.hold[0])
        && near(R.forces.conf.input, F.x.vix[i]) && near(R.forces.tot.input, F.x.tot[i]);
      if (!good) { bad++; if (bad < 4) console.log('   mismatch', iso, d, R.forces.conf.c, c('vix')); }
    });
    say(bad === 0 && nq > 100, `${iso}: displayed forces = coef × (x − 1996–2021 mean), scaled to % so the pipes add up (${nq} quarters, ${bad} mismatches)`);
    const want = iso === 'AUS' ? ['澳元是风险货币：VIX 升 → 澳元弱', -1] : ['日元是避险货币：VIX 升 → 日元强', 1];
    const R08 = FXR.computeFxReactor(H, US, '2008Q4', iso);
    say(Math.sign(F.coef.vix) === want[1] && F.risk === want[0] && R08.forces.conf.risk === want[0] && Math.sign(R08.forces.conf.c) === want[1] && Math.abs(F.t.vix) > 2,
      `${iso}: risk sign as expected (VIX coef ${F.coef.vix.toFixed(3)}, t ${F.t.vix.toFixed(2)}): ${want[0]}; 2008Q4 信心 ${R08.forces.conf.c.toFixed(1)}%`);
    const html = FXR.reactorHtml(R08, { w: 400, open: true });
    say(html.includes('1 年尺度拟合，探索性') && html.includes(want[0]) && html.includes('不计入') && !html.includes('data-hold')
      && FXR.reactorHtml(FXR.computeFxReactor(H, US, '2023Q1', iso), { w: 400 }).includes('data-hold="1"'),
      `${iso}: the card shows the fit label, the risk sign, 生产率 不计入; 2023Q1 is tagged 保留样本 (data-hold), 2008Q4 is not`);
  }
  const RC = FXR.computeFxReactor(C.CHN, US, '2015Q4', 'CHN');
  say(RC.managed && FXR.reactorHtml(RC, { w: 400 }).includes('人民币是管理汇率'), 'CHN: JST rule kept, the card says the CNY is managed');
}

/* ---------- 2. the SVG: needle at the actual change, 公式 tick at the sum, the bracket spans both ---------- */
for (const [iso, d] of [['AUS', '2008Q4'], ['AUS', '2011Q2'], ['AUS', '2015Q2'], ['JPN', '2022Q4'], ['GBR', '2022Q4']]) {
  const R = FXR.computeFxReactor(C[iso], US, d, iso);
  for (const g of [{ x0: 150, x1: 246, lab: 146, top: 465, rows: [469, 477.5], bot: 482, gapY: 486, fs: 7.4, range: 25, compact: true },
    { x0: 104, x1: 392, lab: 96, top: 16, rows: [30, 56], bot: 72, gapY: 85, fs: 12, range: 25 }]) {
    const svg = FXR.reactorSvg(R, g), cx = (g.x0 + g.x1) / 2, half = (g.x1 - g.x0) / 2;
    const X = q => cx + Math.max(-1, Math.min(1, q / g.range)) * half;
    const nl = /class="fxr-nl" d="M([-\d.]+) /.exec(svg), sm = /class="fxr-sum" d="M([-\d.]+) /.exec(svg), br = /class="fxr-gap"><path d="M([-\d.]+) [-\d.]+ H([-\d.]+)"/.exec(svg);
    ok(nl && Math.abs(+nl[1] - X(R.actual)) < 0.06, `${iso} ${d} svg: needle at the actual change (${nl && nl[1]} vs ${X(R.actual).toFixed(2)})`);
    ok(sm && Math.abs(+sm[1] - X(R.model)) < 0.06, `${iso} ${d} svg: 公式 tick at the sum of the two pipes`);
    ok(!br || (Math.abs(+br[1] - X(R.model)) < 0.06 && Math.abs(+br[2] - X(R.actual)) < 0.06), `${iso} ${d} svg: the 说不清 bracket spans 公式 -> needle`);
    ok((svg.match(/data-fxr-pipe=/g) || []).length === 2 && svg.includes('fxr-anchor'), `${iso} ${d} svg: two pipes and the anchor line, nothing more`);
  }
}
say(fails === 0, 'SVG geometry: needle / 公式 / 说不清 bracket in the right places (band + panel geometry)');

/* ---------- 3. usd-index.js from the raw FRED files ---------- */
const csv = f => readFileSync(path.join(ROOT, 'data_src/world/fred', f), 'utf8').trim().split(/\r?\n/).slice(1).map(l => l.split(',')).filter(r => r[1] !== '' && r[1] !== '.').map(r => [r[0], +r[1]]);
const qOf = s => `${s.slice(0, 4)}Q${Math.floor((+s.slice(5, 7) - 1) / 3) + 1}`;
const meanBy = (rows, key) => { const m = {}; for (const [d, x] of rows) { const k = key(d); (m[k] = m[k] || []).push(x); } const o = {}; for (const k in m) o[k] = m[k].reduce((a, b) => a + b, 0) / m[k].length; return o; };
const newQ = meanBy(Object.entries(meanBy(csv('DTWEXBGS.csv'), d => d.slice(0, 7))).map(([m, x]) => [m + '-01', x]), qOf);   // daily -> monthly -> quarterly
const oldM = meanBy(csv('TWEXBMTH.csv'), d => d.slice(0, 7)), wk = meanBy(csv('TWEXB.csv'), d => d.slice(0, 7));
for (const k in wk) if (oldM[k] == null) oldM[k] = wk[k];
const oldQ = meanBy(Object.entries(oldM).map(([m, x]) => [m + '-01', x]), qOf);
const k0 = newQ['2006Q1'] / oldQ['2006Q1'];
let bad = 0;
USD_INDEX.dates.forEach((d, i) => { const want = d >= '2006Q1' ? newQ[d] : oldQ[d] * k0; if (!(Math.abs(USD_INDEX.broad[i] - want) <= 5e-4 * want)) bad++; });
say(bad === 0 && USD_INDEX.dates.length === 124 && USD_INDEX.dates[0] === '1995Q1', `usd-index.js broad = DTWEXBGS (2006+) spliced with TWEXBMTH x ${k0.toFixed(4)} (${bad} mismatches)`);
const ioQ = meanBy(csv('PIORECRUSDM.csv'), qOf);
bad = 0; USD_INDEX.dates.forEach((d, i) => { if (!(Math.abs(USD_INDEX.ironOre[i] - ioQ[d]) <= 5e-4 * ioQ[d])) bad++; });
say(bad === 0, `usd-index.js ironOre = quarterly mean of PIORECRUSDM (${bad} mismatches)`);
const u08 = FXR.usdIndexAt('2008Q4'), uY = FXR.usdIndexYear(2015);
say(near(u08.chg, (USD_INDEX.broad[55] / USD_INDEX.broad[51] - 1) * 100) && u08.chg > 5 && uY.chg > 10, `dollar index: 2008Q4 ${u08.level.toFixed(1)} (${u08.chg.toFixed(1)}% vs a year before, the 2008 flight to the dollar); 2015 annual mean +${uY.chg.toFixed(0)}%`);

/* ---------- 4. the AUD story ---------- */
const Ra = d => FXR.computeFxReactor(C.AUS, US, d, 'AUS');
const qs = (a, b) => C.AUS.dates.filter(d => d >= a && d <= b);
const boom = qs('2003Q1', '2011Q4').map(Ra), bust = qs('2012Q1', '2016Q4').map(Ra);
const share = (arr, f) => arr.filter(f).length / arr.length;
say(share(boom, R => R.forces.rate.c > 0) >= 0.8, `AUD 2003–11: the rate gap pushes AUD up (above its 1996–2021 normal) in ${Math.round(100 * share(boom, R => R.forces.rate.c > 0))}% of quarters`);
say(share(boom, R => R.forces.tot.oreDir > 0) >= 0.6, `AUD 2003–11: iron ore up a year before in ${Math.round(100 * share(boom, R => R.forces.tot.oreDir > 0))}% of quarters`);
say(share(bust, R => R.forces.tot.oreDir < 0) >= 0.5 && Ra('2016Q4').forces.rate.c < Ra('2011Q2').forces.rate.c / 2, `AUD 2012–16: iron ore down a year before in ${Math.round(100 * share(bust, R => R.forces.tot.oreDir < 0))}% of quarters; 利差 push ${Ra('2011Q2').forces.rate.c.toFixed(2)}% (2011Q2) -> ${Ra('2016Q4').forces.rate.c.toFixed(2)}% (2016Q4)`);
for (const [iso, d] of [['AUS', '2008Q4'], ['AUS', '2011Q2'], ['AUS', '2015Q2'], ['JPN', '2008Q4']]) {
  const R = FXR.computeFxReactor(C[iso], US, d, iso), j = jstRef[iso][d];
  say(Math.abs(R.unexplained) < Math.abs(j) * 0.6, `${iso} ${d}: the 1-year fit shrinks 说不清 from ${j.toFixed(1)}% (JST rule) to ${R.unexplained.toFixed(1)}% (needle ${R.actual.toFixed(1)}%)`);
}
const J13 = FXR.computeFxReactor(C.JPN, US, '2013Q2', 'JPN');
say(J13.unexplained < -15, `JPN 2013Q2 (Abenomics): still mostly 说不清 ${J13.unexplained.toFixed(1)}% of ${J13.actual.toFixed(1)}% (the BoJ's QQE is not a force in the fit)`);
say(Ra('2011Q2').anchor.word === '偏贵' && Ra('2011Q2').anchor.value > 30, `AUD 2011Q2: ${Ra('2011Q2').anchor.word} ${Ra('2011Q2').anchor.value.toFixed(0)}% vs the PPP anchor (the boom pushed it far above)`);
const audcny = y => { const v4 = [1, 2, 3, 4].map(q => { const d = `${y}Q${q}`, i = C.AUS.dates.indexOf(d); return C.CHN.series.fxPerUsd[i] / C.AUS.series.fxPerUsd[i]; }); return v4.reduce((a, b) => a + b, 0) / 4; };
const ref = FX_SPEC.audcnyRef;
say(Math.abs(audcny(2006) - ref[0].v) < 0.05 && Math.abs(audcny(2011) - ref[1].v) < 0.05 && audcny(2025) < 4.8,
  `AUD/CNY from the data: 2006 ${audcny(2006).toFixed(2)} (spec ${ref[0].v}), 2011 ${audcny(2011).toFixed(2)} (spec ${ref[1].v}), 2025 ${audcny(2025).toFixed(2)} (spec 2026-10 spot ${FX_SPEC.scen.audcny.spot}, not in the data)`);
for (const d of ['2008Q4', '2011Q2', '2015Q2']) {
  const R = Ra(d);
  console.log(`   AUS ${d}: needle ${R.actual.toFixed(1)}% | 资本管 ${R.pipes.cap.c.toFixed(2)}% (利差 ${R.forces.rate.c.toFixed(2)}, 信心 ${R.forces.conf.c.toFixed(2)}) | 商品价格管 ${R.pipes.goods.c.toFixed(2)}% (通胀差 ${R.forces.infl.c.toFixed(2)}, 贸易条件 ${R.forces.tot.c.toFixed(2)}) | 拟合 ${R.model.toFixed(1)}% | 说不清 ${R.unexplained.toFixed(1)}% | PPP ${R.anchor.word} ${R.anchor.value.toFixed(0)}%`);
}
for (const d of ['2008Q4', '2013Q2']) {
  const R = FXR.computeFxReactor(C.JPN, US, d, 'JPN');
  console.log(`   JPN ${d}: needle ${R.actual.toFixed(1)}% | 资本管 ${R.pipes.cap.c.toFixed(2)}% (利差 ${R.forces.rate.c.toFixed(2)}, 信心 ${R.forces.conf.c.toFixed(2)}) | 商品价格管 ${R.pipes.goods.c.toFixed(2)}% (通胀差 ${R.forces.infl.c.toFixed(2)}, 贸易条件 ${R.forces.tot.c.toFixed(2)}) | 拟合 ${R.model.toFixed(1)}% | 说不清 ${R.unexplained.toFixed(1)}%`);
}

/* ---------- 5. browser ---------- */
if (!process.env.NOBROWSER) {
  const EDGE = 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe', port = 9383, BASE = process.env.BASE || 'http://localhost:8321/';
  const proc = spawn(EDGE, ['--headless=new', '--disable-gpu', `--remote-debugging-port=${port}`, '--window-size=1180,820', 'about:blank'], { stdio: 'ignore' });
  const sleep = ms => new Promise(r => setTimeout(r, ms));
  const allLayers = u => (/^about:/.test(u) ? u : u + (u.includes('?') ? '&' : '?') + 'layers=all');   // progressive diagram: this check wants the whole diagram (layers: tools/check_layers.mjs)
  const errors = [];
  try {
    let ver = null;
    for (let i = 0; i < 40 && !ver; i++) { try { ver = await (await fetch(`http://127.0.0.1:${port}/json/version`)).json(); } catch (e) { await sleep(250); } }
    const tabs = async () => (await (await fetch(`http://127.0.0.1:${port}/json`)).json()).filter(x => x.type === 'page');
    const bw = new WebSocket(ver.webSocketDebuggerUrl); await new Promise((res, rej) => { bw.onopen = res; bw.onerror = rej; });
    const before = new Set((await tabs()).map(x => x.id));
    bw.send(JSON.stringify({ id: 1, method: 'Target.createTarget', params: { url: 'about:blank' } }));
    let tab = null; for (let i = 0; i < 40 && !tab; i++) { await sleep(150); tab = (await tabs()).find(x => !before.has(x.id)); }
    const ws = new WebSocket(tab.webSocketDebuggerUrl); await new Promise((res, rej) => { ws.onopen = res; ws.onerror = rej; });
    let id = 0; const pending = new Map();
    ws.onmessage = m => { const d = JSON.parse(m.data); if (d.id && pending.has(d.id)) { pending.get(d.id)(d); pending.delete(d.id); } else if (d.method === 'Runtime.exceptionThrown') errors.push(d.params.exceptionDetails.text + ' ' + (d.params.exceptionDetails.exception?.description || '')); };
    const send = (method, params = {}) => new Promise(res => { const i = ++id; pending.set(i, res); ws.send(JSON.stringify({ id: i, method, params })); });
    const ev = async expr => { const r = await send('Runtime.evaluate', { expression: expr, awaitPromise: true, returnByValue: true }); if (r.result.exceptionDetails) throw new Error(r.result.exceptionDetails.exception?.description || 'eval error'); return r.result.result.value; };
    const go = async url => { await send('Page.navigate', { url: allLayers(url) }); await sleep(2800); };
    const click = sel => ev(`(()=>{const b=document.querySelector(${JSON.stringify(sel)}); if(!b) return 'missing'; b.dispatchEvent(new MouseEvent('click',{bubbles:true,cancelable:true})); return 'ok'})()`);
    const vp = (w, h) => send('Emulation.setDeviceMetricsOverride', { width: w, height: h, deviceScaleFactor: 1, mobile: w < 500 });
    await send('Runtime.enable'); await send('Page.enable');

    await vp(1180, 820);
    await go(`${BASE}?country=AUS&forceCountry=1&t=55&pause=1`);
    const R = Ra('2008Q4');
    const band = await ev(`(()=>{const g=document.querySelector('.bd-fxr'); const t=document.querySelector('.bd-fxt'); return { pipes: g ? g.querySelectorAll('[data-fxr-pipe]').length : 0, needle: !!(g && g.querySelector('.fxr-nl')), anchor: !!(g && g.querySelector('.fxr-anchor')), shown: g ? getComputedStyle(g).display !== 'none' : false, txt: t ? t.textContent : '', date: document.getElementById('date').textContent } })()`);
    say(band.date === '2008Q4' && band.shown && band.pipes === 2 && band.needle && band.anchor, `AUS 2008Q4 border band: reactor drawn (2 pipes, needle, anchor): ${JSON.stringify(band)}`);
    say(band.txt.includes(`${Math.abs(R.actual).toFixed(0)}%`) && band.txt.includes('/美元') && band.txt.includes(`${Math.abs(R.anchor.value).toFixed(0)}%`), `band readings = the numbers (澳元 ${R.actual.toFixed(0)}%, 比锚 ${R.anchor.value.toFixed(0)}%): ${band.txt}`);
    const lim = await ev(`(()=>{const g=document.querySelector('.bd-fxr').getBBox(); return [g.y, g.y + g.height]})()`);
    // v3.1 picture: the border band sits ABOVE the drawing (flow.js BD_TOP -48 .. BD_LINE -4); was 461–497 under it
    say(lim[0] >= -54 && lim[1] <= -3.5, `reactor stays inside the border band (y ${lim.map(x => x.toFixed(1)).join('–')}, band -48–-4, the needle head reaches the top edge)`);
    await click('.bd-fxr [data-fxr-pipe="cap"]'); await sleep(300);
    const pop = await ev(`(()=>{const p=document.querySelector('.fxr-pop'); return p ? { hidden: p.hidden, open: !!p.querySelector('.fxr-forces[open]'), hl: (p.querySelector('.fxr-grp.hl')||{}).dataset?.grp, n: p.querySelectorAll('.fxr-f').length, t: p.textContent } : null})()`);
    say(pop && !pop.hidden && pop.open && pop.hl === 'cap' && pop.n === 5, `desktop: tapping 资本管 opens the five forces with 资本管 highlighted: ${pop && JSON.stringify({ ...pop, t: undefined })}`);
    say(pop && ['通胀差', '利差', '生产率', '贸易条件', '信心', '说不清', '不计入', '1 年尺度拟合，探索性', '澳元是风险货币：VIX 升 → 澳元弱'].every(w => pop.t.includes(w)), 'the five forces listed: 说不清, 生产率 不计入, the fit label and the risk sign shown');
    const shown = await ev(`[...document.querySelectorAll('.fxr-pop .fxr-f')].map(li => li.dataset.force + ':' + li.querySelector('b + b').textContent)`);
    const pc = k => (Math.abs(R.forces[k].c) < 0.05 ? '几乎不推' : `${R.forces[k].c > 0 ? '推强' : '推弱'} ${Math.abs(R.forces[k].c).toFixed(1)}%`);
    say(['rate', 'conf', 'infl', 'tot'].every(k => shown.includes(`${k}:${pc(k)}`)) && shown.includes('prod:不计入'), `the drill-down shows each force's own fitted contribution: ${shown.join(' | ')}`);
    await click('.fxr-pop [data-act="fxr-close"]'); await sleep(200);
    say(await ev(`document.querySelector('.fxr-pop').hidden`), '✕ closes the reactor popover');
    await click('.bd-gate:not(.bd-res)'); await sleep(500);
    const card = await ev(`(()=>{const r=document.getElementById('concept-root'); return r && !r.hidden ? { t: r.querySelector('.cc-title')?.textContent, five: r.querySelectorAll('.fxr-card li').length, go: !!r.querySelector('[data-fxr-lesson="fx"]'), why: r.querySelector('.cc-why')?.textContent || '' } : null})()`);
    say(card && card.t === '汇率' && card.five === 5 && card.go, `tapping the FX gate opens the 汇率 card with the five forces and a lesson button: ${JSON.stringify(card && { ...card, why: undefined })}`);
    say(card && card.why.includes('吸力差') && card.why.includes('说不清') && card.why.includes('PPP'), `汇率 card why = the reactor numbers: ${card && card.why.slice(0, 120)}`);
    // phone: the 净出口 gate popover carries the reactor
    await vp(390, 844);
    await go(`${BASE}?country=AUS&forceCountry=1&t=65&pause=1`);
    await click('.chip[data-bd="pill"]'); await sleep(400);
    const ph = await ev(`(()=>{const p=document.querySelector('.flow-bpop'); return p ? { hidden: p.hidden, pipes: p.querySelectorAll('[data-fxr-pipe]').length, w: p.getBoundingClientRect().width, sw: p.scrollWidth, cw: p.clientWidth, con: (p.querySelector('.fxr-con')||{}).textContent } : null})()`);
    say(ph && !ph.hidden && ph.pipes === 2 && ph.sw <= ph.cw + 1, `phone 2011Q2: the 净出口 gate popover holds the reactor, no sideways scroll: ${JSON.stringify(ph)}`);
    await click('.flow-bpop [data-fxr-pipe="goods"]'); await sleep(300);
    say(await ev(`!!document.querySelector('.flow-bpop .fxr-forces[open]') && document.querySelector('.flow-bpop .fxr-grp.hl').dataset.grp === 'goods' && !document.querySelector('.flow-bpop').hidden`), 'phone: tapping 商品价格管 opens the forces inside the popover (it stays open)');
    // USA: dollar index in the band
    await vp(1180, 820);
    await go(`${BASE}?t=55&pause=1`);
    const us = await ev(`(()=>{const g=document.querySelector('.bd-res'); return g && getComputedStyle(g).display !== 'none' ? g.textContent : ''})()`);
    say(us.includes('美元指数') && us.includes(String(Math.round(FXR.usdIndexAt('2008Q4').level))), `USA 2008Q4 band: ${us}`);
    // lesson panel
    const pn = await ev(`(async()=>{ const m = await import('${BASE}src/ui/fx-reactor.js'); const h = document.createElement('div'); h.style.width='540px'; document.body.appendChild(h);
      const r = await m.mountFxReactor(h, { iso: 'AUS', year: 2011, forces: true }); const o = { date: r.dataset.date, pipes: r.querySelectorAll('[data-fxr-pipe]').length, open: !!r.querySelector('.fxr-forces[open]') };
      const r2 = await m.mountFxReactor(h, { iso: 'AUS', t: 55 }); o.t55 = r2.dataset.date; o.one = h.querySelectorAll('.fxr-panel').length; m.unmountFxReactor(); o.after = h.querySelectorAll('.fxr-panel').length; return o; })()`);
    say(pn.date === '2011Q4' && pn.pipes === 2 && pn.open && pn.t55 === '2008Q4' && pn.one === 1 && pn.after === 0, `mountFxReactor(host, {iso, year|t, forces}) / unmountFxReactor(): ${JSON.stringify(pn)}`);
    const pn2 = await ev(`(async()=>{ const m = await import('${BASE}src/ui/fx-reactor.js'); const h = document.createElement('div'); h.style.width='540px'; document.body.appendChild(h);
      const r = await m.mountFxReactor(h, { iso: 'JPN', date: '2023Q1', forces: true, hl: 'cap' }); const b = r.querySelector('.fxr-box'); const o = { hold: b.dataset.hold, tag: [...r.querySelectorAll('.fxr-tag')].map(x => x.textContent).join('|'), risk: r.querySelector('.fxr-risk')?.textContent, hl: r.querySelector('.fxr-grp.hl')?.dataset.grp };
      const c = await m.mountFxReactor(h, { iso: 'CHN', date: '2015Q4' }); o.chn = !!c.querySelector('.fxr-managed'); m.openFxForces('goods'); o.open = !!c.querySelector('.fxr-forces[open]'); m.unmountFxReactor(); return o; })()`);
    say(pn2.hold === '1' && pn2.tag === '1 年尺度拟合，探索性|保留样本' && pn2.risk === '日元是避险货币：VIX 升 → 日元强' && pn2.hl === 'cap' && pn2.chn && pn2.open, `lesson panel JPN 2023Q1 (hold-out) + CHN managed note + openFxForces(): ${JSON.stringify(pn2)}`);
    say(errors.length === 0, 'no JS errors' + (errors.length ? ': ' + errors.slice(0, 3).join(' | ') : ''));
    ws.close();
  } catch (e) { console.log('driver error', e); fails++; }
  finally { proc.kill(); }
}
console.log(fails ? `${fails} FAIL` : `ALL OK (${oks} assertions)`);
process.exit(fails ? 1 : 0);
