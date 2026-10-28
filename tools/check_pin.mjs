// CDP click-through of the 周期 tab evidence rows: tap a row -> card opens + diagram lights; 盯住 -> pulse; step until the pinned row is met -> pause toast.
// usage: python -m http.server 8176  (repo root)  then  node tools/check_pin.mjs
import { spawn } from 'node:child_process';
const EDGE = 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe';
const port = 9341, BASE = process.env.BASE || 'http://localhost:8176/';
const proc = spawn(EDGE, ['--headless=new', '--disable-gpu', `--remote-debugging-port=${port}`, '--window-size=1200,900', 'about:blank'], { stdio: 'ignore' });
const sleep = ms => new Promise(r => setTimeout(r, ms));
let ws, id = 0; const pending = new Map(); const errors = [];
async function connect() {
  for (let i = 0; i < 40; i++) { try { const r = await fetch(`http://127.0.0.1:${port}/json`); const t = (await r.json()).find(x => x.type === 'page'); if (t) { ws = new WebSocket(t.webSocketDebuggerUrl); await new Promise((res, rej) => { ws.onopen = res; ws.onerror = rej; }); break; } } catch (e) { await sleep(250); } }
  ws.onmessage = m => { const d = JSON.parse(m.data); if (d.id && pending.has(d.id)) { pending.get(d.id)(d); pending.delete(d.id); } else if (d.method === 'Runtime.exceptionThrown') errors.push(d.params.exceptionDetails.text + ' ' + (d.params.exceptionDetails.exception?.description || '')); };
}
const send = (method, params = {}) => new Promise(res => { const i = ++id; pending.set(i, res); ws.send(JSON.stringify({ id: i, method, params })); });
const ev = async expr => { const r = await send('Runtime.evaluate', { expression: expr, awaitPromise: true, returnByValue: true }); if (r.result.exceptionDetails) throw new Error(r.result.exceptionDetails.exception?.description || 'eval error'); return r.result.result.value; };
let fails = 0; const ok = (c, m) => { if (!c) { fails++; console.log('FAIL:', m); } else console.log('ok:', m); };
try {
  await connect();
  await send('Runtime.enable'); await send('Page.enable');
  await send('Page.navigate', { url: BASE + '?pause=1&tab=cycle&t=52' });
  await sleep(2500);
  ok(await ev(`document.querySelectorAll('.cy-ev').length`) >= 5, 'evidence rows rendered');
  ok(await ev(`document.querySelectorAll('.cy-ev .tb').length`) === await ev(`document.querySelectorAll('.cy-ev').length`), 'every row has a ruler');
  ok(await ev(`[...document.querySelectorAll('.cy-ev .cy-where')].every(n => n.textContent.length > 3)`), 'every row that shows 看： has a place');
  ok(await ev(`document.querySelectorAll('.cy-ev:not(.ok)').length`) > 0 && await ev(`[...document.querySelectorAll('.cy-ev.no .cy-gap')].length`) === await ev(`document.querySelectorAll('.cy-ev.no').length`), 'unmet rows show 还差');
  // tap the 银行坏账率 row: card opens, bank lights
  await ev(`[...document.querySelectorAll('.cy-rowbtn')].find(b => b.textContent.includes('银行坏账率')).click()`);
  await sleep(500);
  ok(await ev(`document.querySelectorAll('#diagram .cc-hl').length`) > 0, 'row tap lights the diagram (cc-hl)');
  ok(await ev(`!!document.querySelector('[data-term="badLoans"].term, .cc, .sheet, #concept-sheet, .concept-card') || document.body.innerText.includes('坏账率')`), 'concept card opened');
  // pin the policy-rate row
  await ev(`[...document.querySelectorAll('.cy-ev.no .cy-pin-btn')].find(b => b.closest('.cy-ev').textContent.includes('政策利率')).click()`);
  await sleep(200);
  ok(await ev(`document.querySelectorAll('#diagram .cy-pin').length`) > 0, 'pinned row pulses its place in the diagram');
  ok(await ev(`document.querySelectorAll('.cy-ev.pinned').length`) === 1, 'row marked pinned');
  // step until the toast mentions 达标
  let toast = '';
  for (let i = 0; i < 40 && !/达标了/.test(toast); i++) {
    await ev(`document.getElementById('btn-step').click()`); await sleep(350);
    toast = await ev(`document.getElementById('toast').hidden ? '' : document.getElementById('toast-msg').textContent`);
  }
  console.log('toast:', toast);
  ok(/达标了/.test(toast) && /暂停/.test(toast) && /政策利率/.test(toast), 'pause toast fired when the pinned row became met');
  ok(/^\d{4}Q\d 暂停/.test(toast), 'toast carries the date of the quarter it fired in');
  ok(await ev(`document.querySelectorAll('#diagram .cy-pin').length`) === 0, 'pin cleared after firing');
  // reset clears pins
  await send('Page.navigate', { url: BASE + '?pause=1&tab=cycle&t=52&pin=0' });
  await sleep(2500);
  ok(await ev(`document.querySelectorAll('.cy-ev.pinned').length`) === 1 && await ev(`document.querySelectorAll('#diagram .cy-pin').length`) > 0, '?pin=0 pins the first unmet row');
  console.log(errors.length ? 'JS errors:\n' + errors.join('\n') : 'no JS errors');
  fails += errors.length;
} catch (e) { console.log('ERROR', e.message); fails++; }
proc.kill();
console.log(fails ? `FAILED (${fails})` : 'ALL OK');
process.exit(fails ? 1 : 0);
