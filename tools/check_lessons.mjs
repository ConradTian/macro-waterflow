// node tools/check_lessons.mjs [--verbose] [--text]
// Validates the US CYCLE lessons 1-7 (src/data/lessons.js) against the engine, with the same code the UI runs (src/ui/lessons-town.js):
//  1. structure   every id (concept, term, part, pipe, rule + param, tab, block, date, next) exists; intro 'N 步' = real step count; ends with a chain
//  2. templates   every {placeholder} is filled from a scratch run (no '—', NaN, undefined, leftover braces), for every choice of every experiment
//  3. predicts    exactly one option is ok, its `when` claim holds on the engine, the other options' claims do not
//  4. claims      each step's `claims` (the factual sentences of the text) hold on the engine; experiment claims compare counterfactual runs
// --text prints every filled text (to proofread the numbers). Exit code 1 on any FAIL.
// Lessons 0 and the role lessons are checked by tools/check_role_lessons.mjs.
import { readFileSync } from 'node:fs';
import { US_Q } from '../src/data/us-quarterly.js';
import { LESSONS } from '../src/data/lessons.js';
import { ROLE_LESSONS } from '../src/data/role-lessons.js';
import { CONCEPTS } from '../src/data/concepts.js';
import { RULE_BY_ID } from '../src/engine/rules.js';
import { createSim } from '../src/engine/sim.js';
import { headlineItems } from '../src/ui/headline.js';
import { lessonPositions, buildTable, fillStep, evalGet, scratchRun, dateT, fmtV, aggregate, arr } from '../src/ui/lessons-town.js';

const verbose = process.argv.includes('--verbose'), showText = process.argv.includes('--text');
let fails = 0, warns = 0;
const ok = (c, m) => { if (!c) { fails++; console.log('  FAIL:', m); } else if (verbose) console.log('  ok:  ', m); };
const warn = (c, m) => { if (!c) { warns++; console.log('  WARN:', m); } };

const flowSrc = readFileSync(new URL('../src/ui/flow.js', import.meta.url), 'utf8');
const PIPES = [...flowSrc.matchAll(/\{ k: '(\w+)',\s+part:/g)].map(m => m[1]);
const PARTS = ['bank', 'pool', 'repay', 'household', 'firm', 'channel', 'cash', 'centralBank', 'government', 'capex', 'interest', 'poolHousing', 'poolEquity', 'poolBond', 'poolGold', 'iou', 'springs', 'valves', 'budget', 'ledger', 'cycle', 'assets', 'takeover'];
const FLOW_TERMS = ['policyRate', 'bankApproval', 'newLoans', 'interestPaid', 'principalRepay', 'assetReservoir', 'goodsChannel', 'cpi', 'capacity', 'capex', 'qe', 'fiscalInjection'];
const TABS = ['ledger', 'cycle', 'assets', 'takeover'];
const TYPES = ['intro', 'watch', 'predict', 'reveal', 'experiment', 'chain'];
const BLOCKS = ['alloc', 'budget', 'sources'];
const FMTS = ['pct', 'pct0', 'pct2', 'pp', 'chg', 'chg1', 'x2', 'idx', 'n1', 'n2', 'n3', 'rate', 'tn', 'num', 'str'];
const AGGS = ['end', 'first', 'start', 'max', 'min', 'sum', 'avg', 'chg', 'dpp', 'dd', 'argmax', 'argmin', 'when', 'at', 'count'];
const CYC = LESSONS.filter(l => l.id >= 1);
const ROUTINE = LESSONS.filter(l => l.kind === 'routine');   // 第 0.5 课 怎么看一个季度: same checks as the cycle lessons, plus the 本季看点 strip texts
const stripSim = createSim({ data: US_Q, mode: 'history' });
const stripAt = date => { const t = US_Q.dates.indexOf(date); while (stripSim.t < t && !stripSim.done) stripSim.step(); return headlineItems(stripSim.snapshot('model', t), null, stripSim).map(i => i.text); };
const lessonIds = new Set([...LESSONS.map(l => String(l.id)), ...ROLE_LESSONS.map(l => String(l.id))]);

const specOk = s => typeof s === 'string' && AGGS.includes(s.split(':')[0]);
function checkSet(set, w) {
  for (const [id, on] of Object.entries((set && set.rules) || {})) { ok(RULE_BY_ID[id] && typeof on === 'boolean', w + 'set rule ' + id); }
  for (const [k, v] of Object.entries((set && set.params) || {})) { const [r, p] = k.split('.'); ok(RULE_BY_ID[r] && p in RULE_BY_ID[r].params && typeof v === 'number', w + 'set param ' + k); }
}

// ---- one condition: get - mul*vs  against gt/gte/lt/lte (numbers), or a date test
function evalCond(L, c, win) {
  const g = { get: c.get, set: c.set, from: c.from, until: c.until };
  const a = evalGet(US_Q, L, g, win);
  if (c.dateBetween || c.dateBefore) {
    if (typeof a !== 'string') return { pass: false, msg: `${c.get} gave ${a}` };
    if (c.dateBetween) { const pass = dateT(a) >= dateT(c.dateBetween[0]) && dateT(a) <= dateT(c.dateBetween[1]); return { pass, msg: `${a} in [${c.dateBetween}]` }; }
    const b = evalGet(US_Q, L, { ...g, get: c.dateBefore }, win);
    return { pass: typeof b === 'string' && dateT(a) < dateT(b), msg: `${a} before ${b}` };
  }
  let b = 0, bs = '';
  if (c.vs) {
    const vg = { get: c.vs.get || c.get, set: c.vs.set !== undefined ? c.vs.set : c.set, from: c.vs.from || c.from, until: c.vs.until || c.until };
    b = evalGet(US_Q, L, vg, win); bs = ` - ${(c.mul ?? 1)}*${typeof b === 'number' ? b.toFixed(4) : b}`;
  }
  if (typeof a !== 'number' || typeof b !== 'number') return { pass: false, msg: `not numeric: ${a} ${b}` };
  const d = a - (c.mul ?? 1) * b;
  const tests = [['gt', d > c.gt], ['gte', d >= c.gte], ['lt', d < c.lt], ['lte', d <= c.lte]].filter(([k]) => c[k] !== undefined);
  return { pass: tests.length > 0 && tests.every(t => t[1]), msg: `${c.get}${c.set ? ' ' + JSON.stringify(c.set) : ''}${bs} = ${d.toFixed(4)} vs ${tests.map(t => t[0] + ' ' + c[t[0]]).join(', ')}` };
}
const condName = c => c.note || c.get;

for (const L of [...ROUTINE, ...CYC]) {
  console.log(`\n=== lesson ${L.id} (${L.title}) ===`);
  const pos = lessonPositions(L);
  const w0 = `L${L.id} `;
  ok(L.available === true, w0 + 'available');
  ok(L.rulesOn === 'all', w0 + 'rulesOn all');
  ok(L.scenario !== 'town', w0 + 'US scenario');
  ok(US_Q.dates.includes(L.startDate) || L.mode === 'free', w0 + 'startDate');
  ok(L.steps[0].type === 'intro', w0 + 'intro first');
  ok(L.steps[L.steps.length - 1].type === 'chain', w0 + 'ends with a chain step');
  ok(L.steps.filter(s => s.type === 'chain').length === 1, w0 + 'exactly one chain');
  ok(L.steps.some(s => s.type === 'predict'), w0 + 'has a predict step (猜一猜)');
  ok(!L.steps.some(s => s.quiz || s.type === 'quiz'), w0 + 'no quiz');
  ok(JSON.stringify(L).indexOf('NaN') < 0, w0 + 'no NaN literal');
  L.steps.forEach((st, i) => {
    const w = `L${L.id} step ${i + 1} (${st.type}) `;
    ok(TYPES.includes(st.type), w + 'type');
    ok(st.title, w + 'title');
    (st.hl || []).forEach(h => ok(FLOW_TERMS.includes(h), w + 'hl ' + h));
    (st.concept || []).forEach(c => ok(CONCEPTS[c], w + 'concept ' + c));
    if (st.tab) ok(TABS.includes(st.tab), w + 'tab ' + st.tab);
    if (st.block) ok(BLOCKS.includes(st.block), w + 'block ' + st.block);
    if (st.glow) { arr(st.glow.parts).forEach(p => ok(PARTS.includes(p), w + 'glow part ' + p)); arr(st.glow.pipes).forEach(p => ok(PIPES.includes(p), w + 'glow pipe ' + p)); }
    for (const d of [st.from, st.until]) if (d) ok(US_Q.dates.includes(d) || (L.mode === 'free' && /^20\d\dQ[1-4]$/.test(d)), w + 'date ' + d);
    (st.metrics || []).forEach(m => { ok(specOk(m.get) || m.get.indexOf(':') < 0, w + 'metric spec ' + m.get); ok(!m.fmt || FMTS.includes(m.fmt), w + 'metric fmt ' + m.fmt); });
    (st.vals || []).forEach(v => { ok(v.key && specOk(v.get) && FMTS.includes(v.fmt), w + 'val ' + v.key); checkSet(v.set, w + 'val ' + v.key + ' '); });
    // intro
    if (st.type === 'intro') {
      ok(st.text[0].startsWith('**'), w + 'one-line conclusion first');
      const line = st.text.find(t => /^下面分 \d+ 步/.test(t));
      ok(line, w + '下面分 N 步');
      if (line) {
        const n = +line.match(/\d+/)[0];
        ok(n === L.steps.length - 1, w + `N (${n}) matches the number of steps (${L.steps.length - 1})`);
        const circ = (line.match(/[①-⑫]/g) || []).length;
        ok(circ === n, w + `outline lists ${circ} circled steps`);
      }
    }
    if (st.type === 'reveal') ok(!st.question || st.answerHint, w + 'question has answerHint');
    if (st.stripAt) {          // the 本季看点 strip really lists what the text says it lists
      const got = stripAt(st.stripAt.date);
      for (const h of st.stripAt.has) ok(got.includes(h), w + `strip at ${st.stripAt.date} lists "${h}" (got: ${got.join(' | ')})`);
    }
    if (st.type === 'watch') ok(st.until, w + 'until');
    if (st.type === 'predict') {
      ok(st.until && st.q && st.options.length === 3, w + 'predict shape');
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
    // ---- 2. templates
    const win = pos[i];
    const you = st.slider ? st.slider.def : null;
    const tbl = buildTable(US_Q, L, st, win, you);
    const miss = [];
    const filled = fillStep(st, tbl, miss);
    ok(miss.length === 0, w + 'all placeholders filled' + (miss.length ? ' (missing ' + miss.join(' ') + ')' : ''));
    const flat = [filled.text, filled.q, filled.explain, filled.answerHint, filled.relation, filled.insight, filled.question].flatMap(x => arr(x)).concat((filled.options || []).map(o => o.t), (filled.links || []).map(l => l.text)).join(' | ');
    ok(!/NaN|undefined|null|Infinity/.test(flat), w + 'filled text has no NaN/undefined/null');
    ok(!/[{}]/.test(flat), w + 'no leftover braces');
    // placeholders must point at a declared key
    const keys = new Set([...(st.vals || []).map(v => v.key), ...(st.metrics || []).filter(m => m.key).map(m => m.key)]);
    for (const m of JSON.stringify([st.text, st.q, st.explain, st.answerHint, st.relation, st.insight, st.question, st.options, st.links]).matchAll(/\{(\w+)(?:\.\w+(?:-\w+)?)?\}/g)) ok(keys.has(m[1]), w + 'placeholder {' + m[1] + '} has a declared key');
    // experiment: every choice's tokens exist and are numeric
    if (st.type === 'experiment') {
      for (const m of st.metrics) st.choices.forEach((c, k) => ok(typeof tbl.raw[`${m.key}.${k}`] === 'number' || typeof tbl.raw[`${m.key}.${k}`] === 'string', w + `metric ${m.key} under choice ${k} = ${tbl.raw[`${m.key}.${k}`]}`));
      const dflt = (st.metrics || []).map(m => aggregate(scratchRun(US_Q, L, {}, st.from, st.until).hist, m.get, scratchRun(US_Q, L, {}, st.from, st.until).base));
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
    if (st.ledgerClaim) {
      const r = scratchRun(US_Q, L, {}, win.from, win.until);
      const n = r.hist.filter(h => h.ledger.some(e => e.player === st.ledgerClaim.player && new RegExp(st.ledgerClaim.re).test(e.rule + e.action))).length;
      ok(n >= st.ledgerClaim.min, w + `ledger: ${st.ledgerClaim.player} /${st.ledgerClaim.re}/ in ${n} quarters (>= ${st.ledgerClaim.min})`);
    }
  });
}

/* ---------- cross-lesson ---------- */
console.log('\n--- cross-lesson ---');
ok(CYC.map(l => l.id).join() === '1,2,3,4,5,6,7', 'cycle lessons 1..7 all present');
ok(CYC.every(l => l.available === true && l.steps.length >= 5), 'all available with steps');
ok(CYC.every((l, k) => k === CYC.length - 1 || l.steps[l.steps.length - 1].next === l.id + 1), 'each cycle lesson hands over to the next');
ok(ROUTINE.length === 1 && ROUTINE[0].id === '0b' && LESSONS[1] === ROUTINE[0], '第 0.5 课 sits right after lesson 0');
ok(ROUTINE.every(l => l.steps.length >= 5 && l.steps.length <= 8 && l.steps.some(s => s.strip) && l.steps.filter(s => s.type === 'predict').length === 1), '第 0.5 课: 5-8 steps, points at the strip, one 猜一猜');
ok(CYC[6].steps.some(s => s.freeLink) && CYC[6].mode === 'free', 'lesson 7 runs the free mode and has the free-run link');
ok(LESSONS[0].id === 0 && LESSONS[0].available, 'lesson 0 still there');
// the rule thresholds quoted via R() exist
for (const [r, k] of [['bank_loosen', 'hp'], ['bank_tighten_collateral', 'lvr'], ['cb_qe', 'floorRate'], ['cb_qe', 'uOn'], ['cb_qe', 'sizeGdp'], ['inv_riskoff', 'rp'], ['hh_chase', 'up']]) ok(RULE_BY_ID[r].params[k] !== undefined, `rule param ${r}.${k}`);

console.log(`\n${fails ? 'FAILED' : 'OK'}: ${fails} failure(s), ${warns} warning(s)`);
process.exit(fails ? 1 : 0);
