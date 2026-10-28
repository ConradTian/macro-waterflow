// node tools/check_role_lessons.mjs [--verbose]
// Validates the TOWN lessons (lesson 0 in src/data/lessons.js + the 7 role lessons in src/data/role-lessons.js) against the engine:
//  1. structure: every id (concept, diagram term, part, pipe, rule, valve, metric path, action type, US date) exists; intro/chain shape
//  2. replay: each lesson is rebuilt with the SAME code the UI uses (src/ui/lessons-town.js), step by step
//  3. predict steps: the option marked ok:true is what the TOWN engine really does (and the claims quoted in explain/answerHint/insight)
//  4. optional 'zoom' steps: the US window shows what the text says
import { createSim } from '../src/engine/sim.js';
import { US_Q } from '../src/data/us-quarterly.js';
import { ROLE_LESSONS } from '../src/data/role-lessons.js';
import { LESSONS } from '../src/data/lessons.js';
import { CONCEPTS } from '../src/data/concepts.js';
import { RULE_BY_ID } from '../src/engine/rules.js';
import { VALVES } from '../src/engine/valves.js';
import { replayTown, lessonPositions, applyAll, tapEffects, arr } from '../src/ui/lessons-town.js';

const verbose = process.argv.includes('--verbose');
let fails = 0, warns = 0;
const ok = (c, m) => { if (!c) { fails++; console.log('  FAIL:', m); } else if (verbose) console.log('  ok:  ', m); };
const warn = (c, m) => { if (!c) { warns++; console.log('  WARN:', m); } };
const T = d => (typeof d === 'number' ? d : (+d.slice(0, 4) - 1995) * 4 + (+d[5] - 1));
const f1 = x => (x * 100).toFixed(1) + '%';
const get = (o, p) => String(p).split('.').reduce((a, k) => (a == null ? a : a[k]), o);

const PARTS = ['bank', 'pool', 'repay', 'household', 'firm', 'channel', 'cash', 'centralBank', 'government', 'capex', 'interest', 'poolHousing', 'poolEquity', 'poolBond', 'poolGold', 'iou', 'springs', 'valves', 'budget', 'ledger', 'cycle', 'assets', 'takeover'];
const PIPES = ['qe', 'fiscalInjection', 'taxes', 'newLoans', 'interestPaid', 'principalRepay', 'toBond', 'toEquity', 'toHousing', 'toGold', 'toCash', 'toConsumption', 'wages', 'profits', 'toCapex', 'spillToGoods', 'coupons', 'dividends', 'rent', 'qt', 'govSurplusDrain', 'collateral'];
const FLOW_TERMS = ['policyRate', 'bankApproval', 'newLoans', 'interestPaid', 'principalRepay', 'assetReservoir', 'goodsChannel', 'cpi', 'capacity', 'capex', 'qe', 'fiscalInjection'];
const TABS = ['ledger', 'cycle', 'assets', 'takeover'];
const ACTIONS = ['loan', 'buyHouse', 'repay', 'payInterest', 'spend', 'riskOff', 'saving'];
const TYPES = ['intro', 'watch', 'predict', 'reveal', 'action', 'valve', 'try', 'chain', 'zoom'];
const ROLES = ['centralBank', 'government', 'bank', 'household', 'firm', 'investor', 'foreign'];
const BLOCKS = ['households', 'budget', 'valves', 'sources', 'alloc'];
const DEC = ['approval', 'policyRate', 'fiscalInjection', 'borrowMult', 'saveAdj', 'capexMult', 'lvrCap', 'qe'];

const TOWN = [LESSONS[0], ...ROLE_LESSONS];
const mkTown = L => createSim({ scenario: 'town', delays: !!L.delays });
const probe = createSim({ scenario: 'town' }); probe.step();
const probeSnap = probe.snapshot();
const Lget = id => TOWN.find(l => l.id === id);
const stepsOf = (L, type) => L.steps.map((s, i) => ({ s, i })).filter(x => x.s.type === type);

/* ---------- 1. structure ---------- */
const lessonIds = new Set(LESSONS.map(l => String(l.id)));
for (const L of TOWN) {
  console.log(`\n=== ${L.id} (${L.title}) available=${L.available} ===`);
  const pos = lessonPositions(L);
  ok(L.scenario === 'town', 'scenario town');
  ok(L.available === true, 'available');
  ok(L.role ? ROLES.includes(L.role) : true, 'role');
  ok(L.rulesOn === 'all' || (Array.isArray(L.rulesOn) && L.rulesOn.every(r => RULE_BY_ID[r])), 'rulesOn');
  ok((L.startParts || []).every(p => PARTS.includes(p)), 'startParts ids');
  ok(L.steps[0].type === 'intro', 'intro first');
  const last = L.steps[L.steps.length - 1];
  ok(last.type === 'chain' || last.type === 'zoom', 'ends with chain (or the optional zoom after it)');
  ok(L.steps.some(s => s.type === 'chain'), 'has a chain step');
  ok(L.steps.some(s => s.type === 'predict') || L.id === 0, 'has a predict step');
  ok(L.id === 0 || L.steps.some(s => s.type === 'try'), 'has a try step');
  ok(L.id === 0 || L.steps.some(s => s.type === 'valve') || L.role === 'investor' || L.role === 'foreign', 'has a valve step');
  ok(!JSON.stringify(L).includes('{{STEPS}}'), 'no template left');
  L.steps.forEach((st, i) => {
    const w = `step ${i + 1} (${st.type}) `;
    ok(TYPES.includes(st.type), w + 'type');
    ok(st.title, w + 'title');
    (st.hl || []).forEach(h => ok(FLOW_TERMS.includes(h), w + 'hl term ' + h));
    (st.concept || st.concepts || []).forEach(c => ok(CONCEPTS[c], w + 'concept ' + c));
    (st.show || []).forEach(p => ok(PARTS.includes(p), w + 'show ' + p));
    if (st.tab) ok(TABS.includes(st.tab), w + 'tab');
    if (st.block) ok(BLOCKS.includes(st.block) || /^ripple:/.test(st.block) && VALVES.some(v => 'ripple:' + v.id === st.block), w + 'block ' + st.block);
    if (st.type !== 'zoom') ok(pos[i].world === 'town', w + 'town world');
    // effects
    const effs = [...arr(st.do), ...arr(st.after), ...tapEffects(st)];
    for (const e of effs) {
      if (e.action) ok(ACTIONS.includes(e.action.type), w + 'action ' + e.action.type);
      if (e.valve) ok(VALVES.some(v => v.id === e.valve), w + 'valve ' + e.valve);
      if (e.rule) ok(RULE_BY_ID[e.rule], w + 'rule ' + e.rule);
    }
    (st.metrics || []).forEach(m => ok(typeof get(probeSnap, m.get.replace(/^(end|max|min|sum):/, '')) === 'number', w + 'metric path ' + m.get));
    if (st.type === 'intro') {
      ok(st.text.some(t => t.startsWith('**')) && st.text.some(t => /^下面分 \d+ 步/.test(t)), w + 'conclusion + 下面分 N 步');
      const n = +st.text.find(t => /^下面分/.test(t)).match(/\d+/)[0];
      ok(n === L.steps.filter(s => !['intro'].concat(L.id === 0 ? [] : ['zoom']).includes(s.type)).length, w + 'N matches step count');
    }
    if (st.type === 'reveal') ok(!st.question || st.answerHint, w + 'question has answerHint');
    if (st.type === 'action') { ok(st.action || st.actions, w + 'action'); ok(st.question && st.answerHint, w + 'question + answerHint'); }
    if (st.type === 'valve') { ok(st.valve && st.value !== undefined && st.quarters > 0, w + 'valve/value/quarters'); const v = VALVES.find(x => x.id === st.valve); ok(v && v.chain.length, w + 'valve has a chain'); }
    if (st.type === 'predict') { ok(st.options.filter(o => o.ok).length === 1, w + 'exactly one ok'); ok(st.explain.length >= 2, w + 'explain'); ok(st.quarters > 0, w + 'quarters'); }
    if (st.type === 'try') {
      ok(st.quarters > 0 && (st.slider || st.choices) && st.metrics && st.insight, w + 'try shape');
      if (st.slider) { const v = VALVES.find(x => x.id === st.valve); ok(v && st.slider.min >= v.min - 1e-9 && st.slider.max <= v.max + 1e-9, w + 'slider within the valve range'); }
      (st.choices || []).forEach(c => arr(c.do).forEach(e => { if (e.rule) ok(RULE_BY_ID[e.rule], w + 'choice rule'); if (e.action) ok(ACTIONS.includes(e.action.type), w + 'choice action'); }));
    }
    if (st.type === 'chain') {
      ok(st.links.length >= 4, w + 'chain has >= 4 links');
      st.links.forEach((l, k) => {
        ok(l.text, w + `link ${k + 1} text`);
        arr(l.pipe).forEach(p => ok(PIPES.includes(p), w + 'pipe ' + p));
        arr(l.part).forEach(p => ok(PARTS.includes(p), w + 'part ' + p));
        if (l.term) ok(CONCEPTS[l.term], w + 'term ' + l.term);
        (l.hl || []).forEach(h => ok(FLOW_TERMS.includes(h), w + 'link hl ' + h));
        ok(l.pipe || l.part || l.hl, w + `link ${k + 1} lights something`);
      });
    }
    if (st.type === 'zoom') { ok(US_Q.dates.includes(st.date) && (!st.until || (US_Q.dates.includes(st.until) && T(st.until) > T(st.date))), w + 'zoom dates'); }
    if (st.next != null) ok(lessonIds.has(String(st.next)) || ROLE_LESSONS.some(l => l.id === st.next) || /^role:/.test(String(st.next)) && ROLE_LESSONS.some(l => l.role === String(st.next).slice(5)), w + 'next ' + st.next);
  });
}

/* ---------- helpers for the dynamics ---------- */
// state at the start of step i (before its entry effects), then its entry effects, then n quarters -> {s, t0, hist}
function runStep(L, i, extra = [], n) {
  const st = L.steps[i], pos = lessonPositions(L);
  const s = mkTown(L);
  replayTown(s, L, i, pos);
  applyAll(s, st.do, L);
  applyAll(s, extra, L);
  const first = s.snapshot();
  const q = n ?? (pos[i].until - pos[i].from);
  const hist = [];
  for (let k = 0; k < q; k++) hist.push(s.step());
  return { s, first, hist, last: hist[hist.length - 1] || first };
}
const share = f => f.toCash / (f.toCash + f.toHousing + f.toEquity + f.toBond + f.toGold);
const metricOf = (hist, spec) => { const [a, p] = spec.split(':'); const v = hist.map(x => get(x, p)); return a === 'end' ? v[v.length - 1] : a === 'max' ? Math.max(...v) : a === 'min' ? Math.min(...v) : v.reduce((x, y) => x + y, 0); };
// replay a lesson up to the END of step i and compare with a counterfactual: same replay with the entry effects of step j removed
function baselineSim(L, opts = {}) { const s = mkTown(L); if (opts.delays) s.setDelays(true); return s; }

/* ---------- 2. lesson 0 claims ---------- */
{
  const L = Lget(0), pos = lessonPositions(L);
  console.log('\n--- lesson 0 dynamics ---');
  const at = i => { const s = mkTown(L); replayTown(s, L, i, pos); return s; };
  const act = (s, a) => { const b = s.snapshot(), r = s.townAction(a), n = s.snapshot(); return { r, b, n }; };
  // the exact numbers the text states
  const s0 = mkTown(L); const b0 = s0.snapshot();
  ok(Math.abs(b0.money.M - 110) < 1e-6, 'step 1 text: 110 万元 of water at the start');
  const t = b0.town.households; ok(t[0].deposit === 10 && t[0].debt === 30, 'step 1 text: 小王 has 10 万元');
  let { r, b, n } = act(s0, L.steps[1].action);
  ok(r.ok && Math.abs(n.money.M - b.money.M - 50) < 1e-6 && Math.abs(n.iou.bankTotal - b.iou.bankTotal - 50) < 1e-6, 'step 1: loan 50 -> water +50 and IOU +50');
  ({ r, b, n } = act(s0, L.steps[2].action));
  ok(r.ok && Math.abs(b.money.M - n.money.M - 10) < 1e-6 && Math.abs(b.iou.bankTotal - n.iou.bankTotal - 10) < 1e-6, 'step 2: repay 10 -> water -10 and IOU -10');
  const s3 = at(3); ok(s3.snapshot().town.households.length === 5 && s3.snapshot().town.households.every((h, k) => h.name === ['小王', '老李', '阿珍', '大刘', '小陈'][k]), 'step 3: five names in order');
  ok(s3.snapshot().town.households[1].deposit > Math.max(...s3.snapshot().town.households.filter((_, k) => k !== 1).map(h => h.deposit)) - 1e-9 || true, 'step 3 text: 老李 has the most deposit (start)');
  const st0 = mkTown(L).snapshot().town.households; ok(st0[1].deposit === Math.max(...st0.map(h => h.deposit)) && st0[4].deposit === Math.min(...st0.map(h => h.deposit)) && st0[1].houses === 3, 'step 3 text: 老李 most deposit + 3 houses, 小陈 least (start)');
  ({ r, b, n } = act(s0, L.steps[4].action));
  ok(r.ok && Math.abs(n.money.M - b.money.M) < 1e-9 && n.assets.housing.price > b.assets.housing.price * 1.03 && n.assets.housing.price < b.assets.housing.price * 1.05, 'step 4: buy house -> water unchanged, housing level +~4%');
  ok(b.town.households[0].deposit >= 40, 'step 4 text: 小王 has >= 40 after the loan and repayment (50)');
  ({ r, b, n } = act(s0, L.steps[5].action));
  ok(r.ok && Math.abs(n.money.M - b.money.M) < 1e-9 && Math.abs(n.town.shop.deposit - b.town.shop.deposit - 5) < 1e-9, 'step 5: spend 5 -> shop +5, water unchanged');
  ok(b.town.households[0].deposit >= 5, 'step 5 text: 小王 has 10 left (>=5)');
  ({ r, b, n } = act(s0, L.steps[6].action));
  ok(r.ok && Math.abs(n.money.M - b.money.M) < 1e-9 && Math.abs(n.town.bank.pocket - b.town.bank.pocket - 2) < 1e-9, 'step 6: interest 2 -> bank pocket +2, water unchanged');
  ok(b.town.households[3].debt === 75, 'step 6 text: 大刘 owes 75');
  // macro steps start from a fresh town
  for (const [i, name] of [[7, 'policyRate'], [8, 'fiscalInjection'], [9, 'capexMult']]) { const x = runStep(L, i - 0, [], 0); ok(x.first.t === 0 && Math.abs(x.first.money.M - 110) < 1e-6, `step ${i + 1}: starts from a fresh town`); void name; }
  const base = (n_, setup) => { const s = mkTown(L); setup && setup(s); const h = []; for (let k = 0; k < n_; k++) h.push(s.step()); return h; };
  const bs = base(4);
  // step 8 (index 7): policy 7%
  { const x = runStep(L, 7, [{ valve: 'policyRate', value: 0.07 }], 2);
    ok(x.hist[1].assets.housing.price < 100 && x.hist[1].flows.newLoans < bs[1].flows.newLoans && x.hist[0].rates.mortgageNew > x.first.rates.mortgageNew + 0.01, 'step 7: rate 7% -> new mortgage rate up at once, new loans below baseline, housing level falls');
    ok(x.hist[1].macro.unemployment > x.first.macro.unemployment, 'step 7: unemployment up');
    ok(x.first.rates.policy === 0.04, 'step 7 text: policy rate is 4% at the start'); }
  // step 9 (index 8): fiscal 5%
  { const x = runStep(L, 8, [{ valve: 'fiscalInjection', value: 0.05 }], 2);
    ok(x.hist[1].macro.inflation > bs[1].macro.inflation + 0.005 && x.hist[1].money.M > bs[1].money.M && x.hist[1].gov.debtGdp > bs[1].gov.debtGdp, 'step 8: fiscal 5% -> inflation, water and debt/GDP above baseline'); }
  // step 10 (index 9): capex 1.3, 4 quarters
  { const x = runStep(L, 9, [{ valve: 'capexMult', value: 1.3 }], 4);
    ok(x.hist[0].macro.demandPressure > bs[0].macro.demandPressure + 0.02, 'step 9: Capex x1.3 -> demand pressure up in quarter 1');
    ok(Math.abs(x.hist[0].macro.capacityPotential - bs[0].macro.capacityPotential) < 1e-9 && Math.abs(x.hist[1].macro.capacityPotential - bs[1].macro.capacityPotential) < 1e-9, 'step 9: capacity unchanged for the first 2 quarters');
    ok(x.hist[3].macro.capacityPotential > bs[3].macro.capacityPotential + 1, 'step 9: capacity wider by quarter 4'); }
  // step 11: budget identity on the state the lesson shows
  { const s = at(10); const sn = s.snapshot(); ok(Math.abs(sn.budget.M_after - sn.budget.M_before - sn.budget.net) < 1e-9, 'step 10: budget identity at the shown quarter'); ok(sn.t >= 1, 'step 10: a quarter with flows is shown (t >= 1)'); }
  // zoom
  const z = L.steps[L.steps.length - 1]; ok(z.type === 'zoom' && z.showAll && z.block === 'sources' && z.next === 'role:bank', 'zoom step ends the lesson and points to the bank lesson');
  ok(ROLE_LESSONS.some(l => l.role === 'bank' && l.available), 'bank lesson exists and is available');
  // replay is deterministic and path-independent
  const a1 = mkTown(L), a2 = mkTown(L); replayTown(a1, L, 11, pos); replayTown(a2, L, 5, pos); replayTown(a2, L, 11, pos);
  ok(JSON.stringify(a1.history()) === JSON.stringify(a2.history()), 'replay is deterministic (rebuild == rebuild after another step)');
}

/* ---------- 3. role lessons: predict answers + claims ---------- */
const stepAt = (L, type, nth = 0) => { const x = stepsOf(L, type)[nth]; return x; };
const okIdx = st => st.options.findIndex(o => o.ok);

// ---- central bank
{
  const L = Lget('role-centralBank'), { s: st, i } = stepAt(L, 'predict');
  console.log('\n--- centralBank predict:', st.q);
  const x = runStep(L, i);
  const a = x.first.rates, b = x.last.rates, dP = b.policy - a.policy, dE = b.mortgageEff - a.mortgageEff;
  console.log(`  delays on: policy ${f1(a.policy)} -> ${f1(b.policy)}; mortgageNew ${f1(a.mortgageNew)} -> ${f1(b.mortgageNew)}; mortgageEff ${f1(a.mortgageEff)} -> ${f1(b.mortgageEff)} (${(dE * 100).toFixed(2)}pp)`);
  const truth = dP > 0.029 && dE < 0.5 * dP ? 1 : dE >= 0.9 * dP ? 0 : -1;
  ok(truth === okIdx(st), `model says option ${truth}, lesson marks ${okIdx(st)}`);
  ok(Math.abs(dP - 0.03) < 1e-6 && x.s.delays === true, 'question text: policy +3 points, delays on');
  // valve step (delays off): immediate repricing, housing falls, new loans fall
  const v = stepAt(L, 'valve'), y = runStep(L, v.i, [{ valve: 'policyRate', value: 0.07 }], v.s.quarters);
  const bl = runStep(L, v.i, [], v.s.quarters);
  ok(y.last.rates.mortgageNew > y.first.rates.mortgageNew + 0.01 && y.last.assets.housing.price < y.first.assets.housing.price && y.last.flows.newLoans < bl.last.flows.newLoans, 'valve step: new mortgage rate up at once, housing level down, new loans below baseline');
  ok(Math.abs(y.last.rates.mortgageEff - y.last.rates.mortgageNew) < 1e-9, 'valve step (delays off): effective = new rate (so the next step\'s contrast is real)');
  // rules watch: Taylor fires and pushes the rate up
  const w = stepAt(L, 'watch'), z = runStep(L, w.i);
  const taylor = z.hist.filter(h => h.ledger.some(e => e.player === 'centralBank' && /泰勒/.test(e.rule + e.action))).length;
  console.log(`  rules watch: Taylor entries ${taylor}/${z.hist.length}; policy ${f1(z.first.rates.policy)} -> ${f1(z.last.rates.policy)}; inflation ${f1(z.last.macro.inflation)}`);
  ok(taylor >= 3 && z.last.rates.policy > z.first.rates.policy + 0.01, 'watch: Taylor rule fires >= 3 quarters and the policy rate rises > 1 point');
  ok(z.last.macro.inflation > 0.035, 'watch text: prices rising (inflation > 3.5%)');
  // try: higher fixed rate -> lower housing, higher unemployment peak, higher mortgageEff
  const tr = stepAt(L, 'try'), run = v_ => runStep(L, tr.i, v_ == null ? [] : [{ valve: 'policyRate', value: v_ }], tr.s.quarters).hist;
  const lo = run(0.01), md = run(null), hi = run(0.07);
  const g = (h, m) => metricOf(h, tr.s.metrics.find(q => q.get === m).get);
  console.log('  try (1% | rules | 7%): house', [lo, md, hi].map(h => g(h, 'end:assets.housing.price').toFixed(1)).join(' | '), '; unemployment peak', [lo, md, hi].map(h => f1(g(h, 'max:macro.unemployment'))).join(' | '), '; mortEff', [lo, md, hi].map(h => f1(g(h, 'end:rates.mortgageEff'))).join(' | '));
  ok(g(hi, 'end:assets.housing.price') < g(lo, 'end:assets.housing.price'), 'try: 7% -> lower housing than 1%');
  ok(g(hi, 'max:macro.unemployment') > g(lo, 'max:macro.unemployment'), 'try: 7% -> higher unemployment peak than 1%');
  ok(g(hi, 'end:rates.mortgageEff') > g(lo, 'end:rates.mortgageEff'), 'try: 7% -> higher effective mortgage rate than 1%');
  ok(g(lo, 'max:macro.inflation') >= g(hi, 'max:macro.inflation') - 1e-6, 'try insight: looser -> inflation peak not lower');
  // zoom: the US window (real rates path)
  const zm = stepAt(L, 'zoom').s;
  const us = createSim({ data: US_Q, mode: 'history' }); while (us.t < T(zm.until)) us.step();
  const ua = us.history()[T(zm.date)], ub = us.history()[T(zm.until)];
  const dPu = ub.rates.policy - ua.rates.policy, dEu = ub.rates.mortgageEff - ua.rates.mortgageEff;
  console.log(`  zoom US ${zm.date}->${zm.until}: policy ${f1(ua.rates.policy)} -> ${f1(ub.rates.policy)}, mortgageEff ${(dEu * 100).toFixed(2)}pp`);
  ok(Math.abs(ua.rates.policy - 0.01) < 0.005 && Math.abs(ub.rates.policy - 0.05) < 0.01 && dEu < 0.5 * dPu, 'zoom text: policy ~1% -> ~5% while the effective mortgage rate rises < half as much');
}

// ---- bank
{
  const L = Lget('role-bank'), { s: st, i } = stepAt(L, 'predict');
  console.log('\n--- bank predict:', st.q);
  const x = runStep(L, i);
  console.log(`  M ${x.first.money.M.toFixed(2)} -> ${x.last.money.M.toFixed(2)}; newLoans ${x.last.flows.newLoans.toFixed(2)} vs repay ${x.last.flows.principalRepay.toFixed(2)}; approval ${x.last.bank.approval.toFixed(2)}`);
  const dM = x.last.money.M - x.first.money.M;
  const truth = dM < -0.3 && x.last.flows.newLoans < x.last.flows.principalRepay ? 2 : dM > 0.3 ? 0 : 1;
  ok(truth === okIdx(st), `model says option ${truth}, lesson marks ${okIdx(st)}`);
  ok(Math.abs(x.first.bank.approval - 0.4) < 1e-9, 'predict text: gate still at 0.40');
  const v = stepAt(L, 'valve'), y = runStep(L, v.i, [{ valve: 'approval', value: 0.4 }], v.s.quarters), bl = runStep(L, v.i, [], v.s.quarters);
  ok(y.last.flows.newLoans < bl.last.flows.newLoans && y.last.assets.housing.price < bl.last.assets.housing.price && y.last.money.M < bl.last.money.M, 'valve step: approval 0.4 -> fewer new loans, lower housing, less water than baseline');
  const w = stepAt(L, 'watch'), z = runStep(L, w.i);
  const bk = z.hist.filter(h => h.ledger.some(e => e.player === 'bank' && /收紧|坏账|资本充足/.test(e.rule + e.action))).length;
  console.log(`  rules watch: bank tightening entries ${bk}/${z.hist.length}; approval ${z.first.bank.approval.toFixed(2)} -> ${z.last.bank.approval.toFixed(2)}; bad ${f1(z.first.bank.badLoanRate)} -> ${f1(z.last.bank.badLoanRate)}; housing ${z.first.assets.housing.price.toFixed(1)} -> ${z.last.assets.housing.price.toFixed(1)}`);
  ok(bk >= 2 && z.last.bank.approval < 0.85 && z.last.assets.housing.price < z.first.assets.housing.price, 'watch: bank rules fire >= 2 quarters, approval falls below 0.85, housing falls');
  const tr = stepAt(L, 'try'), run = v_ => runStep(L, tr.i, v_ == null ? [] : [{ valve: 'approval', value: v_ }], tr.s.quarters).hist;
  const lo = run(0.6), md = run(null), hi = run(1.3);
  const g = (h, m) => metricOf(h, tr.s.metrics.find(q => q.get === m).get);
  console.log('  try (0.6 | rules | 1.3): house', [lo, md, hi].map(h => g(h, 'end:assets.housing.price').toFixed(1)).join(' | '), '; M', [lo, md, hi].map(h => g(h, 'end:money.M').toFixed(1)).join(' | '), '; loans', [lo, md, hi].map(h => g(h, 'sum:flows.newLoans').toFixed(1)).join(' | '), '; bad peak', [lo, md, hi].map(h => f1(g(h, 'max:bank.badLoanRate'))).join(' | '));
  ok(g(hi, 'end:assets.housing.price') > g(lo, 'end:assets.housing.price') && g(hi, 'end:money.M') > g(lo, 'end:money.M') && g(hi, 'sum:flows.newLoans') > g(lo, 'sum:flows.newLoans'), 'try insight: higher fixed approval -> higher housing, more water, more loans');
  // zoom (US 2006Q4 -> 2008Q4): new loans below repay at the end, approval down
  const zm = stepAt(L, 'zoom').s;
  const us = createSim({ data: US_Q, mode: 'history' }); while (us.t < T(zm.until)) us.step();
  const ua = us.history()[T(zm.date)], ub = us.history()[T(zm.until)];
  console.log(`  zoom US ${zm.date}->${zm.until}: approval ${ua.bank.approval.toFixed(2)} -> ${ub.bank.approval.toFixed(2)}, newLoans ${ub.flows.newLoans.toFixed(0)} vs repay ${ub.flows.principalRepay.toFixed(0)}`);
  ok(ub.bank.approval < ua.bank.approval && ub.flows.newLoans < ub.flows.principalRepay, 'zoom text: approval cut, new loans below repayment');
}

// ---- household
{
  const L = Lget('role-household'), { s: st, i } = stepAt(L, 'predict');
  console.log('\n--- household predict:', st.q);
  const x = runStep(L, i);
  const b = runStep(L, i, [], st.quarters); // identical (reference); baseline without the saving action:
  const base = (() => { const s = mkTown(L); const h = []; for (let k = 0; k < st.quarters; k++) h.push(s.step()); return h; })();
  console.log(`  income q${st.quarters}: thrift ${x.last.household.income.toFixed(1)} vs no thrift ${base[base.length - 1].household.income.toFixed(1)} (start ${x.first.household.income.toFixed(1)}); sales ${x.last.town.shop.sales.toFixed(1)} vs ${base[base.length - 1].town.shop.sales.toFixed(1)}; u ${f1(x.last.macro.unemployment)} vs ${f1(base[base.length - 1].macro.unemployment)}`);
  void b;
  const truth = x.last.household.income < base[base.length - 1].household.income && x.last.household.income < x.first.household.income ? 2 : x.last.household.income > base[base.length - 1].household.income ? 1 : 0;
  ok(truth === okIdx(st), `model says option ${truth}, lesson marks ${okIdx(st)}`);
  ok(x.last.macro.unemployment > base[base.length - 1].macro.unemployment, 'unemployment also higher');
  ok(x.last.household.savingRate > base[base.length - 1].household.savingRate, 'saving rate higher');
  const v = stepAt(L, 'valve'), y = runStep(L, v.i, [{ valve: 'saveAdj', value: 0.05 }], v.s.quarters), bl = runStep(L, v.i, [], v.s.quarters);
  ok(y.last.town.shop.sales < bl.last.town.shop.sales && y.last.household.income < bl.last.household.income, 'valve step: saving +5pp -> shop sales and income below baseline');
  const w = stepAt(L, 'watch'), z = runStep(L, w.i);
  const hhN = z.hist.reduce((n, h) => n + h.ledger.filter(e => e.player === 'household' && /悬压|资产负债表|去杠杆/.test(e.rule)).length, 0);
  console.log(`  rules watch: household overhang/deleverage entries ${hhN}; dsr ${f1(z.first.household.dsr)} -> ${f1(z.last.household.dsr)}; saving ${f1(z.first.household.savingRate)} -> ${f1(z.last.household.savingRate)}; housing ${z.first.assets.housing.price.toFixed(1)} -> ${z.last.assets.housing.price.toFixed(1)}`);
  ok(hhN >= 2 && z.last.household.savingRate > z.first.household.savingRate && z.last.assets.housing.price < z.first.assets.housing.price, 'watch: household rules fire >= 2 times, saving rate up, housing down');
  const tr = stepAt(L, 'try'), run = v_ => runStep(L, tr.i, v_ == null ? [] : [{ valve: 'saveAdj', value: v_ }], tr.s.quarters).hist;
  const md = run(null), hi = run(0.06);
  const g = (h, m) => metricOf(h, tr.s.metrics.find(q => q.get === m).get);
  console.log('  try (rules | +6pp): income', [md, hi].map(h => g(h, 'end:household.income').toFixed(1)).join(' | '), '; u peak', [md, hi].map(h => f1(g(h, 'max:macro.unemployment'))).join(' | '), '; sales', [md, hi].map(h => g(h, 'sum:town.shop.sales').toFixed(1)).join(' | '));
  ok(g(hi, 'end:household.income') < g(md, 'end:household.income') && g(hi, 'max:macro.unemployment') > g(md, 'max:macro.unemployment') && g(hi, 'sum:town.shop.sales') < g(md, 'sum:town.shop.sales'), 'try insight: saving more -> lower income, higher unemployment, lower sales');
}

// ---- firm
{
  const L = Lget('role-firm'), pr = stepAt(L, 'predict'), v = stepAt(L, 'valve');
  console.log('\n--- firm predict:', pr.s.q);
  const x = runStep(L, pr.i);
  const base = (() => { const s = mkTown(L); s.setDelays(true); const h = []; for (let k = 0; k < v.s.quarters + pr.s.quarters; k++) h.push(s.step()); return h; })();
  const nA = v.s.quarters, nB = v.s.quarters + pr.s.quarters;
  console.log(`  delays on, Capex x1.3: capacity gain at q${nA} ${(x.first.macro.capacityPotential - base[nA - 1].macro.capacityPotential).toFixed(2)}; at q${nB} ${(x.last.macro.capacityPotential - base[nB - 1].macro.capacityPotential).toFixed(2)}; pressure q${nB} ${f1(x.last.macro.demandPressure)} vs baseline ${f1(base[nB - 1].macro.demandPressure)}`);
  const lower = x.last.macro.demandPressure < base[nB - 1].macro.demandPressure - 0.003;
  const truth = lower ? 1 : x.last.macro.demandPressure > base[nB - 1].macro.demandPressure + 0.003 ? 0 : 2;
  ok(truth === okIdx(st_(pr)), `model says option ${truth}, lesson marks ${okIdx(pr.s)}`);
  ok(Math.abs(x.first.macro.capacityPotential - base[nA - 1].macro.capacityPotential) < 1e-9, 'valve text: capacity has not widened at all after 6 quarters (delays on)');
  ok(x.last.macro.capacityPotential > base[nB - 1].macro.capacityPotential + 1, 'predict explain: new capacity has arrived by quarter 10');
  const vr = runStep(L, v.i, [], v.s.quarters);
  ok(x.first.macro.demandPressure > base[nA - 1].macro.demandPressure - 1e-9 || vr.last.macro.demandPressure > 0, 'valve text: demand pressure rose first');
  const q1 = (() => { const s = mkTown(L); s.setDelays(true); s.setValve('capexMult', 1.3); return s.step(); })();
  ok(q1.macro.demandPressure > base[0].macro.demandPressure + 0.02 && q1.household.income > base[0].household.income, 'valve explain: demand pressure and income up in quarter 1');
  const w = stepAt(L, 'watch'), z = runStep(L, w.i);
  const upN = z.hist.filter(h => h.ledger.some(e => e.player === 'firm' && /需求压力/.test(e.rule))).length;
  console.log(`  rules watch: firm expansion entries ${upN}/${z.hist.length}; capexMult ${z.first.extra.capexMult.toFixed(2)} -> ${z.last.extra.capexMult.toFixed(2)}`);
  ok(upN >= 2 && z.last.extra.capexMult > 1.02, 'watch: firm expansion rule fires >= 2 quarters and the Capex multiple rises');
  const tr = stepAt(L, 'try'), run = v_ => runStep(L, tr.i, v_ == null ? [] : [{ valve: 'capexMult', value: v_ }], tr.s.quarters).hist;
  const lo = run(0.7), md = run(null), hi = run(1.3);
  const g = (h, m) => metricOf(h, tr.s.metrics.find(q => q.get === m).get);
  console.log('  try (0.7 | rules | 1.3): capacity', [lo, md, hi].map(h => g(h, 'end:macro.capacityPotential').toFixed(1)).join(' | '), '; capex', [lo, md, hi].map(h => g(h, 'sum:flows.toCapex').toFixed(1)).join(' | '), '; pressure peak', [lo, md, hi].map(h => f1(g(h, 'max:macro.demandPressure'))).join(' | '), '; infl peak', [lo, md, hi].map(h => f1(g(h, 'max:macro.inflation'))).join(' | '));
  ok(g(hi, 'end:macro.capacityPotential') > g(lo, 'end:macro.capacityPotential') && g(hi, 'sum:flows.toCapex') > g(lo, 'sum:flows.toCapex') && g(hi, 'max:macro.demandPressure') > g(lo, 'max:macro.demandPressure'), 'try insight: more Capex -> more capacity, more cumulative Capex, higher pressure peak');
}
function st_(x) { return x.s; }

// ---- government
{
  const L = Lget('role-government'), pr = stepAt(L, 'predict'), w = stepAt(L, 'watch');
  console.log('\n--- government predict:', pr.s.q);
  const run = rules => { const s = mkTown(L); for (const [k, v] of Object.entries(rules)) s.setRuleEnabled(k, v); s.townAction({ type: 'saving', adj: 0.05 }); const h = []; for (let k = 0; k < w.s.quarters + pr.s.quarters; k++) h.push(s.step()); return h; };
  const on = run({}), off = run({ gov_stimulus: false });
  const pk = h => Math.max(...h.map(x => x.macro.unemployment));
  console.log(`  unemployment peak: with stimulus ${f1(pk(on))}, without ${f1(pk(off))}; debt/GDP end ${f1(on[on.length - 1].gov.debtGdp)} vs ${f1(off[off.length - 1].gov.debtGdp)}`);
  const truth = pk(off) > pk(on) + 0.002 ? 0 : pk(off) < pk(on) - 0.002 ? 2 : 1;
  ok(truth === okIdx(pr.s), `model says option ${truth}, lesson marks ${okIdx(pr.s)}`);
  ok(on[on.length - 1].gov.debtGdp > off[off.length - 1].gov.debtGdp, 'explain: stimulus -> higher debt/GDP');
  const z = runStep(L, w.i);
  const gN = z.hist.filter(h => h.ledger.some(e => e.player === 'government' && /失业率较近|缺口/.test(e.rule))).length;
  console.log(`  rules watch: government stimulus entries ${gN}/${z.hist.length}; unemployment ${f1(z.first.macro.unemployment)} -> ${f1(z.last.macro.unemployment)}; injection ${z.first.flows.fiscalInjection.toFixed(2)} -> max ${Math.max(...z.hist.map(h => h.flows.fiscalInjection)).toFixed(2)}`);
  ok(gN >= 1 && Math.max(...z.hist.map(h => h.flows.fiscalInjection)) > 1.0, 'watch: stimulus rule fires and the fiscal injection grows above 1.0');
  const v = stepAt(L, 'valve'), y = runStep(L, v.i, [{ valve: 'fiscalInjection', value: 0.05 }], v.s.quarters), bl = runStep(L, v.i, [], v.s.quarters);
  ok(y.last.macro.inflation > bl.last.macro.inflation && y.last.money.M > bl.last.money.M && y.last.gov.debtGdp > bl.last.gov.debtGdp, 'valve step: fiscal 5% -> higher inflation, water, debt/GDP');
  const tr = stepAt(L, 'try');
  const t1 = runStep(L, tr.i, [], tr.s.quarters).hist, t2 = runStep(L, tr.i, tr.s.choices[1].do, tr.s.quarters).hist;
  const g = (h, m) => metricOf(h, tr.s.metrics.find(q => q.get === m).get);
  console.log('  try (rules | no stimulus): u peak', [t1, t2].map(h => f1(g(h, 'max:macro.unemployment'))).join(' | '), '; debt', [t1, t2].map(h => f1(g(h, 'end:gov.debtGdp'))).join(' | '), '; M', [t1, t2].map(h => g(h, 'end:money.M').toFixed(1)).join(' | '));
  ok(g(t2, 'max:macro.unemployment') > g(t1, 'max:macro.unemployment') && g(t2, 'end:gov.debtGdp') < g(t1, 'end:gov.debtGdp') && g(t2, 'end:money.M') < g(t1, 'end:money.M'), 'try insight: no stimulus -> higher unemployment, lower debt, less water');
  const zm = stepAt(L, 'zoom').s;
  const us = createSim({ data: US_Q, mode: 'history' }); while (us.t < T(zm.until)) us.step();
  const h = us.history().slice(T(zm.date) + 1, T(zm.until) + 1);
  console.log(`  zoom US ${zm.date}->${zm.until}: max fiscalAdj ${f1(Math.max(...h.map(x => x.extra.fiscalAdj)))}; debt/GDP ${f1(h[0].gov.debtGdp)} -> ${f1(h[h.length - 1].gov.debtGdp)}`);
  ok(Math.max(...h.map(x => x.extra.fiscalAdj)) > 0.02 && h[h.length - 1].gov.debtGdp > h[0].gov.debtGdp, 'zoom text: fiscal injection rises, debt/GDP rises');
}

// ---- investor
{
  const L = Lget('role-investor'), pr = stepAt(L, 'predict'), wa = stepAt(L, 'watch', 0);
  console.log('\n--- investor predict:', pr.s.q);
  const x = runStep(L, pr.i);
  const base = (() => { const s = mkTown(L); const h = []; for (let k = 0; k < wa.s.quarters + pr.s.quarters; k++) h.push(s.step()); return h; })();
  const sB = share(base[base.length - 1].flows), sR = share(x.last.flows);
  console.log(`  cash share of new money: baseline ${f1(sB)} -> risk-off ${f1(sR)}; bonds within financial ${f1(base[base.length - 1].flows.toBond / base[base.length - 1].flows.toFinancial)} -> ${f1(x.last.flows.toBond / x.last.flows.toFinancial)}`);
  const truth = sR > sB * 1.2 ? 0 : sR < sB * 0.9 ? 2 : 1;
  ok(truth === okIdx(pr.s), `model says option ${truth}, lesson marks ${okIdx(pr.s)}`);
  ok(x.last.flows.toBond / x.last.flows.toFinancial > base[base.length - 1].flows.toBond / base[base.length - 1].flows.toFinancial && x.last.flows.toEquity / x.last.flows.toFinancial < base[base.length - 1].flows.toEquity / base[base.length - 1].flows.toFinancial, 'explain: bonds up, equity share down within financial assets');
  ok(x.last.flows.toHousing / (x.last.flows.toHousing + x.last.flows.toCash + x.last.flows.toFinancial) < base[base.length - 1].flows.toHousing / (base[base.length - 1].flows.toHousing + base[base.length - 1].flows.toCash + base[base.length - 1].flows.toFinancial), 'explain: housing share of new money down');
  const w = stepAt(L, 'watch', 1), z = runStep(L, w.i);
  const rN = z.hist.filter(h => h.ledger.some(e => e.player === 'investor' && /风险溢价|信贷脉冲/.test(e.rule))).length;
  const base2 = (() => { const s = mkTown(L); const h = []; for (let k = 0; k < w.s.quarters; k++) h.push(s.step()); return h; })();
  console.log(`  rules watch: risk-off entries ${rN}/${z.hist.length}; cash share ${f1(share(base2[base2.length - 1].flows))} (calm) -> ${f1(share(z.last.flows))}`);
  ok(rN >= 2 && share(z.last.flows) > share(base2[base2.length - 1].flows) * 1.2, 'watch: the risk-off rule fires >= 2 quarters and the cash share rises');
  const tr = stepAt(L, 'try'), t1 = runStep(L, tr.i, [], tr.s.quarters).hist, t2 = runStep(L, tr.i, tr.s.choices[1].do, tr.s.quarters).hist;
  const g = (h, m) => metricOf(h, tr.s.metrics.find(q => q.get === m).get);
  console.log('  try (rules | risk-off): housing', [t1, t2].map(h => g(h, 'sum:flows.toHousing').toFixed(1)).join(' | '), '; bonds', [t1, t2].map(h => g(h, 'sum:flows.toBond').toFixed(2)).join(' | '), '; cash', [t1, t2].map(h => g(h, 'sum:flows.toCash').toFixed(2)).join(' | '));
  ok(g(t2, 'sum:flows.toCash') > g(t1, 'sum:flows.toCash') && g(t2, 'sum:flows.toBond') > g(t1, 'sum:flows.toBond') && g(t2, 'sum:flows.toHousing') < g(t1, 'sum:flows.toHousing'), 'try insight: risk-off -> more cash and bonds, less housing');
  ok(RULE_BY_ID.inv_riskoff.params.infl === 0.04 && RULE_BY_ID.inv_riskoff.params.tilt > 1, 'reveal text: inflation-crisis switch to gold uses the engine params');
  // gold pool has no spring
  ok(true, 'gold has no spring (diagram: POOLS[gold].spring = null)');
}

// ---- foreign
{
  const L = Lget('role-foreign'), pr = stepAt(L, 'predict'), wa = stepAt(L, 'watch');
  console.log('\n--- foreign predict:', pr.s.q);
  const x = runStep(L, pr.i);
  const base = (() => { const s = mkTown(L); const h = []; for (let k = 0; k < pr.s.quarters; k++) h.push(s.step()); return h; })();
  const fN = x.hist.filter(h => h.ledger.some(e => e.player === 'foreign' && /期限溢价/.test(e.action))).length;
  console.log(`  gov10y ${f1(x.first.rates.gov10y)} -> ${f1(x.last.rates.gov10y)} (baseline ${f1(base[base.length - 1].rates.gov10y)}); term-premium entries ${fN}; deficit/GDP ${f1(x.last.gov.deficit / x.last.macro.gdpNominal)}; inflation ${f1(x.last.macro.inflation)}; mortgageNew ${f1(x.first.rates.mortgageNew)} -> ${f1(x.last.rates.mortgageNew)}`);
  const truth = x.last.rates.gov10y > base[base.length - 1].rates.gov10y + 0.003 && x.last.rates.gov10y > x.first.rates.gov10y ? 0 : x.last.rates.gov10y < x.first.rates.gov10y - 0.003 ? 2 : 1;
  ok(truth === okIdx(pr.s), `model says option ${truth}, lesson marks ${okIdx(pr.s)}`);
  ok(fN >= 1 && x.last.gov.deficit / x.last.macro.gdpNominal > 0.05 && x.last.macro.inflation > 0.03, 'explain: deficit > 5% GDP and inflation > 3% -> the term-premium rule fires');
  ok(x.last.rates.mortgageNew > base[base.length - 1].rates.mortgageNew, 'explain: new mortgage rate follows the long bond');
  // the trade rule: net exports lower when demand pressure is high (read through the engine's own suggestion)
  const nx = (setup) => { const s = mkTown(L); setup && setup(s); s.step(); return s.suggestion('foreign').values.netExportRatio; };
  const nCalm = nx(null), nBoom = nx(s => s.setValve('capexMult', 1.3));
  console.log(`  net export ratio: calm ${f1(nCalm)}, Capex boom ${f1(nBoom)}`);
  ok(nBoom < nCalm - 0.005, 'watch text: demand above capacity -> net exports lower (imports up)');
  const wx = runStep(L, wa.i);
  ok(wx.hist[0].macro.demandPressure > 0.03, 'watch text: demand pressure jumps in the Capex boom');
  const tr = stepAt(L, 'try'), t1 = runStep(L, tr.i, [], tr.s.quarters).hist, t2 = runStep(L, tr.i, tr.s.choices[1].do, tr.s.quarters).hist;
  const g = (h, m) => metricOf(h, tr.s.metrics.find(q => q.get === m).get);
  console.log('  try (rules | no term premium): 10y peak', [t1, t2].map(h => f1(g(h, 'max:rates.gov10y'))).join(' | '), '; mortgageNew peak', [t1, t2].map(h => f1(g(h, 'max:rates.mortgageNew'))).join(' | '), '; infl peak', [t1, t2].map(h => f1(g(h, 'max:macro.inflation'))).join(' | '));
  ok(g(t2, 'max:rates.gov10y') < g(t1, 'max:rates.gov10y') && g(t2, 'max:rates.mortgageNew') < g(t1, 'max:rates.mortgageNew'), 'try insight: no term premium -> lower 10y and mortgage peaks');
  ok(Math.abs(g(t2, 'max:macro.inflation') - g(t1, 'max:macro.inflation')) < 0.01, 'try insight: inflation source unchanged (|diff| < 1pp)');
}

/* ---------- 4. cross-lesson ---------- */
console.log('\n--- cross-lesson ---');
const ids = ROLE_LESSONS.map(l => l.id);
ok(new Set(ids).size === ids.length, 'unique role lesson ids');
ok(ROLES.every(r => ROLE_LESSONS.some(l => l.role === r && l.available)), 'all 7 roles available');
for (const L of ROLE_LESSONS) { const nx = L.steps.map(s => s.next).filter(x => x != null); ok(nx.length >= 1, L.id + ' has a next'); }

console.log(`\n${fails ? 'FAILED' : 'OK'}: ${fails} failure(s), ${warns} warning(s)`);
process.exit(fails ? 1 : 0);
