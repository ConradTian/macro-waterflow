// 周期 tab, 真实 mode only: 「这张表盘准不准？（回测）」 + the frozen-rules log. Mounted by tabs/cycle.js (dynamic import, so 模型 mode never loads it).
// Every number comes from the generated data modules, never typed here:
//   unemployment / CPI rows   src/data/real/backtest.js          (tools/backtest_real.mjs --write; method tools/BACKTEST.md)
//   policy rate / house rows,
//   the two dial rows, the win src/data/real/backtest-readout.js  (tools/backtest_readout.mjs --write; tools/BACKTEST-READOUT.md)
//   frozen log                src/data/real/frozen-log.js        (tools/freeze_log.mjs, append only)
// Checked by tools/check_backtest_view.mjs.
import { BACKTEST } from '../data/real/backtest.js';
import { BACKTEST_READOUT } from '../data/real/backtest-readout.js';
import { FROZEN_LOG } from '../data/real/frozen-log.js';

try {
  if (typeof document !== 'undefined' && !document.querySelector('link[href*="backtest.css"]')) {
    const l = document.createElement('link');
    l.rel = 'stylesheet'; l.href = new URL('../../assets/css/backtest.css', import.meta.url).href;
    document.head.appendChild(l);
  }
} catch (e) { /* ignore */ }

const CN = { USA: '美国', AUS: '澳洲' };
const VAR_CN = { u: '失业率', pi: '物价涨幅', pol: '政策利率', hp: '房价涨幅' };
const esc = s => String(s ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const num = x => typeof x === 'number' && Number.isFinite(x);
export const fmtErr = v => (num(v) ? (v * 100).toFixed(2) : '—');          // mean absolute error, pp
export const fmtHit = v => (num(v) ? Math.round(v * 100) + '%' : '—');      // share of quarters called right

/** the forecast record of variable v (u / pi / pol / hp), sample w (in / out), horizon h (4 / 8): { noChange, persistence, phaseMean, framework } */
export function rec(iso, w, h, v) {
  if (v === 'u' || v === 'pi') { const S = BACKTEST.countries[iso][w][h === 4 ? 'short' : 'short8']; return S && S.forecasts[v]; }
  return BACKTEST_READOUT.countries[iso][`${w} h${h} ${v}`];
}
const dial = (iso, w) => BACKTEST_READOUT.countries[iso][`${w} h4 dial`];

/** table rows: [id, label, kind, naive(w), framework(w)]; err = smaller wins, hit = larger wins */
export function tableRows(iso) {
  const err = v => w => rec(iso, w, 4, v);
  return [
    { id: 'u', label: '失业率', kind: 'err', get: w => [err('u')(w).noChange.mae, err('u')(w).phaseMean.mae] },
    { id: 'pi', label: '物价涨幅（CPI）', kind: 'err', get: w => [err('pi')(w).noChange.mae, err('pi')(w).phaseMean.mae] },
    { id: 'pol', label: '政策利率', kind: 'err', get: w => [err('pol')(w).noChange.mae, err('pol')(w).phaseMean.mae] },
    { id: 'hp', label: '房价（过去 4 季涨幅）', kind: 'err', get: w => [err('hp')(w).noChange.mae, err('hp')(w).phaseMean.mae] },
    { id: 'short', label: '小周期表盘', kind: 'hit', get: w => [dial(iso, w).shortSame, dial(iso, w).shortNextPhase] },
    { id: 'long', label: '大周期表盘', kind: 'hit', get: w => [dial(iso, w).longSame, dial(iso, w).longNextStage] },
  ];
}

/** direction wins above the noise line (2000–21 only): framework hit − the best naive (no change / always up / persistence) >= noiseLine */
export function directionWins() {
  const line = BACKTEST_READOUT.noiseLine, out = [];
  for (const iso of ['USA', 'AUS']) for (const h of [4, 8]) for (const v of ['u', 'pi', 'pol', 'hp']) {
    const r = rec(iso, 'in', h, v);
    if (!r || !num(r.framework.hit)) continue;
    const naive = Math.max(r.noChange.hit, 1 - r.noChange.hit, r.persistence.hit);
    if (r.framework.hit - naive >= line - 1e-9) out.push({ iso, h, v, fw: r.framework.hit, naive });
  }
  return out;
}

const openState = { how: false };

function tableHtml(iso) {
  const rows = tableRows(iso), wins = directionWins().filter(x => x.iso === iso);
  const cell = (kind, a, b, w) => {
    const f = kind === 'err' ? fmtErr : fmtHit;
    const aWin = kind === 'err' ? a < b : a > b, bWin = kind === 'err' ? b < a : b > a;
    return `<td class="bt-n${aWin ? ' win' : ''}" data-w="${w}" data-m="naive" data-v="${a}">${f(a)}</td>` +
      `<td class="bt-n bt-fw${bWin ? ' win' : ''}" data-w="${w}" data-m="dial" data-v="${b}">${f(b)}</td>`;
  };
  const body = rows.map(r => {
    const [a0, b0] = r.get('in'), [a1, b1] = r.get('out');
    const star = wins.some(x => x.v === r.id) ? '<span class="bt-star" title="见下面的 ★">★</span>' : '';
    return `<tr data-row="${r.id}" data-kind="${r.kind}"${r.kind === 'hit' && r.id === 'short' ? ' class="bt-sep"' : ''}><th scope="row">${esc(r.label)}${star}</th>${cell(r.kind, a0, b0, 'in')}${cell(r.kind, a1, b1, 'out')}</tr>`;
  }).join('');
  return `<div class="bt-tw"><table class="bt-table" data-iso="${iso}">
    <thead><tr><th rowspan="2" class="bt-corner">${CN[iso]} · 4 季后</th><th colspan="2">2000–21</th><th colspan="2" class="bt-out">2022 起</th></tr>
    <tr><th>笨办法</th><th>表盘</th><th class="bt-out">笨办法</th><th>表盘</th></tr></thead>
    <tbody>${body}</tbody></table></div>
    <p class="bt-legend">笨办法 =「下季 = 本季」：什么都照现在猜。前四行比<b>平均误差</b>（百分点，小的赢，加粗）；表盘两行比<b>猜中 4 季后档位的比例</b>（大的赢）：笨办法 = 还停在同一档，表盘 = 按顺序走到下一档。</p>`;
}

function winHtml() {
  const W = directionWins();
  if (!W.length) return '<p class="bt-win none">没有一项比笨办法多猜对 10 个百分点以上（10 个点以内当运气看）。</p>';
  const one = x => `${CN[x.iso]}${VAR_CN[x.v]}：${x.h} 季后是升还是不升，表盘猜对 <b data-v="${x.fw}">${fmtHit(x.fw)}</b>，最好的笨办法 <b data-v="${x.naive}">${fmtHit(x.naive)}</b>`;
  return `<p class="bt-win">★ ${W.length === 1 ? '唯一真正赢的一项' : `真正赢的 ${W.length} 项`}：${W.map(one).join('；')}。` +
    (W.some(x => x.v === 'pol') ? '<small>（表盘在「收紧」时，这一轮加息多半快结束了。）</small>' : '') + '</p>';
}

function summaryHtml(iso) {
  const errRows = tableRows(iso).filter(r => r.kind === 'err');
  const won = errRows.filter(r => { const [a, b] = r.get('in'); return b < a; }).length;
  return `<p class="bt-sum">站在 2000–21 年的每一季、只用当时的数据猜 4 季后：${errRows.length} 个变量里，表盘的误差${won ? `只有 <b>${won}</b> 个` : '<b>没有一个</b>'}比「下季 = 本季」小。</p>`;
}

function frozenHtml(iso) {
  const L = FROZEN_LOG, rows = (L.countries[iso] || []).slice().reverse();
  const rule = id => L.rules.find(r => r.id === id) || L.rules[0];
  const cur = L.rules[L.rules.length - 1];
  const li = r => `<li data-q="${esc(r.q)}"><b class="bt-q">${esc(r.q)}</b><span class="bt-rd">大周期 <b>${esc(r.long.label)}</b>${r.long.fork ? ` · ${esc(r.long.fork)}` : r.long.pending ? ' · B2 待确认' : ''}</span>` +
    `<span class="bt-rd">小周期 <b>${esc(r.short.label)}</b>${r.short.handoff === 'no' ? ' · 推不动' : ''}</span>` +
    `<small class="bt-rec">记于 ${esc(r.recordedOn)}${L.rules.length > 1 ? ` · 规则 #${rule(r.rules).id}` : ''}</small></li>`;
  return `<div class="bt-fz" data-iso="${iso}">
    <h4 class="bt-fz-h">从今天起冻结规则往后记</h4>
    <p class="bt-fz-sub">冻结于 ${esc(L.frozenOn)}；之后每季的读数按当时记下，事后不改</p>
    <ol class="bt-fz-list">${rows.map(li).join('')}</ol>
    <p class="bt-fz-foot">新的一季真实数据到了才加一行。规则指纹 <code data-hash="${esc(cur.regimesSha256)}">${esc(cur.regimesSha256.slice(0, 10))}</code>${L.rules.length > 1 ? `（规则改过 ${L.rules.length - 1} 次，每次都记了原因）` : ''}：规则一改，指纹就变。</p>
  </div>`;
}

/** draw the section into box (an element of the 周期 tab); iso = the real snapshot's country */
export function mountBacktest(box, iso) {
  if (!box) return;
  if (!BACKTEST.countries[iso] || !BACKTEST_READOUT.countries[iso]) { box.innerHTML = ''; return; }
  box.innerHTML = `<section class="bt-sec" data-iso="${iso}">
    <h3 class="pn-h bt-title">这张表盘准不准？（回测）</h3>
    <p class="bt-head">表盘是『现在在哪』的地图，不是预报</p>
    ${summaryHtml(iso)}
    ${tableHtml(iso)}
    ${winHtml()}
    <ul class="bt-cav">
      <li>门槛是事后定的：定规则的人看过 1995–2026 年。</li>
      <li>用的是最终修订过的数据，不是当时第一次公布的数。</li>
      <li>独立的段落很少：2000–21 年约 20 个独立年份，2022 起只有一轮加息。</li>
    </ul>
    <details class="bt-how"><summary>怎么测的</summary>
      <ol class="bt-how-l">
        <li><b>只用当时已有的数据</b>：站在每一季，把之后的数据切掉，让表盘重新读一遍。</li>
        <li><b>和笨办法比</b>：「下季 = 本季」，什么都照现在猜。</li>
        <li><b>2022 起单列</b>：只报告，不拿来改任何规则。</li>
      </ol></details>
    ${frozenHtml(iso)}
  </section>`;
  const d = box.querySelector('details.bt-how');
  d.open = openState.how;
  d.addEventListener('toggle', () => { openState.how = d.open; });
}
