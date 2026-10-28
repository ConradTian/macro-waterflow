// Animated water diagram, v2 (DESIGN-v2 sections 1-4). renderFlow(svgHost, snap, prevSnap).
//
// Three kinds of parts (section 2):  PUMP (creates water, pump icon "+")  /  DRAIN (destroys water, funnel icon "-")  /  PIPE (only moves water).
// Valves (section 3) are valve icons you can tap; water LEVELS (asset pools, CPI, unemployment) are tanks / rulers that are never tappable as controls.
// Asset reservoir = 4 sub-pools (section 4) with their own inflow pipe, spring (cash flow) and special link.
// Town vs US labels (section 1) + zoomOut() transition.
//
// Reveal contract (src/ui/lessons.js): every part / pipe carries data-part (space separated part ids), pipes + chips also data-pipe.
//   svg children order is fixed: [0] back layer, [1] pipes, [2] chips (same count, same order), [3] icons / texts / valves.
// Exports: renderFlow, setFlowDuration, setFlowContext, playValveRipple, zoomOut, zoomIn, closeValvePopover, VALVE_SLOTS
//
// Snapshot fields used (all optional, graceful fallbacks when an older engine snapshot lacks them):
//   flows.{toEquity,toBond,toGold,rent,dividends,coupons,qt,govSurplusDrain,fiscalDrain}, assets.*.level, budget, iou, town, extra.qeOn.

import { CONCEPTS } from '../data/concepts.js';

const NS = 'http://www.w3.org/2000/svg';
const VB_W = 390, VB_H = 472;
// Phone (<768px): "main-trunk" mode. Same DOM, extra captions hidden by CSS (.ph-hide etc.) and the viewBox cropped below the spring sources.
const PH_VB_H = 434;
const PH_MQ = typeof matchMedia === 'function' ? matchMedia('(max-width: 767.98px)') : null;
const isPhone = () => !!(PH_MQ && PH_MQ.matches);

// engine valve table (dynamic: the diagram keeps working if the engine file is absent)
let ENGINE_VALVES = null;
import('../engine/valves.js').then(m => { ENGINE_VALVES = m.VALVES; }).catch(() => {});

function el(name, attrs, parent) {
  const n = document.createElementNS(NS, name);
  for (const k in attrs || {}) n.setAttribute(k, attrs[k]);
  if (parent) parent.appendChild(n);
  return n;
}
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const lerp = (a, b, t) => a + (b - a) * t;
const pct = (v, d = 1) => (v * 100).toFixed(d) + '%';
const hasTerm = id => !!(CONCEPTS && CONCEPTS[id]);
const esc = s => String(s ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

// rough text width (CJK = 1em, others ~0.58em)
function estW(str, fs) {
  let w = 0;
  for (const ch of str) w += ch.charCodeAt(0) > 255 ? fs : fs * 0.58;
  return w;
}

/* =====================================================================================================================
   STATIC LAYOUT
   ===================================================================================================================== */
// POOLS: 4 sub-pools. x = left edge of the tank (width 46), tank spans y 274..390.
const TANK_Y = 274, TANK_H = 116, TANK_W = 46;
const POOLS = [
  { id: 'bond',    part: 'poolBond',    x: 10,  name: '长期国债', term: 'bondAsset',   cls: 'bond',    spring: { k: 'coupons',   label: '票息', src: '政府' } },
  { id: 'equity',  part: 'poolEquity',  x: 60,  name: '股票',     term: 'equityAsset', cls: 'equity',  spring: { k: 'dividends', label: '分红', src: '商品河道' } },
  { id: 'housing', part: 'poolHousing', x: 110, name: '房产',     term: 'housePrice',  cls: 'housing', spring: { k: 'rent',      label: '租金', src: '家庭' } },
  { id: 'gold',    part: 'poolGold',    x: 160, name: '黄金',     term: 'goldAsset',   cls: 'gold',    spring: null },
];
const poolCx = p => p.x + TANK_W / 2;

// PIPES. pts follow flow direction. chip = [x, y, anchor]. kind: pump | drain | pipe | buy | capex | spring | fb.
// from / to = endpoint part ids (used to hide pipes that would dangle when a lesson hides both ends).
// minor: chip is only shown when the flow is non-zero.
const PIPES = [
  { k: 'qe',              part: 'centralBank', cls: 'fiscal',  kind: 'pump',  label: 'QE',      term: 'qe',              pts: [[18, 52], [18, 274]],                         chip: [18, 150, 'middle'], from: 'centralBank', to: 'poolBond' },
  // fiscal: pump + short trunk (the NEW water N), then two branches: orders -> firm (govPurchases), transfers / tax cuts / relief -> household (transfers)
  { k: 'fiscalInjection', part: 'government',  cls: 'fiscal',  kind: 'pump',  label: '注入', term: 'fiscalInjection', pts: [[320, 52], [320, 108]],                       chip: [320, 94, 'middle'], from: 'government', to: 'firm' },
  { k: 'govPurchases',    part: 'government',  cls: 'fiscal',  kind: 'pipe',  label: '订单', term: 'govPurchases',    pts: [[320, 108], [320, 170]],                      chip: [320, 160, 'middle'], from: 'government', to: 'firm' },
  { k: 'transfers',       part: 'government',  cls: 'fiscal',  kind: 'pipe',  label: '转移', term: 'transfers',       pts: [[320, 108], [320, 124], [254, 124], [254, 170]], chip: [290, 124, 'middle'], from: 'government', to: 'household' },
  { k: 'taxes',           part: 'government',  cls: 'cash',    kind: 'pipe',  label: '税收',                               pts: [[378, 274], [378, 52]],                       chip: [384, 138, 'end'], from: 'channel', to: 'government' },
  { k: 'newLoans',        part: 'bank',        cls: 'credit',  kind: 'pump',  label: '放贷',   term: 'newLoans',        pts: [[150, 112], [150, 170]],                      chip: [150, 124, 'middle'], from: 'bank', to: 'household' },
  { k: 'interestPaid',    part: 'interest',    cls: 'repay',   kind: 'pipe',  label: '付息',     term: 'interestPaid',    pts: [[262, 170], [262, 112]],                      chip: [268, 144, 'start'], from: 'household', to: 'bank' },
  { k: 'principalRepay',  part: 'repay',       cls: 'repay',   kind: 'drain', label: '还本',     term: 'principalRepay',  pts: [[76, 194], [56, 194]],                        chip: [40, 229, 'middle'], from: 'household', to: 'repay' },
  { k: 'toBond',          part: 'pool poolBond',    cls: 'bond',    kind: 'buy', label: '国债', term: 'assetReservoir',   pts: [[82, 218], [82, 244], [33, 244], [33, 274]], chip: [33, 262, 'middle'], from: 'household', to: 'poolBond' },
  { k: 'toEquity',        part: 'pool poolEquity',  cls: 'equity',  kind: 'buy', label: '股票', term: 'assetReservoir',   pts: [[100, 218], [100, 274]],                      chip: [101, 232, 'middle'], from: 'household', to: 'poolEquity' },
  { k: 'toHousing',       part: 'pool poolHousing', cls: 'housing', kind: 'buy', label: '房产', term: 'assetReservoir',   pts: [[142, 218], [142, 274]],                      chip: [143, 252, 'middle'], from: 'household', to: 'poolHousing' },
  { k: 'toGold',          part: 'pool poolGold',    cls: 'gold',    kind: 'buy', label: '黄金', term: 'assetReservoir',   pts: [[183, 218], [183, 274]],                      chip: [184, 232, 'middle'], from: 'household', to: 'poolGold' },
  { k: 'toCash',          part: 'cash',        cls: 'cash',    kind: 'pipe',  label: '现金',                               pts: [[221, 218], [221, 274]],                      chip: [221, 404, 'middle'], from: 'household', to: 'cash', minor: true },
  { k: 'toConsumption',   part: 'channel',     cls: 'goods',   kind: 'pipe',  label: '消费',                               pts: [[252, 218], [252, 274]],                      chip: [248, 252, 'end'], from: 'household', to: 'channel' },
  { k: 'wages',           part: 'channel',     cls: 'goods',   kind: 'pipe',  label: '工资',                               pts: [[270, 274], [270, 218]],                      chip: [274, 244, 'start'], from: 'channel', to: 'household' },
  { k: 'profits',         part: 'channel',     cls: 'goods',   kind: 'pipe',  label: '利润',                               pts: [[304, 274], [304, 218]],                      chip: [308, 228, 'start'], from: 'channel', to: 'firm' },
  { k: 'toCapex',         part: 'capex',       cls: 'capex',   kind: 'capex', label: 'Capex',    term: 'capex', slow: true, pts: [[338, 218], [338, 274]],                      chip: [338, 262, 'middle'], from: 'firm', to: 'channel' },
  { k: 'spillToGoods',    part: 'channel',     cls: 'goods',   kind: 'pipe',  label: '溢出',                               pts: [[232, 352], [244, 352]],                      chip: [238, 340, 'middle'], from: 'cash', to: 'channel', minor: true, nochip: true },
  // springs (cash flows into the pools, "pipes only move water")
  { k: 'coupons',   part: 'springs', cls: 'bond',    kind: 'spring', label: '票息', pts: [[poolCx(POOLS[0]), 424], [poolCx(POOLS[0]), 390]], chip: [poolCx(POOLS[0]), 406, 'middle'], from: 'poolBond', to: 'poolBond', soft: true },
  { k: 'dividends', part: 'springs', cls: 'equity',  kind: 'spring', label: '分红', pts: [[poolCx(POOLS[1]), 424], [poolCx(POOLS[1]), 390]], chip: [poolCx(POOLS[1]), 406, 'middle'], from: 'poolEquity', to: 'poolEquity', soft: true },
  { k: 'rent',      part: 'springs', cls: 'housing', kind: 'spring', label: '租金', pts: [[poolCx(POOLS[2]), 424], [poolCx(POOLS[2]), 390]], chip: [poolCx(POOLS[2]), 406, 'middle'], from: 'poolHousing', to: 'poolHousing', soft: true },
  // pumps' sister drains (idle most of the time)
  { k: 'qt',              part: 'centralBank', cls: 'repay', kind: 'drain', label: 'QT',  pts: [[90, 52], [90, 68]], chip: [90, 60, 'middle'], from: 'centralBank', to: 'centralBank', minor: true },
  { k: 'govSurplusDrain', part: 'government',  cls: 'repay', kind: 'drain', label: '盈余', pts: [[284, 52], [284, 68]], chip: [284, 60, 'middle'], from: 'government', to: 'government', minor: true },
  // collateral feedback: housing level -> bank approval (dashed loop, not a money flow)
  { k: 'collateral', part: 'poolHousing', cls: 'fb', kind: 'fb', label: '抵押品', term: 'lvr', pts: [[122, 274], [122, 112]], chip: [130, 134, 'end'], from: 'poolHousing', to: 'bank' },
];

// PUMP icons (on a pipe), DRAIN icons. label = small caption next to the icon.
const PUMP_ICONS = [
  { k: 'newLoans',        x: 150, y: 151, main: true },
  { k: 'qe',              x: 18,  y: 80 },
  { k: 'fiscalInjection', x: 320, y: 72 },
];
const DRAIN_ICONS = [
  { k: 'qt',              x: 90,  y: 82, label: 'QT', lx: 90, ly: 103 },
  { k: 'govSurplusDrain', x: 284, y: 82, label: '盈余', lx: 284, ly: 103 },
];

// VALVES: the 8 knobs. id matches src/engine/valves.js. (x, y) = icon centre.
const VALVE_SLOTS = [
  { id: 'policyRate',      x: 116, y: 19, label: '利率',  owner: 'centralBank' },
  { id: 'qe',              x: 138, y: 19, label: 'QE',    owner: 'centralBank' },
  { id: 'approval',        x: 232, y: 78, label: '审批',  owner: 'bank' },
  { id: 'lvrCap',          x: 258, y: 78, label: 'LVR',   owner: 'bank' },
  { id: 'borrowMult',      x: 214, y: 186, label: '借款',  owner: 'household' },
  { id: 'saveAdj',         x: 242, y: 186, label: '储蓄',  owner: 'household' },
  { id: 'capexMult',       x: 346, y: 186, label: 'Capex', owner: 'firm' },
  { id: 'fiscalInjection', x: 362, y: 19, label: '财政',  owner: 'government' },
];

// built-in causal chains (fallback when src/engine/valves.js is missing). Same shape as the engine table.
const BUILTIN_CHAINS = {
  policyRate:      { label: '央行：政策利率', when: '调高（加息）', chain: [['rates.mortgageNew', '立刻', '新房贷利率上调'], ['flows.newLoans', '1–2 季', '借款变贵，新贷款减少'], ['assets.housing.price', '2–4 季', '购房资金减少，房价水位下降'], ['rates.mortgageEff', '2–3 年', '存量房贷重定价，付息变重'], ['household.dsr', '2–3 年', 'DSR 上升']] },
  qe:              { label: '央行：QE 开关', when: '打开', chain: [['money.M', '立刻', '央行买债，创造新水'], ['assets.bond.price', '立刻', '国债价格上升'], ['assets.equity.price', '1–2 季', '股票估值上升'], ['assets.housing.price', '2–4 季', '房价水位上升']] },
  approval:        { label: '银行：审批松紧', when: '调低（收紧）', chain: [['flows.newLoans', '立刻', '新贷款减少'], ['money.M', '1–2 季', '新水变少'], ['assets.housing.price', '立刻', '房价水位下降']] },
  lvrCap:          { label: '银行：LVR 上限', when: '调低（收紧）', chain: [['flows.newLoans', '立刻', '住房贷款被卡住'], ['household.lvr', '1–2 季', 'LVR 下降'], ['assets.housing.price', '2–4 季', '房价水位下降']] },
  borrowMult:      { label: '家庭：借款意愿', when: '调高', chain: [['flows.newLoans', '立刻', '新贷款增加'], ['assets.housing.price', '2–3 年', '房价水位上升'], ['household.dsr', '2–3 年', 'DSR 上升'], ['bank.approval', '2–3 年', '银行收紧审批']] },
  saveAdj:         { label: '家庭：储蓄率', when: '调高', chain: [['household.consumption', '立刻', '消费下降'], ['macro.demandPressure', '立刻', '需求压力下降'], ['household.income', '2–3 年', '收入下降']] },
  capexMult:       { label: '企业：Capex 力度', when: '调高', chain: [['firm.capex', '立刻', 'Capex 增加'], ['macro.demandPressure', '立刻', '先是需求'], ['macro.capacityPotential', '2–3 年', '之后才是产能']] },
  fiscalInjection: { label: '政府：财政注入', when: '调高', chain: [['flows.fiscalInjection', '立刻', '赤字泵出新水'], ['macro.demandPressure', '立刻', '需求上升'], ['macro.inflation', '1–2 季', '物价上涨']] },
};

// chain term (snapshot path or pipe key) -> diagram targets. '@name' = element with data-node="name".
const PATH_TARGET = {
  'rates.mortgageNew': ['@bank'], 'rates.mortgageEff': ['interestPaid'], 'rates.gov10y': ['@poolBond'], 'rates.policy': ['@rate'],
  'assets.bond.price': ['@poolBond'], 'assets.equity.price': ['@poolEquity'], 'assets.housing.price': ['toHousing', '@poolHousing'], 'assets.gold.price': ['@poolGold'],
  'money.M': ['@budget'], 'household.dsr': ['@household'], 'household.income': ['wages', '@household'], 'household.lvr': ['@household'],
  'household.savingRate': ['@household'], 'household.consumption': ['toConsumption'],
  'macro.demandPressure': ['@channel'], 'macro.unemployment': ['@channel'], 'macro.inflation': ['@channel'], 'macro.capacityPotential': ['toCapex', '@channel'],
  'firm.capex': ['toCapex'], 'bank.approval': ['@bank', 'collateral'],
};

/* =====================================================================================================================
   LABELS (town vs US)
   ===================================================================================================================== */
function labelSet(snap, town) {
  if (!town) {
    return { bank: '银行', hh: '家庭 · 1.2 亿户', hhShort: '家庭', channel: '商品河道', housingCap: '', unit: '十亿美元', gov: '政府' };
  }
  const T = snap.town || {};
  const hs = (T.households || []).map(h => h.name.endsWith('家') ? h.name : h.name + '家');
  const hh = hs.length ? `${hs.slice(0, 2).join('·')}…${hs.length}户` : '小王家·老李家…5户';
  return { bank: T.bank?.name || '镇银行', hh, hhShort: '家庭', channel: T.shop?.name || '小卖部', housingCap: `镇上${T.houseCount || 10}套`, unit: '万元', gov: '政府' };
}
const isTownSnap = snap => !!(snap && snap.town);

/* =====================================================================================================================
   VALUE MAPPING
   ===================================================================================================================== */
function ref(snap) { return Math.max(1e-6, (snap.macro?.gdpNominal ?? 30000) * 0.0233); }   // reference flow = 700 for 2025 GDP
const pipeWidth = (f, r) => (f < r * 0.0007 ? 1 : clamp(1 + 8 * Math.sqrt(f / r), 1, 9.5));
const dashPeriod = (f, r) => (f < r * 0.0007 ? 0 : 15 / (14 + 46 * Math.sqrt(f / r)));
const lvlOf = p => 0.1 + 0.86 * clamp((Math.log(Math.max(p, 1) / 100) + 0.8) / (Math.log(10) + 0.8), 0, 1);

// flows with fallbacks for older snapshots
function flowsOf(snap, prevSnap) {
  const f = { ...(snap.flows || {}) };
  const a = snap.assets || {};
  if (f.toEquity == null && f.toBond == null && f.toGold == null) {
    const fin = f.toFinancial || 0;
    f.toEquity = fin * 0.55; f.toBond = fin * 0.3; f.toGold = fin * 0.15;
  }
  if (f.rent == null) f.rent = (a.housing?.level != null && a.housing?.rentYield != null) ? a.housing.level * a.housing.rentYield / 4 : 0;
  if (f.dividends == null) f.dividends = a.equity?.level != null ? a.equity.level * 0.02 / 4 : 0;
  if (f.coupons == null) f.coupons = (snap.gov?.interest ?? 0) / 4;
  f.qt = f.qt || 0; f.govSurplusDrain = f.govSurplusDrain ?? f.fiscalDrain ?? 0; f.collateral = 0;
  // fiscal branches. The diagram draws the NEW water N (= fiscalInjection) and where it goes. The engine fields govPurchases / transfers are the GROSS
  // outlays (orders vs transfers to households): N is split in their proportion. Fallback (older snapshots): 50/50, 60/40 toward households when unemployment rises.
  const N = f.fiscalInjection || 0;
  const gp = snap.flows?.govPurchases, tr = snap.flows?.transfers;
  let shT = 0.5;
  if (gp != null && tr != null && gp + tr > 1e-9) shT = tr / (gp + tr);
  else if (prevSnap && (snap.macro?.unemployment ?? 0) > (prevSnap.macro?.unemployment ?? 0) + 1e-6) shT = 0.6;
  f.transfers = N * shT; f.govPurchases = N * (1 - shT);
  return f;
}
function budgetOf(snap) {
  if (snap.budget && snap.budget.pumpedIn && snap.budget.drainedOut) return snap.budget;
  const f = flowsOf(snap);
  const pumpedIn = { loans: f.newLoans || 0, qe: f.qe || 0, deficit: f.fiscalInjection || 0 };
  const drainedOut = { repay: f.principalRepay || 0, surplus: f.govSurplusDrain || 0, qt: f.qt || 0 };
  const net = pumpedIn.loans + pumpedIn.qe + pumpedIn.deficit - drainedOut.repay - drainedOut.surplus - drainedOut.qt;
  return { pumpedIn, drainedOut, net };
}
const iouOf = snap => snap.iou?.bankTotal ?? ((snap.debt?.household ?? 0) + (snap.debt?.firm ?? 0));

function targets(snap, prevSnap, st) {
  const f = flowsOf(snap, prevSnap), a = snap.assets || {};
  const r = ref(snap);
  const gdp = Math.max(1e-6, snap.macro?.gdpNominal ?? 30000);
  const cap = snap.macro?.capacity ?? 100;
  if (st.cap0 == null || snap.t === 0) st.cap0 = cap;
  const t = {};
  for (const p of PIPES) t['w.' + p.k] = p.kind === 'fb' ? 3 : (p.kind === 'spring' ? Math.min(pipeWidth(f[p.k] ?? 0, r * 0.35), 6) : pipeWidth(f[p.k] ?? 0, r));
  for (const p of POOLS) t['lv.' + p.id] = lvlOf(a[p.id]?.price ?? 100);
  t.iou = clamp(iouOf(snap) / gdp / 2.4, 0.06, 0.98);
  t.cash = clamp(((a.cash?.level ?? snap.money?.M ?? 0) / gdp) / 1.4, 0.06, 0.98);
  t.chLvl = clamp(0.5 + 6 * (snap.macro?.outputGap ?? 0), 0.12, 0.95);
  t.chW = 104 + 30 * clamp(Math.log(cap / st.cap0) / Math.log(2.5), 0, 1);
  const dy = (snap.rates?.gov10y ?? 0) - (prevSnap?.rates?.gov10y ?? snap.rates?.gov10y ?? 0);
  t.tilt = clamp(dy * 4500, -18, 18);
  return t;
}

/* =====================================================================================================================
   BUILD DOM (once)
   ===================================================================================================================== */
const part = (n, p) => { if (p) n.setAttribute('data-part', p); return n; };
function node(g, x, y, w, h, cls = '', p, nodeName) {
  const r = part(el('rect', { class: 'node ' + cls, x, y, width: w, height: h, rx: 10 }, g), p);
  if (nodeName) r.setAttribute('data-node', nodeName);
  return r;
}
function txt(g, x, y, str, cls = '', anchor = 'start', p, lbl) {
  const t = el('text', { x, y, class: cls + (lbl ? ' lbl' : ''), 'text-anchor': anchor }, g);
  t.textContent = str;
  if (lbl) t.setAttribute('data-lbl', lbl);
  return part(t, p);
}
function termGroup(parent, term, hit, p, nodeName) {
  const g = part(el('g', term ? { class: 'term', 'data-term': term } : {}, parent), p);
  if (nodeName) g.setAttribute('data-node', nodeName);
  if (hit) el('rect', { class: 'hit', x: hit[0], y: hit[1], width: hit[2], height: hit[3], rx: 6 }, g);
  return g;
}

function pumpIcon(parent, d, pipe) {
  const g = el('g', { class: `pump ${pipe.cls}${d.main ? ' main' : ''}`, 'data-pipe': d.k, transform: `translate(${d.x} ${d.y})` }, parent);
  part(g, pipe.part);
  const s = d.main ? 1.15 : 1;
  const inner = el('g', { transform: `scale(${s})` }, g);
  el('circle', { class: 'body', r: 11 }, inner);
  const imp = el('g', { class: 'imp' }, inner);
  for (let i = 0; i < 3; i++) el('path', { class: 'blade', d: 'M0 0 L0 -7.5 A7.5 7.5 0 0 1 6.5 -3.75 Z', transform: `rotate(${i * 120})` }, imp);
  el('circle', { class: 'hub', r: 1.8 }, inner);
  const b = el('g', { class: 'badge', transform: 'translate(10 -10)' }, inner);
  el('circle', { r: 5.6 }, b);
  el('path', { class: 'sign', d: 'M-3 0 H3 M0 -3 V3' }, b);
  if (d.label) txt(g, d.lx - d.x, d.ly - d.y, d.label, 'cap pc', d.la);
  return g;
}
function drainIcon(parent, d, pipe) {
  const g = el('g', { class: `drain ${pipe.cls}`, 'data-pipe': d.k, transform: `translate(${d.x} ${d.y})` }, parent);
  part(g, pipe.part);
  el('path', { class: 'body', d: 'M-10 -8 L10 -8 L3.2 2.5 L3.2 9 L-3.2 9 L-3.2 2.5 Z' }, g);
  const dr = el('g', { class: 'drops' }, g);
  el('path', { d: 'M0 12 V15 M-3 14 V17 M3 14 V17' }, dr);
  const b = el('g', { class: 'badge', transform: 'translate(10 -10)' }, g);
  el('circle', { r: 5.6 }, b);
  el('path', { class: 'sign', d: 'M-3 0 H3' }, b);
  if (d.label) txt(g, d.lx - d.x, d.ly - d.y, d.label, 'cap pc', 'middle');
  return g;
}
function valveIcon(parent, v) {
  const g = el('g', { class: 'valve', 'data-valve': v.id, 'data-part': 'valves', 'data-owner': v.owner, transform: `translate(${v.x} ${v.y})`, role: 'button', tabindex: 0, 'aria-label': v.label + '阀门' }, parent);
  el('rect', { class: 'hit', x: -14, y: -15, width: 28, height: 36, rx: 8 }, g);
  el('path', { class: 'stem', d: 'M0 0 V-8 M-5.5 -8 H5.5' }, g);
  el('path', { class: 'body', d: 'M-8 -5 L0 0 L-8 5 Z M8 -5 L0 0 L8 5 Z' }, g);
  txt(g, 0, 17, v.label, 'cap vl ph-hide', 'middle');
  return g;
}

function build(host) {
  host.textContent = '';
  const wrap = document.createElement('div');
  wrap.className = 'flow-wrap';
  host.appendChild(wrap);
  const svg = el('svg', { class: 'flow-svg', viewBox: `0 0 ${VB_W} ${VB_H}`, preserveAspectRatio: 'xMidYMid meet',
    role: 'img', 'aria-label': '宏观水流示意图：泵（造水）、排水口（消水）、管道（搬水）、阀门、资产池与商品河道' }, document.createElement('div'));
  wrap.appendChild(svg);
  const R = { svg, wrap, pipes: {}, pools: {} };
  const syncPhone = () => { const ph = isPhone(); svg.setAttribute('viewBox', `0 0 ${VB_W} ${ph ? PH_VB_H : VB_H}`); wrap.classList.toggle('phone', ph); };
  syncPhone();
  try { PH_MQ && (PH_MQ.addEventListener ? PH_MQ.addEventListener('change', syncPhone) : PH_MQ.addListener(syncPhone)); } catch (e) { /* ignore */ }

  /* ---- back layer: nodes, tanks, water ---- */
  const back = el('g', {}, svg);
  node(back, 6, 4, 144, 48, '', 'centralBank', 'cb');
  node(back, 244, 4, 140, 48, '', 'government', 'gov');
  node(back, 110, 62, 162, 50, '', 'bank', 'bank');
  node(back, 76, 170, 194, 48, '', 'household', 'household');
  node(back, 276, 170, 84, 48, '', 'firm', 'firm');
  node(back, 24, 170, 32, 48, 'soft drainbox', 'repay', 'drain');
  // iou tank
  R.iouBox = node(back, 184, 118, 66, 48, 'soft', 'iou', 'iou');
  R.iouWater = part(el('rect', { class: 'water debt', x: 184, y: 166, width: 66, height: 0 }, back), 'iou');
  part(el('path', { class: 'link', d: 'M163 142 H184' }, back), 'iou');
  // pools
  for (const p of POOLS) {
    const pp = 'pool ' + p.part;
    const o = R.pools[p.id] = {};
    o.box = node(back, p.x, TANK_Y, TANK_W, TANK_H, 'tank', pp, p.part);
    o.water = part(el('rect', { class: 'water ' + p.cls, x: p.x, y: TANK_Y + TANK_H, width: TANK_W, height: 0 }, back), pp);
    const ticks = part(el('g', { class: 'ticks' }, back), pp);
    for (let i = 1; i < 4; i++) el('path', { d: `M${p.x} ${TANK_Y + TANK_H * i / 4} h5` }, ticks);
    // springs: gold has an empty slot
    if (p.spring) {
      el('circle', { class: 'src ' + p.cls, cx: poolCx(p), cy: 427, r: 3.2 }, part(el('g', { 'data-owner': p.part }, back), 'springs'));
    } else {
      const g = part(el('g', { class: 'emptyspring', 'data-owner': p.part }, back), 'springs');
      el('circle', { cx: poolCx(p), cy: 418, r: 7 }, g);
      el('path', { d: `M${poolCx(p) - 3} ${418 - 3} L${poolCx(p) + 3} ${418 + 3} M${poolCx(p) + 3} ${418 - 3} L${poolCx(p) - 3} ${418 + 3}` }, g);
    }
  }
  // cash tank
  node(back, 210, TANK_Y, 22, TANK_H, 'soft tank', 'cash', 'cash');
  R.cashWater = part(el('rect', { class: 'water cash', x: 210, y: TANK_Y + TANK_H, width: 22, height: 0 }, back), 'cash');
  // goods channel (max capacity frame + current river)
  part(el('rect', { class: 'frame', x: 244, y: TANK_Y, width: 140, height: TANK_H, rx: 10 }, back), 'channel');
  R.river = node(back, 248, TANK_Y + 4, 132, TANK_H - 8, 'soft', 'channel', 'channel');
  R.river.setAttribute('rx', 8);
  R.chWater = part(el('rect', { class: 'water goods', x: 248, y: TANK_Y + 4, width: 132, height: 0 }, back), 'channel');
  // capacity brackets (Capex widens the channel)
  R.capL = part(el('path', { class: 'capmark', d: 'M244 332 l-6 -5 v10 z' }, back), 'capex');
  R.capR = part(el('path', { class: 'capmark', d: 'M384 332 l6 -5 v10 z' }, back), 'capex');
  // bond seesaw
  R.seesaw = part(el('g', { class: 'seesaw', transform: `translate(${poolCx(POOLS[0])} 358)` }, back), 'pool poolBond');
  R.plank = el('g', { class: 'plank' }, R.seesaw);
  el('path', { d: 'M-17 0 H17' }, R.plank);
  el('circle', { class: 'endl', cx: -17, cy: 0, r: 2.6 }, R.plank);
  el('circle', { class: 'endr', cx: 17, cy: 0, r: 2.6 }, R.plank);
  el('path', { class: 'pivot', d: 'M0 1 L-4 7 H4 Z' }, R.seesaw);

  /* ---- pipes + chips ---- */
  const pipeLayer = el('g', {}, svg);
  for (const p of PIPES) {
    const g = part(el('g', { class: `${p.cls} ${p.kind}`, 'data-pipe': p.k }, pipeLayer), p.part);
    const d = 'M' + p.pts.map(q => q.join(' ')).join(' L');
    const bed = el('path', { class: 'bed', d }, g);
    const dash = el('path', { class: 'dash' + (p.slow ? ' slow' : ''), d }, g);
    const arrow = el('polygon', { class: 'arrow', points: '0,0 0,0 0,0' }, g);
    R.pipes[p.k] = { g, bed, dash, arrow, def: p };
  }
  const chipLayer = el('g', {}, svg);
  for (const p of PIPES) {
    const g = part(el('g', { class: `chip ${p.cls}${p.term ? ' term' : ''}${p.minor || p.kind === 'spring' ? ' minor' : ''}`, 'data-pipe': p.k }, chipLayer), p.part);
    if (p.term) g.setAttribute('data-term', p.term);
    const hit = el('rect', { class: 'hit', rx: 8 }, g);
    const bg = el('rect', { class: 'bg', height: 15, rx: 7.5 }, g);
    const t = el('text', { 'text-anchor': 'middle', dy: '.35em' }, g);
    Object.assign(R.pipes[p.k], { chip: g, chipBg: bg, chipHit: hit, chipText: t });
  }

  /* ---- top layer: icons, texts, valves ---- */
  const top = el('g', {}, svg);
  // pumps and drains on their pipes
  for (const d of PUMP_ICONS) R.pipes[d.k].icon = pumpIcon(top, d, R.pipes[d.k].def);
  for (const d of DRAIN_ICONS) R.pipes[d.k].icon = drainIcon(top, d, R.pipes[d.k].def);
  // main drain (principal repayment)
  {
    const g = el('g', { class: 'drain main repay', 'data-pipe': 'principalRepay', transform: 'translate(40 183)' }, top);
    part(g, 'repay');
    el('path', { class: 'body', d: 'M-10 -8 L10 -8 L3.2 2 L3.2 9 L-3.2 9 L-3.2 2 Z' }, g);
    const b = el('g', { class: 'badge', transform: 'translate(11 -9)' }, g);
    el('circle', { r: 6 }, b);
    el('path', { class: 'sign', d: 'M-3.2 0 H3.2' }, b);
    R.pipes.principalRepay.icon = g;
  }
  txt(top, 40, 205, '货币', 'sub small ph-l1', 'middle', 'repay');
  txt(top, 40, 214, '注销', 'sub small ph-l2', 'middle', 'repay');
  // central bank / government
  txt(top, 14, 24, '央行', 'ttl', 'start', 'centralBank');
  let g = termGroup(top, 'policyRate', [8, 28, 100, 22], 'centralBank', 'rate');
  R.rate = txt(g, 14, 43, '', 'sub');
  txt(top, 254, 24, '政府', 'ttl', 'start', 'government', 'gov');
  R.gov = txt(top, 254, 43, '', 'sub', 'start', 'government');
  g = termGroup(top, 'fiscalInjection', null, 'government', 'govGross');
  el('rect', { x: 286, y: 8, width: 64, height: 20, rx: 6, fill: 'transparent' }, g);   // touch target only (no tinted .hit box over the small text)
  R.govGross = txt(g, 346, 24, '', 'cap', 'end', 'government');
  // bank
  R.bankTitle = txt(top, 120, 80, '银行', 'ttl', 'start', 'bank', 'bank');
  g = termGroup(top, 'bankApproval', [114, 84, 90, 24], 'bank', 'approval');
  R.bank = txt(g, 120, 102, '', 'sub');
  // iou tank texts
  g = termGroup(top, 'M', null, 'iou');
  txt(g, 189, 131, '欠条箱', 'ttl small', 'start', 'iou');
  R.iouVal = txt(top, 246, 131, '', 'sub num', 'end', 'iou');
  txt(top, 189, 145, '水是凭空来的，', 'cap ph-hide', 'start', 'iou');
  txt(top, 189, 157, '但不是白来的', 'cap ph-hide', 'start', 'iou');
  // household / firm  (cover rect: the collateral loop passes BEHIND the household box)
  node(top, 76, 170, 194, 48, 'cover', 'household');
  R.hhTitle = txt(top, 84, 187, '', 'ttl hh', 'start', 'household', 'hh');
  R.hh = txt(top, 84, 205, '', 'sub', 'start', 'household');
  txt(top, 284, 187, '企业', 'ttl', 'start', 'firm');
  R.firm = txt(top, 284, 205, '', 'sub', 'start', 'firm');
  // pools: name + level
  for (const p of POOLS) {
    const o = R.pools[p.id], cx = poolCx(p);
    const gg = termGroup(top, p.term, [p.x, TANK_Y, TANK_W, 42], 'pool ' + p.part);
    txt(gg, cx, TANK_Y + 15, p.name, 'ttl pname', 'middle');
    o.val = txt(gg, cx, TANK_Y + 29, '', 'sub num', 'middle');
    o.cap = txt(top, cx, TANK_Y + 42, '', 'cap', 'middle', 'pool ' + p.part, 'housingCap');
    if (p.id !== 'housing') o.cap.removeAttribute('data-lbl');
  }
  // seesaw captions
  txt(top, poolCx(POOLS[0]), 372, '利率↑', 'cap', 'middle', 'pool poolBond');
  txt(top, poolCx(POOLS[0]), 382, '价格↓', 'cap', 'middle', 'pool poolBond');
  // spring captions
  for (const p of POOLS) {
    const cx = poolCx(p);
    txt(top, cx, 438, p.spring ? '←' + p.spring.src : '无泉水', 'cap ph-hide', 'middle', 'springs').setAttribute('data-owner', p.part);
  }
  // cash
  g = termGroup(top, 'cashAsset', [208, TANK_Y, 26, 40], 'cash');
  txt(g, 221, TANK_Y + 15, '现', 'ttl pname', 'middle');
  txt(g, 221, TANK_Y + 28, '金', 'ttl pname', 'middle');
  // channel
  g = termGroup(top, 'goodsChannel', [250, TANK_Y + 4, 100, 22], 'channel', 'chtitle');
  R.chTitle = txt(g, 254, TANK_Y + 19, '商品河道', 'ttl', 'start', null, 'channel');
  g = termGroup(top, 'cpi', [250, TANK_Y + 24, 100, 16], 'channel', 'cpi');
  R.cpi = txt(g, 254, TANK_Y + 36, '', 'sub');
  g = termGroup(top, 'unemployment', [250, TANK_Y + 42, 100, 16], 'channel', 'unemp');
  R.unemp = txt(g, 254, TANK_Y + 54, '', 'sub');
  R.px = txt(top, 254, 363, '', 'sub', 'start', 'channel');
  g = termGroup(top, 'capacity', [250, 368, 110, 18], 'capex');
  R.cap = txt(g, 254, 381, '', 'sub');
  // level ruler marks next to the channel title: "水位" pill
  const pill = part(el('g', { class: 'lvlpill' }, top), 'channel');
  el('rect', { x: 334, y: TANK_Y + 26, width: 26, height: 12, rx: 6 }, pill);
  txt(pill, 347, TANK_Y + 35, '水位', 'cap', 'middle');
  // spring chips etc are in chip layer; pool caption + legend + unit
  g = termGroup(top, 'assetReservoir', [6, 443, 378, 14], 'pool');
  g.classList.add('ph-hide');
  txt(g, 10, 451, '资产池：买资产 = 买取水权，只抬水位', 'cap', 'start');
  txt(top, 166, 451, '· 只有 Capex 才扩河道', 'cap ph-hide', 'start', 'capex');
  buildLegend(top);
  // valves last (on top)
  const valves = el('g', { class: 'valves' }, top);
  for (const v of VALVE_SLOTS) valveIcon(valves, v);

    // budget bar (HTML)
  const bar = document.createElement('div');
  bar.className = 'flow-budget'; bar.setAttribute('data-part', 'budget'); bar.setAttribute('data-node', 'budget');
  wrap.appendChild(bar);
  R.bar = bar;
  // ripple strip + popover + zoom banner (HTML overlays)
  const strip = document.createElement('div'); strip.className = 'flow-ripple'; strip.hidden = true; host.appendChild(strip); R.strip = strip;
  const pop = document.createElement('div'); pop.className = 'flow-pop'; pop.hidden = true; host.appendChild(pop); R.pop = pop;
  const lg = document.createElement('div'); lg.className = 'flow-legend'; lg.hidden = true; lg.innerHTML = legendHtml(); host.appendChild(lg); R.legend = lg;
  const zb = document.createElement('div'); zb.className = 'flow-zoomtag'; zb.hidden = true; host.appendChild(zb); R.zoomTag = zb;
  return R;
}

// phone: the legend row is hidden in the SVG; the 图例 button opens this sheet instead
function legendHtml() {
  const svg = inner => `<svg width="26" height="22" viewBox="-13 -11 26 22" aria-hidden="true">${inner}</svg>`;
  const rows = [
    [svg(`<circle r="8.5" style="fill:var(--surface);stroke:var(--c-fiscal);stroke-width:2.2"/><path d="M-4 0H4M0 -4V4" style="fill:none;stroke:var(--c-fiscal);stroke-width:2;stroke-linecap:round"/>`), '泵 = 造水', '放贷、QE、财政赤字'],
    [svg(`<path d="M-8 -6 L8 -6 L2.5 1.5 L2.5 8 L-2.5 8 L-2.5 1.5 Z" style="fill:var(--surface);stroke:var(--c-repay);stroke-width:2;stroke-linejoin:round"/>`), '排水口 = 消水', '还本、QT、财政盈余'],
    [svg(`<path d="M-10 0 H10" style="fill:none;stroke:var(--muted);stroke-width:3.5;stroke-linecap:round;stroke-dasharray:5 3"/>`), '管道 = 搬水', '管越宽，本季流量越大'],
    [svg(`<path d="M-8 -5 L0 0 L-8 5 Z M8 -5 L0 0 L8 5 Z" style="fill:var(--surface-2);stroke:var(--accent);stroke-width:1.8;stroke-linejoin:round"/><path d="M0 0 V-8 M-5 -8 H5" style="fill:none;stroke:var(--accent);stroke-width:2;stroke-linecap:round"/>`), '阀门 = 可拧', '点阀门图标：看是谁的阀门、怎么传导'],
    [svg(`<path d="M-3 -8 v16 M-3 -5 h4 M-3 -1 h4 M-3 3 h4" style="fill:none;stroke:var(--muted);stroke-width:1.4"/>`), '水位 = 结果', '房价、物价、失业…不能直接拧'],
  ];
  return `<div class="fl-head"><b>图例</b><button type="button" class="fl-x" data-act="legend" aria-label="关闭">✕</button></div>` +
    rows.map(([ic, t, d]) => `<div class="fl-row">${ic}<span><b>${t}</b><small>${d}</small></span></div>`).join('') +
    `<div class="fl-note">带下划线的词可以点开看解释；点底部「本季水量」看泵入 / 排出明细。</div>`;
}

function buildLegend(top) {
  const g = part(el('g', { class: 'legend' }, top), 'budget');
  const y = 466;
  // pump
  const p = el('g', { class: 'pump fiscal mini', transform: `translate(14 ${y - 3})` }, g);
  el('circle', { class: 'body', r: 6 }, p);
  el('path', { class: 'sign', d: 'M-3 0 H3 M0 -3 V3' }, p);
  txt(g, 24, y, '泵 = 造水', 'cap', 'start');
  const d = el('g', { class: 'drain repay mini', transform: `translate(88 ${y - 3})` }, g);
  el('path', { class: 'body', d: 'M-6 -4 L6 -4 L1.8 1.5 L1.8 5 L-1.8 5 L-1.8 1.5 Z' }, d);
  txt(g, 98, y, '排水口 = 消水', 'cap', 'start');
  el('path', { class: 'pipeline', d: `M174 ${y - 3} H192` }, g);
  txt(g, 196, y, '管道 = 搬水', 'cap', 'start');
  const v = el('g', { class: 'valve mini', transform: `translate(272 ${y - 3}) scale(.7)` }, g);
  el('path', { class: 'body', d: 'M-8 -5 L0 0 L-8 5 Z M8 -5 L0 0 L8 5 Z' }, v);
  el('path', { class: 'stem', d: 'M0 0 V-7 M-5 -7 H5' }, v);
  txt(g, 282, y, '阀门 = 可拧', 'cap', 'start');
  el('path', { class: 'ruler', d: `M338 ${y - 8} v10 M338 ${y - 6} h3 M338 ${y - 3} h3 M338 ${y} h3` }, g);
  txt(g, 345, y, '水位 = 结果', 'cap', 'start');
}

/* =====================================================================================================================
   APPLY (every animation frame)
   ===================================================================================================================== */
function applyCur(R, cur) {
  for (const p of PIPES) {
    const r = R.pipes[p.k];
    const w = cur['w.' + p.k];
    r.bed.setAttribute('stroke-width', w.toFixed(2));
    r.dash.setAttribute('stroke-width', Math.max(1, w * 0.62).toFixed(2));
    const [x1, y1] = p.pts[p.pts.length - 2], [x2, y2] = p.pts[p.pts.length - 1];
    const dx = Math.sign(x2 - x1), dy = Math.sign(y2 - y1);
    const L = 5 + w * 0.7, H = 3 + w * 0.65;
    const bx = x2 - dx * L, by = y2 - dy * L;
    const px = -dy * H, py = dx * H;
    r.arrow.setAttribute('points', `${x2},${y2} ${bx + px},${by + py} ${bx - px},${by - py}`);
  }
  for (const p of POOLS) {
    const h = TANK_H * cur['lv.' + p.id];
    const w = R.pools[p.id].water;
    w.setAttribute('y', (TANK_Y + TANK_H - h).toFixed(1)); w.setAttribute('height', h.toFixed(1));
  }
  const ih = 48 * cur.iou;
  R.iouWater.setAttribute('y', (166 - ih).toFixed(1)); R.iouWater.setAttribute('height', ih.toFixed(1));
  const ch = TANK_H * cur.cash;
  R.cashWater.setAttribute('y', (TANK_Y + TANK_H - ch).toFixed(1)); R.cashWater.setAttribute('height', ch.toFixed(1));
  const rw = cur.chW, rx = 314 - rw / 2;
  R.river.setAttribute('x', rx.toFixed(1)); R.river.setAttribute('width', rw.toFixed(1));
  const wh = (TANK_H - 8) * cur.chLvl;
  R.chWater.setAttribute('x', rx.toFixed(1)); R.chWater.setAttribute('width', rw.toFixed(1));
  R.chWater.setAttribute('y', (TANK_Y + TANK_H - 4 - wh).toFixed(1)); R.chWater.setAttribute('height', wh.toFixed(1));
  R.capL.setAttribute('transform', `translate(${(rx - 244 - 4).toFixed(1)} 0)`);
  R.capR.setAttribute('transform', `translate(${(rx + rw - 384 + 4).toFixed(1)} 0)`);
  R.plank.setAttribute('transform', `rotate(${(-cur.tilt).toFixed(1)})`);
}

/* =====================================================================================================================
   TEXTS (set immediately each quarter)
   ===================================================================================================================== */
function fmtMoney(v, town) {
  if (v == null || !isFinite(v)) return '0';
  const a = Math.abs(v);
  if (town) return a < 10 ? v.toFixed(1) : String(Math.round(v));
  return a >= 1000 ? (v / 1000).toFixed(1) + 'k' : String(Math.round(v));
}
const fmtSigned = (v, town) => (v > 0 ? '+' : v < 0 ? '−' : '') + fmtMoney(Math.abs(v), town);

function placeChip(r, str) {
  const [x, y, anchor] = r.def.chip;
  const w = Math.ceil(estW(str, isPhone() ? 10.8 : 10)) + 10;
  const x0 = anchor === 'start' ? x : anchor === 'end' ? x - w : x - w / 2;
  r.chipBg.setAttribute('x', x0); r.chipBg.setAttribute('y', y - 7.5); r.chipBg.setAttribute('width', w);
  r.chipHit.setAttribute('x', x0 - 4); r.chipHit.setAttribute('y', y - 13); r.chipHit.setAttribute('width', w + 8);
  r.chipHit.setAttribute('height', 26);
  r.chipText.setAttribute('x', x0 + w / 2); r.chipText.setAttribute('y', y);
  r.chipText.textContent = str;
}

function termBtn(id, label) {
  return hasTerm(id) ? `<button type="button" class="term" data-term="${id}">${label}</button>` : `<span>${label}</span>`;
}

function setBudget(R, snap, town) {
  const b = budgetOf(snap);
  const pi = b.pumpedIn, dr = b.drainedOut;
  const num = v => `<b>${fmtMoney(v, town)}</b>`;
  const cls = b.net > 1e-9 ? 'up' : b.net < -1e-9 ? 'down' : 'flat';
  const arrow = cls === 'up' ? '▲' : cls === 'down' ? '▼' : '＝';
  const drainTail = (dr.surplus > 0.0005 * ref(snap) ? ` + ${termBtn('', '盈余')} ${num(dr.surplus)}` : '') + (dr.qt > 0.0005 * ref(snap) ? ` + QT ${num(dr.qt)}` : '');
  const open = R.bar.classList.contains('open');
  R.bar.className = 'flow-budget net-' + cls + (open ? ' open' : '');
  const pTot = pi.loans + pi.qe + pi.deficit, dTot = dr.repay + dr.surplus + dr.qt;
  // phone: one compact line (tap = expand the breakdown); >=768px: .fb-mini is hidden and .fb-detail is the normal two rows
  R.bar.innerHTML =
    `<div class="fb-mini" role="button" tabindex="0" data-act="fb-toggle" aria-expanded="${open}"><span class="fb-mlab">本季水量</span><span class="fb-net ${cls}">${arrow} ${fmtSigned(b.net, town)}</span>` +
    `<span class="fb-meq">= 泵入 ${num(pTot)} − 排出 ${num(dTot)}</span><span class="fb-caret" aria-hidden="true">▴</span><button type="button" class="fb-legbtn" data-act="legend">图例</button></div>` +
    `<div class="fb-detail"><div class="fb-row"><span class="fb-lab">${termBtn('M', '本季总水量变化')}</span><span class="fb-net ${cls}">${arrow} ${fmtSigned(b.net, town)}</span><span class="fb-unit lbl">单位：${town ? '万元' : '十亿美元'} · 管宽 = 本季流量</span></div>` +
    `<div class="fb-row fb-eq"><span class="fb-grp pump"><span class="fb-k">泵入</span> ${termBtn('newLoans', '放贷')} ${num(pi.loans)} + ${termBtn('qe', 'QE')} ${num(pi.qe)} + ${termBtn('fiscalInjection', '赤字')} ${num(pi.deficit)}</span>` +
    `<span class="fb-minus">−</span><span class="fb-grp drain"><span class="fb-k">排出</span> ${termBtn('principalRepay', '还本')} ${num(dr.repay)}${drainTail}</span></div></div>`;
}

function setTexts(R, snap, prevSnap, st) {
  const f = flowsOf(snap, prevSnap), a = snap.assets || {}, m = snap.macro || {};
  const town = isTownSnap(snap) && !st.zoomed;
  st.town = town;
  const r = ref(snap);
  const LB = labelSet(snap, town);
  st.labels = LB;
  for (const p of PIPES) {
    const v = f[p.k] ?? 0;
    const pr = R.pipes[p.k];
    const minorHide = !!p.nochip || ((p.minor || p.kind === 'spring') && v < r * 0.0007 && p.kind !== 'spring');
    placeChip(pr, p.kind === 'fb' ? p.label : `${p.label} ${fmtMoney(v, town)}`);
    pr.chip.classList.toggle('off', minorHide);
    const idle = p.kind === 'fb' ? false : v < r * 0.0007;
    pr.g.classList.toggle('idle', idle);
    if (pr.icon) pr.icon.classList.toggle('idle', idle);
    if (!idle) {
      pr.dash.style.animationDuration = (p.kind === 'fb' ? 1.4 : dashPeriod(v, r)).toFixed(2) + 's';
      if (pr.icon) pr.icon.style.setProperty('--spin', (2.4 - 1.9 * clamp(Math.sqrt(v / r), 0, 1)).toFixed(2) + 's');
    }
  }
  // main drain icon follows principalRepay (icon registered above)
  R.rate.textContent = `政策利率 ${pct(snap.rates?.policy ?? 0, 2)}`;
  R.gov.textContent = `债务/GDP ${pct(snap.gov?.debtGdp ?? 0, 0)}`;
  { const gq = snap.gov?.spendingGross != null ? snap.gov.spendingGross * 0.25 : (f.taxes ?? 0) + (snap.gov?.deficit ?? 0) * 0.25;   // quarterly gross outlays = taxes + deficit
    R.govGross.textContent = `总支出 ${town ? fmtMoney(gq, town) : Math.round(gq)}`; }
  R.bank.textContent = `审批 ×${(snap.bank?.approval ?? 1).toFixed(2)}`;
  R.hh.textContent = `DSR ${pct(snap.household?.dsr ?? 0)}`;
  R.firm.textContent = `利润 ${fmtMoney(snap.firm?.profit ?? 0, town)}`;
  for (const p of POOLS) {
    const px = a[p.id]?.price ?? 0;
    R.pools[p.id].val.textContent = String(Math.round(px));
  }
  R.iouVal.textContent = fmtMoney(iouOf(snap), town);
  R.cpi.textContent = `CPI ${pct(m.inflation ?? 0)}`;
  R.unemp.textContent = `失业 ${pct(m.unemployment ?? 0)}`;
  R.px.textContent = `物价 ${Math.round(m.priceLevel ?? 0)}`;
  R.cap.textContent = `产能 ${Math.round(100 * (m.capacity ?? 100) / st.cap0)}`;
  R.pools.housing.cap.textContent = LB.housingCap;
  // names that change with scale (fade handled by CSS class on svg)
  R.bankTitle.textContent = LB.bank;
  R.hhTitle.textContent = LB.hh;
  R.hhTitle.classList.toggle('long', town);
  R.chTitle.textContent = LB.channel;
  R.svg.classList.toggle('is-town', town);
  R.bar.dataset.unit = LB.unit;
  setBudget(R, snap, town);
}

/* =====================================================================================================================
   REVEAL: hide pipes that would dangle (both endpoint parts hidden)
   ===================================================================================================================== */
const GROUP_OF = { poolBond: ['pool'], poolEquity: ['pool'], poolHousing: ['pool'], poolGold: ['pool'] };
function visSet() {
  const b = document.body;
  if (!b.classList.contains('parts-on')) return null;
  return new Set((b.dataset.vis || '').split(/\s+/).filter(Boolean));
}
function partShown(vs, id) {
  if (!vs) return true;
  return vs.has(id) || (GROUP_OF[id] || []).some(g => vs.has(g));
}
export function syncDangling(host) {
  const st = host && host._flow; if (!st) return;
  const vs = visSet();
  for (const p of PIPES) {
    const dangling = !!vs && !(partShown(vs, p.from) || partShown(vs, p.to));
    const r = st.R.pipes[p.k];
    r.g.classList.toggle('dangling', dangling);
    r.chip.classList.toggle('dangling', dangling);
    if (r.icon) r.icon.classList.toggle('dangling', dangling);
  }
  // valves / spring decorations belong to an owner part: hidden until that part is shown (even if 'valves' / 'springs' is)
  st.R.svg.querySelectorAll('[data-owner]').forEach(n => n.classList.toggle('dangling', !!vs && !partShown(vs, n.getAttribute('data-owner'))));
}

/* =====================================================================================================================
   VALVES: popover + ripple
   ===================================================================================================================== */
let CTX = {};   // { sim: () => sim, setTab(id), openTerm(id) }  -- set by app.js (optional)
export function setFlowContext(c) { CTX = c || {}; }
/** The sim that is on screen right now (US or the town; concept cards need it for "2 years ago" lookups). */
export function currentSim() { try { return (CTX.sim && CTX.sim()) || null; } catch (e) { return null; } }

function valveInfo(id) {
  const ev = ENGINE_VALVES && ENGINE_VALVES.find(v => v.id === id);
  const bi = BUILTIN_CHAINS[id];
  if (ev) return { id, label: ev.label, when: ev.chainWhen || '', chain: ev.chain.map(c => ({ term: c.term, delay: c.delayLabel, delayTown: c.delayLabelTown || c.delayLabel, text: c.text })), eng: ev };
  if (bi) return { id, label: bi.label, when: bi.when, chain: bi.chain.map(([term, delay, text]) => ({ term, delay, delayTown: delay, text })) };
  return null;
}
function valveValue(id, snap, town) {
  try {
    const sim = CTX.sim && CTX.sim();
    const vv = sim && sim.valves && sim.valves.find(v => v.id === id);
    if (vv && vv.value != null) return fmtValve(vv, vv.value) + (vv.userSet ? '（你已调整）' : '');
  } catch (e) { /* ignore */ }
  switch (id) {
    case 'policyRate': return pct(snap.rates?.policy ?? 0, 2);
    case 'qe': return snap.extra?.qeOn ? '开' : '关';
    case 'approval': return '×' + (snap.bank?.approval ?? 1).toFixed(2);
    case 'lvrCap': return 'LVR ' + pct(snap.household?.lvr ?? 0, 0);
    case 'borrowMult': return '新贷款 ' + fmtMoney(snap.flows?.newLoans ?? 0, town);
    case 'saveAdj': return '储蓄率 ' + pct(snap.household?.savingRate ?? 0);
    case 'capexMult': return 'Capex ' + fmtMoney(snap.flows?.toCapex ?? 0, town);
    case 'fiscalInjection': return '注入 ' + fmtMoney(snap.flows?.fiscalInjection ?? 0, town);
    default: return '—';
  }
}
function fmtValve(v, x) {
  switch (v.unit) {
    case 'pct': return (x * 100).toFixed(v.step && v.step < 0.01 ? 2 : 1) + '%';
    case 'pp': return (x >= 0 ? '+' : '') + (x * 100).toFixed(1) + 'pp';
    case 'x': return '×' + (+x).toFixed(2);
    case 'onoff': return x ? '开' : '关';
    default: return String(x);
  }
}

export function closeValvePopover() {
  const host = document.getElementById('diagram');
  const st = host && host._flow; if (!st) return;
  st.R.pop.hidden = true;
  st.R.svg.querySelectorAll('.valve.sel').forEach(n => n.classList.remove('sel'));
}
function openValvePopover(host, id) {
  const st = host._flow; if (!st) return;
  const info = valveInfo(id); if (!info) return;
  const snap = st.snap, town = st.town;
  const R = st.R;
  const slot = VALVE_SLOTS.find(v => v.id === id);
  R.svg.querySelectorAll('.valve.sel').forEach(n => n.classList.remove('sel'));
  const vEl = R.svg.querySelector(`.valve[data-valve="${id}"]`); if (vEl) vEl.classList.add('sel');
  const rows = info.chain.map(c => `<li><i class="dl">${esc(town ? c.delayTown : c.delay)}</i><span>${esc(c.text)}</span></li>`).join('');
  R.pop.innerHTML =
    `<button type="button" class="fp-x" data-act="close" aria-label="关闭">✕</button>` +
    `<div class="fp-kind">阀门 · 可以拧</div><h4>${esc(info.label)}</h4>` +
    `<div class="fp-val">现在 <b>${esc(valveValue(id, snap, town))}</b></div>` +
    `<div class="fp-when">拧动方向：${esc(info.when || '')}　水位（房价、物价、失业…）是结果，不是阀门。</div>` +
    `<ol class="fp-chain">${rows}</ol>` +
    `<div class="fp-btns"><button type="button" class="btn primary" data-act="ripple">看传导</button>` +
    (CTX.setTab ? `<button type="button" class="btn" data-act="takeover">去接管页拧它</button>` : '') + `</div>`;
  R.pop.hidden = false;
  R.pop.dataset.valve = id;
  // anchor near the valve, clamped to the host
  const hr = host.getBoundingClientRect();
  const vr = (vEl || R.svg).getBoundingClientRect();
  const pw = Math.min(300, hr.width - 16);
  R.pop.style.width = pw + 'px';
  let left = vr.left + vr.width / 2 - hr.left - pw / 2;
  left = clamp(left, 8, Math.max(8, hr.width - pw - 8));
  R.pop.style.left = left + 'px';
  const below = (vr.top - hr.top) < hr.height * 0.45;
  R.pop.style.top = below ? Math.min(vr.bottom - hr.top + 6, Math.max(8, hr.height - R.pop.offsetHeight - 8)) + 'px' : 'auto';
  R.pop.style.bottom = below ? 'auto' : (hr.bottom - vr.top + 6) + 'px';
  void slot;
}

let rippleTimers = [], rippleLit = [];
function clearRipple(R) {
  rippleTimers.forEach(clearTimeout); rippleTimers = [];
  rippleLit.forEach(n => n.classList.remove('rp-on', 'rp-now'));
  rippleLit = [];
  if (R) { R.svg.querySelectorAll('.rp-tag').forEach(n => n.remove()); R.strip.hidden = true; R.strip.classList.remove('on'); }
}
function resolveTargets(R, token) {
  const out = [];
  const one = tk => {
    if (tk.startsWith('@')) { R.wrap.parentElement.querySelectorAll(`[data-node="${tk.slice(1)}"]`).forEach(n => out.push(n)); return; }
    const ps = R.svg.querySelectorAll(`[data-pipe="${tk}"]`);
    if (ps.length) { ps.forEach(n => out.push(n)); return; }
    const ts = R.svg.querySelectorAll(`[data-term="${tk}"]`);
    ts.forEach(n => out.push(n));
  };
  if (PATH_TARGET[token]) PATH_TARGET[token].forEach(one);
  else if (token.startsWith('flows.')) one(token.slice(6));
  else one(token);
  return out;
}
// Light the valve's causal chain in order, with the delay labels. Returns a Promise (resolved when the last step is lit).
export function playValveRipple(valveId, opts = {}) {
  const host = document.getElementById('diagram');
  const st = host && host._flow;
  if (!st) return Promise.resolve();
  const info = valveInfo(valveId); if (!info) return Promise.resolve();
  const R = st.R, town = st.town;
  clearRipple(R);
  if (R.pop && !opts.keepPopover) closeValvePopover();
  const step = opts.stepMs ?? 1150;
  const first = R.svg.querySelector(`.valve[data-valve="${valveId}"]`);
  const items = info.chain.map(c => ({ ...c, delay: town ? c.delayTown : c.delay, nodes: resolveTargets(R, c.term) }));
  // ripple strip (HTML)
  const dots = n => items.map((_, k) => `<i class="${k < n ? 'on' : ''}"></i>`).join('');
  const paint = n => {                          // n = number of steps lit so far (the current one is n-1)
    const c = items[Math.max(0, n - 1)];
    R.strip.innerHTML = `<div class="rp-top"><span class="rp-head">${esc(info.label)}${info.when ? ' · ' + esc(info.when) : ''}</span><span class="rp-dots">${dots(n)}</span></div>` +
      (n ? `<div class="rp-cur"><i class="dl">${esc(c.delay)}</i><span>${esc(c.text)}</span></div>` : `<div class="rp-cur"><span class="rp-wait">拧动阀门 → 水按这个顺序往下传…</span></div>`);
  };
  paint(0);
  R.strip.style.bottom = ((R.bar && R.bar.offsetHeight) || 0) + 4 + 'px';
  R.strip.hidden = false;
  requestAnimationFrame(() => R.strip.classList.add('on'));
  if (first) { first.classList.add('rp-on', 'rp-now'); rippleLit.push(first); }
  return new Promise(resolve => {
    items.forEach((c, i) => {
      rippleTimers.push(setTimeout(() => {
        rippleLit.forEach(n => n.classList.remove('rp-now'));
        c.nodes.forEach(n => { n.classList.add('rp-on', 'rp-now'); rippleLit.push(n); });
        // delay tag on the first SVG target
        const svgNode = c.nodes.find(n => n.ownerSVGElement);
        if (svgNode) {
          try {
            const bb = svgNode.getBBox();
            const tr = svgNode.getCTM(), sr = R.svg.getCTM();
            void tr; void sr;
            const tg = el('g', { class: 'rp-tag' }, R.svg);
            const w = Math.ceil(estW(c.delay, 9.5)) + 10;
            let cx = bb.x + bb.width / 2, cy = bb.y;
            const tf = svgNode.getAttribute('transform');
            if (tf) { const mm = /translate\(([-\d.]+)[ ,]([-\d.]+)\)/.exec(tf); if (mm) { cx += +mm[1]; cy += +mm[2]; } }
            cx = clamp(cx, w / 2 + 2, VB_W - w / 2 - 2); cy = clamp(cy - 4, 10, VB_H - 10);
            el('rect', { x: cx - w / 2, y: cy - 8, width: w, height: 14, rx: 7 }, tg);
            const tx = el('text', { x: cx, y: cy + 2, 'text-anchor': 'middle' }, tg); tx.textContent = c.delay;
          } catch (e) { /* ignore */ }
        }
        paint(i + 1);
        if (i === items.length - 1) resolve();
      }, (i + 1) * step));
    });
    if (!opts.hold) rippleTimers.push(setTimeout(() => clearRipple(R), (items.length + 1) * step + 3500));
    if (!items.length) resolve();
  });
}

function wireEvents(host, R) {
  const closeBudget = () => { R.bar.classList.remove('open'); const m = R.bar.querySelector('.fb-mini'); if (m) m.setAttribute('aria-expanded', 'false'); };
  const toggleLegend = () => {
    const show = R.legend.hidden;
    if (show) { closeBudget(); closeValvePopover(); R.legend.style.bottom = ((R.bar && R.bar.offsetHeight) || 0) + 6 + 'px'; }
    R.legend.hidden = !show;
  };
  host.addEventListener('click', e => {
    const lgb = e.target.closest && e.target.closest('[data-act="legend"]');
    if (lgb) { e.preventDefault(); toggleLegend(); return; }
    const fbm = e.target.closest && e.target.closest('.fb-mini');
    if (fbm) {
      const on = !R.bar.classList.contains('open');
      R.legend.hidden = true; closeValvePopover();
      R.bar.classList.toggle('open', on); fbm.setAttribute('aria-expanded', String(on));
      return;
    }
    if (!R.legend.hidden && !(e.target.closest && e.target.closest('.flow-legend'))) R.legend.hidden = true;
    if (R.bar.classList.contains('open') && !(e.target.closest && e.target.closest('.flow-budget'))) closeBudget();
    const v = e.target.closest && e.target.closest('.valve[data-valve]');
    if (v && !v.classList.contains('mini')) {
      e.preventDefault();
      if (R.pop.dataset.valve === v.dataset.valve && !R.pop.hidden) closeValvePopover(); else openValvePopover(host, v.dataset.valve);
      return;
    }
    const b = e.target.closest && e.target.closest('.flow-pop [data-act]');
    if (b) {
      const act = b.dataset.act, id = R.pop.dataset.valve;
      if (act === 'close') closeValvePopover();
      else if (act === 'ripple') playValveRipple(id);
      else if (act === 'takeover') { closeValvePopover(); CTX.setTab && CTX.setTab('takeover'); }
      return;
    }
    if (!R.pop.hidden && !(e.target.closest && e.target.closest('.flow-pop'))) closeValvePopover();
  });
  host.addEventListener('keydown', e => {
    if ((e.key === 'Enter' || e.key === ' ') && e.target.matches && e.target.matches('.valve[data-valve]')) { e.preventDefault(); e.target.dispatchEvent(new MouseEvent('click', { bubbles: true })); }
    if (e.key === 'Escape') { closeValvePopover(); R.legend.hidden = true; closeBudget(); }
    if ((e.key === 'Enter' || e.key === ' ') && e.target.matches && e.target.matches('.fb-mini')) { e.preventDefault(); e.target.click(); }
  });
}

/* =====================================================================================================================
   TOWN -> US ZOOM
   ===================================================================================================================== */
// Names cross-fade (镇银行 -> 银行, 小王家… -> 1.2 亿户), the unit label morphs 万元 -> 十亿美元, layout unchanged.
// Call it BEFORE switching the sim to the US scenario; resolves when the animation is done. The US labels stay until a town snapshot returns.
export function zoomOut(opts = {}) {
  const host = document.getElementById('diagram');
  const st = host && host._flow;
  if (!st) return Promise.resolve();
  const R = st.R, ms = opts.ms ?? 1500;
  closeValvePopover();
  R.zoomTag.innerHTML = '<b>放大看 → 缩小看</b><span>小镇 → 美国　·　万元 → 十亿美元</span>';
  R.zoomTag.hidden = false;
  R.svg.classList.add('zoom-out'); R.wrap.classList.add('zoom-out');
  return new Promise(resolve => {
    setTimeout(() => {                       // names are invisible now: swap them
      st.zoomed = true;
      if (st.snap) setTexts(R, st.snap, st.prev, st);
      R.svg.classList.remove('zoom-out'); R.wrap.classList.remove('zoom-out');
      R.svg.classList.add('zoom-in');
    }, ms * 0.45);
    setTimeout(() => { R.svg.classList.remove('zoom-in'); R.zoomTag.hidden = true; resolve(); }, ms);
  });
}
export function zoomIn() {
  const host = document.getElementById('diagram');
  const st = host && host._flow; if (!st) return;
  st.zoomed = false;
  if (st.snap) setTexts(st.R, st.snap, st.prev, st);
}

/* =====================================================================================================================
   PUBLIC
   ===================================================================================================================== */
export function renderFlow(host, snap, prevSnap) {
  if (!snap) return;
  let st = host._flow;
  if (!st) {
    const R = build(host);
    st = host._flow = { R, cur: null, from: null, tgt: null, t0: 0, raf: 0, zoomed: false, snap: null, prev: null };
    wireEvents(host, R);
    // lesson highlight (.ls-hl on a chip) also lights the pump / drain icon of that pipe
    try {
      new MutationObserver(() => {
        for (const p of PIPES) { const r = R.pipes[p.k]; if (r.icon) r.icon.classList.toggle('ls-hl-pipe', r.chip.classList.contains('ls-hl')); }
        // the two fiscal branches share the trunk's lesson highlight (lessons highlight 'fiscalInjection' only)
        const on = R.pipes.fiscalInjection.chip.classList.contains('ls-hl');
        for (const k of ['govPurchases', 'transfers']) { const r = R.pipes[k]; r.chip.classList.toggle('ls-hl', on); r.g.classList.toggle('ls-hl-pipe', on); }
      })
        .observe(R.svg.children[2], { subtree: true, attributes: true, attributeFilter: ['class'] });
    } catch (e) { /* ignore */ }
    // screenshot helpers: ?valve=policyRate opens its popover, ?ripple=policyRate plays the ripple, ?zoom=1 plays zoomOut
    try {
      const q = new URLSearchParams(location.search);
      if (q.get('valve')) setTimeout(() => openValvePopover(host, q.get('valve')), 500);
      if (q.get('ripple')) setTimeout(() => playValveRipple(q.get('ripple'), { stepMs: +(q.get('rstep') || 300), hold: q.get('rhold') === '1' }), 500);
      if (q.get('zoom')) setTimeout(() => zoomOut({ ms: 3000 }), 500);
    } catch (e) { /* ignore */ }
    st.cur = targets(prevSnap || snap, prevSnap, st);
    // keep the dangling-pipe rule in sync with lesson reveals even when no render happens
    try { new MutationObserver(() => syncDangling(host)).observe(document.body, { attributes: true, attributeFilter: ['data-vis', 'class'] }); } catch (e) { /* ignore */ }
  }
  if (!isTownSnap(snap)) st.zoomed = false;
  st.snap = snap; st.prev = prevSnap || null;
  const tgt = targets(snap, prevSnap, st);
  setTexts(st.R, snap, prevSnap, st);
  syncDangling(host);

  const reduce = window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches;
  const dur = reduce ? 0 : (host._flowDur ?? 700);
  cancelAnimationFrame(st.raf);
  st.from = { ...st.cur };
  st.tgt = tgt;
  st.t0 = performance.now();
  const keys = Object.keys(tgt);
  const tick = now => {
    const k = dur ? clamp((now - st.t0) / dur, 0, 1) : 1;
    const e = k < 0.5 ? 2 * k * k : 1 - Math.pow(-2 * k + 2, 2) / 2;
    const cur = {};
    for (const key of keys) cur[key] = lerp(st.from[key] ?? tgt[key], tgt[key], e);
    st.cur = cur;
    applyCur(st.R, cur);
    if (k < 1) st.raf = requestAnimationFrame(tick);
  };
  tick(st.t0);
}

// optional: caller can set tween length (ms) to match playback speed
export function setFlowDuration(host, ms) { host._flowDur = ms; }
export { VALVE_SLOTS };
