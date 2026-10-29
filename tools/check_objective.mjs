// node tools/check_objective.mjs   (serve the repo root first: python -m http.server 8231; BASE=http://localhost:PORT/ overrides)
// CDP check of the 总目标 strip: shown above 本季看点, score + 4 lamps, lamp tap -> reason, strip tap -> 整个经济 card, history / free / AUS / town / lesson,
// ⏮ 退一季 (a seek) gives the same score as a fresh run, phone width stays one compact row, no JS errors.
import { spawn } from 'node:child_process';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
const EDGE = 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe';
const port = 9381, BASE = process.env.BASE || 'http://localhost:8231/';
const profile = mkdtempSync(join(tmpdir(), 'mw-obj-'));
const proc = spawn(EDGE, ['--headless=new', '--disable-gpu', `--user-data-dir=${profile}`, `--remote-debugging-port=${port}`, '--window-size=1200,900', 'about:blank'], { stdio: 'ignore' });
const sleep = ms => new Promise(r => setTimeout(r, ms));
const errors = [];
let fails = 0; const ok = (c, m) => { if (!c) { fails++; console.log('FAIL:', m); } else console.log('ok:', m); };

let ws, id = 0; const pending = new Map();
for (let i = 0; i < 40 && !ws; i++) {
  try { const tabs = await (await fetch(`http://127.0.0.1:${port}/json`)).json(); const t = tabs.find(x => x.type === 'page'); if (t) { ws = new WebSocket(t.webSocketDebuggerUrl); await new Promise((res, rej) => { ws.onopen = res; ws.onerror = rej; }); } } catch (e) { await sleep(250); }
}
ws.onmessage = m => {
  const d = JSON.parse(m.data);
  if (d.id && pending.has(d.id)) { pending.get(d.id)(d); pending.delete(d.id); }
  else if (d.method === 'Runtime.exceptionThrown') errors.push(d.params.exceptionDetails.text + ' ' + (d.params.exceptionDetails.exception?.description || ''));
  else if (d.method === 'Runtime.consoleAPICalled' && d.params.type === 'error') errors.push('console.error ' + d.params.args.map(a => a.value || a.description).join(' '));
};
const send = (method, params = {}) => new Promise(res => { const i = ++id; pending.set(i, res); ws.send(JSON.stringify({ id: i, method, params })); });
const ev = async expr => { const r = await send('Runtime.evaluate', { expression: expr, awaitPromise: true, returnByValue: true }); if (r.result.exceptionDetails) throw new Error(JSON.stringify(r.result.exceptionDetails).slice(0, 300)); return r.result.result.value; };
await send('Runtime.enable'); await send('Page.enable');
const go = async (path, wait = 2200) => { await send('Page.navigate', { url: BASE + path }); await sleep(wait); };
const read = () => ev(`(()=>{const o=document.querySelector('#objective'); if(!o) return null;
  return { hidden: o.hidden || o.offsetParent === null, text: (o.querySelector('.ob-main')||{}).textContent||'', n: (o.querySelector('.ob-n')||{}).textContent||'',
    lamps: [...o.querySelectorAll('.ob-lamp')].map(b => b.textContent + ':' + b.dataset.level), h: o.getBoundingClientRect().height,
    before: !!(document.querySelector('#headline') && (o.compareDocumentPosition(document.querySelector('#headline')) & Node.DOCUMENT_POSITION_FOLLOWING)),
    date: document.querySelector('#date').textContent, over: !!o.querySelector('.ob-bar') && o.querySelector('.ob-bar').scrollWidth > o.querySelector('.ob-bar').clientWidth + 1 } })()`);
const num = s => +String(s).replace(/,/g, '');

// ---- US history t=52 (2008Q1: long cycle on B2 -> 溃坝 red)
await go('?pause=1&t=52');
let r = await read();
ok(r && !r.hidden && r.before, 'strip visible and sits above the 本季看点 strip');
ok(r.lamps.length === 4 && r.lamps.join(' ') === '泛滥:green 干涸:red 溃坝:red 透支:yellow', 'US 2008Q1 lamps ' + r.lamps.join(' '));
ok(/每人真实消费/.test(r.text) && num(r.n) > 80 && num(r.n) < 200, 'score text (level, first quarter = 100) ' + r.text);
await ev(`document.querySelector('[data-lamp="burst"]').click()`); await sleep(150);
ok(/B2/.test(await ev(`(document.querySelector('.ob-pop')||{}).textContent||''`)), 'tap 溃坝 lamp -> reason mentions B2');
await ev(`document.querySelector('.ob-main').click()`); await sleep(500);
ok(await ev(`!!document.querySelector('#objective .rc-economy')`), 'tap strip -> 整个经济 role card (roleCardHtml)');
ok(/泛滥/.test(await ev(`document.querySelector('#objective .ob-pop').textContent`)), 'card lists the penalty items');
await ev(`document.querySelector('.ob-x').click()`); await sleep(100);
ok(await ev(`document.querySelector('#objective .ob-pop').hidden`), '× closes the card');
// ⏮ = seekTo(t-1): same score as a fresh run
const s52 = num(r.n);
await ev(`document.querySelector('#btn-back').click()`); await sleep(600);
const back = await read();
await go('?pause=1&t=51');
const fresh = await read();
ok(back.date === '2007Q4' && back.n === fresh.n && back.lamps.join() === fresh.lamps.join(), `⏮ seek equals a fresh run (${back.n} / ${fresh.n})`);
ok(num(fresh.n) > 80 && num(fresh.n) < 200, 'level stays an index near 100 in 2007');
await ev(`document.querySelector('#btn-step').click()`); await sleep(500);
ok(num((await read()).n) === s52, 'step forward returns to the same score');

// ---- ⑤ and later
await go('?pause=1&t=56'); r = await read(); ok(/溃坝:red/.test(r.lamps.join(' ')), '2009Q1 (stage ⑤) 溃坝 red');
await go('?pause=1&t=110'); r = await read(); ok(!r.hidden && r.lamps.length === 4, '2022Q3 ' + r.lamps.join(' ') + ' score ' + r.n);

// ---- free mode, AUS, town, lesson
await go('free/?pause=1&t=10'); r = await read(); ok(!r.hidden && r.lamps.length === 4 && num(r.n) > 80 && num(r.n) < 200, 'free mode: ' + r.text);
await go('?pause=1&t=52&country=AUS'); r = await read(); ok(!r.hidden && r.lamps.length === 4 && /每人真实消费/.test(r.text), 'AUS: ' + r.lamps.join(' ') + ' score ' + r.n);
await ev(`document.querySelector('[data-lamp="flood"]').click()`); await sleep(150);
ok(/目标 2\.5%/.test(await ev(`document.querySelector('.ob-pop').textContent`)), 'AUS 泛滥 reason uses the 2.5% target');
await go('?pause=1&scenario=town'); r = await read(); ok(r && r.hidden, 'town: strip hidden');
await go('?lesson=0&step=0&pause=1', 2800); r = await read(); console.log('  lesson 0 strip hidden =', r && r.hidden);

// ---- phone width: one compact row, no overflow
await send('Emulation.setDeviceMetricsOverride', { width: 390, height: 844, deviceScaleFactor: 2, mobile: true });
await go('?pause=1&t=52'); r = await read();
ok(!r.hidden && r.h <= 34 && !r.over, `phone 390: strip height ${Math.round(r.h)}px, overflow ${r.over}`);
await go('?pause=1&t=110&country=AUS'); r = await read();
ok(!r.hidden && r.h <= 34 && !r.over, `phone 390 AUS: strip height ${Math.round(r.h)}px, overflow ${r.over}`);

// ---- SHOTS=1: screenshots of the opened card / a lamp reason (tools/shots/objective/)
if (process.env.SHOTS) {
  const { writeFileSync } = await import('node:fs');
  const snap = async name => writeFileSync(new URL(`./shots/objective/${name}.png`, import.meta.url), Buffer.from((await send('Page.captureScreenshot', { format: 'png' })).result.data, 'base64'));
  for (const [tag, w, h, mobile] of [['phone', 390, 844, true], ['ipad', 1180, 820, false]]) {
    await send('Emulation.setDeviceMetricsOverride', { width: w, height: h, deviceScaleFactor: 1, mobile });
    await go('?pause=1&t=52'); await ev(`document.querySelector('.ob-main').click()`); await sleep(700); await snap(`${tag}-card-us52`);
    await go('?pause=1&t=52'); await ev(`document.querySelector('[data-lamp="burst"]').click()`); await sleep(300); await snap(`${tag}-lamp-us52`);
  }
}

ok(errors.length === 0, 'no JS errors' + (errors.length ? ': ' + errors.slice(0, 3).join(' | ') : ''));
ws.close(); proc.kill();
console.log(fails ? `${fails} FAILED` : 'ALL OK');
process.exit(fails ? 1 : 0);
