// 资产 tab (DIAGRAM v2): five cards = the 4 sub-pools of the diagram (房产 / 股票 / 长期国债 / 黄金) + the cash lake (现金湖).
// Each card: water level (price index), nominal vs real return, its spring (cash flow), its special link, main +/- factors.
// Tapping a card lights the matching sub-pool (and its pipes) in the diagram.
import { esc, pct, spct, num, compareChart, dataNoteHtml } from './_util.js';
import { term } from '../concepts.js';
import { flash } from '../links.js';

let mode = 'nominal';   // 'nominal' | 'real'  (the two columns are always both shown; this only picks the headline number)
let selected = null;

// k = snapshot asset key; part = diagram part id; pipes = diagram pipes to light with the card
const ASSETS = [
  { k: 'housing', name: '房产', tid: 'housePrice', part: 'poolHousing', pipes: ['toHousing', 'rent', 'collateral'], flip: '房贷有效利率持续上升、银行审批倍数 < 1，或 LVR 抬头触发抵押品回路' },
  { k: 'equity', name: '股票', tid: 'equityAsset', part: 'poolEquity', pipes: ['toEquity', 'dividends'], flip: '盈利 CF 转降，或折现率 / 风险溢价上升压过盈利增长' },
  { k: 'bond', name: '长期国债', tid: 'bondAsset', part: 'poolBond', pipes: ['toBond', 'qe', 'coupons'], flip: '通胀预期重新抬头（B1），或长端收益率由降转升' },
  { k: 'gold', name: '黄金', tid: 'goldAsset', part: 'poolGold', pipes: ['toGold'], flip: '吸力（实际利率）由负转正并持续上升，且对货币信心回稳' },
  { k: 'cash', name: '现金湖', tid: 'cashAsset', part: 'cash', pipes: ['toCash'], flip: '政策利率明显低于通胀（吸力 = 实际利率转负），或降息周期开始' },
];

function trailing(hist, k, field, n = 4) {
  const h = hist.slice(-n);
  return h.reduce((a, s) => a * (1 + (s.assets[k]?.[field] || 0)), 1) - 1;
}
const money = (v, town) => (v == null || !isFinite(v) ? '—' : Math.abs(v) >= 1000 && !town ? (v / 1000).toFixed(1) + 'k' : Math.abs(v) < 10 ? v.toFixed(1) : String(Math.round(v)));

// valuation one-liner (as before)
function valuation(k, s) {
  const a = s.assets[k];
  if (k === 'housing') {
    const p = a.priceToIncome, st = p > 5 ? '偏贵' : p < 3.5 ? '偏便宜' : '中性';
    return `${st}（房价/收入 ${num(p, 1)}，租售比 ${pct(a.rentYield)}）`;
  }
  if (k === 'equity') { const st = a.pe > 25 ? '偏贵' : a.pe < 14 ? '偏便宜' : '中性'; return `${st}（市盈率 ${num(a.pe, 1)}）`; }
  if (k === 'bond') { const st = a.yield > 0.06 ? '收益有吸引力' : a.yield < 0.03 ? '收益偏低、对加息敏感' : '中性'; return `${st}（收益率 ${pct(a.yield)}）`; }
  if (k === 'gold') return `无现金流，看吸力 = 实际利率（现 ${pct(s.rates.realPolicy)}）`;
  return `看政策利率 ${pct(s.rates.policy)} 与通胀 ${pct(s.macro.inflation)}`;
}

// spring (cash flow) line: what feeds the pool without anyone buying it
function spring(k, s, town) {
  const f = s.flows || {}, a = s.assets[k];
  if (k === 'housing') {
    const v = f.rent ?? (a.level != null && a.rentYield != null ? a.level * a.rentYield / 4 : null);
    return `<b>租金</b> ← 分水堰的租金口　本季 ${money(v, town)}（租售比 ${pct(a.rentYield)}）`;
  }
  if (k === 'equity') {
    const v = f.dividends ?? (a.level != null ? a.level * 0.02 / 4 : null);
    return `<b>分红 / 利润</b> ← 分水堰的利润口　本季分红 ${money(v, town)}（股息率约 2%）`;
  }
  if (k === 'bond') {
    const v = f.coupons ?? (s.gov?.interest != null ? s.gov.interest / 4 : null);
    return `<b>票息</b> ← 分水堰的利息口（政府付）　本季 ${money(v, town)}（收益率 ${pct(a.yield)}）`;
  }
  if (k === 'gold') return '<b>无泉眼</b>：没有任何现金流，价格只靠“大家愿不愿意相信货币”';
  return '<b>无泉眼</b>：现金不产生回报，持有成本 = 通胀';
}
// special link line: how this pool talks back to the rest of the system
function special(k, s) {
  if (k === 'housing') return `<b>抵押品回路</b>：房价 ↑ → 抵押品值钱 → 银行审批更松 → 更多房贷 → 房价 ↑（反过来也成立）。现在 LVR ${pct(s.household.lvr, 0)}，审批 ×${num(s.bank.approval, 2)}`;
  if (k === 'equity') return `<b>利润 + 风险溢价</b>：企业利润（${money(s.firm.profit, !!s.town)}）是泉眼，风险溢价 ${pct(s.rates.riskPremium)} 决定贴现多少`;
  if (k === 'bond') return `<b>利率跷跷板</b>：利率 ↑ → 价格 ↓。通胀型危机里国债不是避风港。现在 10 年收益率 ${pct(s.rates.gov10y, 2)}`;
  if (k === 'gold') return `<b>信心</b>：吸力（实际利率）↓ 或对货币失去信任时流入。现在实际政策利率 ${pct(s.rates.realPolicy, 2)}${s.assets.gold.distrust != null ? `，不信任度 ${num(s.assets.gold.distrust, 2)}` : ''}`;
  return '<b>现金湖</b>：现金不在资产池里，是“还没决定买什么”的水；央行的吸力泵装在这里。通胀会把它的购买力慢慢蒸发';
}
function factors(s, k) {
  const list = (s.causal && s.causal[`assets.${k}.ret`]) || null;
  if (!list || !list.length) return { pos: [], neg: [], conf: null, none: true };
  const pos = list.filter(f => f.contribution > 0).sort((a, b) => b.contribution - a.contribution).slice(0, 3);
  const neg = list.filter(f => f.contribution < 0).sort((a, b) => a.contribution - b.contribution).slice(0, 3);
  const all = list.filter(f => f.contribution);
  const tot = all.reduce((a, f) => a + Math.abs(f.contribution), 0) || 1;
  const net = Math.abs(all.reduce((a, f) => a + f.contribution, 0)) / tot;
  return { pos, neg, conf: net > 0.6 ? '较高' : net > 0.3 ? '中' : '低', none: false };
}
const fl = arr => (arr.length ? arr.map(f => `<li>${esc(f.factor)} <i>${spct(f.contribution)}</i></li>`).join('') : '<li class="none">无</li>');

export function render(container, ctx) {
  const s = ctx.snap, hist = ctx.sim.history('model'), town = !!s.town;
  const head = mode === 'real' ? 'realRet' : 'ret';
  const cards = ASSETS.map(A => {
    const a = s.assets[A.k];
    if (!a) return '';
    const q = a[head], t4 = trailing(hist, A.k, head);
    const dir = q > 0.005 ? ['▲', '上行', 'up'] : q < -0.005 ? ['▼', '下行', 'down'] : ['►', '横盘', 'flat'];
    const fa = factors(s, A.k);
    const lvl = a.level != null ? `<div><small>水量（市值）</small><b>${money(a.level, town)}</b></div>` : '';
    return `<article class="as-card as-${dir[2]}${selected === A.k ? ' as-sel' : ''}" data-k="${A.k}" tabindex="0" role="button" aria-label="${A.name}：点一下在水流图里亮起它的水池">
      <header><h4>${term(A.tid, A.name)}<small class="as-lvl">水位 ${num(a.price, 0)}</small></h4>
        <span class="as-dir"><span aria-hidden="true">${dir[0]}</span> ${dir[1]}</span></header>
      <div class="as-nums"><div><small>本季名义</small><b>${spct(a.ret)}</b></div><div><small>本季实际（扣通胀）</small><b>${spct(a.realRet)}</b></div>
        <div><small>近 4 季${mode === 'real' ? '实际' : '名义'}</small><b>${spct(t4)}</b></div>${lvl}</div>
      <p class="as-row as-spring"><span>泉眼</span>${spring(A.k, s, town)}</p>
      <p class="as-row as-link"><span>特殊连接</span>${special(A.k, s)}</p>
      <p class="as-row"><span>估值状态</span>${esc(valuation(A.k, s))}</p>
      <div class="as-fac"><div><span>主要正向 (+)</span><ul>${fl(fa.pos)}</ul></div><div><span>主要负向 (−)</span><ul>${fl(fa.neg)}</ul></div></div>
      <p class="as-row"><span>置信度</span>${fa.none ? '— 本季暂无归因（玩具模型，仅示意方向）' : fa.conf + '（各因素方向一致程度）'}</p>
      <p class="as-row"><span>翻转信号</span>${esc(A.flip)}</p>
      <p class="as-hint">点这张卡 → 水流图里的「${A.name}」亮起</p></article>`;
  }).join('');
  container.innerHTML = `<section class="pn-tab pn-assets">
    <p class="pn-lead">结论：湖 = 现金湖 + 资产池，资产池分成 4 个子池（房产 / 股票 / 长期国债 / 黄金）。买现有资产 = 买取水权：只抬自己的水位，不会拓宽河的测流断面（产能）。</p>
    <div class="pn-seg" role="group" aria-label="回报口径">
      <button type="button" data-m="nominal" class="${mode === 'nominal' ? 'on' : ''}" aria-pressed="${mode === 'nominal'}">近 4 季看名义</button>
      <button type="button" data-m="real" class="${mode === 'real' ? 'on' : ''}" aria-pressed="${mode === 'real'}">近 4 季看实际</button></div>
    <div class="as-grid">${cards}</div>
    <h3 class="pn-h">价格指数：真实 / 模型 / 你 <small>${town ? '' : '1995Q1 = 100'}</small></h3>
    <div class="pn-charts"><div id="as-h"></div><div id="as-e"></div></div>${dataNoteHtml(ctx)}</section>`;
  container.querySelectorAll('.pn-seg button').forEach(b => b.addEventListener('click', () => { mode = b.dataset.m; render(container, ctx); }));
  const pick = card => {
    const A = ASSETS.find(x => x.k === card.dataset.k); if (!A) return;
    selected = A.k;
    container.querySelectorAll('.as-card').forEach(c => c.classList.toggle('as-sel', c === card));
    flash({ parts: [A.part], pipes: A.pipes }, 3500);
  };
  container.querySelectorAll('.as-card').forEach(c => {
    c.addEventListener('click', e => { if (e.target.closest('.term')) return; pick(c); });
    c.addEventListener('keydown', e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); pick(c); } });
  });
  compareChart(container.querySelector('#as-h'), ctx, { title: '房价', realKey: 'houseIndex', modelFn: x => x.assets.housing.price });
  compareChart(container.querySelector('#as-e'), ctx, { title: '股票', realKey: 'equityIndex', modelFn: x => x.assets.equity.price });
}
