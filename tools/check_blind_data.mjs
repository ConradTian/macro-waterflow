// Checks src/data/blind-cards.js against tools/BLIND-CONTRACT.md.
// Run: node tools/check_blind_data.mjs            (exit 1 on errors)
//      node tools/check_blind_data.mjs --fast     (skip the no-look-ahead rebuild, ~15 s of Python)
// No look-ahead: the published views come from the full raw data; here Python rebuilds every card's view from raw data
// truncated at the card's year (tools/build_blind_data.py --views-truncated) and the two must be identical.
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { BLIND } from '../src/data/blind-cards.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const errors = [];
const err = (m) => errors.push(m);
const LAST = 2025;

// the deck in the contract (危 / 转 / 平)
const DECK = {
  USA: '1928危 1932转 1946转 1965平 1973危 1980危 1982转 1995平 1999危 2002转 2006危 2009转 2015平 2021危',
  JPN: '1960平 1973危 1985平 1989危 1992转 1997危 2000平 2003转 2008危 2012转 2016平 2020转',
  AUS: '1960平 1974危 1981平 1989危 1991转 2000平 2008危 2009转 2015平 2021危',
  CHN: '2007危 2008转 2010危 2012平 2013危 2014转 2015危 2016平 2018平 2020转 2021危 2024转',
};
const want = new Map();
for (const [iso, s] of Object.entries(DECK)) for (const t of s.split(' ')) want.set(`${iso}-${t.slice(0, 4)}`, t.slice(4));

const LEVELS = ['creditGdp', 'govDebtGdp', 'houseToIncome', 'equityVal', 'realRate', 'policyRate', 'cpiYoY', 'unemployment', 'fxPerUsd'];
const PCT = ['creditGdp', 'houseToIncome', 'equityVal', 'realRate'];
const RET = ['cash', 'bond', 'equity', 'house', 'fxUSD', 'fxJPY', 'fxCNY', 'fxAUD', 'bench'];
const LONG = ['①', '②', '③', '④', '⑤', '⑥', '⑦', '⑧'];
const isNum = (x) => typeof x === 'number' && Number.isFinite(x);
const numOrNull = (x) => x === null || isNum(x);

// ------------------------------------------------------------ top level
for (const k of ['asOf', 'method', 'sources', 'cards']) if (!(k in BLIND)) err(`missing BLIND.${k}`);
if (!Array.isArray(BLIND.sources) || !BLIND.sources.length) err('sources empty');
for (const s of BLIND.sources || []) for (const k of ['id', 'name', 'url', 'coverage']) if (!s[k]) err(`source ${s.id}: no ${k}`);

// ------------------------------------------------------------ cards
const ids = new Set();
let nRet = 0, nNull = 0;
for (const c of BLIND.cards) {
  const id = `${c.iso}-${c.year}`;
  if (c.id !== id) err(`${c.id}: id should be ${id}`);
  if (ids.has(c.id)) err(`${c.id}: duplicate`);
  ids.add(c.id);
  if (!want.has(c.id)) err(`${c.id}: not in the contract deck`);
  else if (want.get(c.id) !== c.type) err(`${c.id}: type ${c.type}, contract says ${want.get(c.id)}`);
  if (typeof c.holdout !== 'boolean') err(`${c.id}: holdout not boolean`);
  if (c.year >= 2021 && c.holdout !== true) err(`${c.id}: 2021+ card must be 保留样本`);
  if (c.year + 3 >= 2021 && c.holdout !== true) err(`${c.id}: its reveal uses 2021+ data, must be 保留样本`);
  if (c.year + 3 < 2021 && c.holdout !== false) err(`${c.id}: holdout set but no 2021+ data used`);
  if (![1, 2].includes(c.batch)) err(`${c.id}: batch ${c.batch}`);
  const v = c.view;
  if (!v || !v.levels || !v.pct || !('gdpGap' in v) || !('call' in v)) { err(`${c.id}: view shape`); continue; }
  for (const k of LEVELS) if (!(k in v.levels) || !numOrNull(v.levels[k])) err(`${c.id}: levels.${k} = ${v.levels[k]}`);
  for (const k of PCT) {
    const x = v.pct[k];
    if (!(k in v.pct) || !(x === null || (isNum(x) && x >= 0 && x <= 1))) err(`${c.id}: pct.${k} = ${x}`);
  }
  if (!numOrNull(v.gdpGap)) err(`${c.id}: gdpGap`);
  const call = v.call;
  if (!call) err(`${c.id}: no call`);
  else {
    if (!LONG.includes(call.long)) err(`${c.id}: call.long ${call.long}`);
    if (![null, 'B1', 'B2'].includes(call.fork)) err(`${c.id}: call.fork ${call.fork}`);
    if (!['expand', 'hot', 'tight', 'ease'].includes(call.short)) err(`${c.id}: call.short ${call.short}`);
    if (!Array.isArray(call.signals) || !call.signals.length) err(`${c.id}: no signals`);
    for (const s of call.signals || []) if (typeof s.id !== 'string' || typeof s.text !== 'string' || typeof s.lit !== 'boolean') err(`${c.id}: signal shape`);
    if (!call.signals?.some((s) => s.lit)) err(`${c.id}: no signal lit`);
  }
  const r = c.reveal;
  if (!r || !r.ret1 || !r.ret3 || typeof r.what !== 'string' || !r.what) { err(`${c.id}: reveal shape`); continue; }
  for (const k of RET) {
    for (const [nm, o] of [['ret1', r.ret1], ['ret3', r.ret3]]) {
      if (!(k in o)) err(`${c.id}: ${nm}.${k} missing`);
      else if (!numOrNull(o[k])) err(`${c.id}: ${nm}.${k} = ${o[k]} (must be finite or null)`);
      else if (o[k] !== null && (o[k] < -0.95 || o[k] > 3)) err(`${c.id}: ${nm}.${k} = ${o[k]} out of range`);
      nRet++; if (o[k] === null) nNull++;
    }
  }
  const yrs = Math.max(0, Math.min(3, LAST - c.year));
  if (r.ret3.years !== yrs) err(`${c.id}: ret3.years ${r.ret3.years}, expected ${yrs}`);
  if (yrs < 3 && !c.notes.some((n) => n.includes(`只有 ${yrs} 年`))) err(`${c.id}: needs the 「只有 ${yrs} 年」 note`);
  for (const k of ['cash', 'bond', 'equity', 'bench']) if (r.ret1[k] === null) err(`${c.id}: home ${k} 1y return missing`);
  if (!Array.isArray(c.notes)) err(`${c.id}: notes`);
  if (c.year <= 1965 && !c.notes.some((n) => n.includes('澳镑'))) err(`${c.id}: needs the 澳镑 note`);
}
for (const id of want.keys()) if (!ids.has(id)) err(`missing card ${id}`);

// batch 1: 10 cards, every country and every type
const b1 = BLIND.cards.filter((c) => c.batch === 1);
if (b1.length !== 10) err(`batch 1 has ${b1.length} cards, want 10`);
for (const iso of Object.keys(DECK)) if (!b1.some((c) => c.iso === iso)) err(`batch 1 lacks ${iso}`);
for (const t of ['危', '转', '平']) if (!b1.some((c) => c.type === t)) err(`batch 1 lacks type ${t}`);

// wording
const raw = readFileSync(path.join(ROOT, 'src/data/blind-cards.js'), 'utf8');
if (/同比|环比/.test(raw)) err('同比/环比 found: write 比一年前 / 比上季');

// ------------------------------------------------------------ no look-ahead
let lookahead = 'skipped (--fast)';
if (!process.argv.includes('--fast')) {
  const py = path.join(process.env.USERPROFILE || '', '.venvs', 'dalio432', 'Scripts', 'python.exe');
  const out = execFileSync(py, ['-I', '-X', 'utf8', path.join(ROOT, 'tools', 'build_blind_data.py'), '--views-truncated'],
    { cwd: ROOT, encoding: 'utf8', maxBuffer: 64 << 20, env: { ...process.env, PYTHONIOENCODING: 'utf-8' } });
  const trunc = JSON.parse(out);
  let same = 0;
  for (const c of BLIND.cards) {
    const a = JSON.stringify(c.view), b = JSON.stringify(trunc[c.id]);
    if (a === b) same++;
    else {
      // name the first differing field
      const fa = JSON.parse(a), fb = trunc[c.id] || {};
      const diff = [];
      const walk = (x, y, p) => {
        if (diff.length > 3) return;
        if (typeof x !== 'object' || x === null || typeof y !== 'object' || y === null) { if (JSON.stringify(x) !== JSON.stringify(y)) diff.push(`${p}: ${JSON.stringify(x)} vs ${JSON.stringify(y)}`); return; }
        for (const k of new Set([...Object.keys(x), ...Object.keys(y)])) walk(x[k], y[k], `${p}.${k}`);
      };
      walk(fa, fb, 'view');
      err(`${c.id}: view differs when data is cut at ${c.year} (look-ahead): ${diff.join('; ')}`);
    }
  }
  lookahead = `${same}/${BLIND.cards.length} views identical with data cut at the card's year`;
}

// ------------------------------------------------------------ report
const by = (k) => Object.entries(BLIND.cards.reduce((m, c) => ((m[c[k]] = (m[c[k]] || 0) + 1), m), {})).map(([a, b]) => `${a} ${b}`).join(', ');
console.log(`cards: ${BLIND.cards.length} (${by('iso')}; ${by('type')}); batch 1: ${b1.map((c) => c.id).join(' ')}`);
console.log(`holdout (保留样本): ${BLIND.cards.filter((c) => c.holdout).map((c) => c.id).join(' ')}`);
console.log(`returns: ${nRet - nNull}/${nRet} finite, ${nNull} explicit null`);
console.log(`no look-ahead: ${lookahead}`);
if (errors.length) {
  console.log(`\n${errors.length} error(s):`);
  for (const e of errors) console.log('  ✗ ' + e);
  process.exit(1);
}
console.log('OK');
