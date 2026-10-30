// node tools/check_headline.mjs [--verbose]
// 本季看点 strip (src/ui/headline.js): headlineItems() for every quarter of US history, free mode (2026-2050) and the town.
// Checks: no throw, <= 3 items, each item has text + where (+ a tab, specs or term to act on), nextStep() text is sane,
// not every quarter is 平稳 and not every quarter has 3 items. Prints the distribution and a few example quarters.
import { createSim } from '../src/engine/sim.js';
import { US_Q } from '../src/data/us-quarterly.js';
import { headlineItems, headlineSplit, itemLayer, nextStep, freshness, ruleKey } from '../src/ui/headline.js';
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
// the link between the dials: B2 fork and 降息推不动 both in 2008Q3 (the dial is in 降息 from the first cut, 2007Q4, so 推不动 shows the
// quarter the long cycle takes the B2 fork; since 2026-10-30 B2 is confirmed after 3 quarters in a row: pending 2008Q1-Q2),
// first and second in the list; no B1/B2 as short-cycle names
{
  const at = d => us.examples.byDate[d] || [];
  ok(at('2008Q3')[0]?.startsWith('地下水位跌破吸程线'), `2008Q3: B2 fork headline first (${at('2008Q3')[0]})`);
  ok(at('2008Q3')[1]?.startsWith('降息推不动 → 交给大周期'), `2008Q3: 推不动 headline second (${at('2008Q3')[1]})`);
  ok(at('2007Q4').some(x => x.startsWith('小周期 收紧→降息')), `2007Q4: the first Fed cut moves the short dial to 降息 (${at('2007Q4').join(' | ')})`);
  ok(at('2022Q2').some(x => x.startsWith('小周期 过热·物价→收紧')), `2022Q2: the first hike moves the short dial to 收紧 (${at('2022Q2').join(' | ')})`);
  const all = Object.values(us.examples.byDate).flat();
  ok(all.filter(x => x.startsWith('地下水位跌破吸程线')).length === 1, 'B2 fork headline fires exactly once in US history');
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

// progressive layers: with only some layers learned (body.layers-on, 显示全部 off) no item names a part / dial of a hidden layer;
// the left-out items are only counted (hidden). With every layer shown the list is the same as the default (no filter).
{
  const sim = createSim({ data: US_Q, mode: 'history' });
  while (!sim.done) sim.step();
  // words that belong to a layer after L-water (the dials, the 4 灯, the central bank's knob, the lake pools, groundwater, government, 闸)
  const LATER = /周期|灯|央行|吸力|政策利率|房价|股价|国债|金价|房产池|股票池|国债池|黄金池|吸程线|地下水|政府|闸|外国/;
  const sets = { water: ['L-water'], short: ['L-water', 'L-channel', 'L-short'], long: ['L-water', 'L-channel', 'L-short', 'L-long'] };
  const cnt = { water: 0, short: 0, long: 0 }, hid = { water: 0, short: 0, long: 0 };
  let badW = 0, badLayer = 0, badSplit = 0, badAll = 0, badNext = 0, quarters = 0;
  for (let t = 1; t < sim.history().length; t++) {
    const snap = sim.snapshot('model', t), prev = sim.snapshot('model', t - 1);
    quarters++;
    const full = headlineSplit(snap, prev, sim, () => true);
    if (JSON.stringify(full.items.map(i => i.text)) !== JSON.stringify(headlineItems(snap, prev, sim).map(i => i.text)) || full.hidden !== 0) badAll++;
    for (const [k, L] of Object.entries(sets)) {
      const shown = id => L.includes(id);
      const r = headlineSplit(snap, prev, sim, shown);
      cnt[k] += r.items.length; hid[k] += r.hidden;
      for (const it of r.items) {
        if (!shown(itemLayer(it))) { badLayer++; if (badLayer < 4) console.log(`  ${snap.date} ${k}: "${it.text}" layer ${itemLayer(it)}`); }
        if (k === 'water' && (LATER.test(it.text) || LATER.test(it.where))) { badW++; if (badW < 4) console.log(`  ${snap.date} L-water only: "${it.text}" [${it.where}]`); }
        if (k === 'short' && /大周期|吸程线|地下水/.test(it.text + it.where)) { badW++; if (badW < 4) console.log(`  ${snap.date} up to L-short: "${it.text}" [${it.where}]`); }
      }
      if (r.items.length > 3 || (r.items.length < 3 && r.items.length + r.hidden < Math.min(3, full.items.length))) badSplit++;
      if (k === 'water' && nextStep(snap, shown) !== null) badNext++;
    }
  }
  console.log(`\n=== layers: ${quarters} US quarters; items shown / hidden  L-water only ${cnt.water}/${hid.water}  up to L-short ${cnt.short}/${hid.short}  up to L-long ${cnt.long}/${hid.long} ===`);
  ok(badLayer === 0, `layers: every shown item's layer is on screen (${badLayer} bad)`);
  ok(badW === 0, `layers: with only L-water learned no item names a dial / 灯 / 央行 / 湖 / 地下水 / 政府 / 闸; up to L-short none names the long cycle (${badW} bad)`);
  ok(badNext === 0, 'layers: no 下一步 (short dial) with only L-water learned');
  ok(badAll === 0, 'layers: everything shown = the unfiltered list, nothing hidden');
  ok(badSplit === 0, 'layers: <= 3 items, hidden counts the left-out ones');
  ok(hid.water > 0 && cnt.short > 0, 'layers: L-water only hides items (in US history every item names a later layer: the strip shows the neutral 没学到 line); up to L-short some show');
  ok(hid.long < hid.short && hid.short < hid.water, 'layers: the more layers learned, the fewer items hidden');
  // the B2 hand-off is a long-cycle item: hidden before L-long, shown with it
  const t08 = US_Q.dates.indexOf('2008Q3'), s08 = sim.snapshot('model', t08), p08 = sim.snapshot('model', t08 - 1);
  ok(!headlineSplit(s08, p08, sim, id => sets.short.includes(id)).items.some(i => i.text.startsWith('地下水位跌破吸程线')), '2008Q3: B2 item hidden up to L-short');
  ok(headlineSplit(s08, p08, sim, id => sets.long.includes(id)).items[0]?.text.startsWith('地下水位跌破吸程线'), '2008Q3: B2 item first with L-long');
}

console.log(fails ? `\n${fails} FAIL` : '\nALL HEADLINE CHECKS PASSED');
process.exit(fails ? 1 : 0);
