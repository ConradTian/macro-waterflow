// Economy: seed, player decisions (rule-driven), quarterly settlement, snapshot builder.
// State S is a flat plain object; K holds seed-calibrated constants (immutable).
import { RULE_BY_ID, ruleText as ruleTextOf } from './rules.js';
import { computeLamps, detectRing, detectPauses, advanceCycles } from './regimes.js';

export const DT = 0.25;
export const WS = 0.66;          // labour-income share of nominal GDP
export const USTAR = 0.055;      // natural unemployment (neutral)
export const TARGET = 0.02;
const TRANSFER_SHARE = 0.35;       // share of baseline government outlays that are transfers to households
const STIM_TRANSFER_SHARE = 0.95;  // share of a discretionary stimulus (adj>0) delivered as transfers/tax cuts/relief      // inflation target
// ---- tuned constants (see tools/engine_check.mjs scorecard)
const MORT_REPRICE = 0.0992;      // quarterly speed at which the effective mortgage rate converges to the new-loan rate
const RATE_SENS = 0.589;        // sensitivity of household borrowing demand to the real mortgage rate
const WEALTH_MPC = 0.0192;      // consumption out of quarterly change in housing + equity wealth
const GAP_SLOPE = 0.212;        // Phillips-curve slope when demand exceeds capacity
const EARN_EMA = 0.102;         // equity earnings index: EMA weight on current profit (investors price smoothed earnings)
const ERP0 = 0.045, ERP_RP = 0.2, ERP_BAD = 0.171;  // equity risk premium = 4.5% + 0.2*(rp-4.5%) + 0.171*(bad loans-1.5%)
const PE_FLOOR_DEN = 0.0375;    // floor of (yield + ERP - growth): caps the fundamental P/E near 27
const PE_REV = 0.08, PE_MOM = 0.6;   // P/E reversion to fundamental / momentum of last change
const PE_STEP = 0.17, PE_LO = 8, PE_HI = 40;   // per-quarter P/E move limit (+-17%) and P/E range
const MORT_SHARE = 0.8;          // mortgage share of household debt
const REG_TARGET = 0.075;        // capital ratio banks aim to hold (lending headroom)
const clamp = (x, a, b) => Math.min(b, Math.max(a, x));
const pct = x => (x * 100).toFixed(1) + '%';
const pp = x => (x * 100).toFixed(2) + '%';
let LIVE_P = null;   // params accessor of the sim currently deciding (so ledger texts quote LIVE params)
const nz = (x, d) => (x == null || Number.isNaN(x) ? d : x);

export function qLabel(t) { return `${1995 + Math.floor(t / 4)}Q${(t % 4) + 1}`; }
// scenario-aware label: US = "1995Q1"; town = "第0季" (t quarters since the start)
export function dateOf(S, t) { return S.scenario === 'town' ? `第${t}季` : qLabel(t); }

export function mulberry32(a) {
  return function () {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
function gauss(rng) {
  const u = Math.max(1e-9, rng()), w = rng();
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * w);
}

// ---------------------------------------------------------------- exogenous
export function exogenous(data, t) {
  const s = data.series, n = data.dates.length;
  const get = (k, i) => (s[k] && i >= 0 && i < n && s[k][i] != null ? s[k][i] : null);
  const oil = get('oilPrice', t), oil4 = get('oilPrice', t - 4);
  const g = get('gdpRealGrowthYoY', t);
  return {
    policyRate: get('policyRate', t),
    oilYoY: oil != null && oil4 != null ? oil / oil4 - 1 : 0,
    // a collapse of real output far beyond a normal recession (yoy < -5%) is treated as a combined supply+demand shock
    // (lockdown-type event); the depth beyond -5% is amplified x4 because one yoy number understates a one-quarter shutdown
    shock: g != null ? 4 * Math.max(0, -0.05 - g) : 0,
    inData: t < n,
  };
}

// ---------------------------------------------------------------- seed
export function seed(data, opts = {}) {
  const s = data.series, g0 = k => (s[k] && s[k][0] != null ? s[k][0] : null);
  const gdp0 = g0('gdpNominal') ?? 7600;
  const hhDG = g0('hhDebtGdp') ?? 0.65;
  const priv = g0('privateCreditGdp') ?? 1.1;
  const Dh = hhDG * gdp0;
  const Df = Math.max(0.25, priv - hhDG) * gdp0 * 0.8;
  const Dg = (g0('govDebtGdp') ?? 0.5) * gdp0;
  const mort0 = g0('mortgageRate') ?? 0.0765;
  const policy0 = g0('policyRate') ?? 0.055;
  const cpi0 = clamp(g0('cpiYoY') ?? 0.028, 0.01, 0.05);
  const inc0 = WS * gdp0;
  let dsr0 = g0('hhDsr');
  let alphaH;
  if (dsr0 == null) { alphaH = 0.035; dsr0 = (mort0 + alphaH) * Dh / inc0; } // backfill: rate x debt / income
  else alphaH = Math.max(0.025, dsr0 * inc0 / Dh - mort0);
  const u0 = g0('unemployment') ?? 0.056;
  const p0 = { gdp0, Dh, Df, Dg, mort0, policy0, cpi0, inc0, dsr0, alphaH, u0 };
  const gov10y0 = g0('gov10y') ?? 0.065;
  const rp0 = 0.045;
  const piE0 = cpi0;
  const peDen = Math.max(0.02, gov10y0 + rp0 - (piE0 + 0.02));
  const pe0 = 1 / peDen;
  const mortNew0 = mort0;
  const K = {
    gdp0, inc0, dsr0, alphaH, alphaF: 0.10, HV0: MORT_SHARE * Dh / 0.38, rent0: 0, profit0: 0.10 * gdp0, mkt0: gdp0, pe0,
    gBase: 0.04, gT: 0.022, c0: 0.15, s0: 0.07, tau0: 0.185, gr0: 0.185, fInj: 0.5,
    a0: (alphaH + 0.05) * Dh / inc0, realMort0: mortNew0 - piE0, y0: Math.max(0.025, mortNew0 - piE0 + 0.01),
    rfr0: gov10y0 * 0.5 + policy0 * 0.5 + 0.02 - piE0, spread: 0.017,
    bondShare: 0.75, gold0: 0.06 * gdp0, kBondFlow: 0.3, kGoldFlow: 0.8, kEqFlow: 1.5,
  };
  if (opts.HV0) K.HV0 = opts.HV0;
  K.rent0 = 0.05 * K.HV0;
  const Ystar = gdp0, P = 1;
  const pipelineQ = K.c0 * Ystar * DT;
  const B0 = Dh + Df;
  const S = {
    t: 0, P, Ystar, capLoss: 0, shock: 0, Y: Ystar, gdp: gdp0, AD: gdp0, pi: cpi0, piE: piE0, piY: cpi0, u: u0,
    uHist: new Array(8).fill(u0), policy: policy0, emaPolicy: policy0, gov10y: gov10y0, mortNew: mortNew0, mortEff: mort0,
    firmEff: 0.5 * gov10y0 + 0.5 * policy0 + 0.02, govEff: gov10y0, rp: rp0, qeStock: 0, qeOn: false,
    M: 0.55 * gdp0, Dh, Df, Dg, E: 0.10 * B0, approval: 1, bad: 0.012, badH: 0.012, badF: 0.012,
    H: 100, Hret: 0.01, inc: inc0, incPrev: inc0, pe: pe0, pePrev: pe0, earnIdx: 1, eqPrice: 100, eqRet: 0.01, eqCap: K.mkt0,
    bondPrice: 100, goldPrice: 100, cashPrice: 100, real10y: gov10y0 - piE0, HV: K.HV0,
    pipeline: new Array(6).fill(pipelineQ / P), spendRatio: null, dsRatio: null, nxRatio: -0.03, sav: K.s0,
    sm: 0.05 * B0 / gdp0, smH: [0.05 * B0 / gdp0, 0.05 * B0 / gdp0], impulse: 0, flowRatio: 0.05 * B0 / gdp0,
    adj: 0, capexMult: 1, pressure: 0, ovh: 0, dean: 0, Hpk: 100, nlH: inc0 * (((alphaH + 0.05) * Dh / inc0)) * DT, nlF: Df * (0.10 + 0.03) * DT,
    taxes: K.tau0 * gdp0, govSpend: K.gr0 * gdp0, interest: Dg * gov10y0, deficit: Dg * gov10y0, i2t: Dg * gov10y0 / (K.tau0 * gdp0),
    deficitGdp: Dg * gov10y0 / gdp0, profit: 0.10 * gdp0, capex: K.c0 * gdp0, dsr: dsr0, lvr: MORT_SHARE * Dh / K.HV0,
    Ph: new Array(5).fill(P), Hh: new Array(5).fill(100), Eh: new Array(5).fill(100), gdpH: new Array(5).fill(gdp0),
    dsrH: new Array(5).fill(dsr0), polH: new Array(5).fill(policy0), hpQPrev: 0,
    bondFlow: 0, bondTR: 100, Gh: new Array(5).fill(100), distrust: 0, Mstart: 0.55 * gdp0, lastDiv: 0,
    ringProbs: null, ringStage: 1, mem: { last: {}, outBand: false, ciSign: 0, falling: false, dsrRed: false, capLow: false, i2t: false, stage: null },
    flows: null, wealthPrev: K.HV0 + K.mkt0,
  };
  S.v = makeView(S, K);
  return { S, K, p0 };
}

// trust in money: 0 = full trust, 1 = none. Drives gold demand (no cash flow, confidence only).
function distrustOf(S) {
  return clamp(8 * Math.max(0, S.piE - 0.025) + 2 * Math.max(0, S.i2t - 0.15) + 1.5 * S.qeStock / S.gdp + 4 * Math.max(0, -(S.real10y ?? 0)), 0, 1);
}

// features visible to the next quarter's rules / detectors
function makeView(S, K) {
  const hp4 = S.Hh[0], hpYoY = S.t >= 4 ? S.H / hp4 - 1 : 0;
  const eq4 = S.Eh[0];
  const piY = S.piY;
  const B = S.Dh + S.Df;
  const netCredit = S.flows ? (S.flows.newLoans - S.flows.principalRepay - (S.flows.writeoff || 0)) : 0.05 * B * DT;
  const gdpYoY = S.gdp / S.gdpH[0] - 1;
  const v = {
    hpYoY, hpQ: S.Hret, hpQPrev: S.hpQPrev, eqYoY: S.t >= 4 ? S.eqPrice / eq4 - 1 : 0, piY,
    pressure: S.pressure ?? 0, ci: S.impulse, pcg: 4 * netCredit / B, dsr: S.dsr, dsr0: K.dsr0, dDsr4: S.dsr - S.dsrH[0],
    bad: S.bad, capR: S.E / B, dd: 1 - S.H / (S.Hpk ?? S.H), u: S.u, adj: S.adj, qeOn: S.qeOn, gr: (S.t >= 4 ? gdpYoY : 0.04) - S.gov10y,
    PI: 4 * (S.H / 100) / (S.inc / K.inc0), PIrel: (S.H / 100) / (S.inc / K.inc0), peRel: S.pe / K.pe0,
    realP: S.policy - piY, policy: S.policy, dPol4: S.policy - S.polH[0], i2t: S.i2t, lvr: S.lvr,
    goldYoY: S.t >= 4 ? S.goldPrice / S.Gh[0] - 1 : 0,
  };
  return v;
}

// ---------------------------------------------------------------- decisions
function mkEntry(S, player, ruleId, observe, ruleText, action, extra = {}) {
  const r = RULE_BY_ID[ruleId] || {};
  const live = r.tpl ? r.tpl(LIVE_P ? LIVE_P(ruleId) : r.params) : r.text;
  return {
    date: dateOf(S, S.t + 1), player, observe, rule: ruleText ?? live, action,
    immediate: extra.immediate ?? r.immediate ?? '', delayed: extra.delayed ?? r.delayed ?? '',
  };
}

export function ruleBasedPolicy(S, K, ex, env) {
  const v = S.v;
  if (env.mode === 'history' && env.en('cb_real_path') && ex.policyRate != null)
    return { policy: ex.policyRate, ruleId: 'cb_real_path', text: '真实联储路径（外生）' };
  if (env.en('cb_taylor')) {
    const p = env.P('cb_taylor');
    const gap = (USTAR - S.u) * 2;
    const priv = (S.Dh + S.Df) / S.gdp;
    const rStar = p.rStar - p.debtDrag * Math.max(0, priv - p.debtBase);   // 债务棘轮：私人债务越重，中性利率越低
    const tgt = rStar + v.piY + p.wInfl * (v.piY - p.target) + p.wGap * gap;
    const move = clamp(p.smooth * (tgt - S.policy), -p.maxMove, p.maxMove);
    return { policy: Math.max(p.floor, S.policy + move), ruleId: 'cb_taylor', target: tgt, text: null };
  }
  return { policy: S.policy, ruleId: null, text: '无规则：维持政策利率' };
}

export function decideAll(S, K, ex, env) {
  const v = S.v, en = env.en, P = env.P, entries = [];
  const user = env.user;
  LIVE_P = P;
  // decisions exist for the taken-over player AND for any other player with a valve turned (user.dec[pl])
  const ud = pl => (user && (user.player === pl || (user.dec[pl] && Object.keys(user.dec[pl]).length)) ? user.dec[pl] || {} : null);
  const dec = {};

  // ---- central bank
  {
    const rb = ruleBasedPolicy(S, K, ex, env);
    let policy = rb.policy, ruleId = rb.ruleId, ruleText = null, usr = ud('centralBank');
    if (usr && usr.policyRate != null) { policy = clamp(usr.policyRate, 0, 0.2); ruleId = 'user'; ruleText = '用户接管央行：手动设定政策利率'; }
    else if (usr && usr.policyRate == null) { policy = rb.policy; }
    if (Math.abs(policy - S.policy) >= 0.0024) {
      const obs = `通胀 ${pct(v.piY)}，失业率 ${pct(S.u)}，产出缺口压力 ${pct(v.pressure)}`;
      const rtxt = ruleText ?? (ruleId === 'cb_taylor' ? `泰勒规则目标 ${pp(rb.target)}，平滑后调整` : rb.text ?? ruleTextOf(ruleId, LIVE_P ? LIVE_P(ruleId) : undefined));
      entries.push(mkEntry(S, 'centralBank', ruleId === 'user' ? 'cb_taylor' : ruleId, obs, rtxt, `政策利率 ${pp(S.policy)} → ${pp(policy)}`,
        ruleId === 'user' ? { immediate: '新贷款定价改变', delayed: '存量房贷分批重定价后影响 DSR' } : {}));
    }
    // QE
    let qeOn = S.qeOn;
    if (usr && usr.qe != null) {
      // valve: QE switch forced by the user (size from cb_qe.sizeGdp)
      const want = !!usr.qe;
      if (want !== qeOn) entries.push(mkEntry(S, 'centralBank', 'cb_qe', `政策利率 ${pp(policy)}，失业率 ${pct(S.u)}`, '用户接管央行：手动开关 QE', want ? `启动 QE：每年约 ${pct(P('cb_qe').sizeGdp)} GDP（买入长期国债）` : '停止 QE（不做 QT，存量保留）'));
      qeOn = want;
      dec.qeSize = qeOn ? P('cb_qe').sizeGdp * S.gdp * DT : 0;
    } else if (en('cb_qe')) {
      const p = P('cb_qe');
      if (!qeOn && policy <= p.floorRate && (v.ci < 0 || v.pcg < 0.01) && (S.u > p.uOn || v.pressure < -0.03) && v.piY < 0.03) {
        qeOn = true;
        entries.push(mkEntry(S, 'centralBank', 'cb_qe', `政策利率 ${pp(policy)} 已触底，信贷脉冲 ${pct(v.ci)}，失业率 ${pct(S.u)}`, null, `启动 QE：每年约 ${pct(p.sizeGdp)} GDP`));
      } else if (qeOn && (v.piY > p.piOff || S.u < p.uOff || policy > 0.02)) {
        qeOn = false;
        entries.push(mkEntry(S, 'centralBank', 'cb_qe', `通胀 ${pct(v.piY)}，失业率 ${pct(S.u)}`, '通胀回升或失业回落 → 停止 QE', '停止 QE（不做 QT，存量保留）',
          { immediate: '新增 QE 资金归零', delayed: '长端收益率压低效应随 GDP 增长逐渐稀释' }));
      }
      dec.qeSize = qeOn ? p.sizeGdp * S.gdp * DT : 0;
    } else { qeOn = false; dec.qeSize = 0; }
    dec.policy = policy; dec.qeOn = qeOn;
  }

  // ---- government
  {
    let adj = S.adj;
    const usr = ud('government');
    if (usr && usr.fiscalInjection != null) {
      adj = clamp(usr.fiscalInjection, -0.05, 0.15);
      entries.push(mkEntry(S, 'government', 'gov_stimulus', `失业率 ${pct(S.u)}，利息/税收 ${pct(S.i2t)}`, '用户接管政府：手动设定财政注入（占 GDP）', `财政注入 ${pct(adj)} GDP/年`));
    } else {
      const uMin = Math.min(...S.uHist);
      let fired = false;
      if (en('gov_austerity') && (v.piY > P('gov_austerity').pi || S.i2t > P('gov_austerity').i2t)) {
        const p = P('gov_austerity');
        const na = Math.max(p.cut, adj - 0.005);
        if (na !== adj) {
          entries.push(mkEntry(S, 'government', 'gov_austerity', `通胀 ${pct(v.piY)}，利息/税收 ${pct(S.i2t)}`, null, `财政注入 ${pct(adj)} → ${pct(na)} GDP`));
          adj = na;
        }
        fired = true;
      }
      if (!fired && en('gov_stimulus')) {
        const p = P('gov_stimulus');
        const trig = (S.u - uMin > p.du) || v.pressure < p.gap;
        if (trig) {
          // target scales with how deep the demand hole is (GFC-size hole -> ~6% GDP, lockdown-size hole -> up to max)
          const tgt = Math.min(p.max, p.gain * Math.max(0, -v.pressure - p.gapFree) + 0.5 * Math.max(0, S.u - uMin - p.du));
          const na = Math.max(adj, Math.min(tgt, adj + p.ramp));
          if (na - adj > 0.001) entries.push(mkEntry(S, 'government', 'gov_stimulus', `失业率 ${pct(S.u)}（较近 2 年低点 +${pct(S.u - uMin)}），需求缺口 ${pct(v.pressure)}，目标注入 ${pct(tgt)} GDP`, null, `财政注入 ${pct(adj)} → ${pct(na)} GDP/年`));
          adj = na;
        } else if (adj < 0) {
          adj = Math.min(0, adj + p.unwind);   // 紧缩结束后财政立场逐步回到中性
        } else if (adj > 0) {
          const rec = S.u - USTAR < 0.015 && v.pressure > -0.01;
          const na = Math.max(0, adj - (rec ? p.unwind * 2 : p.unwind));
          if (adj - na > 0.003) entries.push(mkEntry(S, 'government', 'gov_stimulus', `景气${rec ? '恢复' : '趋稳'}：失业率 ${pct(S.u)}`, '景气稳定 → 逐步收回财政支持', `财政注入 ${pct(adj)} → ${pct(na)} GDP/年`,
            { immediate: '政府支出下降', delayed: '赤字收窄；若私人部门未恢复则需求回落' }));
          adj = na;
        }
      }
      if (!en('gov_austerity') && !en('gov_stimulus')) adj = 0;
    }
    dec.adj = adj;
    dec.recap = 0;
    if (en('gov_bank_recap')) {
      const p = P('gov_bank_recap');
      if (v.capR < p.cap) {
        dec.recap = p.rate * (p.target - v.capR) * (S.Dh + S.Df);
        entries.push(mkEntry(S, 'government', 'gov_bank_recap', `银行资本充足率 ${pct(v.capR)}，坏账率 ${pct(v.bad)}`, null, `政府注资银行 ${dec.recap.toFixed(0)} 亿美元（计入政府债务），目标资本充足率 ${pct(p.target)}`));
      }
    }
  }

  // ---- bank
  {
    let ap = S.approval;
    const usr = ud('bank');
    if (usr && usr.approval != null) {
      ap = clamp(usr.approval, 0.3, 1.4);
      entries.push(mkEntry(S, 'bank', 'bank_loosen', `房价同比 ${pct(v.hpYoY)}，坏账率 ${pct(v.bad)}，资本充足率 ${pct(v.capR)}`, '用户接管银行：手动设定审批倍数', `审批倍数 ${S.approval.toFixed(2)} → ${ap.toFixed(2)}`));
    } else {
      const tl = en('bank_tighten_losses') && (v.bad > P('bank_tighten_losses').bad || v.capR < P('bank_tighten_losses').cap);
      const tc = en('bank_tighten_collateral') && (v.hpYoY < P('bank_tighten_collateral').hp || v.dd > P('bank_tighten_collateral').dd) && v.lvr > P('bank_tighten_collateral').lvr;
      const lo = en('bank_loosen') && v.hpYoY > P('bank_loosen').hp && v.bad < P('bank_loosen').bad && v.capR > P('bank_loosen').cap;
      let na = ap, rid = null;
      if (tl) { const p = P('bank_tighten_losses'); na = Math.max(p.min, ap - p.step); rid = 'bank_tighten_losses'; }
      else if (tc) { const p = P('bank_tighten_collateral'); na = Math.max(0.5, ap - p.step); rid = 'bank_tighten_collateral'; }
      else if (lo) { const p = P('bank_loosen'); na = Math.min(p.max, ap + p.step); rid = 'bank_loosen'; }
      else if (en('bank_loosen') || en('bank_tighten_losses') || en('bank_tighten_collateral') || en('bank_rebuild_capital'))
        na = ap + (en('bank_rebuild_capital') && v.capR < P('bank_rebuild_capital').cap ? P('bank_rebuild_capital').recovery : 0.03) * (1 - ap);
      else na = 1;
      if (en('bank_rebuild_capital')) {
        const p = P('bank_rebuild_capital');
        const ceil = Math.max(0.4, 1 - p.k * Math.max(0, p.cap - v.capR));
        if (v.capR < p.cap && na > ceil) { na = Math.max(ceil, ap - 0.06); rid = 'bank_rebuild_capital'; }
      }
      if (rid && Math.abs(na - ap) > 1e-9) {
        const obs = `房价同比 ${pct(v.hpYoY)}，坏账率 ${pct(v.bad)}，资本充足率 ${pct(v.capR)}，平均 LVR ${pct(v.lvr)}`;
        entries.push(mkEntry(S, 'bank', rid, obs, null, `审批倍数 ${ap.toFixed(2)} → ${na.toFixed(2)}`));
      }
      ap = na;
    }
    dec.approval = ap;
  }

  // ---- household
  {
    let bm = 1, sa = 0, ovh = 0, ovhOn = false;
    const usr = ud('household');
    if (en('hh_overhang')) {
      // debt overhang (balance-sheet recession): builds fast, decays slowly
      const p = P('hh_overhang');
      const trig = Math.max(clamp((v.lvr - p.lvr0) / p.lvrW, 0, 1), clamp((v.dd - p.dd) / p.ddW, 0, 1), clamp((v.dsr - v.dsr0 - p.dsr) / p.dsrW, 0, 1));
      ovh = Math.max(trig, S.ovh * p.decay);
    }
    if (usr && usr.borrowMult != null) bm = clamp(usr.borrowMult, 0.3, 1.8);
    else {
      if (ovh > 0) { const p = P('hh_overhang'); bm *= 1 - p.borrow * ovh; sa += p.save * ovh; ovhOn = ovh > 0.25; }
      if (en('hh_chase')) {
        const p = P('hh_chase');
        if (v.hpYoY > p.up) bm *= 1 + Math.min(0.5, 3 * (v.hpYoY - p.up) + 0.1);
        else if (v.hpYoY < p.down) bm *= Math.max(0.5, 1 + 2 * (v.hpYoY - p.down));
      }
      if (en('hh_deleverage')) {
        const p = P('hh_deleverage');
        if (v.dsr > K.dsr0 + p.dsr || S.u > p.u) { bm *= p.borrow; sa += p.save; }
      }
    }
    if (usr && usr.saveAdj != null) sa = clamp(usr.saveAdj, -0.05, 0.1);
    if (Math.abs(bm - 1) > 0.08 || sa) {
      const p = v.dsr > K.dsr0 + 0.03 || S.u > 0.075;
      entries.push(mkEntry(S, 'household', usr ? 'hh_chase' : (ovhOn ? 'hh_overhang' : p && en('hh_deleverage') ? 'hh_deleverage' : 'hh_chase'),
        `房价同比 ${pct(v.hpYoY)}，LVR ${pct(v.lvr)}，DSR ${pct(v.dsr)}，失业率 ${pct(S.u)}${ovhOn ? `，债务悬压 ${pct(ovh)}` : ''}`, usr ? '用户接管家庭' : null, `借款需求 ×${bm.toFixed(2)}${sa ? `，储蓄率 +${pct(sa)}` : ''}`));
    }
    dec.borrowMult = bm; dec.saveAdj = sa; dec.ovh = ovh;
  }

  // ---- firm
  {
    let m = S.capexMult;
    const usr = ud('firm');
    const rFirmReal = S.firmEff - S.piE;
    if (usr && usr.capexMult != null) m = clamp(usr.capexMult, 0.6, 1.4);
    else {
      let rid = null;
      const cut = en('firm_capex_cut') && (v.pressure < P('firm_capex_cut').p || rFirmReal > P('firm_capex_cut').rReal || S.badF > P('firm_capex_cut').bad);
      const up = en('firm_capex_up') && v.pressure > P('firm_capex_up').p && rFirmReal < P('firm_capex_up').rReal;
      if (cut) { const p = P('firm_capex_cut'); m = Math.max(p.min, m - p.step); rid = 'firm_capex_cut'; }
      else if (up) { const p = P('firm_capex_up'); m = Math.min(p.max, m + p.step); rid = 'firm_capex_up'; }
      else m = en('firm_capex_cut') || en('firm_capex_up') ? m + 0.1 * (1 - m) : 1;
      if (rid && Math.abs(m - S.capexMult) > 1e-9)
        entries.push(mkEntry(S, 'firm', rid, `需求缺口 ${pct(v.pressure)}，实际融资成本 ${pct(rFirmReal)}`, null, `Capex 倍数 ${S.capexMult.toFixed(2)} → ${m.toFixed(2)}`));
    }
    dec.capexMult = m;
  }

  // ---- investor (allocation weights for asset-bound new money)
  // Level 1: housing / financial / cash (unchanged from v1 so the macro path stays calibrated).
  // Level 2: financial -> equity / long bond / gold, by transparent rules (momentum, valuation, real rate, trust in money).
  // Risk-off moves part of the cash-bound money into long bonds (flight to safety) - unless the crisis is inflationary, then gold.
  {
    const usr = ud('investor');
    let wH = 1, wF = 1, wC = 0.6, note = [];
    if (en('inv_momentum')) {
      const k = P('inv_momentum').k;
      wH = Math.exp(k * clamp(v.hpYoY, -0.3, 0.3)); wF = Math.exp(k * clamp(v.eqYoY, -0.4, 0.4));
      if (v.hpYoY > 0.08 || v.eqYoY > 0.15) note.push('inv_momentum');
    }
    const ro = P('inv_riskoff');
    const riskoff = (usr && usr.riskOff != null) ? !!usr.riskOff : (en('inv_riskoff') && (S.rp > ro.rp || v.ci < ro.ci));
    const inflCrisis = S.piE > ro.infl;
    if (riskoff) { wC *= 3; wF *= 0.7; wH *= 0.7; note.push('inv_riskoff'); }
    const tot = wH + wF + wC;
    dec.alloc = { h: wH / tot, f: wF / tot, c: wC / tot };
    // level 2
    let we = 1, wb = 0.5, wg = 0.15;
    if (en('inv_momentum')) { const k = P('inv_momentum').k; we *= Math.exp(0.5 * k * clamp(v.eqYoY, -0.4, 0.4)); wg *= Math.exp(0.5 * k * clamp(v.goldYoY, -0.4, 0.4)); }
    if (en('inv_equity_valuation')) we *= Math.exp(-P('inv_equity_valuation').k * clamp(v.peRel - 1, -0.6, 0.6));
    if (en('inv_bond_realrate')) { const p = P('inv_bond_realrate'); wb = p.base * Math.exp(clamp(p.k * (S.real10y - p.anchor), -3, 2)); }
    if (en('inv_gold_trust')) { const p = P('inv_gold_trust'); wg = p.base * Math.exp(p.k * distrustOf(S)) * (en('inv_momentum') ? Math.exp(0.5 * P('inv_momentum').k * clamp(v.goldYoY, -0.4, 0.4)) : 1); }
    if (riskoff) {
      we *= 0.5;
      if (inflCrisis) { wb *= 0.3; wg *= ro.tilt; }   // inflationary crisis: bonds are NOT a safe haven -> gold
      else wb *= ro.tilt;                              // ordinary crisis: flight to safety into long bonds
    }
    const ws = we + wb + wg;
    dec.alloc.e = we / ws; dec.alloc.b = wb / ws; dec.alloc.g = wg / ws;
    dec.riskoff = riskoff;
    const rid = note.includes('inv_riskoff') ? 'inv_riskoff' : note[0];
    if (rid) entries.push(mkEntry(S, 'investor', rid, `房价同比 ${pct(v.hpYoY)}，股价同比 ${pct(v.eqYoY)}，风险溢价 ${pct(S.rp)}，信贷脉冲 ${pct(v.ci)}，通胀预期 ${pct(S.piE)}`, usr ? '用户接管投资者：手动设定避险' : null,
      `新增资金配置：房产 ${pct(dec.alloc.h)} / 金融资产 ${pct(dec.alloc.f)}（其中股票 ${pct(dec.alloc.e)} 国债 ${pct(dec.alloc.b)} 黄金 ${pct(dec.alloc.g)}）/ 现金 ${pct(dec.alloc.c)}${riskoff ? `；避险：现金份额上升，金融资产内部${inflCrisis ? '转向黄金（通胀型危机，国债不是避风港）' : '转向长期国债（飞向安全）'}` : ''}`));
  }

  // ---- foreign
  {
    let nx = -0.03, termAdd = 0;
    if (en('foreign_trade')) nx = -0.03 - P('foreign_trade').k * clamp(v.pressure, -0.1, 0.1);
    if (en('foreign_funding')) {
      const p = P('foreign_funding');
      if (S.deficitGdp > p.def && v.piY > p.pi) {
        termAdd = p.add;
        entries.push(mkEntry(S, 'foreign', 'foreign_funding', `财政赤字 ${pct(S.deficitGdp)} GDP，通胀 ${pct(v.piY)}`, null, `期限溢价 +${pp(p.add)}`));
      }
    }
    dec.nx = nx; dec.termAdd = termAdd;
  }
  dec.entries = entries;
  return dec;
}

// ---------------------------------------------------------------- settlement
export function settle(S0, K, ex, dec, env) {
  const S = { ...S0 };
  for (const k of ['uHist', 'pipeline', 'Ph', 'Hh', 'Eh', 'Gh', 'gdpH', 'dsrH', 'polH', 'smH']) S[k] = S0[k].slice();
  S.mem = { ...S0.mem, last: { ...S0.mem.last } };
  const v0 = S0.v, dt = DT;
  const dl = env.delays !== false;   // false (town demos): no repricing lag / smoothing / momentum, short Capex lag
  S.t = S0.t + 1;
  S.Mstart = S0.M;
  const noise = (() => { const r = mulberry32(env.seed + S.t * 7919); return { eq: gauss(r), gold: gauss(r) }; })();

  // 1. policy, shocks, rates
  S.policy = dec.policy; S.qeOn = dec.qeOn;
  S.shock = Math.max(ex.shock, 0.6 * S0.shock); // shock level fades over ~4 quarters
  S.capLoss = Math.max(S0.capLoss * 0.93, 0.6 * ex.shock);
  const demandShockF = (1 - 1.5 * S.shock) / (1 - 1.5 * S0.shock);
  const qe = dec.qeSize;
  S.qeStock = S0.qeStock + qe;
  S.emaPolicy = S0.emaPolicy + (dl ? 0.12 : 1) * (S.policy - S0.emaPolicy);
  const fiscalRisk = 0.08 * Math.max(0, S0.i2t - 0.2);
  const yPath = 0.55 * S.emaPolicy, yInfl = 0.45 * (S0.piE + 0.02), yTerm = 0.008 + fiscalRisk + dec.termAdd, yQe = -Math.min(0.012, 0.15 * S.qeStock / S0.gdp);
  S.gov10y = clamp(yPath + yInfl + yTerm + yQe, 0.005, 0.15);
  S.yParts = { expectedPath: yPath, inflationRisk: yInfl, termPremium: yTerm, qe: yQe };
  const rpT = 0.04 + Math.max(0, S0.bad - 0.015) + 1.2 * Math.max(0, -S0.impulse) + 0.15 * Math.max(0, S0.u - 0.06) - 0.03 * S.qeStock / S0.gdp;
  S.rp = clamp(S0.rp + 0.4 * (rpT - S0.rp), 0.025, 0.11);
  S.approval = dec.approval; S.capexMult = dec.capexMult; S.adj = dec.adj;
  const mAdj = 0.015 * (1 - S.approval) + 0.2 * Math.max(0, S0.bad - 0.02);
  S.mortNew = 0.75 * (S.gov10y + K.spread) + 0.25 * (S.policy + 0.035) + mAdj; // 25% floating-rate / short-reset share
  S.mortEff = S0.mortEff + (dl ? MORT_REPRICE : 1) * (S.mortNew - S0.mortEff);
  const firmNew = 0.5 * S.gov10y + 0.5 * S.policy + 0.02 + 0.1 * Math.max(0, S0.bad - 0.02);
  S.firmEff = S0.firmEff + (dl ? 0.15 : 1) * (firmNew - S0.firmEff);
  S.govEff = S0.govEff + (dl ? 0.06 : 1) * (S.gov10y - S0.govEff);
  const rFirmReal = S.firmEff - S0.piE;

  // 2. saving, income
  const inc = WS * S0.gdp;
  const sT = clamp(K.s0 + 1.0 * (S0.u - USTAR) + 0.2 * (S.policy - S0.piY - 0.01) + dec.saveAdj, 0.01, 0.2);
  S.sav = S0.sav + (dl ? 0.5 : 1) * (sT - S0.sav);

  // 3. credit: min(demand, LVR cap, DSR cap, capital cap) x approval
  const hpY = v0.hpYoY;
  const tractionLoss = env.en('hh_overhang') ? env.P('hh_overhang').traction * dec.ovh : 0;   // 悬压越大，利率传导越弱
  const demHr = clamp(K.a0 + 0.25 * hpY - RATE_SENS * (1 - tractionLoss) * ((S.mortNew - S0.piE) - K.realMort0), 0.04, 0.15);
  const demH = inc * demHr * dec.borrowMult * dt;
  const HV0prev = K.HV0 * S0.H / 100;
  const lvrMax = env.P('bank_lvr_cap').lvrMax + 0.10 * (S.approval - 1);
  const lvrFloor = env.en('bank_tighten_collateral') ? env.P('bank_tighten_collateral').floor : 0;   // 合格购房者始终存在
  const lvrCap = Math.max(lvrFloor * demH, Math.max(0, lvrMax * HV0prev - MORT_SHARE * S0.Dh) * 0.4);
  const dsrMax = K.dsr0 + 0.06 + 0.03 * (S.approval - 1);
  const dsrCap = Math.max(0, dsrMax - S0.dsr) * inc / (S.mortNew + K.alphaH) * 0.3;
  const nlH0 = Math.min(demH, lvrCap, dsrCap);
  const demFr = clamp(K.alphaF + 0.03 + 1.0 * clamp(v0.pressure, -0.1, 0.1) - 1.5 * (rFirmReal - 0.04), 0, 0.25);
  const demF = S0.Df * demFr * (1 + 2 * (S.capexMult - 1)) * dt;
  const nlF0 = Math.max(0, demF);
  const B0 = S0.Dh + S0.Df;
  const capCap = Math.max(0, S0.E / REG_TARGET - B0) * 0.3;
  const tot0 = nlH0 + nlF0;
  const scale = tot0 > 0 ? Math.min(1, capCap / tot0) : 1;
  // origination pipelines adjust gradually (slower up than down)
  const tgtH = nlH0 * scale * S.approval, tgtF = nlF0 * scale * S.approval;
  const NLh = dl ? S0.nlH + (tgtH > S0.nlH ? 0.3 : 0.5) * (tgtH - S0.nlH) : tgtH, NLf = dl ? S0.nlF + (tgtF > S0.nlF ? 0.3 : 0.5) * (tgtF - S0.nlF) : tgtF;
  S.nlH = NLh; S.nlF = NLf; S.ovh = dec.ovh;
  const newLoans = NLh + NLf;
  const repayH = K.alphaH * S0.Dh * dt, repayF = K.alphaF * S0.Df * dt;
  const principalRepay = repayH + repayF;
  const lgdH = clamp(0.3 + 1.5 * Math.max(0, S0.lvr - 0.5), 0.3, 0.7);
  const woH = S0.badH * S0.Dh * dt * lgdH, woF = S0.badF * S0.Df * dt * 0.5;
  const writeoff = woH + woF;
  S.Dh = S0.Dh + NLh - repayH - woH;
  S.Df = S0.Df + NLf - repayF - woF;
  const B1 = S.Dh + S.Df;
  const gross = 0.016 * B0 * dt;
  const net = gross - writeoff;
  const capR0 = S0.E / B0;
  const payout = capR0 >= 0.095 ? 0.6 : capR0 >= 0.085 ? 0.3 : 0;
  S.E = Math.max(0.01 * B1, S0.E + net - payout * Math.max(0, net)) + dec.recap;

  // 4. fiscal
  const tauR = K.tau0 - 0.8 * (S0.u - USTAR) * K.tau0 * 1.0;
  const taxes_a = tauR * S0.gdp;
  const primaryRatio = K.gr0 + S.adj + 0.4 * (S0.u - USTAR);
  const primary_a = primaryRatio * S0.gdp;
  const interest_a = S0.Dg * S.govEff;
  const deficit_a = interest_a + primary_a - taxes_a;
  const deficit_q = deficit_a * dt;
  S.Dg = S0.Dg + deficit_q + dec.recap;
  const fiscalInjection = Math.max(0, deficit_q) * K.fInj, fiscalDrain = Math.max(0, -deficit_q) * K.fInj;
  // ACCOUNTING ONLY (no feedback): split of non-interest outlays into two branches for the diagram.
  //   transfers      = households' branch (benefits, tax cuts, relief): 35% of baseline outlays + automatic stabiliser 0.4*(u-u*) (all benefits)
  //                    + discretionary stance adj: 95% transfers when adj>0 (stimulus episodes: cheques, relief), 35% when adj<0 (cuts)
  //   govPurchases   = primary outlays - transfers (orders to firms / goods channel)
  const trBase = TRANSFER_SHARE * K.gr0 * S0.gdp, trAuto = 0.4 * (S0.u - USTAR) * S0.gdp, trDisc = (S.adj > 0 ? STIM_TRANSFER_SHARE : TRANSFER_SHARE) * S.adj * S0.gdp;
  const transfers_a = clamp(trBase + trAuto + trDisc, 0, Math.max(0, primary_a));
  const govPurchases_a = primary_a - transfers_a;
  S.taxes = taxes_a; S.govSpend = primary_a + interest_a; S.interest = interest_a; S.deficit = deficit_a;

  // 5. capex pipeline and capacity
  const capexShare = clamp((K.c0 + 0.4 * clamp(v0.pressure, -0.1, 0.1) - 0.6 * (rFirmReal - K.rfr0)) * S.capexMult, 0.08, 0.20);
  const capex_q = capexShare * S0.gdp * dt;
  S.pipeline.push(capex_q / S0.P);
  const lag = dl ? 6 : 2;   // quarters between Capex spending and new capacity (town demo: short but visible)
  const completed = S.pipeline[S.pipeline.length - 1 - lag];
  S.pipeline.shift();
  const completedRatio = completed * 4 / S0.Ystar;
  const gCap = K.gT + 0.6 * (completedRatio - K.c0);
  S.Ystar = S0.Ystar * (1 + gCap * dt);
  S.capex = capex_q * 4;

  // 6. flow split of new spending power
  const ew = clamp(0.10 + 1.5 * Math.max(0, hpY), 0.10, 0.35);
  const consShare = 0.15 + ew;
  const base = {
    h: NLh * (1 - consShare), f: NLf * 0.3 + qe, c: NLf * 0.1 + fiscalInjection * 0.15,
  };
  const A = base.h + base.f + base.c;
  const toHousing = 0.75 * base.h + 0.25 * A * dec.alloc.h;
  const toFinancial0 = 0.75 * base.f + 0.25 * A * dec.alloc.f;
  const toCash0 = 0.75 * base.c + 0.25 * A * dec.alloc.c;
  // financial money -> sub-pools. QE (the 0.75*qe that sits in base.f) goes straight into the bond pool;
  // the rest splits by the investor's level-2 weights (risk-off tilts them towards bonds, or gold in an inflationary crisis).
  const qeBond = 0.75 * qe, Fr = Math.max(0, toFinancial0 - qeBond);
  const toCash = toCash0;
  const toEquity = Fr * dec.alloc.e;
  const toBond = qeBond + Fr * dec.alloc.b;
  const toGold = Fr * dec.alloc.g;
  const toFinancial = toEquity + toBond + toGold;
  const consCredit = NLh * consShare;
  const toConsumption = consCredit + fiscalInjection * 0.6;
  const toCapex = NLf * 0.6 + fiscalInjection * 0.25;

  // 7. aggregate demand (credit-impulse form: growth = baseline + changes in credit-funded spending ratios)
  const intDebtQ = (S.mortEff + K.alphaH) * S0.Dh * dt + (S.firmEff + K.alphaF) * S0.Df * dt;
  const dsRatio = 4 * intDebtQ / S0.AD;
  const HVnew = null; // placeholder (computed after housing); wealth effect uses last quarter change to avoid simultaneity
  const wealthSpend = WEALTH_MPC * (S0.HV + S0.eqCap - S0.wealthPrev);
  const spendRatio = 4 * (0.35 * consCredit + capex_q + primary_a * dt + wealthSpend) / S0.AD;
  const nxRatio = dec.nx;
  const d = (a, b) => (b == null ? 0 : a - b);
  const gNom = K.gBase * dt + d(spendRatio, S0.spendRatio) - 0.5 * d(dsRatio, S0.dsRatio) + d(nxRatio, S0.nxRatio) - WS * (S.sav - S0.sav) - 0.4 * v0.pressure * dt;
  S.spendRatio = spendRatio; S.dsRatio = dsRatio; S.nxRatio = nxRatio;
  S.AD = S0.AD * (1 + gNom) * demandShockF;

  // 8. price and output
  const capEff = S.Ystar * (1 - S.capLoss);
  const Dreal = S.AD / S0.P;
  const pressure = Dreal / capEff - 1;
  S.pressure = pressure;
  const oilPush = env.en('firm_oil_passthrough') ? env.P('firm_oil_passthrough').k * clamp(ex.oilYoY, env.P('firm_oil_passthrough').lo, env.P('firm_oil_passthrough').hi) : 0;
  const gapTerm = pressure > 0 ? GAP_SLOPE * pressure + 5 * pressure * pressure : 0.12 * pressure;
  const raw = S0.piE + gapTerm + oilPush;
  S.pi = 0.5 * S0.pi + 0.5 * raw;
  S.P = S0.P * (1 + S.pi * dt);
  S.Y = Math.min(S.AD / S.P, capEff);
  S.gdp = S.P * S.Y;
  S.Ph.push(S.P); S.Ph.shift();
  S.piY = S.t >= 4 ? S.P / S.Ph[0] - 1 : S.pi;
  if (env.en('hh_infl_deanchor')) {
    const p = env.P('hh_infl_deanchor');
    S.dean = 0.8 * S0.dean + 0.2 * clamp((S.piY - p.pi) / 0.03, 0, 1);
    const gapPi = S.piY - S0.piE;
    S.piE = S0.piE + (p.speed + p.extra * S.dean) * (gapPi > 0 ? 1 : p.down) * gapPi + p.anchor * (1 - S.dean) * (TARGET - S0.piE);
  } else {
    S.dean = 0;
    S.piE = S0.piE + 0.08 * (S.piY - S0.piE) + 0.03 * (TARGET - S0.piE);
  }
  const slack = 1 - S.Y / S.Ystar;
  const uT = USTAR - 0.15 * clamp(pressure, 0, 0.08) + 0.6 * Math.max(0, slack);
  S.u = S0.u + 0.5 * (uT - S0.u);
  S.uHist.push(S.u); S.uHist.shift();
  S.inc = WS * S.gdp; S.incPrev = S0.inc;

  // 9. profits, bad loans, DSR, LVR
  S.profit = S.gdp * (0.13 + 0.6 * clamp(pressure, -0.1, 0.1)) - S.firmEff * S.Df;
  S.dsr = (S.mortEff + K.alphaH) * S.Dh / S.inc;
  // 10. housing
  const y = Math.max(0.025, S.mortNew - S0.piE + 0.01);
  const HVprev = HV0prev;
  const dlnInc = Math.log(S.inc / S0.inc);
  const incRatio = S.inc / K.inc0;
  let revert = 0, valPull = 0;
  if (env.en('inv_valuation')) {
    const p = env.P('inv_valuation');
    // fundamental value: income x rate x credit-availability (rate cuts alone cannot lift it when approval is low)
    const Hfund = 100 * Math.pow(incRatio, p.incElast) * Math.pow(K.y0 / y, p.rateElast) * Math.pow(Math.max(0.5, S.approval), p.apprElast) * (1 - p.ovhEff * dec.ovh);
    revert = p.revert * Math.log(Hfund / S0.H);
    valPull = -p.k * Math.max(0, Math.log(((S0.H / 100) / incRatio) / p.ceil)) * dt;
  }
  const mom = env.en('inv_momentum') && dl ? env.P('inv_momentum').hpMom * S0.Hret : 0;
  const creditPush = 0.4 * (toHousing - MORT_SHARE * repayH) / HVprev - 0.0025;
  let forced = 0;
  if (env.en('hh_forced_sales')) {
    const p = env.P('hh_forced_sales');
    const fFall = clamp(0.25 - v0.hpYoY / 0.06, 0, 1);   // 房价仍在下跌时抛压最大；止跌后迅速消退
    forced = dt * fFall * Math.min(p.cap, p.kLvr * Math.max(0, S0.lvr - p.lvr) + p.kBad * Math.max(0, S0.badH - p.bad) + p.kU * Math.max(0, S0.u - p.u) + p.kDD * Math.max(0, 1 - S0.H / S0.Hpk - 0.02));
  }
  const incPass = env.en('inv_valuation') ? env.P('inv_valuation').incPass : 1;
  let hr = incPass * dlnInc + revert + valPull + mom + creditPush - forced;
  const hrC = clamp(hr, -0.06, 0.05);
  const clampRes = hrC - hr;
  S.Hret = hrC;
  S.Hpk = Math.max(S0.H * Math.exp(hrC), S0.Hpk * 0.985);
  S.hpQPrev = S0.Hret;
  S.H = S0.H * Math.exp(hrC);
  S.Hh.push(S.H); S.Hh.shift();
  S.HV = K.HV0 * S.H / 100;
  S.lvr = MORT_SHARE * S.Dh / S.HV;
  const rent = K.rent0 * (S.inc / K.inc0);
  const rentYield = rent / S.HV;
  const housingRet = (Math.exp(hrC) - 1) + rentYield * dt * 0.8;

  // bad-loan dynamics
  const badHt = 0.012 + 0.5 * Math.max(0, S.dsr - K.dsr0) + 0.8 * Math.max(0, S.lvr - 0.42) + 0.35 * Math.max(0, S.u - 0.06);
  const badFt = 0.012 + 0.3 * Math.max(0, S.u - 0.06) + 0.25 * Math.max(0, -pressure - 0.02);
  S.badH = 0.7 * S0.badH + 0.3 * badHt; S.badF = 0.7 * S0.badF + 0.3 * badFt;
  S.bad = (S.badH * S.Dh + S.badF * S.Df) / B1;

  // 11. equity, bond, gold, cash
  const profitQ = S.profit;
  S.earnIdx = (1 - EARN_EMA) * S0.earnIdx + EARN_EMA * profitQ / K.profit0;
  // equity risk premium: only a fraction of the credit-spread-like swings in `rp` reaches equities, plus a slow bank-stress term (bad loans peak late)
  const erp = ERP0 + ERP_RP * (S.rp - 0.045) + ERP_BAD * Math.max(0, S.bad - 0.015);
  const peF = 1 / Math.max(PE_FLOOR_DEN, S.gov10y + erp - (S0.piE + 0.02));
  const peRev = PE_REV * (peF - S0.pe);
  const peMom = dl ? PE_MOM * (S0.pe - S0.pePrev) : 0;
  const peFlow = K.kEqFlow * S0.pe * toEquity / S0.eqCap;
  const peNoise = S0.pe * 0.02 * noise.eq;
  S.pePrev = S0.pe;
  S.pe = clamp(S0.pe + clamp(peRev + peMom + peFlow + peNoise, -PE_STEP * S0.pe, PE_STEP * S0.pe), PE_LO, PE_HI);
  S.eqPrice = 100 * S.earnIdx * S.pe / K.pe0;
  S.eqCap = K.mkt0 * S.eqPrice / 100;
  const eqPriceRet = S.eqPrice / S0.eqPrice - 1;
  const eqRet = eqPriceRet + 0.02 * dt;
  S.eqRet = eqPriceRet; S.Eh.push(S.eqPrice); S.Eh.shift();
  S.wealthPrev = S0.HV + S0.eqCap;
  // long bond: price falls when the yield rises (duration 8). The yield itself = expected policy path + term premium
  // + inflation compensation (S.yParts); flows add a transient flight-to-safety / QE pressure that mean-reverts.
  const dy = S.gov10y - S0.gov10y;
  const bondPxRet = -8 * dy + 0.5 * 90 * dy * dy;
  S.bondFlow = 0.8 * S0.bondFlow + K.kBondFlow * toBond / Math.max(1, K.bondShare * S0.Dg * S0.bondPrice / 100);
  const bondFlowRet = S.bondFlow - S0.bondFlow;
  const bondCoupon = S0.gov10y * dt;
  const bondRet = bondPxRet + bondFlowRet + bondCoupon;
  S.bondPrice = S0.bondPrice * (1 + bondPxRet + bondFlowRet);      // clean price index (coupons are a separate spring)
  S.bondTR = S0.bondTR * (1 + bondRet);
  S.real10y = S.gov10y - S.piE;
  S.distrust = distrustOf(S);
  const goldLevel0 = K.gold0 * S0.goldPrice / 100;
  const goldRet = clamp(S0.piE * dt - 3.0 * (S.real10y - S0.real10y) + 0.15 * (S.i2t - S0.i2t) + 0.3 * qe / S0.gdp + 0.5 * dt * Math.max(0, -(S.policy - S.piY)) + K.kGoldFlow * toGold / goldLevel0 + 0.035 * noise.gold, -0.15, 0.2);
  S.goldPrice = S0.goldPrice * (1 + goldRet);
  S.Gh.push(S.goldPrice); S.Gh.shift();
  const cashRet = Math.max(0, S.policy - 0.003) * dt;
  S.cashPrice = S0.cashPrice * (1 + cashRet);

  // 12. money accounting
  const qt = 0;   // no QT rule yet (reserved: water drained by the central bank selling bonds)
  S.M = S0.M + newLoans - principalRepay + fiscalInjection - fiscalDrain + qe - qt;

  // 13. fiscal metrics after output
  S.i2t = interest_a / taxes_a;
  S.deficitGdp = deficit_a / S.gdp;
  S.gdpH.push(S.gdp); S.gdpH.shift();
  S.dsrH.push(S.dsr); S.dsrH.shift();
  S.polH.push(S.policy); S.polH.shift();

  // 14. credit impulse
  const flowRatio = 4 * (newLoans - principalRepay) / S.gdp;
  S.flowRatio = flowRatio;
  S.sm = 0.5 * S0.sm + 0.5 * flowRatio;
  S.impulse = S.sm - S0.smH[0];
  S.smH = [S0.smH[1], S.sm];

  // flows block
  const wages = WS * S.gdp * dt, profits = Math.max(0, S.profit) * dt, taxesQ = taxes_a * dt;
  S.flows = {
    newLoans, principalRepay, interestPaid: intDebtQ, fiscalInjection, qe,
    toHousing, toFinancial, toEquity, toBond, toGold, toConsumption, toCapex, toCash,
    wages, profits, taxes: taxesQ, spillToGoods: consCredit + capex_q,
    fiscalDrain, govSurplusDrain: fiscalDrain, qt, writeoff, bankRecap: dec.recap,
    // cash-flow springs (pipes: only move water)
    rent: rent * dt, dividends: 0.02 * S0.eqCap * dt, coupons: interest_a * dt,
    // fiscal branches (accounting only): govPurchases + transfers + coupons - taxes = deficit_q (full deficit; fiscalInjection = fInj * max(0, deficit_q) is the part counted as NEW water)
    govPurchases: govPurchases_a * dt, transfers: transfers_a * dt,
  };

  // view for the next quarter / detectors
  S.v = makeView(S, K);

  // ledger: exogenous shock events
  const entries = dec.entries.slice();
  if (ex.shock > 0.01 && S0.shock <= 0.01)
    entries.push({ date: dateOf(S, S.t), player: 'firm', observe: `外生输入：真实实际 GDP 同比大幅收缩（冲击强度 ${pct(ex.shock)}）`, rule: '外生冲击（数据驱动）：产能受限 + 需求骤降', action: `有效产能 -${pct(S.capLoss)}，名义需求冲击 -${pct(1.5 * ex.shock)}`, immediate: '产出与就业下降', delayed: '产能恢复慢于需求时，价格压力上升' });
  if (Math.abs(ex.oilYoY) > 0.5 && Math.abs(S0.oilFlag || 0) < 0.5)
    entries.push({ date: dateOf(S, S.t), player: 'foreign', observe: `外生输入：油价同比 ${ex.oilYoY > 0 ? '+' : ''}${pct(ex.oilYoY)}`, rule: '外生冲击（数据驱动）：油价', action: `供给侧价格推力 ${pp(oilPush)}`, immediate: '成本推动型通胀', delayed: '若央行加息过度，会压低需求而非产能' });
  S.oilFlag = ex.oilYoY;

  // ---------------- snapshot pieces
  const causal = {
    'assets.housing.ret': [
      { factor: '收入增长（基本面漂移）', contribution: dlnInc },
      { factor: '基本面回归（收入×利率×信贷可得性）', contribution: revert },
      { factor: '估值过高回拉（房价/收入）', contribution: valPull },
      { factor: '价格动量', contribution: mom },
      { factor: '新增住房信贷净流入', contribution: creditPush },
      { factor: '被迫出售', contribution: -forced },
      { factor: '租金收益', contribution: rentYield * dt * 0.8 },
      ...(Math.abs(clampRes) > 1e-9 ? [{ factor: '单季涨跌幅上限', contribution: clampRes }] : []),
      { factor: '对数→简单收益', contribution: housingRet - (hrC + rentYield * dt * 0.8) },
    ],
    'assets.equity.ret': [
      { factor: '盈利变化', contribution: S.earnIdx / S0.earnIdx - 1 },
      { factor: '折现率/风险溢价→估值回归', contribution: peRev / S0.pe },
      { factor: '估值动量', contribution: peMom / S0.pe },
      { factor: '新增资金/QE 流入', contribution: peFlow / S0.pe },
      { factor: '随机情绪（seeded）', contribution: peNoise / S0.pe },
      { factor: '股息', contribution: 0.02 * dt },
      { factor: '交叉项', contribution: eqRet - ((S.earnIdx / S0.earnIdx - 1) + (peRev + peMom + peFlow + peNoise) / S0.pe + 0.02 * dt) },
    ],
    'macro.inflation': [
      { factor: '通胀预期锚', contribution: 0.5 * S0.piE },
      { factor: '需求超过产能（缺口）', contribution: 0.5 * gapTerm },
      { factor: '油价/供给冲击', contribution: 0.5 * oilPush },
      { factor: '上季惯性（粘性）', contribution: 0.5 * S0.pi },
    ],
  };
  const cutH = demH - nlH0;
  const lvrBinds = lvrCap <= dsrCap;
  causal['flows.newLoans'] = [
    { factor: '借款需求（家庭+企业）', contribution: demH + nlF0 },
    { factor: 'LVR 抵押品约束', contribution: lvrBinds ? -cutH : 0 },
    { factor: 'DSR 偿债约束', contribution: lvrBinds ? 0 : -cutH },
    { factor: '银行资本约束', contribution: tot0 * (scale - 1) },
    { factor: '银行审批倍数', contribution: tot0 * scale * (S.approval - 1) },
  ];
  const extra = { housingRet, eqRet, bondRet, goldRet, cashRet, rentYield, causal, entries, rent, capEff, demH, lvrCap, dsrCap, capCap, nlH0, alloc: dec.alloc, riskoff: dec.riskoff, borrowMult: dec.borrowMult, saveAdj: dec.saveAdj, nlH: NLh, outH: S0.Dh + NLh - S.Dh };
  return { S, extra };
}

// ---------------------------------------------------------------- snapshot
export function buildSnapshot(S, K, extra, branch, base = null) {   // base: previous snapshot of the SAME quarter (town actions rebuild in place)
  const v = S.v;
  const infl = S.piY;
  let lamps, ring, pauses, cycles;
  if (base) { lamps = base.lights; ring = base.ring; pauses = base.pauses; cycles = base.cycles; }
  else {
    lamps = computeLamps(v);
    ring = detectRing(v, S.ringProbs);
    S.ringProbs = ring.probs; S.ringStage = ring.stage;
    // two dials (long / short debt cycle): state machine carried in S.cyc (replaced, never mutated)
    const cy = advanceCycles(S.cyc || null, {
      ...v, pvt: (S.Dh + S.Df) / S.gdp, gov: S.Dg / S.gdp, qeGdp: S.qeStock / S.gdp, defGdp: S.deficitGdp ?? 0,
      gap: S.Y / (S.Ystar * (1 - S.capLoss)) - 1,
    }, S.t, dateOf(S, S.t));
    S.cyc = cy.state; cycles = cy.out;
    pauses = S.t > 0 ? detectPauses(v, S.mem, S.t, S.scenario === 'town' ? [] : cy.events) : [];
  }
  const f = S.flows || zeroFlows(S);
  // water budget: pumps create water, drains destroy it, pipes (everything else) only move it. Exact identity: M_after - M_before = net
  const pumpedIn = { loans: S.flows ? f.newLoans : 0, qe: S.flows ? f.qe : 0, deficit: S.flows ? f.fiscalInjection : 0 };
  const drainedOut = { repay: S.flows ? f.principalRepay : 0, surplus: S.flows ? f.govSurplusDrain : 0, qt: S.flows ? f.qt : 0 };
  const net = pumpedIn.loans + pumpedIn.qe + pumpedIn.deficit - drainedOut.repay - drainedOut.surplus - drainedOut.qt;
  const wo = S.flows ? f.writeoff || 0 : 0;
  const budget = { pumpedIn, drainedOut, net, M_before: S.Mstart, M_after: S.M,
    iouChange: pumpedIn.loans - drainedOut.repay - wo, writeoff: wo };
  const iou = { household: S.Dh, firm: S.Df, bankTotal: S.Dh + S.Df };
  const qoqInfl = S.t > 0 ? S.Ph[4] / S.Ph[3] - 1 : S.pi * DT;
  const real = r => (1 + r) / (1 + qoqInfl) - 1;
  const e = extra || {};
  const hr = nz(e.housingRet, 0.01), er = nz(e.eqRet, 0.01), br = nz(e.bondRet, 0.01), gr = nz(e.goldRet, 0.01), cr = nz(e.cashRet, 0.01);
  const rentYield = nz(e.rentYield, 0.05);
  const bondPx = S.bondPrice;
  return {
    t: S.t, date: dateOf(S, S.t), branch,
    macro: { gdpNominal: S.gdp, realOutput: S.Y, capacity: S.Ystar * (1 - S.capLoss), outputGap: S.Y / (S.Ystar * (1 - S.capLoss)) - 1,
      priceLevel: S.P * 100, inflation: infl, inflationExp: S.piE, unemployment: S.u, demandPressure: v.pressure, capacityPotential: S.Ystar },
    rates: { policy: S.policy, mortgageEff: S.mortEff, mortgageNew: S.mortNew, gov10y: S.gov10y, riskPremium: S.rp, realPolicy: S.policy - infl },
    money: { M: S.M },
    debt: { household: S.Dh, firm: S.Df, government: S.Dg },
    bank: { capitalRatio: S.E / (S.Dh + S.Df), approval: S.approval, badLoanRate: S.bad },
    household: { income: S.inc, dsr: S.dsr, lvr: S.lvr, consumption: (1 - S.sav) * S.inc, savingRate: S.sav },
    firm: { profit: S.profit, capex: S.capex, capexPipeline: S.pipeline.slice() },
    gov: { spending: S.govSpend, spendingGross: S.taxes + S.deficit, taxes: S.taxes, deficit: S.deficit, interest: S.interest, interestToTax: S.i2t, debtGdp: S.Dg / S.gdp },
    assets: {       // level = market value of the whole sub-pool (water volume), same units as M
      cash: { price: S.cashPrice, ret: cr, realRet: real(cr), level: S.M },
      bond: { price: bondPx, ret: br, realRet: real(br), yield: S.gov10y, level: K.bondShare * S.Dg * bondPx / 100, totalReturnIndex: S.bondTR, yieldParts: { ...S.yParts } },
      equity: { price: S.eqPrice, ret: er, realRet: real(er), pe: S.pe, level: S.eqCap },
      housing: { price: S.H, ret: hr, realRet: real(hr), priceToIncome: v.PI, rentYield, level: S.HV },
      gold: { price: S.goldPrice, ret: gr, realRet: real(gr), level: K.gold0 * S.goldPrice / 100, distrust: S.distrust },
    },
    flows: { ...f },
    budget, iou,
    scenario: S.scenario || 'us',
    lights: lamps,
    ring, cycles,
    ledger: (e.entries || []).map(x => ({ ...x })),
    pauses,
    causal: e.causal || {},
    extra: { creditImpulse: S.impulse, qeStock: S.qeStock, qeOn: S.qeOn, fiscalAdj: S.adj, capacityLoss: S.capLoss, houseYoY: v.hpYoY, creditGrowth: v.pcg, distrust: S.distrust,
      alloc: e.alloc ? { ...e.alloc } : null, riskoff: !!e.riskoff,
      capexMult: S.capexMult, borrowMult: nz(e.borrowMult, 1), saveAdj: nz(e.saveAdj, 0) },
  };
}

function zeroFlows(S) {
  const B = S.Dh + S.Df;
  const nl = (0.05 + 0.04) * B * DT, rep = 0.04 * B * DT;
  return { newLoans: nl, principalRepay: rep, interestPaid: 0.075 * B * DT, fiscalInjection: 0.5 * S.deficit * DT, qe: 0,
    toHousing: nl * 0.5, toFinancial: nl * 0.1, toEquity: nl * 0.06, toBond: nl * 0.03, toGold: nl * 0.01, toConsumption: nl * 0.25, toCapex: nl * 0.1, toCash: nl * 0.05,
    wages: WS * S.gdp * DT, profits: S.profit * DT, taxes: S.taxes * DT, spillToGoods: nl * 0.3, fiscalDrain: 0, govSurplusDrain: 0, qt: 0, writeoff: 0,
    rent: 0, dividends: 0, coupons: S.interest * DT, govPurchases: 0, transfers: 0 };
}
