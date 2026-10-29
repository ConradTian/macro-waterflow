// Links between panels and the water diagram, plus the small "role learned" store.
// Diagram elements carry data-part="<part ids>" (groups/rects/texts) and data-pipe="<flow key>" (pipe + chip).
// Part ids: bank pool repay household firm channel cash centralBank government capex interest
//   v2 additions: poolHousing poolEquity poolBond poolGold (pool = group of the 4), budget (水量平衡条 + legend), iou (欠条箱), springs, valves
// Pipe keys: newLoans principalRepay interestPaid qe fiscalInjection taxes toHousing toEquity toBond toGold toCash toConsumption wages profits
//   toCapex spillToGoods rent dividends coupons qt govSurplusDrain collateral   ('toFinancial' is an alias of toEquity+toBond+toGold)
// Tab ids (only used for lesson unlocking): ledger cycle assets takeover

/* ---------- mapping: who/what moves which pipes ---------- */
// target = { parts:[part ids], pipes:[flow keys] }
export const PLAYER_LINKS = {
  bank:        { parts: ['bank'],                 pipes: ['newLoans', 'collateral'] },       // lending pump + the collateral feedback loop
  household:   { parts: ['household'],            pipes: ['newLoans', 'principalRepay', 'toHousing'] },
  centralBank: { parts: ['centralBank'],          pipes: ['interestPaid'] },
  government:  { parts: ['government'],           pipes: ['fiscalInjection', 'taxes'] },
  firm:        { parts: ['firm', 'capex'],        pipes: ['toCapex'] },
  investor:    { parts: ['pool'],                 pipes: ['toHousing', 'toEquity', 'toBond', 'toGold', 'toCash'] },   // the 4 inflow pipes (+ cash)
  foreign:     { parts: ['channel'],              pipes: ['spillToGoods'] },
};
// optional refinements by rule/action text for one player (first match wins; replaces the player mapping)
const RULE_LINKS = [
  ['centralBank', /QE|购债/,                { parts: ['centralBank', 'poolBond'], pipes: ['qe', 'toBond'] }],
  ['centralBank', /QT|缩表/,                { parts: ['centralBank'], pipes: ['qt'] }],
  ['centralBank', /政策利率|加息|降息|泰勒/,  { parts: ['centralBank'], pipes: ['interestPaid', 'newLoans'] }],
  ['government',  /注资/,                   { parts: ['government', 'bank'], pipes: ['fiscalInjection'] }],
  ['bank',        /LVR|抵押|房价/,           { parts: ['bank', 'poolHousing'], pipes: ['collateral', 'newLoans'] }],
  ['bank',        /审批|信贷/,               { parts: ['bank'], pipes: ['newLoans'] }],
  ['government',  /盈余|紧缩/,               { parts: ['government'], pipes: ['govSurplusDrain', 'taxes'] }],
  ['investor',    /黄金|避险/,               { parts: ['poolGold', 'poolBond'], pipes: ['toGold', 'toBond'] }],
  ['firm',        /Capex|产能/,             { parts: ['capex', 'firm'], pipes: ['toCapex'] }],
];
export const LAMP_LINKS = {
  credit:      { parts: [],              pipes: ['newLoans', 'principalRepay'] },
  debtService: { parts: ['household'],   pipes: ['interestPaid', 'principalRepay'] },
  policy:      { parts: ['centralBank'], pipes: [] },
  valuation:   { parts: ['pool'],        pipes: ['toHousing', 'toEquity', 'toBond', 'toGold'] },
};
export function linksForEntry(e) {
  const txt = `${e.rule || ''} ${e.action || ''}`;
  for (const [pl, re, t] of RULE_LINKS) if (pl === e.player && re.test(txt)) return t;
  return PLAYER_LINKS[e.player] || { parts: [], pipes: [] };
}

/* ---------- flash highlight in the diagram ---------- */
const PIPE_ALIAS = { toFinancial: ['toEquity', 'toBond', 'toGold'], fiscalInjection: ['fiscalInjection', 'govPurchases', 'transfers'] };   // the fiscal trunk and its two branches light up together
let timer = 0, lit = [], endCb = null;
export function clearFlash() {
  clearTimeout(timer);
  lit.forEach(n => n.classList.remove('lk-hl'));
  lit = [];
  if (endCb) { const f = endCb; endCb = null; f(); }
}
export function flash(target, ms = 3000, onEnd) {
  clearFlash();
  const host = document.getElementById('diagram');
  if (!host || !target) return;
  const set = new Set();
  for (const p of target.parts || []) host.querySelectorAll(`[data-part~="${p}"]`).forEach(n => set.add(n));
  for (const k0 of target.pipes || []) for (const k of (PIPE_ALIAS[k0] || [k0])) host.querySelectorAll(`[data-pipe="${k}"]`).forEach(n => set.add(n));
  lit = [...set];
  lit.forEach(n => n.classList.add('lk-hl'));
  endCb = onEnd || null;
  timer = setTimeout(clearFlash, ms);
}

/* ---------- role lessons: availability + "已学" ---------- */
export const ROLE_ORDER = ['centralBank', 'bank', 'household', 'firm', 'government', 'investor', 'foreign'];
export const ROLE_NAME = { centralBank: '央行', bank: '银行', household: '家庭', firm: '企业', government: '政府', investor: '投资者', foreign: '外国' };
const RKEY = 'mw.roles.v1';
let available = new Set();
export function setAvailableRoles(list) { available = new Set(list); }
export const roleHasLesson = role => available.has(role);
export function isRoleLearned(role) {
  try { return !!(JSON.parse(localStorage.getItem(RKEY)) || {})[role]; } catch (e) { return false; }
}
export function markRoleLearned(role) {
  try { const o = JSON.parse(localStorage.getItem(RKEY)) || {}; o[role] = true; localStorage.setItem(RKEY, JSON.stringify(o)); } catch (e) { /* ignore */ }
}
// ask the app to start a role lesson (handled in app.js)
export function requestRoleLesson(role) { document.dispatchEvent(new CustomEvent('mw:lesson', { detail: { role } })); }

/* ---------- concept card -> diagram: "what does this card belong to?" ---------- */
// While a concept card is open the diagram marks three sets of parts (src/ui/concepts.js calls showConcept):
//   SELF  = the card's own part(s)          (solid, strong glow)
//   FROM  = parts of the card's `from` ids   (dashed, cyan)      -- 受谁影响
//   TO    = parts of the card's `to` ids     (dotted, amber)     -- 影响谁
// Target spec strings:  't:<term>' [data-term]   'p:<pipe key>' pipe + chip + pump/drain icon   'n:<node>' [data-node]
//                       'v:<valve id>' valve icon   'css:<selector>' raw selector inside #diagram
// Derived automatically for every concept id:  t:<id>  p:<id>  v:<id>  (whatever the diagram carries under that name).
// CONCEPT_TARGETS adds extras (`self`) and, for concepts with NO own element, `note` = where it shows up
// (rendered on the card as 图上没有单独的部件，它体现在 ××).
import { CONCEPTS } from '../data/concepts.js';
import { EXTRA_NODES } from '../data/causal.js';

const POOLS4 = ['n:poolBond', 'n:poolEquity', 'n:poolHousing', 'n:poolGold'];
export const CONCEPT_TARGETS = {
  // rates & money
  realRate:        { self: ['t:policyRate', 't:cpi'], note: '央行的「政策利率」减去商品河道里的「CPI」' },
  mortgageEff:     { self: ['p:interestPaid'], note: '「付息」管道（存量房贷利率越高，付得越多）' },
  M:               { self: ['n:iou'] },
  // credit flows
  principalRepay:  { self: ['n:drain'] },
  creditImpulse:   { self: ['p:newLoans', 'p:principalRepay'], note: '「放贷」与「还本」两根管道的差' },
  assetReservoir:  { self: POOLS4 },
  goodsChannel:    { self: ['n:channel'] },
  fiscalInjection: { self: ['n:govGross', 'v:fiscalInjection'] },        // the pump + trunk (t:/p: auto); the two branches show as 去向
  govPurchases:    { self: ['p:govPurchases'] },
  transfers:       { self: ['p:transfers'] },
  // bank
  bankApproval:    { self: ['v:approval'] },
  bankCapital:     { self: ['n:bank'], note: '银行方块（资本厚度没有单独画出）' },
  badLoans:        { self: ['n:bank', 'p:collateral'], note: '银行方块，以及房价→银行的「抵押品」回路' },
  // household
  income:          { self: ['n:household', 'p:wages'], note: '家庭方块和「工资」管道' },
  hhDebt:          { self: ['n:iou'], note: '「欠条箱」（家庭和企业欠银行的总账）' },
  pvtDebtGdp:      { self: ['n:iou'], note: '欠条箱（占 GDP 的读数）' },
  govDebtGdp:      { self: ['n:gov'], note: '政府方块里的「债务/GDP」' },
  dsr:             { self: ['n:household'], note: '家庭方块里的「DSR」' },
  lvr:             { self: ['p:collateral', 'v:lvrCap'] },
  // firm / macro
  capacity:        { self: ['css:.capmark', 'p:toCapex'] },
  capex:           { self: ['p:toCapex', 'v:capexMult', 'n:firm'] },
  outputGap:       { self: ['n:channel'], note: '商品河道的水位（相对河道宽度）' },
  cpi:             { self: ['n:channel'] },
  inflationExp:    { self: ['t:cpi'], note: '商品河道里的「CPI」（预期本身没有单独画出）' },
  cf:              { self: ['n:firm', 'p:profits'], note: '企业方块和「利润」管道' },
  // asset pricing
  discountRate:    { self: ['css:.seesaw', 't:policyRate'], note: '国债池的跷跷板（利率↑价格↓）和央行「政策利率」' },
  riskPremium:     { self: ['n:poolEquity', 'n:poolHousing'], note: '股票池、房产池的水位（风险溢价高，水位被压低）' },
  gMinusR:         { self: ['n:gov'], note: '政府方块里的「债务/GDP」' },
  interestToTax:   { self: ['n:gov', 'p:taxes'], note: '政府方块和「税收」管道' },
  housePrice:      { self: ['n:poolHousing'] },
  priceToIncome:   { self: ['n:poolHousing', 'n:household'], note: '房产池水位对比家庭方块' },
  rentYield:       { self: ['p:rent'], note: '房产池底下的「租金」泉水' },
  // four lamps
  lampCredit:      { self: ['p:newLoans', 'p:principalRepay'], note: '「放贷」与「还本」两根管道' },
  lampDebtService: { self: ['n:household', 'p:interestPaid', 'p:principalRepay'], note: '家庭方块的 DSR，加上「付息」「还本」管道' },
  lampPolicy:      { self: ['t:policyRate', 'v:policyRate'], note: '央行的「政策利率」' },
  lampValuation:   { self: ['n:poolEquity', 'n:poolHousing'], note: '股票池、房产池的水位' },
  // cycles: nothing in the diagram -> note only
  ringStage:       { self: [], note: '「周期」标签页里的债务环' },
  longCycle:       { self: [], note: '「周期」标签页里的大周期表盘（② 之后分岔 B1 / B2）' },
  shortCycle:      { self: [], note: '「周期」标签页里的小周期表盘（扩张→过热→收紧·衰退→降息）' },
  B1:              { self: ['p:spillToGoods', 'n:channel', 't:policyRate'], note: '商品河道溢出（「溢出」管道）和央行加息（水漫出河道变成物价）' },
  B2:              { self: ['n:poolHousing', 'p:collateral'], note: '房产池水位下降和「抵押品」回路（水位降了，欠条还在）' },
  // five assets
  cashAsset:       { self: ['n:cash'] },
  bondAsset:       { self: ['n:poolBond'] },
  equityAsset:     { self: ['n:poolEquity'] },
  goldAsset:       { self: ['n:poolGold'] },
};

const diagramHost = () => document.getElementById('diagram');
export const conceptSpecs = id => [`t:${id}`, `p:${id}`, `v:${id}`, ...((CONCEPT_TARGETS[id] || {}).self || [])];
/** Specs of any causal-map node: a concept card (conceptSpecs) or an extra node of src/data/causal.js (its own `specs`). */
export const nodeSpecs = id => (EXTRA_NODES[id] ? EXTRA_NODES[id].specs.slice() : conceptSpecs(id));

function resolveSpec(host, spec) {
  const i = spec.indexOf(':'), k = spec.slice(0, i), v = spec.slice(i + 1);
  let q = '';
  if (k === 't') q = `[data-term="${v}"]`;
  else if (k === 'p') q = `[data-pipe="${v}"]`;
  else if (k === 'n') q = `[data-node="${v}"]`;
  else if (k === 'v') q = `.valve[data-valve="${v}"]`;
  else if (k === 'css') q = v;
  if (!q) return [];
  let out;
  try { out = [...host.querySelectorAll(q)]; } catch (e) { return []; }
  if (k === 'n' && v === 'household') host.querySelectorAll('rect.node.cover').forEach(n => out.push(n));   // the cover rect hides half of the box stroke
  return out;
}
const resolveMany = (host, specs) => { const s = new Set(); for (const sp of specs) for (const n of resolveSpec(host, sp)) s.add(n); return s; };

/** The diagram elements (SVG + HTML) a causal-map node lights up: [] when the node has no part in the diagram. */
export function nodeElements(id) {
  const host = diagramHost();
  return host ? [...resolveMany(host, nodeSpecs(id))] : [];
}

/** '' when the concept has its own element in the diagram (same data-term / pipe key / valve id); else the "体现在 ××" text. */
export function conceptNote(id) {
  const host = diagramHost(), t = CONCEPT_TARGETS[id];
  if (!t || !t.note || !host) return '';
  return resolveMany(host, [`t:${id}`, `p:${id}`, `v:${id}`]).size ? '' : t.note;
}

const ROLES = ['self', 'from', 'to'];
let cstate = null, flashEls = new Set(), flashTimer = 0, obs = null, raf = 0;

function addHalo(n) {                       // pipes: an extra wide path under the animated dashes (dash pattern differs per role)
  if (n.tagName.toLowerCase() !== 'g') return;
  const bed = n.querySelector(':scope > .bed');
  if (!bed || n.querySelector(':scope > .cc-halo')) return;
  const h = document.createElementNS('http://www.w3.org/2000/svg', 'path');
  h.setAttribute('class', 'cc-halo');
  h.setAttribute('d', bed.getAttribute('d'));
  n.insertBefore(h, n.firstChild);
}
function paint() {
  raf = 0;
  const host = diagramHost();
  if (!host) return;
  const want = new Map();
  if (cstate) {
    for (const role of ROLES) for (const n of resolveMany(host, cstate[role])) { const r = want.get(n) || {}; r[role] = true; want.set(n, r); }
    for (const r of want.values()) if (r.self) { r.from = false; r.to = false; }
  }
  host.querySelectorAll('.cc-hl').forEach(n => {
    if (want.has(n)) return;
    n.classList.remove('cc-hl', 'cc-self', 'cc-from', 'cc-to', 'cc-flash');
  });
  for (const [n, r] of want) {            // only touch the DOM when something changed (the observer below must not loop)
    if (!n.classList.contains('cc-hl')) { n.classList.add('cc-hl'); addHalo(n); }
    for (const role of ROLES) {
      const on = !!r[role], has = n.classList.contains('cc-' + role);
      if (on && !has) n.classList.add('cc-' + role); else if (!on && has) n.classList.remove('cc-' + role);
    }
    const fl = flashEls.has(n), hasF = n.classList.contains('cc-flash');
    if (fl && !hasF) n.classList.add('cc-flash'); else if (!fl && hasF) n.classList.remove('cc-flash');
  }
}
const schedule = () => { if (!raf) raf = requestAnimationFrame(paint); };
function ensureObserver() {
  const host = diagramHost();
  if (obs || !host) return;
  // renderFlow rewrites texts / the budget bar every quarter (that wipes the bar's classes): re-apply after each render
  try { obs = new MutationObserver(schedule); obs.observe(host, { childList: true, subtree: true }); } catch (e) { obs = null; }
}

/** Mark SELF / FROM / TO for a concept card. Returns how many diagram elements each set has (0 = nothing to see).
 *  chain = optional { from: [node ids], to: [node ids] } (causal-map nodes, extra nodes allowed): replaces the card's own from/to lists
 *  (the 传导链 block marks the whole main route instead of the direct neighbours). Without it the old behaviour stays. */
export function showConcept(id, chain) {
  const c = CONCEPTS[id];
  if (!c) { clearConcept(); return { self: 0, from: 0, to: 0 }; }
  clearTimeout(flashTimer); flashEls = new Set();
  const fromIds = chain && Array.isArray(chain.from) ? chain.from : (c.from || []);
  const toIds = chain && Array.isArray(chain.to) ? chain.to : (c.to || []);
  cstate = { id, self: conceptSpecs(id), from: fromIds.flatMap(nodeSpecs), to: toIds.flatMap(nodeSpecs) };
  ensureObserver();
  paint();
  const host = diagramHost(), n = { self: 0, from: 0, to: 0 };
  if (host) {
    const s = resolveMany(host, cstate.self);
    n.self = s.size;
    n.from = [...resolveMany(host, cstate.from)].filter(x => !s.has(x)).length;
    n.to = [...resolveMany(host, cstate.to)].filter(x => !s.has(x)).length;
  }
  return n;
}
export function clearConcept() {
  cstate = null;
  clearTimeout(flashTimer); flashEls = new Set();
  paint();
}
/** Briefly pulse just one concept's parts (a from/to link inside the card). Returns how many elements it lights. */
export function flashConcept(id, ms = 1400) {
  const host = diagramHost();
  clearTimeout(flashTimer);
  flashEls = host && (CONCEPTS[id] || EXTRA_NODES[id]) ? resolveMany(host, nodeSpecs(id)) : new Set();
  paint();
  if (flashEls.size) flashTimer = setTimeout(unflashConcept, ms);
  return flashEls.size;
}
export function unflashConcept() {
  clearTimeout(flashTimer);
  if (!flashEls.size) return;
  flashEls = new Set();
  paint();
}
