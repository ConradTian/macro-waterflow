// Mock controller with the same API as sim.js (CONTRACT §2.2). Fake sinusoidal numbers,
// only for UI development while the real engine is being written. Delete once sim.js lands.

const PLAYERS = ['centralBank', 'government', 'bank', 'household', 'firm', 'investor', 'foreign'];

function qLabel(t) {
  return `${1995 + Math.floor(t / 4)}Q${(t % 4) + 1}`;
}

function fakeSnap(t, branch = 'model', bump = 0) {
  const w = Math.sin(t / 10) + bump;
  const lvl = v => (v > 0.5 ? 'red' : v > 0 ? 'yellow' : 'green');
  const stage = 1 + (Math.floor(t / 6) % 8);
  return {
    t, date: qLabel(t), branch,
    macro: { gdpNominal: 7600 * 1.012 ** t, realOutput: 100 + t * 0.6, capacity: 100 + t * 0.62,
      outputGap: 0.02 * w, priceLevel: 100 * 1.006 ** t, inflation: 0.025 + 0.015 * w,
      inflationExp: 0.024, unemployment: 0.055 - 0.015 * w },
    rates: { policy: 0.03 + 0.02 * w, mortgageEff: 0.065, mortgageNew: 0.07 + 0.01 * w,
      gov10y: 0.05, riskPremium: 0.03 - 0.01 * w, realPolicy: 0.005 + 0.01 * w },
    money: { M: 4000 * 1.015 ** t },
    debt: { household: 5000 * 1.018 ** t, firm: 4000 * 1.015 ** t, government: 5000 * 1.015 ** t },
    bank: { capitalRatio: 0.11 - 0.01 * w, approval: 1 + 0.1 * w, badLoanRate: 0.02 - 0.01 * w },
    household: { income: 5500 * 1.012 ** t, dsr: 0.11 + 0.02 * w, lvr: 0.6 - 0.1 * w,
      consumption: 5000 * 1.012 ** t, savingRate: 0.05 - 0.02 * w },
    firm: { profit: 600 * 1.012 ** t, capex: 300 + 50 * w, capexPipeline: [80, 70, 60, 50] },
    gov: { spending: 1600, taxes: 1450, deficit: 150, interest: 230, interestToTax: 0.16, debtGdp: 0.65 },
    assets: {
      cash: { price: 100 * 1.008 ** t, ret: 0.008, realRet: 0.002 },
      bond: { price: 100 * 1.012 ** t, ret: 0.01 - 0.01 * w, realRet: 0.004, yield: 0.05 },
      equity: { price: 100 * 1.02 ** t * (1 + 0.2 * w), ret: 0.02 * w + 0.01, realRet: 0.02 * w, pe: 22 + 8 * w },
      housing: { price: 100 * 1.015 ** t * (1 + 0.15 * w), ret: 0.015 * w + 0.01, realRet: 0.015 * w,
        priceToIncome: 4 + w, rentYield: 0.045 - 0.01 * w },
      gold: { price: 100 * 1.01 ** t, ret: 0.01, realRet: 0.004 },
    },
    flows: { newLoans: 300 + 120 * w, principalRepay: 220, interestPaid: 140, fiscalInjection: 40 + 30 * Math.max(0, -w),
      qe: Math.max(0, -w) * 60, toHousing: 120 + 60 * w, toFinancial: 60 + 30 * w, toConsumption: 90,
      toCapex: 50 + 10 * w, toCash: 30, wages: 1400, profits: 300, taxes: 360, spillToGoods: 20 + 20 * w },
    lights: {
      credit: { level: lvl(w), value: 0.03 * w, label: '信贷脉冲', driver: '新贷款 - 还本' },
      debtService: { level: lvl(w - 0.2), value: 0.11 + 0.02 * w, label: 'DSR', driver: '有效利率与收入' },
      policy: { level: lvl(-w), value: 0.005 + 0.01 * w, label: '实际利率', driver: '政策利率 - 通胀' },
      valuation: { level: lvl(w + 0.1), value: 4 + w, label: '房价/收入', driver: '资产缓冲池水位' },
    },
    ring: { stage, fork: stage === 3 ? (w > 0 ? 'B1' : 'B2') : null,
      probs: { [stage]: 0.6, [((stage % 8) + 1)]: 0.3 }, label: `${'①②③④⑤⑥⑦⑧'[stage - 1]} 示例阶段`,
      nextSignal: '若信贷脉冲转负 → 进入 ⑤' },
    ledger: [
      { date: qLabel(t), player: 'bank', observe: `房价同比 ${(15 * w).toFixed(1)}%`, rule: '抵押品改善且资本充足 → 放宽住房信贷',
        action: `审批倍数 ${(1 + 0.1 * w).toFixed(2)}`, immediate: '新存款增加，更多资金进入房地产', delayed: '家庭 DSR 上升' },
      { date: qLabel(t), player: 'centralBank', observe: `通胀 ${(2.5 + 1.5 * w).toFixed(1)}%`, rule: '真实历史路径',
        action: `政策利率 ${(3 + 2 * w).toFixed(2)}%`, immediate: '新贷款定价改变', delayed: '分批重定价后影响 DSR' },
    ],
    pauses: t > 0 && t % 20 === 0 ? [{ code: 'CREDIT_IMPULSE_FLIP', message: '信贷脉冲转负' }] : [],
    causal: { 'assets.housing.ret': [{ factor: '房贷利率', contribution: -0.01 * w }, { factor: '新贷款', contribution: 0.02 * w }] },
  };
}

export function createSim({ mode = 'history' } = {}) {
  const listeners = {};
  const emit = (e, x) => (listeners[e] || []).forEach(fn => fn(x));
  const hist = { model: [fakeSnap(0)], user: null };
  const sim = {
    t: 0, mode, takenOver: null, done: false,
    rules: PLAYERS.map(p => ({ id: `${p}_r1`, player: p, text: `${p} 示例规则`, enabled: true })),
    reset(m = sim.mode) { sim.mode = m; sim.t = 0; sim.done = false; sim.takenOver = null;
      hist.model = [fakeSnap(0)]; hist.user = null; emit('reset'); },
    step() {
      if (sim.done) return sim.snapshot();
      sim.t += 1;
      hist.model.push(fakeSnap(sim.t));
      if (hist.user) hist.user.push(fakeSnap(sim.t, 'user', 0.3));
      sim.done = sim.t >= (sim.mode === 'free' ? 223 : 123);
      const s = sim.snapshot();
      emit('step', s);
      if (s.pauses.length) emit('pause', s.pauses);
      return s;
    },
    snapshot(branch = 'model', t = sim.t) { return (hist[branch] || [])[t] ?? null; },
    history(branch = 'model') { return hist[branch] || []; },
    takeover(p) { sim.takenOver = p; hist.user = p ? hist.model.map(s => ({ ...s, branch: 'user' })) : null; },
    setDecision() {},
    suggestion(p) { return { player: p, text: '规则建议：维持', values: { policyRate: 0.03 } }; },
    setRuleEnabled(id, on) { const r = sim.rules.find(x => x.id === id); if (r) r.enabled = on; },
    on(e, fn) { (listeners[e] ||= []).push(fn); },
  };
  return sim;
}
