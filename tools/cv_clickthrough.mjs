// node tools/cv_clickthrough.mjs   (serve the repo root on :8174 first: python -m http.server 8174)
// CDP click-through of the 传导链 block: push buttons, folds, ▶ playback, 用模拟核对, chip navigation, redraw while the sim steps.
import { spawn } from 'node:child_process';
const EDGE = 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe';
const port = 9334, BASE = 'http://localhost:8174/index.html';
const proc = spawn(EDGE, ['--headless=new', '--disable-gpu', `--remote-debugging-port=${port}`, '--window-size=1200,900', 'about:blank'], { stdio: 'ignore' });
const sleep = ms => new Promise(r => setTimeout(r, ms));
let ws, id = 0; const pending = new Map(); const errors = [];
async function connect() {
  for (let i = 0; i < 40; i++) { try { const r = await fetch(`http://127.0.0.1:${port}/json`); const tabs = await r.json(); const t = tabs.find(x => x.type === 'page'); if (t) { ws = new WebSocket(t.webSocketDebuggerUrl); await new Promise((res, rej) => { ws.onopen = res; ws.onerror = rej; }); break; } } catch (e) { await sleep(250); } }
  ws.onmessage = m => { const d = JSON.parse(m.data); if (d.id && pending.has(d.id)) { pending.get(d.id)(d); pending.delete(d.id); } else if (d.method === 'Runtime.exceptionThrown') errors.push(d.params.exceptionDetails.text + ' ' + (d.params.exceptionDetails.exception?.description || '')); else if (d.method === 'Runtime.consoleAPICalled' && d.params.type === 'error') errors.push('console.error ' + d.params.args.map(a => a.value || a.description).join(' ')); };
}
const send = (method, params = {}) => new Promise(res => { const i = ++id; pending.set(i, res); ws.send(JSON.stringify({ id: i, method, params })); });
const ev = async expr => { const r = await send('Runtime.evaluate', { expression: expr, awaitPromise: true, returnByValue: true }); if (r.result.exceptionDetails) throw new Error(r.result.exceptionDetails.exception?.description || 'eval error'); return r.result.result.value; };
let fails = 0; const ok = (c, m) => { if (!c) { fails++; console.log('FAIL:', m); } else console.log('ok:', m); };
const click = sel => ev(`(()=>{const b=document.querySelector(${JSON.stringify(sel)}); if(!b) return 'missing'; b.click(); return 'ok'})()`);
const text = sel => ev(`(document.querySelector(${JSON.stringify(sel)})||{}).textContent||''`);
const count = sel => ev(`document.querySelectorAll(${JSON.stringify(sel)}).length`);
const open = id => ev(`import('./src/ui/concepts.js').then(m => m.openConcept(${JSON.stringify(id)}))`);
try {
  await connect();
  await send('Runtime.enable'); await send('Page.enable');
  await send('Emulation.setEmulatedMedia', { features: [{ name: 'prefers-reduced-motion', value: 'no-preference' }] });
  await send('Page.navigate', { url: BASE + '?pause=1&t=56' });
  await sleep(2200);
  await open('housePrice'); await sleep(700);
  ok((await text('.cc-title')) === '房价', 'card opens');
  ok((await count('.cv')) === 1 && (await count('.cv-chip')) > 5, '传导链 block with chips');
  ok((await count('.cc-hl.cc-from')) > 2, 'static highlight marks the upstream route (from)');
  ok(await ev(`(()=>{const b=document.querySelector('.cc-body'); const a=b.querySelector('.cv').compareDocumentPosition(b.querySelector('.cc-why')); return !!(a & Node.DOCUMENT_POSITION_FOLLOWING)})()`), 'order: 传导链 before 为什么现在是这个值');
  ok((await count('.cv-bd')) === 0, 'no badges before a push is chosen');
  await click('[data-cv-push="-1"]'); await sleep(300);
  const nb = await count('.cv-bd');
  ok(nb >= 5, 'badges on the diagram after ↓ 压低: ' + nb);
  ok(await ev(`document.querySelector('[data-cv-push="-1"]').getAttribute('aria-pressed')`) === 'true', '↓ button pressed');
  ok(await ev(`!!document.querySelector('.cv-bd.self')`), 'own badge on the card itself');
  await click('[data-cv-fold="down-more"]'); await sleep(200);
  const rowsOpen = await count('.cv-down .cv-row');
  ok(rowsOpen > 4, 'fold opens: ' + rowsOpen + ' rows');
  await click('#btn-step'); await sleep(1500);
  ok((await count('.cv-down .cv-row')) === rowsOpen, 'fold state survives the per-quarter redraw');
  ok(await ev(`document.querySelector('[data-cv-push="-1"]').getAttribute('aria-pressed')`) === 'true', 'push choice survives the redraw');
  const nb2 = await count('.cv-bd');
  ok(nb2 > 0, `badges survive the redraw (${nb} -> ${nb2})`);
  await click('.cv-dots[data-cv-fold]'); await sleep(200);
  ok((await count('.cv-fold, .cv-dots.cv-fold')) >= 1, 'route dots expand a route');
  await click('[data-cv-act="play"]'); await sleep(1400);
  ok((await count('.cv-now')) >= 1, '▶ lights a node on the diagram (cv-now): ' + await count('.cv-now'));
  ok((await text('[data-cv-status]')).includes('/'), 'status line shows progress: ' + (await text('[data-cv-status]')));
  ok(await ev(`document.querySelector('[data-cv-act="play"]').textContent.includes('停止')`), 'button turns into ■ 停止');
  await click('#btn-step'); await sleep(1300);
  ok(await ev(`document.querySelector('[data-cv-act="play"]').textContent.includes('停止')`), 'playback keeps running through a redraw');
  await click('[data-cv-act="play"]'); await sleep(300);
  ok((await count('.cv-now')) === 0 && (await count('.cv-seen')) === 0, 'stop clears the glow');
  await click('[data-cv-act="check"]'); await sleep(1500);
  const ns = await count('.cv-sim');
  ok(ns >= 3, '用模拟核对 shows sim numbers: ' + ns);
  ok((await text('.cv-what')).includes('拧动'), 'says what was turned: ' + (await text('.cv-what')).slice(0, 40));
  await click('[data-cv-push="1"]'); await sleep(1500);
  ok((await count('.cv-sim')) >= 3, 'check follows the ↑ choice');
  await click('.cv-up .cv-chip[data-term]:not(.cv-self)'); await sleep(900);
  ok((await text('.cc-title')) !== '房价', 'tapping a chip opens another card: ' + await text('.cc-title'));
  ok((await count('.cv-bd')) === 0, 'badges removed when the card shows another concept');
  await open('ringStage'); await sleep(500);
  ok((await text('.cv')).includes('不在传导链上') && (await count('[data-cv-act]')) === 0, 'cycle card: one line, no buttons');
  await click('[data-cc-close]'); await sleep(200);
  ok((await count('.cv-bd')) === 0 && (await count('.cc-hl')) === 0, 'close clears badges + highlight');
  await send('Emulation.setEmulatedMedia', { features: [{ name: 'prefers-reduced-motion', value: 'reduce' }] });
  await open('dsr'); await sleep(500);
  await click('[data-cv-act="play"]'); await sleep(500);
  const nr = await count('.cv-bd');
  ok(nr >= 4, 'reduced motion: static badges, all at once (' + nr + ')');
  await click('[data-cc-close]');
  await send('Page.navigate', { url: BASE + '?scenario=town&pause=1&t=6' });
  await sleep(2200);
  await open('newLoans'); await sleep(500);
  await click('[data-cv-act="check"]'); await sleep(1200);
  const w = await text('.cv-what');
  ok(w.includes('拧动') && w.includes('当前季度') || w.includes('小镇'), 'town check: ' + w.slice(0, 70));
  ok(errors.length === 0, 'no console errors / exceptions' + (errors.length ? ': ' + errors.slice(0, 3).join(' | ') : ''));
} catch (e) { console.log('ERROR', e.message); fails++; }
try { ws && ws.close(); } catch (e) { /* ignore */ }
proc.kill();
console.log(fails ? `\n${fails} FAIL` : '\nALL OK');
process.exit(fails ? 1 : 0);
