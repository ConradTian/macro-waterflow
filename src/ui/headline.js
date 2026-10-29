// 本季看点 strip: "what is new THIS quarter and where do I look?" (fixed under the time bar, every tab).
//   headlineItems(snap, prev, sim) -> [{ kind, text, where, term?, specs?, tab? }]   DOM-free (a Node checker runs it), at most 3 items
//   nextStep(snap)                 -> { text, where, tab } | null                     "下一步 … 还差 …" from the short-cycle dial's evidence
//   ruleKey / freshness helpers    shared with the ledger tab (新触发 vs 持续中)
//   renderHeadline(el, ctx)        paints the strip; ctx = { sim, snap, openTerm, setTab }
// Priority of the items (current snapshot vs the previous quarter):
//   0 the hand-off between the dials (long cycle takes the B2 fork / 降息推不动 -> 交给大周期): the main line, never cut by the 3-item limit
//   1 a lamp changed colour  2 a cycle dial moved stage / a cycle condition became true  3 a ledger rule newly triggered
//   4 an asset pool is at a new high / a 12-quarter low  5 the policy rate moved >= 25bp
// Detection/teaching layer only: it reads snapshots, never touches the economy.
import { linksForEntry, LAMP_LINKS, flash, flashConcept } from './links.js';
import { KEY_LABEL } from '../engine/regimes.js';
import { nextText } from './tabs/_cycle-ev.js';
import { currentCountry, localizeText } from './country-info.js';

/* ------------------------------------------------------------------ vocabulary */
const LAMPS = {
  credit:      { name: '信贷灯', term: 'lampCredit',      where: '放贷 / 还本管道' },
  debtService: { name: '偿债灯', term: 'lampDebtService', where: '家庭 DSR、付息 / 还本管道' },
  policy:      { name: '政策灯', term: 'lampPolicy',      where: '央行「政策利率」' },
  valuation:   { name: '估值灯', term: 'lampValuation',   where: '房产池、股票池水位' },
};
const LV = { green: '绿', yellow: '黄', red: '红' };
const ASSETS = [
  ['housing', '房价', 'housePrice', '房产池水位', 'poolHousing'],
  ['equity', '股价', 'equityAsset', '股票池水位', 'poolEquity'],
  ['bond', '国债价格', 'bondAsset', '国债池水位', 'poolBond'],
  ['gold', '金价', 'goldAsset', '黄金池水位', 'poolGold'],
];
// short rule names for the ledger rules (a player + one of these = "银行「因坏账收紧」")
export const RULE_NAME = {
  cb_taylor: '泰勒规则调息', cb_qe: 'QE 开关', gov_real_path: '真实赤字', gov_stimulus: '加码财政', gov_austerity: '财政紧缩', gov_bank_recap: '注资银行',
  bank_loosen: '放宽审批', bank_tighten_losses: '因坏账收紧', bank_tighten_collateral: '因抵押品收紧', bank_rebuild_capital: '先补资本',
  hh_chase: '追涨 / 观望', hh_deleverage: '去杠杆', hh_overhang: '债务悬压', firm_capex_up: '加 Capex', firm_capex_cut: '削 Capex',
  inv_momentum: '追涨', inv_riskoff: '避险', foreign_funding: '要求更高期限溢价', shock_gdp: '产出冲击', shock_oil: '油价冲击',
};
const PLAYER_NAME = { centralBank: '央行', government: '政府', bank: '银行', household: '家庭', firm: '企业', investor: '投资者', foreign: '外国' };
const PLAYER_ORDER = ['bank', 'centralBank', 'government', 'household', 'investor', 'firm', 'foreign'];
const num = x => typeof x === 'number' && Number.isFinite(x);

/* ------------------------------------------------------------------ ledger helpers (shared with tabs/ledger.js) */
/** identity of "the same rule of the same player" across quarters */
export const ruleKey = e => `${e.player}|${e.ruleId || String(e.rule || '').slice(0, 14)}`;
/** direction-aware signature of what the action does: digits are dropped, but "a → b" keeps up/down and "×x" keeps >1 / <1 */
export function actionSig(e) {
  const a = String(e.action || '');
  const m = /(-?\d+(?:\.\d+)?)%?\s*→\s*(-?\d+(?:\.\d+)?)/.exec(a);
  const dir = m ? (+m[2] > +m[1] ? 'up' : +m[2] < +m[1] ? 'down' : 'flat') : '';
  const mult = /×\s*(\d+(?:\.\d+)?)/.exec(a);
  const mdir = mult ? (+mult[1] > 1.0001 ? 'gt1' : +mult[1] < 0.9999 ? 'lt1' : 'eq1') : '';
  return a.replace(/-?\d+(?:\.\d+)?/g, '#') + '|' + dir + '|' + mdir;
}
/** For the entries of one quarter, compare with the quarter before: fresh = 新触发 (rule not present last quarter),
 *  changed = continuing, but the action changed direction / kind. */
export function freshness(entries, prevEntries) {
  const last = new Map();
  for (const p of prevEntries || []) last.set(ruleKey(p), p);
  return (entries || []).map(e => {
    const p = last.get(ruleKey(e));
    return { e, fresh: !p, changed: !!p && actionSig(p) !== actionSig(e) };
  });
}

/* ------------------------------------------------------------------ formatting */
const pc = (v, d = 1) => (v < 0 ? '−' : '') + Math.abs(v * 100).toFixed(d) + '%';
const pcRate = v => (v * 100).toFixed(2).replace(/0$/, '') + '%';
const ppf = (v, signed) => (Math.abs(v) < 0.0005 ? '0' : v < 0 ? '−' : signed ? '+' : '') + (Math.abs(v) < 0.0005 ? '' : Math.abs(v * 100).toFixed(1)) + 'pp';
export function fv(v, fmt, signed = false) {
  if (!num(v)) return '—';
  if (fmt === 'pp') return ppf(v, signed);
  if (fmt === 'x') return v.toFixed(2) + '×';
  if (fmt === 'num') return v.toFixed(2);
  return pc(v);
}
const cmp = d => (d === '<=' ? '≤' : '≥');

/* ------------------------------------------------------------------ items */
export function headlineItems(snap, prev, sim) {
  if (!snap) return [];
  if (!prev && sim && typeof sim.snapshot === 'function' && snap.t > 0) prev = sim.snapshot('model', snap.t - 1);
  if (!prev) return [];
  const out = [];

  // 1. lamps
  for (const k of Object.keys(LAMPS)) {
    const a = prev.lights?.[k]?.level, b = snap.lights?.[k]?.level;
    if (a && b && a !== b) {
      const L = LAMPS[k];
      out.push({ kind: 'lamp', text: `${L.name} ${LV[a]}→${LV[b]}`, where: L.where, term: L.term, specs: LAMP_LINKS[k] });
    }
  }

  // 2. cycle dials: stage moved, or the next-stage condition just became true
  const cl = snap.cycles?.long, pl = prev.cycles?.long, cs = snap.cycles?.short, ps = prev.cycles?.short;
  if (cl && pl && cl.stage !== pl.stage)
    out.push({ kind: 'cycle', text: `大周期 ${stageNo(pl.label)}→${stageNo(cl.label)}`, where: '「周期」页 · 大周期表盘', tab: 'cycle' });
  else if (cl && pl && cl.met && !pl.met && cl.progress)
    out.push({ kind: 'cycle', text: `大周期 → ${stageNo(cl.progress.label)} 的条件达标`, where: '「周期」页 · 大周期表盘', tab: 'cycle' });
  if (cs && ps && cs.key !== ps.key)
    out.push({ kind: 'cycle', text: `小周期 ${KEY_LABEL[ps.key] || ps.key}→${KEY_LABEL[cs.key] || cs.key}`, where: '「周期」页 · 小周期表盘', tab: 'cycle' });
  else if (cs && ps && Array.isArray(cs.progress)) {
    const was = new Map((ps.progress || []).map(p => [p.target, p.met]));
    const hit = cs.progress.find(p => p.met && was.get(p.target) === false);
    if (hit) out.push({ kind: 'cycle', text: `小周期「${hit.label}」的条件达标`, where: '「周期」页 · 小周期表盘', tab: 'cycle' });
  }

  // the link between the two dials (shown first so the 3-item limit never drops it)
  const hand = [];
  if (cl && pl && cl.fork === 'B2' && pl.fork !== 'B2')
    hand.push({ kind: 'cycle', text: '大周期走上 B2 岔路', where: '「周期」页 · 大周期表盘（②→⑤ 的 B2 岔路）', tab: 'cycle' });
  if (cs && ps && cs.handoff === 'no' && ps.handoff !== 'no')
    hand.push({ kind: 'cycle', text: '降息推不动 → 交给大周期', where: '「周期」页 · 小周期表盘（降息 → 大周期 ⑤）', tab: 'cycle' });
  out.unshift(...hand);

  // 3. ledger rules newly triggered (same player + rule was not in last quarter's ledger)
  const fr = freshness(snap.ledger, prev.ledger).filter(x => x.fresh && x.e.ruleId !== 'cb_real_path');   // the Fed path is covered by item 5
  fr.sort((a, b) => PLAYER_ORDER.indexOf(a.e.player) - PLAYER_ORDER.indexOf(b.e.player));
  for (const { e } of fr) {
    const nm = RULE_NAME[e.ruleId];
    out.push({
      kind: 'rule', text: `${PLAYER_NAME[e.player] || e.player}${nm ? `「${nm}」` : '的规则'}新触发`,
      where: `「流水账」里 ${PLAYER_NAME[e.player] || ''}那一条`, specs: linksForEntry(e), tab: 'ledger',
    });
  }

  // 4. asset pools: a NEW all-time high / 12-quarter low (only the first quarter of a run counts, not every quarter of a boom)
  if (sim && typeof sim.snapshot === 'function' && snap.t >= 13) {
    for (const [k, name, term, where, part] of ASSETS) {
      const st = assetState(sim, k, snap.t);
      if (st && assetState(sim, k, snap.t - 1) !== st)
        out.push({ kind: 'asset', text: st === 'high' ? `${name}创新高` : `${name} 12 季新低`, where, term, specs: { parts: [part], pipes: [] } });
    }
  }

  // 5. policy rate moved >= 25bp
  const r0 = prev.rates?.policy, r1 = snap.rates?.policy;
  if (num(r0) && num(r1) && Math.abs(r1 - r0) >= 0.0025 - 1e-9)
    out.push({ kind: 'rate', text: `政策利率 ${pcRate(r0)}→${pcRate(r1)}`, where: '央行「政策利率」', term: 'policyRate', specs: { parts: ['centralBank'], pipes: [] } });

  return out.slice(0, 3);
}
// 'high' = price above every earlier quarter; 'low' = lowest of the last 12 quarters and >= 5% under their peak; else null
function assetState(sim, k, t) {
  const price = i => { const v = sim.snapshot('model', i)?.assets?.[k]?.price; return num(v) ? v : null; };
  const p = price(t);
  if (p == null) return null;
  let max = -Infinity, win = Infinity, winMax = -Infinity, n = 0;
  for (let i = 0; i < t; i++) {
    const q = price(i);
    if (q == null) continue;
    n++; max = Math.max(max, q);
    if (t - i <= 12) { win = Math.min(win, q); winMax = Math.max(winMax, q); }
  }
  if (n < 12) return null;
  if (p > max) return 'high';
  if (p < win && winMax > 0 && p <= 0.95 * winMax) return 'low';
  return null;
}
const stageNo = label => String(label || '').split(' ')[0];

/* ------------------------------------------------------------------ 下一步 … 还差 … */
// same wording as the 周期 tab (one helper, so the strip and the tab never disagree)
export function nextStep(snap) {
  const sh = snap?.cycles?.short;
  if (!sh || !Array.isArray(sh.progress) || !sh.progress.length) return null;
  const { text } = nextText('short', sh, k => KEY_LABEL[k] || k);
  return text ? { text, where: '「周期」页 · 小周期的「还差什么」', tab: 'cycle' } : null;
}

/* ------------------------------------------------------------------ DOM */
const KIND_TAG = { lamp: '灯', cycle: '周期', rule: '规则', asset: '水位', rate: '利率' };
const esc = s => String(s ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
let host = null, last = null, open = false, pulseTimer = 0, wiredEl = null;
try { open = new URLSearchParams(location.search).get('headline') === 'open'; } catch (e) { /* node */ }

export function renderHeadline(el, ctx) {
  if (!el) return;
  host = el; last = ctx;
  const { sim, snap } = ctx;
  if (!snap || !sim || sim.scenario === 'town') { el.hidden = true; return; }
  el.hidden = false;
  const prev = snap.t > 0 ? sim.snapshot('model', snap.t - 1) : null;
  let items = [], nx = null;
  try { items = headlineItems(snap, prev, sim); nx = nextStep(snap); } catch (e) { console.error(e); }
  const iso = currentCountry(sim), loc = o => (o && iso !== 'USA' ? { ...o, text: localizeText(o.text, iso), where: localizeText(o.where, iso) } : o);   // country view: US-only words swapped
  items = items.map(loc); nx = loc(nx);
  last.items = items; last.next = nx;
  const quiet = prev && !items.length;
  const sum = !prev ? '这是起点，还没有上一季可以比较' : quiet ? '本季平稳：没有新信号' : items.slice(0, 2).map(i => esc(i.text)).join(' · ');
  const more = items.length > 2 ? `<span class="hl-more">+${items.length - 2}</span>` : '';
  const rows = items.map((it, i) => `<li><button type="button" class="hl-item" data-i="${i}"><span class="hl-tag">${KIND_TAG[it.kind] || '看点'}</span>` +
    `<span class="hl-body"><b class="hl-t">${esc(it.text)}</b><small class="hl-w">看：${esc(it.where)}</small></span></button></li>`).join('') +
    (quiet ? '<li class="hl-quiet"><span class="hl-tag">平稳</span><span class="hl-body"><b class="hl-t">本季平稳：没有新信号</b><small class="hl-w">灯没变色、没有新规则触发——只需要看「水」是多了还是少了</small></span></li>' : '') +
    (nx ? `<li><button type="button" class="hl-item hl-next" data-i="next"><span class="hl-tag">下一步</span><span class="hl-body"><b class="hl-t">${esc(nx.text)}</b><small class="hl-w">看：${esc(nx.where)}</small></span></button></li>` : '');
  el.className = 'headline' + (open ? ' open' : '') + (el.classList.contains('hl-pulse') ? ' hl-pulse' : '');
  el.innerHTML = `<button type="button" class="hl-bar" aria-expanded="${open}" aria-controls="hl-list"><b class="hl-date">${esc(snap.date)}</b>` +
    `<span class="hl-lab">本季看点：</span><span class="hl-sum">${sum}</span>${more}<i class="hl-caret" aria-hidden="true">${open ? '▴' : '▾'}</i></button>` +
    `<ol class="hl-list" id="hl-list" ${open ? '' : 'hidden'}>${rows}</ol>`;
  if (wiredEl !== el) { wiredEl = el; el.addEventListener('click', onClick); document.addEventListener('click', onOutside); }
}

function setOpen(v) {
  open = !!v;
  if (host && last) renderHeadline(host, last);
}
function onOutside(e) { if (open && host && !host.contains(e.target)) setOpen(false); }
function onClick(e) {
  if (e.target.closest('.hl-bar')) { setOpen(!open); return; }
  const b = e.target.closest('.hl-item');
  if (!b || !last) return;
  const it = b.dataset.i === 'next' ? last.next : (last.items || [])[+b.dataset.i];
  if (!it) return;
  setOpen(false);                                     // get out of the way so the lit-up place in the diagram is visible
  if (it.specs) flash(it.specs, 3000);
  else if (it.term) flashConcept(it.term, 2500);
  if (it.term && typeof last.openTerm === 'function') last.openTerm(it.term);
  else if (it.tab && typeof last.setTab === 'function') last.setTab(it.tab);
}

/** lessons: draw the eye to the strip (and optionally expand it) */
export function pulseHeadline(expand = false) {
  if (!host) return;
  if (expand) open = true;
  host.classList.add('hl-pulse');
  clearTimeout(pulseTimer);
  pulseTimer = setTimeout(() => host && host.classList.remove('hl-pulse'), 3500);
  if (last) renderHeadline(host, last);
}
export function closeHeadline() { if (open) setOpen(false); }
