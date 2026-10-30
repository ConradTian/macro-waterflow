// 「专题：AI 抗冲击（澳洲家庭）」 panels (src/data/lesson-ai-au.js, panel ids 'ai-*'), mounted in the lesson CARD (src/ui/lessons.js CARD_PANELS.aiau)
// so the main diagram stays visible with the step's glow:
//   ai-k      M2: the K by place (upper arm = profits / rents to the bottleneck owners and the lake; lower arm = the wage share)
//   ai-alloc  A2: the hypothetical example's table (A$ of the liquid money) + the 信念仓位 choice (0 / 5 / 10) + the two risk-control buttons
//             收紧 / AI 信用压力, each showing the new table next to the normal one, labelled 「风险控制，不是赚钱信号；…证据不足」
// Loading this module binds the real data to the lesson (bindAiData), before the lesson's first step (lessons.js loadPanels).
// The card is rebuilt on every draw(): a mount with the same panel id keeps its state (tilt, button).
// mountAiPanel(host, spec) / unmountAiPanel() / ensureAiCss().
import { USA_REAL } from '../data/real/usa-real.js';
import { AUS_REAL } from '../data/real/aus-real.js';
import { JPN_Q } from '../data/countries/jpn-quarterly.js';
import { realSnapshot, realLastDate } from '../data/real/real-snapshot.js';
import { bindAiData, AI_ALLOC, aiAllocTable, aiRiskLabel, audK, AI_NO_ADVICE } from '../data/lesson-ai-au.js';

bindAiData({ USA_REAL, AUS_REAL, JPN_Q, realSnapshot, realLastDate });

const esc = s => String(s ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const pp = v => `${Math.round(v * 10) / 10}%`;

export function ensureAiCss() {
  if (typeof document === 'undefined' || document.querySelector('link[data-css="ai-au.css"]')) return;
  const l = document.createElement('link'); l.rel = 'stylesheet'; l.dataset.css = 'ai-au.css';
  l.href = new URL('../../assets/css/ai-au.css', import.meta.url).href; document.head.appendChild(l);
}

const state = { tilt: AI_ALLOC.tiltDefault, trig: null };   // kept across re-mounts (the card is rebuilt on every draw)
let mounted = null;
export function unmountAiPanel() {
  if (!mounted) return;
  mounted.root.remove();
  mounted = null;
}
export function mountAiPanel(host, spec = {}) {
  unmountAiPanel();
  if (!host) return null;
  ensureAiCss();
  const id = spec.id || 'ai-alloc';
  const root = document.createElement('div');
  root.className = 'aiau'; root.dataset.panel = id;
  host.appendChild(root);
  mounted = { host, root, id };
  const draw = () => { try { root.innerHTML = id === 'ai-k' ? kHtml() : allocHtml(); } catch (e) { console.error(e); root.innerHTML = '<p class="aiau-note">（图没画出来）</p>'; } };
  draw();
  root.addEventListener('click', e => {
    const b = e.target.closest('[data-ai]'); if (!b) return;
    if (b.dataset.ai === 'tilt') state.tilt = +b.dataset.v;
    else if (b.dataset.ai === 'trig') state.trig = b.dataset.v === 'none' ? null : b.dataset.v;
    draw();
  });
  return root;
}

/* ---------------------------------------------------------------- ai-k: the K by place */
function kHtml() {
  // a K: the stem is the river today; the upper arm goes to the bottleneck owners / the lake, the lower arm is the wage share
  return `<div class="aiau-h"><b>K 字形，按地方画</b><small>对着上面的图看：亮的就是这些地方</small></div>
<svg class="aiau-k" viewBox="0 0 330 150" role="img" aria-label="K 字形：上臂利润和租金，下臂工资份额">
  <line x1="40" y1="12" x2="40" y2="138" class="k-stem"/>
  <line x1="40" y1="75" x2="120" y2="18" class="k-up"/>
  <line x1="40" y1="75" x2="120" y2="132" class="k-down"/>
  <text x="34" y="80" text-anchor="end" class="k-t">今天</text>
  <text x="126" y="16" class="k-t k-tu">上臂：利润、租金</text>
  <text x="126" y="33" class="k-s">→ 卡点的主人（电、芯片、算力）</text>
  <text x="126" y="48" class="k-s">→ 湖：股票池、好地段的房子</text>
  <text x="126" y="118" class="k-t k-td">下臂：工资的份额</text>
  <text x="126" y="135" class="k-s">水平可以更高，份额变小</text>
</svg>
<p class="aiau-note">上臂对应图上的「利润」水管、股票池和房子池；下臂对应「工资」水管和家庭。</p>`;
}

/* ---------------------------------------------------------------- ai-alloc: the hypothetical table */
function allocHtml() {
  const A = AI_ALLOC, base = aiAllocTable(state.tilt, null), now = state.trig ? aiAllocTable(state.tilt, state.trig) : null;
  const T = state.trig ? A.triggers.find(t => t.id === state.trig) : null;
  const cell = (v, cls = '') => `<td class="${cls}">${pp(v)}<small>${esc(audK(v / 100 * A.liquid))}</small></td>`;
  const sum = t => Object.values(t).reduce((s, x) => s + x, 0);
  const rows = A.blocks.map(b => {
    const d = now ? Math.round((now[b.id] - base[b.id]) * 10) / 10 : 0;
    return `<tr data-b="${b.id}"><th>${esc(b.name)}</th>${cell(base[b.id], now ? 'aiau-old' : '')}${now ? cell(now[b.id], d > 0 ? 'aiau-up' : d < 0 ? 'aiau-dn' : '') : ''}</tr>`;
  }).join('');
  const tot = `<tr class="aiau-sum"><th>合计</th>${cell(sum(base))}${now ? cell(sum(now)) : ''}</tr>`;
  return `<div class="aiau-h"><b>假设的例子：${esc(audK(A.liquid))} 怎么分</b><small>房子 ${esc(audK(A.house))}，没有房贷 · 不是任何真人的数据</small></div>
<div class="aiau-row" role="group" aria-label="信念仓位"><span>信念仓位</span>${A.tiltOptions.map(v => `<button type="button" class="aiau-b${state.tilt === v ? ' on' : ''}" data-ai="tilt" data-v="${v}">${v}%</button>`).join('')}<small>少的部分回到全球股票</small></div>
<table class="aiau-t"><thead><tr><th></th><th>平常</th>${now ? `<th class="aiau-trh">按了「${esc(T.name)}」</th>` : ''}</tr></thead><tbody>${rows}${tot}</tbody></table>
<div class="aiau-row aiau-trig" role="group" aria-label="风险控制按钮"><button type="button" class="aiau-b${!state.trig ? ' on' : ''}" data-ai="trig" data-v="none">平常</button>${A.triggers.map(t => `<button type="button" class="aiau-b${state.trig === t.id ? ' on' : ''}" data-ai="trig" data-v="${t.id}">${esc(t.name)}</button>`).join('')}</div>
<p class="aiau-risk">${esc(aiRiskLabel())}</p>
${T ? `<p class="aiau-note"><b>${esc(T.name)}</b>：${esc(T.when)}。表怎么变：${esc(T.rule.replace('{cut}', A.eqCut))}。</p>` : ''}
<p class="aiau-note">不买：${A.excluded.map(esc).join('、')}。${esc(AI_NO_ADVICE)}。</p>`;
}
