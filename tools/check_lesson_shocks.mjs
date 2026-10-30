// node tools/check_lesson_shocks.mjs [--no-browser] [--shots]
//   (the browser part starts its own static server on 8331 (BASE=http://127.0.0.1:PORT/ overrides) and headless Edge on CDP port 9531; both are stopped at the end)
// Checks the lesson L2 「是水的问题还是河道的问题？」 (src/data/lesson-shocks.js), its data (src/data/shock-events.js) and panels (src/ui/shock-lab.js):
//  1. data      every trajectory point of shock-events.js recomputed here from the raw files (JST csv in ../dalio_432, read only; from a worktree
//               under <repo>/.claude/worktrees/<name> the main checkout's sibling dalio_432 is found too, or set JST_CSV=<path>; data_src/shocks
//               FRED + IMF WEO): x (GDP vs the old trend path), dy (inflation vs the base year), growth, inflation, unemployment; years >= 2022 flagged hold
//  2. shape     v3 rules (tools/DESIGN-v3.md): id shk, the question as the title, <= 6 steps incl. the intro, intro = conclusion first + 下面分 N 步 =
//               the step titles; step 1 shows the 测流断面 on the diagram first (glow channel, question) and names 宽 = 产能, 水位 = 物价, 流量 = GDP
//               in the answer; the example = 2021 (covid, 水多了) then 2022 (ukr, 河道变窄); the Capex step runs the sim (reveal 2020Q4 -> 2023Q4
//               with vals / claims / hl); the last step carries the 三问 ending and hands over to m2; every card is complete
//  3. numbers   every number typed in a step (title, text, question, answerHint, relation, ending) or a card (one, data, policy, ring) is listed in
//               nums and recomputes from the raw data to exactly the typed string; every facts claim holds
//  4. words     no 同比/环比 anywhere; glossary words (no 河道宽度 / 资产水库 / 欠条箱 / 国境线); 判断 labels; 2022+ data says 保留样本
//  5. engine    the Capex step (step 4) on the real sim (src/ui/lessons-town.js, the same code check_lessons and the UI run): placeholders fill, claims hold;
//               the typed lag (6 quarters) = the engine's Capex -> capacity lag in history mode (src/engine/economy.js)
//  6. browser   headless Edge: every panel mounts / unmounts in tools/shock-lab-demo.html with no JS errors at iPad 1180x820 and phone 390x844;
//               charts drawn, no sideways overflow, chart text >= 11px, tapping an event opens its card, hold points hollow, lesson walk.
//               --shots saves tools/shots/<panel id>[-war]-<pad|phone>.png (shk-quad = 疫情 selected) and shk-card-<pad|phone>.png (the 疫情 card)
import { readFileSync, existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { spawn } from 'node:child_process';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { dirname, resolve } from 'node:path';
import { createServer } from 'node:http';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const imp = p => import(pathToFileURL(resolve(ROOT, p)).href);
let fails = 0, oks = 0;
const ok = (c, m) => { if (!c) { fails++; console.log('FAIL:', m); } else { oks++; if (process.env.VERBOSE) console.log('ok:', m); } };
const section = t => console.log('\n== ' + t);

const { LESSON_SHOCKS, SHOCK_CARDS, SHOCK_PARTS, SHOCK_CORNERS, SHOCK_GROUPS } = await imp('src/data/lesson-shocks.js');
const { SHOCK_EVENTS, SHOCK_META } = await imp('src/data/shock-events.js');
const { WAVES } = await imp('src/data/waves.js');
const SKL = await imp('src/ui/shock-lab.js');

/* ---------- raw data ---------- */
const readCsv = p => { const [h, ...rows] = readFileSync(p, 'utf8').trim().split(/\r?\n/); const cols = h.split(','); return rows.map(l => { const v = l.split(','); return Object.fromEntries(cols.map((c, i) => [c, v[i]])); }); };
const num = s => (s === '' || s == null ? NaN : +s);
// the JST panel lives in the sibling repo dalio_432 (read only); from <repo>/.claude/worktrees/<name> look beside the main checkout too
const JST_PATH = [process.env.JST_CSV, resolve(ROOT, '../dalio_432/data/jst_panel.csv'), resolve(ROOT, '../../../../dalio_432/data/jst_panel.csv')].filter(Boolean).find(p => existsSync(p));
if (!JST_PATH) { console.log('FAIL: jst_panel.csv not found (../dalio_432/data/jst_panel.csv; set JST_CSV=<path>)'); process.exit(1); }
const JST = readCsv(JST_PATH);
const jstRow = (iso, y) => JST.find(r => r.iso === iso && +r.year === y);
const fred = id => readCsv(resolve(ROOT, 'data_src/shocks/fred', id + '.csv')).map(r => [r.observation_date.slice(0, 7), num(r[id])]);
const FRED = { GDPC1: fred('GDPC1'), CPIAUCSL: fred('CPIAUCSL'), CPIAUCNS: fred('CPIAUCNS'), UNRATE: fred('UNRATE') };
const annual = (id, y) => { const v = FRED[id].filter(([d, x]) => d.startsWith(y + '-') && Number.isFinite(x)).map(x => x[1]); const need = id === 'GDPC1' ? 4 : 11; return v.length >= need ? v.reduce((a, b) => a + b, 0) / v.length : NaN; };
const WEO = readCsv(resolve(ROOT, 'data_src/shocks/imf/weo_shocks.csv'));
const WEO_W = readCsv(resolve(ROOT, 'data_src/world/imf/weo.csv'));
const weo = (iso, ind, y) => { const r = WEO.find(x => x.COUNTRY === iso && x.INDICATOR === ind && +x.TIME_PERIOD === y) || WEO_W.find(x => x.COUNTRY === iso && x.INDICATOR === ind && +x.TIME_PERIOD === y); if (!r) throw new Error(`no WEO ${iso} ${ind} ${y}`); return +r.OBS_VALUE; };

// annual index levels per country (same splice as tools/build_shock_events.py, written again here)
function usSeries() {
  const gdp = {}, cpi = {}, u = {};
  for (let y = 1870; y <= 1947; y++) { const r = jstRow('USA', y); if (!r) continue; const g = num(r.rgdpmad) * num(r.pop); if (Number.isFinite(g)) gdp[y] = g; if (Number.isFinite(num(r.cpi))) cpi[y] = num(r.cpi); if (Number.isFinite(num(r.unemp))) u[y] = num(r.unemp); }
  for (let y = 1948; y <= 2025; y++) {
    gdp[y] = gdp[y - 1] * annual('GDPC1', y) / annual('GDPC1', y - 1);
    cpi[y] = cpi[y - 1] * annual('CPIAUCSL', y) / annual('CPIAUCSL', y - 1);
    u[y] = annual('UNRATE', y);
  }
  return { gdp, cpi, u };
}
function weoSeries(iso) {
  const gdp = {}, cpi = {}, u = {}; let g = 1, c = 1;
  const ys = WEO.filter(x => x.COUNTRY === iso && x.INDICATOR === 'NGDP_RPCH').map(x => +x.TIME_PERIOD).sort((a, b) => a - b).filter(y => y <= 2025);
  const has = (ind, y) => WEO.some(x => x.COUNTRY === iso && x.INDICATOR === ind && +x.TIME_PERIOD === y);   // CHN CPI starts a year after GDP
  for (const y of ys) { g *= 1 + weo(iso, 'NGDP_RPCH', y) / 100; gdp[y] = g; if (has('PCPIPCH', y)) { c *= 1 + weo(iso, 'PCPIPCH', y) / 100; cpi[y] = c; } const l = WEO.find(x => x.COUNTRY === iso && x.INDICATOR === 'LUR' && +x.TIME_PERIOD === y); u[y] = l ? +l.OBS_VALUE : null; }
  return { gdp, cpi, u };
}
const SER = { USA: usSeries(), DEU: weoSeries('DEU'), CHN: weoSeries('CHN') };
const inflOf = (S, y) => (S.cpi[y] / S.cpi[y - 1] - 1) * 100;
// the event spec is taken from the generated file (base, until, trend window); every value is recomputed
function recompute(e) {
  const S = SER[e.iso], [t0, t1] = e.trend, g = Math.pow(S.gdp[t1] / S.gdp[t0], 1 / (t1 - t0)) - 1;
  const pts = []; for (let y = e.base; y <= e.until; y++) pts.push({ y, x: (S.gdp[y] / (S.gdp[e.base] * Math.pow(1 + g, y - e.base)) - 1) * 100, dy: inflOf(S, y) - inflOf(S, e.base), gr: (S.gdp[y] / S.gdp[y - 1] - 1) * 100, pi: inflOf(S, y), u: S.u[y] ?? null });
  return { g: g * 100, pts };
}
const RE = Object.fromEntries(SHOCK_EVENTS.map(e => [e.id, recompute(e)]));

/* ---------- D: the getters of nums / facts ---------- */
const wavesC = iso => WAVES.countries.find(c => c.iso === iso);
const ECON = readFileSync(resolve(ROOT, 'src/engine/economy.js'), 'utf8');
const lagM = /const lag = dl \? (\d+) : (\d+);/.exec(ECON);
const D = {
  pt(id, y) { const p = RE[id] && RE[id].pts.find(q => q.y === y); if (!p) throw new Error(`no point ${id} ${y}`); return p; },
  ev(id) { const e = SHOCK_EVENTS.find(x => x.id === id); return { g: RE[id].g, base: e.base, trend: e.trend }; },
  us(k, y) { const S = SER.USA; if (k === 'pi') return inflOf(S, y); if (k === 'gr') return (S.gdp[y] / S.gdp[y - 1] - 1) * 100; if (k === 'u') return S.u[y]; throw new Error('us ' + k); },
  cpiNsa(m) { const a = FRED.CPIAUCNS.find(x => x[0] === m), y = String(+m.slice(0, 4) - 1) + m.slice(4), b = FRED.CPIAUCNS.find(x => x[0] === y); if (!a || !b) throw new Error('no CPI ' + m); return (a[1] / b[1] - 1) * 100; },
  cpiMonths(from, until) { return FRED.CPIAUCNS.map(x => x[0]).filter(m => m >= from && m <= until); },
  weo,
  jst(iso, col, y) { const r = jstRow(iso, y); const v = r && num(r[col]); if (!Number.isFinite(v)) throw new Error(`no JST ${iso} ${col} ${y}`); return v; },
  waves(iso, a, b) { const c = wavesC(iso); const L = y => { const i = c.years.indexOf(y); return Math.log(1 + c.dev[i] / 100) + (y - c.years[0]) * Math.log(1 + c.trend / 100); }; return (Math.exp((L(b) - L(a)) / (b - a)) - 1) * 100; },
  capexLag: lagM ? +lagM[1] : NaN,
  card: id => SHOCK_CARDS.find(c => c.id === id),
};
const FMT = { int: v => (Number.isInteger(v) ? String(v) : 'non-int ' + v), n0: v => String(Math.round(v)), n1: v => (Math.round(v * 10 + 1e-9 * Math.sign(v)) / 10).toFixed(1), a1: v => Math.abs(v).toFixed(1), pct0: v => (v * 100).toFixed(0) };

/* ---------- 1. data ---------- */
section('1. data: shock-events.js recomputed from the raw files');
const IDS = SHOCK_EVENTS.map(e => e.id);
ok(new Set(IDS).size === IDS.length && IDS.length >= 10, `${IDS.length} events, unique ids`);
for (const e of SHOCK_EVENTS) {
  const R = RE[e.id];
  ok(Math.abs(R.g - e.g) < 0.006, `${e.id}: trend ${e.trend.join('–')} = ${R.g.toFixed(2)}%/yr (file ${e.g})`);
  ok(e.pts.length === e.until - e.base + 1 && e.pts[0].y === e.base && e.pts[0].x === 0 && e.pts[0].dy === 0, `${e.id}: ${e.pts.length} points from the base year (0, 0)`);
  e.pts.forEach((p, i) => {
    const q = R.pts[i];
    const same = ['x', 'dy', 'gr', 'pi'].every(k => Math.abs(p[k] - q[k]) < 0.006) && (p.u == null ? q.u == null || !Number.isFinite(q.u) : Math.abs(p.u - q.u) < 0.06);
    ok(same, `${e.id} ${p.y}: (${p.x}, ${p.dy}) gr ${p.gr} pi ${p.pi} u ${p.u}` + (same ? '' : ` != recomputed (${q.x.toFixed(2)}, ${q.dy.toFixed(2)}) gr ${q.gr.toFixed(2)} pi ${q.pi.toFixed(2)} u ${q.u}`));
    ok(!!p.hold === (p.y >= SHOCK_META.holdFrom), `${e.id} ${p.y}: hold flag ${!!p.hold} (保留样本 from ${SHOCK_META.holdFrom})`);
  });
  ok(e.pts.every(p => p.y <= 2025), `${e.id}: no WEO projection years (<= 2025)`);
  ok(SHOCK_GROUPS[e.group], `${e.id}: group ${e.group}`);
}
// the splice: JST and FRED agree where they overlap (1948 inflation), and JST's US unemployment is not used after 1947 (its 2019 value is wrong)
{ const r47 = jstRow('USA', 1947), r48 = jstRow('USA', 1948); const jPi = (num(r48.cpi) / num(r47.cpi) - 1) * 100; ok(Math.abs(jPi - D.us('pi', 1948)) < 0.1, `splice: 1948 inflation JST ${jPi.toFixed(2)} ≈ FRED ${D.us('pi', 1948).toFixed(2)}`); }
ok(Math.abs(D.us('u', 2019) - 3.7) < 0.05, `US unemployment 2019 from FRED = ${D.us('u', 2019).toFixed(2)} (JST says ${jstRow('USA', 2019).unemp})`);
// the expected corners of the headline events
const corner = (id, y) => { const p = D.pt(id, y); return (p.x < 0 ? 'l' : 'r') + (p.dy > 0 ? 'u' : 'd'); };
for (const [id, y, c] of [['oil73', 1975, 'lu'], ['oil79', 1980, 'lu'], ['gfc', 2009, 'ld'], ['net', 1998, 'rd'], ['covid', 2020, 'ld'], ['b1', 1969, 'ru'], ['volcker', 1983, 'ld'], ['gd', 1933, 'ld'], ['ukr', 2023, 'lu'], ['chn', 2025, 'ld']])
  ok(corner(id, y) === c, `${id} ${y} lands in ${SHOCK_CORNERS[c].name} (${c})`);

/* ---------- 2. shape ---------- */
section('2. lesson shape');
const L = LESSON_SHOCKS, S = L.steps;
ok(L.id === 'shk' && L.kind === 'shocks' && L.label === '第 2 课' && L.title === '是水的问题还是河道的问题？' && L.oneLine && L.available === true && L.rulesOn === 'all', 'id shk, kind shocks, 第 2 课, title = the question, oneLine, available, rulesOn all');
ok(S.length <= 6 && S.length === 6 && S[0].type === 'intro' && S.slice(1).every(s => s.type === 'reveal'), `v3: at most 6 steps incl. the intro (${S.length}: intro + ${S.length - 1} reveal)`);
S.forEach((s, i) => {
  ok(s.title && Array.isArray(s.text) && s.text.length >= 2, `step ${i}: title/text`);
  if (i >= 1) ok(s.title.startsWith(`第 ${i} 步：`), `step ${i}: numbered title ${s.title}`);
  ok(/^\*\*结论：/.test(s.text[0]), `step ${i}: conclusion first`);
  if (s.panel) ok(SKL.SHOCK_PANELS.includes(s.panel.id), `step ${i}: panel ${s.panel.id} exists`);
  if (s.panel && s.panel.select) ok(SHOCK_EVENTS.some(e => e.id === s.panel.select && e.group === (s.panel.group || 'modern')), `step ${i}: selected event ${s.panel.select} is drawn in group ${s.panel.group}`);
});
{
  const line = S[0].text.find(t => /^下面分 \d+ 步/.test(t)), n = +line.match(/\d+/)[0];
  ok(n === S.length - 1, `intro: 下面分 ${n} 步 = ${S.length - 1}`);
  const items = line.replace(/^下面分 \d+ 步：/, '').replace(/。$/, '').split('→').map(x => x.trim());
  ok(items.length === n, `intro outline lists ${items.length} items`);
  items.forEach((t, k) => { const tt = S[k + 1].title.replace(/^第 \d+ 步：/, ''); ok(tt.includes(t.slice(0, 2)) || t.includes(tt.slice(0, 2)), `outline item ${k + 1} "${t}" ~ "${tt}"`); });
}
ok(S.map(s => (s.panel ? s.panel.id + (s.panel.select ? ':' + s.panel.select : '') : '-')).join() === 'shk-rule,-,shk-quad:covid,shk-quad:ukr,-,shk-lines', 'panel per step: intro = the four corners (four small 断面), the 断面 on the diagram, 2021 covid, 2022 ukr, Capex on the sim, 临时还是永久');
// v3: one question, one new piece (shown first, then named), one example
ok(S[0].text.join('').includes('是水的问题，还是河道的问题') && S[0].text[0].includes('测流断面'), 'intro: asks the one question, the conclusion names the 测流断面');
const NEW = S[1], nameIt = (NEW.answerHint || []).join('');
ok(!NEW.panel && NEW.glow && (NEW.glow.parts || []).includes('channel') && NEW.question && /断面/.test(NEW.text.slice(1).join('')), 'step 1: shows the 断面 on the diagram first (glow channel, no panel) and asks');
ok(['断面宽度 = 产能', '断面水位 = 物价', '流量 = GDP'].every(t => nameIt.includes(t)), 'step 1: names it in the answer: 断面宽度 = 产能, 断面水位 = 物价, 流量 = GDP');
ok(/水多了/.test(S[2].title) && S[2].title.includes('2021') && /河道变窄/.test(S[3].title) && S[3].title.includes('2022'), 'the example: 2021 水多了 (step 2) vs 2022 河道变窄 (step 3)');
ok(S[2].text[0].includes('同一个方向') || S[2].text[0].includes('一起往上'), 'step 2: same direction = water');
ok(S[3].text[0].includes('河道的问题') && S[3].text[0].includes('流量却不涨'), 'step 3: level up, flow flat = channel');
const CX = S[4];
ok(!CX.panel && CX.from === '2020Q4' && CX.until === '2023Q4' && CX.vals && CX.claims && CX.claims.length >= 2 && ['capex', 'capacity'].every(h => CX.hl.includes(h)), 'step 4 (Capex): sim step 2020Q4 -> 2023Q4, vals, claims, hl capex/capacity');
ok(CX.text[0].includes('拓宽断面') && CX.text[0].includes('要等'), 'step 4: Capex widens the 断面, with a lag');
ok(S.filter(s => s.vals || s.claims).length === 1, 'exactly one sim step');
ok(S[5].text[0].includes('看穿') && S[5].text[0].includes('永久') && S[5].text.join('').includes('长直线 = 断面宽度的趋势') && S[5].text.join('').includes('波浪 = 水'), 'last step: temporary vs permanent (看穿), 三条线 link: straight line = 断面宽度, waves = water');
const last = S[S.length - 1];
ok(last.next === 'm2', 'last step hands over to m2 (央行怎么让河涨落？)');
ok(last.ending && ['q1', 'q2', 'q3'].every(k => typeof last.ending[k] === 'string' && last.ending[k].length > 10), 'ending { q1, q2, q3 }');
ok(last.ending && last.ending.q1.startsWith('水的问题还是河道的问题？') && last.ending.q2.startsWith('环上哪一步？') && last.ending.q3.startsWith('谁赢谁输、钱放哪？'), 'ending asks the three fixed questions (tools/COURSE-V3.md)');
ok(last.ending && last.ending.q1.includes('2021') && last.ending.q1.includes('2022'), 'ending q1 answers for the example (2021 vs 2022)');
ok(S.slice(0, -1).every(s => !s.ending && s.next == null), 'only the last step has the ending and the next');
// cards
const CIDS = SHOCK_CARDS.map(c => c.id);
ok(new Set(CIDS).size === CIDS.length, `${CIDS.length} cards, unique`);
for (const need of ['ww1', 'gd', 'r37', 'ww2', 'b1', 'oil73', 'oil79', 'volcker', 'net', 'wto', 'mining', 'gfc', 'covid', 'ukr', 'tariff', 'mig', 'jpn', 'ai', 'chn']) ok(CIDS.includes(need), `card ${need}`);
ok(SHOCK_EVENTS.every(e => CIDS.includes(e.id)), 'every drawn event has a card');
const PK = SHOCK_PARTS.map(p => p.k);
ok(PK.join() === 'width,water,pool,debt,border,mood', 'six parts');
for (const c of SHOCK_CARDS) {
  ok(c.name && c.when && c.where && ['water', 'channel', 'both'].includes(c.kind) && c.one && c.policy && c.ring, `card ${c.id}: complete`);
  ok(c.hit.length >= 2 && c.hit.every(h => PK.includes(h.k) && (h.s === 1 || h.s === -1) && h.lab && [1, 2, 3].includes(h.w)), `card ${c.id}: ${c.hit.length} hits, valid parts/sign/weight`);
  ok(new Set(c.hit.map(h => h.k)).size === c.hit.length, `card ${c.id}: one entry per part`);
  ok(c.data === null || typeof c.data === 'string', `card ${c.id}: data string or null`);
  if (SHOCK_EVENTS.some(e => e.id === c.id)) ok(typeof c.data === 'string', `card ${c.id}: drawn -> has data`);
}
// the kind on the card agrees with the data where the card is a pure water / channel case
for (const [id, y] of [['oil73', 1975], ['oil79', 1980], ['net', 1998], ['gfc', 2009], ['volcker', 1983], ['gd', 1933], ['b1', 1969], ['chn', 2025]]) {
  const k = D.card(id).kind, c = corner(id, y), same = c === 'ru' || c === 'ld';
  ok((k === 'water') === same, `card ${id}: kind ${k} matches the quadrant (${c} = ${same ? '同向 = 水' : '反向 = 河道'})`);
}

/* ---------- 3. numbers ---------- */
section('3. every typed number recomputes from the raw data');
const ALLOW = [/\*\*/g, /\{\w+\}/g, /(?<![\d.])(19|20)\d{2}Q[1-4]/g, /(?<![\d.])(19|20)\d{2}(?![\d.])/g, /\d{1,2}\s*月/g, /第\s*\d+\s*[步课]/g, /下面分\s*\d+\s*步/g, /\bB[12]\b/g];
const tokens = t => { let s = String(t); for (const r of ALLOW) s = s.replace(r, ' '); return (s.match(/[−-]?\d+(?:\.\d+)?/g) || []).map(x => x.replace('−', '-')); };
function checkNums(where, strings, nums, facts) {
  const all = strings.filter(Boolean).join('\n'), tk = tokens(all), listed = new Set((nums || []).map(n => n.t));
  for (const t of tk) ok(listed.has(t), `${where}: typed number ${t} is listed in nums`);
  for (const n of nums || []) {
    let v, got; try { v = n.f(D); got = FMT[n.fmt](v); } catch (e) { got = 'ERROR ' + e.message; }
    ok(got === n.t, `${where}: ${n.t} = ${got} (${n.fmt}${typeof v === 'number' ? ', raw ' + +v.toFixed(4) : ''})`);
    ok(tk.includes(n.t), `${where}: nums ${n.t} appears in the text`);
  }
  for (const c of facts || []) { let r = false; try { r = !!c.f(D); } catch (e) { console.log('  error', e.message); } ok(r, `${where} fact: ${c.note}`); }
  return (nums || []).length;
}
let nN = 0, nF = 0;
S.forEach((s, i) => {
  nN += checkNums(`step ${i}`, [s.title, ...s.text, s.question, ...(s.answerHint || []), s.relation, ...(s.ending ? Object.values(s.ending) : [])], s.nums, s.facts);
  nF += (s.facts || []).length;
});
for (const c of SHOCK_CARDS) { nN += checkNums(`card ${c.id}`, [c.name, c.one, c.data, c.policy, c.ring, ...c.hit.map(h => h.lab + h.t)], c.nums, c.facts); nF += (c.facts || []).length; }
console.log(`  numbers checked: ${nN}, facts: ${nF}`);
// the two historical claims the user named
console.log(`  1946 US CPI (annual average, JST): ${D.us('pi', 1946).toFixed(2)}%;  US CPI peak (CPIAUCNS, vs a year before): ${D.cpiNsa('2022-06').toFixed(2)}% in 2022-06; 2022 annual average ${D.us('pi', 2022).toFixed(2)}%`);
ok(Math.abs(D.us('pi', 1946) - 8) < 0.5, '1946 US CPI ≈ 8% (stated as 8.3%)');
ok(Math.abs(D.cpiNsa('2022-06') - 9) < 0.15, 'COVID-era CPI ≈ 9% (stated as 9.1% for 2022-06)');

/* ---------- 4. words ---------- */
section('4. words');
const strip = o => JSON.stringify(o, (k, v) => (typeof v === 'function' ? undefined : v));
const code = ['src/ui/shock-lab.js', 'src/data/shock-events.js', 'src/data/lesson-shocks.js', 'assets/css/shock-lab.css', 'tools/shock-lab-demo.html'].map(p => readFileSync(resolve(ROOT, p), 'utf8')).join('\n');
ok(!/同比|环比/.test(strip(L) + strip(SHOCK_CARDS) + code), 'no 同比/环比 anywhere (lesson, cards, panels, data)');
ok(!/河道宽度|资产水库|欠条箱|国境线/.test(strip(L) + strip(SHOCK_CARDS) + strip(SHOCK_PARTS) + strip(SHOCK_CORNERS) + readFileSync(resolve(ROOT, 'src/ui/shock-lab.js'), 'utf8')), 'glossary (tools/DESIGN-v3.md): no 河道宽度 / 资产水库 / 欠条箱 / 国境线 (断面宽度, 资产池, 地下水位, 闸)');
ok(S[3].text.join('').includes('判断'), 'step 3: the oil price claim says 判断 (no oil price data)');
ok(S[5].text.join('').includes('判断') && code.includes('（判断）'), 'the part mappings are labelled 判断 (last step text and every card)');
for (const c of SHOCK_CARDS) if (c.data && /20(2[2-9])/.test(c.data.replace(/2014–2019/, ''))) ok(c.data.includes('保留样本'), `card ${c.id}: 2022+ data labelled 保留样本`);
for (const [i, s] of S.entries()) { const t = s.text.join('') + (s.ending ? Object.values(s.ending).join('') : ''); if (/2022|2023/.test(t) && (s.nums || s.vals)) ok(t.includes('保留样本'), `step ${i}: 2022+ data labelled 保留样本`); }
ok(/保留样本/.test(SHOCK_META.method), 'the quadrant method note says 保留样本');

/* ---------- 5. engine: the Capex step on the real sim ---------- */
section('5. engine: the Capex step (step 4) on the US sim');
{
  ok(lagM && +lagM[1] === 6, `economy.js: Capex -> capacity lag = ${lagM && lagM[1]} quarters in history mode (delays on), ${lagM && lagM[2]} in the town`);
  const { US_Q } = await imp('src/data/us-quarterly.js');
  const LT = await imp('src/ui/lessons-town.js');
  const pos = LT.lessonPositions(L), win = pos[4];
  ok(win.from === '2020Q4' && win.until === '2023Q4', `step 4 window ${win.from} -> ${win.until}`);
  for (const d of [L.startDate, L.endDate, CX.from, CX.until]) ok(US_Q.dates.includes(d), `date ${d} in the US data`);
  const tbl = LT.buildTable(US_Q, L, CX, win), miss = [], filled = LT.fillStep(CX, tbl, miss);
  ok(miss.length === 0, 'all placeholders filled' + (miss.length ? ': ' + miss.join(' ') : ''));
  const flat = [filled.text, filled.answerHint, filled.relation, filled.question].flat().join(' | ');
  ok(!/NaN|undefined|null|Infinity|[{}]/.test(flat), 'filled text clean');
  console.log('  filled: ' + [...filled.text.slice(2), ...filled.answerHint.slice(1)].join(' / '));
  for (const c of CX.claims) {
    const g = { get: c.get, from: c.from, until: c.until }, a = LT.evalGet(US_Q, L, g, win);
    let pass;
    if (c.dateBetween) pass = typeof a === 'string' && LT.dateT(a) >= LT.dateT(c.dateBetween[0]) && LT.dateT(a) <= LT.dateT(c.dateBetween[1]);
    else { const b = c.vs ? LT.evalGet(US_Q, L, { get: c.vs.get, from: c.vs.from || c.from, until: c.vs.until || c.until }, win) : 0; const d = a - b; pass = [['gt', d > c.gt], ['lt', d < c.lt]].filter(([k]) => c[k] !== undefined).every(t => t[1]); }
    ok(pass, `claim: ${c.note} (${typeof a === 'number' ? a.toFixed(4) : a})`);
  }
}

/* ---------- 6. browser ---------- */
if (!process.argv.includes('--no-browser')) await browser();
console.log(`\n${fails ? 'FAILED' : 'ALL OK'}: ${oks} ok, ${fails} fail`);
process.exit(fails ? 1 : 0);

async function browser() {
  section('6. headless Edge (tools/shock-lab-demo.html)');
  const EDGE = 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe';
  const port = 9531, sport = 8331;
  let server = null, BASE = process.env.BASE;
  if (!BASE) {   // own static server (stopped at the end)
    const TYPES = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.mjs': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.json': 'application/json', '.png': 'image/png', '.svg': 'image/svg+xml' };
    server = createServer((req, res) => {
      const p = resolve(ROOT, '.' + decodeURIComponent(new URL(req.url, 'http://x').pathname));
      if (!p.startsWith(ROOT) || !existsSync(p)) { res.writeHead(404); res.end(); return; }
      try { res.writeHead(200, { 'Content-Type': TYPES[p.slice(p.lastIndexOf('.'))] || 'application/octet-stream' }); res.end(readFileSync(p)); } catch (e) { res.writeHead(404); res.end(); }
    });
    await new Promise(r => server.listen(sport, '127.0.0.1', r));
    BASE = `http://127.0.0.1:${sport}/`;
  }
  const prof = resolve((await import('node:os')).tmpdir(), 'shk-lesson-edge-profile');
  const proc = spawn(EDGE, ['--headless=new', '--disable-gpu', '--hide-scrollbars', `--remote-debugging-port=${port}`, `--user-data-dir=${prof}`, '--window-size=1180,820', 'about:blank'], { stdio: 'ignore' });
  const sleep = ms => new Promise(r => setTimeout(r, ms));
  const errors = [];
  try {
    let ver = null;
    for (let i = 0; i < 60 && !ver; i++) { try { ver = await (await fetch(`http://127.0.0.1:${port}/json/version`)).json(); } catch (e) { await sleep(250); } }
    const tabs = async () => (await (await fetch(`http://127.0.0.1:${port}/json`)).json()).filter(x => x.type === 'page');
    let tab = null; for (let i = 0; i < 40 && !tab; i++) { tab = (await tabs())[0]; if (!tab) await sleep(150); }
    const ws = new WebSocket(tab.webSocketDebuggerUrl);
    await new Promise((res, rej) => { ws.onopen = res; ws.onerror = rej; });
    let id = 0; const pending = new Map();
    ws.onmessage = m => {
      const d = JSON.parse(m.data);
      if (d.id && pending.has(d.id)) { pending.get(d.id)(d); pending.delete(d.id); }
      else if (d.method === 'Runtime.exceptionThrown') errors.push(d.params.exceptionDetails.text + ' ' + (d.params.exceptionDetails.exception?.description || ''));
      else if (d.method === 'Runtime.consoleAPICalled' && d.params.type === 'error') errors.push('console.error ' + d.params.args.map(a => a.value || a.description).join(' '));
      else if (d.method === 'Log.entryAdded' && d.params.entry.level === 'error') errors.push('log ' + d.params.entry.text + ' ' + (d.params.entry.url || ''));
    };
    const send = (method, params = {}) => new Promise(res => { const i = ++id; pending.set(i, res); ws.send(JSON.stringify({ id: i, method, params })); });
    const ev = async expr => { const r = await send('Runtime.evaluate', { expression: expr, awaitPromise: true, returnByValue: true }); if (r.result.exceptionDetails) throw new Error(r.result.exceptionDetails.exception?.description || 'eval error'); return r.result.result.value; };
    await send('Runtime.enable'); await send('Page.enable'); await send('Log.enable');
    const viewport = (w, h) => send('Emulation.setDeviceMetricsOverride', { width: w, height: h, deviceScaleFactor: 1, mobile: w < 500 });
    const go = async q => { await send('Page.navigate', { url: BASE + 'tools/shock-lab-demo.html?' + q }); for (let i = 0; i < 40; i++) { await sleep(150); if (await ev('window.__done === true').catch(() => false)) break; } await sleep(250); };
    const shots = process.argv.includes('--shots');
    if (shots) mkdirSync(resolve(ROOT, 'tools/shots'), { recursive: true });
    const saved = [];
    const shot = async name => { const f = resolve(ROOT, `tools/shots/${name}.png`); const r = await send('Page.captureScreenshot', { format: 'png' }); writeFileSync(f, Buffer.from(r.result.data, 'base64')); saved.push(f); };
    const CASES = [['shk-rule', ''], ['shk-quad', '&group=modern&select=covid'], ['shk-quad', '&group=war&select=ww2'], ['shk-lines', ''], ['shk-parts', '']];
    for (const [dev, w, h] of [['pad', 1180, 820], ['phone', 390, 844]]) {
      await viewport(w, h);
      for (const [pid, extra] of CASES) {
        const e0 = errors.length, tag = `${dev} ${pid}${extra ? ' ' + extra.replace(/&/g, ' ') : ''}`;
        await go(`panel=${pid}${extra}`);
        const st = await ev(`(()=>{const r=document.querySelector('.skp'); if(!r) return null; const svgs=[...r.querySelectorAll('svg')];
          return { mounted: window.__mounted, id: r.dataset.panel, svgs: svgs.length, drawn: svgs.every(s => s.querySelector('path,rect,circle,line')),
            over: r.scrollWidth - r.clientWidth, wide: svgs.every(s => s.getBoundingClientRect().right <= r.getBoundingClientRect().right + 1),
            fs: Math.min(...[...r.querySelectorAll('svg text')].filter(t => getComputedStyle(t).display !== 'none').map(t => parseFloat(getComputedStyle(t).fontSize))),
            body: document.documentElement.scrollWidth - document.documentElement.clientWidth } })()`);
        ok(st && st.mounted && st.id === pid, `${tag}: mounted`);
        ok(st && (pid === 'shk-parts' || (st.svgs >= 1 && st.drawn)), `${tag}: ${st && st.svgs} chart(s) drawn`);
        ok(st && st.over <= 1 && st.wide && st.body <= 1, `${tag}: no sideways overflow (panel ${st && st.over}px, page ${st && st.body}px)`);
        if (st && st.svgs) ok(st.fs >= 11, `${tag}: chart text >= 11px (${st.fs})`);
        if (shots && !(pid === 'shk-quad' && extra.includes('covid'))) { await ev(`document.querySelector('.skp').scrollTop=0`); await sleep(100); await shot(`${pid}${extra.includes('war') ? '-war' : ''}-${dev}`); }
        // tap an event -> its card
        const tapped = await ev(`(async()=>{const r=document.querySelector('.skp');
          ${pid === 'shk-rule' ? `r.querySelector('[data-corner="lu"]').dispatchEvent(new MouseEvent('click',{bubbles:true})); await new Promise(z=>setTimeout(z,50)); r.querySelector('.skp-ex [data-ev]').click();`
          : pid === 'shk-parts' ? `r.querySelector('tr[data-ev="covid"]').click();`
          : pid === 'shk-lines' ? `r.querySelector('.skp-chips [data-ev]').click();`
          : `const g=[...r.querySelectorAll('.skp-traj')].find(x=>!x.classList.contains('sel')); g.querySelector('.skp-hit').dispatchEvent(new MouseEvent('click',{bubbles:true}));`}
          await new Promise(z=>setTimeout(z,80)); const c=r.querySelector('.skp-card'); return c ? { id: c.dataset.card, rows: c.querySelectorAll('.skp-hits tr').length, judge: c.textContent.includes('判断'), sel: (r.querySelector('.skp-traj.sel')||{}).dataset?.ev || null, over: r.scrollWidth - r.clientWidth } : null })()`);
        ok(tapped && tapped.id && tapped.rows === 6 && tapped.judge, `${tag}: tap opens a card (${tapped && tapped.id}, 6 part rows, says 判断)`);
        if (pid === 'shk-quad') ok(tapped && tapped.sel === tapped.id, `${tag}: the tapped trajectory is selected (${tapped && tapped.sel})`);
        ok(tapped && tapped.over <= 1, `${tag}: card fits (no sideways overflow)`);
        if (pid === 'shk-quad' && extra.includes('covid')) {
          const hold = await ev(`(()=>{document.querySelector('[data-ev="covid"].skp-chips button, .skp-chips [data-ev="covid"]').click(); const g=document.querySelector('.skp-traj[data-ev="covid"]'); return { hold: g.querySelectorAll('.skp-pt.hold').length, lab: [...g.querySelectorAll('.skp-ylab')].filter(t=>getComputedStyle(t).display!=='none').length, fill: getComputedStyle(g.querySelector('.skp-pt.hold')).fill } })()`);
          ok(hold.hold === 2 && hold.lab >= 2, `${tag}: covid 2022 and 2023 drawn hollow (保留样本: ${hold.hold}), year labels on the selection (${hold.lab})`);
          if (shots) {
            await ev(`document.querySelector('.skp').scrollTop=0`); await sleep(120); await shot(`shk-quad-${dev}`);
            await ev(`(()=>{const r=document.querySelector('.skp'), c=r.querySelector('.skp-card'); r.scrollTop += c.getBoundingClientRect().top - r.getBoundingClientRect().top - 8; return 1})()`); await sleep(120); await shot(`shk-card-${dev}`);
          }
        }
        await ev('window.__shk.unmountShockPanel()');
        const left = await ev(`({ n: document.querySelectorAll('.skp').length, host: document.getElementById('host').children.length })`);
        ok(left.n === 0 && left.host === 0, `${tag}: unmount leaves the host empty`);
        ok(errors.length === e0, `${tag}: no JS errors` + (errors.length > e0 ? ': ' + errors.slice(e0).join(' | ') : ''));
      }
      // group switch inside the quadrant
      const e3 = errors.length;
      await go('panel=shk-quad&group=modern&select=oil73');
      const sw = await ev(`(()=>{const r=document.querySelector('.skp'); r.querySelector('[data-group="war"]').click(); return { n: r.querySelectorAll('.skp-traj').length, ids: [...r.querySelectorAll('.skp-traj')].map(g=>g.dataset.ev).sort().join() } })()`);
      ok(sw.ids === SHOCK_EVENTS.filter(e => e.group === 'war').map(e => e.id).sort().join(), `${dev} group switch -> war events (${sw.ids})`);
      ok(errors.length === e3, `${dev} group switch: no JS errors`);
      // walk the lesson steps in one page
      const e1 = errors.length;
      await go('step=0');
      const walk = await ev(`(()=>{const out=[]; for (let i=0;i<window.__shk.LESSON_SHOCKS.steps.length;i++){ window.__shk.show(i); out.push(document.querySelectorAll('.skp').length + ':' + (document.querySelector('.skp')?.dataset.panel||'-')); } window.__shk.unmountShockPanel(); window.__shk.unmountShockPanel(); out.push(document.querySelectorAll('.skp').length); return out.join(',')})()`);
      ok(walk === '1:shk-rule,0:-,1:shk-quad,1:shk-quad,0:-,1:shk-lines,0', `${dev} lesson walk: one panel at a time, steps 1 (the 断面 on the diagram) and 4 (sim) none, double unmount safe (${walk})`);
      ok(await ev(`window.__shk.mountShockPanel(document.getElementById('host'), { id: 'nope' }) === null && document.querySelectorAll('.skp').length === 0`), `${dev} unknown panel id -> null`);
      await ev(`window.__shk.show(2)`);
      const w0 = await ev(`document.querySelector('.skp-chart svg').getAttribute('width')`);
      await ev(`document.getElementById('host').style.width='300px'`); await sleep(300);
      const w1 = await ev(`document.querySelector('.skp-chart svg').getAttribute('width')`);
      ok(+w1 < +w0, `${dev} chart redraws on resize (${w0} -> ${w1})`);
      ok(errors.length === e1, `${dev} lesson walk: no JS errors` + (errors.length > e1 ? ': ' + errors.slice(e1).join(' | ') : ''));
      const e2 = errors.length;
      await go('panel=shk-quad&theme=dark');
      ok(await ev(`getComputedStyle(document.querySelector('.skp')).backgroundColor !== 'rgb(255, 255, 255)'`), `${dev} dark theme uses the dark surface`);
      if (shots && dev === 'pad') await shot('shk-quad-pad-dark');
      ok(errors.length === e2, `${dev} dark: no JS errors`);
    }
    if (saved.length) console.log('  screenshots:\n   ' + saved.join('\n   '));
    ws.close();
  } finally { proc.kill(); if (server) server.close(); }
}
