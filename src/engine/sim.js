// Controller (CONTRACT §2.2). Drop-in replacement of mock-sim.js.
import { RULE_DEFS, RULE_BY_ID, makeRuleState } from './rules.js';
import { seed, exogenous, decideAll, settle, buildSnapshot, qLabel } from './economy.js';

const HIST_LAST = 123;   // 2025Q4
const FREE_LAST = 223;   // 2050Q4

export function createSim({ data, mode = 'history', seed: rngSeed = 20251028 } = {}) {
  if (!data) throw new Error('createSim: data (US_Q) required');
  const listeners = {};
  const emit = (e, x) => (listeners[e] || []).forEach(fn => fn(x));
  let enabled = makeRuleState();
  let K = null;
  let model = null, user = null;

  const sim = {
    t: 0, mode, done: false, takenOver: null,
    rules: RULE_DEFS.map(r => ({ id: r.id, player: r.player, text: r.text, enabled: r.enabled })),
  };

  const env = userBranch => ({
    mode: sim.mode, seed: rngSeed, K,
    en: id => !!enabled[id],
    P: id => RULE_BY_ID[id].params,
    user: userBranch ? { player: sim.takenOver, dec: userBranch.decisions } : null,
  });

  function advance(br, name) {
    const S0 = br.S;
    const ex = exogenous(data, S0.t + 1);
    const e = env(name === 'user' ? br : null);
    const dec = decideAll(S0, K, ex, e);
    const { S, extra } = settle(S0, K, ex, dec, e);
    const snap = buildSnapshot(S, K, extra, name);
    br.S = S; br.hist.push(snap);
    return snap;
  }

  function init(m) {
    sim.mode = m; sim.t = 0; sim.done = false; sim.takenOver = null; user = null;
    const sd = seed(data);
    K = sd.K;
    model = { S: sd.S, hist: [], decisions: {} };
    model.hist.push(buildSnapshot(model.S, K, null, 'model'));
  }
  init(mode);

  const lastT = () => (sim.mode === 'free' ? FREE_LAST : HIST_LAST);

  Object.assign(sim, {
    reset(m = sim.mode) {
      for (const r of sim.rules) r.enabled = RULE_BY_ID[r.id].enabled;
      enabled = makeRuleState();
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
        S: structuredClone(model.S), decisions: {},
        hist: model.hist.map(s => ({ ...s, branch: 'user' })),
      };
    },
    setDecision(playerId, values) {
      if (!user) return;
      const cur = user.decisions[playerId] || {};
      const next = { ...cur };
      for (const [k, v] of Object.entries(values || {})) { if (v == null) delete next[k]; else next[k] = v; }
      user.decisions[playerId] = next;
    },
    suggestion(playerId) {
      const S = model.S, ex = exogenous(data, S.t + 1);
      const dec = decideAll(S, K, ex, env(null));
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
    on(event, fn) { (listeners[event] ||= []).push(fn); },
  });
  return sim;
}
export { qLabel };
