// Screenshot the 周期 tab's B2 card (long dial's fork block) of a country at one quarter, desktop 1024x768 and phone 390x844.
// node tools/shot_b2_card.mjs [ISO] [YYYYQn] [outDir]     (serve the repo root first; BASE=http://localhost:PORT/ overrides)
// e.g. BASE=http://localhost:8971/ node tools/shot_b2_card.mjs GBR 2009Q2 tools/shots/gbr2
// Also prints the B2 block's notes (「银行伤了 ≠ B2」 / country note / 加分项) so the text can be checked without opening the PNGs.
import { spawn } from 'node:child_process';
import { mkdirSync, writeFileSync } from 'node:fs';
const EDGE = 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe';
const [ISO = 'GBR', DATE = '2009Q2', OUT = 'tools/shots/b2'] = process.argv.slice(2);
const BASE = process.env.BASE || 'http://localhost:8971/', port = 9373;
const T = (+DATE.slice(0, 4) - 1995) * 4 + (+DATE.slice(5) - 1);
mkdirSync(OUT, { recursive: true });
const proc = spawn(EDGE, ['--headless=new', '--disable-gpu', `--remote-debugging-port=${port}`, '--window-size=1024,768', 'about:blank'], { stdio: 'ignore' });
const sleep = ms => new Promise(r => setTimeout(r, ms));
let code = 0;
try {
  let tab = null;
  for (let i = 0; i < 40 && !tab; i++) { try { tab = (await (await fetch(`http://127.0.0.1:${port}/json`)).json()).find(x => x.type === 'page'); } catch (e) { await sleep(250); } }
  const ws = new WebSocket(tab.webSocketDebuggerUrl); await new Promise((res, rej) => { ws.onopen = res; ws.onerror = rej; });
  let id = 0; const pending = new Map(), errors = [];
  ws.onmessage = m => { const d = JSON.parse(m.data); if (d.id && pending.has(d.id)) { pending.get(d.id)(d); pending.delete(d.id); } else if (d.method === 'Runtime.exceptionThrown') errors.push(d.params.exceptionDetails.text); };
  const send = (method, params = {}) => new Promise(res => { const i = ++id; pending.set(i, res); ws.send(JSON.stringify({ id: i, method, params })); });
  const ev = async expr => (await send('Runtime.evaluate', { expression: expr, awaitPromise: true, returnByValue: true })).result.result.value;
  await send('Runtime.enable'); await send('Page.enable');
  for (const [w, h, name] of [[1024, 768, 'desktop'], [390, 844, 'phone']]) {
    await send('Emulation.setDeviceMetricsOverride', { width: w, height: h, deviceScaleFactor: 1, mobile: w < 500 });
    // ?t= is a step count; the shown quarter can sit a few quarters later (auto-steps / pauses): read it and land on DATE
    const qi = d => (+d.slice(0, 4) - 1995) * 4 + (+d.slice(5) - 1);
    let t = T;
    for (let k = 0; k < 3; k++) {
      await send('Page.navigate', { url: `${BASE}?country=${ISO}&tab=cycle&t=${t}&layers=all` }); await sleep(3500);
      await ev(`(()=>{const b=document.getElementById('btn-play'); if(b && b.textContent.trim()==='⏸') b.click();})()`); await sleep(300);   // stop auto-play
      const shown = await ev(`(document.body.innerText.match(/\\b(19|20)\\d\\dQ[1-4]\\b/)||[''])[0]`);
      if (!shown || shown === DATE) break;
      t -= qi(shown) - T;
    }
    // phone: open the panel full height if there is a grip / panel toggle, then scroll the B2 block into view
    const info = await ev(`(()=>{const b=document.querySelector('.cy-fkb'); if(!b) return null; (b.querySelector('.cy-notb2')||b).scrollIntoView({block:'start'});
      const q=s=>[...b.querySelectorAll(s)].map(e=>e.textContent.trim()); return {date:(document.querySelector('.cy-now .cy-since')||{}).textContent||'', notes:q('.cy-notb2'), bonus:q('.cy-bonus-r')}; })()`);
    await sleep(600);
    const r = await send('Page.captureScreenshot', { format: 'png' });
    const file = `${OUT}/${ISO.toLowerCase()}-b2-${DATE}-${name}.png`;
    writeFileSync(file, Buffer.from(r.result.data, 'base64'));
    console.log(name, file, JSON.stringify(info));
    if (!info) code = 1;
  }
  if (errors.length) { console.log('JS errors:', errors); code = 1; }
  ws.close();
} catch (e) { console.log('ERROR', e.message); code = 1; }
proc.kill();
process.exit(code);
