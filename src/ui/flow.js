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
// 国境线 block (snap.border, null-safe): a horizontal dashed border under the springs, 出口 / 进口 pipes on the goods channel, an FX gate on the line,
//   a foreign-bond pipe into the 长期国债 pool. Desktop: viewBox grows to VB_HB while snap.border exists; phone: one compact gate pill + a tap popover.
//   FX reactor (src/ui/fx-reactor.js, non-US): under the gate, 资本管 + 商品价格管 push, a needle shows the actual change 比一年前, the gap =
//   「说不清的部分」, a faint PPP anchor line. Tap a pipe = the five forces (desktop: .fxr-pop; phone: inside the 净出口 gate popover).
//   USA: the gate shows the broad dollar index (src/data/usd-index.js). Both read the REAL data at snap.date (countryData / US_Q).
//   The border pipes are normal PIPES entries (part 'border', cls 'border', bd:true) at the END of PIPES, so pipe count == chip count always holds.
//   ?mockBorder=1 (or =usa) injects fake snap.border values for screenshots before the engine writes them.
//
// Snapshot fields used (all optional, graceful fallbacks when an older engine snapshot lacks them):
//   flows.{toEquity,toBond,toGold,rent,dividends,coupons,qt,govSurplusDrain,fiscalDrain}, assets.*.level, budget, iou, town, extra.qeOn.
//
// A+B package (tools/AB-CONTRACT.md, 2026-10-29):
//   B1 goods channel = width x depth: river width = capacity, water depth = demand / capacity (1 + macro.demandPressure) against a fixed bank line;
//      a 断面 inset (cross-section) shows width, depth and freeboard (超高 = 闲置（失业）, 漫顶 = 溢出（通胀）).
//   A2 four outlets under the channel (家庭消费 / 企业投资 / 政府购买 / 净出口) = PIPES entries 'outC' 'outI' 'outG' 'outNX' (before the border pipes).
//      They read household.consumption, firm.capex (annual, /4), the engine's gross flows.govPurchases and border.netExports. The engine builds GDP
//      from aggregate demand, not as C+I+G+NX: the four sum to ~84% of GDP (US) / ~90% (AUS); the tap popover states the gap.
//   B2 one big 收入循环 loop arrow (household -> channel -> firm -> household) behind the income pipes.
//   B3 欠条 tank beside the 现金 (= all water) tank, both on ONE scale (% of GDP), labelled 欠条 x% / 水 y% (占 GDP).
//   B4 every chip shows % of GDP, annualised (quarterly flow x 4 / GDP; the town keeps 万元). Tap a chip: popover with the amounts.
//   B5 pipe colours: pump = blue +, drain = red -, every other pipe grey (classes pc-pump / pc-drain / pc-pipe, tokens in app.css).
//   B6 asset pools: 历史正常区间 band (middle half, p25-p75, of the history-mode run 1995-2021 of the same country); above = 贵, below = 便宜.
//   A3 实际利率 (rates.realPolicy) next to 政策利率, tappable (realRate card).
//
// Progressive diagram (tools/COURSE-V3.md, table src/data/layers.js): build() ends with tagLayers(), which gives every part a data-layer;
//   app.js writes body.layers-on + body[data-layers]; CSS (app.css) hides the layers not listed. The border band only switches on (svg.has-border,
//   taller viewBox) while L-border is shown; syncDangling reads the layer set too. Visibility only: nothing here changes a drawing.

import { CONCEPTS } from '../data/concepts.js';
import { countryInfo, currentCountry, countryData, fmtBn } from './country-info.js';
import { createSim } from '../engine/sim.js';
import { US_Q } from '../data/us-quarterly.js';
import { LAYERS, LAYER_IDS, LAYER_OF } from '../data/layers.js';
import { layerShown } from './progress.js';
import { computeFxReactor, reactorSvg, reactorHtml, usdIndexAt, usdHtml, reactorLine, wireFxReactor, ensureFxReactorCss, installFxCardHook, openForcesIn } from './fx-reactor.js';

const NS = 'http://www.w3.org/2000/svg';
const VB_W = 390, VB_H = 472;
// Phone (<768px): "main-trunk" mode. Same DOM, extra captions hidden by CSS (.ph-hide etc.) and the viewBox cropped below the spring sources.
const PH_VB_H = 434;
// 国境线 block: dashed line at BD_LINE, foreign zone down to BD_BOT; the legend row moves down by BD_LEG while the border is on; VB_HB = taller viewBox then
const BD_LINE = 461, BD_BOT = 497, BD_LEG = 41, VB_HB = 512;
// FX reactor inside the band (viewBox units): track x0..x1 (zero = cx, under the gate), pipe rows, needle top..bot, the 说不清 bracket at gapY,
// pipe names right-aligned at lab, the readings column from tx (right of it the 出口 / 进口 chips start at ~318)
const FXR = { x0: 150, x1: 246, cx: 198, lab: 146, tx: 252, top: BD_LINE + 4, rows: [BD_LINE + 8, BD_LINE + 16.5], bot: BD_LINE + 21, gapY: BD_LINE + 25, fs: 7.4, range: 25, compact: true };
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
// 欠条 + 现金 tanks side by side (B3), then the goods channel frame. CH_CX = centre of the river (its width = capacity).
const IOU_X = 209, CASH_X = 229, PAIR_W = 18;
const CH_X0 = 254, CH_W = 130, CH_CX = 319;
// channel: bank line (河岸) in the plan view; water depth r = 1 at the bank. Interior bottom = TANK_Y + TANK_H - 4.
const CH_BOT = TANK_Y + TANK_H - 4, BANK_Y = 316;
// 断面 inset (cross-section) inside the channel, right side
const SEC = { x: 312, y: 297, w: 70, h: 91, cx: 347, top: 318, bed: 338 };

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
  { k: 'toCash',          part: 'cash',        cls: 'cash',    kind: 'pipe',  label: '现金',                               pts: [[238, 218], [238, 274]],                      chip: [238, 234, 'middle'], from: 'household', to: 'cash', minor: true },
  // only the household's EXTRA spending paid with new water (credit + part of the deficit), not consumption C (that is the outlet 'outC')
  { k: 'toConsumption',   part: 'channel',     cls: 'goods',   kind: 'pipe',  label: '新水消费',                           pts: [[260, 218], [260, 274]],                      chip: [256, 252, 'end'], from: 'household', to: 'channel' },
  { k: 'wages',           part: 'channel',     cls: 'goods',   kind: 'pipe',  label: '工资',                               pts: [[268, 274], [268, 218]],                      chip: [272, 238, 'start'], from: 'channel', to: 'household' },
  { k: 'profits',         part: 'channel',     cls: 'goods',   kind: 'pipe',  label: '利润',                               pts: [[304, 274], [304, 218]],                      chip: [308, 226, 'start'], from: 'channel', to: 'firm' },
  { k: 'toCapex',         part: 'capex',       cls: 'capex',   kind: 'capex', label: 'Capex',    term: 'capex', slow: true, pts: [[338, 218], [338, 274]],                      chip: [338, 260, 'middle'], from: 'firm', to: 'channel' },
  { k: 'spillToGoods',    part: 'channel',     cls: 'goods',   kind: 'pipe',  label: '溢出',                               pts: [[247, 352], [257, 352]],                      chip: [251, 340, 'middle'], from: 'cash', to: 'channel', minor: true, nochip: true, maxW: 4 },
  // A2: the 4 outlets at the end of the goods channel = GDP by use (goods are used up; the water goes round the 收入循环). Chip = % of GDP only, the name is
  // drawn under it. out: width by share of GDP; signed: a negative value (net imports) reverses the arrow.
  { k: 'outC',            part: 'channel',            cls: 'goods',  kind: 'out', label: '家庭消费', short: '消费',                     pts: [[268, 390], [268, 397]], chip: [268, 404, 'middle'], from: 'channel', to: 'channel' },
  { k: 'outI',            part: 'channel capex',      cls: 'capex',  kind: 'out', label: '企业投资', short: '投资', term: 'capex',        pts: [[297, 390], [297, 397]], chip: [297, 404, 'middle'], from: 'channel', to: 'capex' },
  { k: 'outG',            part: 'channel government', cls: 'fiscal', kind: 'out', label: '政府购买', short: '政府', term: 'govPurchases', pts: [[326, 390], [326, 397]], chip: [326, 404, 'middle'], from: 'channel', to: 'government' },
  { k: 'outNX',           part: 'channel',            cls: 'goods',  kind: 'out', label: '净出口',   short: '净出口',                   pts: [[356, 390], [356, 397]], chip: [356, 404, 'middle'], from: 'channel', to: 'border', signed: true },
  // springs (cash flows into the pools, "pipes only move water")
  { k: 'coupons',   part: 'springs', cls: 'bond',    kind: 'spring', label: '票息', pts: [[poolCx(POOLS[0]), 424], [poolCx(POOLS[0]), 390]], chip: [poolCx(POOLS[0]), 406, 'middle'], from: 'poolBond', to: 'poolBond', soft: true },
  { k: 'dividends', part: 'springs', cls: 'equity',  kind: 'spring', label: '分红', pts: [[poolCx(POOLS[1]), 424], [poolCx(POOLS[1]), 390]], chip: [poolCx(POOLS[1]), 406, 'middle'], from: 'poolEquity', to: 'poolEquity', soft: true },
  { k: 'rent',      part: 'springs', cls: 'housing', kind: 'spring', label: '租金', pts: [[poolCx(POOLS[2]), 424], [poolCx(POOLS[2]), 390]], chip: [poolCx(POOLS[2]), 406, 'middle'], from: 'poolHousing', to: 'poolHousing', soft: true },
  // pumps' sister drains (idle most of the time)
  { k: 'qt',              part: 'centralBank', cls: 'repay', kind: 'drain', label: 'QT',  pts: [[90, 52], [90, 68]], chip: [90, 60, 'middle'], from: 'centralBank', to: 'centralBank', minor: true },
  { k: 'govSurplusDrain', part: 'government',  cls: 'repay', kind: 'drain', label: '盈余', pts: [[284, 52], [284, 68]], chip: [284, 60, 'middle'], from: 'government', to: 'government', minor: true },
  // collateral feedback: housing level -> bank approval (dashed loop, not a money flow)
  { k: 'collateral', part: 'poolHousing', cls: 'fb', kind: 'fb', label: '抵押品', term: 'lvr', pts: [[122, 274], [122, 112]], chip: [130, 134, 'end'], from: 'poolHousing', to: 'bank' },
  // 国境线 (only drawn while snap.border exists; keep these LAST: lessons.js pairs pipes and chips by index)
  { k: 'exports',      part: 'border', cls: 'border', kind: 'pipe', label: '出口',        term: 'exports',      pts: [[381, BD_BOT], [381, 390]], chip: [376, 470, 'end'],   from: 'border', to: 'channel',  bd: true },
  { k: 'imports',      part: 'border', cls: 'border', kind: 'pipe', label: '进口',        term: 'imports',      pts: [[371, 390], [371, BD_BOT]], chip: [366, 488, 'end'],   from: 'channel', to: 'border',  bd: true },
  { k: 'foreignBonds', part: 'border', cls: 'border', kind: 'pipe', label: '外国人买国债', term: 'foreignBonds', pts: [[16, BD_BOT], [16, 390]],   chip: [24, 486, 'start'],  from: 'border', to: 'poolBond', bd: true, maxW: 5 },
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
  'household.savingRate': ['@household'], 'household.consumption': ['outC', 'toConsumption'],
  'macro.demandPressure': ['@channel', '@section'], 'macro.unemployment': ['@channel'], 'macro.inflation': ['@channel'], 'macro.capacityPotential': ['toCapex', '@channel'],
  'firm.capex': ['toCapex', 'outI'], 'bank.approval': ['@bank', 'collateral'], 'rates.realPolicy': ['@realRate'],
};
// B5: one colour per KIND of pipe (pump / drain / ordinary). The collateral feedback (fb) is not a money flow and keeps its own dashed look.
const pcOf = kind => (kind === 'pump' ? 'pc-pump' : kind === 'drain' ? 'pc-drain' : kind === 'fb' ? '' : 'pc-pipe');

/* =====================================================================================================================
   LABELS (town vs US)
   ===================================================================================================================== */
function labelSet(snap, town) {
  if (!town) {
    const ci = curInfo();      // US: 家庭 · 1.2 亿户 / 十亿美元 (the old texts); another country: its own household count and currency unit
    return { bank: '银行', hh: '家庭 · ' + ci.households, hhShort: '家庭', channel: '商品河道', housingCap: '', unit: ci.unitBn, gov: '政府' };
  }
  const T = snap.town || {};
  const hs = (T.households || []).map(h => h.name.endsWith('家') ? h.name : h.name + '家');
  const hh = hs.length ? `${hs.slice(0, 2).join('·')}…${hs.length}户` : '小王家·老李家…5户';
  return { bank: T.bank?.name || '镇银行', hh, hhShort: '家庭', channel: T.shop?.name || '小卖部', housingCap: `镇上${T.houseCount || 10}套`, unit: '万元', gov: '政府' };
}
const isTownSnap = snap => !!(snap && snap.town);
// the country on screen (country-info.js): the sim's (the town counts as USA). Read at render time, so a lesson swapping sims is followed.
const curInfo = () => countryInfo(currentCountry(currentSim()));

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
  const B = snap.border;      // 国境线: same units as the other flows (local currency bn per quarter)
  f.exports = B?.exports ?? 0; f.imports = B?.imports ?? 0; f.foreignBonds = B?.foreignBondBuy ?? 0;
  Object.assign(f, outletsOf(snap));
  return f;
}
// A2 outlets, per quarter: I is annual in the snapshot; G = the engine's GROSS purchases (snap.flows.govPurchases, not the new-water split above).
// The engine builds GDP from total demand, not as C+I+G+NX, and its household.consumption leaves out credit- and wealth-funded spending
// (the four came to ~84% of GDP). So C is the residual GDP − I − G − NX: the four outlets add up to GDP by construction (US C ≈ 71–79%, real ≈ 68%).
function outletsOf(snap) {
  const outI = (snap.firm?.capex ?? 0) / 4, outG = snap.flows?.govPurchases ?? 0, outNX = snap.border?.netExports ?? 0;
  return { outC: Math.max(0, gdpOf(snap) / 4 - outI - outG - outNX), outI, outG, outNX };
}
// share of GDP of a quarterly flow, annualised (x 4 / GDP: the same base as the gauges)
const gdpOf = snap => Math.max(1e-6, snap.macro?.gdpNominal ?? 30000);
const shareOf = (v, snap) => (v * 4) / gdpOf(snap);
// chip text: '2.4%' / '12%' (>= 10% without decimals); outlets always whole percents. '−' sign only when it does not round to 0.
function pctTxt(x, whole) {
  const a = Math.abs(x) * 100;
  if (a < 0.05) return '0%';
  const s = whole || a >= 9.95 ? String(Math.round(a)) : a.toFixed(1);
  return (x < 0 && +s > 0 ? '−' : '') + s + '%';
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

// 0..1 fill level of every tank whose level is drawn (4 asset pools, 欠条箱, cash). ONE mapping: the water and the 洪痕 marks both use it.
function levelsOf(snap) {
  const a = snap.assets || {};
  const gdp = Math.max(1e-6, snap.macro?.gdpNominal ?? 30000);
  const L = {};
  for (const p of POOLS) L[p.id] = lvlOf(a[p.id]?.price ?? 100);
  // B3: 欠条 and 现金 (= all the water, M) share ONE scale, so the two tanks compare directly (USA: full at 2.4 x GDP)
  const tk = curInfo().tank, S = Math.max(tk.iou, tk.cash);
  L.iou = clamp(iouOf(snap) / gdp / S, 0.03, 0.98);
  L.cash = clamp(((a.cash?.level ?? snap.money?.M ?? 0) / gdp) / S, 0.03, 0.98);
  return L;
}

// B1: demand / capacity (1 = water at the bank). Older snapshots: 1 + outputGap (never above 1).
const depthOf = snap => 1 + (snap.macro?.demandPressure ?? snap.macro?.outputGap ?? 0);
// drawn depth relative to the bank height, vertical exaggeration x6 (demand / capacity moves only a few %): 0.97 -> 0.82, 1.05 -> 1.30
const depthDraw = D => clamp(1 + 6 * (D - 1), 0.12, 1.32);

function targets(snap, prevSnap, st) {
  const f = flowsOf(snap, prevSnap), a = snap.assets || {};
  const r = ref(snap);
  const gdp = gdpOf(snap);
  const cap = snap.macro?.capacity ?? 100;
  if (st.cap0 == null || snap.t === 0) st.cap0 = cap;
  const t = {};
  for (const p of PIPES) t['w.' + p.k] = p.bd ? Math.min(pipeWidth(Math.abs(f[p.k] ?? 0), r * 1.5), p.maxW || 7) : p.kind === 'fb' ? 3 : p.kind === 'out' ? clamp(1.2 + 9 * Math.sqrt(Math.abs(f[p.k] ?? 0) / (gdp / 4)), 1, 9.5)
    : (p.kind === 'spring' ? Math.min(pipeWidth(f[p.k] ?? 0, r * 0.35), 6) : Math.min(pipeWidth(f[p.k] ?? 0, r), p.maxW || 9.5));
  const L = levelsOf(snap);
  for (const p of POOLS) t['lv.' + p.id] = L[p.id];
  t.iou = L.iou;
  t.cash = L.cash;
  t.chR = depthDraw(depthOf(snap));
  t.chW = 100 + 26 * clamp(Math.log(cap / st.cap0) / Math.log(2.5), 0, 1);
  const dy = (snap.rates?.gov10y ?? 0) - (prevSnap?.rates?.gov10y ?? snap.rates?.gov10y ?? 0);
  t.tilt = clamp(dy * 4500, -18, 18);
  // B6 历史正常区间 per pool (tank level units); absent = no band (town, no data yet, a measure the snapshot lacks)
  const BV = isTownSnap(snap) ? null : poolBands(snap, st);
  st.bandState = BV;
  if (BV) for (const id in BV) { t['bl.' + id] = BV[id].lo; t['bh.' + id] = BV[id].hi; }
  return t;
}

/* =====================================================================================================================
   B6 历史正常区间: per pool, the middle half (p25..p75) of a valuation measure over 1995-2021 of the history-mode run of the SAME country
   (the model's own range, so the band and the water come from one engine). The band is drawn in price terms on the tank:
   price at which the measure would sit at the band edge, given today's fundamentals.
     housing  房价/收入 (assets.housing.priceToIncome)      band price = price x edge / P/I now
     equity   市盈率 P/E (assets.equity.pe)                    band price = price x edge / P/E now
     bond     实际 10 年利率 = gov10y - inflationExp            band price = price x exp(-8 x (edge - real now))   (duration 8, as the engine)
                                                              high real yield = cheap, so the HIGH yield edge is the LOW price edge
     gold     实际金价 = gold price / price level              band price = price x edge / real gold now
   ===================================================================================================================== */
const BAND_Y0 = 1995, BAND_Y1 = 2021;
const MEASURE = {
  housing: s => s.assets?.housing?.priceToIncome,
  equity: s => s.assets?.equity?.pe,
  bond: s => (s.rates?.gov10y != null && s.macro?.inflationExp != null ? s.rates.gov10y - s.macro.inflationExp : undefined),
  gold: s => (s.assets?.gold?.price != null && s.macro?.priceLevel > 0 ? s.assets.gold.price / (s.macro.priceLevel / 100) : undefined),
};
const BANDS = new Map();      // iso -> { housing: [lo, hi], ... } | 'pending' | null
function bandRanges(iso) {
  const b = BANDS.get(iso);
  if (b !== undefined) return b === 'pending' ? null : b;
  const data = iso === 'USA' ? US_Q : countryData(iso);
  if (!data) return null;      // the country's data is not registered yet: try again next render
  BANDS.set(iso, 'pending');
  // one full history run (~124 quarters) off the critical path, then redraw the quarter on screen
  setTimeout(() => {
    let out = null;
    try {
      const sim = createSim({ data, mode: 'history', country: iso });
      let guard = 0;
      while (!sim.done && guard++ < 400) sim.step();
      const hist = sim.history('model').filter(s => { const y = +String(s.date).slice(0, 4); return y >= BAND_Y0 && y <= BAND_Y1; });
      out = {};
      for (const id in MEASURE) {
        const v = hist.map(MEASURE[id]).filter(x => typeof x === 'number' && isFinite(x)).sort((x, y) => x - y);
        if (v.length >= 20) out[id] = [v[Math.floor(0.25 * (v.length - 1))], v[Math.ceil(0.75 * (v.length - 1))]];
      }
    } catch (e) { out = null; }
    BANDS.set(iso, out);
    const host = document.getElementById('diagram'), st = host && host._flow;
    if (st && st.snap) renderFlow(host, st.snap, st.prev);
  }, 250);
  return null;
}
// -> { id: { lo, hi (tank levels), state: 'hi' | 'lo' | 'ok' } } or null
function poolBands(snap, st) {
  const rg = bandRanges(curInfo().iso);
  if (!rg) return null;
  const a = snap.assets || {}, out = {};
  for (const p of POOLS) {
    const e = rg[p.id], m = MEASURE[p.id](snap), px = a[p.id]?.price;
    if (!e || !(typeof m === 'number' && isFinite(m)) || !(px > 0)) continue;
    let pLo, pHi, state;
    if (p.id === 'bond') {
      pLo = px * Math.exp(-8 * (e[1] - m)); pHi = px * Math.exp(-8 * (e[0] - m));
      state = m < e[0] ? 'hi' : m > e[1] ? 'lo' : 'ok';
    } else {
      if (!(m > 0)) continue;
      pLo = px * e[0] / m; pHi = px * e[1] / m;
      state = m > e[1] ? 'hi' : m < e[0] ? 'lo' : 'ok';
    }
    out[p.id] = { lo: lvlOf(pLo), hi: lvlOf(pHi), state };
  }
  return out;
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
  const g = el('g', { class: `pump ${pipe.cls} pc-pump${d.main ? ' main' : ''}`, 'data-pipe': d.k, transform: `translate(${d.x} ${d.y})` }, parent);
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
  const g = el('g', { class: `drain ${pipe.cls} pc-drain`, 'data-pipe': d.k, transform: `translate(${d.x} ${d.y})` }, parent);
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
  const syncPhone = () => { const ph = isPhone(); svg.setAttribute('viewBox', `0 0 ${VB_W} ${ph ? PH_VB_H : (R.hasBorder ? VB_HB : VB_H)}`); wrap.classList.toggle('phone', ph); syncNxGate(R); };
  R.syncVB = syncPhone;
  syncPhone();
  try { PH_MQ && (PH_MQ.addEventListener ? PH_MQ.addEventListener('change', syncPhone) : PH_MQ.addListener(syncPhone)); } catch (e) { /* ignore */ }

  /* ---- back layer: nodes, tanks, water ---- */
  const back = el('g', {}, svg);
  {   // 国境线: the foreign zone (shaded) and the dashed border under the springs
    const bg = part(el('g', { class: 'bd bd-d bd-bg' }, back), 'border');
    el('rect', { class: 'bd-zone', x: 0, y: BD_LINE, width: VB_W, height: BD_BOT - BD_LINE }, bg);
    el('path', { class: 'bd-line', d: `M0 ${BD_LINE} H${VB_W}` }, bg);
  }
  node(back, 6, 4, 144, 48, '', 'centralBank', 'cb');
  node(back, 244, 4, 140, 48, '', 'government', 'gov');
  node(back, 110, 62, 162, 50, '', 'bank', 'bank');
  node(back, 76, 170, 194, 48, '', 'household', 'household');
  node(back, 276, 170, 84, 48, '', 'firm', 'firm');
  node(back, 24, 170, 32, 48, 'soft drainbox', 'repay', 'drain');
  // B2: one big 收入循环 loop (household -> spend -> channel -> firm -> wages, profits -> household), behind the income pipes
  {
    const lg = part(el('g', { class: 'loop' }, back), 'household firm channel');
    el('path', { class: 'loop-ring', d: 'M262 240 V254 Q262 270 278 270 H334 Q350 270 350 254 V238 Q350 224 336 224 H276 Q262 224 262 240 Z' }, lg);
    for (const [x, y, rot] of [[262, 250, 90], [306, 270, 0], [350, 244, -90], [306, 224, 180]]) el('path', { class: 'loop-arr', d: 'M-5 -6.5 L6 0 L-5 6.5 Z', transform: `translate(${x} ${y}) rotate(${rot})` }, lg);
  }
  // B3: the 欠条 tank stands next to the 现金 tank (pool row), same height and the same % of GDP scale. The dashed link: loans -> IOUs.
  part(el('path', { class: 'link', d: `M163 157 H${IOU_X + PAIR_W / 2} V${TANK_Y}` }, back), 'iou');
  R.iouBox = node(back, IOU_X, TANK_Y, PAIR_W, TANK_H, 'soft tank iou', 'iou', 'iou');
  R.iouWater = part(el('rect', { class: 'water debt', x: IOU_X, y: TANK_Y + TANK_H, width: PAIR_W, height: 0 }, back), 'iou');
  // pools
  for (const p of POOLS) {
    const pp = 'pool ' + p.part;
    const o = R.pools[p.id] = {};
    o.box = node(back, p.x, TANK_Y, TANK_W, TANK_H, 'tank', pp, p.part);
    o.water = part(el('rect', { class: 'water ' + p.cls, x: p.x, y: TANK_Y + TANK_H, width: TANK_W, height: 0 }, back), pp);
    // B6 历史正常区间 band (hidden until the history run is ready / when the country lacks the measure)
    o.band = part(el('g', { class: 'vband', display: 'none', 'data-lk': 'band' }, back), pp);
    o.bandR = el('rect', { class: 'vb-fill', x: p.x, width: TANK_W, y: TANK_Y, height: 0 }, o.band);
    o.bandP = el('path', { class: 'vb-edge', d: '' }, o.band);
    o.bandB = el('rect', { class: 'vb-bar', x: p.x + 1.5, width: 3.5, y: TANK_Y, height: 0, rx: 1.5 }, o.band);     // staff-gauge style 'normal range' bar
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
  // cash tank (= all the water, M)
  node(back, CASH_X, TANK_Y, PAIR_W, TANK_H, 'soft tank', 'cash', 'cash');
  R.cashWater = part(el('rect', { class: 'water cash', x: CASH_X, y: TANK_Y + TANK_H, width: PAIR_W, height: 0 }, back), 'cash');
  {   // shared scale ticks: 50% / 100% / 150% / 200% of GDP across both tanks
    const S = Math.max(curInfo().tank.iou, curInfo().tank.cash);
    const ti = part(el('g', { class: 'ticks pair' }, back), 'iou'), tc = part(el('g', { class: 'ticks pair' }, back), 'cash');   // one group per tank (layers)
    for (const k of [0.5, 1, 1.5, 2]) if (k < S) {
      const y = (TANK_Y + TANK_H - TANK_H * k / S).toFixed(1);
      el('path', { class: k === 1 ? 'one' : '', d: `M${IOU_X + PAIR_W - 4} ${y} h4` }, ti);
      el('path', { class: k === 1 ? 'one' : '', d: `M${CASH_X} ${y} h4` }, tc);
    }
  }
  // goods channel (max capacity frame + current river). B1: river width = capacity, water depth = demand / capacity against the bank line.
  part(el('rect', { class: 'frame', x: CH_X0, y: TANK_Y, width: CH_W, height: TANK_H, rx: 10 }, back), 'channel');
  R.river = node(back, CH_X0 + 2, TANK_Y + 4, CH_W - 4, TANK_H - 8, 'soft', 'channel', 'channel');
  R.river.setAttribute('rx', 8);
  R.chWater = part(el('rect', { class: 'water goods', x: CH_X0 + 2, y: TANK_Y + 4, width: CH_W - 4, height: 0 }, back), 'channel');
  R.chOver = part(el('rect', { class: 'ch-over', x: CH_X0 + 2, y: BANK_Y, width: CH_W - 4, height: 0 }, back), 'channel');      // water above the bank = 溢出（通胀）
  R.bankLn = part(el('path', { class: 'ch-bank', d: '' }, back), 'channel');
  R.chOver.setAttribute('data-lk', 'bankLine'); R.bankLn.setAttribute('data-lk', 'bankLine');      // layers: the bank line = depth (L-channel)
  // capacity brackets (Capex widens the channel)
  R.capL = part(el('path', { class: 'capmark', d: `M${CH_X0} 332 l-5 -4 v8 z` }, back), 'capex');
  R.capR = part(el('path', { class: 'capmark', d: `M${CH_X0 + CH_W} 332 l5 -4 v8 z` }, back), 'capex');
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
    const g = part(el('g', { class: `${p.cls} ${p.kind} ${pcOf(p.kind)}${p.bd ? ' bd bd-d' : ''}`, 'data-pipe': p.k }, pipeLayer), p.part);
    const d = 'M' + p.pts.map(q => q.join(' ')).join(' L');
    const bed = el('path', { class: 'bed', d }, g);
    const dash = el('path', { class: 'dash' + (p.slow ? ' slow' : ''), d }, g);
    const arrow = el('polygon', { class: 'arrow', points: '0,0 0,0 0,0' }, g);
    R.pipes[p.k] = { g, bed, dash, arrow, def: p };
  }
  const chipLayer = el('g', {}, svg);
  for (const p of PIPES) {
    const g = part(el('g', { class: `chip ${p.cls} ${pcOf(p.kind)}${p.term ? ' term' : ''}${p.minor || p.kind === 'spring' ? ' minor' : ''}${p.kind === 'out' ? ' outc' : ''}${p.bd ? ' bd bd-d' : ''}`, 'data-pipe': p.k }, chipLayer), p.part);
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
    const g = el('g', { class: 'drain main repay pc-drain', 'data-pipe': 'principalRepay', transform: 'translate(40 183)' }, top);
    part(g, 'repay');
    el('path', { class: 'body', d: 'M-10 -8 L10 -8 L3.2 2 L3.2 9 L-3.2 9 L-3.2 2 Z' }, g);
    const b = el('g', { class: 'badge', transform: 'translate(11 -9)' }, g);
    el('circle', { r: 6 }, b);
    el('path', { class: 'sign', d: 'M-3.2 0 H3.2' }, b);
    R.pipes.principalRepay.icon = g;
  }
  txt(top, 40, 205, '货币', 'sub small ph-l1', 'middle', 'repay');
  txt(top, 40, 214, '注销', 'sub small ph-l2', 'middle', 'repay');
  buildMarks(R, top);   // 洪痕 (behind the texts, inside the top layer)
  // central bank / government
  txt(top, 14, 24, '央行', 'ttl', 'start', 'centralBank');
  let g = termGroup(top, 'policyRate', [8, 34, 78, 17], 'centralBank', 'rate');
  R.rate = txt(g, 14, 46, '', 'sub');
  // A3: 实际利率 = 政策利率 − 通胀 (rates.realPolicy), the real master valve (Capex, bond, gold, ⑦/⑧ rules)
  g = termGroup(top, 'realRate', [86, 34, 62, 17], 'centralBank', 'realRate');
  R.realRate = txt(g, 90, 46, '', 'sub');
  txt(top, 254, 24, '政府', 'ttl', 'start', 'government', 'gov');
  g = termGroup(top, 'govDebtGdp', null, 'government');
  el('rect', { x: 250, y: 32, width: 100, height: 15, rx: 5, fill: 'transparent' }, g);   // touch target only
  R.gov = txt(g, 254, 43, '', 'sub', 'start', 'government');
  g = termGroup(top, 'fiscalInjection', null, 'government', 'govGross');
  el('rect', { x: 286, y: 8, width: 64, height: 20, rx: 6, fill: 'transparent' }, g);   // touch target only (no tinted .hit box over the small text)
  R.govGross = txt(g, 346, 24, '', 'cap', 'end', 'government');
  // bank
  R.bankTitle = txt(top, 120, 80, '银行', 'ttl', 'start', 'bank', 'bank');
  R.bankTitle.setAttribute('data-lk', 'bankTitle');
  g = termGroup(top, 'bankApproval', [114, 84, 90, 24], 'bank', 'approval');
  R.bank = txt(g, 120, 102, '', 'sub');
  // 欠条 tank texts (B3). The two captions label the dashed link: a loan creates water AND an IOU.
  txt(top, 168, 141.5, '放贷：水是凭空来的，', 'cap ph-hide', 'start', 'iou');
  txt(top, 168, 150.5, '但不是白来的 → 欠条', 'cap ph-hide', 'start', 'iou');
  g = termGroup(top, 'pvtDebtGdp', [IOU_X - 1, TANK_Y, PAIR_W + 2, 40], 'iou');
  txt(g, IOU_X + PAIR_W / 2, TANK_Y + 15, '欠', 'ttl pname', 'middle');
  txt(g, IOU_X + PAIR_W / 2, TANK_Y + 28, '条', 'ttl pname', 'middle');
  // 「欠条 x% / 水 y% / 占 GDP」 under the pair: private debt / annual GDP (the number the long-cycle dial reads) vs M / GDP
  g = termGroup(top, 'pvtDebtGdp', [IOU_X - 3, 391, 46, 13], 'iou');
  g.classList.add('pairlbl');
  R.iouGdp = txt(g, IOU_X - 1, 400, '', 'cap gdp debt', 'start');
  g = termGroup(top, 'M', [IOU_X - 3, 403, 46, 12], 'cash');
  g.classList.add('pairlbl');
  R.cashGdp = txt(g, IOU_X - 1, 411, '', 'cap gdp cashv', 'start');
  txt(top, IOU_X - 1, 422, '占 GDP', 'cap', 'start', 'iou cash');
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
    o.stat = txt(top, cx, TANK_Y + 42, '', 'cap vstat', 'middle', 'pool ' + p.part);     // B6: 贵 / 正常 / 便宜 against the band
    o.stat.setAttribute('data-lk', 'poolStat');
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
  g = termGroup(top, 'cashAsset', [CASH_X - 1, TANK_Y, PAIR_W + 2, 40], 'cash');
  txt(g, CASH_X + PAIR_W / 2, TANK_Y + 15, '现', 'ttl pname', 'middle');
  txt(g, CASH_X + PAIR_W / 2, TANK_Y + 28, '金', 'ttl pname', 'middle');
  // channel (texts on the left; the 断面 inset on the right)
  const cx0 = CH_X0 + 6;
  g = termGroup(top, 'goodsChannel', [CH_X0 + 2, TANK_Y + 4, 96, 22], 'channel', 'chtitle');
  R.chTitle = txt(g, cx0, TANK_Y + 19, '商品河道', 'ttl', 'start', null, 'channel');
  g = termGroup(top, 'cpi', [CH_X0 + 2, TANK_Y + 24, 54, 16], 'channel', 'cpi');
  R.cpi = txt(g, cx0, TANK_Y + 36, '', 'sub');
  g = termGroup(top, 'unemployment', [CH_X0 + 2, TANK_Y + 42, 54, 16], 'channel', 'unemp');
  R.unemp = txt(g, cx0, TANK_Y + 54, '', 'sub');
  R.px = txt(top, cx0, 363, '', 'sub', 'start', 'channel');
  g = termGroup(top, 'capacity', [CH_X0 + 2, 368, 54, 18], 'capex');
  R.cap = txt(g, cx0, 381, '', 'sub');
  buildSection(R, top);
  // A2 outlet names under their chips; 企业投资 adds a line (Capex becomes a wider channel), then the GDP sentence
  // (>=768px: the full name on two lines; phone: the short name on one line)
  for (const p of PIPES) if (p.kind === 'out') {
    const x = p.chip[0], nm = p.label;
    txt(top, x, 418.5, nm.slice(0, nm.length - 2), 'cap oname ph-hide', 'middle', p.part);
    txt(top, x, 427.5, nm.slice(-2), 'cap oname ph-hide', 'middle', p.part);
    txt(top, x, 417, p.short, 'cap oname ph-only', 'middle', p.part);
  }
  txt(top, 297, 437, '↑变成更宽的河道', 'cap ph-hide', 'middle', 'capex');
  txt(top, CH_X0 + CH_W / 2 + 2, 447.5, 'GDP = 四个出口拿走的货', 'cap gdpln ph-hide', 'middle', 'channel');
  txt(top, CH_X0 + CH_W / 2 + 2, 430, 'GDP = 四个出口拿走的货', 'cap gdpln ph-only', 'middle', 'channel');
  // B2 loop label on the ring's bottom leg: tap = the loop sentence
  {
    const lg = part(el('g', { class: 'loop-lbl', 'data-act': 'loop', role: 'button', tabindex: 0, 'aria-label': '收入循环：花钱、企业、工资和利润、家庭' }, top), 'household firm channel');
    el('rect', { x: 265, y: 263, width: 40, height: 14, rx: 7 }, lg);
    txt(lg, 285, 273.2, '收入循环', 'cap', 'middle');
  }
  // spring chips etc are in chip layer; pool caption + legend + unit
  g = termGroup(top, 'assetReservoir', [6, 443, 378, 14], 'pool');
  g.classList.add('ph-hide', 'bd-shift');
  txt(g, 10, 451, '资产池：买资产 = 买取水权，只抬水位', 'cap', 'start');
  txt(top, 162, 451, '· 灰带 = 历史正常区间', 'cap ph-hide bd-shift', 'start', 'pool');
  buildLegend(top);
  buildBorder(R, top, wrap);
  // valves last (on top)
  const valves = el('g', { class: 'valves' }, top);
  for (const v of VALVE_SLOTS) valveIcon(valves, v);

    // budget bar (HTML)
  const bar = document.createElement('div');
  bar.className = 'flow-budget'; bar.setAttribute('data-part', 'budget'); bar.setAttribute('data-node', 'budget');
  wrap.appendChild(bar);
  R.bar = bar;
  tagLayers(wrap);
  // ripple strip + popover + zoom banner (HTML overlays)
  const strip = document.createElement('div'); strip.className = 'flow-ripple'; strip.hidden = true; host.appendChild(strip); R.strip = strip;
  const pop = document.createElement('div'); pop.className = 'flow-pop'; pop.hidden = true; host.appendChild(pop); R.pop = pop;
  const cp = document.createElement('div'); cp.className = 'flow-cpop'; cp.hidden = true; host.appendChild(cp); R.cpop = cp;   // B4 chip details
  const lg = document.createElement('div'); lg.className = 'flow-legend'; lg.hidden = true; lg.innerHTML = legendHtml(); host.appendChild(lg); R.legend = lg;
  const zb = document.createElement('div'); zb.className = 'flow-zoomtag'; zb.hidden = true; host.appendChild(zb); R.zoomTag = zb;
  return R;
}

// Progressive diagram: data-layer on every element with an identity (src/data/layers.js: lk > valve > pipe > node > the earliest of its parts)
function layerOf(n) {
  const T = LAYER_OF, a = k => n.getAttribute(k);
  for (const [attr, tab] of [['data-lk', T.keys], ['data-valve', T.valves], ['data-pipe', T.pipes], ['data-node', T.nodes]]) {
    const v = a(attr); if (v && tab[v]) return tab[v];
  }
  let best = -1;
  for (const p of (a('data-part') || '').split(/\s+/)) { const i = p && T.parts[p] ? LAYER_IDS.indexOf(T.parts[p]) : -1; if (i >= 0 && (best < 0 || i < best)) best = i; }
  return best >= 0 ? LAYER_IDS[best] : null;
}
function tagLayers(root) {
  root.querySelectorAll('[data-part], [data-valve], [data-lk]').forEach(n => { const L = layerOf(n); if (L) n.setAttribute('data-layer', L); });
}

// B1 断面 inset: a cross-section of the goods channel. Width = capacity (same factor as the river), depth = demand / capacity (x6 vertical
// exaggeration, as the plan view), freeboard 超高 = spare capacity = 闲置（失业）; water over the bank top = 漫顶 = 溢出（通胀）. Tap = 产出缺口 card.
function buildSection(R, top) {
  const g = termGroup(top, 'outputGap', null, 'channel', 'section');
  g.classList.add('sec');
  el('rect', { class: 'sec-bg', x: SEC.x, y: SEC.y, width: SEC.w, height: SEC.h, rx: 6 }, g);
  const t0 = txt(g, SEC.x + 4, SEC.y + 9.5, '断面', 'cap sec-t', 'start');
  const ts = el('tspan', { class: 'ph-hide sec-eq' }, t0); ts.textContent = ' 宽×深=需求';
  const S = R.sec = {};
  S.ground = el('path', { class: 'sec-ground', d: '' }, g);
  S.over = el('rect', { class: 'sec-over', x: 0, y: 0, width: 0, height: 0 }, g);
  S.water = el('rect', { class: 'water goods sec-w', x: 0, y: 0, width: 0, height: 0 }, g);
  S.bank = el('path', { class: 'sec-bank', d: '' }, g);
  S.fb = el('path', { class: 'sec-dim fb', d: '' }, g);          // freeboard arrow
  S.wd = el('path', { class: 'sec-dim', d: '' }, g);             // width dimension under the bed
  S.t1 = txt(g, SEC.cx, 352, '宽 = 产能', 'cap', 'middle');
  S.t2 = txt(g, SEC.cx, 363, '', 'cap sec-n', 'middle');
  S.t3 = txt(g, SEC.cx, 374, '', 'cap sec-n', 'middle');
  S.t4 = txt(g, SEC.cx, 385, '', 'cap sec-s', 'middle');
}
function applySection(R, cur) {
  const S = R.sec, r = cur.chR, w = cur.chW * 0.4, x0 = SEC.cx - w / 2, x1 = SEC.cx + w / 2, H = SEC.bed - SEC.top, lip = 7;
  S.ground.setAttribute('d', `M${(x0 - lip).toFixed(1)} ${SEC.top} H${x0.toFixed(1)} V${SEC.bed} H${x1.toFixed(1)} V${SEC.top} H${(x1 + lip).toFixed(1)} V${SEC.bed + 3} H${(x0 - lip).toFixed(1)} Z`);
  S.bank.setAttribute('d', `M${(x0 - lip).toFixed(1)} ${SEC.top} H${x0.toFixed(1)} V${SEC.bed} H${x1.toFixed(1)} V${SEC.top} H${(x1 + lip).toFixed(1)}`);
  const wy = SEC.bed - H * r;
  S.water.setAttribute('x', x0.toFixed(1)); S.water.setAttribute('width', w.toFixed(1));
  S.water.setAttribute('y', Math.max(SEC.top, wy).toFixed(1)); S.water.setAttribute('height', (SEC.bed - Math.max(SEC.top, wy)).toFixed(1));
  const ov = r > 1 ? SEC.top - wy : 0;      // over the bank: spreads over both lips
  S.over.setAttribute('x', (x0 - lip).toFixed(1)); S.over.setAttribute('width', (w + 2 * lip).toFixed(1));
  S.over.setAttribute('y', (SEC.top - ov).toFixed(1)); S.over.setAttribute('height', ov.toFixed(1));
  const fx = x1 - 4, gap = wy - SEC.top;
  S.fb.setAttribute('d', gap > 3 ? `M${fx} ${(SEC.top + 0.5).toFixed(1)} V${(wy - 0.5).toFixed(1)} M${fx - 2} ${(SEC.top + 0.5).toFixed(1)} H${fx + 2} M${fx - 2} ${(wy - 0.5).toFixed(1)} H${fx + 2}` : '');
  const dy = SEC.bed + 6;
  S.wd.setAttribute('d', `M${x0.toFixed(1)} ${dy} H${x1.toFixed(1)} M${x0.toFixed(1)} ${dy - 2} V${dy + 2} M${x1.toFixed(1)} ${dy - 2} V${dy + 2}`);
}

// phone: the legend row is hidden in the SVG; the 图例 button opens this sheet instead
function legendHtml() {
  const svg = inner => `<svg width="26" height="22" viewBox="-13 -11 26 22" aria-hidden="true">${inner}</svg>`;
  const rows = [
    [svg(`<circle r="8.5" style="fill:var(--surface);stroke:var(--c-pump);stroke-width:2.2"/><path d="M-4 0H4M0 -4V4" style="fill:none;stroke:var(--c-pump);stroke-width:2;stroke-linecap:round"/>`), '蓝色 + 泵 = 造水', '放贷、QE、财政赤字'],
    [svg(`<path d="M-8 -6 L8 -6 L2.5 1.5 L2.5 8 L-2.5 8 L-2.5 1.5 Z" style="fill:var(--surface);stroke:var(--c-drain);stroke-width:2;stroke-linejoin:round"/>`), '红色 − 排水口 = 消水', '还本、QT、财政盈余'],
    [svg(`<path d="M-10 0 H10" style="fill:none;stroke:var(--c-pipe);stroke-width:3.5;stroke-linecap:round;stroke-dasharray:5 3"/>`), '灰色管道 = 搬水', '管越宽，本季流量越大；管上数字 = 占 GDP（按年算），点一下看金额'],
    [svg(`<path d="M-8 -5 L0 0 L-8 5 Z M8 -5 L0 0 L8 5 Z" style="fill:var(--surface-2);stroke:var(--accent);stroke-width:1.8;stroke-linejoin:round"/><path d="M0 0 V-8 M-5 -8 H5" style="fill:none;stroke:var(--accent);stroke-width:2;stroke-linecap:round"/>`), '阀门 = 可拧', '点阀门图标：看是谁的阀门、怎么传导'],
    [svg(`<path d="M-3 -8 v16 M-3 -5 h4 M-3 -1 h4 M-3 3 h4" style="fill:none;stroke:var(--muted);stroke-width:1.4"/>`), '水位 = 结果', '房价、物价、失业…不能直接拧'],
    [svg(`<rect x="-9" y="-5" width="18" height="10" style="fill:var(--c-band);stroke:var(--muted);stroke-width:1;stroke-dasharray:2 1.5"/>`), '灰带 = 历史正常区间', '1995–2021 中间一半的估值；水在带上 = 贵，带下 = 便宜'],
    [svg(`<path d="M-11 0 H11" style="fill:none;stroke:var(--text);stroke-opacity:.7;stroke-width:1.4;stroke-dasharray:3 2.5"/>`), '虚线 = 到现在为止的最高水位（洪痕）', '旁边写着是哪一年；水面涨到这条线就显示「新高」'],
  ];
  return `<div class="fl-head"><b>图例</b><button type="button" class="fl-x" data-act="legend" aria-label="关闭">✕</button></div>` +
    rows.map(([ic, t, d]) => `<div class="fl-row">${ic}<span><b>${t}</b><small>${d}</small></span></div>`).join('') +
    `<div class="fl-note">带下划线的词可以点开看解释；点底部「本季水量」看泵入 / 排出明细。</div>`;
}

function buildLegend(top) {
  const g = part(el('g', { class: 'legend' }, top), 'budget');
  const y = 466;
  // pump
  const p = el('g', { class: 'pump pc-pump mini', transform: `translate(14 ${y - 3})` }, g);
  el('circle', { class: 'body', r: 6 }, p);
  el('path', { class: 'sign', d: 'M-3 0 H3 M0 -3 V3' }, p);
  txt(g, 24, y, '泵 = 造水', 'cap lg-pump', 'start');
  const d = el('g', { class: 'drain pc-drain mini', transform: `translate(88 ${y - 3})` }, g);
  el('path', { class: 'body', d: 'M-6 -4 L6 -4 L1.8 1.5 L1.8 5 L-1.8 5 L-1.8 1.5 Z' }, d);
  el('path', { class: 'sign', d: 'M-2.5 -7.5 H2.5' }, d);
  txt(g, 98, y, '排水口 = 消水', 'cap lg-drain', 'start');
  el('path', { class: 'pipeline', d: `M174 ${y - 3} H192` }, g);
  txt(g, 196, y, '灰管 = 搬水', 'cap', 'start');
  const v = el('g', { class: 'valve mini', transform: `translate(272 ${y - 3}) scale(.7)` }, g);
  el('path', { class: 'body', d: 'M-8 -5 L0 0 L-8 5 Z M8 -5 L0 0 L8 5 Z' }, v);
  el('path', { class: 'stem', d: 'M0 0 V-7 M-5 -7 H5' }, v);
  txt(g, 282, y, '阀门 = 可拧', 'cap', 'start');
  el('path', { class: 'ruler', d: `M338 ${y - 8} v10 M338 ${y - 6} h3 M338 ${y - 3} h3 M338 ${y} h3` }, g);
  txt(g, 345, y, '水位 = 结果', 'cap', 'start');
}

/* =====================================================================================================================
   国境线 (snap.border). Everything here carries the class 'bd' (hidden by CSS until the svg has 'has-border') and data-part 'border'.
   bd-d = the wide drawing (line, pipes, gate; hidden on phone), bd-p = the compact phone pill that opens an HTML popover.
   ===================================================================================================================== */
function buildBorder(R, top, wrap) {
  const D = R.bd = {};
  txt(top, 24, BD_LINE + 11, '国境线 · 以下是外国', 'cap bd bd-d bd-lbl', 'start', 'border');
  // FX gate on the line (non-USA): a little sluice (tap = 汇率 card); under it the FX reactor (two pipes + needle + anchor, drawn by setBorder),
  // and on its right the readings: 本币比一年前 / 汇率 / PPP 锚
  const gx = FXR.cx;
  let g = termGroup(top, 'fx', [gx - 15, BD_LINE - 8, 30, 15], 'border');
  g.setAttribute('class', 'term bd bd-d bd-gate');
  el('rect', { class: 'bd-gbox', x: gx - 12, y: BD_LINE - 6, width: 24, height: 12, rx: 3 }, g);
  el('path', { class: 'bd-gslat', d: `M${gx - 6} ${BD_LINE - 3} V${BD_LINE + 3} M${gx} ${BD_LINE - 3} V${BD_LINE + 3} M${gx + 6} ${BD_LINE - 3} V${BD_LINE + 3}` }, g);
  D.fx = g;
  D.fxr = part(el('g', { class: 'bd bd-d bd-fxr' }, top), 'border');          // the reactor (innerHTML from fx-reactor.js reactorSvg)
  g = termGroup(top, 'fx', [FXR.tx - 2, BD_LINE + 2, 52, 31], 'border');
  g.setAttribute('class', 'term bd bd-d bd-fxt');
  D.fxt = g;
  D.fx2 = txt(g, FXR.tx, BD_LINE + 10, '', 'cap bd-chg', 'start');
  D.fx1 = txt(g, FXR.tx, BD_LINE + 19.5, '', 'cap num', 'start');
  D.fx3 = txt(g, FXR.tx, BD_LINE + 29, '', 'cap', 'start');
  // USA: the gate shows the broad dollar index (美元对一篮子货币; tap = 汇率 card) and the reserve-currency line (tap = 储备货币 card)
  g = termGroup(top, 'fx', [124, BD_LINE - 7, 132, 27], 'border');
  g.setAttribute('class', 'term bd bd-d bd-gate bd-res');
  el('rect', { class: 'bd-gbox', x: 178, y: BD_LINE - 6, width: 24, height: 12, rx: 3 }, g);
  el('path', { class: 'bd-gslat', d: `M184 ${BD_LINE - 3} V${BD_LINE + 3} M190 ${BD_LINE - 3} V${BD_LINE + 3} M196 ${BD_LINE - 3} V${BD_LINE + 3}` }, g);
  D.res = g;
  D.usd1 = txt(g, 190, BD_LINE + 14, '', 'sub num', 'middle');
  D.usd2 = txt(g, 190, BD_LINE + 23.5, '', 'cap bd-chg', 'middle');
  g = termGroup(top, 'reserveCurrency', [124, BD_LINE + 25, 132, 11], 'border');
  g.setAttribute('class', 'term bd bd-d bd-res2');
  D.resT = g;
  D.res2 = txt(g, 190, BD_LINE + 33, '', 'cap', 'middle');
  // phone: one compact gate pill (bottom right, under the goods channel); tap = popover with the details
  const pill = part(el('g', { class: 'bd bd-p', 'data-bd': 'pill', role: 'button', tabindex: 0, 'aria-label': '国境线：汇率、出口、进口、外国人买国债' }, top), 'border');
  D.pillBg = el('rect', { class: 'bd-pill', y: 397, height: 24, rx: 12 }, pill);
  D.pillTx = el('text', { y: 409, 'text-anchor': 'middle', dy: '.35em' }, pill);
  D.pill = pill;
  const pop = document.createElement('div'); pop.className = 'flow-bpop'; pop.hidden = true; wrap.parentElement.appendChild(pop);
  D.pop = pop;
  wireFxReactor(pop);                                  // phone: tap a reactor pipe inside the popover = open the five forces there
  // desktop: tap a reactor pipe in the band = this popover (the reactor again, larger, with the five forces open)
  const fp = document.createElement('div'); fp.className = 'fxr-pop'; fp.hidden = true; wrap.parentElement.appendChild(fp);
  D.fxPop = fp;
  wireFxReactor(fp);
  ensureFxReactorCss();
  installFxCardHook(CONCEPTS.fx && CONCEPTS.fx.name);
}
function openFxPop(R, hl) {
  const D = R.bd, X = D.fxR;
  if (!X || !X.ok) return;
  D.fxPop.innerHTML = `<button type="button" class="fxr-x" data-act="fxr-close" aria-label="关闭">✕</button>` + reactorHtml(X, { w: Math.min(440, (R.wrap.clientWidth || 400) - 40), open: true, hl });
  D.fxPop.style.bottom = ((R.bar && R.bar.offsetHeight) || 0) + 8 + 'px';
  D.fxPop.hidden = false;
  openForcesIn(D.fxPop.querySelector('.fxr-box'), hl, false);      // the reactor stays on top; the forces are open below it
  D.fxPop.scrollTop = 0;
}

// phone + border: the 净出口 outlet chip is the border gate (tap = the 国境线 popover); it replaces the old corner pill, whose slot the outlets now use
function syncNxGate(R) {
  const c = R.pipes && R.pipes.outNX && R.pipes.outNX.chip;
  if (!c) return;
  if (isPhone() && R.hasBorder) { c.setAttribute('data-bd', 'pill'); c.setAttribute('role', 'button'); c.setAttribute('tabindex', '0'); c.setAttribute('aria-label', '净出口 / 国境线：汇率、出口、进口、外国人买国债'); }
  else { c.removeAttribute('data-bd'); c.removeAttribute('role'); c.removeAttribute('tabindex'); c.removeAttribute('aria-label'); }
}

const fmtFx = v => (v >= 100 ? String(Math.round(v)) : v >= 10 ? v.toFixed(1) : v.toFixed(2));
function setBorder(R, snap, town) {
  const B = snap.border, D = R.bd;
  const has = !town && !!B && typeof B === 'object' && layerShown('L-border');      // progressive diagram: the band waits for L-border
  R.svg.classList.toggle('has-border', has);
  if (!!R.hasBorder !== has) { R.hasBorder = has; R.syncVB(); }
  syncNxGate(R);
  if (!has) { D.pop.hidden = true; D.fxPop.hidden = true; return; }
  const num = v => typeof v === 'number' && isFinite(v);
  const fx = B.fxPerUsd, usd = num(fx) && Math.abs(fx - 1) < 1e-9, local = num(fx) && !usd;
  D.fx.style.display = local ? '' : 'none';
  D.fxt.style.display = local ? '' : 'none';
  D.fxr.style.display = local ? '' : 'none';
  D.res.style.display = usd ? '' : 'none';
  D.resT.style.display = usd ? '' : 'none';
  // FX reactor on the REAL data of this country at this quarter (null outside the data, e.g. a free run past 2025Q4)
  const iso = curInfo().iso, home = local && iso !== 'USA' ? countryData(iso) : null;
  const X = D.fxR = home ? computeFxReactor(home, US_Q, snap.date, iso) : null;
  const ccy = curInfo().ccyName;
  if (local) {
    const key = X && X.ok ? `${X.iso}${X.date}` : 'none';
    if (D.fxrKey !== key) { D.fxrKey = key; D.fxr.innerHTML = X && X.ok ? reactorSvg(X, FXR) : ''; }
    const v = X && X.ok ? X.actual : (num(B.fxChg4q) ? (1 / (1 + B.fxChg4q) - 1) * 100 : null);   // 本币比一年前, + = stronger
    D.fx2.textContent = num(v) ? (Math.abs(v) < 0.5 ? `${ccy} 持平` : `${ccy} ${v > 0 ? '↑' : '↓'}${Math.abs(v).toFixed(0)}%`) : '';
    D.fx2.setAttribute('class', 'cap bd-chg ' + (!num(v) || Math.abs(v) < 0.5 ? 'flat' : v > 0 ? 'strong' : 'weak'));
    D.fx1.textContent = `${fmtFx(fx)}/美元`;
    D.fx3.textContent = X && X.ok && X.anchor ? (X.anchor.word === '差不多' ? '比锚差不多' : `比锚${X.anchor.word.replace('偏', '')}${Math.abs(X.anchor.value).toFixed(0)}%`) : '';
    D.fxt.setAttribute('aria-label', X && X.ok ? reactorLine(X) : '汇率');
  }
  if (D.fxPop && !D.fxPop.hidden && !(X && X.ok)) D.fxPop.hidden = true;
  const resTxt = num(B.reserveShareUsd) ? `储备货币 · 占世界外储 ${Math.round(B.reserveShareUsd * 100)}%` : '储备货币：全世界都存美元';
  const U = usd ? usdIndexAt(snap.date) : null;
  if (usd) {
    D.usd1.textContent = U && num(U.level) ? `美元指数 ${Math.round(U.level)}` : '美元 = 储备货币';
    D.usd2.textContent = U && num(U.chg) ? (Math.abs(U.chg) < 0.5 ? '比一年前基本没变' : `比一年前美元变${U.chg > 0 ? '强' : '弱'} ${Math.abs(U.chg).toFixed(0)}%`) : '';
    D.usd2.setAttribute('class', 'cap bd-chg ' + (!U || !num(U.chg) || Math.abs(U.chg) < 0.5 ? 'flat' : U.chg > 0 ? 'strong' : 'weak'));
    D.res2.textContent = resTxt;
  }
  // phone pill + popover
  const vChg = local ? (X && X.ok ? X.actual : num(B.fxChg4q) ? (1 / (1 + B.fxChg4q) - 1) * 100 : null) : null;   // 本币比一年前, + = stronger
  const vTxt = num(vChg) ? (Math.abs(vChg) < 0.5 ? '基本没变' : `${vChg > 0 ? '变强' : '变弱'} ${Math.abs(vChg).toFixed(0)}%`) : '';
  const pt = usd ? (U && num(U.level) ? `国境 · 美元指数 ${Math.round(U.level)}` : '国境 · 美元=储备货币') : local ? `国境 · 汇率 ${fmtFx(fx)} ${vTxt.replace(' ', '')}` : '国境线 · 进出口';
  const w = Math.ceil(estW(pt, 10.5)) + 22;
  D.pillBg.setAttribute('x', 384 - w); D.pillBg.setAttribute('width', w);
  D.pillTx.setAttribute('x', 384 - w / 2); D.pillTx.textContent = pt;
  const row = (term, label, val) => `<div class="bp-row"><button type="button" class="term" data-term="${term}">${label}</button><b>${val}</b></div>`;
  const m = v => (num(v) ? fmtMoney(v, false) : '—');
  let h = `<div class="bp-head"><b>国境线</b><span>外国水系 ↔ 本国水系</span><button type="button" class="bp-x" data-act="bd-close" aria-label="关闭">✕</button></div>`;
  // the FX reactor first (phone: this popover is the only place it shows), the dollar index for the USA
  const was = D.pop.querySelector('.fxr-forces');
  if (local && X && X.ok) h += reactorHtml(X, { w: Math.min(276, (R.wrap.clientWidth || 300) - 40), title: false, open: !!(was && was.open) });
  if (usd) h += usdHtml(snap.date);
  h += row('exports', '出口', m(B.exports));
  h += row('imports', '进口', m(B.imports));
  if (num(B.netExports)) h += `<div class="bp-row bp-sub"><span>净出口（出口 − 进口）</span><b>${B.netExports >= 0 ? '+' : '−'}${fmtMoney(Math.abs(B.netExports), false)}</b></div>`;
  if (local) h += row('fx', '汇率（本币/美元）', `${fmtFx(fx)}${vTxt ? ` · ${ccy}比一年前${vTxt}` : ''}`);
  if (usd) h += row('reserveCurrency', '美元 = 储备货币', resTxt.replace('储备货币 · ', ''));
  if (num(B.foreignBondBuy)) h += row('foreignBonds', B.foreignBondBuy < 0 ? '外国人卖国债' : '外国人买国债', `${fmtSigned(B.foreignBondBuy, false)}${num(B.foreignBondShare) ? ` · 持有 ${Math.round(B.foreignBondShare * 100)}%` : ''}`);
  h += `<div class="bp-note">单位：${curInfo().unitBn} / 季；点蓝字看解释</div>`;
  if (D.popH !== h) { D.popH = h; D.pop.innerHTML = h; }
}

/* =====================================================================================================================
   洪痕 (high-water marks): per tank, the highest level reached SO FAR in the sim on screen (+ its year), and a faint 'trough' tick for 房产 / 股票.
   Levels come from levelsOf() (same mapping as the water). History is scanned incrementally and cached per (sim, branch).
   All marks live in ONE <g class="hwm"> inside the top layer (no new svg root children, no data-pipe); each mark carries its tank's data-part.
   ===================================================================================================================== */
const HWM_MIN_T = 3;            // fewer quarters of history than this: a 'peak' means nothing yet
const HWM_NEW = 0.01;           // within 1% of the mark (level units) = 新高
const HWM_ITEMS = [
  ...POOLS.map(p => ({ key: p.id, cur: 'lv.' + p.id, part: 'pool ' + p.part, x: p.x, w: TANK_W, top: TANK_Y, h: TANK_H, label: true, trough: p.id === 'housing' || p.id === 'equity' })),
  { key: 'cash', cur: 'cash', part: 'cash', x: CASH_X, w: PAIR_W, top: TANK_Y, h: TANK_H, label: false, trough: false },   // 18 wide: line only
  { key: 'iou', cur: 'iou', part: 'iou', x: IOU_X, w: PAIR_W, top: TANK_Y, h: TANK_H, label: false, trough: false },
];
const HWM_KEYS = HWM_ITEMS.map(i => i.key);

function buildMarks(R, parent) {
  const g = el('g', { class: 'hwm' }, parent);
  R.hwm = {};
  for (const it of HWM_ITEMS) {
    const mg = part(el('g', { class: 'hwm-g hwm-' + it.key, display: 'none' }, g), it.part);
    const tr = el('path', { class: 'hwm-trough', display: 'none' }, mg);
    const line = el('path', { class: 'hwm-line' }, mg);
    const lbl = el('text', { class: 'hwm-lbl', 'text-anchor': 'end', display: 'none' }, mg);
    R.hwm[it.key] = { it, g: mg, tr, line, lbl };
  }
}

const yearOf = s => { const d = String(s?.date ?? ''); return /^\d{4}/.test(d) ? d.slice(0, 4) : d; };   // '2006Q2' -> '2006'; town '第9季' stays
function hwmFeed(k, L, lab) {
  for (const key of HWM_KEYS) {
    const v = L[key], o = k[key];
    if (!o) k[key] = { max: v, lab, trough: v };
    else if (v > o.max + 1e-9) { o.max = v; o.lab = lab; o.trough = v; }      // strictly higher = a new peak (the earliest year of a tie stays)
    else if (v < o.trough) o.trough = v;
  }
}
// Recompute st.marks for the snapshot on screen. Finalised quarters 0..t-1 are cached; quarter t (town actions rebuild it in place) is added on a copy.
function updateMarks(st, snap) {
  st.marks = null;
  try {
    const sim = currentSim(), t = snap.t;
    if (!sim || typeof sim.history !== 'function' || !(t >= HWM_MIN_T)) return;
    const br = snap.branch === 'user' ? 'user' : 'model';
    const hist = sim.history(br);
    if (!hist || hist.length <= t || !hist[0]) return;
    let c = st.hwm;
    const ok = c && c.sim === sim && c.br === br && c.n <= t && hist[0] === c.h0 && (c.n === 0 || hist[c.n - 1] === c.hn);
    if (!ok) c = st.hwm = { sim, br, n: 0, h0: hist[0], hn: null, k: {} };       // new sim / reset / scenario switch / takeover branch change
    for (; c.n < t; c.n++) { const s = hist[c.n]; hwmFeed(c.k, levelsOf(s), yearOf(s)); c.hn = s; }
    const k = {};
    for (const key of HWM_KEYS) k[key] = { ...c.k[key] };
    const L = levelsOf(snap);
    hwmFeed(k, L, yearOf(snap));
    const M = {};
    for (const key of HWM_KEYS) {
      const o = k[key], prev = c.k[key].max;
      M[key] = { level: o.max, prev, lab: o.lab, trough: o.trough, now: L[key], isNew: L[key] >= o.max - HWM_NEW, rides: L[key] > prev + 1e-9 };
    }
    st.marks = M;
  } catch (e) { st.marks = null; }
}

function hwmObstacles(it, phone, town) {      // y bands that already carry text / drawings inside the tank
  switch (it.key) {
    case 'housing': return [[TANK_Y, TANK_Y + (town ? 47 : 35)]];
    case 'bond': return [[TANK_Y, TANK_Y + 35], [349, 386]];                  // seesaw + its captions
    default: return [[TANK_Y, TANK_Y + 35]];                                  // pool name + value (+ the 贵/便宜 tag: see applyMarks)
  }
}
function hwmSpot(it, y, fs, obs) {            // text baseline above the line, else below it, else null (tank too busy: line only)
  const hgt = fs * 0.85, lo = it.top + 1, hi = it.top + it.h - 1;
  const free = (a, b) => a >= lo && b <= hi && !obs.some(([o0, o1]) => a < o1 && b > o0);
  if (free(y - 2.5 - hgt, y - 1.5)) return y - 2.5;
  if (free(y + 1.5, y + 2.5 + hgt)) return y + 1.5 + hgt;
  return null;
}
function applyMarks(R, st, cur) {
  const M = st.marks, phone = isPhone(), fs = phone ? 10 : 9;
  for (const key of HWM_KEYS) {
    const o = R.hwm[key], it = o.it, m = M && M[key];
    if (!m) { o.g.setAttribute('display', 'none'); continue; }
    o.g.removeAttribute('display');
    const base = it.top + it.h;
    // a new high rides the rising water (never below the old mark); otherwise the line stands still
    const lvl = m.rides ? Math.max(m.prev, cur[it.cur] ?? m.level) : m.level;
    const y = +(base - it.h * lvl).toFixed(1);
    o.line.setAttribute('d', `M${it.x} ${y} H${it.x + it.w}`);
    o.g.classList.toggle('new', m.isNew);
    // trough: lowest level since the peak, only when clearly below both the peak and the water now
    const showTr = it.trough && !m.isNew && m.level - m.trough > 0.05 && Math.abs(m.now - m.trough) > 0.02;
    if (showTr) {
      const ty = +(base - it.h * m.trough).toFixed(1);
      o.tr.setAttribute('d', `M${it.x + it.w - 14} ${ty} H${it.x + it.w}`); o.tr.removeAttribute('display');
    } else o.tr.setAttribute('display', 'none');
    const obs = hwmObstacles(it, phone, st.town);
    if (st.bandState && st.bandState[it.key] && !st.town) obs.push([TANK_Y + 35, TANK_Y + 46]);      // B6 贵 / 便宜 tag row
    o.g.classList.toggle('dim', obs.some(([o0, o1]) => y > o0 - 1 && y < o1 + 1));   // line runs through existing text: keep it faint
    const spot = it.label ? hwmSpot(it, y, fs, obs) : null;
    if (spot == null) { o.lbl.setAttribute('display', 'none'); continue; }
    o.lbl.removeAttribute('display');
    o.lbl.setAttribute('x', it.x + it.w - 2.5); o.lbl.setAttribute('y', spot.toFixed(1));
    const str = m.isNew ? '新高' : m.lab;
    if (o.lbl.textContent !== str) o.lbl.textContent = str;
  }
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
    const pts = r.rev ? [...p.pts].reverse() : p.pts;
    const [x1, y1] = pts[pts.length - 2], [x2, y2] = pts[pts.length - 1];
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
  for (const p of POOLS) {      // B6 band: [lo, hi] tank levels (absent = hidden)
    const o = R.pools[p.id], lo = cur['bl.' + p.id], hi = cur['bh.' + p.id];
    if (!(isFinite(lo) && isFinite(hi))) { o.band.setAttribute('display', 'none'); continue; }
    o.band.removeAttribute('display');
    const y1 = TANK_Y + TANK_H - TANK_H * hi, y0 = TANK_Y + TANK_H - TANK_H * lo;
    o.bandR.setAttribute('y', y1.toFixed(1)); o.bandR.setAttribute('height', Math.max(0.5, y0 - y1).toFixed(1));
    o.bandB.setAttribute('y', y1.toFixed(1)); o.bandB.setAttribute('height', Math.max(1.5, y0 - y1).toFixed(1));
    o.bandP.setAttribute('d', `M${p.x} ${y1.toFixed(1)} h${TANK_W} M${p.x} ${y0.toFixed(1)} h${TANK_W}`);
  }
  const ih = TANK_H * cur.iou;
  R.iouWater.setAttribute('y', (TANK_Y + TANK_H - ih).toFixed(1)); R.iouWater.setAttribute('height', ih.toFixed(1));
  const ch = TANK_H * cur.cash;
  R.cashWater.setAttribute('y', (TANK_Y + TANK_H - ch).toFixed(1)); R.cashWater.setAttribute('height', ch.toFixed(1));
  const rw = cur.chW, rx = CH_CX - rw / 2;
  R.river.setAttribute('x', rx.toFixed(1)); R.river.setAttribute('width', rw.toFixed(1));
  // B1 plan view: water depth against the bank line (r = 1 at the bank); the part above the bank is tinted (溢出)
  const hb = CH_BOT - BANK_Y, wy = CH_BOT - hb * cur.chR;
  R.chWater.setAttribute('x', rx.toFixed(1)); R.chWater.setAttribute('width', rw.toFixed(1));
  R.chWater.setAttribute('y', wy.toFixed(1)); R.chWater.setAttribute('height', (CH_BOT - wy).toFixed(1));
  R.chOver.setAttribute('x', rx.toFixed(1)); R.chOver.setAttribute('width', rw.toFixed(1));
  R.chOver.setAttribute('y', Math.min(BANK_Y, wy).toFixed(1)); R.chOver.setAttribute('height', Math.max(0, BANK_Y - wy).toFixed(1));
  R.bankLn.setAttribute('d', `M${rx.toFixed(1)} ${BANK_Y} H${(SEC.x - 1).toFixed(1)}`);
  R.capL.setAttribute('transform', `translate(${(rx - CH_X0 - 3).toFixed(1)} 0)`);
  R.capR.setAttribute('transform', `translate(${(rx + rw - CH_X0 - CH_W + 3).toFixed(1)} 0)`);
  applySection(R, cur);
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
  // the government / central-bank terms carry data-layer L-gov: hidden with that layer (progressive diagram), the totals stay complete
  // while L-gov is hidden, one grey term per side carries the hidden remainder (data-rest: shown only then), so the shown terms sum to the total
  const restP = pi.qe + pi.deficit, restD = dr.surplus + dr.qt, tiny = 0.0005 * ref(snap);
  const rest = (v, sign, name) => (v > tiny ? `<span class="fb-rest" data-rest="L-gov"> ${sign} ${name} ${num(v)}</span>` : '');
  const drainTail = rest(restD, '+', '其他排水') + `<span data-layer="L-gov">${(dr.surplus > 0.0005 * ref(snap) ? ` + ${termBtn('', '盈余')} ${num(dr.surplus)}` : '') + (dr.qt > 0.0005 * ref(snap) ? ` + QT ${num(dr.qt)}` : '')}</span>`;
  const open = R.bar.classList.contains('open');
  R.bar.className = 'flow-budget net-' + cls + (open ? ' open' : '');
  const pTot = pi.loans + pi.qe + pi.deficit, dTot = dr.repay + dr.surplus + dr.qt;
  // phone: one compact line (tap = expand the breakdown); >=768px: .fb-mini is hidden and .fb-detail is the normal two rows
  R.bar.innerHTML =
    `<div class="fb-mini" role="button" tabindex="0" data-act="fb-toggle" aria-expanded="${open}"><span class="fb-mlab">本季水量</span><span class="fb-net ${cls}">${arrow} ${fmtSigned(b.net, town)}</span>` +
    `<span class="fb-meq">= 泵入 ${num(pTot)} − 排出 ${num(dTot)}</span><span class="fb-caret" aria-hidden="true">▴</span><button type="button" class="fb-legbtn" data-act="legend">图例</button></div>` +
    `<div class="fb-detail"><div class="fb-row"><span class="fb-lab">${termBtn('M', '本季总水量变化')}</span><span class="fb-net ${cls}">${arrow} ${fmtSigned(b.net, town)}</span><span class="fb-unit lbl">${town ? '单位：万元 · 管宽 = 本季流量' : `单位：${curInfo().unitBn} · 管上数字 = 占 GDP（按年算），点开看金额`}</span></div>` +
    `<div class="fb-row fb-eq"><span class="fb-grp pump"><span class="fb-k">泵入</span> ${termBtn('newLoans', '放贷')} ${num(pi.loans)}${rest(restP, '+', '其他泵')}<span data-layer="L-gov"> + ${termBtn('qe', 'QE')} ${num(pi.qe)} + ${termBtn('fiscalInjection', '赤字')} ${num(pi.deficit)}</span></span>` +
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
    let v = f[p.k] ?? 0, lab = p.label;
    const neg = (p.k === 'foreignBonds' || !!p.signed) && v < 0;
    if (p.k === 'foreignBonds' && v < 0) lab = '外国人卖国债';     // foreigners selling: same pipe, the label says so
    if (neg) v = -v;
    const pr = R.pipes[p.k];
    if (!!pr.rev !== neg) {       // selling / net imports: the water runs the other way
      pr.rev = !pr.rev;
      const d = 'M' + (pr.rev ? [...p.pts].reverse() : p.pts).map(q => q.join(' ')).join(' L');
      pr.bed.setAttribute('d', d); pr.dash.setAttribute('d', d);
    }
    const minorHide = !!p.nochip || ((p.minor || p.kind === 'spring') && v < r * 0.0007 && p.kind !== 'spring');
    // B4: % of GDP (annualised) by default; the town keeps its 万元 (its lessons count amounts). Outlets: the number only (name under the chip).
    const sv = neg && p.signed ? -v : v;      // 净出口 keeps its sign; 外国人卖国债 says the direction in its label
    const val = town ? fmtMoney(sv, town) : pctTxt(shareOf(sv, snap), p.kind === 'out');
    placeChip(pr, p.kind === 'fb' ? p.label : p.kind === 'out' ? val : `${lab} ${val}`);
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
  { const rr = snap.rates?.realPolicy ?? ((snap.rates?.policy ?? 0) - (m.inflation ?? 0));
    R.realRate.textContent = `实际 ${pctTxt(rr)}`; R.realRate.classList.toggle('neg', rr < -0.0005); }
  R.gov.textContent = `债务/GDP ${pct(snap.gov?.debtGdp ?? 0, 0)}`;
  { const gq = snap.gov?.spendingGross != null ? snap.gov.spendingGross * 0.25 : (f.taxes ?? 0) + (snap.gov?.deficit ?? 0) * 0.25;   // quarterly gross outlays = taxes + deficit
    R.govGross.textContent = `总支出 ${town ? fmtMoney(gq, town) : Math.round(gq)}`; }
  R.bank.textContent = `审批 ×${(snap.bank?.approval ?? 1).toFixed(2)}`;
  R.hh.textContent = `DSR ${pct(snap.household?.dsr ?? 0)}`;
  R.firm.textContent = `利润 ${fmtMoney(snap.firm?.profit ?? 0, town)}`;
  for (const p of POOLS) {
    const px = a[p.id]?.price ?? 0;
    R.pools[p.id].val.textContent = String(Math.round(px));
    // B6: 贵 / 正常 / 便宜 against the 历史正常区间 (town: the housing caption '镇上10套' keeps the slot)
    const bs = st.bandState && st.bandState[p.id], o = R.pools[p.id];
    o.stat.textContent = bs && !town ? { hi: '贵', lo: '便宜', ok: '正常' }[bs.state] : '';
    o.stat.setAttribute('class', 'cap vstat' + (bs ? ' ' + bs.state : ''));
  }
  // B3: 欠条 x% / 水 y% of GDP under the pair (the same scale as the two tanks)
  { const gd = snap.macro?.gdpNominal, ratio = gd > 0 ? iouOf(snap) / gd : null, mr = gd > 0 ? (a.cash?.level ?? snap.money?.M ?? 0) / gd : null;
    R.iouGdp.textContent = ratio != null && isFinite(ratio) ? `欠条 ${pct(ratio, 0)}` : '';
    R.cashGdp.textContent = mr != null && isFinite(mr) ? `水 ${pct(mr, 0)}` : ''; }
  R.cpi.textContent = `CPI ${pct(m.inflation ?? 0)}`;
  R.unemp.textContent = `失业 ${pct(m.unemployment ?? 0)}`;
  R.px.textContent = `物价 ${Math.round(m.priceLevel ?? 0)}`;
  R.cap.textContent = `产能 ${Math.round(100 * (m.capacity ?? 100) / st.cap0)}`;
  { // B1 断面 numbers: depth = demand / capacity; freeboard (超高) = 1 − depth; over the bank (漫顶) = depth − 1
    const D = depthOf(snap), gap = Math.round((1 - D) * 100), S = R.sec;
    S.t2.textContent = `深 ${Math.round(D * 100)}%`;
    S.t3.textContent = gap >= 0 ? `超高 ${gap}%` : `漫顶 ${-gap}%`;
    S.t4.textContent = gap > 0 ? '闲置（失业）' : gap < 0 ? '溢出（通胀）' : '刚好齐岸';
    S.t4.setAttribute('class', 'cap sec-s ' + (gap > 0 ? 'idle' : gap < 0 ? 'over' : ''));
  }
  R.pools.housing.cap.textContent = LB.housingCap;
  // names that change with scale (fade handled by CSS class on svg)
  R.bankTitle.textContent = LB.bank;
  R.hhTitle.textContent = LB.hh;
  R.hhTitle.classList.toggle('long', town);
  R.chTitle.textContent = LB.channel;
  R.svg.classList.toggle('is-town', town);
  setBorder(R, snap, town);
  R.bar.dataset.unit = LB.unit;
  setBudget(R, snap, town);
}

/* =====================================================================================================================
   REVEAL: hide pipes that would dangle (both endpoint parts hidden)
   ===================================================================================================================== */
const GROUP_OF = { poolBond: ['pool'], poolEquity: ['pool'], poolHousing: ['pool'], poolGold: ['pool'] };
function visSet() {
  const b = document.body;
  if (b.classList.contains('parts-on')) return new Set((b.dataset.vis || '').split(/\s+/).filter(Boolean));     // a town lesson's own parts
  if (!b.classList.contains('layers-on')) return null;
  // progressive diagram: the parts (and owner boxes) of the layers on screen
  const on = new Set((b.dataset.layers || '').split(/\s+/)), s = new Set();
  for (const L of LAYERS) if (on.has(L.id)) [...(L.parts || []), ...(L.nodes || [])].forEach(p => s.add(p));
  return s;
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

/* B4: tap a pipe chip -> its amounts (the chip itself shows % of GDP) */
function chipPopHtml(st, p) {
  const snap = st.snap, town = st.town, f = flowsOf(snap, st.prev), iso = curInfo().iso;
  const v = f[p.k] ?? 0;
  const money = x => (town ? `${fmtMoney(x, true)} 万元` : fmtBn(x, iso));
  const signed = x => (x < 0 ? '−' : '') + money(Math.abs(x));
  const name = p.k === 'foreignBonds' && v < 0 ? '外国人卖国债' : p.label;
  const kind = { pump: '泵：在这里造出新水（蓝色 +）', drain: '排水口：水在这里被消掉（红色 −）', out: '出口：商品在这里被用掉；钱（水）没有消失，回到收入循环',
    spring: '泉水：资产自己产生的现金流，只搬水' }[p.kind] || '管道：只把水从一处搬到另一处';
  const row = (k, val) => `<div class="cp-row"><span>${k}</span><b>${val}</b></div>`;
  let h = `<button type="button" class="fp-x" data-act="cp-close" aria-label="关闭">✕</button><div class="fp-kind">${esc(kind)}</div><h4>${esc(name)}</h4>`;
  h += row('占 GDP（按年算）', pctTxt(shareOf(v, snap), p.kind === 'out'));
  h += row('本季流量', signed(v)) + row('一年大约', signed(v * 4));
  if (p.kind === 'out') {
    h += `<div class="cp-note">GDP = 四个出口拿走的货：消费 + 投资 + 政府购买 + 净出口。模型直接算总需求，所以这里的家庭消费 = GDP 减去另外三项` +
      `（包括借钱、房价上涨多花的部分）。比真实略高：美国真实约 68%。</div>`;
    if (p.k === 'outI') h += `<div class="cp-note">企业投资（Capex）过一两年变成更宽的河道（产能）。</div>`;
  }
  if (p.k === 'toConsumption') h += `<div class="cp-note">只是用新水（新贷款、财政赤字）多花的那一部分，不是全部家庭消费；全部消费看河道下面的「家庭消费」出口。</div>`;
  if (p.term && hasTerm(p.term)) h += `<div class="fp-btns"><button type="button" class="btn term-btn" data-term="${p.term}">看「${esc(CONCEPTS[p.term].name || name)}」的解释</button></div>`;
  return h;
}
const LOOP_HTML = `<button type="button" class="fp-x" data-act="cp-close" aria-label="关闭">✕</button><div class="fp-kind">收入循环</div>` +
  `<h4>花钱 → 企业 → 工资、利润 → 家庭</h4><div class="cp-note">水（钱）不会被用掉，它一圈一圈地转：家庭花的钱是企业的收入，企业再把它付成工资和利润，回到家庭。` +
  `被用掉的是货：河道下面的四个出口（家庭消费、企业投资、政府购买、净出口）拿走的货，加起来就是 GDP。</div>`;
function openChipPop(host, p, chipEl) {     // p = a PIPES entry, or null = the 收入循环 label
  const st = host._flow; if (!st) return;
  const R = st.R;
  closeValvePopover(); R.legend.hidden = true;
  R.cpop.innerHTML = p ? chipPopHtml(st, p) : LOOP_HTML;
  R.cpop.dataset.pipe = p ? p.k : 'loop';
  R.cpop.hidden = false;
  const hr = host.getBoundingClientRect(), cr = chipEl.getBoundingClientRect();
  const pw = Math.min(280, hr.width - 16);
  R.cpop.style.width = pw + 'px';
  R.cpop.style.left = clamp(cr.left + cr.width / 2 - hr.left - pw / 2, 8, Math.max(8, hr.width - pw - 8)) + 'px';
  const below = (cr.top - hr.top) < hr.height * 0.5;
  R.cpop.style.top = below ? Math.min(cr.bottom - hr.top + 6, Math.max(8, hr.height - R.cpop.offsetHeight - 8)) + 'px' : 'auto';
  R.cpop.style.bottom = below ? 'auto' : (hr.bottom - cr.top + 6) + 'px';
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
    const bp = R.bd && R.bd.pop, tg = e.target && e.target.closest ? e.target : null;
    // FX reactor (desktop band): tap a pipe = the reactor popover with the five forces; tap outside / ✕ closes it
    const fxp = R.bd && R.bd.fxPop;
    if (fxp && tg) {
      const pp = tg.closest('.flow-svg [data-fxr-pipe]');
      if (pp) { e.preventDefault(); closeValvePopover(); R.legend.hidden = true; openFxPop(R, pp.dataset.fxrPipe); return; }
      if (!fxp.hidden && (tg.closest('[data-act="fxr-close"]') || !tg.closest('.fxr-pop') || tg.closest('.fxr-pop [data-term]'))) fxp.hidden = true;
    }
    if (bp && tg) {
      if (tg.closest('[data-bd="pill"]')) {
        e.preventDefault();
        const show = bp.hidden;
        if (show) { R.legend.hidden = true; closeValvePopover(); bp.style.bottom = ((R.bar && R.bar.offsetHeight) || 0) + 8 + 'px'; }
        bp.hidden = !show;
        return;
      }
      if (tg.closest('.flow-bpop [data-act="bd-close"]') || tg.closest('.flow-bpop .term') || !tg.closest('.flow-bpop')) bp.hidden = true;
    }
    // B4 chips: tap = amounts popover (not the concept card directly; the popover has a 解释 button). The collateral link keeps its card.
    const cpOpen = R.cpop.hidden ? null : R.cpop.dataset.pipe;      // what the popover showed before this tap (a second tap on it closes it)
    if (tg && !tg.closest('.flow-cpop')) R.cpop.hidden = true;
    if (tg && tg.closest('.flow-cpop [data-act="cp-close"], .flow-cpop [data-term]')) R.cpop.hidden = true;
    const lp = tg && tg.closest('.flow-svg [data-act="loop"]');
    if (lp) {
      e.preventDefault();
      if (cpOpen !== 'loop') openChipPop(host, null, lp);
      return;
    }
    const chip = tg && tg.closest('.flow-svg g.chip[data-pipe]');
    if (chip && !chip.hasAttribute('data-bd')) {
      const p = PIPES.find(x => x.k === chip.getAttribute('data-pipe'));
      if (p && p.kind !== 'fb') {
        e.preventDefault(); e.stopPropagation();
        if (cpOpen !== p.k) openChipPop(host, p, chip);
        return;
      }
    }
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
    if (e.key === 'Escape') { closeValvePopover(); R.legend.hidden = true; closeBudget(); R.cpop.hidden = true; }
    if ((e.key === 'Enter' || e.key === ' ') && e.target.matches && e.target.matches('[data-bd="pill"]')) { e.preventDefault(); e.target.dispatchEvent(new MouseEvent('click', { bubbles: true })); }
    if (e.key === 'Escape' && R.bd) { R.bd.pop.hidden = true; R.bd.fxPop.hidden = true; }
    if ((e.key === 'Enter' || e.key === ' ') && e.target.matches && e.target.matches('.flow-svg [data-fxr-pipe]')) { e.preventDefault(); e.target.dispatchEvent(new MouseEvent('click', { bubbles: true })); }
    if ((e.key === 'Enter' || e.key === ' ') && e.target.matches && e.target.matches('.fb-mini')) { e.preventDefault(); e.target.click(); }
    if ((e.key === 'Enter' || e.key === ' ') && e.target.matches && e.target.matches('[data-act="loop"]')) { e.preventDefault(); e.target.dispatchEvent(new MouseEvent('click', { bubbles: true })); }
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
// ?mockBorder=1 -> a non-USA country (fx 1.2-1.5); ?mockBorder=usa -> the US view (fx 1 + reserve share). Screenshots / UI work before the engine writes snap.border.
const MOCK_BORDER = (() => { try { const v = new URLSearchParams(location.search).get('mockBorder'); return v ? String(v) : null; } catch (e) { return null; } })();
function withMockBorder(snap) {
  if (!MOCK_BORDER || snap.town) return snap;     // overrides a real snap.border on purpose (the engine writes one for the US already)
  const t = snap.t || 0, g = (snap.macro?.gdpNominal ?? 30000) / 4, usa = MOCK_BORDER === 'usa';
  const fxAt = k => 1.35 + 0.17 * Math.sin(k / 9);
  return { ...snap, border: {
    exports: g * (0.11 + 0.008 * Math.sin(t / 5)), imports: g * (usa ? 0.15 : 0.12) * (1 + 0.04 * Math.cos(t / 7)),
    netExports: -g * 0.01, fxPerUsd: usa ? 1 : fxAt(t), fxChg4q: usa ? 0 : fxAt(t) / fxAt(t - 4) - 1,
    foreignBondBuy: g * 0.006 * (Math.sin(t / 3) + 0.4), foreignBondShare: usa ? 0.3 : 0.24, reserveShareUsd: usa ? 0.58 : null,
  } };
}

export function renderFlow(host, snap, prevSnap) {
  if (!snap) return;
  snap = withMockBorder(snap);
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
    // (and the border band with the progressive-diagram layers: body.layers-on / data-layers, written by app.js)
    try {
      new MutationObserver(() => {
        syncDangling(host);
        const s = host._flow;
        if (s && s.snap && !!s.R.hasBorder !== (!s.town && !!s.snap.border && layerShown('L-border'))) setBorder(s.R, s.snap, s.town);
      }).observe(document.body, { attributes: true, attributeFilter: ['data-vis', 'class', 'data-layers'] });
    } catch (e) { /* ignore */ }
  }
  if (!isTownSnap(snap)) st.zoomed = false;
  st.snap = snap; st.prev = prevSnap || null;
  const tgt = targets(snap, prevSnap, st);
  setTexts(st.R, snap, prevSnap, st);
  updateMarks(st, snap);
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
    applyMarks(st.R, st, cur);
    if (k < 1) st.raf = requestAnimationFrame(tick);
  };
  tick(st.t0);
}

// optional: caller can set tween length (ms) to match playback speed
export function setFlowDuration(host, ms) { host._flowDur = ms; }
export { VALVE_SLOTS };
/** pipe ends (part ids), for tools/check_layers.mjs: no pipe on screen with a hidden end */
export const PIPE_ENDS = PIPES.map(p => ({ k: p.k, from: p.from, to: p.to }));
