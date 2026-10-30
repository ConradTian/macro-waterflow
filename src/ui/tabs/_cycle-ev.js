// 周期 tab evidence rows: every condition = ruler (how far from the threshold) + where to look in the diagram + 盯住 (pin).
// Also: the one-line "下一步 …：还差 …" summary and the pin watcher (pause the sim when a pinned condition becomes met).
// Reads snapshots only (snap.cycles.{long,short}.evidence, one history lookup per row for the ruler's trail).
import { esc } from './_util.js';
import { thresholdBarHtml } from '../gauge.js';
import { conceptSpecs, nodeElements, flashConcept } from '../links.js';

const ok = v => typeof v === 'number' && isFinite(v);
const MINUS = '−';

/* ---------- formatting ---------- */
export const fmtV = (v, f) => {
  if (!ok(v)) return '—';
  const sg = v < 0 && Math.abs(v) >= (f === 'x' ? 0.005 : 0.0005) ? MINUS : '';
  return f === 'x' ? sg + Math.abs(v).toFixed(2) + '×' : sg + Math.abs(v * 100).toFixed(1) + (f === 'pp' ? 'pp' : '%');
};
const gapOf = e => (e.dir === '>=' ? e.threshold - e.value : e.value - e.threshold);       // > 0 while unmet
const fmtGap = e => { const g = Math.abs(gapOf(e)); return e.fmt === 'x' ? g.toFixed(2) + '×' : (g * 100).toFixed(1) + 'pp'; };   // a % row is short by so many percentage points
const shortName = n => String(n).replace(/（[^）]*）/g, '').trim();
const reqLabel = e => `${shortName(e.name)} ${e.dir === '>=' ? '≥' : '≤'} ${fmtV(e.threshold, e.fmt)}`;

/* ---------- where to look: row term -> short Chinese place name in the diagram ---------- */
// keyed by the target specs of src/ui/links.js (conceptSpecs(term) lists the diagram elements a concept card belongs to)
const PLACE = {
  'n:iou': '地下的洞（欠款）', 'n:bank': '银行', 'v:approval': '银行', 't:policyRate': '央行的吸力旋钮', 'n:cb': '央行的吸力旋钮',
  'n:gov': '政府', 'n:govGross': '政府', 'n:household': '家庭', 'n:firm': '企业',
  'n:channel': '河（测流断面）', 't:cpi': '河（测流断面）', 't:unemployment': '河（测流断面）',
  'n:poolHousing': '房产池', 'n:poolEquity': '股票池', 'n:poolBond': '国债池', 'n:poolGold': '黄金池',
  'p:newLoans': '抽水（放贷）', 'p:principalRepay': '回灌（还本）', 'p:qe': '央行泵（QE）', 'p:taxes': '分水堰的税口', 'p:fiscalInjection': '政府深井泵',
};
export function placeOf(term) {
  if (!term) return '';
  for (const sp of conceptSpecs(term)) if (PLACE[sp]) return PLACE[sp];
  return '';
}

/* ---------- requirements (AND of rows / OR-groups) and the one-line summary ---------- */
function requirements(items) {
  const out = [], seen = new Set();
  for (const e of items) {
    if (e.support) continue;                                   // 加分项: shown, never a requirement
    if (!e.grp) { out.push({ met: e.ok, items: [e] }); continue; }
    if (seen.has(e.grp)) continue;
    seen.add(e.grp);
    const g = items.filter(x => x.grp === e.grp);
    out.push({ met: g.some(x => x.ok), items: g });
  }
  return out;
}
const reqText = r => r.items.map(reqLabel).join(' 或 ');
function missing(items) { return requirements(items).filter(r => !r.met).map(reqText); }
/** true when every requirement (AND of rows / OR-groups) of these items holds (B2 fork sub-conditions) */
export const reqMet = items => requirements(items).every(r => r.met);

/** { text, target } for one dial. headOf(targetKey) -> '⑤ 私人去杠杆' / '降息重启'.
 *  Short cycle: of the candidate phases the one with the fewest missing conditions (then the longest streak) is shown. */
export function nextText(kind, C, headOf) {
  let target, items, prog;
  if (kind === 'long') { target = C.progress.target; items = C.evidence; prog = C.progress; }
  else {
    const cands = (C.progress || []).map(p => ({ p, items: C.evidence.filter(e => e.targetId === p.target) }));
    cands.forEach(c => { c.miss = missing(c.items).length; });
    cands.sort((a, b) => a.miss - b.miss || b.p.have - a.p.have);
    if (!cands.length) return { text: '', target: null };
    target = cands[0].p.target; items = cands[0].items; prog = cands[0].p;
  }
  const miss = missing(items);
  const body = miss.length ? `还差 ${miss.slice(0, 2).join('；')}${miss.length > 2 ? '…' : ''}` : `条件已凑齐，连续达标 ${prog.have}/${prog.need} 季`;
  return { text: `下一步 ${headOf(target)}：${body}`, target };
}

/* ---------- pins (module state: survive the per-quarter re-render, cleared on sim reset) ---------- */
const pins = new Map();            // key -> { kind, target, name, term, label, mark }
let pinSim = null;
const ROWS = new Map();            // key -> row info of the current render (so the toggle can read it)
// src = 'fork' marks the long card's B2-fork rows (snap.cycles.long.forkEvidence: they carry no target, and are not in .evidence)
const pinKey = (kind, e, src) => `${kind}|${src || ''}|${e.target}|${e.name}`;
const watched = new WeakSet();

export function syncPinHighlight() {
  if (typeof document === 'undefined') return;
  const host = document.getElementById('diagram');
  if (!host) return;
  host.querySelectorAll('.cy-pin').forEach(n => n.classList.remove('cy-pin'));
  const seen = new Set();
  for (const p of pins.values()) {
    if (!p.term || seen.has(p.term)) continue;
    seen.add(p.term);
    try { nodeElements(p.term).forEach(n => n.classList.add('cy-pin')); } catch (e) { /* ignore */ }
  }
}
export function clearPins() { pins.clear(); syncPinHighlight(); }

function onStep(snap) {
  if (!pins.size) return;
  const fired = [];
  for (const [key, p] of pins) {
    const C = snap?.cycles?.[p.kind];
    if (!C) continue;
    const list = (p.src === 'fork' ? C.forkEvidence : C.evidence) || [];
    const it = list.find(x => x.name === p.name && x.target === p.target);
    if (!it) { pins.delete(key); continue; }                    // that stage was left: the row no longer exists
    if (it.ok) {
      const items = list.filter(x => x.target === p.target);
      const miss = missing(items);
      fired.push(`「${p.label}」达标了（${p.mark} ${miss.length ? '还差 ' + miss.slice(0, 2).join('；') + (miss.length > 2 ? '…' : '') : '条件已凑齐'}）`);
      pins.delete(key);
    }
  }
  syncPinHighlight();
  if (fired.length && typeof document !== 'undefined') document.dispatchEvent(new CustomEvent('mw:pause', { detail: { message: fired.join('；') } }));
}
/** Call from render(): follows the sim (new sim or going back in time = reset) and registers the step watcher once per sim. */
export function initPins(ctx) {
  const sim = ctx.sim;
  if (pinSim && pinSim !== sim) pins.clear();
  pinSim = sim;
  if (sim && typeof sim.on === 'function' && !watched.has(sim)) {
    watched.add(sim);
    sim.on('reset', () => { if (pinSim === sim) clearPins(); });
    sim.on('step', s => { if (pinSim === sim) { try { onStep(s); } catch (e) { /* never break the sim */ } } });
  }
}

/* ---------- rows ---------- */
function trailOf(ctx, kind, e, src) {
  const out = [], sim = ctx.sim, snap = ctx.snap;
  if (!sim || !snap) return out;
  const br = snap.branch || 'model';
  // 真实 mode: snap is the REAL snapshot; its earlier quarters come from the real dial run (ctx.realHist = realTimeline)
  const at = br === 'real' && Array.isArray(ctx.realHist) ? t => ctx.realHist[t] : t => sim.snapshot(br, t);
  for (let k = 8; k >= 1; k--) {
    if (snap.t - k < 0) continue;
    let it = null;
    try { const s = at(snap.t - k); it = (src === 'fork' ? s?.cycles?.[kind]?.forkEvidence : s?.cycles?.[kind]?.evidence)?.find(x => x.name === e.name && x.target === e.target); } catch (err) { it = null; }
    if (it && ok(it.value)) out.push(it.value);
  }
  return out;
}

function rowHtml(e, o) {
  const key = pinKey(o.kind, e, o.src), place = placeOf(e.term), pinned = pins.has(key);
  ROWS.set(key, { kind: o.kind, src: o.src, target: e.target, name: e.name, term: e.term, label: reqLabel(e), mark: o.mark, ok: e.ok });
  const bar = thresholdBarHtml({ value: e.value, threshold: e.threshold, dir: e.dir, fmt: e.fmt, trail: trailOf(o.ctx, o.kind, e, o.src) });
  const bits = [e.ok ? '' : `<span class="cy-gap">还差 ${fmtGap(e)}</span>`, place ? `<span class="cy-where">看：${esc(place)}</span>` : ''].filter(Boolean).join('');
  // a 加分项 (e.support) is never pinned and never "needed": it reads 有 / 没有 instead of ✔ / ✖
  const sup = !!e.support;
  // 盯住 pauses a playing sim: 真实 mode has no play, so no pins there
  const pin = e.ok || sup || (o.ctx && o.ctx.realMode) ? '' : `<button type="button" class="cy-pin-btn" data-pk="${esc(key)}" aria-pressed="${pinned}" title="盯住这一项：它达标时暂停并提醒你">${pinned ? '★ 盯住中' : '☆ 盯住'}</button>`;
  const state = sup ? (e.ok ? '加分项：有' : '加分项：没有') : e.ok ? '已达标' : '未达标';
  return `<li class="cy-ev ${e.ok ? 'ok' : 'no'}${sup ? ' sup' : ''}${pinned ? ' pinned' : ''}${pin ? ' has-pin' : ''}">` +
    `<button type="button" class="cy-rowbtn" data-evterm="${esc(e.term || '')}" aria-label="${esc(e.name + '：' + state + (place ? '，在图里看' + place : ''))}">` +
    `<span class="cy-mk" aria-hidden="true">${sup ? (e.ok ? '+' : '·') : e.ok ? '✔' : '✖'}</span><span class="cy-en">${esc(e.name)}</span>` +
    `<span class="cy-vals"><b>${fmtV(e.value, e.fmt)}</b> <i>${sup ? '参考' : '需'} ${e.dir === '>=' ? '≥' : '≤'} ${fmtV(e.threshold, e.fmt)}</i></span>` +
    `<span class="cy-l2">${bar}<span class="cy-l2t">${sup ? (place ? `<span class="cy-where">看：${esc(place)}</span>` : '') : bits}</span></span><span class="cy-sr">${state}</span></button>${pin}</li>`;
}

/** items: one target's evidence; o = { kind: 'long'|'short', ctx, mark, src? } (mark = how the target is called in the pause message; src 'fork' = B2-fork rows of the long card) */
export function evidenceList(items, o) {
  const out = [], seen = new Set(), sup = items.filter(e => e.support);
  for (const e of items) {
    if (e.support) continue;
    if (!e.grp) { out.push(rowHtml(e, o)); continue; }
    if (seen.has(e.grp)) continue;
    seen.add(e.grp);
    const grp = items.filter(x => x.grp === e.grp);
    out.push(grp.length > 1
      ? `<li class="cy-or-box"><span class="cy-orcap">下面任一项达标即可</span><ul>${grp.map(x => rowHtml(x, o)).join('')}</ul></li>`
      : rowHtml(e, o));
  }
  if (sup.length) out.push(`<li class="cy-or-box cy-sup-box"><span class="cy-orcap">加分项（不计入门槛，只帮你判断）</span><ul>${sup.map(x => rowHtml(x, o)).join('')}</ul></li>`);
  return `<ul class="cy-evl">${out.join('')}</ul>`;
}
export function beginRows() { ROWS.clear(); }

/** ?pin=<name fragment | index of the unmet row> (screenshots / links): pins one unmet row, once. */
let urlPinDone = false;
export function applyUrlPin(ctx) {
  if (urlPinDone || typeof location === 'undefined') return false;
  urlPinDone = true;
  const q = new URLSearchParams(location.search).get('pin');
  if (q == null || q === '') return false;
  const unmet = [...ROWS.entries()].filter(([, r]) => !r.ok);
  const hit = /^\d+$/.test(q) ? unmet[+q] : unmet.find(([, r]) => r.name.includes(q));
  if (hit) { pins.set(hit[0], { ...hit[1] }); pinSim = ctx.sim; return true; }
  return false;
}

/* ---------- interaction ---------- */
export function wireEvidence(container, ctx) {
  container.querySelectorAll('.cy-rowbtn').forEach(b => b.addEventListener('click', () => {
    const term = b.dataset.evterm;
    if (!term) return;
    try { ctx.openTerm(term); } catch (e) { /* ignore */ }
    setTimeout(() => { try { flashConcept(term, 2400); } catch (e) { /* ignore */ } }, 80);   // after the card has marked its parts: pulse just this one
  }));
  container.querySelectorAll('.cy-pin-btn').forEach(b => b.addEventListener('click', ev => {
    ev.stopPropagation();
    const key = b.dataset.pk, row = ROWS.get(key);
    if (!row) return;
    pinSim = ctx.sim;
    if (pins.has(key)) pins.delete(key); else pins.set(key, { ...row });
    const on = pins.has(key);
    b.setAttribute('aria-pressed', String(on));
    b.textContent = on ? '★ 盯住中' : '☆ 盯住';
    b.closest('.cy-ev').classList.toggle('pinned', on);
    syncPinHighlight();
  }));
  syncPinHighlight();
}
