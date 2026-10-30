// scratch (b7 country scout): run GBR/JPN/EA/CHN in history mode and compare the model with the real series on stylised facts.
// node tools/country_scout.mjs [ISO ...] [--tpl AUS]   --tpl: borrow that country's params (in-process only) instead of the USA fallback
import { createSim } from '../src/engine/sim.js';
import { COUNTRY_PARAMS } from '../src/data/country-params.js';
const args = process.argv.slice(2);
const ti = args.indexOf('--tpl'), TPL = ti >= 0 ? args[ti + 1] : null;
const isos = args.filter((a, i) => !a.startsWith('--') && (ti < 0 || i !== ti + 1));
const list = isos.length ? isos : ['GBR', 'JPN', 'EA', 'CHN'];
const pct = (x, d = 1) => (x == null || !Number.isFinite(x) ? ' n/a' : (x * 100).toFixed(d));
for (const iso of list) {
  const data = (await import(new URL(`../src/data/countries/${iso.toLowerCase()}-quarterly.js`, import.meta.url).href))[`${iso}_Q`];
  if (TPL) COUNTRY_PARAMS[iso] = { ...COUNTRY_PARAMS[TPL], iso, rules: COUNTRY_PARAMS[TPL].rules };
  const si = process.argv.indexOf('--set');   // --set shockMult=1,slackVsCapEff=true  (in-process trial only)
  if (si > 0) { const base = COUNTRY_PARAMS[iso] || { ...COUNTRY_PARAMS.USA, iso }; COUNTRY_PARAMS[iso] = { ...base };
    for (const kv of process.argv[si + 1].split(',')) { const [k, v] = kv.split('='); COUNTRY_PARAMS[iso][k] = v === 'true' ? true : v === 'false' ? false : Number(v); } }
  const sim = createSim({ data, mode: 'history', country: iso });
  while (!sim.done) sim.step();
  const h = sim.history(), S = data.series, D = data.dates, ix = d => D.indexOf(d);
  const sl = (a, x, y) => a.slice(ix(x), ix(y) + 1);
  const ok = a => a.filter(v => v != null && Number.isFinite(v));
  const mx = a => Math.max(...ok(a)), mn = a => Math.min(...ok(a)), av = a => { const b = ok(a); return b.reduce((p, q) => p + q, 0) / b.length; };
  const dd = a => { let pk = -Infinity, d = 0; for (const v of a) { if (v == null || !Number.isFinite(v)) continue; pk = Math.max(pk, v); d = Math.min(d, v / pk - 1); } return d; };
  const rmse = (m, r) => { const p = m.map((v, i) => [v, r?.[i]]).filter(([a, b]) => b != null && Number.isFinite(a)); return Math.sqrt(p.reduce((s, [a, b]) => s + (a - b) ** 2, 0) / p.length); };
  const nanAt = h.findIndex(s => !Number.isFinite(s.assets.housing.price) || !Number.isFinite(s.macro.unemployment) || !Number.isFinite(s.assets.equity.price));
  const M = {
    H: h.map(s => s.assets.housing.price), U: h.map(s => s.macro.unemployment), P: h.map(s => s.macro.inflation),
    HD: h.map(s => s.debt.household / s.macro.gdpNominal), DS: h.map(s => s.household.dsr), E: h.map(s => s.assets.equity.price),
    GD: h.map(s => s.gov.debtGdp), Y: h.map(s => s.rates.gov10y), MR: h.map(s => s.rates.mortgageEff), POL: h.map(s => s.rates.policy),
  };
  // real house index rebased to the model's start where the real series starts later (CHN 2005)
  const H0r = S.houseIndex.findIndex(v => v != null);
  const Hr = S.houseIndex.map(v => (v == null ? null : v / S.houseIndex[H0r] * M.H[H0r]));
  const rows = [];
  const add = (name, m, r, note = '') => rows.push([name, m, r, note]);
  add('house rise 1995->2007', pct(M.H[ix('2007Q4')] / M.H[0] - 1, 0) + '%', H0r === 0 ? pct(S.houseIndex[ix('2007Q4')] / S.houseIndex[0] - 1, 0) + '%' : 'n/a (starts ' + D[H0r] + ')');
  add('house max dd 2007-13', pct(dd(sl(M.H, '2007Q1', '2013Q4'))) + '%', pct(dd(sl(S.houseIndex, '2007Q1', '2013Q4'))) + '%');
  add('house max dd 2021-25', pct(dd(sl(M.H, '2021Q1', '2025Q4'))) + '%', pct(dd(sl(S.houseIndex, '2021Q1', '2025Q4'))) + '%');
  add('house end-2025 model/real', pct(M.H[123] / Hr[123] - 1, 0) + '%', '0%', '(AUS target +-40%)');
  add('u peak 2008-13', pct(mx(sl(M.U, '2008Q1', '2013Q4'))) + '%', pct(mx(sl(S.unemployment, '2008Q1', '2013Q4'))) + '%');
  add('u peak 2020-21', pct(mx(sl(M.U, '2020Q1', '2021Q4'))) + '%', pct(mx(sl(S.unemployment, '2020Q1', '2021Q4'))) + '%');
  add('u avg 2023-25', pct(av(sl(M.U, '2023Q1', '2025Q4'))) + '%', pct(av(sl(S.unemployment, '2023Q1', '2025Q4'))) + '%');
  add('u RMSE 1995-2025 (pp)', pct(rmse(M.U, S.unemployment)), '0');
  add('CPI avg 1998-2012', pct(av(sl(M.P, '1998Q1', '2012Q4'))) + '%', pct(av(sl(S.cpiYoY, '1998Q1', '2012Q4'))) + '%');
  add('CPI min 1995-2020', pct(mn(sl(M.P, '1995Q1', '2020Q4'))) + '%', pct(mn(sl(S.cpiYoY, '1995Q1', '2020Q4'))) + '%');
  add('CPI peak 2021-23', pct(mx(sl(M.P, '2021Q1', '2023Q4'))) + '%', pct(mx(sl(S.cpiYoY, '2021Q1', '2023Q4'))) + '%');
  add('CPI RMSE (pp)', pct(rmse(M.P, S.cpiYoY)), '0');
  add('hh debt/GDP start / max / end', `${pct(M.HD[0], 0)} / ${pct(mx(M.HD), 0)} / ${pct(M.HD[123], 0)}`, S.hhDebtGdp ? `${pct(S.hhDebtGdp[0], 0)} / ${pct(mx(S.hhDebtGdp), 0)} / ${pct(S.hhDebtGdp[123], 0)}` : '-');
  add('DSR 1999 / 2008 / 2025', `${pct(M.DS[ix('1999Q1')])} / ${pct(M.DS[ix('2008Q3')])} / ${pct(M.DS[123])}`, S.hhDsr ? `${pct(S.hhDsr[ix('1999Q1')])} / ${pct(S.hhDsr[ix('2008Q3')])} / ${pct(S.hhDsr[123])}` : '-');
  add('gov debt/GDP max', pct(mx(M.GD), 0) + '%', S.govDebtGdp ? pct(mx(S.govDebtGdp), 0) + '%' : '-');
  add('10y 2025Q4', pct(M.Y[123], 2) + '%', S.gov10y ? pct(S.gov10y[123], 2) + '%' : '-');
  add('eff. mortgage rate 2025Q4', pct(M.MR[123], 2) + '%', S.mortgageRate ? pct(S.mortgageRate[123], 2) + '%' : '-');
  const E0 = S.equityIndex.findIndex(v => v != null);
  add('equity 2007Q4->2009Q1', pct(M.E[ix('2009Q1')] / M.E[ix('2007Q4')] - 1, 0) + '%', pct(S.equityIndex[ix('2009Q1')] / S.equityIndex[ix('2007Q4')] - 1, 0) + '%');
  add('equity end-2025 model/real', pct(M.E[123] / (S.equityIndex[123] / S.equityIndex[E0] * M.E[E0]) - 1, 0) + '%', '0%');
  add('policy min (input)', pct(mn(M.POL), 2) + '%', pct(mn(S.policyRate), 2) + '%', 'negative in data -> engine clamps / EC:68 fails');
  const L = h.map(s => s.cycles.long), f5 = L.findIndex(x => x.stage === 5), b2 = L.findIndex(x => x.fork === 'B2');
  const stages = []; L.forEach((x, i) => { if (!i || x.stage !== L[i - 1].stage) stages.push(`${D[i]}:${x.stage}`); });
  add('first ⑤ / first B2', `${f5 >= 0 ? D[f5] : 'never'} / ${b2 >= 0 ? D[b2] : 'never'}`, '', '');
  // Taylor vs real policy
  const tsim = createSim({ data, mode: 'history', country: iso }); tsim.setRuleEnabled('cb_real_path', false); while (!tsim.done) tsim.step();
  const tay = tsim.history().map(s => s.rates.policy), pr = S.policyRate;
  const xs = pr.map((x, i) => [x, tay[i]]).filter(([x, y]) => x != null && Number.isFinite(y)), m1 = av(xs.map(q => q[0])), m2 = av(xs.map(q => q[1]));
  const corr = xs.reduce((p, [a, b]) => p + (a - m1) * (b - m2), 0) / Math.sqrt(xs.reduce((p, [a]) => p + (a - m1) ** 2, 0) * xs.reduce((p, [, b]) => p + (b - m2) ** 2, 0));
  add('Taylor vs real policy corr', corr.toFixed(2), '>=0.6 (AUS soft)');
  console.log(`\n##### ${iso}  params: ${TPL ? TPL + ' template' : (sim.countryParamsFallback ? 'USA fallback' : iso)}  first non-finite: ${nanAt >= 0 ? D[nanAt] : 'none'}`);
  console.log('  real GDP yoy min:', pct(mn(S.gdpRealGrowthYoY)) + '%', 'at', D[S.gdpRealGrowthYoY.indexOf(mn(S.gdpRealGrowthYoY))]);
  for (const r of rows) console.log('  ' + r[0].padEnd(32) + String(r[1]).padEnd(22) + String(r[2]).padEnd(24) + r[3]);
  console.log('  long-cycle stage changes:', stages.slice(0, 14).join(' '));
}
