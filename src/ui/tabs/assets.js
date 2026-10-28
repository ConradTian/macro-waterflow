// 资产 tab: five asset cards + price charts.
import { esc, pct, spct, num, compareChart } from './_util.js';
import { term } from '../concepts.js';

let mode = 'nominal';   // 'nominal' | 'real'
const ASSETS = [
  ['cash', '现金', 'cashAsset', '政策利率明显低于通胀（实际利率转负），或降息周期开始'],
  ['bond', '长期国债', 'bondAsset', '通胀预期重新抬头（B1），或长端收益率由降转升'],
  ['equity', '股票', 'equityAsset', '盈利 CF 转降，或折现率 / 风险溢价上升压过盈利增长'],
  ['housing', '房产', null, '房贷有效利率持续上升、银行审批倍数 < 1，或 LVR 抬头触发抵押品回路'],
  ['gold', '黄金', 'goldAsset', '实际利率由负转正并持续上升，且对货币信心回稳'],
];

function trailing(hist, k, field, n = 4) {
  const h = hist.slice(-n);
  return h.reduce((a, s) => a * (1 + (s.assets[k][field] || 0)), 1) - 1;
}
function valuation(k, s) {
  const a = s.assets[k];
  if (k === 'housing') {
    const p = a.priceToIncome, st = p > 5 ? '偏贵' : p < 3.5 ? '偏便宜' : '中性';
    return `${st}（房价/收入 ${num(p, 1)}，租售比 ${pct(a.rentYield)}）`;
  }
  if (k === 'equity') { const st = a.pe > 25 ? '偏贵' : a.pe < 14 ? '偏便宜' : '中性'; return `${st}（市盈率 ${num(a.pe, 1)}）`; }
  if (k === 'bond') { const st = a.yield > 0.06 ? '收益有吸引力' : a.yield < 0.03 ? '收益偏低、对加息敏感' : '中性'; return `${st}（收益率 ${pct(a.yield)}）`; }
  if (k === 'gold') return `无现金流，看实际利率（现 ${pct(s.rates.realPolicy)}）`;
  return `看政策利率 ${pct(s.rates.policy)} 与通胀 ${pct(s.macro.inflation)}`;
}
function factors(s, k) {
  const list = (s.causal && s.causal[`assets.${k}.ret`]) || null;
  if (!list || !list.length) return { pos: [], neg: [], conf: null, none: true };
  const pos = list.filter(f => f.contribution > 0).sort((a, b) => b.contribution - a.contribution);
  const neg = list.filter(f => f.contribution < 0).sort((a, b) => a.contribution - b.contribution);
  const tot = list.reduce((a, f) => a + Math.abs(f.contribution), 0) || 1;
  const net = Math.abs(list.reduce((a, f) => a + f.contribution, 0)) / tot;
  return { pos, neg, conf: net > 0.6 ? '较高' : net > 0.3 ? '中' : '低', none: false };
}
const fl = arr => (arr.length ? arr.map(f => `<li>${esc(f.factor)} <i>${spct(f.contribution)}</i></li>`).join('') : '<li class="none">无</li>');

export function render(container, ctx) {
  const s = ctx.snap, hist = ctx.sim.history('model'), f = mode === 'real' ? 'realRet' : 'ret';
  const cards = ASSETS.map(([k, name, tid, flip]) => {
    const a = s.assets[k], q = a[f], t4 = trailing(hist, k, f);
    const dir = q > 0.005 ? ['▲', '上行', 'up'] : q < -0.005 ? ['▼', '下行', 'down'] : ['►', '横盘', 'flat'];
    const fa = factors(s, k);
    return `<article class="as-card as-${dir[2]}">
      <header><h4>${tid ? term(tid, name) : `<button type="button" class="term" data-term="housePrice">${name}</button>`}</h4>
        <span class="as-dir"><span aria-hidden="true">${dir[0]}</span> ${dir[1]}</span></header>
      <div class="as-nums"><div><small>本季度${mode === 'real' ? '实际' : '名义'}回报</small><b>${spct(q)}</b></div>
        <div><small>近 4 季累计</small><b>${spct(t4)}</b></div><div><small>价格指数</small><b>${num(a.price, 0)}</b></div></div>
      <p class="as-row"><span>估值状态</span>${esc(valuation(k, s))}</p>
      <div class="as-fac"><div><span>主要正向 (+)</span><ul>${fl(fa.pos)}</ul></div><div><span>主要负向 (−)</span><ul>${fl(fa.neg)}</ul></div></div>
      <p class="as-row"><span>置信度</span>${fa.none ? '— 本季暂无归因（玩具模型，仅示意方向）' : fa.conf + '（各因素方向一致程度）'}</p>
      <p class="as-row"><span>翻转信号</span>${esc(flip)}</p></article>`;
  }).join('');
  container.innerHTML = `<section class="pn-tab pn-assets">
    <p class="pn-lead">结论：资产方向由“现金流 + 折现率 + 风险溢价 + 周期阶段”共同推出，不是预设；下面每张卡列出推动它的正反因素。</p>
    <div class="pn-seg" role="group" aria-label="回报口径">
      <button type="button" data-m="nominal" class="${mode === 'nominal' ? 'on' : ''}" aria-pressed="${mode === 'nominal'}">名义回报</button>
      <button type="button" data-m="real" class="${mode === 'real' ? 'on' : ''}" aria-pressed="${mode === 'real'}">实际回报（扣通胀）</button></div>
    <div class="as-grid">${cards}</div>
    <h3 class="pn-h">价格指数：真实 / 模型 / 你 <small>1995Q1 = 100</small></h3>
    <div class="pn-charts"><div id="as-h"></div><div id="as-e"></div></div></section>`;
  container.querySelectorAll('.pn-seg button').forEach(b => b.addEventListener('click', () => { mode = b.dataset.m; render(container, ctx); }));
  compareChart(container.querySelector('#as-h'), ctx, { title: '房价', realKey: 'houseIndex', modelFn: x => x.assets.housing.price });
  compareChart(container.querySelector('#as-e'), ctx, { title: '股票', realKey: 'equityIndex', modelFn: x => x.assets.equity.price });
}
