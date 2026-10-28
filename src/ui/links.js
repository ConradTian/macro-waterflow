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
const PIPE_ALIAS = { toFinancial: ['toEquity', 'toBond', 'toGold'] };
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
