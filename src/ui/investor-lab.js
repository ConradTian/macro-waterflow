// 投资者 lab: the interactive panels of the capstone lesson 「投资者」 (src/data/lesson-investor.js).
// A lesson step with `panel: { id, ... }` mounts one panel into a host element:
//   mountInvestorPanel(host, spec) -> { id, el, refresh }      unmountInvestorPanel()      refreshInvestorPanel()
// Panel ids and spec fields: tools/D-CONTRACT.md, section 「投资者」. Only one panel is mounted at a time.
// The gauges read the sim on screen (currentSim() from flow.js) and follow it on their own (a light poll), so the lesson code
// does not have to call refresh; spec.snap (object or function) overrides the sim (demo page, tests).
// Charts are inline SVG drawn at the host's real width (redrawn on resize), colours = CSS tokens (assets/css/investor-lab.css).
import { currentSim } from './flow.js';
import { flash, clearFlash } from './links.js';
import { LONG_LABEL } from '../engine/regimes.js';
import { ASSET_COLS, ASSET_ROWS, JPN_JST, JPN_SIGNALS, TOY } from '../data/lesson-investor.js';
import { lakeHtml, lakeAct, ensureLakeCss } from './asset-lake.js';

const esc = s => String(s ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const ok = v => typeof v === 'number' && isFinite(v);
const MINUS = '−';
const sgn = v => (v > 0 ? '+' : v < 0 ? MINUS : '');
const pct = (v, d = 1) => (ok(v) ? sgn(v) + Math.abs(v * 100).toFixed(d) + '%' : '—');
const upct = (v, d = 1) => (ok(v) ? (v < 0 ? MINUS : '') + Math.abs(v * 100).toFixed(d) + '%' : '—');
const pctile = v => (ok(v) ? Math.round(v * 100) + ' 分位' : '—');
const blindBase = () => new URL('../../blind/', import.meta.url).href;

let M = null;          // the mounted panel: { id, spec, host, root, st, timers, ro, alive, w }

/* ---------------- lifecycle ---------------- */
const specKey = s => { try { return JSON.stringify(s, (k, v) => (k === 'snap' ? undefined : v)); } catch (e) { return String(s && s.id); } };
export function mountInvestorPanel(host, spec = {}) {
  if (!host) { unmountInvestorPanel(); return null; }
  // the same spec again (e.g. the lesson card rebuilt its HTML): move the live panel into the new host, keeping its state
  if (M && M.alive && specKey(M.spec) === specKey(spec)) {
    if (M.root.parentNode !== host) host.appendChild(M.root);
    M.host = host;
    return handle();
  }
  unmountInvestorPanel();
  const id = spec.id || '';
  const root = document.createElement('div');
  root.className = 'ivl';
  root.dataset.panel = id;
  host.appendChild(root);
  M = { id, spec, host, root, st: {}, timers: [], ro: null, alive: true, w: 0 };
  const P = PANELS[id];
  if (!P) { root.innerHTML = `<p class="ivl-note">没有这个面板：${esc(id)}</p>`; return handle(); }
  root.addEventListener('click', onClick);
  root.addEventListener('input', onInput);
  M.w = width();
  try { P.mount(M); } catch (e) { root.innerHTML = `<p class="ivl-note">面板出错：${esc(e.message)}</p>`; console.error(e); }
  if (typeof ResizeObserver === 'function') {
    let tm = 0;
    M.ro = new ResizeObserver(() => {
      clearTimeout(tm);
      tm = setTimeout(() => { if (!M || !M.alive) return; const w = width(); if (Math.abs(w - M.w) > 6) { M.w = w; PANELS[M.id].draw?.(M); } }, 80);
    });
    M.ro.observe(root);
  }
  return handle();
}
export function unmountInvestorPanel() {
  if (!M) return;
  M.alive = false;
  M.timers.forEach(t => { clearInterval(t); clearTimeout(t); });
  if (M.ro) M.ro.disconnect();
  M.root.removeEventListener('click', onClick);
  M.root.removeEventListener('input', onInput);
  M.root.remove();
  try { clearFlash(); } catch (e) { /* no diagram */ }
  M = null;
}
export function refreshInvestorPanel() { if (M && M.alive) PANELS[M.id]?.update?.(M); }
export const INVESTOR_PANEL_IDS = ['gauges', 'assetTable', 'lake', 'realRate', 'priced', 'timeline', 'fx', 'blind'];

function handle() { const m = M; return m ? { id: m.id, el: m.root, refresh: () => { if (M === m) refreshInvestorPanel(); } } : null; }
function width() { return Math.max(260, Math.round(M.root.clientWidth || M.host.clientWidth || 360)); }
function onClick(e) {
  const b = e.target.closest('[data-act]');
  if (!b || !M) return;
  PANELS[M.id].act?.(M, b.dataset.act, b, e);
}
function onInput(e) {
  const t = e.target;
  if (!M || !t.dataset || !t.dataset.in) return;
  PANELS[M.id].input?.(M, t.dataset.in, t);
}
const loaded = (m, p) => p.then(v => (M === m && m.alive ? v : Promise.reject(new Error('unmounted'))));

/* ---------------- sim snapshot ---------------- */
function getSim() { try { return currentSim(); } catch (e) { return null; } }
function snapOf(m) {
  const s = m.spec.snap;
  if (typeof s === 'function') return s();
  if (s) return s;
  const sim = getSim();
  try { return sim && typeof sim.snapshot === 'function' ? sim.snapshot() : null; } catch (e) { return null; }
}
function isoOf(m) { return m.spec.iso || getSim()?.country || 'USA'; }
// follow the sim on screen: redraw when the quarter (or the sim) changes
function follow(m, fn) {
  let key = null;
  const tick = () => {
    if (!m.alive) return;
    const sim = getSim(), s = m.spec.snap ? snapOf(m) : null;
    const k = s ? (s.date || '') + '|' + (s.t ?? '') : sim ? (sim.country || '') + '|' + sim.t + '|' + (sim.scenario || '') : 'none';
    if (k !== key) { key = k; fn(); }
  };
  tick();
  m.timers.push(setInterval(tick, 400));
}

// which row of the asset-reaction table the current position maps to
export function nowRow(snap) {
  const L = snap?.cycles?.long, S = snap?.cycles?.short;
  if (!L || !S) return { id: null, note: '没有周期读数' };
  if (L.stage === 5 || L.fork === 'B2') return { id: 'b2', note: L.stage === 5 ? '' : '地下水位跌破了吸程线（B2）' };
  if (L.stage === 6) return { id: 'l6', note: '' };
  if (L.stage === 7) return { id: 'l7', note: L.b1Overlay ? '上面叠了 B1：也看 ③④ 那一行' : '' };
  if (S.phase === 'ease') return { id: 'cut', note: S.handoff === 'no' ? '推不动：小心滑向 ⑤' : '' };
  if (S.phase === 'tight' || (S.phase === 'hot' && S.top === 'price')) {
    const asset = S.via === 'asset' || S.top === 'asset';
    return { id: 'b1', note: asset ? '这一轮的顶是资产过热，表里这一行按物价过热整理，只能近似' : '' };
  }
  if (S.phase === 'hot') return { id: null, note: '资产过热：表里没有这一行，先看估值（贵不贵）' };
  if (L.stage === 8) return { id: null, note: '⑧ 修复：表里没有这一行' };
  return { id: null, note: '扩张：表里没有单独这一行，先看估值和信号' };
}

/* ---------------- tiny SVG helpers ---------------- */
const lin = (d0, d1, r0, r1) => v => r0 + (v - d0) / (d1 - d0 || 1) * (r1 - r0);
const pathOf = pts => pts.filter(p => p && ok(p[0]) && ok(p[1])).map((p, i) => (i ? 'L' : 'M') + p[0].toFixed(1) + ',' + p[1].toFixed(1)).join('');
// direct labels at the right end of a line chart, pushed apart so they never overlap (items: [{ name, y }])
function endLabels(items, x, gap = 14) {
  const e = items.map(o => ({ ...o })).sort((a, b) => a.y - b.y);
  for (let i = 1; i < e.length; i++) if (e[i].y - e[i - 1].y < gap) e[i].y = e[i - 1].y + gap;
  return e.map(o => `<text class="dl" x="${x}" y="${(o.y + 4).toFixed(1)}">${esc(o.name)}</text>`).join('');
}
function niceTicks(lo, hi, n = 4) {
  const span = hi - lo || 1, raw = span / n, mag = 10 ** Math.floor(Math.log10(raw));
  const step = [1, 2, 2.5, 5, 10].map(k => k * mag).find(s => span / s <= n + 0.5) || raw;
  const out = []; for (let v = Math.ceil(lo / step) * step; v <= hi + 1e-9; v += step) out.push(+v.toFixed(10));
  return out;
}

/* =====================================================================================================
 * 1. gauges: 小周期 / 大周期 / 实际利率 / 估值 / 汇率, read from the running sim
 * ===================================================================================================== */
const SHORT_STEPS = [['expand', '扩张'], ['hot', '过热'], ['tight', '收紧'], ['ease', '降息']];
const SHORT_MEAN = { expand: '闸门开着，信贷在放水', hot: '水太满：物价或资产过热', tight: '央行在关闸（加息）', ease: '央行在开闸：推得动吗？' };
const LONG_ALL = [1, 2, 3, 4, 5, 6, 7, 8];
const CIRC = ['', '①', '②', '③', '④', '⑤', '⑥', '⑦', '⑧'];
const CUR = { USA: '美元', AUS: '澳元', JPN: '日元', CHN: '人民币', GBR: '英镑', EA: '欧元' };
const VAL_TXT = { red: ['偏贵', '池子很满：好消息大多已经装进价格'], yellow: ['有点贵', '池子偏满'], green: ['不贵', '池子不满：价格里装的水不多'] };
const LAMP_SYM = { green: '●', yellow: '▲', red: '■' };

function gaugesHtml(m, snap) {
  if (!snap || !snap.cycles) return `<p class="ivl-note">这个面板要读国家数据上的模拟（小镇没有周期表）。</p>`;
  const S = snap.cycles.short, L = snap.cycles.long, iso = isoOf(m);
  // 1 short
  const steps = SHORT_STEPS.map(([k, t]) => `<li class="${S.phase === k ? 'on' : ''}">${t}</li>`).join('<li class="ar" aria-hidden="true">→</li>');
  const g1 = `<section class="ivl-g"><h4>小周期位置</h4><ol class="ivl-steps" aria-label="小周期四步">${steps}</ol>
    <p class="ivl-gv">${esc(S.label || '')}</p><p class="ivl-gm">${esc(S.handoff === 'no' ? '推不动：交给大周期' : SHORT_MEAN[S.phase] || '')}</p></section>`;
  // 2 long
  const dots = LONG_ALL.map(k => `<li class="${L.stage === k ? 'on' : ''}${k === 3 || k === 4 ? ' sc' : ''}" title="${k === 3 || k === 4 ? '③④ 是小周期的加息和偿债' : esc(LONG_LABEL[k] || '')}">${CIRC[k]}</li>`).join('');
  const fork = L.fork ? `<span class="ivl-tag">${L.fork === 'B2' ? 'B2 跌破吸程线' : esc(L.fork) + ' 溢出'}</span>` : L.b1Overlay ? '<span class="ivl-tag">叠了 B1</span>' : '';
  const g2 = `<section class="ivl-g"><h4>大周期位置</h4><ol class="ivl-ring" aria-label="大周期八站">${dots}</ol>
    <p class="ivl-gv">${esc(L.label || '')} ${fork}</p><p class="ivl-gm">③④ 灰色：那两站是小周期在跑</p></section>`;
  // 3 real rate
  const rr = snap.rates?.realPolicy, lo = -0.04, hi = 0.06, x = v => Math.max(0, Math.min(100, (v - lo) / (hi - lo) * 100));
  const rrMean = !ok(rr) ? '' : rr < 0 ? '负的：存水在缩水，远处的池子（黄金、长债、股票估值）占便宜' : rr > 0.02 ? '很正：存着水就有回报，远处的池子要打折' : '温和：不推也不拉';
  const g3 = `<section class="ivl-g"><h4>实际利率</h4><p class="ivl-big">${pct(rr)}</p>
    <div class="ivl-scale" aria-hidden="true"><i class="z" style="left:${x(0)}%"></i><b style="left:${ok(rr) ? x(rr) : 50}%"></b></div>
    <div class="ivl-scl"><span>${MINUS}4%</span><span>0</span><span>+6%</span></div><p class="ivl-gm">= 政策利率 − 通胀。${esc(rrMean)}</p></section>`;
  // 4 valuation
  const V = snap.lights?.valuation, lv = V?.level, vt = VAL_TXT[lv] || ['—', ''];
  const h = snap.assets?.housing, e = snap.assets?.equity, pa = V?.parts || {};
  const g4 = `<section class="ivl-g"><h4>估值</h4><p class="ivl-big"><span class="ivl-lamp l-${esc(lv || 'none')}" aria-hidden="true">${LAMP_SYM[lv] || '○'}</span>${vt[0]}</p>
    <ul class="ivl-kv"><li>房价/收入 <b>${ok(h?.priceToIncome) ? h.priceToIncome.toFixed(1) : '—'}</b>${ok(pa.house) ? `<small>起点的 ${pa.house.toFixed(2)} 倍</small>` : ''}</li>
    <li>股票市盈率 <b>${ok(e?.pe) ? e.pe.toFixed(0) : '—'}</b>${ok(pa.equity) ? `<small>起点的 ${pa.equity.toFixed(2)} 倍</small>` : ''}</li></ul><p class="ivl-gm">${esc(vt[1])}</p></section>`;
  // 5 fx
  const B = snap.border || {}, fx = B.fxPerUsd, c4 = B.fxChg4q, cur = CUR[iso] || '本币';
  let g5;
  if (iso === 'USA' || !ok(fx) || (fx === 1 && !c4)) {
    g5 = `<section class="ivl-g"><h4>汇率</h4><p class="ivl-big">美元</p><p class="ivl-gm">本币就是美元：它是量别人的那把尺子。看澳洲的课时，这个表才会动。</p></section>`;
  } else {
    const chg = ok(c4) ? 1 / (1 + c4) - 1 : null;          // the home currency against USD vs a year ago (fxPerUsd up = home weaker)
    const big = fx < 20 ? `1 ${cur} = ${(1 / fx).toFixed(2)} 美元` : `1 美元 = ${fx.toFixed(0)} ${cur}`;
    const xm = v => Math.max(0, Math.min(100, 50 + v / 0.4 * 50));
    const mean = !ok(chg) ? '' : chg < -0.05 ? '本币在跌：手里的外币在赔付（保险生效）' : chg > 0.05 ? '本币在涨：外币换回来的变少' : '基本没动';
    g5 = `<section class="ivl-g"><h4>汇率</h4><p class="ivl-big">${big}</p>
      <div class="ivl-scale dv" aria-hidden="true"><i class="z" style="left:50%"></i>${ok(chg) ? `<em class="${chg < 0 ? 'neg' : 'pos'}" style="left:${Math.min(50, xm(chg))}%;width:${Math.abs(xm(chg) - 50)}%"></em>` : ''}</div>
      <p class="ivl-gm">${cur}比一年前 <b>${pct(chg)}</b>（对美元）。${esc(mean)}</p></section>`;
  }
  const nr = nowRow(snap), row = ASSET_ROWS.find(r => r.id === nr.id);
  const now = `<p class="ivl-now"><span>→ 现在该查表的</span> <b>${row ? esc(row.stage) + ' 这一行' : '（表里没有对应行）'}</b>${nr.note ? `<small>${esc(nr.note)}</small>` : ''}</p>`;
  return `<div class="ivl-head"><b>五个表</b><span class="ivl-date">${esc(CUR[iso] ? iso : '')} · ${esc(snap.date || '')}</span></div>
    <div class="ivl-gauges">${g1}${g2}${g3}${g4}${g5}</div>${now}`;
}
const gauges = {
  mount(m) { follow(m, () => { m.root.innerHTML = gaugesHtml(m, snapOf(m)); }); },
  update(m) { m.root.innerHTML = gaugesHtml(m, snapOf(m)); },
};

/* =====================================================================================================
 * 2. assetTable: handover §4.3, tap a stage -> winners / losers light up (and their pools in the diagram)
 * ===================================================================================================== */
function cellKind(t) {
  const up = (t.match(/⬆/g) || []).length + (/慢升/.test(t) ? 1 : 0), dn = (t.match(/⬇/g) || []).length;
  if (up && dn) return 'mix';
  if (up) return up > 1 ? 'win2' : 'win';
  if (dn) return /—/.test(t) ? 'lose' : dn > 1 ? 'lose2' : 'lose';
  return 'flat';
}
function tableHtml(m) {
  const st = m.st, snap = snapOf(m), nr = snap ? nowRow(snap) : { id: null };
  st.now = nr.id;
  if (st.sel === undefined) st.sel = m.spec.select || nr.id || 'cut';
  const head = `<tr><th scope="col" class="stg">阶段</th>${ASSET_COLS.map(c => `<th scope="col"><button type="button" data-act="col" data-k="${c.k}" class="${st.col === c.k ? 'on' : ''}">${esc(c.name)}</button></th>`).join('')}</tr>`;
  const rows = ASSET_ROWS.map(r => {
    const sel = r.id === st.sel;
    return `<tr class="${sel ? 'sel' : ''}${r.id === st.now ? ' now' : ''}" data-act="row" data-id="${r.id}" tabindex="0" role="button" aria-pressed="${sel}">` +
      `<th scope="row" class="stg">${esc(r.stage)}${r.id === st.now ? '<span class="ivl-tag now">现在</span>' : ''}</th>` +
      ASSET_COLS.map(c => { const t = r.cells[c.k]; return `<td class="k-${cellKind(t)}${st.col === c.k ? ' colsel' : ''}">${esc(t)}</td>`; }).join('') + '</tr>';
  }).join('');
  const R = ASSET_ROWS.find(r => r.id === st.sel);
  let sum = '<p class="ivl-sum">点一行，看谁赢谁输。</p>';
  if (R) {
    const pick = f => ASSET_COLS.filter(c => f(cellKind(R.cells[c.k]))).map(c => c.name);
    const win = pick(k => k === 'win' || k === 'win2'), lose = pick(k => k === 'lose' || k === 'lose2'), mix = pick(k => k === 'mix');
    sum = `<p class="ivl-sum"><b>${esc(R.stage)}</b>　<span class="w">赢：${esc(win.join('、') || '—')}</span>　<span class="l">输：${esc(lose.join('、') || '—')}</span>${mix.length ? `　<span>两头：${esc(mix.join('、'))}</span>` : ''}</p>`;
  }
  const C = ASSET_COLS.find(c => c.k === st.col);
  const colNote = C ? `<p class="ivl-col"><b>${esc(C.name)}</b>　${esc(C.spring)}</p>` : '';
  return `<div class="ivl-head"><b>资产反应表</b><span class="ivl-date">${snap ? esc(snap.date || '') : ''}</span></div>
    <p class="ivl-warn"><b>注意</b> 按历史事例整理（Dalio 框架 + 几段历史），还没有用数据逐格验证。当地图用，不当定律。</p>
    <div class="ivl-tw"><table class="ivl-at">${head}${rows}</table></div>${sum}${colNote}
    <p class="ivl-legend"><span class="k-win2">⬆ 赢</span><span class="k-lose2">⬇ 输</span><span class="k-mix">两头</span><span class="k-flat">— 看不出</span>　A、C 不是周期的一站，模型里不会亮「现在」。</p>`;
}
function lightRow(m) {
  const R = ASSET_ROWS.find(r => r.id === m.st.sel);
  if (!R) return;
  const parts = ASSET_COLS.filter(c => c.part && /win/.test(cellKind(R.cells[c.k]))).map(c => c.part);
  try { if (parts.length) flash({ parts }, 3500); else clearFlash(); } catch (e) { /* no diagram on this page */ }
}
const assetTable = {
  mount(m) {
    follow(m, () => { m.root.innerHTML = tableHtml(m); });
    m.root.addEventListener('keydown', e => { const tr = e.target.closest?.('tr[data-act="row"]'); if (tr && (e.key === 'Enter' || e.key === ' ')) { e.preventDefault(); tr.click(); } });
  },
  update(m) { m.root.innerHTML = tableHtml(m); },
  act(m, act, b) {
    if (act === 'row') { m.st.sel = b.dataset.id; m.root.innerHTML = tableHtml(m); lightRow(m); }
    if (act === 'col') {
      const k = b.dataset.k; m.st.col = m.st.col === k ? null : k; m.root.innerHTML = tableHtml(m);
      const C = ASSET_COLS.find(c => c.k === k);
      try { if (m.st.col && C.part) flash({ parts: [C.part] }, 2500); } catch (e) { /* no diagram */ }
    }
  },
};

/* =====================================================================================================
 * 3. realRate: one slider moves bonds, gold and equity valuation together (toy formulas, labelled as toys)
 * ===================================================================================================== */
export const toy = {
  bond: r => 100 * ((1 + TOY.r0) / (1 + r)) ** TOY.bondYears,
  gold: r => 100 * ((1 + TOY.r0) / (1 + r)) ** TOY.goldYears,
  pe: r => 1 / (r + TOY.erp - TOY.growth),
  equity: r => 100 * toy.pe(r) / toy.pe(TOY.r0),
};
const RR_SERIES = [
  { k: 'bond', name: '长期国债价格', short: '国债价格', cls: 's-bond' },
  { k: 'gold', name: '金价', cls: 's-gold' },
  { k: 'equity', name: '股票估值', cls: 's-eq' },
];
function rrChart(m) {
  const W = Math.min(m.w, 760), H = W < 420 ? 210 : 240, pad = { l: 40, r: W < 420 ? 74 : 92, t: 12, b: 34 };
  const r = m.st.r, xs = lin(TOY.rMin, TOY.rMax, pad.l, W - pad.r), ys = lin(0, 300, H - pad.b, pad.t);
  const yc = v => ys(Math.min(300, v));
  const grid = [0, 100, 200, 300].map(v => `<line class="gr" x1="${pad.l}" x2="${W - pad.r}" y1="${ys(v)}" y2="${ys(v)}"/><text class="ax" x="${pad.l - 6}" y="${ys(v) + 4}" text-anchor="end">${v}</text>`).join('');
  const xt = [-0.02, -0.01, 0, 0.01, 0.02, 0.03, 0.04, 0.05].map(v => `<text class="ax" x="${xs(v)}" y="${H - pad.b + 16}" text-anchor="middle">${v > 0 ? '+' : v < 0 ? MINUS : ''}${Math.abs(v * 100)}%</text>`).join('');
  const N = 80, lines = RR_SERIES.map(S => {
    const pts = []; for (let i = 0; i <= N; i++) { const v = TOY.rMin + (TOY.rMax - TOY.rMin) * i / N; pts.push([xs(v), yc(toy[S.k](v))]); }
    return `<path class="ln ${S.cls}" d="${pathOf(pts)}"/>`;
  }).join('') + endLabels(RR_SERIES.map(S => ({ name: S.short || S.name, y: yc(toy[S.k](TOY.rMax)) })), W - pad.r + 6);
  const dots = RR_SERIES.map(S => `<circle class="dot ${S.cls}" cx="${xs(r)}" cy="${yc(toy[S.k](r))}" r="5"/>`).join('');
  const snap = snapOf(m), now = snap?.rates?.realPolicy;
  const nowMark = ok(now) && now >= TOY.rMin && now <= TOY.rMax
    ? `<line class="nowl" x1="${xs(now)}" x2="${xs(now)}" y1="${pad.t}" y2="${H - pad.b}"/><text class="ax" x="${xs(now) - 4}" y="${H - pad.b - 6}" text-anchor="end">现在 ${esc(snap.date || '')}</text>` : '';
  return `<svg class="ivl-svg" viewBox="0 0 ${W} ${H}" width="${W}" height="${H}" role="img" aria-label="实际利率与三种资产（玩具公式，实际利率 1% 时 = 100）">
    <line class="zr" x1="${xs(0)}" x2="${xs(0)}" y1="${pad.t}" y2="${H - pad.b}"/>${grid}${xt}${nowMark}
    <line class="cross" x1="${xs(r)}" x2="${xs(r)}" y1="${pad.t}" y2="${H - pad.b}"/>${lines}${dots}
    <text class="ax" x="${(pad.l + W - pad.r) / 2}" y="${H - 4}" text-anchor="middle">实际利率</text>
    <rect class="hit" x="${pad.l}" y="${pad.t}" width="${W - pad.l - pad.r}" height="${H - pad.t - pad.b}" data-x0="${pad.l}" data-x1="${W - pad.r}"/></svg>`;
}
function rrRead(m) {
  const r = m.st.r, pe = toy.pe(r);
  const row = (S, v, extra = '') => `<tr><th><i class="sw ${S.cls}"></i>${S.name}</th><td><b>${v.toFixed(0)}</b></td><td>${pct(v / 100 - 1, 0)}</td><td>${extra}</td></tr>`;
  return `<table class="ivl-rt"><tr><th></th><th>指数</th><th>比 1% 时</th><th></th></tr>` +
    row(RR_SERIES[0], toy.bond(r)) + row(RR_SERIES[1], toy.gold(r)) + row(RR_SERIES[2], toy.equity(r), `市盈率 ${pe.toFixed(0)} 倍`) + '</table>';
}
function rrHtml(m) {
  const snap = snapOf(m), now = snap?.rates?.realPolicy;
  const nowBtn = ok(now) ? `<button type="button" class="ivl-chip" data-act="now">跳到现在：${esc(snap.date || '')} ${pct(now)}</button>` : '';
  return `<div class="ivl-head"><b>实际利率 = 水的价格</b><span class="ivl-toy">玩具公式</span></div>
    <div class="ivl-ctl"><label for="ivl-rr">实际利率 <b class="ivl-val">${pct(m.st.r, 2)}</b></label>
      <input id="ivl-rr" type="range" data-in="r" min="${TOY.rMin}" max="${TOY.rMax}" step="0.0025" value="${m.st.r}">
      <div class="ivl-range"><span>${MINUS}2%</span><span>${nowBtn}</span><span>+5%</span></div></div>
    <div class="ivl-chart" data-chart="rr">${rrChart(m)}</div><div class="ivl-read">${rrRead(m)}</div>
    <details class="ivl-f"><summary>三个玩具公式（实际利率 1% 时都 = 100）</summary><ul>
      <li><b>长期国债</b>：10 年后还你 100，今天值 100 ÷ (1 + 实际利率)<sup>10</sup>。</li>
      <li><b>黄金</b>：没有泉水，像一张更远的债：÷ (1 + 实际利率)<sup>20</sup>。</li>
      <li><b>股票市盈率</b> = 1 ÷ (实际利率 + 风险溢价 5% − 实际增长 1.5%)。</li></ul>
      <p>系数是随手定的，只为看方向和谁更敏感：离得越远（没有泉水、或泉水在很远的将来）的池子，对水价越敏感。真实市场还有通胀预期、信心、风险溢价在变。</p></details>`;
}
function rrSet(m, r) {
  m.st.r = Math.max(TOY.rMin, Math.min(TOY.rMax, Math.round(r / 0.0025) * 0.0025));
  const v = m.root.querySelector('.ivl-val'); if (v) v.textContent = pct(m.st.r, 2);
  const inp = m.root.querySelector('#ivl-rr'); if (inp && +inp.value !== m.st.r) inp.value = m.st.r;
  const c = m.root.querySelector('[data-chart="rr"]'); if (c) c.innerHTML = rrChart(m);
  const rd = m.root.querySelector('.ivl-read'); if (rd) rd.innerHTML = rrRead(m);
}
function bindDrag(m, sel, onX) {   // tap / drag on a chart = move its crosshair (touch friendly)
  const at = e => {
    const svg = e.target.closest?.('svg'); const hit = svg && svg.querySelector('rect.hit'); if (!hit) return;
    const b = svg.getBoundingClientRect(), vb = svg.viewBox.baseVal, x = (e.clientX - b.left) * (vb.width / b.width);
    const x0 = +hit.dataset.x0, x1 = +hit.dataset.x1; onX(Math.max(0, Math.min(1, (x - x0) / (x1 - x0))));
  };
  let down = false;
  m.root.addEventListener('pointerdown', e => { if (e.target.closest(sel)) { down = true; at(e); } });
  m.root.addEventListener('pointermove', e => { if (e.target.closest(sel) && (down || e.pointerType === 'mouse')) at(e); });
  const up = () => { down = false; };
  m.root.addEventListener('pointerup', up); m.root.addEventListener('pointerleave', up);
}
const realRate = {
  mount(m) {
    m.st.r = ok(m.spec.def) ? m.spec.def : TOY.r0;
    follow(m, () => { m.root.innerHTML = rrHtml(m); });     // the 现在 marker follows the sim; the slider value is kept
    bindDrag(m, '[data-chart="rr"]', f => rrSet(m, TOY.rMin + f * (TOY.rMax - TOY.rMin)));
  },
  draw(m) { const c = m.root.querySelector('[data-chart="rr"]'); if (c) c.innerHTML = rrChart(m); },
  update(m) { m.root.innerHTML = rrHtml(m); },
  input(m, k, t) { if (k === 'r') rrSet(m, +t.value); },
  act(m, act) { if (act === 'now') { const n = snapOf(m)?.rates?.realPolicy; if (ok(n)) rrSet(m, n); } },
};

/* =====================================================================================================
 * 4. priced: 贵不贵 — the same market priced very differently (blind cards JPN-1989 vs JPN-2012, + JPN-2008)
 * ===================================================================================================== */
let BLIND_P = null;
const blindCards = () => (BLIND_P ||= import('../data/blind-cards.js').then(x => Object.fromEntries(x.BLIND.cards.map(c => [c.id, c]))));
const PR_ROWS = [
  { k: 'creditGdp', name: '私人信贷/GDP' }, { k: 'houseToIncome', name: '房价/收入' },
  { k: 'equityVal', name: '股票估值（股价/股息）', short: '股票估值' }, { k: 'realRate', name: '实际利率' },
];
const CTRY = { USA: '美国', JPN: '日本', AUS: '澳洲', CHN: '中国' };
const TYPE = { '危': '危机前夜', '转': '转折点', '平': '平常年份' };
function pricedHtml(m) {
  const by = m.st.by, ids = [...(m.spec.cards || ['JPN-1989', 'JPN-2012'])];
  if (m.st.extra && m.spec.extra) ids.push(m.spec.extra);
  const C = ids.map(id => by[id]).filter(Boolean);
  if (!C.length) return '<p class="ivl-note">没有找到盲测卡。</p>';
  const cls = k => ['c0', 'c1', 'c2'][k] || 'c2';
  const W = Math.min(m.w, 760), narrow = W < 420, lab = narrow ? 84 : 150, H0 = 30, RH = 46;
  const xs = lin(0, 1, lab + 10, W - 16);
  const rowsSvg = PR_ROWS.map((R, i) => {
    const y = H0 + i * RH;
    const dots = C.map((c, k) => { const v = c.view.pct[R.k]; return ok(v) ? `<circle class="pd ${cls(k)}" cx="${xs(v)}" cy="${y}" r="7"><title>${c.year}：${pctile(v)}</title></circle>` : ''; }).join('');
    const tags = C.map((c, k) => { const v = c.view.pct[R.k]; return ok(v) ? `<text class="pdl ${cls(k)}" x="${xs(v)}" y="${y + (k % 2 ? 20 : -11)}" text-anchor="middle">${c.year}</text>` : ''; }).join('');
    return `<text class="rl" x="0" y="${y + 4}">${narrow && R.short ? R.short : R.name}</text><line class="trk" x1="${xs(0)}" x2="${xs(1)}" y1="${y}" y2="${y}"/>${dots}${tags}`;
  }).join('');
  const H = H0 + (PR_ROWS.length - 1) * RH + 28;
  const axis = [0, 0.5, 1].map(v => `<text class="ax" x="${xs(v)}" y="${H}" text-anchor="middle">${v === 0 ? '0 最低' : v === 1 ? '100 最高' : '50'}</text>`).join('');
  const svg = `<svg class="ivl-svg" viewBox="0 0 ${W} ${H + 6}" width="${W}" height="${H + 6}" role="img" aria-label="相对自己历史的位置（分位）">${rowsSvg}${axis}</svg>`;
  const L = c => c.view.levels, ret = c => c.reveal.ret1;
  const tr = (name, f, strong) => `<tr><th>${name}</th>${C.map((c, k) => `<td class="${cls(k)}">${strong ? '<b>' : ''}${f(c)}${strong ? '</b>' : ''}</td>`).join('')}</tr>`;
  const tbl = `<table class="ivl-pt"><tr><th></th>${C.map((c, k) => `<th class="${cls(k)}"><i class="sw ${cls(k)}"></i>${CTRY[c.iso] || c.iso} ${c.year}</th>`).join('')}</tr>` +
    tr('框架的判断', c => esc(c.view.call.labels?.long || c.view.call.long) + '<br><small>' + esc(c.view.call.labels?.short || '') + '</small>') +
    tr('股价/股息', c => (ok(L(c).equityVal) ? L(c).equityVal.toFixed(0) + ' 倍' : '—') + `<br><small>${pctile(c.view.pct.equityVal)}</small>`) +
    tr('房价/收入<small>（1 = 近 30 年平均）</small>', c => (ok(L(c).houseToIncome) ? L(c).houseToIncome.toFixed(2) : '—')) +
    tr('实际利率', c => pct(L(c).realRate)) +
    tr('下一年 股票', c => pct(ret(c).equity, 0), true) +
    tr('下一年 国债', c => pct(ret(c).bond, 0)) + '</table>';
  const ex = m.spec.extra && by[m.spec.extra];
  const btn = ex ? `<button type="button" class="ivl-chip${m.st.extra ? ' on' : ''}" data-act="extra" aria-pressed="${!!m.st.extra}">${m.st.extra ? '去掉' : '加上'} ${CTRY[ex.iso] || ''} ${ex.year}（同样在 ${esc(ex.view.call.long)}）</button>` : '';
  return `<div class="ivl-head"><b>贵不贵</b><span class="ivl-date">盲测卡 · 站在那一年年底</span></div>
    <p class="ivl-lead">相对自己的历史在哪个水位？0 = 有记录以来最低，100 = 最高。</p>
    <div class="ivl-chart">${svg}</div>${btn}<div class="ivl-tw">${tbl}</div>
    <p class="ivl-note">回报 = 换成澳元、扣掉澳洲通胀；「下一年」= 卡片年份的下一个日历年。数据：src/data/blind-cards.js（JST + OECD）。</p>`;
}
const priced = {
  mount(m) {
    m.root.innerHTML = '<p class="ivl-note">正在取盲测卡…</p>';
    loaded(m, blindCards()).then(by => { m.st.by = by; m.root.innerHTML = pricedHtml(m); }).catch(() => {});
  },
  draw(m) { if (m.st.by) m.root.innerHTML = pricedHtml(m); },
  act(m, act) { if (act === 'extra') { m.st.extra = !m.st.extra; m.root.innerHTML = pricedHtml(m); } },
};

/* =====================================================================================================
 * 5. timeline: Japan's way out of B2 — the market moves first; act when 3 signals are lit
 * ===================================================================================================== */
const J = JPN_JST, JY = i => J.from + i, JIDX = y => y - J.from;
const Y0 = 1985, Y1 = 2023;
const VERDICT = ['没有信号：别急', '只亮一个：不算数（2003–07 就是假起点）', '亮了两个：再等一个', '亮了三个：可以动了', '官方也确认了：大部分涨幅已经兑现'];
function tlChart(m) {
  const W = Math.min(m.w, 820), H = W < 420 ? 200 : 230, pad = { l: 34, r: 14, t: 26, b: 26 }, yr = m.st.year;
  const xs = lin(Y0, Y1, pad.l, W - pad.r), ys = lin(0, 110, H - pad.b, pad.t);
  const grid = [0, 50, 100].map(v => `<line class="gr" x1="${pad.l}" x2="${W - pad.r}" y1="${ys(v)}" y2="${ys(v)}"/><text class="ax" x="${pad.l - 5}" y="${ys(v) + 4}" text-anchor="end">${v}</text>`).join('');
  const step = W < 420 ? 10 : 5, xt = []; for (let y = 1985; y <= Y1; y += step) xt.push(`<text class="ax" x="${xs(y)}" y="${H - 8}" text-anchor="middle">${y}</text>`);
  const pts = J.equity.map((v, i) => [xs(JY(i)), ys(v)]);
  const upTo = J.equity.map((v, i) => (JY(i) <= yr ? [xs(JY(i)), ys(v)] : null)).filter(Boolean);
  const sig = JPN_SIGNALS.map((s, k) => {
    const lit = yr >= s.year, x = xs(s.year);
    return `<line class="sg${lit ? ' lit' : ''}" x1="${x}" x2="${x}" y1="${pad.t - 4}" y2="${H - pad.b}"/>` +
      `<circle class="sgc${lit ? ' lit' : ''}" cx="${x}" cy="${pad.t - 12}" r="9"/><text class="sgt${lit ? ' lit' : ''}" x="${x}" y="${pad.t - 8}" text-anchor="middle">${k + 1}</text>`;
  }).join('');
  const ann = [[1989, '100'], [2012, '30'], [2020, '73']].map(([y, t]) => `<text class="an" x="${xs(y)}" y="${ys(J.equity[JIDX(y)]) + (y === 1989 ? -6 : 16)}" text-anchor="middle">${t}</text>`).join('');
  const cx = xs(yr), cv = yr <= J.from + J.equity.length - 1 ? J.equity[JIDX(yr)] : null;
  return `<svg class="ivl-svg" viewBox="0 0 ${W} ${H}" width="${W}" height="${H}" role="img" aria-label="日本股价 1985–2020（1989 = 100）和四个出口信号">
    ${grid}${xt.join('')}<rect class="fs" x="${xs(2003)}" y="${pad.t}" width="${xs(2007) - xs(2003)}" height="${H - pad.t - pad.b}"><title>2003–07 假起点</title></rect>
    ${sig}<path class="ln s-eq dim" d="${pathOf(pts)}"/><path class="ln s-eq" d="${pathOf(upTo)}"/>${ann}
    <line class="cross" x1="${cx}" x2="${cx}" y1="${pad.t}" y2="${H - pad.b}"/>${cv != null ? `<circle class="dot s-eq" cx="${cx}" cy="${ys(cv)}" r="5"/>` : ''}
    <text class="ax" x="${xs(2003) - 3}" y="${H - pad.b - 6}" text-anchor="end">假起点 →</text>
    <rect class="hit" x="${pad.l}" y="${pad.t}" width="${W - pad.l - pad.r}" height="${H - pad.t - pad.b}" data-x0="${pad.l}" data-x1="${W - pad.r}"/></svg>`;
}
function spark(s, yr) {      // a 120x28 sparkline of the signal's JST series, the signal year marked
  const v = J[s.series]; if (!v) return '<span class="ivl-spk none">季度数据</span>';
  const w = 120, h = 28, lo = Math.min(...v, s.zero ? 0 : Infinity), hi = Math.max(...v, s.zero ? 0 : -Infinity);
  const xs = lin(Y0, Y1, 2, w - 2), ys = lin(lo, hi, h - 3, 3);
  const zero = s.zero ? `<line class="zr" x1="0" x2="${w}" y1="${ys(0)}" y2="${ys(0)}"/>` : '';
  const pts = v.map((a, i) => [xs(JY(i)), ys(a)]);
  return `<svg class="ivl-spk" viewBox="0 0 ${w} ${h}" width="${w}" height="${h}" aria-hidden="true">${zero}<path class="ln thin" d="${pathOf(pts)}"/>` +
    `<line class="sg${yr >= s.year ? ' lit' : ''}" x1="${xs(s.year)}" x2="${xs(s.year)}" y1="0" y2="${h}"/><line class="cross" x1="${xs(yr)}" x2="${xs(yr)}" y1="0" y2="${h}"/></svg>`;
}
function tlRead(m) {
  const yr = m.st.year, n = JPN_SIGNALS.filter(s => yr >= s.year).length;
  const cv = yr <= J.from + J.equity.length - 1 ? J.equity[JIDX(yr)] : null;
  const rows = JPN_SIGNALS.map((s, k) => `<li class="${yr >= s.year ? 'lit' : ''}"><i class="ivl-lit" aria-hidden="true">${k + 1}</i>` +
    `<span class="nm"><b>${esc(s.name)}</b><small>${s.year} · ${esc(s.why)} · ${esc(s.src)}</small></span>${spark(s, yr)}<em>${yr >= s.year ? '亮' : '暗'}</em></li>`).join('');
  return `<p class="ivl-now"><span>${yr} 年</span> <b>亮了 ${n} 个信号 → ${esc(VERDICT[n])}</b>` +
    `<small>股价 ${cv != null ? cv.toFixed(0) + '（1989 = 100）' : '：JST 只到 2020 年'}</small></p><ol class="ivl-sigs">${rows}</ol>`;
}
function tlHtml(m) {
  return `<div class="ivl-head"><b>市场先走，亮三个信号再动</b><span class="ivl-date">日本 · 走出 B2</span></div>
    <div class="ivl-ctl"><label for="ivl-yr">站在 <b class="ivl-val">${m.st.year}</b> 年</label>
      <input id="ivl-yr" type="range" data-in="y" min="1989" max="${Y1}" step="1" value="${m.st.year}">
      <div class="ivl-range"><span>1989</span><span class="ivl-jump">${JPN_SIGNALS.map(s => `<button type="button" class="ivl-chip" data-act="yr" data-y="${s.year}">${s.year}</button>`).join('')}</span><span>${Y1}</span></div></div>
    <div class="ivl-chart" data-chart="tl">${tlChart(m)}</div><div class="ivl-read">${tlRead(m)}</div>
    <p class="ivl-note">股价、信贷、房价、增长减利率：JST 年度数据（1985–2020）。通胀：repo 里的日本季度 CPI。见底要过一两年才看得出来，这里按事后的年份标。</p>`;
}
function tlSet(m, y) {
  m.st.year = Math.max(1989, Math.min(Y1, Math.round(y)));
  const v = m.root.querySelector('.ivl-val'); if (v) v.textContent = m.st.year;
  const inp = m.root.querySelector('#ivl-yr'); if (inp && +inp.value !== m.st.year) inp.value = m.st.year;
  m.root.querySelector('[data-chart="tl"]').innerHTML = tlChart(m);
  m.root.querySelector('.ivl-read').innerHTML = tlRead(m);
}
const timeline = {
  mount(m) {
    m.st.year = m.spec.year || 2013;
    m.root.innerHTML = tlHtml(m);
    bindDrag(m, '[data-chart="tl"]', f => tlSet(m, Y0 + f * (Y1 - Y0)));
  },
  draw(m) { const c = m.root.querySelector('[data-chart="tl"]'); if (c) c.innerHTML = tlChart(m); },
  input(m, k, t) { if (k === 'y') tlSet(m, +t.value); },
  act(m, act, b) { if (act === 'yr') tlSet(m, +b.dataset.y); },
};

/* =====================================================================================================
 * 6. fx: your four currencies — what 1 AUD buys in USD / JPY / CNY around 2008 (repo quarterly data, quarterly means)
 * ===================================================================================================== */
let FXD_P = null;
const fxData = () => (FXD_P ||= import('../data/countries/index.js').then(x => Promise.all(['AUS', 'JPN', 'CHN'].map(k => x.COUNTRY_DATA[k]()))));
const FX_SERIES = [
  { k: 'USD', name: '对美元', cls: 's-usd' }, { k: 'JPY', name: '对日元', cls: 's-jpy' }, { k: 'CNY', name: '对人民币', cls: 's-cny' },
];
// 1 AUD in each currency, quarter by quarter: { dates, USD:[], JPY:[], CNY:[] }  (fxPerUsd = units of that currency per USD)
export function audCross(aus, jpn, chn, from, until) {
  const out = { dates: [], USD: [], JPY: [], CNY: [] };
  const at = (Q, d) => { const i = Q.dates.indexOf(d); return i < 0 ? null : Q.series.fxPerUsd[i]; };
  for (let i = aus.dates.indexOf(from); i >= 0 && i <= aus.dates.indexOf(until); i++) {
    const d = aus.dates[i], a = aus.series.fxPerUsd[i], j = at(jpn, d), c = at(chn, d);
    out.dates.push(d); out.USD.push(ok(a) ? 1 / a : null); out.JPY.push(ok(a) && ok(j) ? j / a : null); out.CNY.push(ok(a) && ok(c) ? c / a : null);
  }
  return out;
}
function fxChart(m) {
  const X = m.st.x, n = X.dates.length, bi = Math.max(0, X.dates.indexOf(m.spec.base || '2008Q2'));
  const W = Math.min(m.w, 760), H = W < 420 ? 200 : 230, pad = { l: 34, r: W < 420 ? 62 : 74, t: 12, b: 26 };
  const idx = k => X[k].map(v => (ok(v) && ok(X[k][bi]) ? v / X[k][bi] * 100 : null));
  const S = FX_SERIES.map(s => ({ ...s, v: idx(s.k) }));
  const all = S.flatMap(s => s.v).filter(ok), lo = Math.floor(Math.min(...all, 100) / 10) * 10, hi = Math.ceil(Math.max(...all, 100) / 10) * 10;
  const xs = lin(0, n - 1, pad.l, W - pad.r), ys = lin(lo, hi, H - pad.b, pad.t);
  const grid = niceTicks(lo, hi, 4).map(v => `<line class="${v === 100 ? 'zr' : 'gr'}" x1="${pad.l}" x2="${W - pad.r}" y1="${ys(v)}" y2="${ys(v)}"/><text class="ax" x="${pad.l - 5}" y="${ys(v) + 4}" text-anchor="end">${v}</text>`).join('');
  const xt = X.dates.map((d, i) => (/Q1$/.test(d) ? `<text class="ax" x="${xs(i)}" y="${H - 8}" text-anchor="middle">${d.slice(0, 4)}</text>` : '')).join('');
  const lines = S.map(s => `<path class="ln ${s.cls}" d="${pathOf(s.v.map((v, i) => [xs(i), ok(v) ? ys(v) : null]))}"/>`).join('') +
    endLabels(S.map(s => ({ name: s.name, y: ys(s.v[n - 1]) })), W - pad.r + 6);
  const h = m.st.hover ?? X.dates.indexOf('2009Q1'), hx = xs(h);
  const dots = S.map(s => (ok(s.v[h]) ? `<circle class="dot ${s.cls}" cx="${hx}" cy="${ys(s.v[h])}" r="5"/>` : '')).join('');
  return `<svg class="ivl-svg" viewBox="0 0 ${W} ${H}" width="${W}" height="${H}" role="img" aria-label="1 澳元能换多少外币，${esc(X.dates[bi])} = 100">
    ${grid}${xt}<line class="nowl" x1="${xs(bi)}" x2="${xs(bi)}" y1="${pad.t}" y2="${H - pad.b}"/>${lines}
    <line class="cross" x1="${hx}" x2="${hx}" y1="${pad.t}" y2="${H - pad.b}"/>${dots}
    <rect class="hit" x="${pad.l}" y="${pad.t}" width="${W - pad.l - pad.r}" height="${H - pad.t - pad.b}" data-x0="${pad.l}" data-x1="${W - pad.r}"/></svg>`;
}
function fxRead(m) {
  const X = m.st.x, h = m.st.hover ?? X.dates.indexOf('2009Q1'), bi = Math.max(0, X.dates.indexOf(m.spec.base || '2008Q2'));
  const cell = k => { const v = X[k][h], b = X[k][bi]; return ok(v) && ok(b) ? pct(v / b - 1) : '—'; };
  const lvl = k => { const v = X[k][h]; return !ok(v) ? '—' : k === 'USD' ? v.toFixed(2) + ' 美元' : k === 'JPY' ? v.toFixed(0) + ' 日元' : v.toFixed(2) + ' 人民币'; };
  return `<table class="ivl-rt"><tr><th>${esc(X.dates[h])}</th><th>1 澳元能换</th><th>比 ${esc(X.dates[bi])}</th></tr>` +
    FX_SERIES.map(s => `<tr><th><i class="sw ${s.cls}"></i>${s.name.slice(1)}</th><td>${lvl(s.k)}</td><td><b>${cell(s.k)}</b></td></tr>`).join('') + '</table>';
}
function fxHtml(m) {
  const c = m.st.card, r = c?.reveal?.ret1;
  const ins = r ? `<p class="ivl-warn"><b>保险要在火灾前买</b> 站在 2008 年底才换外币，2009 年澳元反弹：美元 <b>${pct(r.fxUSD, 0)}</b>，日元 <b>${pct(r.fxJPY, 0)}</b>（换回澳元、扣掉通胀；盲测卡 AUS-2008）。</p>` : '';
  const X = m.st.x;
  const tbl = `<details class="ivl-f"><summary>看数字（每季平均）</summary><div class="ivl-tw"><table class="ivl-rt"><tr><th>季度</th><th>美元</th><th>日元</th><th>人民币</th></tr>${X.dates.map((d, i) => `<tr><th>${d}</th><td>${ok(X.USD[i]) ? X.USD[i].toFixed(3) : '—'}</td><td>${ok(X.JPY[i]) ? X.JPY[i].toFixed(1) : '—'}</td><td>${ok(X.CNY[i]) ? X.CNY[i].toFixed(2) : '—'}</td></tr>`).join('')}</table></div></details>`;
  return `<div class="ivl-head"><b>你的四种货币</b><span class="ivl-date">1 澳元能换多少，${esc(m.spec.base || '2008Q2')} = 100</span></div>
    <ul class="ivl-cur"><li><b>澳元</b>本币：工资、房子、账单</li><li class="s-usd"><b>美元</b>危机保险</li><li class="s-jpy"><b>日元</b>危机保险</li><li class="s-cny"><b>人民币</b>2008 年跟着美元走</li></ul>
    <div class="ivl-chart" data-chart="fx">${fxChart(m)}</div><div class="ivl-read">${fxRead(m)}</div>${ins}${tbl}
    <p class="ivl-note">汇率是季度平均（repo 的澳洲、日本、中国季度数据），每天的最高最低点会更极端。点或拖动图，看任一季度。</p>`;
}
const fx = {
  mount(m) {
    m.root.innerHTML = '<p class="ivl-note">正在取汇率数据…</p>';
    loaded(m, Promise.all([fxData(), blindCards().catch(() => ({}))])).then(([[aus, jpn, chn], by]) => {
      m.st.x = audCross(aus, jpn, chn, m.spec.from || '2007Q1', m.spec.until || '2010Q4');
      m.st.card = by['AUS-2008'];
      m.root.innerHTML = fxHtml(m);
    }).catch(() => {});
    bindDrag(m, '[data-chart="fx"]', f => {
      if (!m.st.x) return;
      m.st.hover = Math.round(f * (m.st.x.dates.length - 1));
      m.root.querySelector('[data-chart="fx"]').innerHTML = fxChart(m);
      m.root.querySelector('.ivl-read').innerHTML = fxRead(m);
    });
  },
  draw(m) { const c = m.root.querySelector('[data-chart="fx"]'); if (c && m.st.x) c.innerHTML = fxChart(m); },
};

/* =====================================================================================================
 * 7. blind: three practice cards, then the full 历史盲测 deck (/blind/ has no tutorial mode: plain links)
 * ===================================================================================================== */
const PRACTICE = {
  'USA-2006': '房价涨了很多年，利率已经抬高：地下水位逼近吸程线了吗？',
  'USA-2009': '最坏的消息都出来了：信号亮了几个？',
  'AUS-2015': '看起来很平常的一年：房子和股票，贵不贵？',
};
function blindHtml(m) {
  const by = m.st.by || {}, base = m.spec.base || blindBase(), ids = m.spec.cards || Object.keys(PRACTICE);
  const cards = ids.map((id, k) => {
    const c = by[id], href = base + '?card=' + encodeURIComponent(id);
    const name = c ? `${CTRY[c.iso] || c.iso} ${c.year}` : id;
    return `<li><span class="no">${k + 1}</span><span class="tx"><b>${esc(name)}</b>${c ? `<i class="ivl-tag">${esc(TYPE[c.type] || c.type)}</i>` : ''}<small>${esc(PRACTICE[id] || '')}</small></span>` +
      `<a class="btn ivl-go" href="${esc(href)}" target="_blank" rel="noopener">打开 ↗</a></li>`;
  }).join('');
  return `<div class="ivl-head"><b>去历史盲测里练</b><span class="ivl-date">3 张练习卡</span></div>
    <ol class="ivl-do"><li>定位置（五个表）</li><li>查资产反应表</li><li>看湖：水从哪根管子进</li><li>看吸力（实际利率）</li></ol>
    <ol class="ivl-cards">${cards}</ol>
    <a class="btn primary ivl-all" href="${esc(base)}" target="_blank" rel="noopener">进入历史盲测：整副 ${Object.keys(by).length || ''} 张牌 ↗</a>
    <p class="ivl-note">盲测页面没有专门的教学模式：这三张就是普通卡，在新窗口打开，这一课留在这里。</p>`;
}
const blind = {
  mount(m) {
    m.root.innerHTML = blindHtml(m);
    loaded(m, blindCards()).then(by => { m.st.by = by; m.root.innerHTML = blindHtml(m); }).catch(() => {});
  },
};

/* =====================================================================================================
 * 8. lake: the 湖 zoom (course v3 asset page, src/ui/asset-lake.js): pools, pipes, 泉眼, the narrow middle pipe; tap = sub-pools
 * ===================================================================================================== */
function histOf(m) {
  if (m.spec.snap) return m.spec.hist || [snapOf(m)];
  try { const h = getSim()?.history?.(); return Array.isArray(h) && h.length ? h : [snapOf(m)]; } catch (e) { return [snapOf(m)]; }
}
const lakeDraw = m => { m.root.innerHTML = lakeHtml(m.st, snapOf(m), histOf(m)); };
const lake = {
  mount(m) { ensureLakeCss(); if (m.spec.open) m.st.sel = m.spec.open; follow(m, () => lakeDraw(m)); },
  update(m) { lakeDraw(m); },
  act(m, act, b) {
    const part = lakeAct(m.st, act, b); lakeDraw(m);
    try { if (part && m.st.sel) flash({ parts: [part] }, 2500); } catch (e) { /* no diagram */ }
  },
};

const PANELS = { gauges, assetTable, lake, realRate, priced, timeline, fx, blind };
