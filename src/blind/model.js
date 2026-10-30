// 历史盲测: pure game logic (no DOM). Deck order, assets, scores, the bias profile. Node checkers import it too.
// Data: src/data/blind-cards.js (tools/BLIND-CONTRACT.md). Weights are whole tenths (0..10 = 0%..100%), so 10% steps are exact.

export const COUNTRIES = { USA: '美国', JPN: '日本', AUS: '澳洲', CHN: '中国' };
export const HOME_FX = { USA: 'fxUSD', JPN: 'fxJPY', AUS: 'fxAUD', CHN: 'fxCNY' };
const CCY = { USA: '美元', JPN: '日元', AUS: '澳元', CHN: '人民币' };
export const TYPE_NAME = { '危': '危机前夜', '转': '转折点', '平': '平常年份' };

// 大周期 ring (the game's six stops; ③④ are the fork B1/B2 after ②) and 小周期 ring (Dalio's four steps)
export const LONG_ORDER = ['①', '②', '⑤', '⑥', '⑦', '⑧'];
export const LONG_NAME = { '①': '堆债', '②': '逼近吸程线', '⑤': '私人去杠杆', '⑥': '政府接手', '⑦': '压制化债', '⑧': '修复' };
export const SHORT_ORDER = ['expand', 'hot', 'tight', 'ease'];
export const SHORT_NAME = { expand: '扩张', hot: '过热', tight: '收紧', ease: '降息' };
export const FORK_NAME = { none: '没有岔路', B1: 'B1 溢出（通胀）', B2: 'B2 跌破吸程线（通缩）' };
// framework signals that belong to the short dial (all others are drawn under the long dial)
export const SHORT_SIGNALS = new Set(['inflHot', 'hiking', 'cutting', 'creditBack']);

/** The assets of one card. Home currency is the card's country; its 外币 row is dropped (it equals 现金). */
export function assetsOf(card) {
  const iso = card.iso, c = CCY[iso] || '本币';
  const r1 = card.reveal?.ret1 || {};
  const list = [
    { k: 'cash', name: '现金', sub: `${c}，拿短期利率`, term: 'cashAsset', col: 'cash' },
    { k: 'bond', name: '国债', sub: `${COUNTRIES[iso]}长期国债`, term: 'bondAsset', col: 'bond' },
    { k: 'equity', name: '股票', sub: `${COUNTRIES[iso]}股市（含分红）`, term: 'equityAsset', col: 'equity' },
    { k: 'house', name: '房子', sub: `${COUNTRIES[iso]}房子（含租金）`, term: 'housePrice', col: 'house' },
    { k: 'fxUSD', name: '美元现金', sub: '拿美国短期利率', fx: true, col: 'fx' },
    { k: 'fxJPY', name: '日元现金', sub: '拿日本短期利率', fx: true, col: 'fx' },
    { k: 'fxCNY', name: '人民币现金', sub: '拿中国短期利率', fx: true, col: 'fx' },
    { k: 'fxAUD', name: '澳元现金', sub: '拿澳洲短期利率', fx: true, col: 'fx' },
  ].filter(a => a.k !== HOME_FX[iso]);
  for (const a of list) a.off = !(typeof r1[a.k] === 'number' && isFinite(r1[a.k]));   // no data (人民币 before 1997): cannot be picked
  return list;
}

/** Deck order: batch 1 as in the data, then batch 2 round-robin over the countries (year order inside each country). */
export function deckOrder(cards) {
  const b1 = cards.filter(c => c.batch === 1);
  const rest = cards.filter(c => c.batch !== 1);
  const by = {};
  for (const c of rest) (by[c.iso] = by[c.iso] || []).push(c);
  for (const k of Object.keys(by)) by[k].sort((a, b) => a.year - b.year);
  const isos = Object.keys(by), out = [...b1];
  for (let i = 0; out.length < cards.length && i < 99; i++) for (const k of isos) if (by[k][i]) out.push(by[k][i]);
  return out;
}

export const sumW = w => Object.values(w || {}).reduce((a, v) => a + (+v || 0), 0);   // in tenths; a full allocation = 10

/**
 * Portfolio return from tenths, 1y and 3y (annualised, as the data). The benchmark is computed the same way
 * (0.6 × 股票 + 0.4 × 国债 of the same numbers), so a player who copies 60/40 scores exactly the benchmark.
 *   (The data's own ret3.bench is a yearly-rebalanced path; with only annualised legs here a weighted average is the
 *    consistent approximation. ret1.bench is identical either way.)
 */
export function portfolio(card, w) {
  const R1 = card.reveal.ret1, R3 = card.reveal.ret3;
  let p1 = 0, p3 = 0;
  for (const [k, t] of Object.entries(w || {})) {
    if (!t) continue;
    p1 += (t / 10) * (R1[k] ?? 0);
    p3 += (t / 10) * (R3[k] ?? 0);
  }
  const b1 = 0.6 * R1.equity + 0.4 * R1.bond, b3 = 0.6 * R3.equity + 0.4 * R3.bond;
  const years = R3.years || 3;
  return { p1, p3, b1, b3, years, wealth: 100 * Math.pow(1 + p3, years), bwealth: 100 * Math.pow(1 + b3, years) };
}

const ringDist = (order, a, b) => {
  const i = order.indexOf(a), j = order.indexOf(b);
  if (i < 0 || j < 0) return 99;
  const d = Math.abs(i - j);
  return Math.min(d, order.length - d);
};
/** signed short-ring step from the framework's phase to the player's: +1 = the player is one step AHEAD, −1 = behind, 0 / ±2 otherwise */
export function shortStep(pick, call) {
  const i = SHORT_ORDER.indexOf(pick), j = SHORT_ORDER.indexOf(call);
  if (i < 0 || j < 0) return 0;
  const d = (i - j + 4) % 4;
  return d === 1 ? 1 : d === 3 ? -1 : d === 2 ? 2 : 0;
}

/**
 * 判断分 (0..10) against the framework's rule-based call — NOT ground truth:
 *   大周期 same stop 4, one stop away on the ring 2, else 0;  岔路 same (no fork = no fork) 2;  小周期 same 4, one step away 2, else 0.
 */
export function judgeScore(pick, call) {
  const dl = ringDist(LONG_ORDER, pick.long, call.long);
  const ds = ringDist(SHORT_ORDER, pick.short, call.short);
  const long = dl === 0 ? 4 : dl === 1 ? 2 : 0;
  const fork = (pick.fork || 'none') === (call.fork || 'none') ? 2 : 0;
  const short = ds === 0 ? 4 : ds === 1 ? 2 : 0;
  return { long, fork, short, total: long + fork + short };
}

/**
 * 收益分 (0..10): 5 = the benchmark. Excess = mean of the 1-year and the 3-year (annualised) excess return;
 * every +1%/年 above the benchmark adds 0.5, clamped to 0..10 (so ±10%/年 saturates).
 */
export function returnScore(pf) {
  const ex = ((pf.p1 - pf.b1) + (pf.p3 - pf.b3)) / 2;
  return { ex, total: Math.max(0, Math.min(10, Math.round((5 + ex * 50) * 10) / 10)) };
}

/** Everything the reveal shows for one play. */
export function scorePlay(card, play) {
  const pf = portfolio(card, play.w);
  return { pf, judge: judgeScore(play, card.view.call), ret: returnScore(pf) };
}

/* ---------- bias profile (every 10 cards) ----------
 * Simple counting rules over ALL plays so far (each needs a minimum sample; nothing is said with fewer).
 * w = tenths, so 3 = 30%. "pre-cut" = the framework's short call is 扩张 / 过热 / 收紧 (the central bank has not started cutting).
 *  bondEarly  「总是太早买国债」      ≥ 3 pre-cut plays with 国债 ≥ 30%, and in ≥ half of them 国债 1 年跑输现金.
 *  houseFlat  「房价横盘时仍以为会涨」 ≥ 2 plays with 房子 ≥ 30% whose 房子 3 年年化 ≤ +1%, and they are ≥ half of the 房子 ≥ 30% plays.
 *  fxLow      「外币配得太少」          average 外币 < 10% over ≥ 10 plays, and on ≥ 2 cards the best 外币 beat the benchmark by ≥ 5% in 1 年.
 *  fxHigh     「外币配得太多」          average 外币 ≥ 40% over ≥ 5 plays.
 *  chaseTop   「危机前夜还重仓」        ≥ 2 危 plays with 股票 + 房子 ≥ 60%, and they are ≥ half of the 危 plays.
 *  shyTurn    「转折点不敢进场」        ≥ 2 转 plays with 股票 + 房子 ≤ 20%, ≥ half of the 转 plays, and 股票 3 年 beat 现金 on average in those plays.
 *  cashHeavy  「现金放太多」            average 现金（本币）≥ 40% over ≥ 5 plays.
 *  shortAhead / shortBehind 「小周期总比框架早 / 晚一步」  one step ahead (behind) on the 4-step ring in ≥ 3 plays and ≥ 40% of plays.
 *  longStuck  「大周期总选同一格」      one stop picked in ≥ 80% of ≥ 5 plays while the framework used ≥ 2 different stops.
 *  b2Often    「总以为会跌破吸程线（B2）」      B2 picked ≥ 3 times and the framework disagreed in ≥ 60% of them.
 * No rule fires -> one neutral line.
 */
export function biasProfile(plays, byId) {
  const P = plays.map(p => ({ p, c: byId[p.id] })).filter(x => x.c);
  const n = P.length, out = [];
  if (!n) return out;
  const W = (x, k) => (+x.p.w?.[k] || 0);
  const fxW = x => ['fxUSD', 'fxJPY', 'fxCNY', 'fxAUD'].reduce((a, k) => a + W(x, k), 0);
  const r1 = (x, k) => x.c.reveal.ret1[k], r3 = (x, k) => x.c.reveal.ret3[k];
  const pct = v => Math.round(v * 100) + '%';
  const add = (id, title, detail, tip) => out.push({ id, title, detail, tip });

  const preCut = P.filter(x => x.c.view.call.short !== 'ease');
  const bondHeavy = preCut.filter(x => W(x, 'bond') >= 3);
  const bondLost = bondHeavy.filter(x => r1(x, 'bond') < r1(x, 'cash'));
  if (bondHeavy.length >= 3 && bondLost.length >= bondHeavy.length / 2)
    add('bondEarly', '总是太早买国债', `央行还没开始降息时，你 ${bondHeavy.length} 次重仓国债（≥ 30%），其中 ${bondLost.length} 次国债 1 年跑输现金。`,
      '国债要等利率真的往下走才赚钱：先看小周期到没到「降息」。');

  const houseHeavy = P.filter(x => W(x, 'house') >= 3);
  const houseFlat = houseHeavy.filter(x => r3(x, 'house') <= 0.01);
  if (houseFlat.length >= 2 && houseFlat.length >= houseHeavy.length / 2)
    add('houseFlat', '房价横盘时仍以为会涨', `你 ${houseHeavy.length} 次重仓房子（≥ 30%），其中 ${houseFlat.length} 次房子 3 年几乎没涨（年化 ≤ 1%）。`,
      '房价/收入已在高位、利率在升的时候，房子常常横盘好几年。');

  const fxAvg = P.reduce((a, x) => a + fxW(x), 0) / n / 10;
  const fxSave = P.filter(x => {
    const best = Math.max(-1, ...['fxUSD', 'fxJPY', 'fxCNY', 'fxAUD'].filter(k => k !== HOME_FX[x.c.iso]).map(k => r1(x, k)).filter(v => typeof v === 'number'));
    return x.c.type === '危' && best - r1(x, 'bench') >= 0.05;
  });
  if (n >= 10 && fxAvg < 0.1 && fxSave.length >= 2)
    add('fxLow', '外币配得太少', `平均只配了 ${pct(fxAvg)} 外币；而在 ${fxSave.length} 张危机前夜的卡上，外币现金 1 年比基准多赚 5% 以上。`,
      '一个国家出事时，别国的现金常常是保险。');
  if (n >= 5 && fxAvg >= 0.4)
    add('fxHigh', '外币配得太多', `平均配了 ${pct(fxAvg)} 外币现金。现金长期只跑赢通胀一点点，配太多会错过股票和房子。`,
      '外币是保险，不是主菜。');

  const danger = P.filter(x => x.c.type === '危');
  const chase = danger.filter(x => W(x, 'equity') + W(x, 'house') >= 6);
  if (chase.length >= 2 && chase.length >= danger.length / 2)
    add('chaseTop', '危机前夜还重仓股票和房子', `${danger.length} 张危机前夜的卡里，${chase.length} 次股票 + 房子 ≥ 60%。`,
      '逼近吸程线（②，湖里装的是借来的水）+ 央行在收紧时，先减一点风险资产。');

  const turn = P.filter(x => x.c.type === '转');
  const shy = turn.filter(x => W(x, 'equity') + W(x, 'house') <= 2);
  const shyMiss = shy.length ? shy.reduce((a, x) => a + (r3(x, 'equity') - r3(x, 'cash')), 0) / shy.length : 0;
  if (shy.length >= 2 && shy.length >= turn.length / 2 && shyMiss > 0)
    add('shyTurn', '转折点不敢进场', `${turn.length} 张转折点的卡里，${shy.length} 次股票 + 房子 ≤ 20%；这几次股票 3 年平均每年比现金多赚 ${pct(shyMiss)}。`,
      '降息已经推得动、信贷回正时，往往是进场的时候。');

  const cashAvg = P.reduce((a, x) => a + W(x, 'cash'), 0) / n / 10;
  if (n >= 5 && cashAvg >= 0.4)
    add('cashHeavy', '现金放太多', `平均 ${pct(cashAvg)} 放在本币现金里。`, '现金的实际回报常常接近 0，甚至被通胀吃掉。');

  const steps = P.map(x => shortStep(x.p.short, x.c.view.call.short));
  const ahead = steps.filter(s => s === 1).length, behind = steps.filter(s => s === -1).length;
  if (ahead >= 3 && ahead >= 0.4 * n)
    add('shortAhead', '小周期总比框架早一步', `${n} 张里有 ${ahead} 次，你选的小周期比框架往前多走了一步。`, '先看央行在做什么：还在加息就还没到「降息」。');
  if (behind >= 3 && behind >= 0.4 * n)
    add('shortBehind', '小周期总比框架晚一步', `${n} 张里有 ${behind} 次，你选的小周期比框架慢了一步。`, '央行一转向，小周期就动了，不用等经济数据。');

  const cnt = {};
  for (const x of P) cnt[x.p.long] = (cnt[x.p.long] || 0) + 1;
  const [topL, topN] = Object.entries(cnt).sort((a, b) => b[1] - a[1])[0] || [];
  const callsL = new Set(P.map(x => x.c.view.call.long));
  if (n >= 5 && topN >= 0.8 * n && callsL.size >= 2)
    add('longStuck', '大周期总选同一格', `${n} 张里 ${topN} 次选了 ${topL}；框架在这些卡上用了 ${callsL.size} 个不同的阶段。`, '大周期几十年一轮，但不同国家、不同年代站的位置不一样。');

  const b2 = P.filter(x => x.p.fork === 'B2');
  const b2Wrong = b2.filter(x => x.c.view.call.fork !== 'B2');
  if (b2.length >= 3 && b2Wrong.length >= 0.6 * b2.length)
    add('b2Often', '总以为会跌破吸程线（B2）', `你选了 ${b2.length} 次 B2，其中 ${b2Wrong.length} 次框架不这么看。`, 'B2 要三条同时成立：房价在跌 + 债务高 + 降了息信贷还在缩。');

  return out;
}

/** Running totals over all plays: count, mean 判断分, mean 收益分, mean excess return per card. */
export function totals(plays, byId) {
  let j = 0, r = 0, ex = 0, n = 0;
  for (const p of plays) {
    const c = byId[p.id];
    if (!c) continue;
    const s = scorePlay(c, p);
    j += s.judge.total; r += s.ret.total; ex += s.ret.ex; n++;
  }
  return { n, judge: n ? j / n : null, ret: n ? r / n : null, ex: n ? ex / n : null };
}
