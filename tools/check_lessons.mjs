// node tools/check_lessons.mjs [--verbose] [--text]
// Validates the US CYCLE lessons 1-7 (src/data/lessons.js) against the engine, with the same code the UI runs (src/ui/lessons-town.js):
//  1. structure   every id (concept, term, part, pipe, rule + param, tab, block, date, next) exists; intro 'N 步' = real step count; ends with a chain
//  2. templates   every {placeholder} is filled from a scratch run (no '—', NaN, undefined, leftover braces), for every choice of every experiment
//  3. predicts    exactly one option is ok, its `when` claim holds on the engine, the other options' claims do not
//  4. claims      each step's `claims` (the factual sentences of the text) hold on the engine; experiment claims compare counterfactual runs
// --text prints every filled text (to proofread the numbers). Exit code 1 on any FAIL.
// Lessons 0 and the role lessons are checked by tools/check_role_lessons.mjs.
// WORLD lessons (kind:'world', 'w1'...): same checks, plus
//  5. world getters  'world:<path>@<year>' must resolve on WORLD (src/data/world.js; --world=<file> checks against another file)
//  6. map steps      map:{open, select?, year?}: select is a country id of WORLD, year is in WORLD.years
//  7. no typed numbers: a world text may only contain years, step/lesson numbers and '1 美元'; every other number comes from vals
//  8. draft lessons (draft:true) are only checked structurally and must stay unavailable until COUNTRY_READY
// COUNTRY lessons (country:'AUS', e.g. w2): every scratch run uses that country's data and sim (createSim({ data, mode, country }));
//  the lesson may only be available when COUNTRY_READY[country]; getters 'real:<agg>:<series>' read the country's REAL quarterly series
//  (data.series); a step's wavesNow:{iso,has} is checked against the country's NOW label in src/data/waves.js
// MAIN LINE (kind:'main', m1..m5, menu order = COURSE.main of src/data/lessons.js): the same checks as the cycle lessons, plus
//  9. outline     the intro's '下面分 N 步：A → B → ...' lists exactly N items (arrows, no circled numbers: those are the long-cycle stages)
// 10. town steps  (m1 starts in the 万元 town, then zooms to the US): townClaims [{ at:'before'|'after', get, minus?:'before', gt|gte|lt|lte }] are
//                 checked on a town replay with the SAME code as the UI (replayTown + the tap); the US steps after the zoom run the usual checks
// 11. mark / roleCard / roleCards ids exist (m5: 1-2 cards per step, at most 6 steps); ledgerAt [{ player, ruleId, date? }] = that quarter's ledger has the entry
// 12. course v3 (tools/COURSE-V3.md): COURSE.parts = 4 parts, COURSE.main = m1 shk m2 m3 m4 fx m5 inv now; each hands over to the next (last
//                step `next`), inv shows the 盲测 links and hands over to now (L9 现在在哪, the end of the line); labels 第 1–9 课; COURSE lists every lesson / role lesson exactly once (the rest under 旧版)
// BIG LESSONS (kind:'fx' 汇率, kind:'capstone' 投资者; src/data/lesson-fx.js, lesson-investor.js): their numbers, facts and claims are verified by
//  tools/check_lesson_fx.mjs / check_lesson_investor.mjs, so the per-step checks above (incl. the world rule 7 "no typed numbers") skip them.
//  Checked here: 13. place in the course  handovers; country / panel ids (incl. drill-down panels) / panel hosts
// SHOCKS (kind:'shocks' 冲击 shk, src/data/lesson-shocks.js; numbers checked by tools/check_lesson_shocks.mjs): its sim step (Capex, the only
//  step with vals / claims) gets the full per-step checks here (templates, claims); the panel steps only the structural ones.
// 14. 三问 ending  the last step of each of the 9 lessons has ending { q1, q2, q3 }, each starting with its fixed question; the {placeholders}
//                of the main lessons are declared vals and fill without gaps
// 15. drills     step.drills [{ label, panel, text, nums, facts }] of the main lessons (m5 外国人 -> the AUS FX reactor): panel ids exist, every
//                number typed in a drill text is listed in nums and recomputes from the repo's quarterly data / the FX reactor (D.q, D.fxr)
// 16. 吸力 (2026-10-30, 「开阀看 ▽，结账看 ▼」): L3 m2 carries the core of 「专题：预期」 on the exp panels (src/ui/exp-gauge.js): its panel ids
//                exist in the panel module, every at: val of a panel step equals the panel's own engine replay (same quarter, same path), derive
//                (▶ − ▽ ...) and expVals (five order / blue / loop dates: expGet of src/data/lessons.js) fill, the replay = createSim, the old
//                「预期藏在吸力里」 line is gone; L5 m4 / L7 m5 name ▶ − ▼ 到手实际利率 (no 「吸力（实际利率）」 left in the main line)
// 17. B1 story  L4 m3 「另一条岔路 B1」: src/data/b1-story.js is recomputed from the FRED CSVs (data_src/real/fred), the step's b1Facts hold, the
//                text says 故事读法 and links to the rope step of ?lesson=exp (lessonLink.step = the exp-rope panel step)
// Claims may test strings: eq:'red' / ne:'green' (getters 'lamp.<id>', 'lamps.lit', 'out.C', 'gdp.<flow>', '<a>/<b>': see src/ui/lessons-town.js).
// Concept cards that another agent is still writing (PENDING_CONCEPTS) are reported as WARN while missing; once a card exists it is checked like any other.
import { readFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';
import { resolve } from 'node:path';
import { US_Q } from '../src/data/us-quarterly.js';
import { WAVES } from '../src/data/waves.js';
import { LESSONS, COURSE, expGet, b1, B1_WAVES } from '../src/data/lessons.js';
import * as G from '../src/ui/exp-gauge.js';
import { LESSON_EXP } from '../src/data/lesson-exp.js';
import { B1_STORY } from '../src/data/b1-story.js';
import { ROLE_CARD_ORDER, ROLE_META } from '../src/data/role-cards.js';
import { ROLE_LESSONS } from '../src/data/role-lessons.js';
import { CONCEPTS } from '../src/data/concepts.js';
import { RULE_BY_ID } from '../src/engine/rules.js';
import { createSim } from '../src/engine/sim.js';
import { headlineItems } from '../src/ui/headline.js';
import { lessonPositions, buildTable, fillStep, evalGet, scratchRun, dateT, fmtV, aggregate, arr, setWorldData, evalWorld, replayTown, applyAll, tapEffects, getPath } from '../src/ui/lessons-town.js';
import { computeFxReactor } from '../src/ui/fx-reactor.js';
const END_Q = ['水的问题还是河道的问题？', '环上哪一步？', '谁赢谁输、钱放哪？'];   // the fixed 三问 (src/ui/lessons.js END_QUESTIONS)

const worldArg = (process.argv.find(a => a.startsWith('--world=')) || '').slice(8);
let WORLD = null, COUNTRY_READY = {}, COUNTRY_DATA = {};
const DATA = { USA: US_Q };   // quarterly data per country (a lesson with country:'AUS' runs on AUS_Q)
try { WORLD = (await import(worldArg ? pathToFileURL(resolve(worldArg)).href : '../src/data/world.js')).WORLD; } catch (e) { console.log('  (no world data: ' + e.message.split('\n')[0] + ')'); }
try { const ci = await import('../src/data/countries/index.js'); COUNTRY_READY = ci.COUNTRY_READY || {}; COUNTRY_DATA = ci.COUNTRY_DATA || {}; } catch (e) { /* no country views yet */ }
for (const l of LESSONS) if (l.country && l.country !== 'USA' && !DATA[l.country] && COUNTRY_DATA[l.country]) DATA[l.country] = await COUNTRY_DATA[l.country]();
setWorldData(WORLD);
const PENDING_CONCEPTS = ['exports', 'imports', 'fx', 'foreignBonds', 'reserveCurrency'];   // border cards, written by the border-UI agent
const BORDER_TERMS = ['exports', 'imports', 'fx', 'foreignBonds', 'reserveCurrency'];       // data-term ids of the border block in the diagram
const pendingSeen = new Set();

const verbose = process.argv.includes('--verbose'), showText = process.argv.includes('--text');
let fails = 0, warns = 0;
const ok = (c, m) => { if (!c) { fails++; console.log('  FAIL:', m); } else if (verbose) console.log('  ok:  ', m); };
const warn = (c, m) => { if (!c) { warns++; console.log('  WARN:', m); } };

const flowSrc = readFileSync(new URL('../src/ui/flow.js', import.meta.url), 'utf8');
const PIPES = [...flowSrc.matchAll(/\{ k: '(\w+)',\s+part:/g)].map(m => m[1]);
const PARTS = ['bank', 'pool', 'repay', 'household', 'firm', 'channel', 'cash', 'centralBank', 'government', 'capex', 'interest', 'poolHousing', 'poolEquity', 'poolBond', 'poolGold', 'iou', 'springs', 'valves', 'budget', 'ledger', 'cycle', 'assets', 'takeover',
  // DESIGN v3 PART-ID CONTRACT Rule 2: the new picture pieces (drawn by src/ui/flow.js; a missing one simply does not glow)
  'weir', 'ring', 'groundwater', 'liftLine', 'suction', 'deepPump', 'springWire', 'gate'];
const FLOW_TERMS = ['realRate', 'policyRate', 'bankApproval', 'newLoans', 'interestPaid', 'principalRepay', 'assetReservoir', 'goodsChannel', 'cpi', 'capacity', 'capex', 'qe', 'fiscalInjection', ...BORDER_TERMS];
const TABS = ['ledger', 'cycle', 'assets', 'takeover'];
const TYPES = ['intro', 'watch', 'predict', 'reveal', 'experiment', 'chain', 'recap'];
const MAIN_TYPES = [...TYPES, 'action', 'zoom'];      // m1: two town action steps, then the zoom to the US
const MARKS = ['loop', 'outlets', 'objective'];       // step field mark (src/ui/lessons.js MARKS)
const BLOCKS = ['alloc', 'budget', 'sources', 'b2cases', 'b1story'];
// the step's live table as the UI builds it (src/ui/lessons.js continueEnter): vals, then derive (raw[a] − raw[b]), then expVals (exp panels)
function fullTable(D, L, st, win, you) {
  const tbl = buildTable(D, L, st, win, you);
  for (const d of arr(st.derive)) { const a = tbl.raw[d.a], b = tbl.raw[d.b]; tbl.raw[d.key] = typeof a === 'number' && typeof b === 'number' ? a - b : null; tbl.fmt[d.key] = d.fmt; }
  for (const x of arr(st.expVals)) { tbl.raw[x.key] = expGet(G, x.get); tbl.fmt[x.key] = x.fmt || 'str'; }
  return tbl;
}
const FMTS = ['lamp', 'pct', 'pct0', 'pct2', 'pp', 'chg', 'chg1', 'x2', 'idx', 'n1', 'n2', 'n3', 'rate', 'tn', 'bn', 'aud', 'ppa', 'apct0', 'apct1', 'num', 'str'];
const AGGS = ['end', 'first', 'start', 'max', 'min', 'sum', 'avg', 'chg', 'dpp', 'dd', 'argmax', 'argmin', 'when', 'at', 'count', 'qcount'];
const CYC = LESSONS.filter(l => l.id >= 1 || l.kind === 'cycle');
const MAIN = LESSONS.filter(l => l.kind === 'main');                     // 主线 m1..m5          // numeric ids 1..7 plus half-step cycle lessons ('3b')
const ROUTINE = LESSONS.filter(l => l.kind === 'routine');   // 第 0.5 课 怎么看一个季度: same checks as the cycle lessons, plus the 本季看点 strip texts
const WORLDL = LESSONS.filter(l => l.kind === 'world');                  // 世界 1, 世界 2 ...
const BIG = LESSONS.filter(l => l.kind === 'fx' || l.kind === 'capstone');   // 汇率, 投资者: own checkers (not in the loop below)
const SHK = LESSONS.filter(l => l.kind === 'shocks');                         // 冲击: in the loop, only its sim step gets the full checks
const specWorldOk = g => typeof g === 'string' && /^world:[\w.]+@(\d{4}|last)(>\d{4})?$/.test(g);
const specRealOk = (g, D) => typeof g === 'string' && g.startsWith('real:') && AGGS.includes(g.split(':')[1]) && !!(D && D.series && Array.isArray(D.series[g.split(':').pop()]));
const isoOk = c => !!(WORLD && WORLD.countries && WORLD.countries[c]);
// a world text may only carry years, step/lesson numbers and '1 美元'; every other number must be a {placeholder}
const typedNumbers = t => String(t).replace(/\{[^}]*\}/g, '').replace(/第 ?[\d.]+ ?[课步]|下面分 \d+ 步|世界 ?\d|1 美元|\bB[12]\b|\b(19|20)\d\d\b/g, '').match(/\d+/g);
const stripSim = createSim({ data: US_Q, mode: 'history' });
const stripAt = date => { const t = US_Q.dates.indexOf(date); while (stripSim.t < t && !stripSim.done) stripSim.step(); return headlineItems(stripSim.snapshot('model', t), null, stripSim).map(i => i.text); };
const lessonIds = new Set([...LESSONS.map(l => String(l.id)), ...ROLE_LESSONS.map(l => String(l.id))]);

const specOk = (s, D) => typeof s === 'string' && (AGGS.includes(s.split(':')[0]) || specWorldOk(s) || specRealOk(s, D));
function checkSet(set, w) {
  for (const [id, on] of Object.entries((set && set.rules) || {})) { ok(RULE_BY_ID[id] && typeof on === 'boolean', w + 'set rule ' + id); }
  for (const [k, v] of Object.entries((set && set.params) || {})) { const [r, p] = k.split('.'); ok(RULE_BY_ID[r] && p in RULE_BY_ID[r].params && typeof v === 'number', w + 'set param ' + k); }
}

// ---- one condition: get - mul*vs  against gt/gte/lt/lte (numbers), or a date test
function evalCond(L, c, win) {
  const D = DATA[L.country || 'USA'];
  const g = { get: c.get, set: c.set, from: c.from, until: c.until };
  const a = evalGet(D, L, g, win);
  if (c.dateBetween || c.dateBefore) {
    if (typeof a !== 'string') return { pass: false, msg: `${c.get} gave ${a}` };
    if (c.dateBetween) { const pass = dateT(a) >= dateT(c.dateBetween[0]) && dateT(a) <= dateT(c.dateBetween[1]); return { pass, msg: `${a} in [${c.dateBetween}]` }; }
    const b = evalGet(D, L, { ...g, get: c.dateBefore }, win);
    return { pass: typeof b === 'string' && dateT(a) < dateT(b), msg: `${a} before ${b}` };
  }
  if (c.eq !== undefined || c.ne !== undefined) {
    const pass = c.eq !== undefined ? String(a) === String(c.eq) : String(a) !== String(c.ne);
    return { pass, msg: `${c.get} = ${a} vs ${c.eq !== undefined ? 'eq ' + c.eq : 'ne ' + c.ne}` };
  }
  let b = 0, bs = '';
  if (c.vs) {
    const vg = { get: c.vs.get || c.get, set: c.vs.set !== undefined ? c.vs.set : c.set, from: c.vs.from || c.from, until: c.vs.until || c.until };
    b = evalGet(D, L, vg, win); bs = ` - ${(c.mul ?? 1)}*${typeof b === 'number' ? b.toFixed(4) : b}`;
  }
  if (typeof a !== 'number' || typeof b !== 'number') return { pass: false, msg: `not numeric: ${a} ${b}` };
  const d = a - (c.mul ?? 1) * b;
  const tests = [['gt', d > c.gt], ['gte', d >= c.gte], ['lt', d < c.lt], ['lte', d <= c.lte]].filter(([k]) => c[k] !== undefined);
  return { pass: tests.length > 0 && tests.every(t => t[1]), msg: `${c.get}${c.set ? ' ' + JSON.stringify(c.set) : ''}${bs} = ${d.toFixed(4)} vs ${tests.map(t => t[0] + ' ' + c[t[0]]).join(', ')}` };
}
const condName = c => c.note || c.get;
const stepRoles = st => arr(st.roleCards || st.roleCard);   // step field roleCard:'bank' or roleCards:['investor','foreign'] (src/ui/lessons.js stepRoles)

const mkTown = L => createSim({ scenario: 'town', delays: !!L.delays });
for (const L of [...ROUTINE, ...MAIN, ...SHK, ...CYC, ...WORLDL]) {
  const isW = L.kind === 'world', draft = !!L.draft, isM = L.kind === 'main', isS = L.kind === 'shocks';
  const D = DATA[L.country || 'USA'];
  console.log(`\n=== lesson ${L.id} (${L.title})${draft ? ' [draft: structure only]' : ''} ===`);
  const pos = lessonPositions(L);
  const w0 = `L${L.id} `;
  ok(draft ? L.available === false : L.available === true, w0 + (draft ? 'draft stays unavailable' : 'available'));
  ok(L.rulesOn === 'all', w0 + 'rulesOn all');
  ok(L.scenario !== 'town' || (isM && L.steps.some(s => s.type === 'zoom')), w0 + 'no town scenario (a main lesson may start in the town and zoom to the US)');
  ok(!!D, w0 + 'quarterly data for ' + (L.country || 'USA') + ' loads');
  if (!D) continue;
  ok(D.dates.includes(L.startDate) || L.mode === 'free' || (L.scenario === 'town' && D.dates.includes((L.steps.find(s => s.type === 'zoom') || {}).date)), w0 + 'startDate (or the zoom date)');
  ok(L.steps[0].type === 'intro', w0 + 'intro first');
  if (isW) {
    ok(draft || L.steps[L.steps.length - 1].type === 'recap', w0 + 'ends with a recap step');
    ok(draft || (L.steps[L.steps.length - 1].lines || []).length === 3, w0 + 'recap has 3 lines');
    ok(draft || L.steps.some(s => s.type === 'predict'), w0 + 'has a predict step (猜一猜)');
    ok(WORLD && WORLD.years && WORLD.countries, w0 + 'world data (src/data/world.js) loads');
    if (L.country) { ok(isoOk(L.country), w0 + 'country ' + L.country); if (COUNTRY_READY[L.country]) warn(!draft && L.available, w0 + 'COUNTRY_READY.' + L.country + ' is true: calibrate the lesson and set available'); else ok(L.available === false, w0 + 'country view not ready -> lesson stays unavailable'); ok(L.available !== true || COUNTRY_READY[L.country], w0 + 'available only when COUNTRY_READY.' + L.country); if (!draft && L.available) ok(L.steps[0].text.some(t => /^下面分 \d+ 步/.test(t)) && L.steps.some(s => s.map && s.map.open), w0 + 'country lesson has the N-steps line and opens the map'); }
  } else if (isM) {
    const last = L.steps[L.steps.length - 1];
    ok(last.next != null, w0 + 'last step hands over (next)');
    ok(L.steps.length >= 4 && L.steps.length <= 10, w0 + `4-10 steps (${L.steps.length})`);
    ok(L.label && /^第 \d 课$/.test(L.label), w0 + 'label 第 N 课');
  } else if (isS) {
    const last = L.steps[L.steps.length - 1];
    ok(String(last.next) === 'm2', w0 + 'last step hands over to m2');
    ok(L.steps.filter(s => s.vals || s.claims).length === 1, w0 + 'exactly one sim step (vals / claims): the Capex step');
  } else {
    ok(L.steps[L.steps.length - 1].type === 'chain', w0 + 'ends with a chain step');
    ok(L.steps.filter(s => s.type === 'chain').length === 1, w0 + 'exactly one chain');
    ok(L.steps.some(s => s.type === 'predict'), w0 + 'has a predict step (猜一猜)');
  }
  ok(!L.steps.some(s => s.quiz || s.type === 'quiz'), w0 + 'no quiz');
  ok(JSON.stringify(L).indexOf('NaN') < 0, w0 + 'no NaN literal');
  L.steps.forEach((st, i) => {
    const w = `L${L.id} step ${i + 1} (${st.type}) `;
    ok((isM ? MAIN_TYPES : TYPES).includes(st.type), w + 'type');
    arr(st.mark).forEach(m => ok(MARKS.includes(m), w + 'mark ' + m));
    for (const r of stepRoles(st)) ok(ROLE_CARD_ORDER.includes(r), w + 'roleCard ' + r);
    if (st.roleCards) ok(Array.isArray(st.roleCards) && st.roleCards.length >= 1 && st.roleCards.length <= 2 && !st.roleCard, w + 'roleCards: 1-2 roles (and no roleCard next to it)');
    if (st.next != null) ok(i === L.steps.length - 1 || ['chain', 'zoom', 'recap'].includes(st.type), w + 'next only on the last step');
    ok(st.title, w + 'title');
    (st.hl || []).forEach(h => ok(FLOW_TERMS.includes(h), w + 'hl ' + h));
    [...(st.concept || []), ...(st.concepts || [])].forEach(c => { if (!CONCEPTS[c] && PENDING_CONCEPTS.includes(c)) { pendingSeen.add(c); warn(false, w + 'concept ' + c + ' is not in concepts.js yet (PENDING: border-UI agent)'); } else ok(CONCEPTS[c], w + 'concept ' + c); });
    if (st.map) {
      ok(typeof st.map === 'object' && Object.keys(st.map).every(k => ['open', 'select', 'year'].includes(k)), w + 'map keys');
      if (st.map.select) ok(isoOk(st.map.select), w + 'map.select ' + st.map.select);
      if (st.map.year) ok(WORLD && WORLD.years.includes(st.map.year), w + 'map.year ' + st.map.year);
      if (st.map.select || st.map.year) ok(st.map.open !== false, w + 'map.select/year need open:true');
    }
    if (st.tab) ok(TABS.includes(st.tab), w + 'tab ' + st.tab);
    if (st.block) ok(BLOCKS.includes(st.block), w + 'block ' + st.block);
    if (st.glow) { arr(st.glow.parts).forEach(p => ok(PARTS.includes(p), w + 'glow part ' + p)); arr(st.glow.pipes).forEach(p => ok(PIPES.includes(p), w + 'glow pipe ' + p)); }
    if (isW && !draft) {
      const typed = [st.title, ...arr(st.text), st.q, ...arr(st.explain), ...arr(st.answerHint), ...arr(st.relation), ...arr(st.lines), ...(st.options || []).map(o => o.t)].filter(Boolean).flatMap(t => typedNumbers(t) || []);
      ok(typed.length === 0, w + 'no typed numbers in the text (use vals)' + (typed.length ? ': ' + typed.join(',') : ''));
    }
    for (const d of [st.from, st.until]) if (d) ok(D.dates.includes(d) || (L.mode === 'free' && /^20\d\dQ[1-4]$/.test(d)), w + 'date ' + d);
    (st.metrics || []).forEach(m => { ok(specOk(m.get, D) || m.get.indexOf(':') < 0, w + 'metric spec ' + m.get); ok(!m.fmt || FMTS.includes(m.fmt), w + 'metric fmt ' + m.fmt); });
    (st.vals || []).forEach(v => { ok(v.key && specOk(v.get, D) && FMTS.includes(v.fmt), w + 'val ' + v.key); checkSet(v.set, w + 'val ' + v.key + ' '); for (const d of [v.from, v.until]) if (d && L.mode !== 'free') ok(D.dates.includes(d), w + 'val ' + v.key + ' date ' + d); });
    if (st.wavesNow) { const wc = WAVES.countries.find(c => c.iso === st.wavesNow.iso); ok(wc && wc.now && wc.now.text.includes(st.wavesNow.has), w + `waves.js NOW of ${st.wavesNow.iso} mentions "${st.wavesNow.has}" (got: ${wc && wc.now && wc.now.text})`); }
    if (isS && !st.vals && !st.claims) return;          // 冲击: a panel step (its numbers: check_lesson_shocks.mjs)
    // intro
    if (st.type === 'intro') {
      ok(st.text[0].startsWith('**'), w + 'one-line conclusion first');
      const line = st.text.find(t => /^下面分 \d+ 步/.test(t));
      ok(line, w + '下面分 N 步');
      if (line) {
        const n = +line.match(/\d+/)[0];
        ok(n === L.steps.length - 1, w + `N (${n}) matches the number of steps (${L.steps.length - 1})`);
        if (isM) {
          const items = line.replace(/^下面分 \d+ 步：/, '').replace(/。$/, '').split('→').map(x => x.trim()).filter(Boolean);
          ok(items.length === n, w + `outline lists ${items.length} items (A → B → ...)`);
          items.forEach((t, k) => { const tt = (L.steps[k + 1].title || '').replace(/^第 \d+ 步：/, ''); ok(tt.includes(t.slice(0, 2)) || t.includes(tt.slice(0, 2)), w + `outline item ${k + 1} "${t}" ~ step title "${tt}"`); });
        } else {
          const circ = (line.match(/[①-⑫]/g) || []).length;
          ok(circ === n, w + `outline lists ${circ} circled steps`);
        }
      }
    }
    if (st.type === 'reveal') ok(!st.question || st.answerHint, w + 'question has answerHint');
    if (st.stripAt) {          // the 本季看点 strip really lists what the text says it lists
      const got = stripAt(st.stripAt.date);
      for (const h of st.stripAt.has) ok(got.includes(h), w + `strip at ${st.stripAt.date} lists "${h}" (got: ${got.join(' | ')})`);
    }
    if (st.type === 'watch') ok(st.until, w + 'until');
    if (st.type === 'predict') {
      ok((isW || st.until) && st.q && st.options.length === 3, w + 'predict shape');
      ok(st.options.filter(o => o.ok).length === 1, w + 'exactly one ok');
      ok(st.explain.length >= 2, w + 'explain');
    }
    if (st.type === 'experiment') {
      ok(st.from && st.until && st.metrics && st.insight, w + 'experiment shape');
      ok(st.choices && st.choices.length >= 2 && Object.keys(st.choices[0].set || {}).length === 0, w + 'first choice = baseline (empty set)');
      (st.choices || []).forEach((c, k) => { checkSet(c.set, w + `choice ${k} `); ok(c.label, w + `choice ${k} label`); });
      ok(st.metrics.every(m => m.key), w + 'every metric has a key (live insight)');
      if (st.compareAll) ok(st.choices.every(c => c.short), w + 'compareAll needs short labels');
    }
    if (st.type === 'recap') { ok(st.lines && st.lines.length >= 1, w + 'recap lines'); if (st.next != null) ok(lessonIds.has(String(st.next)), w + 'next ' + st.next); }
    if (st.type === 'chain') {
      ok(st.links.length >= 4, w + 'chain has >= 4 links');
      st.links.forEach((l, k) => {
        ok(l.text, w + `link ${k + 1} text`);
        arr(l.pipe).forEach(p => ok(PIPES.includes(p), w + 'pipe ' + p));
        arr(l.part).forEach(p => ok(PARTS.includes(p), w + 'part ' + p));
        if (l.term) ok(CONCEPTS[l.term], w + 'term ' + l.term);
        (l.hl || []).forEach(h => ok(FLOW_TERMS.includes(h), w + 'link hl ' + h));
        ok(l.pipe || l.part || l.hl, w + `link ${k + 1} lights something`);
      });
      if (st.next != null) ok(lessonIds.has(String(st.next)) && LESSONS.concat(ROLE_LESSONS).find(x => String(x.id) === String(st.next)).available !== false, w + 'next ' + st.next);
    }
    const win = pos[i];
    if (win.world === 'town') {         // ---- 10. town steps (main line m1): replay with the UI's code, tap, check townClaims
      ok(['intro', 'action'].includes(st.type) && !st.vals && !st.claims, w + 'town step: intro/action only, no US vals/claims');
      if (st.type === 'action') {
        const s = mkTown(L); replayTown(s, L, i, pos); applyAll(s, st.do, L);
        const before = s.snapshot();
        const res = applyAll(s, tapEffects(st), L);
        ok(res.every(r => !r || r.ok !== false), w + 'town action works' + (res.find(r => r && r.ok === false) ? ': ' + res.find(r => r && r.ok === false).reason : ''));
        const after = s.snapshot();
        ok((st.townClaims || []).length > 0, w + 'town step has townClaims');
        for (const c of st.townClaims || []) {
          const v = getPath(c.at === 'after' ? after : before, c.get) - (c.minus === 'before' ? getPath(before, c.get) : 0);
          const tests = [['gt', v > c.gt], ['gte', v >= c.gte], ['lt', v < c.lt], ['lte', v <= c.lte]].filter(([k]) => c[k] !== undefined);
          const pass = typeof v === 'number' && tests.length > 0 && tests.every(t => t[1]);
          if (verbose || !pass) console.log(`   town claim [${c.note || c.get}] ${pass ? 'holds' : 'FAILS'}: ${c.at} ${c.get}${c.minus ? ' - before' : ''} = ${v}`);
          ok(pass, w + 'town claim: ' + (c.note || c.get));
        }
      }
      return;
    }
    // ---- 2. templates
    const you = st.slider ? st.slider.def : null;
    const tbl = fullTable(D, L, st, win, you);
    const miss = [];
    const filled = fillStep(st, tbl, miss);
    for (const d of arr(st.drills)) fillStep({ text: arr(d.text) }, tbl, miss);   // drill texts are filled from the same table (src/ui/lessons.js drillsHtml)
    ok(miss.length === 0, w + 'all placeholders filled' + (miss.length ? ' (missing ' + miss.join(' ') + ')' : ''));
    const flat = [filled.text, filled.q, filled.explain, filled.answerHint, filled.relation, filled.insight, filled.question].flatMap(x => arr(x)).concat((filled.options || []).map(o => o.t), (filled.links || []).map(l => l.text)).join(' | ');
    ok(!/NaN|undefined|null|Infinity/.test(flat), w + 'filled text has no NaN/undefined/null');
    ok(!/[{}]/.test(flat), w + 'no leftover braces');
    // placeholders must point at a declared key
    const keys = new Set([...(st.vals || []).map(v => v.key), ...(st.metrics || []).filter(m => m.key).map(m => m.key), ...arr(st.derive).map(d => d.key), ...arr(st.expVals).map(x => x.key)]);
    for (const d of arr(st.derive)) ok((st.vals || []).some(v => v.key === d.a) && (st.vals || []).some(v => v.key === d.b), w + `derive ${d.key} = ${d.a} − ${d.b} (both are vals)`);
    for (const m of JSON.stringify([st.text, st.q, st.explain, st.answerHint, st.relation, st.insight, st.question, st.options, st.links, st.ending, arr(st.drills).map(d => d.text)]).matchAll(/\{(\w+)(?:\.\w+(?:-\w+)?)?\}/g)) ok(keys.has(m[1]), w + 'placeholder {' + m[1] + '} has a declared key');
    // ---- 14. the 三问 ending: filled like the text (src/ui/lessons.js endingHtml)
    if (st.ending) {
      const em = [], ef = fillStep({ text: [st.ending.q1, st.ending.q2, st.ending.q3] }, tbl, em).text.join(' | ');
      ok(em.length === 0 && !/NaN|undefined|null|Infinity|[{}]/.test(ef), w + 'ending placeholders filled' + (em.length ? ' (missing ' + em.join(' ') + ')' : ''));
      if (showText) console.log('   ending: ' + ef);
    }
    // experiment: every choice's tokens exist and are numeric
    if (st.type === 'experiment') {
      for (const m of st.metrics) st.choices.forEach((c, k) => ok(typeof tbl.raw[`${m.key}.${k}`] === 'number' || typeof tbl.raw[`${m.key}.${k}`] === 'string', w + `metric ${m.key} under choice ${k} = ${tbl.raw[`${m.key}.${k}`]}`));
      const dflt = (st.metrics || []).map(m => aggregate(scratchRun(D, L, {}, st.from, st.until).hist, m.get, scratchRun(D, L, {}, st.from, st.until).base));
      st.metrics.forEach((m, k) => ok(dflt[k] === tbl.raw[`${m.key}.0`], w + `UI default column == table value (${m.key})`));
    }
    if (showText) {
      console.log(`  --- step ${i + 1} ${st.title} [${win.from} -> ${win.until}]`);
      for (const k of ['text', 'q', 'question', 'answerHint', 'explain', 'insight', 'relation']) if (filled[k] != null) console.log(`   ${k}: ${arr(filled[k]).join(' | ')}`);
      if (st.options) console.log('   options: ' + filled.options.map(o => (o.ok ? '[ok] ' : '') + o.t).join(' / '));
      if (st.type === 'experiment') for (const m of st.metrics) console.log(`   ${m.label}: ` + st.choices.map((c, k) => `${c.short || k}=${fmtV(tbl.raw[m.key + '.' + k], m.fmt)}`).join('  '));
    }
    // ---- 3. predict
    if (st.type === 'predict') {
      const res = st.options.map(o => (o.when ? o.when.every(c => evalCond(L, c, win).pass) : null));
      st.options.forEach((o, k) => {
        if (!o.when) { warn(!o.ok, w + `option ${k + 1} has no machine-checkable claim`); return; }
        const detail = o.when.map(c => evalCond(L, c, win).msg).join('; ');
        if (verbose || res[k] !== !!o.ok) console.log(`   option ${k + 1} "${o.t}" ok=${!!o.ok} holds=${res[k]}  ${detail}`);
        ok(res[k] === !!o.ok, w + `option ${k + 1} (${o.t}): claim ${o.ok ? 'must hold' : 'must NOT hold'}`);
      });
      ok(st.options.find(o => o.ok).when, w + 'the ok option has a verifiable claim');
    }
    // ---- 4. claims
    (st.claims || []).forEach(c => {
      const r = evalCond(L, c, win);
      if (verbose || !r.pass) console.log(`   claim [${condName(c)}] ${r.pass ? 'holds' : 'FAILS'}: ${r.msg}`);
      ok(r.pass, w + 'claim: ' + condName(c));
    });
    for (const lc of st.ledgerAt || []) {   // ---- 11. the quarter's ledger has that rule entry
      const d = lc.date || win.from, r = scratchRun(D, L, {}, d, d);
      ok(r.base && r.base.ledger.some(e => e.player === lc.player && e.ruleId === lc.ruleId), w + `ledger ${d}: ${lc.player} fired ${lc.ruleId}`);
    }
    if (st.ledgerClaim) {
      const r = scratchRun(D, L, {}, win.from, win.until);
      const n = r.hist.filter(h => h.ledger.some(e => e.player === st.ledgerClaim.player && new RegExp(st.ledgerClaim.re).test(e.rule + e.action))).length;
      ok(n >= st.ledgerClaim.min, w + `ledger: ${st.ledgerClaim.player} /${st.ledgerClaim.re}/ in ${n} quarters (>= ${st.ledgerClaim.min})`);
    }
  });
}

/* ---------- cross-lesson ---------- */
console.log('\n--- cross-lesson ---');
if (pendingSeen.size) console.log('  PENDING concept cards (not written yet, world lessons point at them): ' + [...pendingSeen].join(', '));
ok(WORLDL.map(l => l.id).join() === 'w1,w2' && LESSONS.indexOf(WORLDL[0]) === LESSONS.length - 5, 'world lessons w1, w2 sit after the cycle lessons (then fx, inv, now)');
ok(WORLDL.every(l => l.label && l.title), 'world lessons have label and title');
ok(CYC.map(l => l.id).join() === '1,2,3,3b,4,5,6,7', 'cycle lessons 1..7 (+ 3b) all present, in order');
ok(CYC.every(l => l.available === true && l.steps.length >= 5), 'all available with steps');
// old chain 1 -> 2 -> 3 -> 3b -> 4 -> 5; lesson 5 (选学) now hands over to 7 (选学), 6 (旧版) to 7, 7 to w2 (选学)
const NEXT_OF = { 5: 7, 6: 7, 7: 'w2' };
ok(CYC.every((l, k) => String(l.steps[l.steps.length - 1].next) === String(NEXT_OF[l.id] ?? CYC[k + 1].id)), 'each cycle lesson hands over to the next (5 -> 7 -> w2 in the 选学 group)');
/* ---------- 12. course v3: 4 parts, 9 lessons, one chain (COURSE) ---------- */
console.log('\n--- course v3: parts, order, handovers, labels, 三问 ending ---');
const COURSE_IDS = 'm1,shk,m2,m3,m4,fx,m5,inv,now';
ok(MAIN.map(l => l.id).join() === 'm1,m2,m3,m4,m5', 'the five main lessons m1..m5 (kind main) are in LESSONS in order');
ok(COURSE.main.map(String).join() === COURSE_IDS, 'COURSE.main = L1 m1 → L2 shk → L3 m2 → L4 m3 → L5 m4 → L6 fx → L7 m5 → L8 inv → L9 now: ' + COURSE.main.join());
ok(JSON.stringify(COURSE.parts.map(p => [p.name, p.ids])) === JSON.stringify([['一个国家怎么运转', ['m1', 'shk']], ['它怎么出毛病', ['m2', 'm3', 'm4']], ['国与国之间', ['fx']], ['你', ['m5', 'inv', 'now']]]),
  'COURSE.parts = 一个国家怎么运转 (m1 shk) / 它怎么出毛病 (m2 m3 m4) / 国与国之间 (fx) / 你 (m5 inv now)');
ok(COURSE.parts.flatMap(p => p.ids).join() === COURSE.main.join(), 'COURSE.main = the parts flattened');
const CL = COURSE.main.map(id => LESSONS.find(l => String(l.id) === String(id)));
ok(CL.every(Boolean), 'every course lesson is registered');
CL.forEach((l, k) => {
  if (!l) return;
  const last = l.steps[l.steps.length - 1], want = k < CL.length - 1 ? CL[k + 1].id : null;
  ok(l.available === true, `${l.id} available`);
  ok(want == null ? last.next == null : String(last.next) === String(want), `L${k + 1} ${l.id} hands over to ${want ?? '(end of the line)'} (got ${last.next})`);
  ok(l.label === `第 ${k + 1} 课`, `L${k + 1} ${l.id} label 第 ${k + 1} 课 (got ${l.label})`);
  // ---- 14. the fixed 三问 ending on the last step
  const e = last.ending;
  ok(e && ['q1', 'q2', 'q3'].every((q, j) => typeof e[q] === 'string' && e[q].startsWith(END_Q[j]) && e[q].length > END_Q[j].length + 8), `L${k + 1} ${l.id}: last step has the 三问 ending (q1 q2 q3, each starts with its question)`);
  ok(l.steps.slice(0, -1).every(s => !s.ending), `L${k + 1} ${l.id}: only the last step has an ending`);
  if (e && (l.kind === 'fx' || l.kind === 'capstone')) ok(!/[{}]/.test(Object.values(e).join('')), `L${k + 1} ${l.id}: ending has no placeholders (its numbers: its own checker)`);
});
ok(!/同比|环比/.test(JSON.stringify(CL)), 'no 同比/环比 in the 9 course lessons');
{ // L5 (m4): the step 化债四个出口和谁被砍, tied to ⑦
  const m4 = MAIN[3], k = m4.steps.findIndex(s => /化债四个出口/.test(s.title || ''));
  const t = k >= 0 ? m4.steps[k].text.join('') : '';
  ok(k >= 0 && m4.steps[k - 1] && /⑦/.test(m4.steps[k - 1].title) && /⑧/.test(m4.steps[k + 1]?.title || ''), 'm4: 化债四个出口 sits between ⑦ and ⑧');
  ok(['增长', '没人被砍', '通胀', '拿现金、国债的人', '金融压制', '存钱的人', '违约', '债主'].every(x => t.includes(x)), 'm4: the four exits and who pays (增长 = 没人, 通胀 = 现金/国债, 金融压制 = 存钱的人, 违约 = 债主)');
  ok(k >= 0 && (m4.steps[k].claims || []).some(c => c.get === 'max:rates.realPolicy' && c.lt === 0) && (m4.steps[k].claims || []).some(c => c.get === 'dpp:gov.debtGdp' && c.lt < 0), 'm4: tied to ⑦ with claims (real rate < 0, debt/GDP falling)');
}
{ // L7 (m5): the 外国人 step has the AUS reactor sub-step (a panel, not a sim switch)
  const st = MAIN[4].steps.find(s => stepRoles(s).includes('foreign')), d = st && arr(st.drills)[0];
  ok(d && d.panel && d.panel.id === 'fx-reactor' && d.panel.iso === 'AUS' && arr(d.panel.dates).join() === '2008Q3,2009Q1' && st.drillCta, 'm5 外国人: sub-step = the AUS FX reactor 2008Q3 → 2009Q1 (drill, primary button)');
  ok(MAIN[4].steps.every(s => !s.country && !s.panel), 'm5: no sim switch and no step panel (the US view stays)');
}
/* ---------- 15. drill-down numbers (main lessons) ---------- */
{
  const CDATA = { AUS: await COUNTRY_DATA.AUS(), USA: COUNTRY_DATA.USA ? await COUNTRY_DATA.USA() : US_Q };
  const fxrCache = {};
  const DD = {
    q(iso, s, d) { const X = CDATA[iso], i = X.dates.indexOf(d); if (i < 0 || X.series[s][i] == null) throw new Error(`no ${iso}.${s}@${d}`); return X.series[s][i]; },
    fxr(d) { return (fxrCache[d] ||= computeFxReactor(CDATA.AUS, CDATA.USA, d, 'AUS')); },
  };
  const DFMT = { int: v => (Number.isInteger(v) ? String(v) : 'non-int ' + v), n0: v => String(Math.round(v)), n1: v => v.toFixed(1), n2: v => v.toFixed(2), pct0: v => (v * 100).toFixed(0), pp1: v => (v * 100).toFixed(1) };
  const DALLOW = [/\*\*/g, /(?<![\d.])(19|20)\d{2}Q[1-4]/g, /(?<![\d.])(19|20)\d{2}(?![\d.])/g, /\d{1,2}\s*月/g, /第\s*\d+\s*[步课]/g, /\bB[12]\b/g];
  const toks = t => { let s = t; for (const r of DALLOW) s = s.replace(r, ' '); return s.match(/\d+(?:\.\d+)?/g) || []; };
  const src = f => readFileSync(new URL('../src/ui/' + f, import.meta.url), 'utf8');
  for (const L of MAIN) L.steps.forEach((st, i) => arr(st.drills).forEach((d, j) => {
    const w = `L${L.id} step ${i + 1} drill ${j + 1} `;
    if (d.panel && /^exp-/.test(d.panel.id)) { ok(d.label && Array.isArray(d.text) && d.text.length >= 1, w + 'exp drill shape (label, text; numbers = placeholders, checked in section 16)'); return; }
    ok(d.label && d.panel && d.panel.id === 'fx-reactor' && Array.isArray(d.text) && d.text.length >= 2, w + 'shape (label, reactor panel, text)');
    ok(/export async function mountFxReactor/.test(src('fx-reactor.js')), w + 'mountFxReactor exists');
    for (const dt of arr(d.panel.dates).concat(d.panel.date || [])) ok(CDATA.AUS.dates.includes(dt) && DD.fxr(dt).ok, w + 'reactor date ' + dt);
    const all = arr(d.text).join('\n'), listed = new Set((d.nums || []).map(n => n.t));
    for (const tk of toks(all)) ok(listed.has(tk), w + `typed number ${tk} is listed in nums`);
    for (const n of d.nums || []) {
      let got; try { got = DFMT[n.fmt](n.f(DD)); } catch (e) { got = 'ERROR ' + e.message; }
      ok(got === n.t, w + `${n.t} = ${got}`);
      ok(toks(all).includes(n.t), w + `nums ${n.t} appears in the text`);
    }
    for (const c of d.facts || []) { let r = false; try { r = !!c.f(DD); } catch (e) { r = false; } ok(r, w + 'fact: ' + c.note); }
  }));
}
/* ---------- 13. the big lessons (汇率, 投资者) and 冲击 ---------- */
{
  console.log('\n--- big lessons (fx, inv) and shk: place in the course; numbers are checked by check_lesson_fx / check_lesson_investor / check_lesson_shocks ---');
  const src = f => readFileSync(new URL('../src/ui/' + f, import.meta.url), 'utf8');
  const ids = (f, name) => { const m = src(f).match(new RegExp(name + ' = \\[([^\\]]*)\\]')); return m ? [...m[1].matchAll(/'([\w-]+)'/g)].map(x => x[1]) : []; };
  const PANEL_IDS = { fx: [...ids('fx-lab.js', 'FX_PANELS'), 'fx-reactor'], capstone: ids('investor-lab.js', 'INVESTOR_PANEL_IDS'), shocks: ids('shock-lab.js', 'SHOCK_PANELS') };
  ok(BIG.map(l => l.id).join() === 'fx,inv' && LESSONS.slice(-3).map(l => l.id).join() === 'fx,inv,now', 'fx (汇率), inv (投资者) and now (现在在哪; numbers: check_lesson_now) are registered, last in LESSONS');
  ok(SHK.map(l => l.id).join() === 'shk', 'shk (冲击) is registered');
  const [FX, INV] = BIG;
  ok(FX && FX.kind === 'fx' && FX.label === '第 6 课' && INV && INV.kind === 'capstone' && INV.label === '第 8 课', 'kinds: fx = 第 6 课, inv = capstone 第 8 课');
  ok(INV && (INV.steps[INV.steps.length - 1].panel || {}).id === 'blind' && INV.steps[INV.steps.length - 1].next === 'now', 'inv: its last step shows the 盲测 links (panel blind) and hands over to now (L9)');
  { const NOW = LESSONS.find(l => l.id === 'now');
    ok(NOW && NOW.kind === 'now' && NOW.label === '第 9 课' && !NOW.country && NOW.available === true && NOW.steps.every(s => s.panel && /^now-/.test(s.panel.id)) && NOW.steps[NOW.steps.length - 1].next == null,
      'now: 第 9 课, US view, every step mounts a now-* panel, the end of the line (no next)'); }
  ok(INV && INV.country === 'AUS' && COUNTRY_READY.AUS === true && !!DATA.AUS, 'inv lives in the AUS view (country:AUS, COUNTRY_READY.AUS)');
  for (const L of [...BIG, ...SHK]) {
    ok(L.available === true && L.rulesOn === 'all' && D_OK(L), `${L.id} available, rulesOn all, startDate in its data`);
    ok(L.steps.filter(s => s.panel).length >= 4, `${L.id} has panel steps`);
    L.steps.forEach((st, i) => {
      for (const sp of [st.panel, ...arr(st.drills).map(d => d.panel)].filter(Boolean)) ok(PANEL_IDS[L.kind].includes(sp.id), `${L.id} step ${i + 1} panel id ${sp.id} exists (${L.kind})`);
      if (st.next != null) ok(i === L.steps.length - 1 && lessonIds.has(String(st.next)), `${L.id} step ${i + 1} next ${st.next} (last step, exists)`);
      if (st.tab) ok(TABS.includes(st.tab), `${L.id} step ${i + 1} tab ${st.tab}`);
      // hl on a step whose panel covers the diagram is invisible anyway: an id the diagram does not have is only a warning
      (st.hl || []).forEach(h => (st.panel ? warn : ok)(FLOW_TERMS.includes(h), `${L.id} step ${i + 1} hl ${h}${FLOW_TERMS.includes(h) ? '' : ' (not a data-term of the diagram: no glow)'}`));
      [...(st.concept || []), ...(st.concepts || [])].forEach(c => ok(CONCEPTS[c], `${L.id} step ${i + 1} concept ${c}`));
    });
  }
}
function D_OK(L) { const D = DATA[L.country || 'USA']; return !!D && D.dates.includes(L.startDate); }
ok(MAIN[0].scenario === 'town' && MAIN[0].steps.findIndex(s => s.type === 'zoom') === 3, 'm1: steps 1-2 in the town, step 3 zooms to the US');
const mainSteps = MAIN.reduce((a, l) => a + l.steps.length, 0);
ok(mainSteps <= 32, `main line is about an hour: ${mainSteps} steps (<= 32, ~2 min each)`);
{ const m1 = MAIN[0].steps, m5 = MAIN[4].steps;
  ok(arr(m1[3].mark).includes('loop') && arr(m1[4].mark).includes('outlets') && arr(m1[5].mark).includes('objective'), 'm1 marks: 水转圈 = loop, 四个出口 = outlets, 总目标 = objective');
  ok(m5.slice(1).flatMap(stepRoles).join() === ROLE_CARD_ORDER.join(), 'm5 opens the 8 role cards in ROLE_CARD_ORDER (1-2 per step)');
  ok(m5.length <= 6 && m5.slice(1).every(s => stepRoles(s).length >= 1), `m5: at most 6 steps incl. the intro (${m5.length}), every step after the intro opens a role card`);
  ok(m5.slice(1).every(s => stepRoles(s).every(r => s.text.join('').includes(ROLE_META[r].name))), 'm5: each step text names every role whose card it opens');
  ok(MAIN[4].startDate === '2008Q3' && dateT('2008Q3') === 54 && m5.every(s => !s.from && !s.until), 'm5 stays at 2008Q3 (t=54)');
  ok(arr(m5[m5.length - 1].mark).includes('objective') && (m5[m5.length - 1].claims || []).some(c => c.get === 'start:lamps.lit' && c.gte === 4), 'm5 ends on the 总目标 strip with all 4 lamps lit (claimed)'); }
const menuKeys = [...COURSE.main, ...COURSE.legacy].map(String);
ok(new Set(menuKeys).size === menuKeys.length, 'COURSE lists no lesson twice');
for (const l of LESSONS) ok(menuKeys.includes(String(l.id)), `lesson ${l.id} is in the menu (COURSE)`);
for (const l of ROLE_LESSONS) ok(menuKeys.includes('role:' + l.role), `role lesson ${l.id} is in the menu (旧版)`);
for (const k of menuKeys) ok(k.startsWith('role:') ? ROLE_LESSONS.some(l => l.role === k.slice(5)) : LESSONS.some(l => String(l.id) === k), 'menu key exists: ' + k);
ok(COURSE.legacy.map(String).join() === '0,0b,role:bank,role:household,role:centralBank,role:government,role:firm,role:investor,role:foreign,1,2,3,3b,4,5,6,7,w1,w2', '旧版课程 = lesson 0, 0.5, the 7 role lessons, cycle lessons 1-7 (+3b; 5 Capex -> L2, 7 自由运行 -> 沙盒), 世界 1 and 2 (-> L6)');
ok(Object.keys(COURSE).join() === 'parts,main,legacy', 'menu groups in order: the 4 parts (9 lessons), then 旧版 (the 沙盒 link sits between them in the menu)');
ok(ROUTINE.length === 1 && ROUTINE[0].id === '0b' && LESSONS[1] === ROUTINE[0], '第 0.5 课 sits right after lesson 0');
ok(ROUTINE.every(l => l.steps.length >= 5 && l.steps.length <= 8 && l.steps.some(s => s.strip) && l.steps.filter(s => s.type === 'predict').length === 1), '第 0.5 课: 5-8 steps, points at the strip, one 猜一猜');
const L7 = CYC[CYC.length - 1];
ok(L7.steps.some(s => s.freeLink) && L7.mode === 'free', 'lesson 7 runs the free mode and has the free-run link');
ok(LESSONS[0].id === 0 && LESSONS[0].available, 'lesson 0 still there');
// the rule thresholds quoted via R() exist
for (const [r, k] of [['bank_loosen', 'hp'], ['bank_tighten_collateral', 'lvr'], ['cb_qe', 'floorRate'], ['cb_qe', 'uOn'], ['cb_qe', 'sizeGdp'], ['inv_riskoff', 'rp'], ['hh_chase', 'up']]) ok(RULE_BY_ID[r].params[k] !== undefined, `rule param ${r}.${k}`);

/* ---------- 16. 吸力: L3 m2 on the exp panels; 开阀看 ▽，结账看 ▼ in m4 / m5 ---------- */
{
  console.log('\n--- 16. 吸力: L3 exp panels (engine replay), ▶ − ▽ / ▶ − ▼ wording ---');
  const m2 = MAIN.find(l => l.id === 'm2'), m3 = MAIN.find(l => l.id === 'm3'), m4 = MAIN.find(l => l.id === 'm4'), m5 = MAIN.find(l => l.id === 'm5');
  const gsrc = readFileSync(new URL('../src/ui/exp-gauge.js', import.meta.url), 'utf8');
  const EXP_IDS = [...gsrc.matchAll(/id === '(exp-[\w-]+)'\) html =/g)].map(m => m[1]);
  ok(EXP_IDS.length >= 5, 'exp-gauge.js render dispatch lists the panel ids: ' + EXP_IDS.join(' '));
  const rows = G.replay(), rowAt = d => rows.find(r => r.date === d);
  // the panel's replay = createSim (as tools/check_lesson_exp.mjs), so a val read from createSim is the number the panel draws
  const us = createSim({ data: US_Q, country: 'USA' }); while (!us.done) us.step();
  const H = us.history(), same = rows.every(r => { const h = H.find(x => x.date === r.date); return h && ['rates.policy', 'macro.inflation', 'macro.inflationExp', 'rates.realPolicy'].every(p => Math.abs(getPath(h, p) - getPath(r.snap, p)) < 1e-12); });
  ok(same, 'exp panel replay = createSim (▶ ▼ ▽ and ▶ − ▼, every quarter)');
  const pos = lessonPositions(m2), panelSteps = m2.steps.filter(s => s.panel);
  ok(m2.steps.length <= 8 && m2.steps.length - 1 <= 7, `m2: ≤ 7 steps after the intro (${m2.steps.length - 1})`);
  ok(panelSteps.length >= 4 && panelSteps.every(s => /^exp-/.test(s.panel.id)), 'm2: the ruler steps use exp panels: ' + panelSteps.map(s => s.panel.id).join(' '));
  for (const s of m2.steps) for (const sp of [s.panel, ...arr(s.drills).map(d => d.panel)].filter(Boolean)) ok(EXP_IDS.includes(sp.id), `m2 「${s.title}」 panel id ${sp.id} exists in exp-gauge.js`);
  ok(['exp-hist', 'exp-five'].every(id => m2.steps.some(s => s.panel && s.panel.id === id)) && m2.steps.some(s => arr(s.drills).some(d => d.panel.id === 'exp-loop')), 'm2: ruler (exp-hist), five places (exp-five), loop (exp-loop drill)');
  m2.steps.forEach((st, i) => {
    const w = `m2 step ${i + 1} `;
    if (st.panel) for (const v of arr(st.vals)) {
      const m = /^at:(\d{4}Q\d):(.+)$/.exec(v.get); if (!m) continue;
      const card = buildTable(US_Q, m2, { vals: [v] }, pos[i]).raw[v.key], mine = getPath(rowAt(m[1]).snap, m[2]);
      ok(typeof card === 'number' && Math.abs(card - mine) < 1e-12, w + `val ${v.key} ${m[1]} ${m[2]}: card ${fmtV(card, v.fmt)} = panel replay ${fmtV(mine, v.fmt)}`);
    }
    const tbl = fullTable(US_Q, m2, st, pos[i]);
    for (const x of arr(st.expVals)) ok(tbl.raw[x.key] != null && tbl.raw[x.key] !== '', w + `expVal ${x.key} (${x.get}) = ${tbl.raw[x.key]}`);
  });
  { const F = G.fiveTurns(rows), Lp = G.loopInfo(rows);
    ok(expGet(G, 'five.order') === F.orderText && expGet(G, 'five.lag.river') === F.lag.river && /^\d{4} 年第[一二三四]季度$/.test(expGet(G, 'five.blue')) && F.blue && Lp.firstHike && Lp.firstCut,
      `m2 step 6: 转蓝 ${F.blue}, order ${F.orderText}, river lag ${F.lag.river}, hike ${Lp.firstHike}, cut ${Lp.firstCut} (the panel's own computation)`);
    ok(F.places.every(p => p.turn && p.turn >= F.blue), 'm2 step 6: every place moves after the band turns blue'); }
  const T = l => JSON.stringify(l.steps.map(s => [s.text, s.q, s.explain, s.answerHint, s.relation, s.ending, arr(s.drills).map(d => d.text)])) + l.oneLine;
  ok(!/藏在吸力里|没有单独的零件/.test(T(m2)), 'm2: the old line 「预期没有单独的零件：藏在吸力里」 is gone');
  ok(/吸力 = ▶ − ▽/.test(T(m2)) && /开阀看 ▽，结账看 ▼/.test(T(m2)), 'm2: 吸力 = ▶ − ▽ and 开阀看 ▽，结账看 ▼');
  ok(!MAIN.some(l => /吸力（实际利率）|吸力为负|负的吸力|吸力拧到负/.test(T(l))), 'main line: no 「吸力（实际利率）」 / 「吸力为负」 left (吸力 = ▶ − ▽; ▶ − ▼ = 到手实际利率)');
  ok(/到手实际利率（▶ − ▼/.test(T(m4)) && /到手实际利率 = ▶ − ▼/.test(T(m4)), 'm4: ⑦ / savers / 政策灯 read 到手实际利率 ▶ − ▼ (结账)');
  const m5s1 = m5.steps[1];
  ok(/吸力（▶ − ▽）已经是 \{sx\}/.test(m5s1.text.join('')) && arr(m5s1.derive).some(d => d.key === 'sx' && m5s1.vals.find(v => v.key === d.a).get === 'start:rates.policy' && m5s1.vals.find(v => v.key === d.b).get === 'start:macro.inflationExp'), 'm5 step 2: 吸力 {sx} = ▶ − ▽ (rates.policy − macro.inflationExp, derive)');
  ok(/到手（▶ − ▼，结账）\{rr\}/.test(m5s1.text.join('')) && m5s1.vals.find(v => v.key === 'rr').get === 'start:rates.realPolicy', 'm5 step 2: savers = 到手 ▶ − ▼ (rates.realPolicy)');
  ok(m3.steps.length <= 7, `m3: ≤ 7 steps incl. the intro (${m3.steps.length})`);
}
/* ---------- 17. L4 m3 B1 story: data module = FRED CSVs, facts, link to the rope ---------- */
{
  console.log('\n--- 17. L4 B1 story (FRED 1960–1985) ---');
  const csv = n => readFileSync(new URL(`../data_src/real/fred/${n}.csv`, import.meta.url), 'utf8').trim().split(/\r?\n/).slice(1).map(l => l.split(',')).map(([d, v]) => [d, +v]).filter(([d, v]) => /^\d{4}-\d\d-01$/.test(d) && Number.isFinite(v));
  const qm = n => { const o = {}; for (const [d, v] of csv(n)) { const k = `${d.slice(0, 4)}Q${Math.floor((+d.slice(5, 7) - 1) / 3) + 1}`; (o[k] ||= []).push(v); } return Object.fromEntries(Object.entries(o).filter(([, a]) => a.length === 3).map(([k, a]) => [k, a.reduce((x, y) => x + y, 0) / 3])); };
  const cpi = qm('CPIAUCSL'), ff = qm('FEDFUNDS'), u = qm('UNRATE'), gd = Object.fromEntries(csv('GFDEGDQ188S').map(([d, v]) => [`${d.slice(0, 4)}Q${Math.floor((+d.slice(5, 7) - 1) / 3) + 1}`, v]));
  const prev = d => `${+d.slice(0, 4) - 1}${d.slice(4)}`, r5 = x => Math.round(x * 1e5) / 1e5;
  let bad = 0;
  B1_STORY.dates.forEach((d, i) => {
    const want = { cpi: r5(cpi[d] / cpi[prev(d)] - 1), ff: r5(ff[d] / 100), u: r5(u[d] / 100), gd: gd[d] == null ? null : r5(gd[d] / 100) };
    for (const k of ['cpi', 'ff', 'u', 'gd']) if (!(want[k] === B1_STORY[k][i] || (want[k] != null && Math.abs(want[k] - B1_STORY[k][i]) < 1.1e-5))) { bad++; if (bad < 5) console.log(`   ${d} ${k}: module ${B1_STORY[k][i]} vs CSV ${want[k]}`); }
  });
  ok(bad === 0 && B1_STORY.dates[0] === B1_WAVES.from && B1_STORY.dates[B1_STORY.dates.length - 1] === B1_WAVES.until, `b1-story.js = FRED CSVs recomputed (${B1_STORY.dates.length} quarters, ${bad} mismatches)`);
  const m3 = MAIN.find(l => l.id === 'm3'), k = m3.steps.findIndex(s => /另一条岔路 B1/.test(s.title || '')), st = m3.steps[k] || {};
  ok(k > 0 && k < m3.steps.length - 1 && st.block === 'b1story', `m3: 「另一条岔路 B1」 is a middle step (${k + 1} of ${m3.steps.length}) with the b1story chart`);
  ok(/^\*\*故事读法/.test(arr(st.text)[0] || ''), 'm3 B1: labelled 故事读法 first');
  ok(/⑦ \+ B1/.test(arr(st.text).join('')) && /沃尔克/.test(arr(st.text).join('')) && /绳/.test(arr(st.text).join('')), 'm3 B1: rope wore loose → ⑦ + B1 → ended with Volcker');
  for (const f of arr(st.b1Facts)) { let r = false; try { r = !!f.f(b1); } catch (e) { r = false; } ok(r, 'm3 B1 fact: ' + f.note); }
  ok(arr(st.b1Facts).length >= 5, 'm3 B1: the story claims are listed (b1Facts)');
  const ll = st.lessonLink || {}, rope = LESSON_EXP.steps.findIndex(s => s.panel && s.panel.id === 'exp-rope');
  ok(ll.id === 'exp' && rope >= 0 && ll.step === rope, `m3 B1: lessonLink → ?lesson=exp&step=${ll.step} = the rope step (${rope})`);
  if (showText) console.log('   ' + arr(st.text).join('\n   '));
  // every number in the B1 text is one of the computed story numbers (no typed number)
  const pct = x => (x * 100).toFixed(1) + '%';
  const allowed = new Set([b1.before.cpi, ...b1.peaks.map(r => r.cpi), ...b1.lows.map(r => r.cpi), b1.worst.real, b1.d0.gd, b1.dMin.gd, b1.ffPk.ff, b1.ffPk.real, b1.uPk.u].map(v => pct(Math.abs(v))));
  const nums = arr(st.text).join(' ').replace(/\*\*/g, '').replace(/(19|20)\d\d( 年第[一二三四]季度)?/g, ' ').match(/\d+(\.\d+)?%/g) || [];
  ok(nums.every(n => allowed.has(n)), 'm3 B1: every % in the text is a computed story number: ' + nums.join(' '));
  ok(arr(st.text).join('').includes(`${b1.negAll} 个季度里，有 ${b1.negN} 个季度`), `m3 B1: ${b1.negN} of ${b1.negAll} quarters with 到手 < 0 (computed)`);
}

console.log(`\n${fails ? 'FAILED' : 'OK'}: ${fails} failure(s), ${warns} warning(s)`);
process.exit(fails ? 1 : 0);
