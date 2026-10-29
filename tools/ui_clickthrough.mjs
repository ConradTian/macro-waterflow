// tiny CDP driver: node tools/_cdp.mjs  (runs a click-through of lesson 0 + a role lesson and prints assertions)
import { spawn } from 'node:child_process';
const EDGE = 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe';
const port = 9333, BASE = process.env.BASE || 'http://localhost:8160/';
const proc = spawn(EDGE, ['--headless=new', '--disable-gpu', `--remote-debugging-port=${port}`, '--window-size=1200,900', 'about:blank'], { stdio: 'ignore' });
const sleep = ms => new Promise(r => setTimeout(r, ms));
const allLayers = u => (/^about:/.test(u) ? u : u + (u.includes('?') ? '&' : '?') + 'layers=all');   // progressive diagram: this check wants the whole diagram (layers: tools/check_layers.mjs)
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
try {
  await connect();
  await send('Runtime.enable'); await send('Page.enable');
  await send('Page.navigate', { url: allLayers(BASE + '?pause=1') });
  await sleep(2500);
  ok(await ev(`document.querySelector('#date').textContent`) === '1995Q1', 'US sim at 1995Q1 before the lesson');
  await send('Page.navigate', { url: allLayers(BASE + '?pause=1&lesson=0') });
  await sleep(2500);
  ok((await text('#ls-card .ls-stitle')).includes('先说结论'), 'lesson 0 intro shown');
  ok(await ev(`document.querySelector('#date').textContent`) === '第0季', 'diagram shows the town (第0季)');
  // click through: next, tap, next...
  for (let k = 1; k <= 12; k++) {
    await click('#ls-card [data-act=next]'); await sleep(350);
    const t = await text('#ls-card .ls-stitle');
    const act = await ev(`!!document.querySelector('#ls-card .ls-nav [data-act=do]')`);
    if (act) {
      const nextBefore = await ev(`document.querySelector('#ls-card [data-act=next]').disabled`);
      ok(nextBefore === true, `step ${k} (${t}): next disabled until the tap`);
      await click('#ls-card .ls-nav [data-act=do]'); await sleep(400);
      ok(await ev(`!document.querySelector('#ls-card [data-act=next]').disabled`), `step ${k}: next enabled after the tap`);
      const w = await text('#ls-card .ls-water'); if (w) console.log('   water line:', w);
      const rip = await ev(`document.querySelectorAll('#ls-card .ls-rip button').length`); if (rip) console.log('   ripple lines:', rip);
      await sleep(2500);
    } else {
      const reveal = await ev(`!!document.querySelector('#ls-card .ls-nav [data-act=reveal]')`);
      if (reveal) { await click('#ls-card .ls-nav [data-act=reveal]'); await sleep(300); }
    }
    console.log(`step ${k}: ${t} | date ${await ev(`document.querySelector('#date').textContent`)} | M ${await ev(`(document.querySelector('.flow-budget')||{}).textContent||''`).then(x => x.slice(0, 60))}`);
  }
  // chain step reached? tap a link
  ok((await text('#ls-card .ls-stitle')).includes('因果链'), 'on the chain step');
  await click('#ls-card [data-act=link][data-k="0"]'); await sleep(300);
  ok(await ev(`document.querySelectorAll('.flow-svg .lk-hl').length > 0`), 'tapping a chain link lights something in the diagram');
  await click('#ls-card [data-act=chainplay]'); await sleep(1800);
  ok(await ev(`document.querySelectorAll('#ls-card .ls-link.on').length === 1`), 'chain play highlights one link at a time');
  // zoom
  await click('#ls-card [data-act=next]'); await sleep(300);
  ok(await ev(`document.querySelector('#ls-card .ls-stitle').textContent.includes('放大')`), 'zoom step card');
  await sleep(3500);
  const d = await ev(`document.querySelector('#date').textContent`);
  ok(/^\d{4}Q\d$/.test(d), 'after the zoom the diagram runs the US sim: ' + d);
  ok(await ev(`!!document.querySelector('#ls-card [data-act=nextlesson]')`), 'next-lesson button on the zoom step');
  // back from the US to the town
  await click('#ls-card [data-act=prev]'); await sleep(600);
  ok(await ev(`document.querySelector('#date').textContent`).then(x => /^第\d+季$/.test(x)), 'prev from the zoom returns to the town');
  // exit: US sim restored at 1995Q1
  await click('#ls-card [data-act=exit]'); await sleep(600);
  ok(await ev(`document.querySelector('#date').textContent`) === '1995Q1', 'exit restores the US sim at its old position (1995Q1)');
  // next lesson button leads into the bank lesson
  await send('Page.navigate', { url: allLayers(BASE + '?pause=1&lesson=0&step=13&nozoom=1') }); await sleep(2500);
  await click('#ls-card [data-act=nextlesson]'); await sleep(1200);
  ok((await text('#ls-card .ls-ttl')).includes('银行'), 'next lesson = bank role lesson: ' + await text('#ls-card .ls-ttl'));
  ok(await ev(`document.querySelector('#date').textContent`) === '第0季', 'bank lesson runs in the town');
  // try-step click-through in the bank lesson
  await send('Page.navigate', { url: allLayers(BASE + '?lesson=role-bank&step=7') }); await sleep(2500);
  await click('#ls-card .ls-nav [data-act=trun]'); await sleep(500);
  await sleep(14000);
  ok(await ev(`document.querySelectorAll('#ls-card table.ls-res tr').length >= 4`), 'try step shows a comparison table');
  console.log('errors:', errors.length ? errors : 'none');
} catch (e) { console.log('driver error', e); fails++; }
finally { try { ws.close(); } catch (e) {} proc.kill(); }
console.log(fails ? `${fails} FAIL` : 'ALL OK');
process.exit(fails ? 1 : 0);
