// node tools/check_role_lessons.mjs [--verbose]
// Validates src/data/role-lessons.js against the engine:
//  1. structure: ids (concepts, diagram terms, parts, rules, metrics paths), dates, exactly one correct predict option, decision keys
//  2. predict steps: runs the engine over the step window and checks the option marked ok:true is what the model really does
//  3. claims: facts stated in the text/insights (e.g. "bad-loan rate keeps rising after tightening") are checked numerically
import { createSim } from '../src/engine/sim.js';
import { US_Q } from '../src/data/us-quarterly.js';
import { ROLE_LESSONS } from '../src/data/role-lessons.js';
import { CONCEPTS } from '../src/data/concepts.js';
import { RULE_BY_ID } from '../src/engine/rules.js';

const verbose = process.argv.includes('--verbose');
let fails = 0, warns = 0;
const ok = (c, m) => { if (!c) { fails++; console.log('  FAIL:', m); } else if (verbose) console.log('  ok:  ', m); };
const warn = (c, m) => { if (!c) { warns++; console.log('  WARN:', m); } };
const T = d => (+d.slice(0, 4) - 1995) * 4 + (+d[5] - 1);
const f1 = x => (x * 100).toFixed(1) + '%';
const get = (o, p) => p.split('.').reduce((a, k) => (a == null ? a : a[k]), o);

const PARTS = ['bank', 'pool', 'repay', 'household', 'firm', 'channel', 'cash', 'centralBank', 'government', 'capex', 'interest', 'ledger', 'cycle', 'assets', 'takeover'];
const FLOW_TERMS = ['policyRate', 'bankApproval', 'newLoans', 'interestPaid', 'principalRepay', 'assetReservoir', 'goodsChannel', 'cpi', 'capacity', 'capex', 'qe', 'fiscalInjection'];
const ROLES = ['centralBank', 'government', 'bank', 'household', 'firm', 'investor', 'foreign'];
const DEC_KEYS = { centralBank: 'policyRate', government: 'fiscalInjection', bank: 'approval', household: 'borrowMult', firm: 'capexMult' };
const DEC_CLAMP = { policyRate: [0, 0.2], fiscalInjection: [-0.05, 0.15], approval: [0.3, 1.4], borrowMult: [0.3, 1.8], capexMult: [0.6, 1.4] };
const dataDates = US_Q.dates;

/* ---------- engine helpers ---------- */
// scenario: { L, from?, until, rules:{id:bool}, params:{'rule.key':v}, take:{role,key,val}, fromStart }
function scenario(L, o) {
  const s = createSim({ data: US_Q, mode: 'history' });
  for (const r of s.rules) s.setRuleEnabled(r.id, L.rulesOn.includes(r.id));
  for (const [id, on] of Object.entries(o.rules || {})) s.setRuleEnabled(id, !!on);
  for (const [k, v] of Object.entries(o.params || {})) { const [r, key] = k.split('.'); s.setRuleParam(r, key, v); }
  const from = o.from || L.startDate;
  while (s.t < T(from)) s.step();
  if (o.take) { s.takeover(o.take.role); s.setDecision(o.take.role, { [o.take.key]: o.take.val }); }
  while (s.t < T(o.until)) s.step();
  return { s, h: s.history('model'), u: o.take ? s.history('user') : null, t0: T(from) };
}
const slice = (r, which = 'h') => r[which].slice(r.t0 + 1);
function metric(hist, spec) {
  const [agg, path] = spec.split(':');
  const v = hist.map(x => get(x, path)).filter(x => typeof x === 'number');
  return agg === 'end' ? v[v.length - 1] : agg === 'max' ? Math.max(...v) : agg === 'min' ? Math.min(...v) : v.reduce((a, b) => a + b, 0);
}
const at = (r, date) => r.h[T(date)];
const sugg = (L, o, date) => {            // suggestion for a player at (just before) `date`
  const s = createSim({ data: US_Q, mode: 'history' });
  for (const r of s.rules) s.setRuleEnabled(r.id, L.rulesOn.includes(r.id));
  for (const [id, on] of Object.entries(o.rules || {})) s.setRuleEnabled(id, !!on);
  while (s.t < T(date)) s.step();
  return s;
};
const ledgerCount = (hist, player, re) => hist.reduce((n, x) => n + x.ledger.filter(e => e.player === player && (!re || re.test(e.action + e.rule))).length, 0);

/* ---------- 1. structure ---------- */
const ids = new Set();
for (const L of ROLE_LESSONS) {
  console.log(`\n=== ${L.id} (${L.title}) ${L.startDate}-${L.endDate} available=${L.available} ===`);
  ok(!ids.has(L.id), 'unique id'); ids.add(L.id);
  ok(ROLES.includes(L.role), 'role ' + L.role);
  ok(dataDates.includes(L.startDate) && dataDates.includes(L.endDate) && T(L.startDate) < T(L.endDate), 'lesson dates');
  ok(L.rulesOn.every(r => RULE_BY_ID[r]), 'rulesOn ids exist');
  ok((L.startParts || []).every(p => PARTS.includes(p)), 'startParts ids');
  ok(L.steps[0].type === 'intro' && L.steps[L.steps.length - 1].type === 'recap', 'intro first, recap last');
  let end = L.startDate, nPredict = 0, hasTake = false;
  L.steps.forEach((st, i) => {
    const w = `step ${i + 1} (${st.type}) `;
    ok(['intro', 'watch', 'predict', 'experiment', 'recap', 'reveal', 'takeover'].includes(st.type), w + 'type');
    ok(st.title, w + 'title');
    (st.hl || []).forEach(h => ok(FLOW_TERMS.includes(h), w + 'hl term ' + h));
    (st.concept || st.concepts || []).forEach(c => ok(CONCEPTS[c], w + 'concept ' + c));
    const from = st.from || end, until = st.until || from;
    ok(dataDates.includes(from) && dataDates.includes(until) && T(until) >= T(from), w + 'dates ' + from + '->' + until);
    if (['watch', 'predict'].includes(st.type)) { ok(T(until) > T(from), w + 'window moves'); if (st.from) ok(st.from === end, w + 'from == previous end'); }
    end = until;
    if (st.type === 'intro') ok(st.text.some(t => t.startsWith('**结论')) && st.text.some(t => /^下面分 \d+ 步/.test(t)), w + 'conclusion + 下面分 N 步');
    if (st.type === 'intro') { const n = +st.text.find(t => /^下面分/.test(t)).match(/\d+/)[0]; ok(n === L.steps.filter(s => !['intro', 'recap'].includes(s.type)).length, w + 'N matches step count'); }
    if (st.type === 'reveal') { ok(st.show && st.show.length && st.show.every(p => PARTS.includes(p)), w + 'show ids'); ok(!st.question || st.answerHint, w + 'question has answerHint'); }
    if (st.type === 'predict') { nPredict++; ok(st.options.filter(o => o.ok).length === 1, w + 'exactly one ok'); ok(st.explain.length >= 2, w + 'explain'); }
    if (st.type === 'takeover') {
      hasTake = true;
      ok(st.role === L.role && DEC_KEYS[st.role] === st.decision.key, w + 'role/decision key');
      const d = st.decision, cl = DEC_CLAMP[d.key];
      ok(d.min >= cl[0] && d.max <= cl[1] && d.min < d.default + 1e-9 && d.default <= d.max + 1e-9, w + `slider within engine clamp ${cl}`);
    }
    if (st.type === 'experiment') (st.choices || []).forEach(c => Object.keys(c.set.rules || {}).forEach(r => ok(RULE_BY_ID[r], w + 'rule ' + r)));
    (st.metrics || []).forEach(m => ok(/^(end|max|min|sum):/.test(m.get), w + 'metric spec ' + m.get));
    if (st.type === 'recap') { ok(st.lines.length === 3, w + '3 lines'); ok(typeof st.next === 'string' ? ROLE_LESSONS.some(l => l.id === st.next) : true, w + 'next exists'); }
  });
  ok(nPredict >= 1, 'has a predict step');
  ok(hasTake || L.steps.some(s => s.type === 'experiment'), 'has takeover or experiment');
  if (!hasTake) ok(L.note === '接管即将开放', 'note 接管即将开放');
  // each metric path resolves on a real snapshot
  const probe = scenario(L, { until: L.startDate === '1995Q1' ? '1995Q2' : '2004Q1', from: '1995Q1' }).h[8];
  L.steps.forEach(st => (st.metrics || []).forEach(m => ok(typeof get(probe, m.get.split(':')[1]) === 'number', 'metric path resolves ' + m.get)));
}

/* ---------- 2. predict answers + 3. claims ---------- */
const L = id => ROLE_LESSONS.find(l => l.id === id);
const step = (lesson, type, nth = 0) => lesson.steps.filter(s => s.type === type)[nth];
const okIdx = st => st.options.findIndex(o => o.ok);
const picked = (st, i) => `option "${st.options[i].t}"`;

// ---- central bank
{
  const lc = L('role-centralBank'), st = step(lc, 'predict');
  console.log('\n--- centralBank predict:', st.q);
  const r = scenario(lc, { until: st.until });
  const a = at(r, st.from), b = at(r, st.until);
  const dP = b.rates.policy - a.rates.policy, dE = b.rates.mortgageEff - a.rates.mortgageEff;
  console.log(`  policy ${f1(a.rates.policy)} -> ${f1(b.rates.policy)} (+${(dP * 100).toFixed(2)}pp); mortgageEff ${f1(a.rates.mortgageEff)} -> ${f1(b.rates.mortgageEff)} (${(dE * 100).toFixed(2)}pp)`);
  const truth = dP > 0.03 && dE < 0.5 * dP ? 1 : dE >= 0.9 * dP ? 0 : -1;
  ok(truth === okIdx(st), `model says option ${truth}, lesson marks ${okIdx(st)}`);
  ok(Math.abs((a.rates.policy) - 0.01) < 0.005 && Math.abs(b.rates.policy - 0.05) < 0.01, 'question text "约 1% 升到约 5%" matches policy path');
  // claims: later watch (cuts + QE + approval stays low)
  const w = step(lc, 'watch', 1), r2 = scenario(lc, { until: w.until }), hh = r2.h.slice(T(w.from || '2006Q2') + 1);
  const qeQ = hh.filter(x => x.flows.qe > 0).length, apEnd = hh[hh.length - 1].bank.approval, polEnd = hh[hh.length - 1].rates.policy;
  console.log(`  watch ${'2006Q2'}->${w.until}: QE quarters ${qeQ}, end approval ${apEnd.toFixed(2)}, end policy ${f1(polEnd)}`);
  ok(qeQ > 0, 'QE fires in the late watch window'); ok(apEnd < 0.95, 'approval has not recovered by end (text: 并没有回到原位)'); ok(polEnd < 0.01, 'policy near 0 at end');
  // takeover sanity
  const tk = step(lc, 'takeover'), d = tk.decision;
  console.log('  takeover metrics (model | const 1% | const 5%):');
  const base = scenario(lc, { from: tk.from, until: tk.until, take: { role: 'centralBank', key: d.key, val: d.default } });
  const hi = scenario(lc, { from: tk.from, until: tk.until, take: { role: 'centralBank', key: d.key, val: 0.05 } });
  tk.metrics.forEach(m => console.log(`    ${m.label}: ${metric(slice(base), m.get).toFixed(3)} | ${metric(slice(base, 'u'), m.get).toFixed(3)} | ${metric(slice(hi, 'u'), m.get).toFixed(3)}`));
  const mi = (m, r2_, w_) => metric(slice(r2_, w_), tk.metrics.find(x => x.get === m).get);
  ok(mi('max:macro.inflation', base, 'u') >= mi('max:macro.inflation', base, 'h') - 1e-4, 'insight: lower fixed rate -> inflation peak not lower than model');
}

// ---- bank
{
  const lb = L('role-bank'), st = step(lb, 'predict');
  console.log('\n--- bank predict:', st.q);
  const r = scenario(lb, { until: st.until });
  const a = at(r, st.from), b = at(r, st.until);
  console.log(`  bad ${f1(a.bank.badLoanRate)} -> ${f1(b.bank.badLoanRate)}, approval ${a.bank.approval.toFixed(2)} -> ${b.bank.approval.toFixed(2)}`);
  const hh = r.h.slice(T(st.from) + 1), peak = Math.max(...hh.map(x => x.bank.badLoanRate));
  const truth = b.bank.badLoanRate > a.bank.badLoanRate + 0.003 && b.bank.approval < a.bank.approval ? 1 : (b.bank.badLoanRate < a.bank.badLoanRate - 0.003 ? 0 : 2);
  ok(truth === okIdx(st), `model says option ${truth}, lesson marks ${okIdx(st)} (bad peak ${f1(peak)})`);
  ok(b.flows.newLoans < b.flows.principalRepay, 'reveal text: new loans < principal repay at end of predict');
  ok(b.assets.housing.price < Math.max(...r.h.slice(0, T(st.until) + 1).map(x => x.assets.housing.price)), 'housing below its peak at end of predict');
  const w = step(lb, 'watch'), r2 = scenario(lb, { until: w.until });
  const ups = r2.h.slice(1).filter((x, i) => x.t > T(lb.startDate) && x.bank.approval > r2.h[x.t - 1].bank.approval + 1e-9).length;
  console.log(`  loosening quarters in watch window: ${ups}`);
  ok(ups >= 2, 'watch window shows bank_loosen firing at least twice');
  const tk = step(lb, 'takeover'), d = tk.decision;
  const run = v => scenario(lb, { from: tk.from, until: tk.until, take: { role: 'bank', key: d.key, val: v } });
  const rows = [d.min, 1.0, 1.3, d.max].map(v => [v, run(v)]);
  console.log('  takeover metrics by constant approval:');
  tk.metrics.forEach(m => console.log(`    ${m.label}: model ${metric(slice(rows[1][1]), m.get).toFixed(3)} | ` + rows.map(([v, r_]) => `${v}:${metric(slice(r_, 'u'), m.get).toFixed(3)}`).join(' ')));
  const pk = v => metric(slice(rows.find(x => x[0] === v)[1], 'u'), 'max:assets.housing.price');
  ok(pk(1.3) > pk(1.0), 'insight: higher fixed approval -> higher housing peak');
  const bd = v => metric(slice(rows.find(x => x[0] === v)[1], 'u'), 'max:bank.badLoanRate');
  ok(bd(1.3) >= bd(1.0), 'insight: higher fixed approval -> bad-loan peak not lower');
}

// ---- household
{
  const lh = L('role-household'), st = step(lh, 'predict');
  console.log('\n--- household predict:', st.q);
  const withR = scenario(lh, { until: st.until });
  const noR = scenario(lh, { until: st.until, rules: { hh_deleverage: false, hh_overhang: false, hh_forced_sales: false } });
  const a = at(withR, st.until), b = at(noR, st.until);
  console.log(`  household income at ${st.until}: with deleverage rules ${a.household.income.toFixed(0)}, without ${b.household.income.toFixed(0)}; saving rate ${f1(a.household.savingRate)} vs ${f1(b.household.savingRate)}; consumption ${a.household.consumption.toFixed(0)} vs ${b.household.consumption.toFixed(0)}`);
  const truth = a.household.income < b.household.income && a.household.savingRate > b.household.savingRate ? 2 : (a.household.income > b.household.income ? 1 : 0);
  ok(truth === okIdx(st), `model says option ${truth}, lesson marks ${okIdx(st)}`);
  const w = step(lh, 'watch'), r2 = scenario(lh, { until: w.until }), hh = r2.h.slice(1);
  const chase = ledgerCount(hh.slice(T(lh.startDate)), 'household');
  console.log(`  household ledger entries in watch window: ${chase}`);
  ok(chase >= 3, 'watch window shows household rule firing (>=3 entries)');
  const lastW = step(lh, 'watch', 1), r3 = scenario(lh, { until: lastW.until }), e = r3.h[T(lastW.until)];
  console.log(`  late watch: newLoans ${e.flows.newLoans.toFixed(0)} vs repay ${e.flows.principalRepay.toFixed(0)}`);
  ok(e.flows.newLoans < e.flows.principalRepay, 'late watch: new loans below principal repay');
  const tk = step(lh, 'takeover'), d = tk.decision;
  const run = v => scenario(lh, { from: tk.from, until: tk.until, take: { role: 'household', key: d.key, val: v } });
  const rows = [d.min, 0.7, 1.0, 1.3, d.max].map(v => [v, run(v)]);
  console.log('  takeover metrics by constant borrowMult:');
  tk.metrics.forEach(m => console.log(`    ${m.label}: model ${metric(slice(rows[2][1]), m.get).toFixed(3)} | ` + rows.map(([v, r_]) => `${v}:${metric(slice(r_, 'u'), m.get).toFixed(3)}`).join(' ')));
  const g = (v, mm) => metric(slice(rows.find(x => x[0] === v)[1], 'u'), mm);
  ok(g(1.3, 'max:assets.housing.price') > g(0.7, 'max:assets.housing.price'), 'insight: more borrowing -> higher housing peak');
  ok(g(1.3, 'max:household.dsr') > g(0.7, 'max:household.dsr'), 'insight: more borrowing -> higher DSR peak');
}

// ---- firm
{
  const lf = L('role-firm'), st = step(lf, 'predict');
  console.log('\n--- firm predict:', st.q);
  const r = scenario(lf, { until: st.until });
  const a = at(r, st.from), b = at(r, st.until);
  const fw = r.h.slice(T(lf.startDate) + 1, T(st.from) + 1);
  console.log(`  watch window: firm ledger ${ledgerCount(fw, 'firm', /Capex/)}; pressure ${f1(a.macro.demandPressure)} at ${st.from} -> ${f1(b.macro.demandPressure)} at ${st.until}; inflation ${f1(a.macro.inflation)} -> ${f1(b.macro.inflation)}; capacity ${a.macro.capacity.toFixed(1)} -> ${b.macro.capacity.toFixed(1)}`);
  // mechanism test: user Capex 1.4 from st.from
  const tkr = scenario(lf, { from: st.from, until: '2025Q4', take: { role: 'firm', key: 'capexMult', val: 1.4 } });
  const dCap = k => tkr.u[T(st.from) + k].macro.capacity / tkr.h[T(st.from) + k].macro.capacity - 1;
  const dPr = k => tkr.u[T(st.from) + k].macro.demandPressure - tkr.h[T(st.from) + k].macro.demandPressure;
  console.log(`  mechanism (user Capex x1.4): capacity diff +2Q ${f1(dCap(2))}, +4Q ${f1(dCap(4))}, +8Q ${f1(dCap(8))}; pressure diff +2Q ${f1(dPr(2))}, +4Q ${f1(dPr(4))}`);
  ok(Math.abs(dCap(4)) < 0.003 && dCap(10) > dCap(4) + 0.002, 'new capacity lags: ~0 at +4Q, larger at +10Q');
  ok(dPr(2) > 0, 'extra Capex raises demand pressure first');
  // model-run support for the displayed window: pressure still positive 4 quarters in
  const p4 = r.h[T(st.from) + 4].macro.demandPressure;
  console.log(`  displayed model: pressure +4Q ${f1(p4)}`);
  warn(p4 > 0 || b.macro.demandPressure > 0, 'predict window: demand pressure should still be positive in the displayed run');
  const tk = step(lf, 'takeover'), d = tk.decision;
  const run = v => scenario(lf, { from: tk.from, until: tk.until, take: { role: 'firm', key: d.key, val: v } });
  const rows = [d.min, 0.7, 1.0, 1.3, d.max].map(v => [v, run(v)]);
  console.log('  takeover metrics by constant capexMult:');
  tk.metrics.forEach(m => console.log(`    ${m.label}: model ${metric(slice(rows[2][1]), m.get).toFixed(3)} | ` + rows.map(([v, r_]) => `${v}:${metric(slice(r_, 'u'), m.get).toFixed(3)}`).join(' ')));
  const g = (v, mm) => metric(slice(rows.find(x => x[0] === v)[1], 'u'), mm);
  ok(g(1.3, 'end:macro.capacity') > g(0.7, 'end:macro.capacity'), 'insight: more Capex -> more end capacity');
  ok(g(1.3, 'sum:firm.capex') > g(0.7, 'sum:firm.capex'), 'insight: more Capex -> larger cumulative Capex');
}

// ---- government
{
  const lg = L('role-government'), st = step(lg, 'predict');
  console.log('\n--- government predict:', st.q);
  const on = scenario(lg, { until: lg.endDate });
  const off = scenario(lg, { until: lg.endDate, rules: { gov_stimulus: false } });
  const peak = r => Math.max(...r.h.slice(T(lg.startDate) + 1).map(x => x.macro.unemployment));
  const debt = r => r.h[T(lg.endDate)].gov.debtGdp;
  console.log(`  unemployment peak: with stimulus ${f1(peak(on))}, without ${f1(peak(off))}; end debt/GDP ${f1(debt(on))} vs ${f1(debt(off))}`);
  const truth = peak(off) > peak(on) + 0.002 ? 0 : (peak(off) < peak(on) - 0.002 ? 2 : 1);
  ok(truth === okIdx(st), `model says option ${truth}, lesson marks ${okIdx(st)}`);
  ok(debt(on) > debt(off), 'explain: stimulus -> higher debt/GDP');
  const adj = on.h.slice(T(lg.startDate) + 1, T('2009Q2') + 1).map(x => x.extra.fiscalAdj);
  console.log(`  fiscalAdj in watch window: max ${f1(Math.max(...adj))}`);
  ok(Math.max(...adj) > 0.02, 'watch window: fiscal injection rises (>2% GDP)');
  const tk = step(lg, 'takeover'), d = tk.decision;
  const run = v => scenario(lg, { from: tk.from, until: tk.until, take: { role: 'government', key: d.key, val: v } });
  const rows = [0, 0.03, 0.06, d.max].map(v => [v, run(v)]);
  console.log('  takeover metrics by constant fiscalInjection:');
  tk.metrics.forEach(m => console.log(`    ${m.label}: model ${metric(slice(rows[0][1]), m.get).toFixed(3)} | ` + rows.map(([v, r_]) => `${v}:${metric(slice(r_, 'u'), m.get).toFixed(3)}`).join(' ')));
  const g = (v, mm) => metric(slice(rows.find(x => x[0] === v)[1], 'u'), mm);
  ok(g(0.06, 'max:macro.unemployment') < g(0, 'max:macro.unemployment'), 'insight: more injection -> lower unemployment peak');
  ok(g(0.06, 'end:gov.debtGdp') > g(0, 'end:gov.debtGdp'), 'insight: more injection -> higher debt/GDP');
}

// ---- investor
{
  const li = L('role-investor'), st = step(li, 'predict');
  console.log('\n--- investor predict:', st.q);
  const cash = (rules, date) => sugg(li, { rules }, T(date) > 0 ? date : st.from).suggestion('investor').values.alloc.c;
  const rows = [];
  for (let t = T(st.from); t <= T(st.until) - 1; t++) {
    const d = US_Q.dates[t];
    rows.push([d, cash({}, d), cash({ inv_riskoff: false }, d)]);
  }
  if (verbose) rows.forEach(r => console.log('   ', r[0], 'cash share (rules on / riskoff off):', f1(r[1]), f1(r[2])));
  const first = rows[0][1], mx = Math.max(...rows.map(r => r[1])), gain = Math.max(...rows.map(r => r[1] - r[2]));
  console.log(`  cash share: at ${st.from} ${f1(first)}, max in window ${f1(mx)}; max uplift from risk-off rule ${f1(gain)}`);
  const truth = mx > first + 0.02 && gain > 0.05 ? 0 : (mx < first - 0.02 ? 2 : 1);
  ok(truth === okIdx(st), `model says option ${truth}, lesson marks ${okIdx(st)}`);
  const w = step(li, 'watch'), r = scenario(li, { until: w.until });
  const n = ledgerCount(r.h.slice(T(li.startDate) + 1), 'investor');
  console.log(`  investor ledger entries in watch window: ${n}`);
  ok(n >= 2, 'watch window shows investor rule firing (>=2 entries)');
  const ex = step(li, 'experiment');
  console.log('  experiment metrics per choice:');
  const res = ex.choices.map(c => scenario(li, { until: ex.until, from: ex.from, rules: c.set.rules }));
  ex.metrics.forEach(m => console.log(`    ${m.label}: ` + res.map((r_, i) => `${ex.choices[i].label}=${metric(slice(r_), m.get).toFixed(3)}`).join(' | ')));
  const mv = (i, m) => metric(slice(res[i]), ex.metrics.find(x => x.get === m).get);
  warn(mv(1, 'max:assets.housing.price') < mv(0, 'max:assets.housing.price') - 0.01, 'insight: dropping momentum lowers the housing peak');
  ok(mv(2, 'sum:flows.toCash') < mv(0, 'sum:flows.toCash'), 'insight: dropping risk-off lowers cash inflow');
}

// ---- foreign
{
  const lo = L('role-foreign'), st = step(lo, 'predict');
  console.log('\n--- foreign predict:', st.q);
  const nx = date => sugg(lo, {}, date).suggestion('foreign').values.netExportRatio;
  const s0 = sugg(lo, {}, st.until);
  const pr = s0.snapshot().macro.demandPressure;
  const rows = []; for (let t = T(st.from); t < T(st.until); t++) rows.push([US_Q.dates[t], nx(US_Q.dates[t]), sugg(lo, {}, US_Q.dates[t]).snapshot().macro.demandPressure]);
  if (verbose) rows.forEach(r => console.log('   ', r[0], 'netExportRatio', f1(r[1]), 'pressure', f1(r[2])));
  const n = nx(st.until);
  console.log(`  pressure at ${st.until} ${f1(pr)}, netExportRatio ${f1(n)} (baseline -3.0%)`);
  const posQ = rows.filter(r => r[2] > 0).length;
  const truth = pr > 0 && n < -0.03 ? 0 : (pr < 0 && n > -0.03 ? 1 : 2);
  ok(truth === okIdx(st), `model says option ${truth}, lesson marks ${okIdx(st)}`);
  warn(posQ >= rows.length / 2, `predict window: demand pressure positive in ${posQ}/${rows.length} quarters (text says "需求压力还是正的")`);
  const w = step(lo, 'watch'), r = scenario(lo, { until: w.until });
  const fl = ledgerCount(r.h.slice(T(lo.startDate) + 1), 'foreign', /期限溢价/);
  console.log(`  期限溢价 ledger entries in watch window: ${fl}`);
  ok(fl >= 1, 'watch window shows foreign_funding firing');
  const ex = step(lo, 'experiment');
  const res = ex.choices.map(c => scenario(lo, { until: ex.until, from: ex.from, rules: c.set.rules }));
  console.log('  experiment metrics per choice:');
  ex.metrics.forEach(m => console.log(`    ${m.label}: ` + res.map((r_, i) => `${ex.choices[i].label}=${metric(slice(r_), m.get).toFixed(4)}`).join(' | ')));
  const mv = (i, m) => metric(slice(res[i]), ex.metrics.find(x => x.get === m).get);
  ok(mv(1, 'max:macro.inflation') >= mv(0, 'max:macro.inflation'), 'insight: no spill-over -> inflation peak not lower');
  ok(mv(2, 'max:rates.gov10y') < mv(0, 'max:rates.gov10y'), 'insight: no term premium -> lower 10y peak');
}

console.log(`\n${fails ? 'FAILED' : 'OK'}: ${fails} failure(s), ${warns} warning(s)`);
process.exit(fails ? 1 : 0);
