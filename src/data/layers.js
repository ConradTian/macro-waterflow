// Progressive diagram (tools/COURSE-V3.md 「Progressive diagram」): each main-line lesson adds ONE layer to the water diagram.
// In simple mode and during a lesson the diagram shows only the layers learned so far (src/ui/progress.js + app.js write
// body.layers-on + body[data-layers="L-water L-channel ..."]); full mode (「更多」), 「显示全部」 and the town lessons show / own everything.
//
// Every diagram element (src/ui/flow.js tagLayers) gets data-layer = the FIRST layer that claims it, looked up in this order:
//   data-lk (a few elements with no other identity)  >  data-valve  >  data-pipe (pipe, its chip, its pump / drain icon)  >  data-node
//   >  data-part tokens (the earliest layer among the element's parts).
// A pipe always sits in a layer where both of its end parts are already visible (no dangling pipes; syncDangling still runs on top).
// extras = the non-diagram pieces that follow a layer: 'objective' (the 总目标 strip), 'lamps' (its 4 penalty lamps, src/ui/objective.js),
//   'dialShort' / 'dialLong' (src/ui/simple.js), 'map' (the 🌍 地图 button: dimmed until L-border).
export const LAYERS = [
  { id: 'L-water', name: '水从哪来、到哪去',
    // the main pump (放贷) with its owner box (the bank box + name; its approval number / valves come with L-short), the main drain (还本),
    // the 收入循环 loop, the 4 outlets = GDP, the 现金 tank, the household / firm boxes, the 本季水量 bar + legend row
    parts: ['household', 'firm', 'channel', 'cash', 'repay', 'budget'],
    pipes: ['newLoans', 'principalRepay', 'toCash', 'toConsumption', 'wages', 'profits', 'spillToGoods', 'outC', 'outI', 'outG', 'outNX'],
    nodes: ['bank'], keys: ['bankTitle'], valves: ['saveAdj'],
    extras: ['objective'] },
  { id: 'L-channel', name: '水的问题，还是河道的问题',
    // channel width (产能 brackets + number) / depth (the bank line, water over the bank), the 断面 cross-section inset, Capex
    parts: ['capex'], pipes: ['toCapex'], nodes: ['section'], keys: ['bankLine'], valves: ['capexMult'],
    extras: [] },
  { id: 'L-short', name: '一个会自己转的圈',
    // the bank's own readout + valves, 付息, the collateral loop and the house pool it reads, the central bank with its policy rate valve
    parts: ['bank', 'interest', 'poolHousing', 'centralBank'],
    pipes: ['interestPaid', 'collateral', 'toHousing'], nodes: ['approval', 'rate'], valves: ['policyRate', 'approval', 'lvrCap', 'borrowMult'],
    extras: ['dialShort'] },
  { id: 'L-long', name: '两个环怎么接上',
    parts: ['iou'],                                   // 欠条箱 + the dashed 放贷 → 欠条 link and its caption
    extras: ['dialLong'] },
  { id: 'L-gov', name: '政府接手和实际利率',
    // government (fiscal pump + its two branches, taxes, surplus drain, debt / gross outlays), QE / QT and the bond pool QE buys, 实际利率
    parts: ['government', 'poolBond'],
    pipes: ['qe', 'qt', 'fiscalInjection', 'govPurchases', 'transfers', 'taxes', 'govSurplusDrain', 'toBond'],
    nodes: ['realRate'], valves: ['qe', 'fiscalInjection'],
    extras: ['lamps'] },
  { id: 'L-border', name: '汇率和国境线',
    parts: ['border'], pipes: ['exports', 'imports', 'foreignBonds'],   // the border band (line, FX gate / reactor, USD index), phone: the 净出口 gate
    extras: ['map'] },
  { id: 'L-assets', name: '投资者',
    // the remaining pools, their 历史正常区间 bands + 贵 / 便宜 tags (all four pools), the springs, the 资产池 captions
    parts: ['pool', 'poolEquity', 'poolGold', 'springs'],
    pipes: ['toEquity', 'toGold', 'coupons', 'dividends', 'rent'], keys: ['band', 'poolStat'],
    extras: [] },
];
export const LAYER_IDS = LAYERS.map(l => l.id);

// main-line lesson -> the layer it adds (null = adds none: 「八个视角」 shows all the layers before it)
export const LESSON_LAYER = { m1: 'L-water', shk: 'L-channel', m2: 'L-short', m3: 'L-long', m4: 'L-gov', fx: 'L-border', m5: null, inv: 'L-assets' };
// course order (L1..L8): a lesson without a layer shows the layers of the lessons before it
export const LESSON_ORDER = ['m1', 'shk', 'm2', 'm3', 'm4', 'fx', 'm5', 'inv'];

/** index into LAYERS of the deepest layer a main-line lesson shows, or -1 for any other lesson (legacy, role, world ...). */
export function lessonDepth(id) {
  const k = LESSON_ORDER.indexOf(String(id));
  if (k < 0) return -1;
  for (let j = k; j >= 0; j--) { const l = LESSON_LAYER[LESSON_ORDER[j]]; if (l) return LAYER_IDS.indexOf(l); }
  return 0;
}
/** the layers 0..depth as an array of ids */
export const layersUpTo = depth => LAYER_IDS.slice(0, Math.max(0, depth) + 1);

/** element -> layer id resolver input: one lookup table per kind (first layer wins) */
export const LAYER_OF = (() => {
  const T = { keys: {}, valves: {}, pipes: {}, nodes: {}, parts: {} };
  for (const L of LAYERS) for (const k of Object.keys(T)) for (const x of L[k] || []) if (!(x in T[k])) T[k][x] = L.id;
  return T;
})();
