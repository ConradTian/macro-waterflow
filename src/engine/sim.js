// Controller (CONTRACT §2.2). Drop-in replacement of mock-sim.js.
import { RULE_DEFS, RULE_BY_ID, makeRuleState, makeRuleParams } from './rules.js';
import { seed, exogenous, decideAll, settle, buildSnapshot, qLabel, dateOf } from './economy.js';
import { TOWN_DATA, TOWN_HV0, makeTown, townBlock, evolveTown, applyTownAction, zeroFlowsTown } from './town.js';
import { VALVES } from './valves.js';

const HIST_LAST = 123;   // 2025Q4
const FREE_LAST = 223;   // 2050Q4

// createSim({ data, mode, seed, scenario: 'us' | 'town', delays })
//  scenario 'us'  : real data required (data = US_Q), delays always on.
//  scenario 'town': synthetic 万元 economy (data optional, TOWN_DATA is used). delays default false: no repricing lag,
//                   no smoothing, no momentum, short (2q) Capex lag, so one action shows its effect at once. delays:true restores them.
export function createSim({ data, mode = 'history', seed: rngSeed = 20251028, scenario = 'us', delays } = {}) {
  const isTown = scenario === 'town';
  if (isTown && !data) data = TOWN_DATA;
  if (!data) throw new Error('createSim: data (US_Q) required');
  const listeners = {};
  const emit = (e, x) => (listeners[e] || []).forEach(fn => fn(x));
  let enabled = makeRuleState();
  let params = makeRuleParams();   // per-sim copy; sim.rules[i].params are these same objects
  let K = null;
  let model = null, user = null;

  const sim = {
    t: 0, mode, done: false, takenOver: null, scenario: isTown ? 'town' : 'us',
    delays: isTown ? !!delays : true,
    // rule text is a getter: always generated from the live params (never drifts from the numbers)
    rules: RULE_DEFS.map(r => Object.defineProperty({ id: r.id, player: r.player, enabled: r.enabled, params: params[r.id], paramDoc: r.paramDoc }, 'text',
      { enumerable: true, configurable: true, get: () => r.tpl(params[r.id]) })),
  };

  // userBranch: the 'user' branch object (decisions of the taken-over player + any valve turned).
  // withModelValves: town only - the model branch itself obeys valves set by sim.setValve / sim.townAction.
  const env = (userBranch, withModelValves = false) => ({
    mode: sim.mode, seed: rngSeed, K, delays: sim.delays,
    en: id => !!enabled[id],
    P: id => params[id],
    user: userBranch ? { player: sim.takenOver, dec: userBranch.decisions }
      : (isTown && withModelValves && model && Object.keys(model.decisions).length ? { player: null, dec: model.decisions } : null),
  });

  function advance(br, name) {
    const S0 = br.S;
    const ex = exogenous(data, S0.t + 1);
    const e = env(name === 'user' ? br : null, name === 'model');
    const dec = decideAll(S0, K, ex, e);
    const { S, extra } = settle(S0, K, ex, dec, e);
    if (isTown) S.town = evolveTown(S0, S, extra);
    const snap = buildSnapshot(S, K, extra, name);
    if (isTown) snap.town = townBlock(S);
    br.S = S; br.hist.push(snap); br.extra = extra;
    return snap;
  }

  function init(m) {
    sim.mode = m; sim.t = 0; sim.done = false; sim.takenOver = null; user = null;
    const sd = seed(data, isTown ? { HV0: TOWN_HV0 } : {});
    K = sd.K;
    sd.S.scenario = isTown ? 'town' : 'us';
    if (isTown) {
      // warm start: the first settlement has no "previous" spending ratio (impulse = 0 by construction); seed it from a trial
      // quarter so a valve turned at t=0 acts at once (US keeps its calibrated cold start).
      const trial = structuredClone(sd.S);
      const e0 = env(null);
      const t1 = settle(trial, K, exogenous(data, 1), decideAll(trial, K, exogenous(data, 1), e0), e0).S;
      sd.S.spendRatio = t1.spendRatio; sd.S.dsRatio = t1.dsRatio;
    }
    if (isTown) { sd.S.town = makeTown(); sd.S.town.sales = (1 - sd.S.sav) * sd.S.inc * 0.25; sd.S.flows = zeroFlowsTown(); }
    model = { S: sd.S, hist: [], decisions: {}, extra: null };
    model.hist.push(buildSnapshot(model.S, K, null, 'model'));
    if (isTown) model.hist[0].town = townBlock(model.S);
  }
  init(mode);

  const lastT = () => (sim.mode === 'free' ? FREE_LAST : HIST_LAST);

  Object.assign(sim, {
    reset(m = sim.mode) {
      for (const r of sim.rules) r.enabled = RULE_BY_ID[r.id].enabled;
      enabled = makeRuleState();
      const fresh = makeRuleParams();
      for (const r of sim.rules) { for (const k of Object.keys(r.params)) delete r.params[k]; Object.assign(r.params, fresh[r.id]); }
      init(m);
      emit('reset');
    },
    step() {
      if (sim.done) return sim.snapshot();
      advance(model, 'model');
      if (user) advance(user, 'user');
      sim.t = model.S.t;
      sim.done = sim.t >= lastT();
      const s = sim.snapshot();
      emit('step', s);
      if (s.pauses.length) emit('pause', s.pauses);
      return s;
    },
    snapshot(branch = 'model', t = sim.t) {
      const b = branch === 'user' ? user : model;
      return b ? b.hist[t] ?? null : null;
    },
    history(branch = 'model') { return (branch === 'user' ? user : model)?.hist.slice() ?? []; },
    takeover(playerId) {
      if (!playerId) { sim.takenOver = null; user = null; return; }
      sim.takenOver = playerId;
      user = {
        S: structuredClone(model.S), decisions: isTown ? structuredClone(model.decisions) : {}, extra: model.extra,
        hist: model.hist.map(s => ({ ...s, branch: 'user' })),
      };
    },
    // works for the taken-over player and (valves) for any other player while the user branch exists
    setDecision(playerId, values) {
      if (!user) return;
      const cur = user.decisions[playerId] || {};
      const next = { ...cur };
      for (const [k, v] of Object.entries(values || {})) { if (v == null) delete next[k]; else next[k] = v; }
      user.decisions[playerId] = next;
    },
    suggestion(playerId) {
      const S = model.S, ex = exogenous(data, S.t + 1);
      const dec = decideAll(S, K, ex, env(null, false));
      const mine = dec.entries.filter(x => x.player === playerId);
      const text = mine.length ? mine.map(x => `${x.rule}：${x.action}`).join('；') : '无规则触发：维持现状';
      const values = {};
      if (playerId === 'centralBank') { values.policyRate = dec.policy; if (dec.qeOn) values.qe = dec.qeSize; }
      else if (playerId === 'government') values.fiscalInjection = dec.adj;
      else if (playerId === 'bank') values.approval = dec.approval;
      else if (playerId === 'household') { values.borrowMult = dec.borrowMult; values.saveAdj = dec.saveAdj; }
      else if (playerId === 'firm') values.capexMult = dec.capexMult;
      else if (playerId === 'investor') values.alloc = dec.alloc;
      else if (playerId === 'foreign') values.netExportRatio = dec.nx;
      return { player: playerId, text, values };
    },
    setRuleEnabled(id, on) {
      if (!(id in enabled)) return;
      enabled[id] = !!on;
      const r = sim.rules.find(x => x.id === id); if (r) r.enabled = !!on;
    },
    // change a rule parameter; takes effect from the next step. Unknown ids/keys are ignored (returns false).
    setRuleParam(id, key, value) {
      const p = params[id];
      if (!p || !(key in p) || typeof value !== 'number' || !Number.isFinite(value)) return false;
      p[key] = value; return true;
    },
    on(event, fn) { (listeners[event] ||= []).push(fn); },
    // ---- valves (DESIGN section 3): VALVES table + current values
    // turn a valve. decision valves go to the user branch (auto-created) - or, in the town, straight to the model branch.
    // value null clears it. Rule-param valves change that rule's param for this sim (both branches).
    setValve(id, value) {
      const v = VALVES.find(x => x.id === id);
      if (!v) return false;
      if (v.ruleParam) return sim.setRuleParam(v.ruleParam.rule, v.ruleParam.key, value);
      const val = value == null ? null : (v.decisionKey === 'qe' ? !!value : value);
      if (isTown) {
        const cur = { ...(model.decisions[v.player] || {}) };
        if (val == null) delete cur[v.decisionKey]; else cur[v.decisionKey] = val;
        model.decisions[v.player] = cur;
        return true;
      }
      if (!user) sim.takeover(v.player);
      sim.setDecision(v.player, { [v.decisionKey]: val });
      return true;
    },
    // ---- town single-action demos (scenario 'town' only)
    //  {type:'loan', who, amount} {type:'buyHouse', who, from, price?, loan?} {type:'repay', who, amount}
    //  {type:'payInterest', who, amount} {type:'spend', who, amount}
    //  {type:'riskOff', on} (investor flight to safety)  {type:'saving', adj} (every household saves adj more)
    // Acts on the current quarter IN PLACE: the snapshot at sim.t is rebuilt (flows/budget accumulate actions since the last step()).
    // Returns { ok, entry (ledger entry), budget (this action only), snapshot, reason }.
    townAction(a) {
      if (!isTown) throw new Error("townAction: only for scenario 'town'");
      const S = model.S, old = model.hist[sim.t];
      if (a && (a.type === 'riskOff' || a.type === 'saving')) {
        const cur = { ...(model.decisions[a.type === 'riskOff' ? 'investor' : 'household'] || {}) };
        if (a.type === 'riskOff') { cur.riskOff = !!a.on; model.decisions.investor = cur; }
        else { cur.saveAdj = Number(a.adj) || 0; model.decisions.household = cur; }
        const entry = {
          date: dateOf(S, S.t), player: a.type === 'riskOff' ? 'investor' : 'household', observe: '手动操作（教学演示）',
          rule: a.type === 'riskOff' ? '投资者避险开关' : '全体家庭储蓄率调整', kind: a.type, immediate: '下一季结算时生效',
          delayed: a.type === 'riskOff' ? '新增资金里现金/国债份额上升' : '消费下降 → 小卖部销售下降 → 收入下降（节俭悖论）',
          action: a.type === 'riskOff' ? (a.on ? '开启避险' : '关闭避险') : `储蓄率 ${a.adj >= 0 ? '+' : ''}${(a.adj * 100).toFixed(1)}pp`,
        };
        return { ok: true, entry, budget: { pumpedIn: { loans: 0, qe: 0, deficit: 0 }, drainedOut: { repay: 0, surplus: 0, qt: 0 }, net: 0 }, snapshot: old };
      }
      const r = applyTownAction(S, K, a);
      if (!r.ok) return { ok: false, reason: r.reason, entry: null, budget: null, snapshot: old };
      const entry = {
        date: dateOf(S, S.t), player: 'household', observe: `${r.who} 的存款/债务（教学演示）`, rule: `手动操作：${a.type}`, action: r.text,
        immediate: r.pumped ? '水量增加（泵）' : r.drained ? '水量减少（排水口）' : '水量不变（只是换了位置）', delayed: '',
        kind: a.type, who: r.who, pipes: r.pipes,
      };
      const e2 = { ...(model.extra || {}), entries: [...old.ledger, entry] };
      const snap = buildSnapshot(S, K, e2, 'model', old);
      snap.town = townBlock(S);
      model.hist[sim.t] = snap;
      emit('step', snap);
      return { ok: true, entry, budget: { pumpedIn: { loans: r.flows.newLoans, qe: 0, deficit: 0 }, drainedOut: { repay: r.flows.principalRepay, surplus: 0, qt: 0 }, net: r.pumped - r.drained }, snapshot: snap };
    },
    // town: turn delays on/off (takes effect from the next step)
    setDelays(on) { if (isTown) sim.delays = !!on; },
  });
  Object.defineProperty(sim, 'valves', { enumerable: true, get() {
      const snap = (user ? user : model).hist[sim.t] || sim.snapshot();
      const decs = user ? user.decisions : (isTown ? model.decisions : {});
      return VALVES.map(v => {
        let value, userSet = false;
        if (v.ruleParam) value = params[v.ruleParam.rule][v.ruleParam.key];
        else {
          const d = decs[v.player];
          userSet = !!(d && d[v.decisionKey] != null);
          value = userSet ? (typeof d[v.decisionKey] === 'boolean' ? (d[v.decisionKey] ? 1 : 0) : d[v.decisionKey]) : v.read(snap);
        }
        return { ...v, value, userSet };
      });
  } });
  return sim;
}
export { qLabel };
