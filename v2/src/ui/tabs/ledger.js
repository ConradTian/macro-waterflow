// 流水账 tab: newest first, filter chips by player, and by default only what CHANGED this quarter.
//  - every card has a 新触发 / 持续中 badge: the same player's same rule was (not) in the previous quarter's ledger
//  - the rule line is followed by a condition ruler per compared value (entry.cond from the engine): current value vs the rule's threshold
//  - toggle 只看有变化的 (new rule, or the action changed direction/kind) / 全部
import { esc, PLAYERS, playerOf } from './_util.js';
import { linkify } from '../concepts.js';
import { flash, linksForEntry } from '../links.js';
import { freshness, fv } from '../headline.js';
import { CONCEPTS } from '../../data/concepts.js';
import { currentCountry, localizeText } from '../country-info.js';

let filter = 'all';
let view = 'changes';          // 'changes' | 'all'
const MAX = 40;

// the threshold ruler lives in gauge.js (cycle agent): feature-detect, fall back to text until it is there
let TB = null, tbAsked = false;
function wantRuler(again) {
  if (TB || tbAsked) return;
  tbAsked = true;
  import('../gauge.js').then(m => { if (typeof m.thresholdBarHtml === 'function') { TB = m.thresholdBarHtml; again(); } }).catch(() => { /* text fallback stays */ });
}

const condOk = c => (c.dir === '<=' ? c.value <= c.threshold : c.value >= c.threshold);
function condHtml(c) {
  const ok = condOk(c), cmp = c.dir === '<=' ? '≤' : '≥';
  const nm = c.term && CONCEPTS[c.term] ? `<button type="button" class="term" data-term="${esc(c.term)}">${esc(c.name)}</button>` : esc(c.name);
  const txt = `${nm} <b>${fv(c.value, c.fmt, c.fmt === 'pp')}</b> ${cmp} ${fv(c.threshold, c.fmt)}`;
  const bar = TB ? TB({ value: c.value, threshold: c.threshold, dir: c.dir, fmt: c.fmt }) : '';
  return `<li class="lg-c ${ok ? 'ok' : 'no'}"><span class="lg-ct">${txt} <em>${ok ? '✓ 达标' : '✗ 未达'}</em></span>${bar}</li>`;
}

export function render(container, ctx) {
  const hist = ctx.sim.history('model');
  const L = t => localizeText(t, currentCountry(ctx.sim));      // 「真实联储路径」 -> 「真实澳联储路径」 etc. (the engine's rule texts are written for the US)
  wantRuler(() => { if (container.isConnected) render(container, ctx); });
  // walk quarters newest first, comparing each with the one before it
  const rows = [];
  let cur = null;
  for (let i = hist.length - 1; i >= 0 && rows.length < 240; i--) {
    const fr = freshness(hist[i].ledger || [], i > 0 ? hist[i - 1].ledger || [] : []);
    if (i === hist.length - 1) cur = { date: hist[i].date, n: fr.length, fresh: fr.filter(x => x.fresh).length, changed: fr.filter(x => !x.fresh && x.changed).length };
    const part = fr.map(x => ({ ...x, i })).reverse();
    if (view === 'changes') part.sort((a, b) => (b.fresh - a.fresh) || (b.changed - a.changed));
    rows.push(...part);
  }
  const present = new Set(rows.map(r => r.e.player));
  const byPlayer = rows.filter(r => filter === 'all' || r.e.player === filter);
  const pool = view === 'changes' ? byPlayer.filter(r => r.fresh || r.changed) : byPlayer;
  const shown = pool.slice(0, MAX);

  const chips = ['all', ...Object.keys(PLAYERS).filter(p => present.has(p) || p === ctx.sim.takenOver)]
    .map(p => `<button type="button" class="pn-chip${filter === p ? ' on' : ''}" data-f="${p}" aria-pressed="${filter === p}">${p === 'all' ? '全部角色' : playerOf(p).name}</button>`).join('');
  const seg = `<div class="pn-seg lg-seg" role="group" aria-label="显示范围"><button type="button" class="${view === 'changes' ? 'on' : ''}" data-v="changes" aria-pressed="${view === 'changes'}">只看有变化的</button>` +
    `<button type="button" class="${view === 'all' ? 'on' : ''}" data-v="all" aria-pressed="${view === 'all'}">全部</button></div>`;
  const sumTxt = cur ? (cur.n
    ? `${esc(cur.date)}：共 ${cur.n} 条，<b>${cur.fresh} 条新触发</b>，${cur.changed} 条做法变了，${cur.n - cur.fresh - cur.changed} 条沿用上季。`
    : `${esc(cur.date)}：本季没有记录。`) : '';

  const cards = shown.map((r, k) => {
    const e = r.e, pl = playerOf(e.player);
    const badge = r.fresh ? '<span class="lg-badge new">★ 新触发</span>' : '<span class="lg-badge keep">↻ 持续中</span>' + (r.changed ? '<span class="lg-badge chg">做法变了</span>' : '');
    const cond = Array.isArray(e.cond) && e.cond.length ? `<ul class="lg-conds" aria-label="规则的条件刻度">${e.cond.map(condHtml).join('')}</ul>` : '';
    return `<article class="lg-card${r.fresh ? ' is-new' : ''}" data-i="${k}" tabindex="0" style="--pc:${pl.color}">
      <header><span class="lg-mark" aria-hidden="true">${pl.mark}</span><b>${esc(e.date)} · ${pl.name}</b>${badge}</header>
      <dl>
        <dt>观察</dt><dd>${linkify(L(e.observe))}</dd>
        <dt>规则</dt><dd>${linkify(L(e.rule))}${cond}</dd>
        <dt>行动</dt><dd><b>${linkify(L(e.action))}</b></dd>
        <dt>即时结果</dt><dd>${linkify(L(e.immediate))}</dd>
        <dt>延迟后果</dt><dd>${linkify(L(e.delayed))}</dd>
      </dl></article>`;
  }).join('');
  const empty = view === 'changes'
    ? `<div class="pn-empty">${rows.length ? '这一页没有新触发、也没有改变做法的记录——各角色都在重复上一季。' : '还没有记录。按“步进”走一个季度。'}${rows.length ? '<br><button type="button" class="btn" data-v="all">看全部</button>' : ''}</div>`
    : '<div class="pn-empty">还没有记录。按“步进”走一个季度。</div>';

  container.innerHTML = `<section class="pn-tab pn-ledger">
    <p class="pn-lead lg-lead">每个季度只看：① 哪条规则<b>新触发</b>；② 条件刻度（竖线 = 阈值，圆点 = 现值，点进亮色一侧 = 触发）。点一条记录，水流图里相关的水管会亮 3 秒。</p>
    ${seg}
    <p class="pn-sub lg-sum">${sumTxt}</p>
    <div class="pn-chips" role="group" aria-label="按角色筛选">${chips}</div>
    ${cards || empty}
    ${pool.length > MAX ? `<p class="pn-sub">只显示最近 ${MAX} 条</p>` : ''}
  </section>`;
  container.querySelectorAll('.pn-chip').forEach(b => b.addEventListener('click', () => { filter = b.dataset.f; render(container, ctx); }));
  container.querySelectorAll('[data-v]').forEach(b => b.addEventListener('click', () => { view = b.dataset.v; render(container, ctx); }));
  // tap an entry -> light up what that player's action moves in the diagram (~3 s)
  container.querySelectorAll('.lg-card').forEach(card => {
    const go = ev => {
      if (ev.target.closest('.term')) return;
      const e = shown[+card.dataset.i].e;
      container.querySelectorAll('.lg-sel').forEach(c => c.classList.remove('lg-sel'));
      card.classList.add('lg-sel');
      flash(linksForEntry(e), 3000, () => card.classList.remove('lg-sel'));
    };
    card.addEventListener('click', go);
    card.addEventListener('keydown', ev => { if (ev.key === 'Enter' || ev.key === ' ') { ev.preventDefault(); go(ev); } });
  });
  // screenshot helpers: ?tap=<n> taps the n-th ledger entry once after the first render; ?ledger=all shows every entry
  const qs = new URLSearchParams(location.search);
  if (qs.get('ledger') === 'all' && !render.forced) { render.forced = true; view = 'all'; render(container, ctx); return; }
  const tap = qs.get('tap');
  if (tap != null && !render.tapped) { render.tapped = true; setTimeout(() => container.querySelectorAll('.lg-card')[+tap]?.click(), 400); }
}
