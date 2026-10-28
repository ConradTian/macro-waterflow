// 接管 tab: take over ONE role (central bank working), rule list with toggles, real/model/user comparison.
import { esc, pct, num, PLAYERS, playerOf, compareChart } from './_util.js';
import { pctFmt } from '../chart.js';
import { linkify, term } from '../concepts.js';

let rate = null;        // user's pending policy rate (decimal)
const OPEN = ['centralBank'];
const NOT_VISIBLE = ['银行内部的资本比率与坏账率', '家庭 DSR / LVR 的真实分布', '资产缓冲池的水位（房价与资产估值是否偏离）', '企业 Capex 管道与实际产能', '外部冲击（油价、海外需求）将来会不会来'];

const peaks = (arr, fn) => {
  const v = arr.map(fn).filter(x => x != null && isFinite(x));
  return v.length ? [Math.max(...v), Math.min(...v)] : [null, null];
};

function table(ctx) {
  const t = ctx.sim.t, S = ctx.real.series;
  const m = ctx.sim.history('model'), u = ctx.sim.history('user');
  const rows = [
    ['政策利率 峰值', 'policyRate', x => x.rates.policy, 0, v => pct(v, 2)],
    ['通胀 峰值', 'cpiYoY', x => x.macro.inflation, 0, v => pct(v, 1)],
    ['失业率 峰值', 'unemployment', x => x.macro.unemployment, 0, v => pct(v, 1)],
    ['失业率 谷值', 'unemployment', x => x.macro.unemployment, 1, v => pct(v, 1)],
    ['房价指数 峰值', 'houseIndex', x => x.assets.housing.price, 0, v => num(v, 0)],
    ['房价指数 谷值', 'houseIndex', x => x.assets.housing.price, 1, v => num(v, 0)],
    ['家庭 DSR 峰值', 'hhDsr', x => x.household.dsr, 0, v => pct(v, 1)],
  ];
  const body = rows.map(([name, key, fn, which, f]) => {
    const real = S[key] ? peaks(S[key].slice(0, t + 1), x => x)[which] : null;
    const mod = peaks(m, fn)[which];
    const usr = u && u.length ? peaks(u, fn)[which] : null;
    const diff = usr != null && mod != null ? usr - mod : null;
    const dtxt = diff == null ? '' : '<small>' + (Math.abs(diff) < 5e-4 ? '＝ 与模型相同' : (diff > 0 ? '▲ 比模型高 ' : '▼ 比模型低 ') + f(Math.abs(diff))) + '</small>';
    return `<tr><th>${name}</th><td>${real == null ? '—' : f(real)}</td><td>${mod == null ? '—' : f(mod)}</td><td>${usr == null ? '—' : f(usr)}${dtxt}</td></tr>`;
  }).join('');
  return `<table class="tk-table"><thead><tr><th></th><th>真实</th><th>模型</th><th>你的版本</th></tr></thead><tbody>${body}</tbody></table>`;
}

function rulesHtml(sim) {
  const groups = {};
  sim.rules.forEach(r => (groups[r.player] ||= []).push(r));
  return Object.keys(groups).map(p => {
    const pl = playerOf(p);
    return `<div class="tk-grp"><h4 style="--pc:${pl.color}"><span class="lg-mark" aria-hidden="true">${pl.mark}</span>${pl.name}</h4>` +
      groups[p].map(r => `<label class="tk-rule"><input type="checkbox" data-rule="${esc(r.id)}" ${r.enabled ? 'checked' : ''}><span>${linkify(r.text)}</span><em>${r.enabled ? '开' : '关'}</em></label>`).join('') + '</div>';
  }).join('');
}

export function render(container, ctx) {
  const { sim, snap: s } = ctx, taken = sim.takenOver;
  const picks = Object.keys(PLAYERS).map(p => {
    const open = OPEN.includes(p), on = taken === p;
    return `<button type="button" class="pn-chip${on ? ' on' : ''}" data-pick="${p}" ${open ? '' : 'disabled'} aria-pressed="${on}">${playerOf(p).name}${open ? '' : '（即将开放）'}</button>`;
  }).join('');
  let main = '';
  if (taken === 'centralBank') {
    const sug = sim.suggestion('centralBank') || {};
    const sugRate = sug.values && sug.values.policyRate;
    if (rate == null) rate = sugRate ?? s.rates.policy;
    main = `
      <div class="tk-box"><h4>你只看得到这些（央行的视角）</h4>
        <div class="tk-obs"><div><small>通胀 ${term('cpi', 'CPI')}</small><b>${pct(s.macro.inflation)}</b></div>
          <div><small>${term('unemployment', '失业率')}</small><b>${pct(s.macro.unemployment)}</b></div>
          <div><small>${term('outputGap', '产出缺口')}</small><b>${pct(s.macro.outputGap)}</b></div>
          <div><small>${term('creditImpulse', '信贷脉冲')}</small><b>${pct(s.lights.credit.value)}</b></div></div>
        <h4>你看不到（所以央行总是慢半拍）</h4>
        <ul class="tk-hid">${NOT_VISIBLE.map(x => `<li>${esc(x)}</li>`).join('')}</ul></div>
      <div class="tk-box"><h4>你的决策：${term('policyRate', '政策利率')}</h4>
        <div class="tk-step"><button type="button" id="tk-m" aria-label="降 0.25 个百分点">−0.25</button>
          <output id="tk-v">${(rate * 100).toFixed(2)}%</output><button type="button" id="tk-p" aria-label="升 0.25 个百分点">+0.25</button></div>
        <input type="range" id="tk-r" min="0" max="10" step="0.25" value="${(rate * 100).toFixed(2)}" aria-label="政策利率 0 到 10%">
        <div class="tk-sug"><span>规则建议</span><b>${sugRate != null ? (sugRate * 100).toFixed(2) + '%' : '—'}</b> ${esc(sug.text || '')}
          <button type="button" id="tk-use" ${sugRate == null ? 'disabled' : ''}>采用建议</button></div>
        <p class="pn-sub">当前模型利率 ${pct(s.rates.policy, 2)}；改动从下一个季度起生效，之后每步沿用，直到你再改。</p></div>
      <h3 class="pn-h">三条线对比 <small>真实 · 模型 · 你的版本</small></h3>
      <div class="pn-charts"><div id="tk-c1"></div><div id="tk-c2"></div><div id="tk-c3"></div><div id="tk-c4"></div></div>
      <h3 class="pn-h">峰值 / 谷值差异</h3>${table(ctx)}`;
  } else {
    main = `<div class="tk-box"><p>结论：接管 = 暂停某个角色的自动规则，由你来下决定，其余角色仍按规则运行；然后和“真实历史”“模型基准”对比。</p>
      <p class="pn-sub">粗版本先开放央行：你只能看到央行看得到的信息，并设定政策利率。</p>
      <button type="button" class="tk-go" id="tk-take">接管央行（从 ${esc(s.date)} 起）</button></div>`;
  }
  container.innerHTML = `<section class="pn-tab pn-takeover">
    <p class="pn-lead">${taken ? `你正在扮演 <b>${playerOf(taken).name}</b>。` : '选一个角色接管，一次只能一个。'}</p>
    <div class="pn-chips" role="group" aria-label="选择角色">${picks}</div>
    ${taken ? '<button type="button" class="tk-exit" id="tk-exit">退出接管</button>' : ''}
    ${main}
    <h3 class="pn-h">规则清单 <small>可逐条开关，看效果</small></h3><div class="tk-rules">${rulesHtml(sim)}</div></section>`;

  const redo = () => render(container, ctx);
  container.querySelectorAll('[data-pick]:not([disabled])').forEach(b => b.addEventListener('click', () => { rate = null; sim.takeover(b.dataset.pick); redo(); }));
  const take = container.querySelector('#tk-take');
  if (take) take.addEventListener('click', () => { rate = null; sim.takeover('centralBank'); redo(); });
  const ex = container.querySelector('#tk-exit');
  if (ex) ex.addEventListener('click', () => { sim.takeover(null); rate = null; redo(); });
  container.querySelectorAll('[data-rule]').forEach(i => i.addEventListener('change', () => {
    sim.setRuleEnabled(i.dataset.rule, i.checked);
    i.closest('label').querySelector('em').textContent = i.checked ? '开' : '关';
  }));
  if (taken === 'centralBank') {
    const out = container.querySelector('#tk-v'), sl = container.querySelector('#tk-r');
    const set = (v, commit) => {
      rate = Math.min(0.10, Math.max(0, Math.round(v * 400) / 400));
      out.textContent = (rate * 100).toFixed(2) + '%';
      sl.value = (rate * 100).toFixed(2);
      if (commit) sim.setDecision('centralBank', { policyRate: rate });
    };
    sl.addEventListener('input', () => set(+sl.value / 100, false));
    sl.addEventListener('change', () => set(+sl.value / 100, true));
    container.querySelector('#tk-m').addEventListener('click', () => set(rate - 0.0025, true));
    container.querySelector('#tk-p').addEventListener('click', () => set(rate + 0.0025, true));
    const use = container.querySelector('#tk-use');
    if (use) use.addEventListener('click', () => { const v = sim.suggestion('centralBank')?.values?.policyRate; if (v != null) set(v, true); });
    compareChart(container.querySelector('#tk-c1'), ctx, { title: '政策利率', realKey: 'policyRate', modelFn: x => x.rates.policy, fmt: pctFmt });
    compareChart(container.querySelector('#tk-c2'), ctx, { title: '房价指数', realKey: 'houseIndex', modelFn: x => x.assets.housing.price });
    compareChart(container.querySelector('#tk-c3'), ctx, { title: '通胀', realKey: 'cpiYoY', modelFn: x => x.macro.inflation, fmt: pctFmt });
    compareChart(container.querySelector('#tk-c4'), ctx, { title: '失业率', realKey: 'unemployment', modelFn: x => x.macro.unemployment, fmt: pctFmt });
  }
}
