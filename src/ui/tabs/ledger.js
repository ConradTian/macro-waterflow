// 流水账 tab: newest first, filter chips by player.
import { esc, PLAYERS, playerOf } from './_util.js';
import { linkify } from '../concepts.js';
import { flash, linksForEntry } from '../links.js';

let filter = 'all';
const MAX = 40;

export function render(container, ctx) {
  const hist = ctx.sim.history('model');
  const entries = [];
  for (let i = hist.length - 1; i >= 0 && entries.length < 160; i--) {
    const led = hist[i].ledger || [];
    for (let k = led.length - 1; k >= 0; k--) entries.push(led[k]);
  }
  const shown = entries.filter(e => filter === 'all' || e.player === filter).slice(0, MAX);
  const present = new Set(entries.map(e => e.player));
  const chips = ['all', ...Object.keys(PLAYERS).filter(p => present.has(p) || p === ctx.sim.takenOver)]
    .map(p => `<button type="button" class="pn-chip${filter === p ? ' on' : ''}" data-f="${p}" aria-pressed="${filter === p}">${p === 'all' ? '全部' : playerOf(p).name}</button>`).join('');
  const cards = shown.map((e, i) => {
    const pl = playerOf(e.player);
    return `<article class="lg-card" data-i="${i}" tabindex="0" style="--pc:${pl.color}">
      <header><span class="lg-mark" aria-hidden="true">${pl.mark}</span><b>${esc(e.date)} · ${pl.name}</b></header>
      <dl>
        <dt>观察</dt><dd>${linkify(e.observe)}</dd>
        <dt>规则</dt><dd>${linkify(e.rule)}</dd>
        <dt>行动</dt><dd><b>${linkify(e.action)}</b></dd>
        <dt>即时结果</dt><dd>${linkify(e.immediate)}</dd>
        <dt>延迟后果</dt><dd>${linkify(e.delayed)}</dd>
      </dl></article>`;
  }).join('');
  container.innerHTML = `<section class="pn-tab pn-ledger">
    <p class="pn-lead">结论：每个季度各角色都按“观察 → 规则 → 行动”机械地行动；这里记录谁做了什么、立刻发生什么、以后会留下什么后果。</p>
    <p class="pn-sub lg-hint">点一条记录，水流图里它推动的水管和角色会亮 3 秒。</p>
    <div class="pn-chips" role="group" aria-label="按角色筛选">${chips}</div>
    ${cards || '<div class="pn-empty">还没有记录。按“步进”走一个季度。</div>'}
    ${entries.length > MAX ? `<p class="pn-sub">只显示最近 ${MAX} 条</p>` : ''}
  </section>`;
  container.querySelectorAll('.pn-chip').forEach(b => b.addEventListener('click', () => { filter = b.dataset.f; render(container, ctx); }));
  // tap an entry -> light up what that player's action moves in the diagram (~3 s)
  container.querySelectorAll('.lg-card').forEach(card => {
    const go = ev => {
      if (ev.target.closest('.term')) return;
      const e = shown[+card.dataset.i];
      container.querySelectorAll('.lg-sel').forEach(c => c.classList.remove('lg-sel'));
      card.classList.add('lg-sel');
      flash(linksForEntry(e), 3000, () => card.classList.remove('lg-sel'));
    };
    card.addEventListener('click', go);
    card.addEventListener('keydown', ev => { if (ev.key === 'Enter' || ev.key === ' ') { ev.preventDefault(); go(ev); } });
  });
  // screenshot helper: ?tap=<n> taps the n-th ledger entry once after the first render
  const tap = new URLSearchParams(location.search).get('tap');
  if (tap != null && !render.tapped) { render.tapped = true; setTimeout(() => container.querySelectorAll('.lg-card')[+tap]?.click(), 400); }
}
