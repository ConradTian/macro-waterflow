// 「第 9 课：现在在哪」 panels (src/data/lesson-now.js, panel ids 'now-*'): today's real data on the five places of the picture.
//   now-map     five places × two countries, colour + words (the intro: show first)
//   now-river   河: a 测流断面 per country (▼ 物价比一年前 vs the 调度线), unemployment now vs its own mean, the output gap
//   now-ground  地下: private debt / GDP since 1995 drawn as a water table (deeper = more debt) vs its mean; the 吸程线 status (B2 evidence only)
//   now-lake    湖: house and equity on the valuation lamp's own bands (× 1995Q1); bonds / gold / cash have no valuation ruler
//   now-ruler   吸力尺: ▶ and ▼ on the 预期 lesson's gauge (exp-gauge.js gaugeSvg), band ▶ − ▼ = 结账读数 (no real ▽); no rope drawn
//   now-gate    闸: the AUD at AUS's last real quarter (needle + 吸力差 vs normal) over the FX reactor at its last fitted quarter
//   now-sum     the five places again, with the numbers (the 三问 step)
// Every number comes from lesson-now.js (nowFacts / nowText = realSnapshot), so the panel and the card print the same strings.
// mountNowPanel(host, spec) / unmountNowPanel() / ensureNowCss(); wired by src/ui/lessons.js (block 「lesson now (C3)」).
import { realSnapshot, realDates, realLastDate } from '../data/real/real-snapshot.js';
import { FX_FIT } from '../data/fx-fit.js';
import { groundwaterDepth } from './flow.js';
import { mountFxReactor, unmountFxReactor, ensureFxReactorCss } from './fx-reactor.js';
import { gaugeSvg, ensureExpCss } from './exp-gauge.js';
import { bindNowData, nowFacts, nowText, FMT, VAL_WORD, bandColour, liftWord, NOW_ISOS, NOW_TRUTH } from '../data/lesson-now.js';

bindNowData({ realSnapshot, realDates, realLastDate, groundwaterDepth, FX_FIT });

const esc = s => String(s ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const ok = v => typeof v === 'number' && Number.isFinite(v);
const clamp = (x, a, b) => Math.max(a, Math.min(b, x));
const T = k => esc(nowText(k));
const P = iso => (iso === 'USA' ? 'u' : 'a');           // placeholder prefix per country

export function ensureNowCss() {
  ensureExpCss();
  if (typeof document === 'undefined' || document.querySelector('link[data-css="now-panel.css"]')) return;
  const l = document.createElement('link'); l.rel = 'stylesheet'; l.dataset.css = 'now-panel.css';
  l.href = new URL('../../assets/css/now-panel.css', import.meta.url).href; document.head.appendChild(l);
}

let mounted = null;
export function unmountNowPanel() {
  if (!mounted) return;
  if (mounted.fxr) { try { unmountFxReactor(); } catch (e) { /* ignore */ } }
  mounted.root.remove();
  mounted = null;
}
export function mountNowPanel(host, spec = {}) {
  unmountNowPanel();
  if (!host) return null;
  ensureNowCss();
  const root = document.createElement('div');
  root.className = 'nowp exg'; root.dataset.panel = spec.id || 'now-map';
  host.appendChild(root);
  mounted = { host, root, spec, fxr: false };
  let html;
  try { html = render(spec.id || 'now-map'); } catch (e) { console.error(e); html = '<p class="nowp-note">（图没画出来）</p>'; }
  root.innerHTML = html;
  if (spec.id === 'now-gate') {
    const box = root.querySelector('.nowp-fxr'), d = nowFacts().gate.reactorDate;
    if (box && d) { ensureFxReactorCss(); mounted.fxr = true; Promise.resolve(mountFxReactor(box, { iso: 'AUS', date: d })).catch(e => console.error(e)); }
  }
  return root;
}

/* ---------------------------------------------------------------- shared bits */
const head = (title, sub) => {
  const Fx = nowFacts();
  return `<div class="nowp-h"><b>${esc(title)}</b><small>真实数据 · 美国截至 ${esc(Fx.USA.date)} · 澳洲截至 ${esc(Fx.AUS.date)}${sub ? ' · ' + esc(sub) : ''}</small></div>`;
};
const reserved = () => `<p class="nowp-note nowp-res">2022 年起是保留样本：模型没拿它们拟合，这里只读。${esc(NOW_TRUTH)}。</p>`;
const two = f => `<div class="nowp-two">${NOW_ISOS.map(iso => `<section class="nowp-c" data-iso="${iso}">${f(nowFacts()[iso], iso)}</section>`).join('')}</div>`;
const cTitle = c => `<div class="nowp-ct"><b>${esc(c.name)}</b><small>${esc(c.date)}</small></div>`;

function render(id) {
  if (!nowFacts()) return '<p class="nowp-note">真实数据还没加载。</p>';
  switch (id) {
    case 'now-map': return mapHtml(false);
    case 'now-sum': return mapHtml(true);
    case 'now-river': return riverHtml();
    case 'now-ground': return groundHtml();
    case 'now-lake': return lakeHtml();
    case 'now-ruler': return rulerHtml();
    case 'now-gate': return gateHtml();
    default: return '';
  }
}

/* ---------------------------------------------------------------- now-map / now-sum: five places × two countries */
const LV = { red: 'hot', yellow: 'warm', green: 'calm' };
function cells(c, iso) {
  const p = P(iso), G = nowFacts().gate;
  const full = c.infl > c.target && c.u < c.uAvg;
  const lakeLv = [c.houseLv, c.equityLv].includes('red') ? 'hot' : [c.houseLv, c.equityLv].includes('yellow') ? 'warm' : 'calm';
  const below = c.long.fork === 'B2' || c.long.stage === 5;
  return {
    river: { lv: full ? 'warm' : 'calm', w: full ? '偏满' : '不满', n: `▼ ${T(p + 'Infl')} · 失业 ${T(p + 'U')}` },
    ground: { lv: below ? 'hot' : c.long.pending ? 'warm' : 'calm', w: `${esc(c.long.label.split(' ')[0])} · ${below ? '跌破吸程线' : c.long.pending ? 'B2 待确认' : '没跌破吸程线'}`, n: `洞 ${T(p + 'Pvt')}（平均 ${T(p + 'PvtAvg')}）` },
    lake: { lv: lakeLv, w: esc(nowText(p + 'Lake')), n: `房 ${T(p + 'House')} · 股 ${T(p + 'Eq')}` },
    ruler: { lv: ok(c.band) ? (c.band >= 0 ? 'blue' : 'red') : 'na', w: esc(nowText(p + 'BandW')), n: `▶ − ▼ = ${T(p + 'Band')}` },
    gate: iso === 'USA' ? { lv: 'na', w: '美元是基准', n: '别国的闸都拿美元比' }
      : { lv: G.audYoY > 0 ? 'calm' : 'warm', w: `澳元比一年前${esc(nowText('audMoved'))}`, n: `${T('audYoY')} · 吸力差${T('pushW')}` },
  };
}
const PLACES = [['river', '河', '物价 · 人手'], ['ground', '地下', '洞 · 吸程线'], ['lake', '湖', '哪个池子贵'], ['ruler', '吸力尺', '存湖划不划算'], ['gate', '闸', '汇率']];
function mapHtml(full) {
  const Fx = nowFacts(), C = { USA: cells(Fx.USA, 'USA'), AUS: cells(Fx.AUS, 'AUS') };
  const rows = PLACES.map(([k, name, sub]) => `<div class="nowp-mr" data-place="${k}"><div class="nowp-mp"><b>${name}</b><small>${sub}</small></div>` +
    NOW_ISOS.map(iso => { const x = C[iso][k]; return `<div class="nowp-mc ${x.lv}" data-iso="${iso}"><span>${x.w}</span>${full ? `<small>${x.n}</small>` : ''}</div>`; }).join('') + '</div>').join('');
  return head(full ? '三问之前：五个地方一起看' : '现在在哪：五个地方的速读') +
    `<div class="nowp-map"><div class="nowp-mr nowp-mh"><div></div>${NOW_ISOS.map(iso => `<div><b>${esc(Fx[iso].name)}</b><small>${esc(Fx[iso].date)}</small></div>`).join('')}</div>${rows}</div>` +
    `<div class="nowp-leg"><span><i class="hot"></i>要小心</span><span><i class="warm"></i>偏</span><span><i class="calm"></i>还好</span><span><i class="blue"></i><i class="red"></i>吸力尺的色带</span></div>` +
    (full ? `<p class="nowp-truth"><b>${esc(NOW_TRUTH)}。</b>下一季的数一发布，这张表会跟着变。</p>` : `<p class="nowp-note">每一格先看颜色；下面一步拆开一格。</p>`) + reserved();
}

/* ---------------------------------------------------------------- now-river: the 测流断面 */
function riverHtml() {
  return head('河：测流断面') + two((c, iso) => {
    const p = P(iso), W = 170, H = 120, top = 14, bot = 104, hi = 0.08;
    const Y = v => bot - clamp(v, 0, hi) / hi * (bot - top);
    const yw = Y(c.infl), yt = Y(c.target);
    const xl = y => 18 + (bot - y) * 0.35, xr = y => W - 18 - (bot - y) * 0.35;   // sloped banks
    const svg = `<svg class="nowp-sec" viewBox="0 0 ${W} ${H}" role="img" aria-label="${esc(c.name)}测流断面：物价比一年前 ${T(p + 'Infl')}">` +
      `<path class="nowp-bank" d="M${xl(top - 6)} ${top - 6} L${xl(bot)} ${bot} L${xr(bot)} ${bot} L${xr(top - 6)} ${top - 6}"/>` +
      `<path class="nowp-water" d="M${xl(yw)} ${yw} L${xl(bot)} ${bot} L${xr(bot)} ${bot} L${xr(yw)} ${yw} Z"/>` +
      `<line class="nowp-tgt" x1="6" x2="${W - 6}" y1="${yt}" y2="${yt}"/><text class="nowp-tl" x="${W - 6}" y="${yt + 11}" text-anchor="end">调度线 ${T(p + 'Tgt')}</text>` +
      `<polygon class="exg-m" points="${W / 2},${yw} ${W / 2 - 6},${yw - 10} ${W / 2 + 6},${yw - 10}"/><text class="nowp-wl" x="${W / 2 + 9}" y="${yw - 3}">${T(p + 'Infl')}</text></svg>`;
    const bar = (lab, v, cls) => `<div class="nowp-bar ${cls}"><span>${lab}</span><i style="width:${(clamp(v, 0, 0.1) / 0.1 * 100).toFixed(1)}%"></i><b>${esc(FMT.pct(v))}</b></div>`;
    return cTitle(c) + svg + `<p class="nowp-ro">水位 = 物价比一年前</p>` +
      `<div class="nowp-bars"><div class="nowp-bh">失业率</div>${bar('现在', c.u, 'now')}${bar('1995 年以来平均', c.uAvg, 'avg')}</div>` +
      `<p class="nowp-ro sm">断面装得多满（产出缺口）<b>${T(p + 'Gap')}</b>${iso === 'AUS' ? ' <em class="nowp-est">估算</em>' : ''}</p>`;
  }) + `<p class="nowp-note">水位高过调度线 = 物价涨得比央行要的快；失业率低于平均 = 人手紧。两样一起 = 河偏满。</p>` + reserved();
}

/* ---------------------------------------------------------------- now-ground: the hole and the 吸程线 */
function groundHtml() {
  return head('地下：洞多深，离吸程线多远') + two((c, iso) => {
    const p = P(iso), pts = c.pvtSeries.filter(x => ok(x.v)), n = c.pvtSeries.length;
    const W = 170, H = 112, L = 6, R = 6, top = 22, bot = H - 14;
    const vs = pts.map(x => x.v), lo = Math.min(...vs, c.pvtAvg) - 0.05, hi = Math.max(...vs, c.pvtAvg) + 0.05;
    const X = k => L + k / Math.max(1, n - 1) * (W - L - R), Y = v => top + (v - lo) / (hi - lo) * (bot - top);   // deeper = more debt
    const idx = d => c.pvtSeries.findIndex(x => x.date === d);
    const line = pts.map(x => `${X(idx(x.date)).toFixed(1)},${Y(x.v).toFixed(1)}`).join(' ');
    const last = pts[pts.length - 1], lx = X(idx(last.date)), ly = Y(last.v), ya = Y(c.pvtAvg);
    const svg = `<svg class="nowp-gw" viewBox="0 0 ${W} ${H}" role="img" aria-label="${esc(c.name)}私人债务占 GDP ${T(p + 'Pvt')}，平均 ${T(p + 'PvtAvg')}">` +
      `<rect class="nowp-soil" x="${L}" y="${top - 8}" width="${W - L - R}" height="${bot - top + 8}"/>` +
      `<path class="nowp-gwater" d="M${X(idx(pts[0].date)).toFixed(1)},${bot} L${line.split(' ').join(' L')} L${lx.toFixed(1)},${bot} Z"/>` +
      `<polyline class="nowp-tab" points="${line}"/>` +
      `<line class="nowp-avg" x1="${L}" x2="${W - R}" y1="${ya.toFixed(1)}" y2="${ya.toFixed(1)}"/><text class="nowp-tl" x="${L + 2}" y="${(ya + (ya > ly ? 11 : -3)).toFixed(1)}">平均 ${T(p + 'PvtAvg')}</text>` +
      `<circle class="nowp-dot" cx="${lx.toFixed(1)}" cy="${ly.toFixed(1)}" r="3.5"/><text class="nowp-wl" x="${(lx - 5).toFixed(1)}" y="${(ly - 6).toFixed(1)}" text-anchor="end">${T(p + 'Pvt')}</text>` +
      `<text class="nowp-tl" x="${L}" y="${top - 11}">地面</text><text class="nowp-tl" x="${W - R}" y="${H - 2}" text-anchor="end">${esc(c.pvtSeries[0].date.slice(0, 4))}–${esc(last.date.slice(0, 4))}</text>` +
      `<text class="nowp-tl" x="${L}" y="${H - 2}">越往下 = 欠得越多</text></svg>`;
    const below = c.long.fork === 'B2' || c.long.stage === 5;
    return cTitle(c) + svg +
      `<p class="nowp-ro">洞（私人债务占 GDP）<b>${T(p + 'Pvt')}</b>，${T(p + 'PvtCmp')}${c.pvtNotYet ? `<small>用 ${esc(c.pvtDate)} 的（${esc(c.date)} 还没发布）</small>` : ''}</p>` +
      `<div class="nowp-lift ${below ? 'hot' : c.long.pending ? 'warm' : 'calm'}"><b>吸程线</b><span>${esc(c.long.label)}</span><small>${esc(liftWord(c))}</small>` +
      `<small class="nowp-b2h">上一次跌破：${T(p + 'B2')}</small></div>`;
  }) + `<p class="nowp-note">吸程线不是一个债务数字：它只读 B2 的证据（房价在跌、债务高、降了息信贷还在缩，要连续几季才算）。</p>` + reserved();
}

/* ---------------------------------------------------------------- now-lake: which pools are dear */
function meter(v, bands, axis) {
  const [a, b] = axis, X = x => clamp((x - a) / (b - a), 0, 1) * 100;
  const segs = bands.map(s => { const x0 = X(Math.max(a, s.lo)), x1 = X(Math.min(b, s.hi)); return `<i class="${LV[s.level]}" style="left:${x0.toFixed(1)}%;width:${(x1 - x0).toFixed(1)}%"></i>`; }).join('');
  const off = v > b ? ' off-r' : v < a ? ' off-l' : '';
  return `<div class="nowp-meter">${segs}<em class="nowp-mk${off}" style="left:${X(v).toFixed(1)}%"></em><u class="nowp-one" style="left:${X(1).toFixed(1)}%"></u></div>`;
}
function lakeHtml() {
  return head('湖：哪个池子贵') + two((c, iso) => {
    const p = P(iso);
    const pool = (name, v, lv, sub) => `<div class="nowp-pool ${LV[lv] || 'na'}"><div class="nowp-pn"><b>${name}</b><span>${esc(FMT.x2(v))} · ${esc(VAL_WORD[lv] || '—')}</span></div>${meter(v, c.valBands, c.valAxis)}<small>${sub}</small></div>`;
    const flat = (name, val, sub) => `<div class="nowp-pool na"><div class="nowp-pn"><b>${name}</b><span>${val}</span></div><small>${sub}</small></div>`;
    return cTitle(c) +
      pool('房子', c.house, c.houseLv, '房价 ÷ 收入，1995 年第一季度 = 1 倍') +
      pool('股票', c.equity, c.equityLv, iso === 'USA' ? `市盈率 CAPE ${T('uCape')}，跟 1995 年第一季度比` : '代理：股价 ÷ GDP（澳洲没有市盈率）') +
      flat('国债', `利息 − 物价 ${T(p + 'BondR')}`, '没有估值尺：真实数据里没有债券价格') +
      flat('黄金', `比一年前 ${T(p + 'Gold')}`, `没有估值尺；${iso === 'USA' ? '美元' : '澳元'}计`) +
      flat('现金', `▶ − ▼ ${T(p + 'Band')}`, '看吸力尺（下一步）');
  }) + `<p class="nowp-note">尺子 = 估值灯的颜色带（快照自带）：${T('vY')} 倍以下不贵，${T('vR')} 倍以上贵。竖线 = 1995 年的起点。</p>` + reserved();
}

/* ---------------------------------------------------------------- now-ruler: the 吸力尺 (结账读数) */
function rulerHtml() {
  const Fx = nowFacts(), all = NOW_ISOS.flatMap(i => [Fx[i].pol, Fx[i].infl, Fx[i].target]).filter(ok);
  const lo = Math.min(-0.01, ...all.map(v => v - 0.01)), hi = Math.max(0.06, ...all.map(v => v + 0.01));
  const cols = NOW_ISOS.map(iso => {
    const c = Fx[iso], p = P(iso);
    const g = gaugeSvg({ W: 160, H: 230, lo, hi, p: c.pol, m: c.infl, e: null, target: c.target, marks: ['p', 'm'], band: 'real', title: `${c.name} ${c.date}` });
    return `<div class="exg-col nowp-rc" data-iso="${iso}">${g}<div class="exg-ro"><b class="s-p">▶</b> ${T(p + 'Pol')}　<b class="s-m">▼</b> ${T(p + 'Infl')}</div>` +
      `<div class="exg-ro sm">结账 ▶ − ▼ = <b class="${ok(c.band) && c.band >= 0 ? 'c-blue' : 'c-red'}">${T(p + 'Band')}</b>（${esc(bandColour(c.band))}）</div></div>`;
  }).join('');
  return head('吸力尺：结账读数') + `<div class="exg-row two">${cols}</div>` +
    `<div class="exg-leg"><span><b class="s-p">▶</b> 政策利率</span><span><b class="s-m">▼</b> 物价比一年前</span><span><i class="exg-sw blue"></i>蓝 存湖划算 <i class="exg-sw red"></i>红 不划算</span></div>` +
    `<p class="nowp-note">没有 ▽：真实数据里没有「心里的涨价速度」，色带改用 ▶ − ▼，叫结账读数。绳只用话说：▼ 高过调度线越久，绳越容易松。</p>` + reserved();
}

/* ---------------------------------------------------------------- now-gate: the AUD */
function gateHtml() {
  const G = nowFacts().gate;
  return head('闸：澳元被往哪边推') +
    `<div class="nowp-gate"><div class="nowp-gr"><b>澳洲 ${esc(G.date)}</b><span>1 澳元 = ${T('audUsd')} 美元，比一年前（${esc(G.from)}）<b class="${G.audYoY >= 0 ? 'up' : 'dn'}">${T('audYoY')}</b></span></div>` +
    `<div class="nowp-gr"><b>吸力差</b><span>利差（澳洲 − 美国，近四季平均）${T('gap4')}；1996–2021 平常 ${T('gapMean')} → <b class="${G.push >= 0 ? 'up' : 'dn'}">${T('pushW')}</b></span></div>` +
    `<div class="nowp-gr"><b>怕</b><span>恐慌指数：没有这一季的数</span></div></div>` +
    `<p class="nowp-note">下面是汇率闸本身（第 6 课），拟合只到 ${esc(G.reactorDate)}；${esc(G.date)} 的澳元走向只读上面这三行。</p>` +
    `<div class="nowp-fxr"></div>` + reserved();
}
