// node tools/check_headline.mjs [--verbose]
// 本季看点 strip (src/ui/headline.js): headlineItems() for every quarter of US history, free mode (2026-2050) and the town.
// Checks: no throw, <= 3 items, each item has text + where (+ a tab, specs or term to act on), nextStep() text is sane,
// not every quarter is 平稳 and not every quarter has 3 items. Prints the distribution and a few example quarters.
import { createSim } from '../src/engine/sim.js';
import { US_Q } from '../src/data/us-quarterly.js';
import { headlineItems, nextStep, freshness, ruleKey } from '../src/ui/headline.js';
import { LAMP_LINKS } from '../src/ui/links.js';

const verbose = process.argv.includes('--verbose');
let fails = 0;
const ok = (c, m) => { if (!c) { fails++; console.log('  FAIL:', m); } else if (verbose) console.log('  ok:  ', m); };

function run(label, sim, last) {
  const dist = [0, 0, 0, 0], kinds = {}, examples = {};
  let nextOk = 0, n = 0;
  while (sim.t < last && !sim.done) sim.step();
  for (let t = 1; t <= Math.min(last, sim.t); t++) {
    const snap = sim.snapshot('model', t), prev = sim.snapshot('model', t - 1);
    let items;
    try { items = headlineItems(snap, prev, sim); } catch (e) { ok(false, `${label} ${snap.date} threw ${e.message}`); continue; }
    n++;
    ok(Array.isArray(items) && items.length <= 3, `${label} ${snap.date}: <= 3 items (${items.length})`);
    dist[items.length]++;
    for (const it of items) {
      ok(typeof it.text === 'string' && it.text.length > 0 && it.text.length < 40, `${label} ${snap.date}: text "${it.text}"`);
      ok(typeof it.where === 'string' && it.where.length > 0, `${label} ${snap.date}: where of "${it.text}"`);
      ok(it.specs || it.term || it.tab, `${label} ${snap.date}: "${it.text}" has something to light up / open`);
      kinds[it.kind] = (kinds[it.kind] || 0) + 1;
    }
    // same result with and without an explicit prev
    const again = headlineItems(snap, null, sim);
    ok(JSON.stringify(again.map(i => i.text)) === JSON.stringify(items.map(i => i.text)), `${label} ${snap.date}: prev defaults to t-1`);
    const nx = nextStep(snap);
    if (nx) { nextOk++; ok(nx.text.startsWith('下一步') && !/undefined|NaN|—/.test(nx.text), `${label} ${snap.date}: nextStep text "${nx.text}"`); }
    if (!examples[items.length] && items.length) examples[items.length] = `${snap.date}: ${items.map(i => i.text).join(' | ')}`;
    examples.byDate ||= {};
    examples.byDate[snap.date] = items.map(i => `${i.text}  [看：${i.where}]`);
  }
  console.log(`\n=== ${label}: ${n} quarters ===`);
  console.log(`  items per quarter  0 (本季平稳): ${dist[0]}   1: ${dist[1]}   2: ${dist[2]}   3: ${dist[3]}`);
  console.log(`  by kind: ${Object.entries(kinds).map(([k, v]) => k + ' ' + v).join(', ')}   nextStep available: ${nextOk}/${n}`);
  return { dist, n, examples };
}

const us = run('US history', createSim({ data: US_Q, mode: 'history' }), 123);
ok(us.dist[0] > 0 && us.dist[0] < us.n, 'US: some quarters are 平稳, not all');
ok(us.dist[3] > 0 && us.dist[3] < us.n, 'US: some quarters have 3 items, not all');
ok(us.dist[1] + us.dist[2] > 0, 'US: some quarters have 1-2 items');
// the link between the dials: B2 fork and 降息推不动 both in 2008Q1 (the dial is in 降息 from the first cut, 2007Q4, so 推不动 shows the
// quarter the long cycle takes the B2 fork), first and second in the list; no B1/B2 as short-cycle names
{
  const at = d => us.examples.byDate[d] || [];
  ok(at('2008Q1')[0]?.startsWith('大周期走上 B2 岔路'), `2008Q1: B2 fork headline first (${at('2008Q1')[0]})`);
  ok(at('2008Q1')[1]?.startsWith('降息推不动 → 交给大周期'), `2008Q1: 推不动 headline second (${at('2008Q1')[1]})`);
  ok(at('2007Q4').some(x => x.startsWith('小周期 收紧→降息')), `2007Q4: the first Fed cut moves the short dial to 降息 (${at('2007Q4').join(' | ')})`);
  ok(at('2022Q2').some(x => x.startsWith('小周期 过热·物价→收紧')), `2022Q2: the first hike moves the short dial to 收紧 (${at('2022Q2').join(' | ')})`);
  const all = Object.values(us.examples.byDate).flat();
  ok(all.filter(x => x.startsWith('大周期走上 B2 岔路')).length === 1, 'B2 fork headline fires exactly once in US history');
  ok(all.filter(x => x.startsWith('降息推不动')).length === 1, '推不动 headline fires exactly once in US history');
  ok(!all.some(x => /小周期[^[]*B[12]/.test(x)), 'no B1/B2 in short-cycle headline texts');
  ok(all.some(x => /小周期 [^→]*→过热·(物价|资产)/.test(x) || /小周期 过热·(物价|资产)→/.test(x)), 'short-cycle moves use KEY_LABEL (过热·物价 / 过热·资产)');
}
for (const d of ['2007Q4', '2008Q1', '2008Q2', '2008Q4', '2009Q1', '2019Q3', '2020Q2', '2021Q4', '2022Q2', '2024Q4']) console.log(`  ${d}: ${(us.examples.byDate[d] || []).join('  ||  ') || '(平稳)'}`);

const fr = run('free mode', createSim({ data: US_Q, mode: 'free' }), 223);
ok(fr.n === 223, 'free: 223 quarters');
const tw = run('town', createSim({ scenario: 'town', mode: 'history' }), 12);
ok(tw.n > 0, 'town ran');

// ledger freshness helper: a rule present last quarter is 持续中, a new one is 新触发
{
  const sim = createSim({ data: US_Q, mode: 'history' });
  while (sim.t < 54) sim.step();
  const a = sim.snapshot('model', 54), b = sim.snapshot('model', 53);
  const f = freshness(a.ledger, b.ledger);
  ok(f.length === a.ledger.length, 'freshness: one row per entry');
  ok(f.some(x => x.fresh) && f.some(x => !x.fresh), '2008Q3 ledger has both 新触发 and 持续中');
  ok(a.ledger.every(e => ruleKey(e).includes('|')), 'ruleKey');
  ok(a.ledger.filter(e => e.cond).every(e => e.cond.every(c => typeof c.name === 'string' && Number.isFinite(c.value) && Number.isFinite(c.threshold) && (c.dir === '>=' || c.dir === '<='))), 'ledger cond[] well-formed');
  ok(Object.keys(LAMP_LINKS).length === 4, 'LAMP_LINKS');
}
// every quarter of US history: cond[] well-formed and consistent with the rule that fired
{
  const sim = createSim({ data: US_Q, mode: 'history' });
  let withCond = 0, total = 0, bad = 0;
  while (!sim.done) { sim.step(); for (const e of sim.snapshot().ledger) { total++; if (e.cond) { withCond++; if (!e.cond.every(c => Number.isFinite(c.value) && Number.isFinite(c.threshold) && ['>=', '<='].includes(c.dir) && ['pct', 'pp', 'x', 'num'].includes(c.fmt))) bad++; } } }
  ok(bad === 0, `all cond[] items well-formed (${withCond}/${total} ledger entries carry a condition ruler)`);
  console.log(`\n  ledger entries with cond[]: ${withCond}/${total}`);
}

console.log(fails ? `\n${fails} FAIL` : '\nALL HEADLINE CHECKS PASSED');
process.exit(fails ? 1 : 0);
