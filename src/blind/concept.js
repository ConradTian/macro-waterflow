// 历史盲测: a light concept card. Reads the game's concept texts (src/data/concepts.js: 是什么 / 水的比喻 / 公式) and shows them in the
// same card shell as the main game (.cc-* in assets/css/panels.css). The main card (src/ui/concepts.js) is not used here: it is wired to the
// quarterly simulator and the diagram (live value, 传导链 on the diagram), which this page does not have.
import { CONCEPTS } from '../data/concepts.js';
import { esc } from './draw.js';

// blind-only explainers (data-bterm)
const BTERMS = {
  pctile: { name: '相对历史位置', short: '今年在这个国家自己的历史里排第几：0 分位 = 历史最低，100 分位 = 历史最高。只用到这一年为止的数据。',
    water: '像查水文站的历史记录：今天的水位，在过去所有年份里排在哪。80 分位以上 = 少见的高水位。' },
  holdout: { name: '保留样本', short: '这张卡用到 2021 年以后的数据。框架的规则是在这之前写好的，所以它们是规则没见过的考题。',
    water: '像率定完模型后，留一段从没用过的洪水来验证。' },
  realAud: { name: '实际澳元回报', short: '先把回报换成澳元，再扣掉澳洲的通胀：在澳洲能多买多少东西。',
    water: '量的是水真正多了多少，而不是水表读数：换算单位、再扣掉蒸发。' },
  bench: { name: '基准：本国 60/40', short: '不做任何判断的做法：本国 60% 股票 + 40% 国债。你的收益分 5 分 = 和它一样。',
    water: '对照组：什么阀门都不动，水自己流。' },
  judge: { name: '判断分', short: '你的周期判断和框架规则有多接近（满分 10）：大周期 4、岔路 2、小周期 4；差一格给一半。框架只是一套按年的规则，不是标准答案。',
    water: '像拿模型结果对照另一个模型，不是对照实测。' },
  ret: { name: '收益分', short: '你的组合比基准多赚还是少赚（满分 10，5 = 和基准一样）。1 年和 3 年年化的超额各占一半，每年多赚 1% 加 0.5 分。',
    water: '和对照组比，你开关阀门后多留住了多少水。' },
  survivor: { name: '幸存者偏差', short: '牌组里只有今天还富、市场一直开着的国家。很多国家的股市曾经归零（俄国 1917、中国 1949），它们不在这里，所以股票看起来比真实历史更好。',
    water: '只统计没溃的坝，会以为坝都很安全。' },
};

let root = null;
function ensure() {
  if (root) return root;
  root = document.createElement('div');
  root.className = 'cc-root bl-cc';
  root.hidden = true;
  root.innerHTML = '<div class="cc-backdrop" data-cc-close></div><aside class="cc-card" role="dialog" aria-label="概念卡片"><div class="cc-grab" aria-hidden="true"></div><div class="cc-body"></div></aside>';
  document.body.appendChild(root);
  root.addEventListener('click', e => { if (e.target.closest('[data-cc-close]')) close(); });
  document.addEventListener('keydown', e => { if (e.key === 'Escape') close(); });
  return root;
}
export function close() { if (root) root.hidden = true; }
export function open(id, local = false) {
  const c = local ? BTERMS[id] : CONCEPTS[id];
  if (!c) return false;
  const r = ensure();
  r.querySelector('.cc-body').innerHTML =
    `<header class="cc-head"><span></span><button type="button" class="cc-btn" data-cc-close aria-label="关闭">✕ 关闭</button></header>` +
    `<h2 class="cc-title">${esc(c.name)}</h2>` +
    `<p class="cc-short"><span class="cc-tag">是什么</span>${esc(c.short)}</p>` +
    (c.water ? `<div class="cc-row"><span class="cc-k">水的比喻</span><p>${esc(c.water)}</p></div>` : '') +
    (c.formula ? `<details class="cc-more"><summary>更多：公式</summary><pre class="cc-formula">${esc(c.formula)}</pre></details>` : '');
  r.hidden = false;
  r.querySelector('.cc-body').scrollTop = 0;
  return true;
}
export function initConcepts() {
  const go = el => (el.dataset.bterm ? open(el.dataset.bterm, true) : open(el.dataset.term));
  document.addEventListener('click', e => {
    const el = e.target.closest && e.target.closest('[data-term], [data-bterm]');
    if (!el || el.closest('.cc-card')) return;
    e.preventDefault();
    go(el);
  });
  document.addEventListener('keydown', e => {
    if (e.key !== 'Enter' && e.key !== ' ') return;
    const el = e.target.closest && e.target.closest('div[data-term]');
    if (el) { e.preventDefault(); go(el); }
  });
}
