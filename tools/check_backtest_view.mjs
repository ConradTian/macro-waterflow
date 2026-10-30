// node tools/check_backtest_view.mjs [--shots] [--static]   (serve the repo root first: python -m http.server 8941; BASE=http://localhost:PORT/ overrides)
// The 周期 tab's 「这张表盘准不准？（回测）」 section and the frozen-rules log (src/ui/backtest-view.js, assets/css/backtest.css):
//   static: src/data/real/backtest-readout.js = a fresh run of tools/backtest_readout.mjs; frozen-log.js: rules hash = src/engine/regimes.js now,
//           each country logged from its first frozen quarter (USA 2026Q3, AUS 2026Q2) up to its last real quarter, and every row recorded with
//           today's rules and today's data file equals the reading the current rules give; no 同比 / 环比 in the new files.
//   browser (headless Edge, waits while RAM >= 82%): only in 真实 mode (模型 mode: no section; toggling brings it back); the title and the headline;
//           every table number = the data modules (u / CPI: backtest.js, policy / houses / dials: backtest-readout.js; values computed here,
//           not by the view); the one win (US policy rate, 8 quarters) with its two numbers; the 「怎么测的」 tap opens 3 lines; the frozen-log
//           list = frozen-log.js rows + the hash; USA and AUS; no 同比 / 环比 on the page; no horizontal scroll at 390; no JS errors.
//   --shots: tools/shots/bt-ui/{usa,aus}-{390,1024}*.png
import { spawn } from 'node:child_process';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync } from 'node:fs';
import { tmpdir, freemem, totalmem } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { BACKTEST } from '../src/data/real/backtest.js';
import { BACKTEST_READOUT } from '../src/data/real/backtest-readout.js';
import { FROZEN_LOG } from '../src/data/real/frozen-log.js';
import { realDates, realLastDate } from '../src/data/real/real-snapshot.js';
import { computeReadout, readoutFileText, READOUT_FILE } from './backtest_readout.mjs';
import { rulesHash, dataPrint, readingNow, sameReading } from './freeze_log.mjs';

const HERE = dirname(fileURLToPath(import.meta.url)), ROOT = join(HERE, '..');
const SHOTS = process.argv.includes('--shots'), STATIC = process.argv.includes('--static');
let fails = 0; const ok = (c, m) => { if (!c) { fails++; console.log('FAIL:', m); } else console.log('ok:', m); };
const num = x => typeof x === 'number' && Number.isFinite(x);
const fErr = v => (v * 100).toFixed(2), fHit = v => Math.round(v * 100) + '%';
const BANNED = /同比|环比/;
const HEADLINE = '表盘是『现在在哪』的地图，不是预报';
const FIRST = { USA: '2026Q3', AUS: '2026Q2' };

/* ------------------------------------------------------------------ 1. static */
const lf = s => s.replace(/\r\n/g, '\n');
ok(lf(readFileSync(READOUT_FILE, 'utf8')) === readoutFileText(await computeReadout()), 'backtest-readout.js = a fresh run of tools/backtest_readout.mjs');
const hNow = rulesHash(), cur = FROZEN_LOG.rules[FROZEN_LOG.rules.length - 1];
ok(cur.regimesSha256 === hNow, `frozen log: rules hash = src/engine/regimes.js now (${hNow.slice(0, 12)})`);
ok(FROZEN_LOG.frozenOn === '2026-10-30' && FROZEN_LOG.rules[0].from === '2026-10-30', 'frozen log: frozen on 2026-10-30');
for (const iso of ['USA', 'AUS']) {
  const rows = FROZEN_LOG.countries[iso] || [], D = realDates(iso);
  ok(rows.length > 0 && rows[0].q === FIRST[iso], `${iso}: log starts at ${FIRST[iso]} (${rows[0]?.q})`);
  ok(rows.length && rows[rows.length - 1].q === realLastDate(iso), `${iso}: logged up to the last real quarter ${realLastDate(iso)} (else run node tools/freeze_log.mjs)`);
  ok(rows.every((r, i) => !i || D.indexOf(r.q) === D.indexOf(rows[i - 1].q) + 1), `${iso}: one row per quarter, no gaps`);
  ok(rows.every(r => FROZEN_LOG.rules.some(x => x.id === r.rules) && /^\d{4}-\d\d-\d\d$/.test(r.recordedOn)), `${iso}: every row names its rules and its date`);
  let same = 0;
  for (const r of rows) {
    if (r.rules === cur.id && r.data === dataPrint(iso)) { same++; ok(sameReading(r, readingNow(iso, r.q)), `${iso} ${r.q}: logged reading = what the current rules give (${r.long.label} | ${r.short.label})`); }
    else if (!sameReading(r, readingNow(iso, r.q))) console.log(`note: ${iso} ${r.q} reads differently now (data or rules changed since ${r.recordedOn}); kept as recorded`);
  }
  // a rules change (--new-rules) starts a new entry; rows logged before it keep the rules they were read with, so "same" may be 0
  // until the next real quarter arrives. Then every row must be from an earlier rules entry than the current one.
  const curIdx = FROZEN_LOG.rules.findIndex(x => x.id === cur.id);
  ok(same > 0 || rows.every(r => FROZEN_LOG.rules.findIndex(x => x.id === r.rules) < curIdx),
    `${iso}: rows recorded with today's rules (${same}), or all rows predate the current rules entry #${curIdx + 1}`);
}
for (const f of ['src/ui/backtest-view.js', 'assets/css/backtest.css', 'src/data/real/frozen-log.js', 'src/data/real/backtest-readout.js', 'tools/freeze_log.mjs'])
  ok(!BANNED.test(readFileSync(join(ROOT, f), 'utf8')), `${f}: no 同比 / 环比`);

/* expected table values, straight from the data modules */
const expect = iso => {
  const B = BACKTEST.countries[iso], R = BACKTEST_READOUT.countries[iso];
  const row = {};
  for (const w of ['in', 'out']) {
    const put = (id, kind, a, b) => { (row[id] ||= { kind })[w] = [a, b]; };
    put('u', 'err', B[w].short.forecasts.u.noChange.mae, B[w].short.forecasts.u.phaseMean.mae);
    put('pi', 'err', B[w].short.forecasts.pi.noChange.mae, B[w].short.forecasts.pi.phaseMean.mae);
    put('pol', 'err', R[`${w} h4 pol`].noChange.mae, R[`${w} h4 pol`].phaseMean.mae);
    put('hp', 'err', R[`${w} h4 hp`].noChange.mae, R[`${w} h4 hp`].phaseMean.mae);
    put('short', 'hit', R[`${w} h4 dial`].shortSame, R[`${w} h4 dial`].shortNextPhase);
    put('long', 'hit', R[`${w} h4 dial`].longSame, R[`${w} h4 dial`].longNextStage);
  }
  return row;
};
const usPol8 = BACKTEST_READOUT.countries.USA['in h8 pol'];
const WIN = { fw: usPol8.framework.hit, naive: Math.max(usPol8.noChange.hit, 1 - usPol8.noChange.hit, usPol8.persistence.hit) };
ok(fHit(WIN.fw) === '71%' && fHit(WIN.naive) === '57%', `data: US policy rate 8 quarters, framework ${fHit(WIN.fw)} vs best naive ${fHit(WIN.naive)}`);

if (STATIC) { console.log(fails ? `\n${fails} FAILED` : '\nALL OK (static)'); process.exit(fails ? 1 : 0); }

/* ------------------------------------------------------------------ 2. browser */
const EDGE = 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe';
const port = 9483, BASE = process.env.BASE || 'http://localhost:8941/';
const sleep = ms => new Promise(r => setTimeout(r, ms));
const memPct = () => Math.round(100 * (1 - freemem() / totalmem()));
for (let i = 0; i < 60 && memPct() >= 82; i++) { if (!i) console.log(`RAM ${memPct()}% >= 82%: waiting`); await sleep(5000); }
if (memPct() >= 82) { console.log(`FAIL: RAM still ${memPct()}%: browser part not run`); process.exit(1); }
const profile = mkdtempSync(join(tmpdir(), 'mw-btv-'));
const proc = spawn(EDGE, ['--headless=new', '--disable-gpu', '--hide-scrollbars', `--user-data-dir=${profile}`, `--remote-debugging-port=${port}`, '--window-size=1024,768', 'about:blank'], { stdio: 'ignore' });
const errors = [];
let ws, id = 0; const pending = new Map();
for (let i = 0; i < 40 && !ws; i++) {
  try { const t = (await (await fetch(`http://127.0.0.1:${port}/json`)).json()).find(x => x.type === 'page'); if (t) { ws = new WebSocket(t.webSocketDebuggerUrl); await new Promise((res, rej) => { ws.onopen = res; ws.onerror = rej; }); } } catch (e) { ws = null; await sleep(250); }
}
ws.onmessage = m => {
  const d = JSON.parse(m.data);
  if (d.id && pending.has(d.id)) { pending.get(d.id)(d); pending.delete(d.id); }
  else if (d.method === 'Runtime.exceptionThrown') errors.push(d.params.exceptionDetails.text + ' ' + (d.params.exceptionDetails.exception?.description || ''));
  else if (d.method === 'Runtime.consoleAPICalled' && d.params.type === 'error') errors.push('console.error ' + d.params.args.map(a => a.value || a.description).join(' '));
};
const send = (method, params = {}) => new Promise(res => { const i = ++id; pending.set(i, res); ws.send(JSON.stringify({ id: i, method, params })); });
const ev = async expr => { const r = await send('Runtime.evaluate', { expression: expr, awaitPromise: true, returnByValue: true }); if (r.result.exceptionDetails) throw new Error(r.result.exceptionDetails.exception?.description || 'eval error'); return r.result.result.value; };
const size = (w, h) => send('Emulation.setDeviceMetricsOverride', { width: w, height: h, deviceScaleFactor: 1, mobile: false });
const go = async (path, wait = 3200) => { await send('Page.navigate', { url: BASE + path }); await sleep(wait); };
const noHScroll = () => ev(`document.documentElement.scrollWidth <= innerWidth && document.body.scrollWidth <= innerWidth`);
const shot = async name => {
  if (!SHOTS) return;
  const dir = join(HERE, 'shots', 'bt-ui'); mkdirSync(dir, { recursive: true });
  const r = await send('Page.captureScreenshot', { format: 'png' });
  writeFileSync(join(dir, name + '.png'), Buffer.from(r.result.data, 'base64'));
  console.log('shot:', join('tools', 'shots', 'bt-ui', name + '.png'));
};
// scroll the section (or a part of it) to the top of its scrolling panel
const scrollTo = async (sel, wait = 400) => { await ev(`(()=>{const e=document.querySelector(${JSON.stringify(sel)}); if(e) e.scrollIntoView({block:'start'}); return !!e})()`); await sleep(wait); };
const urlOf = (iso, extra = '') => `?${iso === 'AUS' ? 'country=AUS&' : ''}pause=1&t=${realDates(iso).indexOf(realLastDate(iso))}&tab=cycle&layers=all${extra}`;
// ?t= stops at the model's last quarter: step on with ⏭ to the last real quarter (real mode)
const toLastReal = async iso => {
  for (let i = 0; i < 6 && (await ev(`document.querySelector('#date').textContent`)) !== realLastDate(iso); i++) { await ev(`document.querySelector('#btn-step').click()`); await sleep(700); }
  return ev(`document.querySelector('#date').textContent`);
};
const shotsAt = async (name, sels) => { if (!SHOTS) return; for (const [s, suf] of sels) { await scrollTo(s); await shot(name + suf); } };

async function checkSection(iso) {
  ok(await ev(`!!document.querySelector('#tab-content .bt-sec[data-iso="${iso}"]')`), `${iso} 真实: the section is in the 周期 tab`);
  ok(await ev(`document.querySelector('.bt-sec .bt-title').textContent`) === '这张表盘准不准？（回测）', `${iso}: title`);
  ok(await ev(`document.querySelector('.bt-sec .bt-head').textContent`) === HEADLINE, `${iso}: headline 「${HEADLINE}」`);
  // the table: every cell's value and text = the data modules
  const got = await ev(`[...document.querySelectorAll('.bt-table tbody tr')].map(tr => ({ id: tr.dataset.row, kind: tr.dataset.kind, star: !!tr.querySelector('.bt-star'),
    cells: [...tr.querySelectorAll('td')].map(td => ({ w: td.dataset.w, m: td.dataset.m, v: +td.dataset.v, t: td.textContent, win: td.classList.contains('win') })) }))`);
  const E = expect(iso);
  ok(got.map(r => r.id).join(',') === 'u,pi,pol,hp,short,long', `${iso}: rows 失业率, CPI, 政策利率, 房价, 小周期, 大周期 (${got.map(r => r.id).join(',')})`);
  let bad = [];
  for (const r of got) {
    const e = E[r.id];
    if (!e || e.kind !== r.kind) { bad.push(r.id + ' kind'); continue; }
    for (const c of r.cells) {
      const v = e[c.w][c.m === 'naive' ? 0 : 1], f = e.kind === 'err' ? fErr : fHit;
      if (!num(v) || c.v !== v || c.t !== f(v)) bad.push(`${r.id} ${c.w} ${c.m}: ${c.t} (${c.v}) vs ${f(v)} (${v})`);
      const [a, b] = e[c.w], mine = c.m === 'naive' ? a : b, other = c.m === 'naive' ? b : a;
      if (c.win !== (e.kind === 'err' ? mine < other : mine > other)) bad.push(`${r.id} ${c.w} ${c.m}: bold`);
    }
    if (r.cells.length !== 4) bad.push(r.id + ' cells');
  }
  ok(!bad.length, `${iso}: 24 numbers = backtest.js (u, CPI) / backtest-readout.js (policy, houses, dials), winner bold` + (bad.length ? ': ' + bad.slice(0, 4).join(' | ') : ''));
  const stars = got.filter(r => r.star).map(r => r.id).join(',');
  ok(stars === (iso === 'USA' ? 'pol' : ''), `${iso}: ★ on ${iso === 'USA' ? 'the policy-rate row only' : 'no row'} (${stars || 'none'})`);
  const win = await ev(`document.querySelector('.bt-sec .bt-win').textContent`);
  ok(win.includes('唯一真正赢的一项') && win.includes('美国政策利率') && win.includes('8 季后') && win.includes(`表盘猜对 ${fHit(WIN.fw)}`) && win.includes(`最好的笨办法 ${fHit(WIN.naive)}`),
    `${iso}: the one win: ${win.slice(0, 60)}`);
  ok(await ev(`[...document.querySelectorAll('.bt-win b[data-v]')].map(b => +b.dataset.v).join(',')`) === `${WIN.fw},${WIN.naive}`, `${iso}: win numbers = backtest-readout.js`);
  const cav = await ev(`[...document.querySelectorAll('.bt-cav li')].map(l => l.textContent).join('|')`);
  ok(/事后/.test(cav) && /修订/.test(cav) && /独立/.test(cav), `${iso}: caveats (hindsight thresholds, final-vintage data, few episodes)`);
  // 怎么测的
  ok(await ev(`!document.querySelector('.bt-how').open`), `${iso}: 「怎么测的」 closed at first`);
  await ev(`document.querySelector('.bt-how > summary').click()`); await sleep(300);
  const how = await ev(`document.querySelector('.bt-how').open ? [...document.querySelectorAll('.bt-how-l li')].filter(l => l.getClientRects().length).map(l => l.textContent) : []`);
  ok(how.length === 3 && how[0].startsWith('只用当时已有的数据') && how[1].startsWith('和笨办法比') && how[2].startsWith('2022 起单列'), `${iso}: 「怎么测的」 tap opens 3 lines: ${how.map(x => x.split('：')[0]).join(' / ')}`);
  await ev(`document.querySelector('.bt-how > summary').click()`); await sleep(200);
  // frozen log
  ok(await ev(`document.querySelector('.bt-fz-sub').textContent`) === `冻结于 ${FROZEN_LOG.frozenOn}；之后每季的读数按当时记下，事后不改`, `${iso}: 「冻结于 ${FROZEN_LOG.frozenOn}；之后每季的读数按当时记下，事后不改」`);
  const lis = await ev(`[...document.querySelectorAll('.bt-fz-list li')].map(l => ({ q: l.dataset.q, t: l.textContent }))`);
  const rows = FROZEN_LOG.countries[iso].slice().reverse();
  ok(lis.length === rows.length && rows.every((r, i) => lis[i].q === r.q && lis[i].t.includes(r.long.label) && lis[i].t.includes(r.short.label) && lis[i].t.includes(r.recordedOn)),
    `${iso}: frozen-log list = frozen-log.js (${lis.map(x => x.q).join(' ')})`);
  ok(await ev(`document.querySelector('.bt-fz-foot code').dataset.hash`) === hNow, `${iso}: the list shows the rules hash = regimes.js now`);
  ok(!BANNED.test(await ev(`document.body.textContent`)), `${iso}: no 同比 / 环比 on the page`);
}

try {
  await send('Runtime.enable'); await send('Page.enable');
  await size(1024, 768);
  // 模型 (the fresh profile's default): no section
  await go(urlOf('USA'));
  ok(await ev(`!document.body.classList.contains('rm-real') && !!document.querySelector('#tab-content .cy-dials')`), '模型 mode, 周期 tab drawn');
  ok(await ev(`!document.querySelector('.bt-sec') && !document.querySelector('#tab-content').textContent.includes('这张表盘准不准')`), '模型 mode: no 回测 section');
  // toggle to 真实 on the same page: the section appears; back to 模型: gone
  await ev(`document.querySelector('#rm-toggle [data-m="real"]').click()`); await sleep(1600);
  ok(await ev(`document.body.classList.contains('rm-real') && !!document.querySelector('#tab-content .bt-sec')`), '真实 tapped: the section appears');
  await ev(`document.querySelector('#rm-toggle [data-m="model"]').click()`); await sleep(1400);
  ok(await ev(`!document.body.classList.contains('rm-real') && !document.querySelector('.bt-sec')`), '模型 tapped: the section goes away');
  for (const iso of ['USA', 'AUS']) {
    await size(1024, 768);
    await go(urlOf(iso, '&mode=real'));
    ok(await ev(`document.body.classList.contains('rm-real')`) && await toLastReal(iso) === realLastDate(iso), `${iso}: 真实 mode at ${realLastDate(iso)}`);
    await checkSection(iso);
    ok(await noHScroll(), `${iso} 1024: no horizontal scroll`);
    await shotsAt(`${iso.toLowerCase()}-1024`, [['.bt-sec', ''], ['.bt-fz', '-log']]);
    await size(390, 844);
    await go(urlOf(iso, '&mode=real'));
    await toLastReal(iso);
    ok(await ev(`!!document.querySelector('.bt-sec')`), `${iso} 390: section drawn`);
    ok(await noHScroll(), `${iso} 390: no horizontal scroll`);
    ok(await ev(`(()=>{const w=document.querySelector('.bt-tw'), s=document.querySelector('.bt-sec'); return w.scrollWidth <= w.clientWidth + 1 && s.scrollWidth <= s.clientWidth + 1 && s.getBoundingClientRect().right <= innerWidth + 1})()`), `${iso} 390: the table fits (no sideways scroll inside it)`);
    await shotsAt(`${iso.toLowerCase()}-390`, [['.bt-sec', '-1-head'], ['.bt-tw', '-2-table'], ['.bt-win', '-3-win'], ['.bt-fz', '-4-log']]);
  }
} catch (e) {
  fails++; console.log('FAIL: exception', e.message);
} finally {
  ok(errors.length === 0, 'no JS errors' + (errors.length ? ': ' + errors.slice(0, 5).join(' | ') : ''));
  console.log(fails ? `\n${fails} FAILED` : '\nALL OK');
  try { ws.close(); } catch (e) { /* ignore */ }
  proc.kill();
  process.exit(fails ? 1 : 0);
}
