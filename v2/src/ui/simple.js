// SIMPLE MODE (the default page): right of / under the water diagram, the two cycle dials as a compact read-only pair,
// the 本季看点 details (wide screens) and the 「更多」 button that opens the full layout (流水账 / 周期 / 资产 / 接管).
//   renderSimple(el, ctx)   ctx = { sim, snap, openTerm, openFull(tab?) }
// The dial drawings are the 周期 tab's own (tabs/cycle.js longDial / shortDial), so the two never disagree.
// Tapping a dial opens the full layout on 周期. app.js owns the layout state (body[data-layout], localStorage 'mw.layout').
// Reads snapshots only; it never touches the economy. The dials follow the diagram layers (body.layers-on / data-layers, app.js):
// a dial whose layer is not learned yet is left out; with neither, a short note says where they come from.
import { longDial, shortDial } from './tabs/cycle.js';
import { headlineItems, nextStep } from './headline.js';
import { flash, flashConcept } from './links.js';
import { currentCountry, localizeText } from './country-info.js';
import { layerShown } from './progress.js';      // progressive diagram: the SHORT dial comes with L-short, the LONG dial with L-long

const esc = s => String(s ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const KIND_TAG = { lamp: '灯', cycle: '周期', rule: '规则', asset: '水位', rate: '利率' };
let last = null, wiredEl = null;
const PHONE = typeof matchMedia === 'function' ? matchMedia('(max-width: 767.98px)') : null;
// ring-only viewBoxes of the two dials (tabs/cycle.js geometry: long ring centre 150,135 R 76; short nodes at 150±100, 128±75; node r 20)
const CROP = { long: '52 32 210 206', short: '24 28 252 200' };

/* ---------- one dial card (the whole card is one button: → 周期 page) ---------- */
function dialCard(kind, C, t, src) {
  const isLong = kind === 'long', nm = isLong ? '大周期' : '小周期';
  // 真实 mode: twin cards, src = 'model' | 'real' (the same dial rules, run on the model / on the real data); no src = the normal single card
  const tag = src ? `<span class="sp-src sp-src-${src}">${src === 'real' ? '真实' : '模型'}</span>` : '';
  if (!C) {        // 真实 mode after the model's last quarter: no model dial
    return `<div class="sp-dial sp-${kind} sp-twin sp-none" role="button" tabindex="0" data-act="dial" data-kind="${kind}" aria-label="${nm}（模型）：模型只算到最后一季历史数据">` +
      `<div class="sp-dh"><b>${nm}</b>${tag}</div><div class="sp-svg sp-nomodel"><span>模型只算到<br>${esc(t)}</span></div><div class="sp-now"><b>—</b></div></div>`;
  }
  let svg = '';
  try { svg = isLong ? longDial(C) : shortDial(C); } catch (e) { console.error(e); }
  const since = C.since || { t: 0, date: '' };
  const len = t - since.t + 1;
  // the real long dial: its B2 state (pending / confirmed) and the 加分项, straight from advanceCycles
  const b2 = isLong && src === 'real' ? b2Html(C) : '';
  return `<div class="sp-dial sp-${kind}${src ? ' sp-twin sp-' + src : ''}" role="button" tabindex="0" data-act="dial" data-kind="${kind}" aria-label="${nm}${src ? (src === 'real' ? '（真实数据）' : '（模型）') : ''}：${esc(C.label)}。点开周期页看证据">` +
    `<div class="sp-dh"><b>${nm}</b>${tag}<small>${isLong ? '以年计 · 慢变量' : '以季计 · 四盏灯'}</small></div>` +
    `<div class="sp-svg">${svg}</div>` +
    `<div class="sp-now"><b>${esc(C.label)}</b><small>自 ${esc(since.date)} 起 · 已 ${len} 季</small></div>${b2}</div>`;
}
const P = (v, d = 1) => (typeof v === 'number' && isFinite(v) ? (v < 0 ? '−' : '') + Math.abs(v * 100).toFixed(d) + '%' : '—');
function b2Html(L) {
  const st = L.fork === 'B2' ? '<b class="sp-b2 on">B2 已确认</b>' : L.forkPending ? `<b class="sp-b2 pend">B2 待确认 ${L.forkPending.have}/${L.forkPending.need} 季</b>` : '';
  const x = L.forkExtra;
  if (!st && !(x && (L.stage === 1 || L.stage === 2) && L.forkEvidence)) return '';
  const bits = [];
  if (x) {
    if (typeof x.hpDraw === 'number' && isFinite(x.hpDraw)) bits.push(`房价比近年高点 ${x.hpDraw > -0.0005 ? '没跌' : P(x.hpDraw)}`);
    if (typeof x.badRes === 'number' || typeof x.bad === 'number') bits.push(`贷款拖欠 ${P(x.bad)}`);
    else bits.push('银行坏账 没有数据');
  }
  return `<div class="sp-b2row">${st}${bits.length ? `<small class="sp-bonus">加分项：${esc(bits.join(' · '))}</small>` : ''}</div>`;
}

/* ---------- 本季看点 details (same items as the strip under the time bar) ---------- */
function detailsHtml(sim, snap) {
  const prev = snap.t > 0 ? sim.snapshot('model', snap.t - 1) : null;
  let items = [], nx = null;
  try { items = headlineItems(snap, prev, sim); nx = nextStep(snap); } catch (e) { console.error(e); }
  const iso = currentCountry(sim), loc = o => (o && iso !== 'USA' ? { ...o, text: localizeText(o.text, iso), where: localizeText(o.where, iso) } : o);
  items = items.map(loc); nx = loc(nx);
  last.items = items; last.next = nx;
  const row = (it, i, tag, cls = '') => `<li><button type="button" class="sp-item${cls}" data-act="item" data-i="${i}"><span class="hl-tag">${tag}</span>` +
    `<span class="hl-body"><b class="hl-t">${esc(it.text)}</b><small class="hl-w">看：${esc(it.where)}</small></span></button></li>`;
  const rows = !prev ? '<li class="sp-quiet"><span class="hl-tag">起点</span><span class="hl-body"><b class="hl-t">这是起点</b><small class="hl-w">还没有上一季可以比较</small></span></li>'
    : (items.length ? items.map((it, i) => row(it, i, KIND_TAG[it.kind] || '看点')).join('')
      : '<li class="sp-quiet"><span class="hl-tag">平稳</span><span class="hl-body"><b class="hl-t">本季平稳：没有新信号</b><small class="hl-w">灯没变色、没有新规则触发——只需要看「水」是多了还是少了</small></span></li>') +
      (nx ? row(nx, 'next', '下一步', ' hl-next') : '');
  return `<section class="sp-hl" aria-label="本季看点"><h3 class="sp-h">本季看点 <small>${esc(snap.date)}</small></h3><ol class="sp-list">${rows}</ol></section>`;
}

/* ---------- 真实 mode: what the page shows instead of 本季看点 (the strip talks about the model's quarter) ---------- */
function realNoteHtml(R) {
  const src = R.real && R.real.iso === 'AUS' ? 'ABS、RBA、BIS 等' : 'BEA、FRED、BIS 等';
  return `<section class="sp-hl sp-rnote" aria-label="真实数据"><h3 class="sp-h">真实数据 <small>${esc(R.date)} · 截至 ${esc(R.real ? R.real.lastRealDate : '')}</small></h3>` +
    `<ul class="sp-list"><li class="sp-quiet"><span class="hl-tag">来源</span><span class="hl-body"><b class="hl-t">官方统计（${src}），按季</b><small class="hl-w">只能逐季看：⏮ ⏭ 或拖动时间条</small></span></li>` +
    `<li class="sp-quiet"><span class="hl-tag">灰字</span><span class="hl-body"><b class="hl-t">模型估算</b><small class="hl-w">真实统计里没有这一项（比如水流分到哪里、银行审批），显示的是模型的数</small></span></li>` +
    `<li class="sp-quiet"><span class="hl-tag">—</span><span class="hl-body"><b class="hl-t">没有数据</b><small class="hl-w">这一季还没发布，或模型只算到 2025Q4</small></span></li></ul></section>`;
}

// the separate 历史盲测 mode (/blind/), resolved from this module so it works from / and from /free/
const BLIND_URL = new URL('../../blind/', import.meta.url).href;

export function renderSimple(el, ctx) {
  if (!el) return;
  last = { ...ctx };
  const { sim, snap } = ctx;
  if (!sim || !snap) return;
  const town = sim.scenario === 'town', c = snap.cycles;
  const showL = layerShown('L-long'), showS = layerShown('L-short');
  // 真实 mode (ctx.realSnap): each dial twice, 模型 | 真实 (rows = the two cycles; phone keeps the same 2-column grid, so it stacks the cycles)
  const R = ctx.realMode && ctx.realSnap && ctx.realSnap.cycles ? ctx.realSnap : null, M = R ? ctx.modelSnap : null;
  const twin = kind => dialCard(kind, M ? M.cycles[kind] : null, M ? M.t : ctx.modelLastDate || '', 'model') + dialCard(kind, R.cycles[kind], R.t, 'real');
  const dials = c && !town
    ? (showL || showS
      ? (R ? `<div class="sp-dials sp-twins">${showL ? twin('long') : ''}${showS ? twin('short') : ''}</div><p class="sp-hint">同一套表盘规则：左边跑在模型上，右边跑在真实数据上。点表盘 → 「周期」页</p>`
        : `<div class="sp-dials">${showL ? dialCard('long', c.long, snap.t) : ''}${showS ? dialCard('short', c.short, snap.t) : ''}</div><p class="sp-hint">点表盘 → 「周期」页：证据、轨迹、四盏灯</p>`)
      : '<p class="sp-empty sp-locked">周期表盘还没出场：学完「一个会自己转的圈」这一课，这里出现小周期表盘。想先看整张图：点水流图右上角「显示全部」。</p>')
    : `<p class="sp-empty">${town ? '小镇里还没有周期表盘：先看水怎么流。' : '（此版本引擎没有双周期检测）'}</p>`;
  const keep = el.querySelector('.sp-scroll')?.scrollTop || 0;
  const below = town ? '' : R ? realNoteHtml(R) : detailsHtml(sim, snap);
  el.innerHTML = `<div class="sp-scroll pn-cycle">${dials}${below}</div>` +
    `<div class="sp-foot"><button type="button" class="sp-more" data-act="more" aria-label="更多：打开流水账、周期、资产、接管四页">更多<small>流水账 · 周期 · 资产 · 接管</small><i aria-hidden="true">▸</i></button>` +
    `<a class="sp-blind" href="${BLIND_URL}" aria-label="历史盲测：站在某一年年底，判断周期、分配资产">历史盲测<i aria-hidden="true">›</i></a></div>`;
  const sc = el.querySelector('.sp-scroll'); if (sc) sc.scrollTop = keep;
  // phone: the dial is ~170px wide. Crop to the ring (the node names and small print are hidden by simple.css; the centre line names the stage)
  if (PHONE && PHONE.matches) el.querySelectorAll('.sp-dial').forEach(d => d.querySelector('svg')?.setAttribute('viewBox', CROP[d.dataset.kind]));
  if (wiredEl !== el) {
    wiredEl = el;
    if (PHONE) PHONE.addEventListener('change', () => { if (last && wiredEl) renderSimple(wiredEl, last); });
    el.addEventListener('click', onClick);
    el.addEventListener('keydown', e => { if ((e.key === 'Enter' || e.key === ' ') && e.target.closest('[data-act="dial"]')) { e.preventDefault(); onClick(e); } });
  }
}

function onClick(e) {
  const b = e.target.closest('[data-act]');
  if (!b || !last) return;
  const act = b.dataset.act;
  if (act === 'more') last.openFull && last.openFull();
  else if (act === 'dial') last.openFull && last.openFull('cycle');
  else if (act === 'item') {
    const it = b.dataset.i === 'next' ? last.next : (last.items || [])[+b.dataset.i];
    if (!it) return;
    if (it.specs) flash(it.specs, 3000);                   // light up the place in the diagram (left), as the strip does
    else if (it.term) flashConcept(it.term, 2500);
    if (it.term && typeof last.openTerm === 'function') last.openTerm(it.term);
    else if (it.tab && last.openFull) last.openFull(it.tab);
  }
}
