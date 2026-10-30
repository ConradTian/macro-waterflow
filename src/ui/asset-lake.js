// 湖 zoom: the asset page of course v3 (tools/DESIGN-v3.md, 「Asset page (A4)」). Pure HTML builders; the panel lifecycle lives in
// src/ui/investor-lab.js (panel id 'lake'), which calls lakeHtml(st, snap, hist) whenever the sim's quarter changes and lakeAct() on taps.
//   top:   现金 | 国债 | 股票 | 房子, 黄金 aside. Each pool: width = how big (narrow pools jump more), water = price vs a year ago,
//          the pipe that lands in it (QE → 国债, 政府深井泵 → 现金, 抽水 → 房子) and its 泉眼 wired from the 分水堰.
//   tap:   a class opens its sub-pools, LEFT = 看吸力 (stable or far 泉眼), RIGHT = 看水量 (river flow).
//          股票 = the three read-only sub-indices of src/data/sub-index.js (稳股 / 成长股 / 周期股).
//   pipe:  the narrow middle pipe between the cash lake and the risk pools: drifts right when cutting, pulled back left when
//          overheating, rushes back in fear, blocked in B2 (read from the engine's dials; nothing is decided here).
import { subIndices } from '../data/sub-index.js';

const esc = s => String(s ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const ok = v => typeof v === 'number' && isFinite(v);
const MINUS = '−';
const pct = (v, d = 0) => (ok(v) ? (v > 0 ? '+' : v < 0 ? MINUS : '') + Math.abs(v * 100).toFixed(d) + '%' : '—');

export function ensureLakeCss() {
  if (typeof document === 'undefined') return;
  if ([...document.styleSheets].some(s => (s.href || '').includes('asset-lake.css')) || document.querySelector('link[data-css="asset-lake.css"]')) return;
  const l = document.createElement('link'); l.rel = 'stylesheet'; l.dataset.css = 'asset-lake.css';
  l.href = new URL('../../assets/css/asset-lake.css', import.meta.url).href;
  document.head.appendChild(l);
}

// the big classes. flows = snapshot.flows keys of the pipe that lands in the pool; spring = the 泉眼 wired from the 分水堰
export const LAKE_CLASSES = [
  { k: 'cash', name: '现金', asset: 'cash', part: 'cash', pipe: '政府深井泵', flows: ['fiscalInjection'], spring: null },
  { k: 'bond', name: '国债', asset: 'bond', part: 'poolBond', pipe: '央行泵（QE）', flows: ['qe'], spring: { name: '利息', flow: 'coupons' } },
  { k: 'equity', name: '股票', asset: 'equity', part: 'poolEquity', pipe: '湖里挪过来的钱', flows: ['toEquity'], spring: { name: '分红', flow: 'dividends' } },
  { k: 'house', name: '房子', asset: 'housing', part: 'poolHousing', pipe: '抽水（银行放贷）', flows: ['newLoans'], spring: { name: '租金', flow: 'rent' } },
  { k: 'gold', name: '黄金', asset: 'gold', part: 'poolGold', pipe: '怕的时候挪过来', flows: ['toGold'], spring: null, aside: true },
];
// sub-pools: L = 看吸力 (stable or far 泉眼), R = 看水量 (river flow)
const SUBS = {
  cash: { L: [{ name: '定期存款', why: '吸力越大，存在湖里越划算。', narrow: false }],
          R: [{ name: '活期（工资账户）', why: '河的水量：工资从分水堰流进来，花出去又回到河里。', narrow: false }] },
  bond: { L: [{ name: '长期国债', why: '泉眼远（10 年后才还本）：吸力 ↑，价格 ↓（跷跷板）。', narrow: false }],
          R: [{ name: '公司债', why: '利息靠企业利润：河干了，先出事。', narrow: true }] },
  house: { L: [{ name: '好地段自住房', why: '租金稳：主要看按揭利率，也就是吸力。', narrow: false }],
           R: [{ name: '投资房、新盘', why: '看抽水泵：银行放不放贷。抽水停了，这里先跌。', narrow: true }] },
  gold: { L: [{ name: '黄金', why: '没有泉眼：只看吸力（实际利率）和怕。', narrow: true }], R: [] },
};

// the narrow middle pipe (cash lake ↔ risk pools), read from the engine's dials
export function middlePipe(snap) {
  const L = snap?.cycles?.long, S = snap?.cycles?.short, rp = snap?.rates?.riskPremium;
  if (L && (L.fork === 'B2' || L.stage === 5)) return { k: 'blocked', pos: 50, t: '堵住：地下水位跌破吸程线（B2），降息也推不动水往右走。' };
  if (ok(rp) && rp > 0.065) return { k: 'fear', pos: 4, t: '怕：水冲回现金湖。' };
  if (S?.phase === 'ease') return { k: 'right', pos: 82, t: '降息：细管往右漂，水流向股票、房子。' };
  if (S?.phase === 'hot' || S?.phase === 'tight') return { k: 'left', pos: 22, t: '过热、收紧：吸力变大，细管被拉回左边。' };
  return { k: 'mid', pos: 55, t: '平常：细管在中间，慢慢往右。' };
}

function yearAgo(hist, snap) {
  if (!Array.isArray(hist) || !snap) return null;
  const i = hist.findIndex(h => h && h.date === snap.date);
  const j = (i < 0 ? hist.length - 1 : i) - 4;
  return j >= 0 ? hist[j] : null;
}
const flowOf = (snap, keys) => keys.reduce((a, k) => a + (ok(snap?.flows?.[k]) ? Math.max(0, snap.flows[k]) : 0), 0);

function poolHtml(C, snap, prev, maxLevel, sel) {
  const A = snap?.assets?.[C.asset] || {}, P = prev?.assets?.[C.asset] || {};
  const chg = C.k === 'cash' ? null : ok(A.price) && ok(P.price) && P.price ? A.price / P.price - 1 : null;
  const share = ok(A.level) && maxLevel > 0 ? Math.max(0, A.level) / maxLevel : 0.5;
  const w = Math.round(38 + 62 * Math.sqrt(share));                          // narrow pools are drawn narrow
  const fill = C.k === 'cash' ? 55 : Math.round(Math.max(8, Math.min(95, 50 + (ok(chg) ? chg : 0) * 150)));
  const inflow = flowOf(snap, C.flows), total = ['fiscalInjection', 'qe', 'toEquity', 'newLoans', 'toGold'].reduce((a, k) => a + flowOf(snap, [k]), 0);
  const pipeW = total > 0 ? Math.max(1, Math.round(inflow / total * 8)) : 1;
  const rr = snap?.rates?.realPolicy;
  const read = C.k === 'cash' ? `吸力 ${pct(rr, 1)}` : `比一年前 ${pct(chg)}`;
  const spring = C.spring ? `<span class="alk-spring" title="${esc(C.spring.name)}从分水堰接过来">泉眼：${esc(C.spring.name)}</span>`
    : `<span class="alk-spring none">${C.k === 'cash' ? '吸力泵' : '没有泉眼'}</span>`;
  return `<button type="button" class="alk-pool p-${C.k}${sel ? ' on' : ''}${C.aside ? ' aside' : ''}" data-act="cls" data-k="${C.k}" aria-pressed="${sel}">
    ${spring}<span class="alk-in" style="--pw:${pipeW}px"><i></i><small>${esc(C.pipe)}</small></span>
    <span class="alk-tank" style="width:${w}%"><span class="alk-water" style="height:${fill}%"></span></span>
    <b class="alk-name">${esc(C.name)}</b><span class="alk-read">${esc(read)}</span></button>`;
}

function subTile(s, extra = '') {
  return `<li class="alk-sub${s.narrow ? ' narrow' : ''}"><b>${esc(s.name)}</b>${extra}<small>${esc(s.why)}</small></li>`;
}
function spark(series) {
  const v = (series || []).slice(-16).map(p => p.price).filter(ok);
  if (v.length < 2) return '';
  const lo = Math.min(...v), hi = Math.max(...v), w = 90, h = 22, sp = hi - lo || 1;
  const d = v.map((y, i) => (i ? 'L' : 'M') + (i / (v.length - 1) * (w - 2) + 1).toFixed(1) + ',' + (h - 2 - (y - lo) / sp * (h - 4)).toFixed(1)).join('');
  return `<svg class="alk-spk" viewBox="0 0 ${w} ${h}" width="${w}" height="${h}" aria-hidden="true"><path d="${d}"/></svg>`;
}
function subsHtml(k, snap, hist) {
  const C = LAKE_CLASSES.find(c => c.k === k);
  if (!C) return '';
  let L, R;
  if (k === 'equity') {
    const upto = Array.isArray(hist) && hist.length ? hist.slice(0, Math.max(1, hist.findIndex(h => h?.date === snap?.date) + 1 || hist.length)) : [snap];
    const S = Object.fromEntries(subIndices(upto).map(s => [s.k, s]));
    const tile = s => subTile(s, `<span class="alk-sv">比一年前 <b>${pct(s.chg4q)}</b>${spark(s.series)}</span>`);
    L = [S.growth, S.stable].filter(Boolean).map(tile).join('');
    R = [S.cyclical].filter(Boolean).map(tile).join('');
  } else {
    L = (SUBS[k]?.L || []).map(s => subTile(s)).join('');
    R = (SUBS[k]?.R || []).map(s => subTile(s)).join('') || '<li class="alk-sub empty"><small>没有：黄金不跟河的水量走。</small></li>';
  }
  const note = k === 'equity' ? '<p class="alk-note">三个小池子是只读的分指数：用模型里股票的同一条公式，只改两个数（泉眼跟河水量的弹性、泉眼有多远），不回头影响模型。</p>' : '';
  return `<section class="alk-open" aria-label="${esc(C.name)}的小池子"><h4>${esc(C.name)}：左边看吸力，右边看水量</h4>
    <div class="alk-cols"><div><p class="alk-side">← 看吸力（泉眼稳或远）</p><ul>${L}</ul></div>
    <div><p class="alk-side">看水量（河的流量）→</p><ul>${R}</ul></div></div>${note}</section>`;
}

export function lakeHtml(st, snap, hist) {
  if (!snap || !snap.assets) return '<p class="ivl-note">这个面板要读模拟（没有读到湖的数据）。</p>';
  const prev = yearAgo(hist, snap);
  const maxLevel = Math.max(...LAKE_CLASSES.map(c => snap.assets[c.asset]?.level).filter(ok), 1);
  const pools = LAKE_CLASSES.filter(c => !c.aside).map(c => poolHtml(c, snap, prev, maxLevel, st.sel === c.k)).join('');
  const gold = LAKE_CLASSES.filter(c => c.aside).map(c => poolHtml(c, snap, prev, maxLevel, st.sel === c.k)).join('');
  const mp = middlePipe(snap);
  const pipe = `<div class="alk-mid k-${mp.k}" role="img" aria-label="中间那根细管：${esc(mp.t)}">
    <span class="alk-end">现金湖</span><span class="alk-track"><i style="left:${mp.pos}%"></i>${mp.k === 'blocked' ? '<b class="x">✕</b>' : ''}</span><span class="alk-end">股票 · 房子</span></div>
    <p class="alk-midt"><b>中间那根细管</b>　${esc(mp.t)}</p>`;
  return `<div class="ivl-head"><b>湖：钱放哪？</b><span class="ivl-date">${esc(snap.date || '')}</span></div>
    <div class="alk">
      <div class="alk-weir"><span>分水堰</span><small>利息、分红、租金从这里接到各个池子的泉眼</small></div>
      <div class="alk-row"><div class="alk-main">${pools}</div><div class="alk-side-pool">${gold}</div></div>
      ${pipe}
    </div>
    ${st.sel ? subsHtml(st.sel, snap, hist) : '<p class="alk-hint">点一个池子，看里面的小池子。</p>'}
    <ul class="alk-rules">
      <li><b>窄池子跳得多</b>：同样多的水，倒进窄池子，水位升得高。</li>
      <li><b>水从管子落点进湖</b>：央行泵（QE）→ 国债，政府深井泵 → 现金，银行抽水 → 房子。所以美国 2009 年的顺序是 债 → 股 → 房（抽水管堵了，房子最后）。</li>
      <li><b>中间那根细管</b>：降息往右漂，过热被拉回左边，怕的时候冲回现金，B2 时堵住。</li>
    </ul>`;
}

export function lakeAct(st, act, b) {
  if (act === 'cls') { const k = b.dataset.k; st.sel = st.sel === k ? null : k; return LAKE_CLASSES.find(c => c.k === k)?.part || null; }
  return null;
}
