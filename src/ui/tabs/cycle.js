// 周期 tab: conclusion, ring ①–⑧ with B1/B2 fork, four lamps, real-vs-model charts.
import { esc, pct, num, LAMP, LAMP_SYMBOL, compareChart } from './_util.js';
import { term } from '../concepts.js';
import { pctFmt } from '../chart.js';

const NAMES = ['借钱扩张', '缓冲池满', 'B1 通胀', 'B2 缩水', '私人还债', '政府接手', '化债压制', '修复'];
const MARK = '①②③④⑤⑥⑦⑧';
const LAMPS = [
  ['credit', '信贷', 'lampCredit', v => pct(v, 1)],
  ['debtService', '偿债', 'lampDebtService', v => pct(v, 1)],
  ['policy', '政策', 'lampPolicy', v => pct(v, 1)],
  ['valuation', '估值', 'lampValuation', v => num(v, 2)],
];

function ringSvg(ring) {
  const cx = 180, cy = 150, R = 80, r = 16;
  const pos = i => { const a = (-90 + i * 45) * Math.PI / 180; return [cx + R * Math.cos(a), cy + R * Math.sin(a), a]; };
  let g = `<circle cx="${cx}" cy="${cy}" r="${R}" class="rg-line"/>`;
  for (let i = 0; i < 8; i++) {      // arrow heads at mid-arcs (clockwise)
    const a = (-90 + i * 45 + 22.5) * Math.PI / 180, x = cx + R * Math.cos(a), y = cy + R * Math.sin(a), deg = a * 180 / Math.PI + 90;
    g += `<path d="M-4 3 L0 -4 L4 3 Z" class="rg-arrow" transform="translate(${x.toFixed(1)} ${y.toFixed(1)}) rotate(${deg.toFixed(0)})"/>`;
  }
  for (let i = 0; i < 8; i++) {
    const [x, y, a] = pos(i), st = i + 1, p = (ring.probs && ring.probs[st]) || 0, cur = ring.stage === st;
    const fork = st === 3 || st === 4;
    g += `<g data-term="ringStage" class="rg-node${cur ? ' cur' : ''}${fork ? ' fork' : ''}" tabindex="0" role="button" aria-label="${MARK[i]} ${NAMES[i]} ${(p * 100).toFixed(0)}%${cur ? '，当前位置' : ''}">` +
      `<circle cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" r="${cur ? r + 3 : r}"/>` +
      `<text x="${x.toFixed(1)}" y="${(y + 5).toFixed(1)}" text-anchor="middle" class="rg-num">${MARK[i]}</text></g>`;
    // label outside
    const cos = Math.cos(a), sin = Math.sin(a), lx = cx + (R + 28) * cos, ly = cy + (R + 28) * sin;
    const anchor = Math.abs(cos) < 0.3 ? 'middle' : cos > 0 ? 'start' : 'end';
    const tx = anchor === 'middle' ? lx : cx + (R + r + 6) * cos;
    const ty = Math.abs(sin) > 0.9 ? (sin < 0 ? ly - 8 : ly + 4) : ly - 6;
    const bw = 36, bx = anchor === 'middle' ? tx - bw / 2 : anchor === 'start' ? tx : tx - bw;
    g += `<text x="${tx.toFixed(1)}" y="${ty.toFixed(1)}" text-anchor="${anchor}" class="rg-name${cur ? ' cur' : ''}">${cur ? '▶ ' : ''}${NAMES[i]}</text>` +
      `<rect x="${bx.toFixed(1)}" y="${(ty + 4).toFixed(1)}" width="${bw}" height="5" rx="2" class="rg-bar0"/>` +
      `<rect x="${bx.toFixed(1)}" y="${(ty + 4).toFixed(1)}" width="${(bw * Math.min(1, p)).toFixed(1)}" height="5" rx="2" class="rg-bar"/>` +
      `<text x="${(anchor === 'end' ? bx - 3 : bx + bw + 3).toFixed(1)}" y="${(ty + 10).toFixed(1)}" text-anchor="${anchor === 'end' ? 'end' : 'start'}" class="rg-pct">${(p * 100).toFixed(0)}%</text>`;
  }
  const lab = esc(ring.label || '');
  g += `<text x="${cx}" y="${cy - 8}" text-anchor="middle" class="rg-c1">${lab}</text>` +
    `<text x="${cx}" y="${cy + 10}" text-anchor="middle" class="rg-c2">${ring.fork ? '短周期岔路：' + ring.fork : '岔路口在 ② 之后：B1 或 B2'}</text>`;
  return `<svg viewBox="-10 0 380 300" class="rg-svg" role="img" aria-label="债务环 ①到⑧，当前 ${lab}">${g}</svg>`;
}

export function render(container, ctx) {
  const s = ctx.snap, ring = s.ring || {}, L = s.lights || {};
  const lamps = LAMPS.map(([k, name, tid, f]) => {
    const l = L[k] || {};
    return `<div class="lp lp-${l.level}"><div class="lp-top"><span class="lp-sym" aria-hidden="true">${LAMP_SYMBOL[l.level] || '○'}</span>` +
      `${term(tid, name + '灯')}<b class="lp-lv">${LAMP[l.level] || '—'}</b></div>` +
      `<div class="lp-val">${esc(l.label || '')} ${f(l.value)}</div><div class="lp-drv">驱动：${esc(l.driver || '—')}</div></div>`;
  }).join('');
  container.innerHTML = `<section class="pn-tab pn-cycle">
    <p class="pn-lead">现在大概在 <b>${esc(ring.label || '—')}</b>，下一个确认信号：<b>${esc(ring.nextSignal || '—')}</b></p>
    <h3 class="pn-h">${term('ringStage', '债务环')} <small>点节点看说明；横条 = 该阶段概率</small></h3>
    ${ringSvg(ring)}
    <h3 class="pn-h">四盏灯 <small>形状 + 文字 + 颜色同时表示</small></h3>
    <div class="lp-grid">${lamps}</div>
    <h3 class="pn-h">真实 vs 模型 <small>模型偏离真实本来就正常：它是玩具</small></h3>
    <div class="pn-charts"><div id="cy-c1"></div><div id="cy-c2"></div><div id="cy-c3"></div></div>
  </section>`;
  compareChart(container.querySelector('#cy-c1'), ctx, { title: '政策利率', realKey: 'policyRate', modelFn: x => x.rates.policy, fmt: pctFmt });
  compareChart(container.querySelector('#cy-c2'), ctx, { title: '房价指数 (1995Q1=100)', realKey: 'houseIndex', modelFn: x => x.assets.housing.price });
  compareChart(container.querySelector('#cy-c3'), ctx, { title: '家庭 DSR', realKey: 'hhDsr', modelFn: x => x.household.dsr, fmt: pctFmt });
}
