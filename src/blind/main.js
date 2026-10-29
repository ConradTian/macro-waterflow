// 历史盲测 (/blind/): one card = a country at the END of a year. Look at the levels, judge both cycles, allocate 100 万澳元 in 10% steps,
// then the reveal: real AUD returns, the framework's rule-based call, 判断分 + 收益分. Every 10 cards a bias profile.
// Contract: tools/BLIND-CONTRACT.md. Data: src/data/blind-cards.js (read only). Progress: ./store.js (localStorage, optional).
// URL: ?card=USA-2006 opens a card, ?view=deck | bias, ?theme=dark.
import { COUNTRIES, TYPE_NAME, LONG_ORDER, LONG_NAME, SHORT_ORDER, SHORT_NAME, FORK_NAME,
  assetsOf, deckOrder, sumW, scorePlay, biasProfile, totals } from './model.js';
import { esc, P, SP, term, tanksHtml, readingsHtml, gapHtml, pctHtml, longDialSvg, shortDialSvg, signalsHtml } from './draw.js';
import { initConcepts } from './concept.js';
import * as store from './store.js';

const q = new URLSearchParams(location.search);
try { if (q.get('theme') === 'dark' || q.get('theme') === 'light') document.documentElement.dataset.theme = q.get('theme'); } catch (e) { /* ignore */ }

let BLIND = null, CARDS = [], BY = {}, DECK = [];
let S = store.load();
const ui = { view: 'play', cur: null, filt: { iso: 'all', type: 'all', status: 'all' }, openSigs: new Set(), resetArm: false };
const $ = sel => document.querySelector(sel);
const main = () => $('#bl-main');

const playOf = id => S.plays.find(p => p.id === id) || null;
const titleOf = c => `${COUNTRIES[c.iso] || c.iso} · ${c.year} 年底`;
const persist = () => store.save(S);

function nextId(after) {
  const ids = DECK.map(c => c.id), start = after ? ids.indexOf(after) + 1 : 0;
  for (let i = 0; i < ids.length; i++) { const id = ids[(start + i) % ids.length]; if (!playOf(id)) return id; }
  return null;
}
function draftFor(id) {
  if (!S.draft || S.draft.id !== id) S.draft = { id, long: null, fork: 'none', short: null, w: {} };
  return S.draft;
}

/* ---------- top bar ---------- */
function topHtml() {
  const t = totals(S.plays, BY);
  const sc = t.n ? ` · 判断 <b>${t.judge.toFixed(1)}</b> · 收益 <b>${t.ret.toFixed(1)}</b>` : '';
  $('#bl-score').innerHTML = `已玩 <b>${t.n}</b>/${CARDS.length}${sc}`;
  $('#bl-deck-btn').setAttribute('aria-pressed', ui.view === 'deck' ? 'true' : 'false');
}

/* ---------- play screen ---------- */
function headHtml(c, revealed) {
  const tags = [];
  if (c.holdout) tags.push(`<button type="button" class="bl-tag hold" data-bterm="holdout">保留样本</button>`);
  if (c.batch === 1) tags.push(`<span class="bl-tag">第一批</span>`);
  if (revealed) tags.push(`<span class="bl-tag type t-${esc(c.type)}">${esc(TYPE_NAME[c.type] || c.type)}</span>`);
  return `<div class="bl-head"><h2 class="bl-card-title">${esc(titleOf(c))}</h2>${tags.join('')}` +
    `<p class="bl-sub">你站在 ${c.year} 年底，只看得到这一年为止的数据。先判断周期，再分配 100 万澳元。</p></div>`;
}
function survivorHtml() {
  if (S.survivorSeen) return '';
  return `<div class="bl-banner" id="bl-surv"><p><b>先说一句：</b>牌组里只有美国、日本、澳洲、中国这些今天还在、还富的国家。股市归零过的国家不在这里，所以股票会显得比真实历史更好（${term('survivor', '幸存者偏差', true)}）。</p>` +
    `<button type="button" class="btn" data-act="surv-ok">知道了</button></div>`;
}
function seeHtml(c) {
  const notes = (c.notes || []);
  return `<div class="bl-see">` +
    `<section class="bl-box"><h3>水位 <small>年度数据只有水位，没有流量；点水箱看解释</small></h3>${tanksHtml(c)}${readingsHtml(c)}</section>` +
    `<section class="bl-box">${gapHtml(c)}</section>` +
    `<section class="bl-box"><h3>${term('pctile', '相对历史位置', true)} <small>只用到 ${c.year} 年为止</small></h3>${pctHtml(c)}</section>` +
    (notes.length ? `<details class="bl-notes"><summary>这张卡的数据说明（${notes.length} 条）</summary><ul>${notes.map(n => `<li>${esc(n)}</li>`).join('')}</ul></details>` : '') +
    `</div>`;
}
function chips(kind, items, cur, disabled) {
  return `<div class="bl-chips" role="group">${items.map(([v, label]) =>
    `<button type="button" class="bl-chip${cur === v ? ' on' : ''}" data-pick-${kind}="${esc(v)}" aria-pressed="${cur === v}"${disabled ? ' disabled' : ''}>${esc(label)}</button>`).join('')}</div>`;
}
function judgeHtml(c, pick, play) {
  const call = play ? c.view.call : null, ro = !!play;
  const sigOpen = k => (ui.openSigs.has(k) ? ' open' : '');
  const longCard = `<div class="bl-dcard bl-long"><h4>${term('longCycle', '大周期')} <small>几十年一轮 · 以年计</small></h4>${longDialSvg(pick, call)}` +
    chips('long', LONG_ORDER.map(s => [s, `${s} ${LONG_NAME[s]}`]), pick.long, ro) +
    `<div class="bl-fork-l">② 之后的岔路：</div>` + chips('fork', [['none', '没有'], ['B1', 'B1 溢出（通胀）'], ['B2', 'B2 缩水（通缩）']], pick.fork || 'none', ro) +
    signalsHtml(c, 'long', !!play).replace('<details class="bl-sigs"', `<details class="bl-sigs"${play ? '' : sigOpen('long')}`) + `</div>`;
  const shortCard = `<div class="bl-dcard bl-short"><h4>${term('shortCycle', '小周期')} <small>几年一轮 · 跟着央行走</small></h4>${shortDialSvg(pick, call)}` +
    chips('short', SHORT_ORDER.map(k => [k, SHORT_NAME[k]]), pick.short, ro) +
    (call ? `<p class="bl-calllab">框架：${esc(call.labels?.short || SHORT_NAME[call.short])}</p>` : '') +
    signalsHtml(c, 'short', !!play).replace('<details class="bl-sigs"', `<details class="bl-sigs"${play ? '' : sigOpen('short')}`) + `</div>`;
  return `<section class="bl-box" id="bl-judge"><h3>① 判断周期 <small>${play ? '实心 = 框架的判断，虚框「你」= 你选的' : '在表盘或下面的按钮上选'}</small></h3>` +
    `<div class="bl-dials">${longCard}${shortCard}</div></section>`;
}
function allocHtml(c, w, ro) {
  const A = assetsOf(c), tot = sumW(w);
  const row = a => {
    const v = +w[a.k] || 0;
    const name = a.term ? term(a.term, a.name) : `<b>${esc(a.name)}</b>`;
    return `<div class="bl-arow${a.off ? ' off' : ''}" data-k="${a.k}"><div class="bl-aname"><i class="bl-sw ${a.col}"></i>${name}<small>${esc(a.off ? '这张卡没有数据' : a.sub)}</small></div>` +
      `<div class="bl-actl"><button type="button" class="bl-step" data-dec="${a.k}" aria-label="${esc(a.name)} 减 10%"${ro || a.off || v <= 0 ? ' disabled' : ''}>−</button>` +
      `<output class="bl-aval">${v * 10}%</output>` +
      `<button type="button" class="bl-step" data-inc="${a.k}" aria-label="${esc(a.name)} 加 10%"${ro || a.off || tot >= 10 ? ' disabled' : ''}>+</button></div>` +
      `<div class="bl-abar" aria-hidden="true"><i class="${a.col}" style="width:${v * 10}%"></i></div></div>`;
  };
  const main4 = A.filter(a => !a.fx), fx = A.filter(a => a.fx);
  const seg = A.filter(a => +w[a.k]).map(a => `<i class="${a.col}" style="width:${w[a.k] * 10}%" title="${esc(a.name)} ${w[a.k] * 10}%"></i>`).join('');
  const msg = tot === 10 ? '合计 100% ✓' : `合计 ${tot * 10}% · 还差 ${(10 - tot) * 10}%`;
  return `<section class="bl-box" id="bl-alloc"><h3>② 分配 100 万澳元 <small>每格 10%，合计要 100%；回报按${term('realAud', '实际澳元', true)}算</small></h3>` +
    `<div class="bl-total${tot === 10 ? ' full' : ''}"><div class="bl-tbar">${seg}</div><span id="bl-total">${msg}</span></div>` +
    main4.map(row).join('') +
    `<div class="bl-agrp">外币现金 <small>换成别国的钱存着，拿那个国家的短期利率</small></div>` + fx.map(row).join('') +
    (ro ? '' : `<div class="bl-presets"><button type="button" class="btn" data-act="clear">清零</button><button type="button" class="btn" data-act="bench">照抄基准 60/40</button>` +
      `<button type="button" class="btn" data-act="fill">剩下的放现金</button></div>`) + `</section>`;
}
function goHtml(pick) {
  const need = [];
  if (!pick.long) need.push('大周期');
  if (!pick.short) need.push('小周期');
  const t = sumW(pick.w);
  if (t !== 10) need.push(`配置还差 ${(10 - t) * 10}%`);
  return `<div class="bl-goarea" id="bl-goarea"><button type="button" class="btn primary bl-go" data-act="reveal"${need.length ? ' disabled' : ''}>揭晓：后来发生了什么</button>` +
    `<span class="bl-need">${need.length ? '还差：' + esc(need.join('、')) : '可以揭晓了'}</span></div>`;
}

/* ---------- the reveal ---------- */
function retCls(v) { return typeof v !== 'number' ? '' : v > 0.0005 ? 'up' : v < -0.0005 ? 'down' : ''; }
function revealHtml(c, play) {
  const s = scorePlay(c, play), pf = s.pf, R1 = c.reveal.ret1, R3 = c.reveal.ret3, yrs = R3.years || 3;
  const short = yrs < 3 ? `只有 ${yrs} 年` : '';
  const h3 = short ? `<span class="bl-short-tag">${short}</span>` : '';
  const A = assetsOf(c).filter(a => !a.off);
  const rows = A.map(a => `<tr${+play.w[a.k] ? ' class="mine"' : ''}><th>${esc(a.name)}</th><td class="w">${(+play.w[a.k] || 0) * 10}%</td>` +
    `<td class="${retCls(R1[a.k])}">${SP(R1[a.k])}</td><td class="${retCls(R3[a.k])}">${SP(R3[a.k])}</td></tr>`).join('');
  const hc = COUNTRIES[c.iso];
  const J = s.judge, Rt = s.ret;
  const lit = (c.view.call.signals || []).filter(x => x.lit);
  const n = S.plays.length, isLast = S.plays[n - 1]?.id === c.id;
  const bias = isLast && n % 10 === 0 ? biasHtml(true) : '';
  const nxt = nextId(c.id);
  return `<section class="bl-box bl-reveal" id="bl-reveal"><h3>揭晓 · ${esc(TYPE_NAME[c.type] || c.type)}</h3>` +
    `<p class="bl-what">${esc(c.reveal.what)}</p>` +
    `<div class="bl-scores"><div class="bl-sc" data-score="judge"><span>${term('judge', '判断分', true)}</span><b class="bl-sv">${J.total}</b><i>/10</i>` +
    `<small>大周期 ${J.long}/4 · 岔路 ${J.fork}/2 · 小周期 ${J.short}/4</small></div>` +
    `<div class="bl-sc" data-score="ret"><span>${term('ret', '收益分', true)}</span><b class="bl-sv">${Rt.total.toFixed(1)}</b><i>/10</i>` +
    `<small>比基准 ${SP(Rt.ex)}/年（1 年与 3 年平均）</small></div></div>` +
    `<p class="bl-caveat">判断分只说明你和框架的规则像不像。框架只是一套按年的规则，不是标准答案。</p>` +
    `<div class="bl-pf"><div><span>你的组合</span><b class="${retCls(pf.p1)}">1 年 ${SP(pf.p1)}</b><b class="${retCls(pf.p3)}">3 年年化 ${SP(pf.p3)}</b>${h3}` +
    `<em>100 万 → ${yrs} 年后 ${pf.wealth.toFixed(0)} 万</em></div>` +
    `<div><span>${term('bench', `基准：${hc} 60/40`, true)}</span><b class="${retCls(pf.b1)}">1 年 ${SP(pf.b1)}</b><b class="${retCls(pf.b3)}">3 年年化 ${SP(pf.b3)}</b>` +
    `<em>100 万 → ${pf.bwealth.toFixed(0)} 万</em></div></div>` +
    `<table class="bl-ret"><thead><tr><th>资产</th><th>你配</th><th>1 年</th><th>3 年年化${short ? `<br><small>${short}</small>` : ''}</th></tr></thead><tbody>${rows}</tbody></table>` +
    `<p class="bl-retnote">实际澳元回报：换成澳元、扣掉澳洲通胀。${yrs < 3 ? `数据只到 ${c.year + yrs} 年，所以「3 年」只有 ${yrs} 年。` : ''}</p>` +
    `<div class="bl-call"><b>框架的判断：</b>${esc(c.view.call.labels?.long || c.view.call.long)}${c.view.call.fork ? ` + ${esc(c.view.call.fork)}` : ''} · ${esc(c.view.call.labels?.short || '')}` +
    (lit.length ? `<ul>${lit.map(x => `<li>${esc(x.text)}</li>`).join('')}</ul>` : '<p>没有读数亮。</p>') + `</div>` +
    bias +
    `<div class="bl-nextrow">${nxt ? `<button type="button" class="btn primary" data-act="next">下一张 →</button>` : `<span>全部玩完了！</span>`}` +
    `<button type="button" class="btn" data-act="deck">看牌组</button></div></section>`;
}

/* ---------- bias profile ---------- */
function biasHtml(inline) {
  const n = S.plays.length;
  const items = biasProfile(S.plays, BY);
  const head = `<h3>偏差画像 <small>已玩 ${n} 张 · 用简单的计数规则</small></h3>`;
  const body = n < 10 ? `<p>玩满 10 张才出画像（现在 ${n} 张）。</p>`
    : items.length ? `<ul class="bl-bias-l">${items.map(b => `<li data-bias="${b.id}"><b>${esc(b.title)}</b><span>${esc(b.detail)}</span><em>${esc(b.tip)}</em></li>`).join('')}</ul>`
      : `<p>暂时没看到明显的偏差。继续玩，样本越多越准。</p>`;
  return `<div class="bl-bias${inline ? ' inline' : ''}" id="bl-bias">${head}${body}</div>`;
}

function renderPlay() {
  const c = BY[ui.cur];
  if (!c) { ui.view = 'deck'; return renderDeck(); }
  const play = playOf(c.id);
  const pick = play || draftFor(c.id);
  main().innerHTML = `<section class="bl-play" data-card="${c.id}">${survivorHtml()}${headHtml(c, !!play)}<div class="bl-cols">${seeHtml(c)}` +
    `<div class="bl-do">${play ? revealHtml(c, play) : ''}${judgeHtml(c, pick, play)}${allocHtml(c, pick.w, !!play)}${play ? '' : goHtml(pick)}</div></div></section>`;
}
function refreshDraft() {    // after a pick / +/−: redraw only the parts that change (keeps the scroll and the open <details>)
  const c = BY[ui.cur], d = draftFor(c.id);
  for (const [id, html] of [['#bl-judge', judgeHtml(c, d, null)], ['#bl-alloc', allocHtml(c, d.w, false)], ['#bl-goarea', goHtml(d)]]) {
    const el = $(id);
    if (el) el.outerHTML = html;
  }
  persist();
}

/* ---------- deck ---------- */
function renderDeck() {
  const t = totals(S.plays, BY), f = ui.filt;
  const fchips = (key, items) => `<div class="bl-chips sm" role="group">${items.map(([v, l]) =>
    `<button type="button" class="bl-chip${f[key] === v ? ' on' : ''}" data-filt="${key}:${v}" aria-pressed="${f[key] === v}">${esc(l)}</button>`).join('')}</div>`;
  const list = DECK.filter(c => (f.iso === 'all' || c.iso === f.iso) && (f.type === 'all' || c.type === f.type) &&
    (f.status === 'all' || (f.status === 'done') === !!playOf(c.id)));
  const tile = c => {
    const p = playOf(c.id), s = p ? scorePlay(c, p) : null;
    return `<button type="button" class="bl-tile${p ? ' done' : ''}" data-open="${c.id}"><span class="bl-tt">${esc(COUNTRIES[c.iso])} ${c.year}</span>` +
      `<span class="bl-tm"><i class="bl-tag type t-${esc(c.type)}">${esc(c.type)}</i>${c.holdout ? '<i class="bl-tag hold">保留</i>' : ''}${c.batch === 1 ? '<i class="bl-tag">首批</i>' : ''}</span>` +
      `<span class="bl-ts2">${p ? `✓ 判断 ${s.judge.total} · 收益 ${s.ret.total.toFixed(1)}` : '没玩'}</span></button>`;
  };
  const m = BLIND.method || {};
  main().innerHTML = `<section class="bl-deck"><div class="bl-dhead"><h2>牌组</h2><span>${t.n}/${CARDS.length} 张已玩</span></div>` +
    `<div class="bl-sum"><div><span>已玩</span><b id="bl-n">${t.n}</b></div><div><span>${term('judge', '判断分', true)} 平均</span><b>${t.n ? t.judge.toFixed(1) : '—'}</b></div>` +
    `<div><span>${term('ret', '收益分', true)} 平均</span><b>${t.n ? t.ret.toFixed(1) : '—'}</b></div><div><span>平均每张比基准</span><b>${t.n ? SP(t.ex) + '/年' : '—'}</b></div></div>` +
    `<div class="bl-dact">${nextId(ui.cur) ? `<button type="button" class="btn primary" data-act="next">${t.n ? '继续下一张 →' : '开始第一张 →'}</button>` : ''}` +
    `<button type="button" class="btn" data-act="bias"${t.n < 10 ? ' disabled' : ''}>偏差画像${t.n < 10 ? `（满 10 张）` : ''}</button></div>` +
    `<div class="bl-filters"><span>国家</span>${fchips('iso', [['all', '全部'], ...Object.entries(COUNTRIES)])}` +
    `<span>类型</span>${fchips('type', [['all', '全部'], ['危', '危机前夜'], ['转', '转折点'], ['平', '平常']])}` +
    `<span>进度</span>${fchips('status', [['all', '全部'], ['todo', '没玩'], ['done', '玩过']])}</div>` +
    `<p class="bl-dnote">类型会剧透一点：想盲玩就别按类型挑。</p>` +
    `<div class="bl-grid">${list.map(tile).join('') || '<p>没有符合的卡。</p>'}</div>` +
    `<details class="bl-notes"><summary>数据怎么算的</summary><ul>${Object.values(m).map(v => `<li>${esc(v)}</li>`).join('')}` +
    `<li>${term('survivor', '幸存者偏差', true)}：牌组里只有今天还在、还富的国家。</li><li>v1 没有黄金（JST 数据库里没有）。</li></ul>` +
    `<p class="bl-src">来源：${(BLIND.sources || []).map(s => esc(s.name)).join('；')}</p></details>` +
    `<div class="bl-reset"><button type="button" class="btn danger" data-act="reset">${ui.resetArm ? '确定清空全部进度？再点一次' : '重置进度'}</button>` +
    (ui.resetArm ? `<button type="button" class="btn" data-act="reset-no">取消</button>` : '') + `<a class="btn" href="../">‹ 回主游戏</a></div></section>`;
}
function renderBias() {
  main().innerHTML = `<section class="bl-biasv">${biasHtml(false)}<div class="bl-nextrow">` +
    `${nextId(ui.cur) ? '<button type="button" class="btn primary" data-act="next">继续下一张 →</button>' : ''}<button type="button" class="btn" data-act="deck">看牌组</button></div></section>`;
}

function render(scroll = true) {
  document.body.dataset.view = ui.view;
  if (ui.view === 'deck') renderDeck(); else if (ui.view === 'bias') renderBias(); else renderPlay();
  topHtml();
  if (scroll) window.scrollTo(0, 0);
}
function openCard(id) { ui.view = 'play'; ui.cur = id; ui.resetArm = false; render(); }

/* ---------- events ---------- */
function onClick(e) {
  const el = e.target.closest('button, [data-pick-long], [data-pick-short], [data-pick-fork]');
  if (!el || el.disabled) return;
  const c = BY[ui.cur], ds = el.dataset;
  const editable = ui.view === 'play' && c && !playOf(c.id);
  if (editable && (ds.pickLong || ds.pickShort || ds.pickFork)) {
    const d = draftFor(c.id);
    if (ds.pickLong) d.long = ds.pickLong;
    if (ds.pickShort) d.short = ds.pickShort;
    if (ds.pickFork) d.fork = el.tagName === 'BUTTON' ? ds.pickFork : (d.fork === ds.pickFork ? 'none' : ds.pickFork);   // the dial's fork line toggles
    return refreshDraft();
  }
  if (editable && (ds.inc || ds.dec)) {
    const d = draftFor(c.id), k = ds.inc || ds.dec, v = +d.w[k] || 0;
    if (ds.inc && sumW(d.w) < 10) d.w[k] = v + 1;
    if (ds.dec && v > 0) d.w[k] = v - 1;
    if (!d.w[k]) delete d.w[k];
    return refreshDraft();
  }
  const f = ds.filt;
  if (f) { const [k, v] = f.split(':'); ui.filt[k] = v; return render(false); }
  if (ds.open) return openCard(ds.open);
  switch (ds.act) {
    case 'surv-ok': S.survivorSeen = true; persist(); { const b = $('#bl-surv'); if (b) b.remove(); } return;
    case 'clear': if (editable) { draftFor(c.id).w = {}; refreshDraft(); } return;
    case 'bench': if (editable) { draftFor(c.id).w = { equity: 6, bond: 4 }; refreshDraft(); } return;
    case 'fill': if (editable) { const d = draftFor(c.id), t = sumW(d.w); if (t < 10) d.w.cash = (+d.w.cash || 0) + 10 - t; refreshDraft(); } return;
    case 'reveal': {
      if (!editable) return;
      const d = draftFor(c.id);
      if (!d.long || !d.short || sumW(d.w) !== 10) return;
      S.plays.push({ id: c.id, long: d.long, fork: d.fork || 'none', short: d.short, w: { ...d.w }, at: Date.now() });
      S.draft = null;
      persist();
      render(false);
      const r = $('#bl-reveal');
      if (r) r.scrollIntoView({ block: 'start' });
      return;
    }
    case 'next': { const id = nextId(ui.cur); if (id) openCard(id); else { ui.view = 'deck'; render(); } return; }
    case 'deck': ui.view = 'deck'; ui.resetArm = false; return render();
    case 'bias': ui.view = 'bias'; return render();
    case 'reset':
      if (!ui.resetArm) { ui.resetArm = true; return render(false); }
      S = store.wipe(); ui.resetArm = false; ui.cur = nextId(null); return render(false);
    case 'reset-no': ui.resetArm = false; return render(false);
  }
}

async function boot() {
  try {
    BLIND = (await import('../data/blind-cards.js')).BLIND;
  } catch (e) {
    main().innerHTML = `<p class="bl-err">牌组数据还没准备好（src/data/blind-cards.js）。</p>`;
    return;
  }
  CARDS = BLIND.cards || [];
  BY = Object.fromEntries(CARDS.map(c => [c.id, c]));
  DECK = deckOrder(CARDS);
  S.plays = S.plays.filter(p => BY[p.id]);            // a card dropped from the data: forget it
  initConcepts();
  document.addEventListener('click', onClick);
  document.addEventListener('keydown', e => {          // the dial nodes are <g role="button">: Enter / Space picks
    if ((e.key === 'Enter' || e.key === ' ') && e.target.closest && e.target.closest('g[role="button"]')) { e.preventDefault(); onClick(e); }
  });
  main().addEventListener('toggle', e => {            // remember the open 读数 lists across the redraws
    const k = e.target?.dataset?.sigs;
    if (k) { if (e.target.open) ui.openSigs.add(k); else ui.openSigs.delete(k); }
  }, true);
  $('#bl-deck-btn').addEventListener('click', () => { ui.view = ui.view === 'deck' ? 'play' : 'deck'; ui.resetArm = false; if (!ui.cur) ui.cur = nextId(null); render(); });
  const qc = q.get('card'), qv = q.get('view');
  ui.cur = (qc && BY[qc]) ? qc : (S.draft && BY[S.draft.id] && !playOf(S.draft.id) ? S.draft.id : nextId(null));
  if (!ui.cur) { ui.cur = DECK[0]?.id; ui.view = 'deck'; }
  if (qv === 'deck' || qv === 'bias') ui.view = qv;
  render();
  document.body.dataset.ready = '1';
}
boot();
