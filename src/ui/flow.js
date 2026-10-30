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
import { LAYERS, LAYER_IDS, LAYER_OF, ROLE_VALVES, LAYER_SHORT } from '../data/layers.js';
import { layerShown } from './progress.js';
import { computeFxReactor, reactorSvg, reactorHtml, usdIndexAt, usdHtml, reactorLine, wireFxReactor, ensureFxReactorCss, installFxCardHook, openForcesIn } from './fx-reactor.js';

const NS = 'http://www.w3.org/2000/svg';
// v3.1 picture (tools/DESIGN-v3.md): three places stacked in one 390-wide drawing.
//   河 (y 0..198): the RING  家庭 → 测流断面 → 企业 → 分水堰 → 工资 → 家庭 (the backbone 「我花的 = 你赚的」), 政府 above the firm.
//   湖 (y 198..360): the lake row  [RULER SLOT: 吸力][央行 + 现金湖][国债 黄金 股票 房产][银行] + the springs under the pools (wired from the weir).
//   地下 (y 360..420): the groundwater band across the bottom; 抽水 pipes go UP out of it, 回灌 goes DOWN into it; 吸程线 + 地下的洞.
const VB_W = 390, VB_H = 462;
// Phone (<768px) outside a lesson: ONE place at a time (the 河 / 湖 / 地下 switch above the drawing). viewBox = that place's box.
const PLACES = { river: [0, 0, 390, 200], lake: [0, 196, 390, 168], ground: [0, 286, 390, 156] };
const PLACE_NAMES = { river: '河', lake: '湖', ground: '地下' };
// 国境线 block: a band ABOVE the picture (y < 0). The dashed border line at BD_LINE, the foreign zone BD_TOP..BD_LINE; the viewBox starts at
// -BD_H while the border is on (desktop only: the phone keeps the compact 净出口 gate).
const BD_TOP = -48, BD_LINE = -4, BD_H = 52;
// FX reactor inside the band (viewBox units): track x0..x1 (zero = cx, over the gate), pipe rows, needle top..bot, the 说不清 bracket at gapY,
// pipe names right-aligned at lab, the readings column from tx (right of it the 出口 / 进口 chips)
const FXR = { x0: 64, x1: 160, cx: 112, lab: 60, tx: 166, top: BD_TOP + 4, rows: [BD_TOP + 8, BD_TOP + 16.5], bot: BD_TOP + 21, gapY: BD_TOP + 25, fs: 7.4, range: 25, compact: true };
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
// LAKE ROW (湖): the 4 asset pools. x = left edge of the tank (width TANK_W), tank spans y TANK_Y..TANK_Y + TANK_H.
const TANK_Y = 222, TANK_H = 104, TANK_W = 35;
const POOLS = [
  { id: 'bond',    part: 'poolBond',    x: 116, name: '国债', term: 'bondAsset',   cls: 'bond',    spring: { k: 'coupons',   label: '票息', src: '分水堰' } },
  { id: 'equity',  part: 'poolEquity',  x: 192, name: '股票', term: 'equityAsset', cls: 'equity',  spring: { k: 'dividends', label: '分红', src: '分水堰' } },
  { id: 'housing', part: 'poolHousing', x: 230, name: '房产', term: 'housePrice',  cls: 'housing', spring: { k: 'rent',      label: '租金', src: '分水堰' } },
  { id: 'gold',    part: 'poolGold',    x: 154, name: '黄金', term: 'goldAsset',   cls: 'gold',    spring: null },
];
const poolCx = p => p.x + TANK_W / 2;
const PB = TANK_Y + TANK_H;                 // pool bottom (326)
const SPRING_Y = 357;                       // the 泉眼 dots under the pools; the spring wire runs just under them
// RULER SLOT (吸力): a fixed box at the left end of the lake row, beside the central bank + cash lake. Today it holds the knob; a tall
// narrow 吸力尺 (vertical gauge, >= 40×160 px on desktop) can replace the knob later without moving anything else.
const SLOT = { x: 4, y: 200, w: 32, h: 156 };          // from the lane above the lake row down to the spring lane
// 央行 box on top of the 现金湖 (cash lake = all the water, M); the pipe 现金 drops into the lake left of the box
const CB = { x: 48, y: TANK_Y, w: 64, h: 42 };
const CASH = { x: 38, w: 74, y: 268, h: PB - 268 };
// 银行 (the pump house): its pump lifts water out of the groundwater band into the household; 回灌 goes down beside it
const BANK = { x: 270, y: TANK_Y, w: 76, h: 44 };
// RIVER (河): the ring. Left leg x RL, top leg y RT (through the 测流断面), right leg x RR (through the firm), bottom leg y RB (分水堰 -> 工资 -> 家庭)
const RL = 30, RT = 86, RR = 350, RB = 182;
const HH = { x: 14, y: 150, w: 244, h: 46 };            // 家庭 (the spenders), on the ring's bottom-left corner
const FIRM = { x: 270, y: 62, w: 90, h: 44 };           // 企业 (sellers receive), on the top-right corner
const GOV = { x: 268, y: 4, w: 118, h: 40 };            // 政府, above the firm; its deep-well shaft runs down the right edge
const WEIR = { x: 300, y: 166, w: 58, h: 32 };          // 分水堰 box on the bottom leg (the right leg comes down into it)
// 测流断面 (the goods channel box on the top leg). CH_CX = centre of the river (its width = capacity).
const CH_X0 = 62, CH_W = 178, CH_Y = 36, CH_H = 96, CH_CX = 127;
// channel: bank line (河岸) in the plan view; water depth r = 1 at the bank.
const CH_BOT = CH_Y + CH_H - 4, BANK_Y = 68;
// 断面 inset (cross-section) inside the channel, right side
const SEC = { x: 184, y: 40, w: 54, h: 88, cx: 211, top: 60, bed: 78 };
// GROUND (地下): the groundwater band across the bottom; 吸程线 at GW.lift
const GW = { x: 0, w: VB_W, top: 362, bot: 432 };
GW.lift = GW.top + (GW.bot - GW.top) * 0.62;
const SHAFT_X = 379;                                    // 政府深井泵: the deep-well shaft (band -> 政府) along the right edge

// PIPES. pts follow flow direction. chip = [x, y, anchor]. kind: pump | drain | pipe | buy | capex | spring | fb | out.
// from / to = endpoint part ids (used to hide pipes that would dangle when a lesson hides both ends).
// minor: chip is only shown when the flow is non-zero.
const PIPES = [
  { k: 'qe',              part: 'centralBank', cls: 'fiscal',  kind: 'pump',  label: 'QE',      term: 'qe',              pts: [[104, TANK_Y], [104, 210], [128, 210], [128, TANK_Y]], chip: [92, 205, 'end'], from: 'centralBank', to: 'poolBond' },
  // fiscal: the deep-well pump (the NEW water N) from the groundwater band up the right edge into the government, then two branches:
  // orders -> firm (govPurchases), transfers / tax cuts / relief -> household (transfers)
  { k: 'fiscalInjection', part: 'government',  cls: 'fiscal',  kind: 'pump',  label: '注入', term: 'fiscalInjection', pts: [[SHAFT_X, 404], [SHAFT_X, GOV.y + GOV.h]], chip: [374, 352, 'end'], from: 'government', to: 'firm', maxW: 6 },
  { k: 'govPurchases',    part: 'government',  cls: 'fiscal',  kind: 'pipe',  label: '订单', term: 'govPurchases',    pts: [[310, GOV.y + GOV.h], [310, FIRM.y]], chip: [306, 53, 'start'], from: 'government', to: 'firm' },
  // 转移: down from the government BEHIND the firm box (a strip cover in the top layer), then left into the household's top: it no longer
  // crosses Capex or the ring's top leg in the open (v3.1 polish)
  { k: 'transfers',       part: 'government',  cls: 'fiscal',  kind: 'pipe',  label: '转移', term: 'transfers',       pts: [[290, GOV.y + GOV.h], [290, 128], [250, 128], [250, HH.y]], chip: [270, 128, 'middle'], from: 'government', to: 'household', maxW: 6 },
  { k: 'taxes',           part: 'government',  cls: 'cash',    kind: 'pipe',  label: '税',                                 pts: [[WEIR.x + WEIR.w, 176], [368, 176], [368, GOV.y + GOV.h]], chip: [364, 142, 'end'], from: 'channel', to: 'government', maxW: 6 },
  // 抽水: out of the groundwater band, up through the bank's pump, into the household (an L over the lane)
  { k: 'newLoans',        part: 'bank',        cls: 'credit',  kind: 'pump',  label: '抽水',   term: 'newLoans',        pts: [[316, 404], [316, 203], [252, 203], [252, HH.y + HH.h]], chip: [324, 274, 'start'], from: 'bank', to: 'household' },
  { k: 'interestPaid',    part: 'interest',    cls: 'repay',   kind: 'pipe',  label: '利息',     term: 'interestPaid',    pts: [[334, WEIR.y + WEIR.h], [334, BANK.y]], chip: [321, 210, 'start'], from: 'household', to: 'bank' },
  // 回灌: from the household down beside the bank into the groundwater band
  { k: 'principalRepay',  part: 'repay',       cls: 'repay',   kind: 'drain', label: '回灌',     term: 'principalRepay',  pts: [[242, HH.y + HH.h], [242, 214], [300, 214], [300, 386]], chip: [292, 352, 'end'], from: 'household', to: 'repay', maxW: 7 },
  { k: 'toBond',          part: 'pool poolBond',    cls: 'bond',    kind: 'buy', label: '国债', term: 'assetReservoir',   pts: [[142, HH.y + HH.h], [142, TANK_Y]], chip: [133.5, 270, 'middle'], from: 'household', to: 'poolBond', pctOnly: true },
  { k: 'toEquity',        part: 'pool poolEquity',  cls: 'equity',  kind: 'buy', label: '股票', term: 'assetReservoir',   pts: [[216, HH.y + HH.h], [216, TANK_Y]], chip: [209.5, 270, 'middle'], from: 'household', to: 'poolEquity', pctOnly: true },
  { k: 'toHousing',       part: 'pool poolHousing', cls: 'housing', kind: 'buy', label: '房产', term: 'assetReservoir',   pts: [[234, HH.y + HH.h], [234, TANK_Y]], chip: [247.5, 270, 'middle'], from: 'household', to: 'poolHousing', pctOnly: true },
  { k: 'toGold',          part: 'pool poolGold',    cls: 'gold',    kind: 'buy', label: '黄金', term: 'assetReservoir',   pts: [[178, HH.y + HH.h], [178, TANK_Y]], chip: [171.5, 270, 'middle'], from: 'household', to: 'poolGold', pctOnly: true },
  { k: 'toCash',          part: 'cash',        cls: 'cash',    kind: 'pipe',  label: '现金',                               pts: [[43, HH.y + HH.h], [43, CASH.y]], chip: [92, 314, 'middle'], from: 'household', to: 'cash', minor: true, maxW: 6, pctOnly: true },
  // only the household's EXTRA spending paid with new water (credit + part of the deficit), not consumption C (that is the outlet 'outC')
  { k: 'toConsumption',   part: 'channel',     cls: 'goods',   kind: 'pipe',  label: '新水消费',                           pts: [[76, HH.y], [76, CH_Y + CH_H]], chip: [70, 141, 'end'], from: 'household', to: 'channel' },
  // the 分水堰 mouths: 工资 back to the spenders (the ring's bottom leg), 利润 back up to the firm
  { k: 'wages',           part: 'channel',     cls: 'goods',   kind: 'pipe',  label: '工资',                               pts: [[WEIR.x, RB], [HH.x + HH.w, RB]], chip: [279, RB, 'middle'], from: 'channel', to: 'household' },
  { k: 'profits',         part: 'channel',     cls: 'goods',   kind: 'pipe',  label: '利润',                               pts: [[312, WEIR.y], [312, FIRM.y + FIRM.h]], chip: [312, 158, 'middle'], from: 'channel', to: 'firm' },
  { k: 'toCapex',         part: 'capex',       cls: 'capex',   kind: 'capex', label: 'Capex',    term: 'capex', slow: true, pts: [[FIRM.x, 72], [CH_X0 + CH_W, 72]],                    chip: [249, 72, 'middle'], from: 'firm', to: 'channel' },
  { k: 'spillToGoods',    part: 'channel',     cls: 'goods',   kind: 'pipe',  label: '溢出',                               pts: [[36, 300], [26, 300], [26, HH.y + HH.h]], chip: [26, 290, 'middle'], from: 'cash', to: 'channel', minor: true, nochip: true, maxW: 4 },
  // A2: the 4 outlets on top of the 测流断面 = GDP by use (goods are used up; the water goes round the ring). Chip = % of GDP only, the
  // name is drawn over it. out: width by share of GDP; signed: a negative value (net imports) reverses the arrow.
  { k: 'outC',            part: 'channel',            cls: 'goods',  kind: 'out', label: '家庭消费', short: '消费',                     pts: [[82, CH_Y], [82, 28]],  chip: [82, 20, 'middle'], from: 'channel', to: 'channel' },
  { k: 'outI',            part: 'channel capex',      cls: 'capex',  kind: 'out', label: '企业投资', short: '投资', term: 'capex',        pts: [[122, CH_Y], [122, 28]], chip: [122, 20, 'middle'], from: 'channel', to: 'capex' },
  { k: 'outG',            part: 'channel government', cls: 'fiscal', kind: 'out', label: '政府购买', short: '政府', term: 'govPurchases', pts: [[162, CH_Y], [162, 28]], chip: [162, 20, 'middle'], from: 'channel', to: 'government' },
  { k: 'outNX',           part: 'channel',            cls: 'goods',  kind: 'out', label: '净出口',   short: '净出口',                   pts: [[202, CH_Y], [202, 28]], chip: [202, 20, 'middle'], from: 'channel', to: 'border', signed: true },
  // springs (cash flows into the pools from below, "pipes only move water"); the 泉眼 dots are wired from the 分水堰 (buildV3 springWire)
  { k: 'coupons',   part: 'springs', cls: 'bond',    kind: 'spring', label: '票息', pts: [[poolCx(POOLS[0]), SPRING_Y - 1], [poolCx(POOLS[0]), PB]], chip: [poolCx(POOLS[0]), 336, 'middle'], from: 'poolBond', to: 'poolBond', soft: true },
  { k: 'dividends', part: 'springs', cls: 'equity',  kind: 'spring', label: '分红', pts: [[poolCx(POOLS[1]), SPRING_Y - 1], [poolCx(POOLS[1]), PB]], chip: [poolCx(POOLS[1]), 348, 'middle'], from: 'poolEquity', to: 'poolEquity', soft: true },
  { k: 'rent',      part: 'springs', cls: 'housing', kind: 'spring', label: '租金', pts: [[poolCx(POOLS[2]), SPRING_Y - 1], [poolCx(POOLS[2]), PB]], chip: [poolCx(POOLS[2]), 336, 'middle'], from: 'poolHousing', to: 'poolHousing', soft: true },
  // pumps' sister drains (idle most of the time): QT out of the cash lake, the budget surplus back into the groundwater (a recharge)
  { k: 'qt',              part: 'centralBank', cls: 'repay', kind: 'drain', label: 'QT',  pts: [[52, PB], [52, 332]], chip: [52, 330, 'middle'], from: 'centralBank', to: 'centralBank', minor: true },
  { k: 'govSurplusDrain', part: 'government',  cls: 'repay', kind: 'drain', label: '盈余', pts: [[362, 362], [362, 372]], chip: [362, 368, 'middle'], from: 'government', to: 'government', minor: true },
  // collateral feedback: housing level -> bank approval (dashed loop, not a money flow)
  { k: 'collateral', part: 'poolHousing', cls: 'fb', kind: 'fb', label: '抵押品', term: 'lvr', pts: [[262, 300], [286, 300], [286, BANK.y + BANK.h]], chip: [286, 280, 'middle'], from: 'poolHousing', to: 'bank' },
  // valuation feedback: share prices -> Capex (Tobin's q, engine cp.capexValFree; dashed, not a money flow): up from the stock pool, behind
  // the household, into the 测流断面 (capacity). Live only where the engine runs it (the sandbox / free mode); grey in history, 真实 mode and the town (setValCapex)
  { k: 'valCapex', part: 'poolEquity', cls: 'fb', kind: 'fb', label: '股价', term: 'capex', pts: [[200, TANK_Y], [200, CH_Y + CH_H]], chip: [196, 209, 'middle'], from: 'poolEquity', to: 'capex' },
  // 国境线 (only drawn while snap.border exists; keep these LAST: lessons.js pairs pipes and chips by index). The band is ABOVE the picture.
  { k: 'exports',      part: 'border', cls: 'border', kind: 'pipe', label: '出口',        term: 'exports',      pts: [[222, BD_TOP + 22], [222, CH_Y]], chip: [236, BD_TOP + 16, 'start'],   from: 'border', to: 'channel',  bd: true },
  { k: 'imports',      part: 'border', cls: 'border', kind: 'pipe', label: '进口',        term: 'imports',      pts: [[232, CH_Y], [232, BD_TOP + 22]], chip: [236, BD_TOP + 33, 'start'], from: 'channel', to: 'border',  bd: true },
  { k: 'foreignBonds', part: 'border', cls: 'border', kind: 'pipe', label: '外国人买国债', term: 'foreignBonds', pts: [[3, BD_LINE - 6], [3, 360], [124, 360], [124, PB]],   chip: [66, 352, 'start'],  from: 'border', to: 'poolBond', bd: true, maxW: 4 },
];

// PUMP icons (on a pipe), DRAIN icons. label = small caption next to the icon.
const PUMP_ICONS = [
  { k: 'newLoans',        x: 316, y: 298, main: true },
  { k: 'qe',              x: 116, y: 210 },
  { k: 'fiscalInjection', x: SHAFT_X, y: 300 },
];
const DRAIN_ICONS = [
  { k: 'qt',              x: 52,  y: 338, label: 'QT', lx: 52, ly: 359, la: 'middle' },
  { k: 'govSurplusDrain', x: 362, y: 380, label: '盈余', lx: 362, ly: 404, la: 'middle' },
];

// VALVES: the 8 knobs. id matches src/engine/valves.js. (x, y) = icon centre. lab: false = no caption (the box text names it)
const VALVE_SLOTS = [
  { id: 'policyRate',      x: 86,  y: 233, label: '利率',  owner: 'centralBank', lab: false },
  { id: 'qe',              x: 103, y: 233, label: 'QE',    owner: 'centralBank', lab: false },
  { id: 'approval',        x: 316, y: 234, label: '审批',  owner: 'bank' },
  { id: 'lvrCap',          x: 334, y: 234, label: 'LVR',   owner: 'bank' },
  { id: 'borrowMult',      x: 200, y: 166, label: '借款',  owner: 'household' },
  { id: 'saveAdj',         x: 226, y: 166, label: '储蓄',  owner: 'household' },
  { id: 'capexMult',       x: 342, y: 78,  label: 'Capex', owner: 'firm' },
  { id: 'fiscalInjection', x: 370, y: 17,  label: '财政',  owner: 'government' },
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
    return { bank: '银行', hh: '家庭 · ' + ci.households, hhShort: '家庭', channel: '河（测流断面）', housingCap: '', unit: ci.unitBn, gov: '政府' };
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
  f.qt = f.qt || 0; f.govSurplusDrain = f.govSurplusDrain ?? f.fiscalDrain ?? 0; f.collateral = 0; f.valCapex = 0;
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
  // 真实 mode (src/ui/real-mode.js): snap.outlets = the real shares of GDP (BEA / ABS 5206.0)
  const o = snap.outlets, q = gdpOf(snap) / 4;
  if (o && [o.C, o.I, o.G, o.NX].every(v => typeof v === 'number' && isFinite(v))) return { outC: o.C * q, outI: o.I * q, outG: o.G * q, outNX: o.NX * q };
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
  if (v.lab !== false) txt(g, 0, 17, v.label, 'cap vl ph-hide', 'middle');
  return g;
}

export const MNEMONIC = '短周期看河，长周期看地下水，资产看湖，角色看阀，汇率看闸';
export const FISCAL_SPLIT_TXT = '假设一半由银行和央行买国债（新抽的水），一半由存款人买（从湖里挪过来）';
const lk = (n, id) => { n.setAttribute('data-lk', id); return n; };

// phone outside a lesson: one place at a time (the 河 / 湖 / 地下 switch); iPad / desktop / a lesson: the whole picture
const placeMode = () => isPhone() && !document.body.classList.contains('lesson-on');
// Phone place view (v3.1 polish): the drawing box fills the height between the place switch and the card; the place is scaled up
// (at most PLACE_ZOOM x the full-width size) and cropped to the box, so it is genuinely larger. Drag sideways to see the rest
// (R.panX per place; the knob moves with the crop so it stays on screen). The y range grows around the place when the box is taller.
const PLACE_ZOOM = 1.45;
function placeBox(R) {
  const P = PLACES[R.place], cw = R.svg.clientWidth || 390, ch = R.svg.clientHeight || 0;
  if (!(ch > 40)) return P;
  const s = Math.min(ch / P[3], PLACE_ZOOM * cw / VB_W);           // px per viewBox unit
  const w = Math.min(VB_W, cw / s), h = ch / s;
  let y0 = P[1] + P[3] / 2 - h / 2;
  y0 = clamp(y0, Math.min(P[1], 0), Math.max(P[1], VB_H - h));
  if (h >= P[3]) y0 = clamp(y0, P[1] + P[3] - h, P[1]);              // the whole place stays inside
  const px = R.panX[R.place] ?? 0;
  const x0 = clamp(px, 0, VB_W - w);
  return [+x0.toFixed(1), +y0.toFixed(1), +w.toFixed(1), +h.toFixed(1)];
}
function syncView(R) {
  const ph = isPhone(), pm = placeMode();
  R.wrap.classList.toggle('phone', ph);
  R.wrap.classList.toggle('placed', pm);
  if (pm) R.wrap.dataset.place = R.place; else delete R.wrap.dataset.place;
  const vb = pm ? placeBox(R) : (!ph && R.hasBorder ? [0, -BD_H, VB_W, VB_H + BD_H] : [0, 0, VB_W, VB_H]);
  R.vb = vb;
  R.svg.setAttribute('viewBox', vb.join(' '));
  R.wrap.classList.toggle('pan-l', pm && vb[0] > 0.5);
  R.wrap.classList.toggle('pan-r', pm && vb[0] + vb[2] < VB_W - 0.5);
  R.placesEl.querySelectorAll('[data-place]').forEach(b => b.setAttribute('aria-pressed', String(b.dataset.place === R.place)));
  // RULER SLOT: the 吸力 knob stays on screen in every place (moved to the left edge of the crop; in 河 / 地下 to its top-left corner)
  let tx = 0, dy = 0;
  if (pm) {
    tx = vb[0];
    const top = R.place === 'lake' ? clamp(SLOT.y, vb[1] + 4, vb[1] + vb[3] - 112) : vb[1] + 6;
    dy = +(top - SLOT.y).toFixed(1);
  }
  if (R.v3 && R.v3.slot) {
    if (tx || dy) R.v3.slot.setAttribute('transform', `translate(${tx} ${dy})`); else R.v3.slot.removeAttribute('transform');
    R.v3.slot.classList.toggle('moved', !!(tx || dy));
  }
  syncNxGate(R);
  fillPlaceCard(R);
  fitDesk(R);
}
// phone: drag the place sideways (pointer events on the svg; a drag never becomes a tap on a chip / valve)
function wirePan(R) {
  const svg = R.svg;
  svg.addEventListener('pointerdown', e => {
    if (!placeMode() || (e.pointerType === 'mouse' && e.button !== 0)) return;
    R.pan = { x: e.clientX, y: e.clientY, ox: R.vb ? R.vb[0] : 0, moved: false };
  });
  svg.addEventListener('pointermove', e => {
    const p = R.pan;
    if (!p || !R.vb) return;
    const dx = e.clientX - p.x;
    if (!p.moved && (Math.abs(dx) < 8 || Math.abs(dx) < Math.abs(e.clientY - p.y))) return;
    p.moved = true;
    R.panX[R.place] = clamp(p.ox - dx * R.vb[2] / (svg.clientWidth || 390), 0, VB_W - R.vb[2]);
    syncView(R);
  });
  const end = () => { if (R.pan && R.pan.moved) R.panJust = Date.now(); R.pan = null; };
  svg.addEventListener('pointerup', end); svg.addEventListener('pointercancel', end);
  svg.addEventListener('click', e => { if (R.panJust && Date.now() - R.panJust < 400) { e.stopPropagation(); e.preventDefault(); R.panJust = 0; } }, true);
}
// desktop / iPad: the diagram column hugs the drawing. Height available to the svg = the grid row minus #diagram's padding and the
// other in-flow children of .flow-wrap (toolbar row, budget bar, the real-mode strip); the column = that height x the viewBox aspect.
// app.css reads --flow-col (grid column) and --flow-svg-h (svg max-height). Phones: removed (the phone layout is its own).
function fitDesk(R) {
  const root = document.documentElement, host = R.wrap.parentNode, main = host && host.parentNode;
  if (!host || !main || isPhone() || !R.vb) { root.style.removeProperty('--flow-col'); root.style.removeProperty('--flow-svg-h'); return; }
  const cs = getComputedStyle(host), ws = getComputedStyle(R.wrap), n = v => parseFloat(v) || 0;
  let H = main.clientHeight - n(cs.paddingTop) - n(cs.paddingBottom) - n(ws.paddingTop) - n(ws.paddingBottom);
  for (const c of R.wrap.children) {
    if (c === R.svg) continue;
    const s = getComputedStyle(c);
    if (s.position === 'absolute' || s.display === 'none') continue;
    H -= c.offsetHeight + n(s.marginTop) + n(s.marginBottom);
  }
  H = Math.floor(H);
  if (!(H > 120)) return;
  const col = Math.ceil(H * R.vb[2] / R.vb[3] + n(cs.paddingLeft) + n(cs.paddingRight) + n(cs.borderLeftWidth) + n(cs.borderRightWidth));
  if (Math.abs((R.fitCol || 0) - col) > 1 || Math.abs((R.fitH || 0) - H) > 1) {
    R.fitCol = col; R.fitH = H;
    root.style.setProperty('--flow-col', col + 'px');
    root.style.setProperty('--flow-svg-h', H + 'px');
  }
}
// Discoverability (user report: 真实 mode at 2015Q1 showed only L1/L2, the lake looked unbuilt): while body.layers-on hides layers
// outside a lesson, a one-line hint names them; tapping it = 「显示全部」 (clicks app.js's #layers-toggle). The lesson owns its layers: no hint.
function syncLayerHint(R) {
  const b = document.body, on = b.classList.contains('layers-on');
  const shown = new Set((b.dataset.layers || '').split(' ').filter(Boolean));
  const off = on ? LAYER_IDS.filter(l => !shown.has(l)) : [];
  const lesson = b.classList.contains('lesson-on') || R.lessonId != null || b.classList.contains('parts-on');
  const show = off.length > 0 && !lesson;
  const names = off.map(l => LAYER_SHORT[l] || l);
  const txt = show ? `还有 ${off.length} 层没显示（${names.slice(0, 4).join('、')}${names.length > 4 ? '…' : ''}）：点「显示全部」` : '';
  R.wrap.querySelectorAll('.flow-lhint').forEach(h => {
    h.hidden = !show;
    if (h.textContent !== txt) h.textContent = txt;
    h.dataset.n = String(show ? off.length : 0);
    h.title = show ? '这些层还没学到，先藏着。点一下：显示整张图（' + names.join('、') + '）' : '';
  });
  R.tools.classList.toggle('has-hint', show);
}
function fillPlaceCard(R) {
  const c = (placeMode() && R.cards && R.cards[R.place]) || null;
  const h = c ? `<div class="fpc-s">${c.s}${c.l ? ' <button type="button" class="fpc-more" aria-expanded="false">更多</button>' : ''}</div>` +
    (c.l ? `<div class="fpc-l" hidden>${c.l}</div>` : '') : '';
  if (R.placeCard._h !== h) { R.placeCard._h = h; R.placeCard.innerHTML = h; R.placeCard.classList.remove('open'); }
}

function build(host) {
  host.textContent = '';
  const wrap = document.createElement('div');
  wrap.className = 'flow-wrap';
  host.appendChild(wrap);
  // phone: the place switch (app.css shows it only on phones outside a lesson)
  const places = document.createElement('div');
  places.className = 'flow-places'; places.setAttribute('role', 'group'); places.setAttribute('aria-label', '一次看一处：河 / 湖 / 地下');
  places.innerHTML = Object.keys(PLACES).map(k => `<button type="button" data-place="${k}" aria-pressed="${k === 'river'}">${PLACE_NAMES[k]}</button>`).join('') +
    '<span class="fpl-hint">左右拖动看全</span>';
  wrap.appendChild(places);
  // desktop / iPad toolbar row above the drawing: the mnemonic + 「说明」 (the caption lines drop down from it). Its right end is kept
  // empty for the 📈 曲线 / 显示全部 buttons (app.js puts them in #diagram; app.css places them over this row), so they cover nothing.
  const tools = document.createElement('div');
  tools.className = 'flow-tools';
  tools.innerHTML = `<button type="button" class="flow-lhint" hidden></button><span class="ft-mn" title="${MNEMONIC}">${MNEMONIC}</span><button type="button" class="ft-more" aria-expanded="false">说明</button>`;
  wrap.appendChild(tools);
  // phone: the same 「还有 n 层没显示」 hint as a slim row under the place switch
  const phHint = document.createElement('button'); phHint.type = 'button'; phHint.className = 'flow-lhint ph'; phHint.hidden = true;
  wrap.appendChild(phHint);
  const svg = el('svg', { class: 'flow-svg', viewBox: `0 0 ${VB_W} ${VB_H}`, preserveAspectRatio: 'xMidYMid meet',
    role: 'img', 'aria-label': '宏观水流示意图：河（我花的 = 你赚的的环）、湖（现金湖和资产池）、地下水（未来的收入）；泵造水、排水口消水、管道搬水、阀门可拧' }, document.createElement('div'));
  wrap.appendChild(svg);
  const card = document.createElement('div'); card.className = 'flow-place-card'; card.setAttribute('aria-live', 'polite');
  wrap.appendChild(card);
  const R = { svg, wrap, pipes: {}, pools: {}, place: 'river', placesEl: places, placeCard: card, tools, panX: {} };
  R.syncVB = () => syncView(R);
  try { PH_MQ && (PH_MQ.addEventListener ? PH_MQ.addEventListener('change', R.syncVB) : PH_MQ.addListener(R.syncVB)); } catch (e) { /* ignore */ }
  {   // keep the phone crop / the desktop column fitted when sizes change (panel grip, card 「更多」, window, budget bar wrapping)
    const later = () => { cancelAnimationFrame(R.roF); R.roF = requestAnimationFrame(() => syncView(R)); };
    if (typeof ResizeObserver === 'function') { R.ro = new ResizeObserver(later); R.ro.observe(svg); R.ro.observe(wrap); }
    window.addEventListener('resize', later);
  }
  wirePan(R);
  {   // 「还有 n 层没显示」: follows body.layers-on / data-layers (app.js syncLayers) and the lesson state
    R.lessonId = null;
    const sync = () => syncLayerHint(R);
    try { new MutationObserver(sync).observe(document.body, { attributes: true, attributeFilter: ['class', 'data-layers'] }); } catch (e) { /* ignore */ }
    document.addEventListener('mw:lesson-active', e => { R.lessonId = e.detail && e.detail.id != null ? String(e.detail.id) : null; sync(); });
    setTimeout(sync, 0);
  }

  /* ---- back layer: the ground, the ring, nodes, tanks, water ---- */
  const back = el('g', {}, svg);
  {   // 国境线: the foreign zone (shaded) ABOVE the picture and the dashed border line
    const bg = part(el('g', { class: 'bd bd-d bd-bg' }, back), 'border');
    el('rect', { class: 'bd-zone', x: 0, y: BD_TOP, width: VB_W, height: BD_LINE - BD_TOP }, bg);
    el('path', { class: 'bd-line', d: `M0 ${BD_LINE} H${VB_W}` }, bg);
  }
  {   // 地下 (L-water): the soil band across the bottom; the pumps lift out of it, 回灌 goes back into it
    const g = lk(part(el('g', { class: 'v3-ground' }, back), 'bank repay iou'), 'groundBase');
    el('rect', { class: 'gw-soil', x: GW.x, y: GW.top, width: GW.w, height: GW.bot - GW.top }, g);
    el('path', { class: 'gw-surface', d: `M0 ${GW.top} H${VB_W}` }, g);
  }
  {   // 地下水 (L-long): the water body under the water table; the dry part above it = the hole the debts dug. The iou part / node live here now.
    const g = R.gwG = lk(part(el('g', { class: 'v3-gw' }, back), 'iou groundwater'), 'groundwater');
    R.iouBox = node(g, GW.x, GW.top, GW.w, GW.bot - GW.top, 'gw-band', 'iou', 'iou');
    R.iouBox.setAttribute('rx', 0);
    R.gwWater = el('rect', { class: 'gw-water', x: GW.x, y: GW.bot - 10, width: GW.w, height: 10 }, g);
    R.gwTable = el('path', { class: 'gw-table', d: '' }, g);
    R.gwTitle = el('title', {}, g);
  }
  {   // 河的环: the backbone ring  家庭 → 测流断面 → 企业 → 分水堰 → 工资 → 家庭 (behind the boxes; the path starts inside the household box)
    const lg = lk(part(el('g', { class: 'loop' }, back), 'household firm channel'), 'ring');
    const c = 12;
    el('path', { class: 'loop-ring', d: `M150 ${RB} H${RL + c} Q${RL} ${RB} ${RL} ${RB - c} V${RT + c} Q${RL} ${RT} ${RL + c} ${RT} H${RR - c} Q${RR} ${RT} ${RR} ${RT + c} V${RB - c} Q${RR} ${RB} ${RR - c} ${RB} H150 Z` }, lg);
    for (const [x, y, rot] of [[RL, 124, -90], [50, RT, 0], [255, RT - 0.01, 0], [RR, 138, 90]]) el('path', { class: 'loop-arr', d: 'M-5.5 -7 L6.5 0 L-5.5 7 Z', transform: `translate(${x} ${y}) rotate(${rot})` }, lg);
  }
  node(back, GOV.x, GOV.y, GOV.w, GOV.h, '', 'government', 'gov');
  node(back, BANK.x, BANK.y, BANK.w, BANK.h, '', 'bank', 'bank');
  node(back, HH.x, HH.y, HH.w, HH.h, '', 'household', 'household');
  node(back, FIRM.x, FIRM.y, FIRM.w, FIRM.h, '', 'firm', 'firm');
  node(back, CB.x, CB.y, CB.w, CB.h, '', 'centralBank', 'cb');
  node(back, 289, 316, 22, 34, 'soft drainbox', 'repay', 'drain');
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
    // springs (泉眼) under the pools: gold has an empty slot
    if (p.spring) {
      el('circle', { class: 'src ' + p.cls, cx: poolCx(p), cy: SPRING_Y, r: 3.2 }, part(el('g', { 'data-owner': p.part }, back), 'springs'));
    } else {
      const g = part(el('g', { class: 'emptyspring', 'data-owner': p.part }, back), 'springs');
      el('circle', { cx: poolCx(p), cy: SPRING_Y - 6, r: 6 }, g);
      el('path', { d: `M${poolCx(p) - 2.6} ${SPRING_Y - 8.6} L${poolCx(p) + 2.6} ${SPRING_Y - 3.4} M${poolCx(p) + 2.6} ${SPRING_Y - 8.6} L${poolCx(p) - 2.6} ${SPRING_Y - 3.4}` }, g);
    }
  }
  // 现金湖 (= all the water, M) under the central bank
  node(back, CASH.x, CASH.y, CASH.w, CASH.h, 'soft tank', 'cash', 'cash');
  R.cashWater = part(el('rect', { class: 'water cash', x: CASH.x, y: CASH.y + CASH.h, width: CASH.w, height: 0 }, back), 'cash');
  {   // scale ticks on the cash lake: 50% / 100% / 150% / 200% of GDP
    const S = Math.max(curInfo().tank.iou, curInfo().tank.cash);
    const tc = part(el('g', { class: 'ticks pair' }, back), 'cash');
    for (const k of [0.5, 1, 1.5, 2]) if (k < S) el('path', { class: k === 1 ? 'one' : '', d: `M${CASH.x + CASH.w - 5} ${(CASH.y + CASH.h - CASH.h * k / S).toFixed(1)} h5` }, tc);
  }
  // goods channel = 测流断面 (max capacity frame + current river). B1: river width = capacity, water depth = demand / capacity against the bank line.
  part(el('rect', { class: 'frame', x: CH_X0, y: CH_Y, width: CH_W, height: CH_H, rx: 10 }, back), 'channel');
  R.river = node(back, CH_X0 + 2, CH_Y + 4, CH_W - 4, CH_H - 8, 'soft', 'channel', 'channel');
  R.river.setAttribute('rx', 8);
  R.chWater = part(el('rect', { class: 'water goods', x: CH_X0 + 2, y: CH_Y + 4, width: CH_W - 4, height: 0 }, back), 'channel');
  R.chOver = part(el('rect', { class: 'ch-over', x: CH_X0 + 2, y: BANK_Y, width: CH_W - 4, height: 0 }, back), 'channel');      // water above the bank = 溢出（通胀）
  R.bankLn = part(el('path', { class: 'ch-bank', d: '' }, back), 'channel');
  R.chOver.setAttribute('data-lk', 'bankLine'); R.bankLn.setAttribute('data-lk', 'bankLine');      // layers: the bank line = depth (L-channel)
  // capacity brackets (Capex widens the channel)
  R.capL = part(el('path', { class: 'capmark', d: `M${CH_X0} ${CH_Y + 82} l-5 -4 v8 z` }, back), 'capex');
  R.capR = part(el('path', { class: 'capmark', d: `M${CH_X0 + CH_W} ${CH_Y + 82} l5 -4 v8 z` }, back), 'capex');
  // bond seesaw (in the bond pool)
  R.seesaw = part(el('g', { class: 'seesaw', transform: `translate(${poolCx(POOLS[0])} 300)` }, back), 'pool poolBond');
  R.plank = el('g', { class: 'plank' }, R.seesaw);
  el('path', { d: 'M-13 0 H13' }, R.plank);
  el('circle', { class: 'endl', cx: -13, cy: 0, r: 2.4 }, R.plank);
  el('circle', { class: 'endr', cx: 13, cy: 0, r: 2.4 }, R.plank);
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

  /* ---- top layer: covers, icons, texts, valves ---- */
  const top = el('g', {}, svg);
  // covers: the pipes that pass a box go BEHIND it (抽水 / 回灌 through the bank, 股价 → Capex behind the household)
  node(top, BANK.x, BANK.y, BANK.w, BANK.h, 'cover', 'bank').setAttribute('data-lk', 'bankTitle');   // the bank box comes with L-water (as its title)
  node(top, HH.x, HH.y, HH.w, HH.h, 'cover', 'household');
  part(el('rect', { class: 'cover-strip', x: 285, y: FIRM.y + 1.5, width: 10, height: FIRM.h - 3 }, top), 'firm');   // 转移 runs down behind the firm
  // pumps and drains on their pipes
  for (const d of PUMP_ICONS) R.pipes[d.k].icon = pumpIcon(top, d, R.pipes[d.k].def);
  for (const d of DRAIN_ICONS) R.pipes[d.k].icon = drainIcon(top, d, R.pipes[d.k].def);
  // main drain (回灌 = principal repayment, back into the groundwater)
  {
    const g = el('g', { class: 'drain main repay pc-drain', 'data-pipe': 'principalRepay', transform: 'translate(300 328)' }, top);
    part(g, 'repay');
    el('path', { class: 'body', d: 'M-10 -8 L10 -8 L3.2 2 L3.2 9 L-3.2 9 L-3.2 2 Z' }, g);
    const b = el('g', { class: 'badge', transform: 'translate(11 -9)' }, g);
    el('circle', { r: 6 }, b);
    el('path', { class: 'sign', d: 'M-3.2 0 H3.2' }, b);
    R.pipes.principalRepay.icon = g;
  }
  buildMarks(R, top);   // 洪痕 (behind the texts, inside the top layer)
  // central bank (on top of the cash lake) / government
  txt(top, CB.x + 4, CB.y + 14, '央行', 'ttl', 'start', 'centralBank');
  let g = termGroup(top, 'policyRate', [CB.x + 1, CB.y + 18, CB.w - 2, 12], 'centralBank', 'rate');
  R.rate = txt(g, CB.x + 3, CB.y + 27.5, '', 'sub cbr');
  // A3: 实际利率 = 政策利率 − 通胀 (rates.realPolicy), the real master valve (= the 吸力 knob)
  g = termGroup(top, 'realRate', [CB.x + 1, CB.y + 30, CB.w - 2, 11], 'centralBank', 'realRate');
  R.realRate = txt(g, CB.x + 3, CB.y + 38.5, '', 'sub cbr');
  txt(top, GOV.x + 6, GOV.y + 15, '政府', 'ttl', 'start', 'government', 'gov');
  g = termGroup(top, 'govDebtGdp', null, 'government');
  el('rect', { x: GOV.x + 2, y: GOV.y + 22, width: 100, height: 15, rx: 5, fill: 'transparent' }, g);   // touch target only
  R.gov = txt(g, GOV.x + 6, GOV.y + 33, '', 'sub', 'start', 'government');
  g = termGroup(top, 'fiscalInjection', null, 'government', 'govGross');
  el('rect', { x: 300, y: GOV.y + 3, width: 56, height: 16, rx: 6, fill: 'transparent' }, g);   // touch target only (no tinted .hit box over the small text)
  R.govGross = txt(g, 302, GOV.y + 15, '', 'cap', 'start', 'government');
  // bank (the pump house)
  R.bankTitle = txt(top, BANK.x + 6, BANK.y + 15, '银行', 'ttl', 'start', 'bank', 'bank');
  R.bankTitle.setAttribute('data-lk', 'bankTitle');
  g = termGroup(top, 'bankApproval', [BANK.x + 2, BANK.y + 31, 54, 12], 'bank', 'approval');
  R.bank = txt(g, BANK.x + 6, BANK.y + 40.5, '', 'sub');
  // household / firm
  R.hhTitle = txt(top, HH.x + 8, HH.y + 17, '', 'ttl hh', 'start', 'household', 'hh');
  R.hh = txt(top, HH.x + 8, HH.y + 36, '', 'sub', 'start', 'household');
  txt(top, FIRM.x + 6, FIRM.y + 17, '企业', 'ttl', 'start', 'firm');
  R.firm = txt(top, FIRM.x + 6, FIRM.y + 36, '', 'sub', 'start', 'firm');
  // pools: name + level
  for (const p of POOLS) {
    const o = R.pools[p.id], cx = poolCx(p);
    const gg = termGroup(top, p.term, [p.x, TANK_Y, TANK_W, 34], 'pool ' + p.part);
    txt(gg, cx, TANK_Y + 13, p.name, 'ttl pname', 'middle');
    o.val = txt(gg, cx, TANK_Y + 26, '', 'sub num', 'middle');
    o.cap = txt(top, cx, TANK_Y + 37, '', 'cap', 'middle', 'pool ' + p.part, 'housingCap');
    if (p.id !== 'housing') o.cap.removeAttribute('data-lbl');
    o.stat = txt(top, cx, TANK_Y + 37, '', 'cap vstat', 'middle', 'pool ' + p.part);     // B6: 贵 / 正常 / 便宜 against the band
    o.stat.setAttribute('data-lk', 'poolStat');
    if (p.id === 'housing') o.real = txt(gg, cx, TANK_Y + 46.5, '', 'cap rhint', 'middle');   // 模型 mode, 保留样本: 「真实 x」 (applyRealHint)
  }
  // seesaw captions
  txt(top, poolCx(POOLS[0]), 314, '利率↑', 'cap', 'middle', 'pool poolBond');
  txt(top, poolCx(POOLS[0]), 322.5, '价格↓', 'cap', 'middle', 'pool poolBond');
  // gold: no spring
  txt(top, poolCx(POOLS[3]), SPRING_Y + 3, '无泉水', 'cap ph-hide', 'middle', 'springs').setAttribute('data-owner', POOLS[3].part);
  // cash lake
  g = termGroup(top, 'cashAsset', [CASH.x, CASH.y, CASH.w, 16], 'cash');
  txt(g, CASH.x + 4, CASH.y + 12, '现金湖', 'ttl pname', 'start');
  g = termGroup(top, 'M', [CASH.x, CASH.y + 16, CASH.w, 12], 'cash');
  g.classList.add('pairlbl');
  R.cashGdp = txt(g, CASH.x + 4, CASH.y + 25, '', 'cap gdp cashv', 'start');
  // channel = 测流断面 (texts on the left; the 断面 inset on the right)
  const cx0 = CH_X0 + 6;
  g = termGroup(top, 'goodsChannel', [CH_X0 + 2, CH_Y + 3, 96, 17], 'channel', 'chtitle');
  R.chTitle = txt(g, cx0, CH_Y + 16, '河（测流断面）', 'ttl', 'start', null, 'channel');
  g = termGroup(top, 'cpi', [CH_X0 + 2, CH_Y + 21, 54, 13], 'channel', 'cpi');
  R.cpi = txt(g, cx0, CH_Y + 31, '', 'sub');
  g = termGroup(top, 'unemployment', [CH_X0 + 2, CH_Y + 34, 54, 13], 'channel', 'unemp');
  R.unemp = txt(g, cx0, CH_Y + 44, '', 'sub');
  // 模型 mode, 保留样本 (2022+): 「真实CPI x」 / 「真实失业 x」 in the free space under the two (applyRealHint)
  R.cpiReal = txt(top, cx0 + 56, CH_Y + 31, '', 'cap rhint', 'start', 'channel');
  R.unempReal = txt(top, cx0 + 56, CH_Y + 44, '', 'cap rhint', 'start', 'channel');
  R.px = txt(top, cx0, CH_Y + 70, '', 'sub', 'start', 'channel');
  g = termGroup(top, 'capacity', [CH_X0 + 2, CH_Y + 74, 54, 15], 'capex');
  R.cap = txt(g, cx0, CH_Y + 85, '', 'sub');
  buildSection(R, top);
  // A2 outlet names over their chips, then the GDP sentence in the top-left corner (desktop)
  for (const p of PIPES) if (p.kind === 'out') txt(top, p.chip[0], 8.5, p.short, 'cap oname', 'middle', p.part);
  for (const [i, s] of ['GDP =', '四个出口', '拿走的货'].entries()) txt(top, 30, 40 + 10 * i, s, 'cap gdpln ph-hide', 'middle', 'channel');
  // the ring's sentence, in the middle of the ring: tap = the loop card
  {
    const lg = part(el('g', { class: 'loop-lbl', 'data-act': 'loop', role: 'button', tabindex: 0, 'aria-label': '河的环：我花的 = 你赚的' }, top), 'household firm channel');
    el('rect', { x: 100, y: 134, width: 96, height: 16, rx: 8 }, lg);
    txt(lg, 148, 145.5, '我花的 = 你赚的', 'cap loop-big', 'middle');
  }
  // pool caption + legend + unit (bottom rows)
  g = termGroup(top, 'assetReservoir', [6, 435, 160, 13], 'pool');
  g.classList.add('ph-hide');
  txt(g, 8, 444, '资产池：买资产 = 买取水权，只抬水位', 'cap', 'start');
  txt(top, 170, 444, '· 灰带 = 历史正常区间', 'cap ph-hide', 'start', 'pool');
  buildLegend(top);
  buildBorder(R, top, wrap);
  buildV3(R, top, wrap);
  // valves last (on top)
  const valves = el('g', { class: 'valves' }, top);
  for (const v of VALVE_SLOTS) valveIcon(valves, v);

  // budget bar (HTML)
  const bar = document.createElement('div');
  bar.className = 'flow-budget'; bar.setAttribute('data-part', 'budget'); bar.setAttribute('data-node', 'budget');
  wrap.appendChild(bar);
  R.bar = bar;
  tagLayers(wrap);
  R.syncVB();
  // ripple strip + popover + zoom banner (HTML overlays)
  const strip = document.createElement('div'); strip.className = 'flow-ripple'; strip.hidden = true; host.appendChild(strip); R.strip = strip;
  const pop = document.createElement('div'); pop.className = 'flow-pop'; pop.hidden = true; host.appendChild(pop); R.pop = pop;
  const cp = document.createElement('div'); cp.className = 'flow-cpop'; cp.hidden = true; host.appendChild(cp); R.cpop = cp;   // B4 chip details
  const lg = document.createElement('div'); lg.className = 'flow-legend'; lg.hidden = true; lg.innerHTML = legendHtml(); host.appendChild(lg); R.legend = lg;
  const zb = document.createElement('div'); zb.className = 'flow-zoomtag'; zb.hidden = true; host.appendChild(zb); R.zoomTag = zb;
  return R;
}

/* =====================================================================================================================
   v3 PICTURE (tools/DESIGN-v3.md): 分水堰 + 泉眼线, 地下水 + 吸程线, 吸力 knob (RULER SLOT), 政府深井泵, role -> valves, the mnemonic.
   Every new element carries data-lk = its contract id (src/data/layers.js keys) and data-part = its own id + the existing part it sits on,
   so a lesson that reveals the old part still shows it. Nothing here changes the engine; the readouts are read from the snapshot.
   ===================================================================================================================== */
function buildV3(R, top, wrap) {
  const V = R.v3 = {};
  // 分水堰: the box on the ring's bottom leg, right after the firm. 工资 / 利润 / 利息 / 税 and the spring wire all leave from it.
  {
    const g = lk(part(el('g', { class: 'v3-weir' }, top), 'weir channel'), 'weir');
    el('rect', { class: 'weir-box', x: WEIR.x, y: WEIR.y, width: WEIR.w, height: WEIR.h, rx: 5 }, g);
    el('path', { class: 'weir-sill', d: `M${WEIR.x + 5} ${WEIR.y + 21} H${WEIR.x + WEIR.w - 5}` }, g);
    for (const [x, y, d] of [[WEIR.x, RB, 'h-4'], [312, WEIR.y, 'v-4'], [334, WEIR.y + WEIR.h, 'v4'], [WEIR.x + WEIR.w, 176, 'h4'], [352, WEIR.y + WEIR.h, 'v4']])
      el('path', { class: 'weir-mouth', d: `M${x} ${y} ${d}` }, g);
    txt(g, WEIR.x + WEIR.w / 2, WEIR.y + 14, '分水堰', 'cap weir-t', 'middle');
    el('title', {}, g).textContent = '分水堰：卖东西收到的钱在这里分成 工资 / 利润 / 租金 / 利息 / 税 几个口';
  }
  // 泉眼线: weir -> the 票息 / 分红 / 租金 springs under the pools (down the gap beside the bank, then along under the lake row)
  {
    const g = lk(part(el('g', { class: 'v3-spring' }, top), 'springs weir'), 'springWire');
    el('path', { class: 'spw', d: `M352 ${WEIR.y + WEIR.h} V${SPRING_Y + 2.5} H${poolCx(POOLS[0])}` }, g);
    el('title', {}, g).textContent = '泉眼线：票息、分红、租金都是从分水堰接过来的（利息、利润、租金口）';
  }
  // 回灌 label on the 还本 drain (key only; the pipe id stays principalRepay)
  {
    const g = lk(part(el('g', { class: 'v3-recharge' }, top), 'repay'), 'recharge');
    txt(g, 300, 313, '回灌', 'cap rch-t', 'middle');
    el('title', {}, g).textContent = '回灌：还本 = 把水还给地下水（这些钱被注销）';
  }
  // 地下水 texts (L-long): 「地下的洞 = 欠款 x% GDP」, the 抽水 caption, and where the table stands against the 吸程线
  {
    txt(lk(part(el('g', { class: 'v3-gtitle' }, top), 'bank repay iou'), 'groundBase'), 40, GW.top + 11, '地下水 · 未来的收入', 'cap gw-name', 'start');
    const g = lk(part(el('g', { class: 'v3-gwt' }, top), 'iou groundwater'), 'groundwater');
    const tg = termGroup(g, 'pvtDebtGdp', [38, GW.top + 15, 150, 13], 'iou');
    R.iouGdp = txt(tg, 40, GW.top + 25, '', 'cap gw-hole', 'start');
    txt(g, 136, GW.top + 11, '抽水 = 把未来的收入抽上来 → 地下水位降', 'cap ph-hide', 'start', 'iou');
    V.gwStat = txt(g, 40, GW.bot - 7, '', 'cap gw-stat', 'start');
    const lg = lk(part(el('g', { class: 'v3-lift' }, top), 'iou liftLine'), 'liftLine');
    el('path', { class: 'gw-lift', d: `M${GW.x} ${GW.lift.toFixed(1)} H${GW.x + GW.w}` }, lg);
    txt(lg, 284, GW.lift - 2, '吸程线（低于它 = 抽不上来）', 'cap gw-lt', 'end');
    el('title', {}, lg).textContent = '吸程线：地下水位掉到这条线下面，泵就抽不上来了（= B2）';
  }
  // RULER SLOT: the 吸力 knob (central bank = the real rate) lives in this group, with a FIXED reserved box (SLOT, 32×156 viewBox units,
  // ~40×160 px on a desktop) beside the central bank / cash lake. A later vertical 吸力尺 replaces what is inside the box; nothing else moves.
  // On phones syncView() moves the whole group into the place on screen, so the knob stays visible in 河 / 湖 / 地下.
  {
    const cx = SLOT.x + SLOT.w / 2;
    const g = V.slot = V.suction = lk(part(el('g', { class: 'v3-suction', 'data-ruler-slot': '' }, top), 'centralBank suction'), 'suction');
    el('rect', { class: 'ruler-box', x: SLOT.x, y: SLOT.y, width: SLOT.w, height: SLOT.h, rx: 6 }, g);
    txt(g, cx, SLOT.y + 13, '吸力', 'cap sk-n', 'middle');
    const kn = el('g', { transform: `translate(${cx} ${SLOT.y + 29})` }, g);
    el('circle', { class: 'sk-dial', r: 8.5 }, kn);
    V.skPtr = el('path', { class: 'sk-ptr', d: 'M0 0 V-7' }, kn);
    V.skVal = txt(g, cx, SLOT.y + 50, '', 'cap sk-v', 'middle');
    V.skTitle = el('title', {}, g);
    const s1 = V.suctionSave = lk(part(el('g', { class: 'v3-sarrow' }, g), 'centralBank suction'), 'suctionSave');
    V.saveT1 = txt(s1, cx, SLOT.y + 67, '存湖', 'cap sk-a', 'middle');
    V.saveT = txt(s1, cx, SLOT.y + 76, '', 'cap sk-a sk-b', 'middle');
    const s2 = V.suctionPump = lk(part(el('g', { class: 'v3-sarrow' }, g), 'centralBank suction'), 'suctionPump');
    V.pumpT1 = txt(s2, cx, SLOT.y + 92, '抽水', 'cap sk-a', 'middle');
    V.pumpT = txt(s2, cx, SLOT.y + 101, '', 'cap sk-a sk-b', 'middle');
  }
  // 政府深井泵: the deficit drawn as two streams (fInj = 0.5 stays in the engine; this is only the picture)
  {
    const g = lk(part(el('g', { class: 'v3-deep' }, top), 'government deepPump'), 'deepPump');
    el('circle', { class: 'deep-ring', cx: SHAFT_X, cy: 300, r: 15 }, g);
    txt(g, SHAFT_X - 17, 303, '深井泵', 'cap fs-t', 'end');
    el('title', {}, g).textContent = '政府深井泵：' + FISCAL_SPLIT_TXT;
    const n = lk(part(el('g', { class: 'v3-fnew' }, top), 'government deepPump'), 'fiscalNew');
    el('path', { class: 'fs-new', d: `M${SHAFT_X - 6} 398 V318` }, n);
    txt(n, SHAFT_X - 8, 334, '新抽½', 'cap fs-t', 'end');
    el('title', {}, n).textContent = '一半新抽的水：银行和央行买国债';
    const l = lk(part(el('g', { class: 'v3-flake' }, top), 'government deepPump'), 'fiscalLake');
    el('path', { class: 'fs-lake', d: `M${BANK.x + BANK.w + 2} 254 H${SHAFT_X - 3}` }, l);
    txt(l, 362, 250, '湖里挪½', 'cap fs-t', 'middle');
    el('title', {}, l).textContent = '一半从湖里挪过来：存款人买国债';
  }
  // mnemonic + the fiscal-split caption + the 股价 → Capex note: behind 「说明」 in the toolbar row (desktop / iPad), a panel that drops
  // down over the top of the drawing (no layout shift); the phone place cards carry them
  const cap = document.createElement('div');
  cap.className = 'flow-v3cap'; cap.id = 'flow-v3cap';
  cap.innerHTML = `<span class="v3-mn">${MNEMONIC}</span><span class="v3-fs" data-layer="L-gov">深井泵：${FISCAL_SPLIT_TXT}</span>` +
    `<span class="v3-vc" data-layer="L-assets" hidden>股价 → Capex · 关：${VALCAPEX_SHUT}</span>`;
  R.tools.appendChild(cap);
  R.tools.querySelector('.ft-more').setAttribute('aria-controls', 'flow-v3cap');
  V.vc = cap.querySelector('.v3-vc');
}

const LONG_STAGE5 = s => s === 5 || s === '⑤';
/** 0..1 how close the economy is to the B2 fork, from the existing B2 evidence only (no second threshold): per requirement (AND of rows /
 *  OR-groups, 加分项 left out) 1 when it holds, else how close the value is to its threshold; the mean. null when there is no B2 evidence. */
export function groundwaterDepth(long) {
  const ev = long && Array.isArray(long.forkEvidence) ? long.forkEvidence.filter(e => e && !e.support) : [];
  if (!ev.length) return null;
  const close = e => {
    if (e.ok) return 1;
    if (typeof e.value !== 'number' || typeof e.threshold !== 'number') return 0;
    const gap = e.dir === '>=' ? e.threshold - e.value : e.value - e.threshold;
    return clamp(1 - gap / (Math.abs(e.threshold) + 0.02), 0, 0.95);
  };
  const groups = new Map();
  for (const e of ev) { const k = e.grp || ('_' + groups.size); groups.set(k, Math.max(groups.get(k) ?? 0, close(e))); }
  const v = [...groups.values()];
  let d = v.reduce((a, b) => a + b, 0) / v.length;
  if (long.forkPending && long.forkPending.need) d = Math.max(d, 0.8 + 0.15 * long.forkPending.have / long.forkPending.need);
  return clamp(d, 0, 1);
}

function applyV3(R, snap) {
  const V = R.v3;
  if (!V) return;
  // 地下水位: read from the existing B2 evidence only (groundwaterDepth); BELOW the 吸程线 exactly when the long cycle is B2 or ⑤
  const L = snap?.cycles?.long || null;
  const below = !!L && (L.fork === 'B2' || LONG_STAGE5(L.stage));
  const d = groundwaterDepth(L);
  let y;
  if (below) y = GW.lift + 4 + (GW.bot - 10 - GW.lift - 4) * clamp(d ?? 1, 0, 1);
  else y = GW.top + 6 + (GW.lift - 4 - GW.top - 6) * (d != null ? d : 0.35);
  R.gwTable.setAttribute('d', `M${GW.x} ${y.toFixed(1)} H${GW.x + GW.w}`);
  R.gwWater.setAttribute('y', y.toFixed(1)); R.gwWater.setAttribute('height', Math.max(0, GW.bot - y).toFixed(1));
  R.gwG.classList.toggle('below', below);
  R.gwG.classList.toggle('noev', d == null && !below);
  const pend = L?.forkPending ? `（B2 待确认 ${L.forkPending.have}/${L.forkPending.need} 季）` : '';
  const stat = below ? '地下水位跌破吸程线：抽不上来（B2）' : d == null ? '水位只示意：这一段长周期不读 B2 证据' : `地下水位离吸程线还有 ${Math.round((1 - d) * 100)}%${pend}`;
  V.gwStat.textContent = stat;
  V.gwStat.classList.toggle('below', below);
  R.gwTitle.textContent = stat + '。地下水位跌破吸程线 = B2（抽不上来）。' + (L?.forkSignal || '');
  // 吸力 = the real policy rate
  const rr = snap?.rates?.realPolicy;
  const ok = typeof rr === 'number' && isFinite(rr);
  const ang = ok ? clamp(rr / 0.05, -1, 1) * 75 : 0;
  V.skPtr.setAttribute('transform', `rotate(${ang.toFixed(1)})`);
  V.suction.classList.toggle('neg', ok && rr < 0);
  V.skTitle.textContent = `吸力旋钮（央行）= 实际利率 ${ok ? pct(rr) : '—'}。高：存湖划算、抽水贵；低：存湖不划算、抽水便宜。预期不单独画：它藏在吸力和「怕」里。`;
  V.skVal.textContent = ok ? pctTxt(rr) : '';
  V.saveT.textContent = !ok ? '' : rr >= 0 ? '划算↑' : '不划算';
  V.pumpT.textContent = !ok ? '' : rr >= 0 ? '贵↑' : '便宜';
  // 股价 → Capex: the visible caption while it is shut (desktop line under the diagram; phone: the 湖 card and a tap on the chip)
  const shut = valCapexState(snap) !== 'on';
  if (V.vc) V.vc.hidden = !shut;
  if (R.tools) R.tools.classList.toggle('vc-shut', shut);
  // phone place cards (one per place; layer-tagged spans follow the progressive diagram): s = 1–2 lines, l = the rest behind 「更多」
  const hole = R.iouGdp ? R.iouGdp.textContent : '';
  R.cards = {
    river: { s: `<b>河 · 现在的收入</b>一个环：<b>我花的 = 你赚的</b>。`,
      l: `家庭花钱 → 测流断面（宽 = 产能，水位 = 物价，流量 = GDP）→ 企业收到 → 分水堰分成 工资 / 利润 / 利息 / 税，工资回到家庭。` },
    lake: { s: `<b>湖 · 存着的钱</b>现金湖 + 资产池。<span class="fpc-in" data-layer="L-short">吸力${ok ? ' ' + pctTxt(rr) : ''}：存湖划不划算。</span>`,
      l: `资产池 = 国债、黄金、股票、房产。<span data-layer="L-short">吸力（央行的旋钮 = 实际利率${ok ? ' ' + pctTxt(rr) : ''}）：存湖划不划算、抽水贵不贵。</span>` +
        (shut ? `<span class="fpc-vc" data-layer="L-assets">股价 → Capex · 关：${VALCAPEX_SHUT}</span>` : '') },
    ground: { s: `<b>地下 · 未来的收入</b>抽水 = 借未来的收入，回灌 = 还本。<span class="fpc-in" data-layer="L-long">${esc(hole)}。</span>`,
      l: `抽水（放贷）把未来的收入抽上来，回灌（还本）还回去。<span data-layer="L-long">${esc(stat)}。</span>` },
  };
  fillPlaceCard(R);
}

// role -> valves (src/data/layers.js ROLE_VALVES): glow that role's valves / parts, dim the other valves. null = clear.
export function highlightRole(role) {
  const wrap = document.querySelector('.flow-wrap');
  if (!wrap) return;
  wrap.querySelectorAll('.rv-on').forEach(n => n.classList.remove('rv-on'));
  const ids = role && ROLE_VALVES[role];
  wrap.classList.toggle('role-hl', !!ids);
  wrap.dataset.role = ids ? role : '';
  if (!ids) return;
  for (const id of ids) {
    wrap.querySelectorAll(`[data-valve="${id}"], [data-lk="${id}"], .chip[data-pipe="${id}"], [data-node="${id}"]`).forEach(n => n.classList.add('rv-on'));
    if (id === 'pools') wrap.querySelectorAll('[data-part~="pool"]').forEach(n => n.classList.add('rv-on'));
  }
}
// tap a role card anywhere (concepts.js renders .rc[data-role]): highlight that role's valves; tap again = clear
try {
  document.addEventListener('click', e => {
    const rc = e.target && e.target.closest && e.target.closest('.rc[data-role]');
    if (!rc) return;
    const r = rc.getAttribute('data-role'), w = document.querySelector('.flow-wrap');
    highlightRole(w && w.dataset.role === r ? null : r);
  });
} catch (e) { /* no document */ }

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
  S.t1 = txt(g, SEC.cx, SEC.y + 52, '宽 = 产能', 'cap', 'middle');
  S.t2 = txt(g, SEC.cx, SEC.y + 62, '', 'cap sec-n', 'middle');
  S.t3 = txt(g, SEC.cx, SEC.y + 72, '', 'cap sec-n', 'middle');
  S.t4 = txt(g, SEC.cx, SEC.y + 82, '', 'cap sec-s', 'middle');
}
function applySection(R, cur) {
  const S = R.sec, r = cur.chR, w = cur.chW * 0.32, x0 = SEC.cx - w / 2, x1 = SEC.cx + w / 2, H = SEC.bed - SEC.top, lip = 7;
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
    [svg(`<circle r="8.5" style="fill:var(--surface);stroke:var(--c-pump);stroke-width:2.2"/><path d="M-4 0H4M0 -4V4" style="fill:none;stroke:var(--c-pump);stroke-width:2;stroke-linecap:round"/>`), '蓝色 + 泵 = 造水', '抽水（放贷）、QE、财政赤字'],
    [svg(`<path d="M-8 -6 L8 -6 L2.5 1.5 L2.5 8 L-2.5 8 L-2.5 1.5 Z" style="fill:var(--surface);stroke:var(--c-drain);stroke-width:2;stroke-linejoin:round"/>`), '红色 − 排水口 = 消水', '回灌（还本）、QT、财政盈余'],
    [svg(`<path d="M-10 0 H10" style="fill:none;stroke:var(--c-pipe);stroke-width:3.5;stroke-linecap:round;stroke-dasharray:5 3"/>`), '灰色管道 = 搬水', '管越宽，本季流量越大；管上数字 = 占 GDP（按年算），点一下看金额'],
    [svg(`<path d="M-8 -5 L0 0 L-8 5 Z M8 -5 L0 0 L8 5 Z" style="fill:var(--surface-2);stroke:var(--accent);stroke-width:1.8;stroke-linejoin:round"/><path d="M0 0 V-8 M-5 -8 H5" style="fill:none;stroke:var(--accent);stroke-width:2;stroke-linecap:round"/>`), '阀门 = 可拧', '点阀门图标：看是谁的阀门、怎么传导'],
    [svg(`<path d="M-3 -8 v16 M-3 -5 h4 M-3 -1 h4 M-3 3 h4" style="fill:none;stroke:var(--muted);stroke-width:1.4"/>`), '水位 = 结果', '房价、物价、失业…不能直接拧'],
    [svg(`<rect x="-9" y="-5" width="18" height="10" style="fill:var(--c-band);stroke:var(--muted);stroke-width:1;stroke-dasharray:2 1.5"/>`), '灰带 = 历史正常区间', '1995–2021 中间一半的估值；水在带上 = 贵，带下 = 便宜'],
    [svg(`<path d="M-11 0 H11" style="fill:none;stroke:var(--text);stroke-opacity:.7;stroke-width:1.4;stroke-dasharray:3 2.5"/>`), '虚线 = 到现在为止的最高水位（洪痕）', '旁边写着是哪一年；水面涨到这条线就显示「新高」'],
  ];
  return `<div class="fl-head"><b>图例</b><button type="button" class="fl-x" data-act="legend" aria-label="关闭">✕</button></div>` +
    rows.map(([ic, t, d]) => `<div class="fl-row">${ic}<span><b>${t}</b><small>${d}</small></span></div>`).join('') +
    `<div class="fl-note fl-mn"><b>${MNEMONIC}</b></div><div class="fl-note">带下划线的词可以点开看解释；点底部「本季水量」看泵入 / 排出明细。</div>`;
}

function buildLegend(top) {
  const g = part(el('g', { class: 'legend' }, top), 'budget');
  const y = 456;
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
  txt(top, 386, BD_LINE - 5, '国境线 · 以上是外国', 'cap bd bd-d bd-lbl', 'end', 'border');
  // FX gate on the line (non-USA): a little sluice (tap = 汇率 card); under it the FX reactor (two pipes + needle + anchor, drawn by setBorder),
  // and on its right the readings: 本币比一年前 / 汇率 / PPP 锚
  const gx = FXR.cx;
  let g = termGroup(top, 'fx', [gx - 15, BD_LINE - 8, 30, 15], 'border');
  g.setAttribute('class', 'term bd bd-d bd-gate'); g.setAttribute('data-lk', 'gate');
  el('rect', { class: 'bd-gbox', x: gx - 12, y: BD_LINE - 6, width: 24, height: 12, rx: 3 }, g);
  el('path', { class: 'bd-gslat', d: `M${gx - 6} ${BD_LINE - 3} V${BD_LINE + 3} M${gx} ${BD_LINE - 3} V${BD_LINE + 3} M${gx + 6} ${BD_LINE - 3} V${BD_LINE + 3}` }, g);
  D.fx = g;
  D.fxr = part(el('g', { class: 'bd bd-d bd-fxr' }, top), 'border');          // the reactor (innerHTML from fx-reactor.js reactorSvg)
  g = termGroup(top, 'fx', [FXR.tx - 2, BD_TOP + 2, 52, 31], 'border');
  g.setAttribute('class', 'term bd bd-d bd-fxt');
  D.fxt = g;
  D.fx2 = txt(g, FXR.tx, BD_TOP + 10, '', 'cap bd-chg', 'start');
  D.fx1 = txt(g, FXR.tx, BD_TOP + 19.5, '', 'cap num', 'start');
  D.fx3 = txt(g, FXR.tx, BD_TOP + 29, '', 'cap', 'start');
  // USA: the gate shows the broad dollar index (美元对一篮子货币; tap = 汇率 card) and the reserve-currency line (tap = 储备货币 card)
  g = termGroup(top, 'fx', [46, BD_TOP + 4, 132, 50], 'border');
  g.setAttribute('class', 'term bd bd-d bd-gate bd-res'); g.setAttribute('data-lk', 'gate');
  el('rect', { class: 'bd-gbox', x: 100, y: BD_LINE - 6, width: 24, height: 12, rx: 3 }, g);
  el('path', { class: 'bd-gslat', d: `M106 ${BD_LINE - 3} V${BD_LINE + 3} M112 ${BD_LINE - 3} V${BD_LINE + 3} M118 ${BD_LINE - 3} V${BD_LINE + 3}` }, g);
  D.res = g;
  D.usd1 = txt(g, 112, BD_TOP + 12, '', 'sub num', 'middle');
  D.usd2 = txt(g, 112, BD_TOP + 21.5, '', 'cap bd-chg', 'middle');
  g = termGroup(top, 'reserveCurrency', [46, BD_TOP + 24, 132, 11], 'border');
  g.setAttribute('class', 'term bd bd-d bd-res2');
  D.resT = g;
  D.res2 = txt(g, 112, BD_TOP + 32, '', 'cap', 'middle');
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
  { key: 'cash', cur: 'cash', part: 'cash', x: CASH.x, w: CASH.w, top: CASH.y, h: CASH.h, label: false, trough: false },   // the 现金湖: line only
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
    if (snap.branch === 'real') return;          // 真实 mode: the marks would mix the model's history with today's real level: none
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
    case 'housing': return [[TANK_Y, TANK_Y + (town ? 47 : 35)], [TANK_Y + 40, TANK_Y + 56]];
    case 'bond': return [[TANK_Y, TANK_Y + 35], [TANK_Y + 40, TANK_Y + 56], [292, PB]];                  // seesaw + its captions
    default: return [[TANK_Y, TANK_Y + 35], [TANK_Y + 40, TANK_Y + 56]];                                  // pool name + value (+ the 贵/便宜 tag: see applyMarks)
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
  const ch = CASH.h * cur.cash;
  R.cashWater.setAttribute('y', (CASH.y + CASH.h - ch).toFixed(1)); R.cashWater.setAttribute('height', ch.toFixed(1));
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
    `<div class="fb-row fb-eq"><span class="fb-grp pump"><span class="fb-k">泵入</span> ${termBtn('newLoans', '抽水')} ${num(pi.loans)}${rest(restP, '+', '其他泵')}<span data-layer="L-gov"> + ${termBtn('qe', 'QE')} ${num(pi.qe)} + ${termBtn('fiscalInjection', '赤字')} ${num(pi.deficit)}</span></span>` +
    `<span class="fb-minus">−</span><span class="fb-grp drain"><span class="fb-k">排出</span> ${termBtn('principalRepay', '回灌')} ${num(dr.repay)}${drainTail}</span></div></div>`;
}

// share prices -> Capex pipe: open only where the engine runs it = free mode with cp.capexValFree (default capexVal) > 0. History mode,
// 真实 mode (snap.valueState) and the town keep it shut: grey, no motion, and the title says why.
const VALCAPEX_SHUT = '历史模式里关着：模型的股价比真实早两年见顶，接上会更不稳；沙盒里是开的';
function valCapexState(snap) {
  const sim = currentSim();
  if (!sim || sim.mode !== 'free' || !snap || snap.valueState || isTownSnap(snap)) return 'shut';
  const cp = sim.countryParams || {};
  return (cp.capexValFree ?? cp.capexVal ?? 0) > 0 ? 'on' : 'off';
}
function setValCapex(pr, snap) {
  const s = valCapexState(snap), on = s === 'on';
  const tip = on ? '股价高 → 融资便宜 → 企业多投资（Capex），约 2–4 季。沙盒里是开的；历史模式里关着'
    : s === 'off' ? '这个国家的模型里没接：试过，几乎不改变结果' : VALCAPEX_SHUT;
  for (const n of [pr.g, pr.chip]) {
    n.classList.toggle('shut', !on);
    let t = n.querySelector(':scope > title');
    if (!t) t = n.insertBefore(el('title', {}), n.firstChild);
    t.textContent = tip;
  }
  placeChip(pr, on ? pr.def.label : pr.def.label + '·关');
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
    placeChip(pr, p.kind === 'fb' ? p.label : p.kind === 'out' || p.pctOnly ? val : `${lab} ${val}`);
    pr.chip.classList.toggle('off', minorHide);
    const idle = p.kind === 'fb' ? false : v < r * 0.0007;
    pr.g.classList.toggle('idle', idle);
    if (pr.icon) pr.icon.classList.toggle('idle', idle);
    if (!idle) {
      pr.dash.style.animationDuration = (p.kind === 'fb' ? 1.4 : dashPeriod(v, r)).toFixed(2) + 's';
      if (pr.icon) pr.icon.style.setProperty('--spin', (2.4 - 1.9 * clamp(Math.sqrt(v / r), 0, 1)).toFixed(2) + 's');
    }
  }
  setValCapex(R.pipes.valCapex, snap);
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
  // 地下的洞 = private debt / annual GDP (the number the long-cycle dial reads); the cash lake = M / GDP
  { const gd = snap.macro?.gdpNominal, ratio = gd > 0 ? iouOf(snap) / gd : null, mr = gd > 0 ? (a.cash?.level ?? snap.money?.M ?? 0) / gd : null;
    R.iouGdp.textContent = ratio != null && isFinite(ratio) ? `地下的洞 = 欠款 ${pct(ratio, 0)} GDP` : '地下的洞 = 欠款';
    R.cashGdp.textContent = mr != null && isFinite(mr) ? `${pct(mr, 0)} GDP` : ''; }
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
  applyValueState(R, snap);
  applyRealHint(R, snap);
}

/* ---------- 真实 mode (src/ui/real-mode.js viewSnapshot): which numbers are model estimates (.v-est, grey, 「模型估算」) and which have
   no value (.v-none: the number is dropped, only the name stays, and real-mode.css fades the text / chip / pipe — no 「—」 in every
   empty chip after the model's last quarter). snap.valueState = { est: Set<path>, none: Set<path> }; no valueState = all plain. ---------- */
const VALUE_SRC = [['rate', 'rates.policy'], ['realRate', 'rates.realPolicy'], ['gov', 'gov.debtGdp'], ['govGross', 'gov.spendingGross'],
  ['bank', 'bank.approval'], ['hh', 'household.dsr'], ['firm', 'firm.profit'], ['iouGdp', 'iou.bankTotal'], ['cashGdp', 'money.M'],
  ['cpi', 'macro.inflation'], ['unemp', 'macro.unemployment'], ['px', 'macro.priceLevel'], ['cap', 'macro.capacity']];
const PIPE_SRC = { govPurchases: 'flows.fiscalInjection', transfers: 'flows.fiscalInjection', outC: 'outlets.C', outI: 'outlets.I', outG: 'outlets.G', outNX: 'outlets.NX',
  exports: 'border.exports', imports: 'border.imports', foreignBonds: 'border.foreignBondBuy' };
const pipeSrc = k => PIPE_SRC[k] || 'flows.' + k;
const EST_TIP = '模型估算：真实统计里没有这一项';
function valueStateOf(snap, path) {
  const vs = snap && snap.valueState;
  return !vs ? '' : vs.none.has(path) ? 'none' : vs.est.has(path) ? 'est' : '';
}
function markText(n, s) {
  if (!n) return;
  n.classList.toggle('v-est', s === 'est'); n.classList.toggle('v-none', s === 'none');
  if (s === 'none') {
    const t = n.textContent.trim();
    n.textContent = !/\d/.test(t) ? t : / GDP$/.test(t) ? t.replace(/\s*\S*\d\S*\s+GDP$/, '') : /\s/.test(t) ? t.replace(/\s+\S*$/, '') : '';   // 「x% GDP」: drop both
  }
  if (s === 'est') n.setAttribute('data-est', EST_TIP); else n.removeAttribute('data-est');
}
function applyValueState(R, snap) {
  for (const [k, p] of VALUE_SRC) markText(R[k], valueStateOf(snap, p));
  for (const p of POOLS) { const s = valueStateOf(snap, `assets.${p.id}.price`); markText(R.pools[p.id].val, s); if (s) R.pools[p.id].stat.textContent = s === 'none' ? '' : R.pools[p.id].stat.textContent; R.pools[p.id].stat.classList.toggle('v-est', s === 'est'); }
  { const s = valueStateOf(snap, 'macro.demandPressure'), S = R.sec;
    for (const n of [S.t2, S.t3, S.t4]) markText(n, s);
    if (s === 'none') { S.t2.textContent = '深'; S.t3.textContent = ''; S.t4.textContent = ''; } }
  for (const p of PIPES) {
    const pr = R.pipes[p.k], s = valueStateOf(snap, pipeSrc(p.k));
    pr.chip.classList.toggle('v-est', s === 'est'); pr.chip.classList.toggle('v-none', s === 'none');
    pr.g.classList.toggle('v-est', s === 'est'); pr.g.classList.toggle('v-none', s === 'none');
    if (s === 'none' && p.kind !== 'fb') placeChip(pr, p.kind === 'out' ? '' : p.label);
  }
  const bs = valueStateOf(snap, 'budget.net');
  R.bar.classList.toggle('v-est', bs === 'est'); R.bar.classList.toggle('v-none', bs === 'none');
  // phone: one line with an ellipsis (real-mode.css); a tap opens the whole sentence above the bar (.open, as the normal bar's breakdown)
  if (bs === 'none') R.bar.innerHTML = '<div class="fb-none" role="button" tabindex="0" title="模型只算到最后一季历史数据；真实统计里没有这一项"><b>本季水量 —</b><small>模型只算到最后一季历史数据；真实统计里没有这一项</small></div>';
  else if (bs === 'est') {
    const m = R.bar.querySelector('.fb-mlab'), d = R.bar.querySelector('.fb-detail .fb-row');
    const tag = '<span class="fb-est" title="' + EST_TIP + '">模型估算</span>';
    if (m) m.insertAdjacentHTML('afterend', tag);
    if (d) d.insertAdjacentHTML('beforeend', tag);
  }
}
// 模型 mode inside 保留样本 (2022+): small muted 「真实 x」 next to CPI, unemployment and the house price (snap.realHint, set by app.js)
function applyRealHint(R, snap) {
  const h = snap && snap.realHint, ok = v => typeof v === 'number' && isFinite(v);
  const put = (n, v, f, lab = '真实 ') => { if (!n) return; const on = !!(h && ok(v)); n.textContent = on ? lab + f(v) : ''; if (on) n.removeAttribute('display'); else n.setAttribute('display', 'none'); };
  put(R.cpiReal, h && h.cpi, v => pct(v), '真实CPI ');
  put(R.unempReal, h && h.unemp, v => pct(v), '真实失业 ');
  put(R.pools.housing.real, h && h.house, v => String(Math.round(v)));
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
  if (p.k === 'valCapex') {      // a feedback line, not a money flow: what it does, and whether it is open here
    const s = valCapexState(snap);
    const why = s === 'on' ? '现在是开的（沙盒）：股价高 → 融资便宜 → 企业多投资（Capex），约 2–4 季。' : s === 'off' ? '这个国家的模型里没接：试过，几乎不改变结果。' : VALCAPEX_SHUT;
    return `<button type="button" class="fp-x" data-act="cp-close" aria-label="关闭">✕</button><div class="fp-kind">反馈线：不是钱在流，是股价在推投资</div>` +
      `<h4>股价 → Capex${s === 'on' ? '' : ' · 关'}</h4><div class="cp-note">${esc(why)}</div>` +
      (hasTerm('capex') ? `<div class="fp-btns"><button type="button" class="btn term-btn" data-term="capex">看「${esc(CONCEPTS.capex.name || 'Capex')}」的解释</button></div>` : '');
  }
  const v = f[p.k] ?? 0;
  const money = x => (town ? `${fmtMoney(x, true)} 万元` : fmtBn(x, iso));
  const signed = x => (x < 0 ? '−' : '') + money(Math.abs(x));
  const name = p.k === 'foreignBonds' && v < 0 ? '外国人卖国债' : p.label;
  const kind = { pump: '泵：在这里造出新水（蓝色 +）', drain: '排水口：水在这里被消掉（红色 −）', out: '出口：商品在这里被用掉；钱（水）没有消失，回到河的环（我花的 = 你赚的）',
    spring: '泉水：资产自己产生的现金流，只搬水' }[p.kind] || '管道：只把水从一处搬到另一处';
  const row = (k, val) => `<div class="cp-row"><span>${k}</span><b>${val}</b></div>`;
  let h = `<button type="button" class="fp-x" data-act="cp-close" aria-label="关闭">✕</button><div class="fp-kind">${esc(kind)}</div><h4>${esc(name)}</h4>`;
  h += row('占 GDP（按年算）', pctTxt(shareOf(v, snap), p.kind === 'out'));
  h += row('本季流量', signed(v)) + row('一年大约', signed(v * 4));
  const vs = valueStateOf(snap, pipeSrc(p.k));
  if (vs) h += `<div class="cp-note v-tag">${vs === 'none' ? '淡色：这一季没有数据（真实统计还没发布，或模型只算到 2025Q4）' : EST_TIP + '，这里显示的是模型的数'}</div>`;
  if (p.kind === 'out' && snap.outlets && !vs) {
    h += `<div class="cp-note">真实数据（${iso === 'AUS' ? 'ABS 5206.0' : 'BEA'}）：消费 + 投资 + 政府购买 + 净出口 = GDP${iso === 'AUS' ? '（另有不到 1% 的统计误差）' : ''}。</div>`;
  } else if (p.kind === 'out') {
    h += `<div class="cp-note">GDP = 四个出口拿走的货：消费 + 投资 + 政府购买 + 净出口。模型直接算总需求，所以这里的家庭消费 = GDP 减去另外三项` +
      `（包括借钱、房价上涨多花的部分）。比真实略高：美国真实约 68%。</div>`;
    if (p.k === 'outI') h += `<div class="cp-note">企业投资（Capex）过一两年变成更宽的河道（产能）。</div>`;
  }
  if (p.k === 'toConsumption') h += `<div class="cp-note">只是用新水（新贷款、财政赤字）多花的那一部分，不是全部家庭消费；全部消费看河道下面的「家庭消费」出口。</div>`;
  if (p.term && hasTerm(p.term)) h += `<div class="fp-btns"><button type="button" class="btn term-btn" data-term="${p.term}">看「${esc(CONCEPTS[p.term].name || name)}」的解释</button></div>`;
  return h;
}
const LOOP_HTML = `<button type="button" class="fp-x" data-act="cp-close" aria-label="关闭">✕</button><div class="fp-kind">河的环：「我花的 = 你赚的」</div>` +
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
    // phone: the 河 / 湖 / 地下 place switch
    const pl = tg && tg.closest('.flow-places [data-place]');
    if (pl) { e.preventDefault(); R.place = pl.dataset.place; R.cpop.hidden = true; closeValvePopover(); syncView(R); return; }
    // 「还有 n 层没显示」 hint = the 「显示全部」 button (app.js owns the toggle and the stored state)
    if (tg && tg.closest('.flow-lhint')) { e.preventDefault(); const t = document.getElementById('layers-toggle'); if (t) t.click(); return; }
    // phone place card: 「更多」 opens the rest of the card (the drawing gives up the height it needs)
    const fm = tg && tg.closest('.flow-place-card .fpc-more');
    if (fm) {
      e.preventDefault();
      const on = !R.placeCard.classList.contains('open'), l = R.placeCard.querySelector('.fpc-l');
      R.placeCard.classList.toggle('open', on); if (l) l.hidden = !on;
      fm.textContent = on ? '收起' : '更多'; fm.setAttribute('aria-expanded', String(on));
      return;
    }
    // desktop toolbar: 「说明」 drops the caption lines down over the drawing; a tap anywhere else closes them
    const ftm = tg && tg.closest('.flow-tools .ft-more');
    if (ftm) { e.preventDefault(); const on = !R.tools.classList.contains('open'); R.tools.classList.toggle('open', on); ftm.setAttribute('aria-expanded', String(on)); return; }
    if (R.tools.classList.contains('open') && !(tg && tg.closest('.flow-v3cap'))) { R.tools.classList.remove('open'); R.tools.querySelector('.ft-more').setAttribute('aria-expanded', 'false'); }
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
      if (p && (p.kind !== 'fb' || p.k === 'valCapex')) {      // 股价 → Capex: the tap says whether it is open (phones have no hover title)
        e.preventDefault(); e.stopPropagation();
        if (cpOpen !== p.k) openChipPop(host, p, chip);
        return;
      }
    }
    const lgb = e.target.closest && e.target.closest('[data-act="legend"]');
    if (lgb) { e.preventDefault(); toggleLegend(); return; }
    const fbm = e.target.closest && e.target.closest('.fb-mini, .fb-none');
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
    if (e.key === 'Escape') { closeValvePopover(); R.legend.hidden = true; closeBudget(); R.cpop.hidden = true; R.tools.classList.remove('open'); }
    if ((e.key === 'Enter' || e.key === ' ') && e.target.matches && e.target.matches('[data-bd="pill"]')) { e.preventDefault(); e.target.dispatchEvent(new MouseEvent('click', { bubbles: true })); }
    if (e.key === 'Escape' && R.bd) { R.bd.pop.hidden = true; R.bd.fxPop.hidden = true; }
    if ((e.key === 'Enter' || e.key === ' ') && e.target.matches && e.target.matches('.flow-svg [data-fxr-pipe]')) { e.preventDefault(); e.target.dispatchEvent(new MouseEvent('click', { bubbles: true })); }
    if ((e.key === 'Enter' || e.key === ' ') && e.target.matches && e.target.matches('.fb-mini, .fb-none')) { e.preventDefault(); e.target.click(); }
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
        if (s && !!s.R.wrap.classList.contains('placed') !== placeMode()) s.R.syncVB();      // a lesson starts / ends: whole picture <-> one place
      }).observe(document.body, { attributes: true, attributeFilter: ['data-vis', 'class', 'data-layers'] });
    } catch (e) { /* ignore */ }
  }
  if (!isTownSnap(snap)) st.zoomed = false;
  st.snap = snap; st.prev = prevSnap || null;
  const tgt = targets(snap, prevSnap, st);
  setTexts(st.R, snap, prevSnap, st);
  applyV3(st.R, snap);
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
