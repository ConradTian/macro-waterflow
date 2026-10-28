// Detection layer: lamps, Dalio ring stage (probabilities), auto-pause triggers.
// Everything here READS state; nothing here feeds back into prices or flows.

const sig = x => 1 / (1 + Math.exp(-x));
const pct = x => (x * 100).toFixed(1) + '%';

export function computeLamps(v) {
  const lv = (val, y, r, dir = 1) => {
    const x = val * dir;
    return x >= r * dir * dir ? 'red' : x >= y * dir * dir ? 'yellow' : 'green';
  };
  // credit: impulse (change in net new credit / GDP)
  const ci = v.ci;
  const credit = {
    level: ci < -0.015 ? 'red' : (ci < -0.003 || ci > 0.03) ? 'yellow' : 'green',
    value: ci, label: '信贷脉冲', driver: `净新增信贷/GDP 变化 ${pct(ci)}（新贷款-还本）`,
  };
  const debtService = {
    level: v.dsr >= v.dsr0 + 0.04 ? 'red' : v.dsr >= v.dsr0 + 0.02 ? 'yellow' : 'green',
    value: v.dsr, label: 'DSR 偿债率', driver: `家庭还本付息/收入 ${pct(v.dsr)}，坏账率 ${pct(v.bad)}`,
  };
  const rp = v.realP;
  const policy = {
    level: (rp < -0.015 || rp > 0.04) ? 'red' : (rp < 0.002 || rp > 0.025) ? 'yellow' : 'green',
    value: rp, label: '实际政策利率', driver: `政策利率 ${pct(v.policy)} - 通胀 ${pct(v.piY)}`,
  };
  const val = Math.max(v.PIrel, v.peRel);
  const valuation = {
    level: val >= 1.35 ? 'red' : val >= 1.15 ? 'yellow' : 'green',
    value: v.PI, label: '房价/收入', driver: `房价/收入 ${v.PI.toFixed(2)}（起点 4.00），股票 P/E 相对起点 ${v.peRel.toFixed(2)}x`,
  };
  return { credit, debtService, policy, valuation };
}

const STAGES = ['', '① 借钱扩张', '② 资产缓冲池装满', '③ 岔路口（B1/B2）', '④ 降息尝试重启信用',
  '⑤ 私人借不动、转向还债', '⑥ 政府接手、央行支持', '⑦ 化债 / 金融压制', '⑧ 偿债压力下降、资产负债表修复'];
const NEXT = {
  1: '若房价同比 >5% 且信贷持续增长 → 进入 ②',
  2: '若通胀 >3.5% 且政策利率上行 → B1；若房价转跌且信贷脉冲转负 → B2（均进入 ③）',
  3: '若降息后信贷仍不恢复 → ⑤；若降息重启信贷 → 回到 ①',
  4: '观察新贷款与 DSR：信贷回升 → ①；DSR 仍高、坏账上升 → ⑤',
  5: '若财政支出扩大且 QE 启动 → ⑥',
  6: '若名义增长 > 国债收益率且实际利率偏低 → ⑦',
  7: '若 DSR 回落到起点附近、坏账低 → ⑧',
  8: '若信贷重新增长 → 回到 ①',
};

export function detectRing(v0, prevProbs) {
  const s = new Array(9).fill(0);
  const v = { ...v0, hpY: v0.hpYoY };
  const dsrHigh = sig((v.dsr - v.dsr0 - 0.02) / 0.008);
  s[1] = sig((v.pcg - 0.02) / 0.015) * sig((0.06 - v.hpY) / 0.03) * sig((v.dsr0 + 0.025 - v.dsr) / 0.01) * sig((0.035 - v.piY) / 0.01);
  s[2] = sig((v.pcg - 0.02) / 0.015) * Math.max(sig((v.hpY - 0.05) / 0.03), sig((v.PIrel - 1.15) / 0.08)) * sig((0.045 - v.piY) / 0.01);
  const b1 = sig((v.piY - 0.035) / 0.008) * sig((v.dPol4 - 0.005) / 0.007);
  const b2 = sig((-v.hpY - 0.01) / 0.02) * sig((-v.ci - 0.002) / 0.004) * sig((v.dsr - v.dsr0 - 0.01) / 0.01);
  s[3] = Math.max(b1, b2);
  s[4] = sig((-v.dPol4 - 0.01) / 0.01) * sig((0.03 - v.pcg) / 0.02) * sig((v.u - 0.05) / 0.01);
  s[5] = sig((0.01 - v.pcg) / 0.012) * Math.max(sig((v.bad - 0.035) / 0.01), dsrHigh);
  s[6] = Math.max(sig((v.adj - 0.02) / 0.01), v.qeOn ? 0.85 : 0) * sig((0.02 - v.pcg) / 0.02);
  s[7] = sig(v.gr / 0.01) * sig((0.012 - v.realP) / 0.01) * sig((-v.dDsr4 + 0.002) / 0.004) * sig((0.04 - v.piY) / 0.01);
  s[8] = sig((v.dsr0 + 0.01 - v.dsr) / 0.01) * sig((0.03 - v.bad) / 0.01) * sig((v.pcg - 0.005) / 0.01) * sig((0.04 - v.piY) / 0.01) * sig((-v.dDsr4 + 0.004) / 0.006);
  let raw = new Array(9).fill(0), tot = 0;
  for (let i = 1; i <= 8; i++) { raw[i] = Math.exp(6 * s[i]); tot += raw[i]; }
  const probs = {};
  let best = 1, bp = -1;
  for (let i = 1; i <= 8; i++) {
    const p = prevProbs ? 0.6 * (prevProbs[i] ?? 0) + 0.4 * raw[i] / tot : raw[i] / tot;
    probs[i] = p;
    if (p > bp) { bp = p; best = i; }
  }
  for (let i = 1; i <= 8; i++) probs[i] = Math.round(probs[i] * 1000) / 1000;
  let fork = null;
  if (best === 3) fork = b1 >= b2 ? 'B1' : 'B2';
  return { stage: best, fork, probs, label: STAGES[best] + (fork ? `（${fork}）` : ''), nextSignal: NEXT[best] };
}

// Auto-pause triggers with edge detection + cooldown. `mem` is mutated (it lives in branch state).
export function detectPauses(v, mem, t, stage) {
  const out = [];
  const fire = (code, message, cooldown) => {
    if (t < 8) return;
    if (mem.last[code] != null && t - mem.last[code] < cooldown) return;
    mem.last[code] = t;
    out.push({ code, message });
  };
  const outBand = v.piY > 0.035 || v.piY < 0.005;
  if (outBand && !mem.outBand) fire('CPI_BAND', `通胀 ${pct(v.piY)} 突破目标区间 [0.5%, 3.5%]`, 6);
  mem.outBand = outBand;
  const sgn = Math.abs(v.ci) > 0.004 ? Math.sign(v.ci) : 0;
  if (sgn !== 0) {
    if (mem.ciSign !== 0 && mem.ciSign !== sgn) fire('CREDIT_IMPULSE_FLIP', `信贷脉冲转${sgn < 0 ? '负' : '正'}（${pct(v.ci)}）`, 6);
    mem.ciSign = sgn;
  }
  const falling = v.hpQ < 0 && v.hpQPrev < 0;
  if (falling && !mem.falling) fire('HOUSE_FALLING', `房价连续两个季度下跌（本季 ${pct(v.hpQ)}）`, 8);
  mem.falling = falling;
  const dsrRed = v.dsr >= v.dsr0 + 0.04;
  if (dsrRed && !mem.dsrRed) fire('DSR_HIGH', `家庭 DSR ${pct(v.dsr)} 超过警戒线（起点+4pp）`, 8);
  mem.dsrRed = dsrRed;
  const capLow = v.capR < 0.075;
  if (capLow && !mem.capLow) fire('BANK_CAPITAL_LOW', `银行资本充足率 ${pct(v.capR)} 接近监管下限`, 8);
  mem.capLow = capLow;
  const i2t = v.i2t > 0.25;
  if (i2t && !mem.i2t) fire('GOV_INTEREST', `政府利息/税收 ${pct(v.i2t)} 偏高`, 8);
  mem.i2t = i2t;
  if (mem.stage != null && stage !== mem.stage) fire('RING_STAGE', `Dalio 环阶段变化：${STAGES[mem.stage]} → ${STAGES[stage]}`, 4);
  mem.stage = stage;
  return out;
}
export { STAGES };
