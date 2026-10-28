// Economy: seed, player decisions (rule-driven), quarterly settlement, snapshot builder.
// State S is a flat plain object; K holds seed-calibrated constants (immutable).
import { RULE_BY_ID } from './rules.js';
import { computeLamps, detectRing, detectPauses } from './regimes.js';

export const DT = 0.25;
export const WS = 0.66;          // labour-income share of nominal GDP
export const USTAR = 0.055;      // natural unemployment (neutral)
export const TARGET = 0.02;      // inflation target
const MORT_SHARE = 0.8;          // mortgage share of household debt
const REG_TARGET = 0.075;        // capital ratio banks aim to hold (lending headroom)
const clamp = (x, a, b) => Math.min(b, Math.max(a, x));
const pct = x => (x * 100).toFixed(1) + '%';
const pp = x => (x * 100).toFixed(2) + '%';
const nz = (x, d) => (x == null || Number.isNaN(x) ? d : x);

export function qLabel(t) { return `${1995 + Math.floor(t / 4)}Q${(t % 4) + 1}`; }

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
    // a collapse of real output beyond a normal recession (-3%) is treated as a combined supply+demand shock
    shock: g != null ? Math.max(0, -0.03 - g) : 0,
    inData: t < n,
  };
}

// ---------------------------------------------------------------- seed
export function seed(data) {
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
  };
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
    adj: 0, capexMult: 1, pressure: 0,
    taxes: K.tau0 * gdp0, govSpend: K.gr0 * gdp0, interest: Dg * gov10y0, deficit: Dg * gov10y0, i2t: Dg * gov10y0 / (K.tau0 * gdp0),
    deficitGdp: Dg * gov10y0 / gdp0, profit: 0.10 * gdp0, capex: K.c0 * gdp0, dsr: dsr0, lvr: MORT_SHARE * Dh / K.HV0,
    Ph: new Array(5).fill(P), Hh: new Array(5).fill(100), Eh: new Array(5).fill(100), gdpH: new Array(5).fill(gdp0),
    dsrH: new Array(5).fill(dsr0), polH: new Array(5).fill(policy0), hpQPrev: 0,
    ringProbs: null, ringStage: 1, mem: { last: {}, outBand: false, ciSign: 0, falling: false, dsrRed: false, capLow: false, i2t: false, stage: null },
    flows: null, wealthPrev: K.HV0 + K.mkt0,
  };
  S.v = makeView(S, K);
  return { S, K, p0 };
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
    bad: S.bad, capR: S.E / B, u: S.u, adj: S.adj, qeOn: S.qeOn, gr: (S.t >= 4 ? gdpYoY : 0.04) - S.gov10y,
    PI: 4 * (S.H / 100) / (S.inc / K.inc0), PIrel: (S.H / 100) / (S.inc / K.inc0), peRel: S.pe / K.pe0,
    realP: S.policy - piY, policy: S.policy, dPol4: S.policy - S.polH[0], i2t: S.i2t, lvr: S.lvr,
  };
  return v;
}

// ---------------------------------------------------------------- decisions
function mkEntry(S, player, ruleId, observe, ruleText, action, extra = {}) {
  const r = RULE_BY_ID[ruleId] || {};
  return {
    date: qLabel(S.t + 1), player, observe, rule: ruleText ?? r.text, action,
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
    const tgt = p.rStar + v.piY + p.wInfl * (v.piY - p.target) + p.wGap * gap;
    const move = clamp(p.smooth * (tgt - S.policy), -p.maxMove, p.maxMove);
    return { policy: Math.max(p.floor, S.policy + move), ruleId: 'cb_taylor', target: tgt, text: null };
  }
  return { policy: S.policy, ruleId: null, text: '无规则：维持政策利率' };
}

export function decideAll(S, K, ex, env) {
  const v = S.v, en = env.en, P = env.P, entries = [];
  const user = env.user;
  const ud = pl => (user && user.player === pl ? user.dec[pl] || {} : null);
  const dec = {};

  // ---- central bank
  {
    const rb = ruleBasedPolicy(S, K, ex, env);
    let policy = rb.policy, ruleId = rb.ruleId, ruleText = null, usr = ud('centralBank');
    if (usr && usr.policyRate != null) { policy = clamp(usr.policyRate, 0, 0.2); ruleId = 'user'; ruleText = '用户接管央行：手动设定政策利率'; }
    else if (usr && usr.policyRate == null) { policy = rb.policy; }
    if (Math.abs(policy - S.policy) >= 0.0024) {
      const obs = `通胀 ${pct(v.piY)}，失业率 ${pct(S.u)}，产出缺口压力 ${pct(v.pressure)}`;
      const rtxt = ruleText ?? (ruleId === 'cb_taylor' ? `泰勒规则目标 ${pp(rb.target)}，平滑后调整` : rb.text ?? RULE_BY_ID[ruleId]?.text);
      entries.push(mkEntry(S, 'centralBank', ruleId === 'user' ? 'cb_taylor' : ruleId, obs, rtxt, `政策利率 ${pp(S.policy)} → ${pp(policy)}`,
        ruleId === 'user' ? { immediate: '新贷款定价改变', delayed: '存量房贷分批重定价后影响 DSR' } : {}));
    }
    // QE
    let qeOn = S.qeOn;
    if (en('cb_qe')) {
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
          const na = Math.min(p.max, adj + p.ramp);
          entries.push(mkEntry(S, 'government', 'gov_stimulus', `失业率 ${pct(S.u)}（较近 2 年低点 +${pct(S.u - uMin)}），需求缺口 ${pct(v.pressure)}`, null, `财政注入 ${pct(adj)} → ${pct(na)} GDP/年`));
          adj = na;
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
      const tc = en('bank_tighten_collateral') && v.hpYoY < P('bank_tighten_collateral').hp && v.lvr > P('bank_tighten_collateral').lvr;
      const lo = en('bank_loosen') && v.hpYoY > P('bank_loosen').hp && v.bad < P('bank_loosen').bad && v.capR > P('bank_loosen').cap;
      let na = ap, rid = null;
      if (tl) { const p = P('bank_tighten_losses'); na = Math.max(p.min, ap - p.step); rid = 'bank_tighten_losses'; }
      else if (tc) { const p = P('bank_tighten_collateral'); na = Math.max(0.4, ap - p.step); rid = 'bank_tighten_collateral'; }
      else if (lo) { const p = P('bank_loosen'); na = Math.min(p.max, ap + p.step); rid = 'bank_loosen'; }
      else if (en('bank_loosen') || en('bank_tighten_losses') || en('bank_tighten_collateral')) na = ap + 0.03 * (1 - ap);
      else na = 1;
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
    let bm = 1, sa = 0;
    const usr = ud('household');
    if (usr && usr.borrowMult != null) bm = clamp(usr.borrowMult, 0.3, 1.8);
    else {
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
      entries.push(mkEntry(S, 'household', usr ? 'hh_chase' : (p && en('hh_deleverage') ? 'hh_deleverage' : 'hh_chase'),
        `房价同比 ${pct(v.hpYoY)}，DSR ${pct(v.dsr)}，失业率 ${pct(S.u)}`, usr ? '用户接管家庭' : null, `借款需求 ×${bm.toFixed(2)}${sa ? `，储蓄率 +${pct(sa)}` : ''}`));
    }
    dec.borrowMult = bm; dec.saveAdj = sa;
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
  {
    let wH = 1, wF = 1, wC = 0.6, note = [];
    if (en('inv_momentum')) {
      const k = P('inv_momentum').k;
      wH = Math.exp(k * clamp(v.hpYoY, -0.3, 0.3)); wF = Math.exp(k * clamp(v.eqYoY, -0.4, 0.4));
      if (v.hpYoY > 0.08 || v.eqYoY > 0.15) note.push('inv_momentum');
    }
    if (en('inv_riskoff') && (S.rp > P('inv_riskoff').rp || v.ci < P('inv_riskoff').ci)) { wC *= 3; wF *= 0.7; wH *= 0.7; note.push('inv_riskoff'); }
    const tot = wH + wF + wC;
    dec.alloc = { h: wH / tot, f: wF / tot, c: wC / tot };
    const rid = note.includes('inv_riskoff') ? 'inv_riskoff' : note[0];
    if (rid) entries.push(mkEntry(S, 'investor', rid, `房价同比 ${pct(v.hpYoY)}，股价同比 ${pct(v.eqYoY)}，风险溢价 ${pct(S.rp)}，信贷脉冲 ${pct(v.ci)}`, null,
      `新增资金配置：房产 ${pct(dec.alloc.h)} / 金融资产 ${pct(dec.alloc.f)} / 现金 ${pct(dec.alloc.c)}`));
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
  for (const k of ['uHist', 'pipeline', 'Ph', 'Hh', 'Eh', 'gdpH', 'dsrH', 'polH', 'smH']) S[k] = S0[k].slice();
  S.mem = { ...S0.mem, last: { ...S0.mem.last } };
  const v0 = S0.v, dt = DT;
  S.t = S0.t + 1;
  const noise = (() => { const r = mulberry32(env.seed + S.t * 7919); return { eq: gauss(r), gold: gauss(r) }; })();

  // 1. policy, shocks, rates
  S.policy = dec.policy; S.qeOn = dec.qeOn;
  S.shock = Math.max(ex.shock, 0.6 * S0.shock); // shock level fades over ~4 quarters
  S.capLoss = Math.max(S0.capLoss * 0.9, 0.6 * ex.shock);
  const demandShockF = (1 - 1.5 * S.shock) / (1 - 1.5 * S0.shock);
  const qe = dec.qeSize;
  S.qeStock = S0.qeStock + qe;
  S.emaPolicy = S0.emaPolicy + 0.12 * (S.policy - S0.emaPolicy);
  const fiscalRisk = 0.08 * Math.max(0, S0.i2t - 0.2);
  S.gov10y = clamp(0.55 * S.emaPolicy + 0.45 * (S0.piE + 0.02) + 0.008 + fiscalRisk + dec.termAdd - Math.min(0.012, 0.15 * S.qeStock / S0.gdp), 0.005, 0.15);
  const rpT = 0.04 + Math.max(0, S0.bad - 0.015) + 1.2 * Math.max(0, -S0.impulse) + 0.15 * Math.max(0, S0.u - 0.06) - 0.03 * S.qeStock / S0.gdp;
  S.rp = clamp(S0.rp + 0.4 * (rpT - S0.rp), 0.025, 0.11);
  S.approval = dec.approval; S.capexMult = dec.capexMult; S.adj = dec.adj;
  const mAdj = 0.015 * (1 - S.approval) + 0.2 * Math.max(0, S0.bad - 0.02);
  S.mortNew = 0.75 * (S.gov10y + K.spread) + 0.25 * (S.policy + 0.035) + mAdj; // 25% floating-rate / short-reset share
  S.mortEff = S0.mortEff + 0.10 * (S.mortNew - S0.mortEff);
  const firmNew = 0.5 * S.gov10y + 0.5 * S.policy + 0.02 + 0.1 * Math.max(0, S0.bad - 0.02);
  S.firmEff = S0.firmEff + 0.15 * (firmNew - S0.firmEff);
  S.govEff = S0.govEff + 0.06 * (S.gov10y - S0.govEff);
  const rFirmReal = S.firmEff - S0.piE;

  // 2. saving, income
  const inc = WS * S0.gdp;
  const sT = clamp(K.s0 + 1.0 * (S0.u - USTAR) + 0.2 * (S.policy - S0.piY - 0.01) + dec.saveAdj, 0.01, 0.2);
  S.sav = S0.sav + 0.5 * (sT - S0.sav);

  // 3. credit: min(demand, LVR cap, DSR cap, capital cap) x approval
  const hpY = v0.hpYoY;
  const demHr = clamp(K.a0 + 0.25 * hpY - 0.8 * ((S.mortNew - S0.piE) - K.realMort0), 0.04, 0.15);
  const demH = inc * demHr * dec.borrowMult * dt;
  const HV0prev = K.HV0 * S0.H / 100;
  const lvrMax = 0.46 + 0.10 * (S.approval - 1);
  const lvrCap = Math.max(0, lvrMax * HV0prev - MORT_SHARE * S0.Dh) * 0.3;
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
  const NLh = nlH0 * scale * S.approval, NLf = nlF0 * scale * S.approval;
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
  S.E = Math.max(0.01 * B1, S0.E + net - payout * Math.max(0, net));

  // 4. fiscal
  const tauR = K.tau0 - 0.8 * (S0.u - USTAR) * K.tau0 * 1.0;
  const taxes_a = tauR * S0.gdp;
  const primaryRatio = K.gr0 + S.adj + 0.4 * (S0.u - USTAR);
  const primary_a = primaryRatio * S0.gdp;
  const interest_a = S0.Dg * S.govEff;
  const deficit_a = interest_a + primary_a - taxes_a;
  const deficit_q = deficit_a * dt;
  S.Dg = S0.Dg + deficit_q;
  const fiscalInjection = Math.max(0, deficit_q) * K.fInj, fiscalDrain = Math.max(0, -deficit_q) * K.fInj;
  S.taxes = taxes_a; S.govSpend = primary_a + interest_a; S.interest = interest_a; S.deficit = deficit_a;

  // 5. capex pipeline and capacity
  const capexShare = clamp((K.c0 + 0.4 * clamp(v0.pressure, -0.1, 0.1) - 0.6 * (rFirmReal - K.rfr0)) * S.capexMult, 0.08, 0.20);
  const capex_q = capexShare * S0.gdp * dt;
  S.pipeline.push(capex_q / S0.P);
  const completed = S.pipeline.shift();
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
  const toFinancial = 0.75 * base.f + 0.25 * A * dec.alloc.f;
  const toCash = 0.75 * base.c + 0.25 * A * dec.alloc.c;
  const consCredit = NLh * consShare;
  const toConsumption = consCredit + fiscalInjection * 0.6;
  const toCapex = NLf * 0.6 + fiscalInjection * 0.25;

  // 7. aggregate demand (credit-impulse form: growth = baseline + changes in credit-funded spending ratios)
  const intDebtQ = (S.mortEff + K.alphaH) * S0.Dh * dt + (S.firmEff + K.alphaF) * S0.Df * dt;
  const dsRatio = 4 * intDebtQ / S0.AD;
  const HVnew = null; // placeholder (computed after housing); wealth effect uses last quarter change to avoid simultaneity
  const wealthSpend = 0.015 * (S0.HV + S0.eqCap - S0.wealthPrev);
  const spendRatio = 4 * (0.5 * consCredit + capex_q + primary_a * dt + wealthSpend) / S0.AD;
  const nxRatio = dec.nx;
  const d = (a, b) => (b == null ? 0 : a - b);
  const gNom = K.gBase * dt + d(spendRatio, S0.spendRatio) - 0.5 * d(dsRatio, S0.dsRatio) + d(nxRatio, S0.nxRatio) - WS * (S.sav - S0.sav) - 0.5 * v0.pressure * dt;
  S.spendRatio = spendRatio; S.dsRatio = dsRatio; S.nxRatio = nxRatio;
  S.AD = S0.AD * (1 + gNom) * demandShockF;

  // 8. price and output
  const capEff = S.Ystar * (1 - S.capLoss);
  const Dreal = S.AD / S0.P;
  const pressure = Dreal / capEff - 1;
  S.pressure = pressure;
  const oilPush = 0.012 * clamp(ex.oilYoY, -0.5, 1.2);
  const gapTerm = pressure > 0 ? 0.30 * pressure : 0.12 * pressure;
  const raw = S0.piE + gapTerm + oilPush;
  S.pi = 0.5 * S0.pi + 0.5 * raw;
  S.P = S0.P * (1 + S.pi * dt);
  S.Y = Math.min(S.AD / S.P, capEff);
  S.gdp = S.P * S.Y;
  S.Ph.push(S.P); S.Ph.shift();
  S.piY = S.t >= 4 ? S.P / S.Ph[0] - 1 : S.pi;
  S.piE = S0.piE + 0.08 * (S.piY - S0.piE) + 0.03 * (TARGET - S0.piE);
  const slack = 1 - S.Y / S.Ystar;
  const uT = USTAR - 0.15 * clamp(pressure, 0, 0.08) + 0.5 * Math.max(0, slack);
  S.u = S0.u + 0.35 * (uT - S0.u);
  S.uHist.push(S.u); S.uHist.shift();
  S.inc = WS * S.gdp; S.incPrev = S0.inc;

  // 9. profits, bad loans, DSR, LVR
  S.profit = S.gdp * (0.13 + 0.6 * clamp(pressure, -0.1, 0.1)) - S.firmEff * S.Df;
  S.dsr = (S.mortEff + K.alphaH) * S.Dh / S.inc;
  // 10. housing
  const y = Math.max(0.025, S.mortNew - S0.piE + 0.01);
  const Hfund = 100 * (S.inc / K.inc0) * Math.pow(K.y0 / y, 0.45);
  const HVprev = HV0prev;
  const dlnInc = Math.log(S.inc / S0.inc);
  const revert = 0.04 * Math.log(Hfund / S0.H);
  const mom = 0.3 * S0.Hret;
  const creditPush = 0.4 * (toHousing - MORT_SHARE * repayH) / HVprev - 0.0025;
  const forced = 3.0 * Math.max(0, S0.badH - 0.02) * dt + 0.15 * Math.max(0, S0.lvr - 0.45) * dt;
  const rentYield0 = K.rent0 * (S0.inc / K.inc0) / HVprev;
  let hr = dlnInc + revert + mom + creditPush - forced;
  const hrC = clamp(hr, -0.07, 0.05);
  const clampRes = hrC - hr;
  S.Hret = hrC;
  S.hpQPrev = S0.Hret;
  S.H = S0.H * Math.exp(hrC);
  S.Hh.push(S.H); S.Hh.shift();
  S.HV = K.HV0 * S.H / 100;
  S.lvr = MORT_SHARE * S.Dh / S.HV;
  const rent = K.rent0 * (S.inc / K.inc0);
  const rentYield = rent / S.HV;
  const housingRet = (Math.exp(hrC) - 1) + rentYield * dt * 0.8;

  // bad-loan dynamics
  const badHt = 0.012 + 0.35 * Math.max(0, S.dsr - K.dsr0) + 0.4 * Math.max(0, S.lvr - 0.40) + 0.3 * Math.max(0, S.u - 0.06);
  const badFt = 0.012 + 0.3 * Math.max(0, S.u - 0.06) + 0.25 * Math.max(0, -pressure - 0.02);
  S.badH = 0.7 * S0.badH + 0.3 * badHt; S.badF = 0.7 * S0.badF + 0.3 * badFt;
  S.bad = (S.badH * S.Dh + S.badF * S.Df) / B1;

  // 11. equity, bond, gold, cash
  const profitQ = S.profit;
  S.earnIdx = 0.7 * S0.earnIdx + 0.3 * profitQ / K.profit0;
  const peF = 1 / Math.max(0.02, S.gov10y + S.rp - (S0.piE + 0.02));
  const peRev = 0.12 * (peF - S0.pe);
  const peMom = 0.35 * (S0.pe - S0.pePrev);
  const peFlow = S0.pe * toFinancial / S0.eqCap;
  const peNoise = S0.pe * 0.02 * noise.eq;
  S.pePrev = S0.pe;
  S.pe = clamp(S0.pe + peRev + peMom + peFlow + peNoise, 6, 45);
  S.eqPrice = 100 * S.earnIdx * S.pe / K.pe0;
  S.eqCap = K.mkt0 * S.eqPrice / 100;
  const eqPriceRet = S.eqPrice / S0.eqPrice - 1;
  const eqRet = eqPriceRet + 0.02 * dt;
  S.eqRet = eqPriceRet; S.Eh.push(S.eqPrice); S.Eh.shift();
  S.wealthPrev = S0.HV + S0.eqCap;
  const dy = S.gov10y - S0.gov10y;
  const bondRet = -7 * dy + S0.gov10y * dt;
  S.bondPrice = S0.bondPrice * (1 + bondRet); // total-return index
  S.real10y = S.gov10y - S.piE;
  const goldRet = clamp(S0.piE * dt - 3.0 * (S.real10y - S0.real10y) + 0.15 * (S.i2t - S0.i2t) + 0.3 * qe / S0.gdp + 0.5 * dt * Math.max(0, -(S.policy - S.piY)) + 0.035 * noise.gold, -0.15, 0.2);
  S.goldPrice = S0.goldPrice * (1 + goldRet);
  const cashRet = Math.max(0, S.policy - 0.003) * dt;
  S.cashPrice = S0.cashPrice * (1 + cashRet);

  // 12. money accounting
  S.M = S0.M + newLoans - principalRepay + fiscalInjection - fiscalDrain + qe;

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
    toHousing, toFinancial, toConsumption, toCapex, toCash,
    wages, profits, taxes: taxesQ, spillToGoods: consCredit + capex_q,
    fiscalDrain, writeoff,
  };

  // view for the next quarter / detectors
  S.v = makeView(S, K);

  // ledger: exogenous shock events
  const entries = dec.entries.slice();
  if (ex.shock > 0.01 && S0.shock <= 0.01)
    entries.push({ date: qLabel(S.t), player: 'firm', observe: `外生输入：真实实际 GDP 同比大幅收缩（冲击强度 ${pct(ex.shock)}）`, rule: '外生冲击（数据驱动）：产能受限 + 需求骤降', action: `有效产能 -${pct(S.capLoss)}，名义需求冲击 -${pct(1.5 * ex.shock)}`, immediate: '产出与就业下降', delayed: '产能恢复慢于需求时，价格压力上升' });
  if (Math.abs(ex.oilYoY) > 0.5 && Math.abs(S0.oilFlag || 0) < 0.5)
    entries.push({ date: qLabel(S.t), player: 'foreign', observe: `外生输入：油价同比 ${ex.oilYoY > 0 ? '+' : ''}${pct(ex.oilYoY)}`, rule: '外生冲击（数据驱动）：油价', action: `供给侧价格推力 ${pp(oilPush)}`, immediate: '成本推动型通胀', delayed: '若央行加息过度，会压低需求而非产能' });
  S.oilFlag = ex.oilYoY;

  // ---------------- snapshot pieces
  const causal = {
    'assets.housing.ret': [
      { factor: '收入增长（基本面漂移）', contribution: dlnInc },
      { factor: '房贷利率→基本面回归', contribution: revert },
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
  const extra = { housingRet, eqRet, bondRet, goldRet, cashRet, rentYield, causal, entries, rent, capEff, demH, lvrCap, dsrCap, capCap, nlH0 };
  return { S, extra };
}

// ---------------------------------------------------------------- snapshot
export function buildSnapshot(S, K, extra, branch) {
  const v = S.v;
  const infl = S.piY;
  const lamps = computeLamps(v);
  const ring = detectRing(v, S.ringProbs);
  S.ringProbs = ring.probs; S.ringStage = ring.stage;
  const pauses = S.t > 0 ? detectPauses(v, S.mem, S.t, ring.stage) : (S.mem.stage = ring.stage, []);
  const f = S.flows || zeroFlows(S);
  const qoqInfl = S.t > 0 ? S.Ph[4] / S.Ph[3] - 1 : S.pi * DT;
  const real = r => (1 + r) / (1 + qoqInfl) - 1;
  const e = extra || {};
  const hr = nz(e.housingRet, 0.01), er = nz(e.eqRet, 0.01), br = nz(e.bondRet, 0.01), gr = nz(e.goldRet, 0.01), cr = nz(e.cashRet, 0.01);
  const rentYield = nz(e.rentYield, 0.05);
  const bondPx = S.bondPrice;
  return {
    t: S.t, date: qLabel(S.t), branch,
    macro: { gdpNominal: S.gdp, realOutput: S.Y, capacity: S.Ystar * (1 - S.capLoss), outputGap: S.Y / (S.Ystar * (1 - S.capLoss)) - 1,
      priceLevel: S.P * 100, inflation: infl, inflationExp: S.piE, unemployment: S.u, demandPressure: v.pressure, capacityPotential: S.Ystar },
    rates: { policy: S.policy, mortgageEff: S.mortEff, mortgageNew: S.mortNew, gov10y: S.gov10y, riskPremium: S.rp, realPolicy: S.policy - infl },
    money: { M: S.M },
    debt: { household: S.Dh, firm: S.Df, government: S.Dg },
    bank: { capitalRatio: S.E / (S.Dh + S.Df), approval: S.approval, badLoanRate: S.bad },
    household: { income: S.inc, dsr: S.dsr, lvr: S.lvr, consumption: (1 - S.sav) * S.inc, savingRate: S.sav },
    firm: { profit: S.profit, capex: S.capex, capexPipeline: S.pipeline.slice() },
    gov: { spending: S.govSpend, taxes: S.taxes, deficit: S.deficit, interest: S.interest, interestToTax: S.i2t, debtGdp: S.Dg / S.gdp },
    assets: {
      cash: { price: S.cashPrice, ret: cr, realRet: real(cr) },
      bond: { price: bondPx, ret: br, realRet: real(br), yield: S.gov10y },
      equity: { price: S.eqPrice, ret: er, realRet: real(er), pe: S.pe },
      housing: { price: S.H, ret: hr, realRet: real(hr), priceToIncome: v.PI, rentYield },
      gold: { price: S.goldPrice, ret: gr, realRet: real(gr) },
    },
    flows: { ...f },
    lights: lamps,
    ring,
    ledger: (e.entries || []).map(x => ({ ...x })),
    pauses,
    causal: e.causal || {},
    extra: { creditImpulse: S.impulse, qeStock: S.qeStock, qeOn: S.qeOn, fiscalAdj: S.adj, capacityLoss: S.capLoss, houseYoY: v.hpYoY, creditGrowth: v.pcg },
  };
}

function zeroFlows(S) {
  const B = S.Dh + S.Df;
  const nl = (0.05 + 0.04) * B * DT, rep = 0.04 * B * DT;
  return { newLoans: nl, principalRepay: rep, interestPaid: 0.075 * B * DT, fiscalInjection: 0.5 * S.deficit * DT, qe: 0,
    toHousing: nl * 0.5, toFinancial: nl * 0.1, toConsumption: nl * 0.25, toCapex: nl * 0.1, toCash: nl * 0.05,
    wages: WS * S.gdp * DT, profits: S.profit * DT, taxes: S.taxes * DT, spillToGoods: nl * 0.3, fiscalDrain: 0, writeoff: 0 };
}
