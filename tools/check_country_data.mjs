// Checks src/data/world.js and src/data/countries/*.js against the US file and WORLD-CONTRACT.md.
// Run: node tools/check_country_data.mjs      (exit 1 on errors; prints coverage per country x key)
import { US_Q } from '../src/data/us-quarterly.js';
import { WORLD } from '../src/data/world.js';
import { COUNTRY_DATA, COUNTRY_READY } from '../src/data/countries/index.js';

const errors = [];
const warns = [];
const err = (m) => errors.push(m);
const warn = (m) => warns.push(m);

// optional series: the engine's real fiscal path (cp.fiscalRealPath: USA, GBR) and display-only extras (GBR bankNplRatio); not required
const US_ONLY = new Set(['govDeficitGdp', 'govInterestGdp', 'bankNplRatio']);
const US_KEYS = Object.keys(US_Q.series).filter((k) => !US_ONLY.has(k));
const EXTRA_KEYS = ['fxPerUsd', 'exportsGdp', 'importsGdp', 'foreignGovHoldShare'];
const RANGES = {
  policyRate: [-0.01, 0.25], mortgageRate: [-0.01, 0.25], gov10y: [-0.01, 0.25],
  cpiYoY: [-0.05, 0.30], coreCpiYoY: [-0.05, 0.30], unemployment: [0.01, 0.30],
  gdpRealGrowthYoY: [-0.30, 0.30], hhDsr: [0, 0.5], privateCreditGdp: [0, 6], hhDebtGdp: [0, 3], govDebtGdp: [0, 5],
  exportsGdp: [0, 1.5], importsGdp: [0, 1.5], foreignGovHoldShare: [0, 1], govDeficitGdp: [-0.1, 0.35], govInterestGdp: [-0.01, 0.12], bankNplRatio: [0, 0.5],
  fxPerUsd: [0.2, 2000], houseIndex: [1, 2000], equityIndex: [1, 5000], goldIndex: [1, 5000],
};
const positive = ['gdpNominal', 'oilPrice', 'bankCredit', 'fxPerUsd', 'houseIndex', 'equityIndex', 'goldIndex'];

const pct = (arr) => {
  const n = arr.filter((x) => x !== null).length;
  return Math.round((100 * n) / arr.length);
};
const span = (arr, dates) => {
  const i = arr.findIndex((x) => x !== null);
  if (i < 0) return '--';
  let j = arr.length - 1;
  while (arr[j] === null) j--;
  return `${dates[i]}-${dates[j]}`;
};

// ------------------------------------------------------------ country files
const coverage = {};
for (const [iso, loader] of Object.entries(COUNTRY_DATA)) {
  let D;
  try {
    D = await loader();
  } catch (e) {
    err(`${iso}: import failed: ${e.message}`);
    continue;
  }
  if (!D || !D.dates || !D.series) { err(`${iso}: missing dates/series`); continue; }
  if (D.dates.length !== 124) err(`${iso}: dates length ${D.dates.length} != 124`);
  if (JSON.stringify(D.dates) !== JSON.stringify(US_Q.dates)) err(`${iso}: dates differ from US_Q.dates`);
  if (D.reservedFrom !== US_Q.reservedFrom) err(`${iso}: reservedFrom ${D.reservedFrom} != ${US_Q.reservedFrom}`);
  for (const k of US_KEYS) if (!(k in D.series)) err(`${iso}: missing key ${k}`);
  if (iso !== 'USA') for (const k of EXTRA_KEYS) if (!(k in D.series)) err(`${iso}: missing extra key ${k}`);
  if (iso !== 'USA' && !(D.meta && D.meta.sources && Array.isArray(D.meta.notes))) err(`${iso}: meta.sources / meta.notes missing`);
  coverage[iso] = {};
  for (const [k, arr] of Object.entries(D.series)) {
    if (!Array.isArray(arr) || arr.length !== D.dates.length) { err(`${iso}.${k}: length ${arr && arr.length} != ${D.dates.length}`); continue; }
    coverage[iso][k] = { pct: pct(arr), span: span(arr, D.dates) };
    const r = RANGES[k];
    arr.forEach((x, i) => {
      if (x === null) return;
      if (typeof x !== 'number' || !Number.isFinite(x)) { err(`${iso}.${k}[${D.dates[i]}]: not finite (${x})`); return; }
      if (r && (x < r[0] || x > r[1])) err(`${iso}.${k}[${D.dates[i]}]: ${x} outside ${r[0]}..${r[1]}`);
      if (positive.includes(k) && x <= 0) err(`${iso}.${k}[${D.dates[i]}]: ${x} not > 0`);
    });
  }
  if (iso !== 'USA' && D.meta && D.meta.sources) {
    for (const k of Object.keys(D.series)) if (!(k in D.meta.sources)) warn(`${iso}.${k}: no meta.sources entry`);
  }
}

// COUNTRY_READY
for (const [iso, v] of Object.entries(COUNTRY_READY)) {
  if (!(iso in COUNTRY_DATA)) err(`COUNTRY_READY has ${iso} but COUNTRY_DATA does not`);
  if (iso === 'USA' && v !== true) err('COUNTRY_READY.USA must be true');
}
for (const iso of Object.keys(COUNTRY_DATA)) if (!(iso in COUNTRY_READY)) err(`COUNTRY_DATA has ${iso} but COUNTRY_READY does not`);

// ------------------------------------------------------------ world.js
const Y = WORLD.years;
if (!Array.isArray(Y) || Y[0] !== 1995 || Y[Y.length - 1] !== 2025 || Y.length !== 31) err('WORLD.years must be 1995..2025');
if (WORLD.reservedFrom !== 2022) err('WORLD.reservedFrom must be 2022');
const WIDS = ['USA', 'CHN', 'EA', 'JPN', 'GBR', 'AUS', 'ROW'];
const W_RANGES = {
  policyRate: [-0.01, 0.5], cpiYoY: [-0.05, 0.6], currentAccountGdp: [-0.3, 0.4], exportsGdp: [0, 1.5], importsGdp: [0, 1.5],
  pvtDebtGdp: [0, 6], govDebtGdp: [0, 5], gdpUsd: [1, 1e6], fxPerUsd: [0.2, 2000], houseReal: [1, 1000],
};
const worldCov = {};
for (const id of WIDS) {
  const c = WORLD.countries[id];
  if (!c) { err(`WORLD.countries.${id} missing`); continue; }
  if (!c.name) err(`WORLD.countries.${id}.name missing`);
  worldCov[id] = {};
  for (const [k, arr] of Object.entries(c)) {
    if (!Array.isArray(arr)) continue;
    if (arr.length !== Y.length) { err(`WORLD.${id}.${k}: length ${arr.length} != ${Y.length}`); continue; }
    worldCov[id][k] = pct(arr);
    const r = W_RANGES[k];
    arr.forEach((x, i) => {
      if (x === null) return;
      if (typeof x !== 'number' || !Number.isFinite(x)) err(`WORLD.${id}.${k}[${Y[i]}]: not finite`);
      else if (r && (x < r[0] || x > r[1])) err(`WORLD.${id}.${k}[${Y[i]}]: ${x} outside ${r[0]}..${r[1]}`);
    });
  }
  if (!('longStage' in c)) err(`WORLD.${id}.longStage missing`);
}
for (const r of WIDS) {
  const row = WORLD.trade[r];
  if (!row) { err(`WORLD.trade.${r} missing`); continue; }
  for (const c of WIDS) {
    if (c === r) continue;
    const arr = row[c];
    if (!arr) { err(`WORLD.trade.${r}.${c} missing`); continue; }
    if (arr.length !== Y.length) err(`WORLD.trade.${r}.${c}: length ${arr.length}`);
    arr.forEach((x, i) => {
      if (x === null) return;
      if (!Number.isFinite(x)) err(`WORLD.trade.${r}.${c}[${Y[i]}]: not finite`);
      else if (x < 0) err(`WORLD.trade.${r}.${c}[${Y[i]}]: negative ${x}`);
    });
  }
}
for (const [k, arr] of Object.entries(WORLD.reserves)) {
  if (arr.length !== Y.length) err(`WORLD.reserves.${k}: length ${arr.length}`);
  arr.forEach((x, i) => { if (x !== null && (!Number.isFinite(x) || x < 0 || x > 1)) err(`WORLD.reserves.${k}[${Y[i]}]: ${x}`); });
}
Y.forEach((y, i) => {
  let s = 0, n = 0;
  for (const arr of Object.values(WORLD.reserves)) if (arr[i] !== null) { s += arr[i]; n++; }
  if (n && Math.abs(s - 1) > 0.02) err(`WORLD.reserves shares sum ${s.toFixed(3)} in ${y}`);
});
for (const [k, arr] of Object.entries(WORLD.ustForeign)) {
  if (arr.length !== Y.length) err(`WORLD.ustForeign.${k}: length ${arr.length}`);
  arr.forEach((x, i) => { if (x !== null && (!Number.isFinite(x) || x < 0)) err(`WORLD.ustForeign.${k}[${Y[i]}]: ${x}`); });
}
if (!WORLD.meta || !WORLD.meta.sources || !Array.isArray(WORLD.meta.notes)) err('WORLD.meta.sources / notes missing');

// ------------------------------------------------------------ report
console.log('\n=== coverage % non-null (country files; span of valid data) ===');
const isos = Object.keys(coverage).filter((i) => i !== 'USA');
const cols = ['USA', ...isos];
const keys = [...new Set([...US_KEYS, ...EXTRA_KEYS])];
console.log('key'.padEnd(20) + cols.map((c) => c.padStart(5)).join(' '));
for (const k of keys) {
  console.log(k.padEnd(20) + cols.map((c) => {
    const v = coverage[c] && coverage[c][k];
    return (v ? String(v.pct) : '-').padStart(5);
  }).join(' '));
}
console.log('\nspans:');
for (const iso of isos) {
  console.log(iso + ': ' + keys.map((k) => `${k}=${coverage[iso][k] ? coverage[iso][k].span : '-'}`).join('  '));
}
console.log('\n=== world.js coverage % ===');
const wkeys = [...new Set(WIDS.flatMap((i) => Object.keys(worldCov[i] || {})))];
console.log('key'.padEnd(20) + WIDS.map((c) => c.padStart(5)).join(' '));
for (const k of wkeys) console.log(k.padEnd(20) + WIDS.map((c) => String(worldCov[c] && worldCov[c][k] !== undefined ? worldCov[c][k] : '-').padStart(5)).join(' '));
const tn = [];
for (const r of WIDS) for (const c of WIDS) if (r !== c) tn.push(pct(WORLD.trade[r][c]));
console.log(`trade cells ${tn.length}, min coverage ${Math.min(...tn)}%`);
console.log('reserves coverage', Object.fromEntries(Object.entries(WORLD.reserves).map(([k, v]) => [k, pct(v)])));
console.log('ustForeign coverage', Object.fromEntries(Object.entries(WORLD.ustForeign).map(([k, v]) => [k, pct(v)])));
console.log('COUNTRY_READY', JSON.stringify(COUNTRY_READY));

if (warns.length) { console.log(`\n${warns.length} warning(s):`); warns.slice(0, 20).forEach((w) => console.log('  warn: ' + w)); }
if (errors.length) {
  console.log(`\n${errors.length} ERROR(S):`);
  errors.slice(0, 60).forEach((e) => console.log('  ' + e));
  process.exit(1);
}
console.log('\nOK: no errors');
