// Readout (b5 burst): extends tools/backtest_real.mjs to policy rate, house-price growth and the dials themselves. One page: tools/BACKTEST-READOUT.md.
// node tools/backtest_readout.mjs           -> prints the tables
// node tools/backtest_readout.mjs --write   -> also writes src/data/real/backtest-readout.js (read by src/ui/backtest-view.js, the 周期 tab's 回测 section)
// Walk-forward: every forecast made at t reads X[s] / R[s] for s <= t only. Imports backtest_real.mjs unchanged (vintage B readings).
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { walkForward, ctx, ROOT, IN_FROM, IN_TO, OUT_FROM } from './backtest_real.mjs';

export const READOUT_FILE = path.join(ROOT, 'src/data/real/backtest-readout.js');
const num = x => typeof x === 'number' && Number.isFinite(x);
const mean = a => (a.length ? a.reduce((x, y) => x + y, 0) / a.length : null);
const r4 = x => (num(x) ? Math.round(x * 1e4) / 1e4 : null);
// direction table for the two new variables, written BEFORE any result was computed (by the dial's "next phase": 扩张→过热→收紧→降息→扩张)
const SIGN2 = { 扩张: { pol: 1, hp: 1 }, 过热: { pol: 1, hp: -1 }, 收紧: { pol: -1, hp: -1 }, 降息: { pol: -1, hp: 1 }, 推不动: { pol: -1, hp: -1 } };
const SIGN1 = { 扩张: { u: -1, pi: 1 }, 过热: { u: 1, pi: -1 }, 收紧: { u: 1, pi: -1 }, 降息: { u: -1, pi: -1 }, 推不动: { u: 1, pi: -1 } };
const NEXT = { 扩张: '过热', 过热: '收紧', 收紧: '降息', 降息: '扩张', 推不动: '推不动' };

/** { USA: { 'in h4 u': {...}, ..., 'in h4 dial': {...} }, AUS: {...} }; mae as a fraction (0.0111 = 1.11pp), hit as a share */
export async function computeReadout() {
  const out = {};
  for (const iso of ['USA', 'AUS']) {
    const R = await walkForward(iso, 'rt');
    const C = ctx(iso, R);
    const H = C.D.series.houseIndex;
    // house-price growth over the last 4 quarters (a rate, like CPI inflation); uses H[t-4..t] only
    C.X.hp = H.map((v, t) => (t >= 4 && num(v) && num(H[t - 4]) ? v / H[t - 4] - 1 : null));
    const res = {};
    for (const which of ['in', 'out']) for (const h of [4, 8]) for (const v of ['u', 'pi', 'pol', 'hp']) {
      const X = C.X[v];
      const [a, b] = which === 'in' ? [C.in0, C.in1 - h] : [C.out0, C.n - 1 - h];
      const rows = [];
      for (let t = a; t <= b; t++) {
        if (!R[t] || !num(X[t]) || !num(X[t + h]) || !num(X[t - h])) continue;
        const tr = [];
        for (let s = C.t0; s + h <= t; s++) if (R[s] && num(X[s]) && num(X[s + h])) tr.push([R[s].cls, X[s + h] - X[s]]);
        const drift = tr.length ? mean(tr.map(x => x[1])) : 0;
        const same = tr.filter(x => x[0] === R[t].cls).map(x => x[1]);
        const f = { noChange: 0, persistence: X[t] - X[t - h], phaseMean: same.length >= 4 ? mean(same) : drift };
        const sg = (SIGN1[R[t].cls] || {})[v] ?? SIGN2[R[t].cls][v];
        rows.push({ a: X[t + h] - X[t], f, sg });
      }
      const up = x => x > 0;
      const r = { n: rows.length };
      for (const k of ['noChange', 'persistence', 'phaseMean']) {
        r[k] = { mae: r4(mean(rows.map(x => Math.abs(x.a - x.f[k])))), hit: r4(rows.filter(x => up(x.f[k]) === up(x.a)).length / rows.length) };
      }
      r.framework = { hit: r4(rows.filter(x => (x.sg > 0) === up(x.a)).length / rows.length) };
      res[`${which} h${h} ${v}`] = r;
    }
    // the dials themselves: the short-dial class / long-dial stage h quarters later
    for (const which of ['in', 'out']) for (const h of [4, 8]) {
      const [a, b] = which === 'in' ? [C.in0, C.in1 - h] : [C.out0, C.n - 1 - h];
      let n = 0, same = 0, nxt = 0, trans = 0, lsame = 0, lnext = 0;
      for (let t = a; t <= b; t++) {
        if (!R[t] || !R[t + h]) continue;
        n++;
        const c = R[t].cls, c2 = R[t + h].cls;
        if (c === c2) same++;
        if (NEXT[c] === c2) nxt++;
        // walk-forward transition table: most frequent class h quarters after class c, using pairs (s, s+h) with s+h <= t
        const cnt = {};
        for (let s = C.t0; s + h <= t; s++) if (R[s] && R[s + h] && R[s].cls === c) cnt[R[s + h].cls] = (cnt[R[s + h].cls] || 0) + 1;
        const best = Object.entries(cnt).sort((x, y) => y[1] - x[1])[0];
        if ((best ? best[0] : c) === c2) trans++;
        if (R[t].stage === R[t + h].stage) lsame++;
        if (R[t + h].stage === R[t].stage + 1) lnext++;
      }
      res[`${which} h${h} dial`] = { n, shortSame: r4(same / n), shortNextPhase: r4(nxt / n), shortTransTable: r4(trans / n), longSame: r4(lsame / n), longNextStage: r4(lnext / n) };
    }
    out[iso] = res;
  }
  return out;
}

/** the generated data module (deterministic) */
export function readoutFileText(out) {
  const o = { generatedBy: 'tools/backtest_readout.mjs --write', method: 'tools/BACKTEST-READOUT.md (walk-forward, vintage B, as tools/BACKTEST.md)',
    inSample: `${IN_FROM}..${IN_TO} (outcome window ends by ${IN_TO})`, heldOut: `${OUT_FROM}+`,
    keys: "'<in|out> h<4|8> <u|pi|pol|hp>' = unemployment / CPI inflation / policy rate / house-price growth over the last 4 quarters: " +
      'mae (fraction, 0.0111 = 1.11pp) and hit (direction up / not up) of noChange, persistence, phaseMean (the dial forecast); framework.hit = the pre-registered direction table. ' +
      "'<in|out> h<4|8> dial' = share of quarters whose short-dial class is the same h quarters later (shortSame), is the dial's next phase (shortNextPhase), " +
      'matches the learned transition table (shortTransTable); long-dial stage the same (longSame) / the next stage (longNextStage).',
    noiseLine: 0.10,
    countries: out };
  return '// GENERATED by tools/backtest_readout.mjs --write: walk-forward readout for the policy rate, house prices and the dials. Do not edit; method in tools/BACKTEST-READOUT.md.\n' +
    '// tools/check_backtest_view.mjs checks that this file matches the script and that the 周期 tab shows these numbers.\n' +
    'export const BACKTEST_READOUT = ' + JSON.stringify(o) + ';\n';
}

const isMain = process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href;
if (isMain) {
  const out = await computeReadout();
  const f = x => (num(x) ? (x * 100).toFixed(2) : '—'), p = x => (num(x) ? Math.round(x * 100) + '%' : '—');
  for (const [iso, res] of Object.entries(out)) for (const [k, r] of Object.entries(res)) {
    if (k.endsWith('dial')) console.log(iso, k, `n=${r.n} short same ${p(r.shortSame)} next-phase ${p(r.shortNextPhase)} trans ${p(r.shortTransTable)} | long same ${p(r.longSame)} next ${p(r.longNextStage)}`);
    else console.log(iso, k, `n=${r.n} MAE noCh ${f(r.noChange.mae)} pers ${f(r.persistence.mae)} phase ${f(r.phaseMean.mae)} | hit noCh ${p(r.noChange.hit)} pers ${p(r.persistence.hit)} phase ${p(r.phaseMean.hit)} fw ${p(r.framework.hit)}`);
  }
  if (process.argv.includes('--write')) {
    fs.writeFileSync(READOUT_FILE, readoutFileText(out));
    console.log(`\nwrote ${path.relative(ROOT, READOUT_FILE)} (${fs.statSync(READOUT_FILE).size} bytes)`);
  }
}
