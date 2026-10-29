// node tools/check_blind.mjs        headless-Edge CDP check of 历史盲测 (/blind/). Starts its own server (python -m http.server 8272) and Edge (CDP 9471),
//                                   stops both at the end. BASE=http://localhost:PORT/ uses a server you already run. SHOTS=1 also writes
//                                   screenshots to tools/shots/blind/ (iPad 1180×820, phone 390×844, desktop 1920×1000).
// Covers: a card loads (call hidden), allocation in 10% steps sums to 100, the reveal shows returns + both scores (scores match src/blind/model.js),
// 「只有 N 年」, 10 plays -> bias profile, reload keeps progress, deck filter, reset with confirm, storage blocked still works,
// phone 390 has no horizontal scroll, no JS errors.
import { spawn } from 'node:child_process';
import { mkdtempSync, mkdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const EDGE = 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe';
const SRV_PORT = 8272, CDP = 9471;
const BASE = process.env.BASE || `http://localhost:${SRV_PORT}/`;
const M = await import(pathToFileURL(join(ROOT, 'src/blind/model.js')).href);
const { BLIND } = await import(pathToFileURL(join(ROOT, 'src/data/blind-cards.js')).href);
const BY = Object.fromEntries(BLIND.cards.map(c => [c.id, c]));
const DECK = M.deckOrder(BLIND.cards);

const sleep = ms => new Promise(r => setTimeout(r, ms));
const kids = [];
const stopAll = () => { for (const k of kids) { try { k.kill(); } catch (e) { /* ignore */ } } };
process.on('exit', stopAll);
if (!process.env.BASE) kids.push(spawn('python', ['-m', 'http.server', String(SRV_PORT)], { cwd: ROOT, stdio: 'ignore' }));
const profile = mkdtempSync(join(tmpdir(), 'mw-blind-'));
kids.push(spawn(EDGE, ['--headless=new', '--disable-gpu', '--hide-scrollbars', `--user-data-dir=${profile}`, `--remote-debugging-port=${CDP}`, '--window-size=1180,820', 'about:blank'], { stdio: 'ignore' }));

const errors = [];
let fails = 0;
const ok = (c, m) => { if (!c) { fails++; console.log('FAIL:', m); } else console.log('ok:', m); };

let ws, id = 0; const pending = new Map();
for (let i = 0; i < 60 && !ws; i++) {
  try {
    const tabs = await (await fetch(`http://127.0.0.1:${CDP}/json`)).json();
    const t = tabs.find(x => x.type === 'page');
    if (t) { ws = new WebSocket(t.webSocketDebuggerUrl); await new Promise((res, rej) => { ws.onopen = res; ws.onerror = rej; }); }
  } catch (e) { ws = null; await sleep(250); }
}
if (!ws) { console.log('FAIL: no CDP connection'); stopAll(); process.exit(1); }
ws.onmessage = m => {
  const d = JSON.parse(m.data);
  if (d.id && pending.has(d.id)) { pending.get(d.id)(d); pending.delete(d.id); }
  else if (d.method === 'Runtime.exceptionThrown') errors.push(d.params.exceptionDetails.text + ' ' + (d.params.exceptionDetails.exception?.description || ''));
  else if (d.method === 'Runtime.consoleAPICalled' && d.params.type === 'error') errors.push('console.error ' + d.params.args.map(a => a.value || a.description).join(' '));
  else if (d.method === 'Log.entryAdded' && d.params.entry.level === 'error' && !/favicon/.test(d.params.entry.url || '')) errors.push('log ' + d.params.entry.text + ' ' + (d.params.entry.url || ''));
};
const send = (method, params = {}) => new Promise(res => { const i = ++id; pending.set(i, res); ws.send(JSON.stringify({ id: i, method, params })); });
const ev = async expr => {
  const r = await send('Runtime.evaluate', { expression: expr, awaitPromise: true, returnByValue: true });
  if (r.result.exceptionDetails) throw new Error(JSON.stringify(r.result.exceptionDetails).slice(0, 400));
  return r.result.result.value;
};
await send('Runtime.enable'); await send('Page.enable'); await send('Log.enable');
const size = (w, h, mobile = false) => send('Emulation.setDeviceMetricsOverride', { width: w, height: h, deviceScaleFactor: mobile ? 2 : 1, mobile });
for (let i = 0; i < 40; i++) { try { if ((await fetch(BASE + 'blind/')).ok) break; } catch (e) { /* not up yet */ } await sleep(250); }
const go = async (q = '') => {
  await send('Page.navigate', { url: BASE + 'blind/' + q });
  for (let i = 0; i < 60; i++) { await sleep(100); if (await ev(`document.body && document.body.dataset.ready === '1'`).catch(() => false)) break; }
  await sleep(150);
};
const click = sel => ev(`(()=>{const e=document.querySelector(${JSON.stringify(sel)}); if(!e) return false; e.dispatchEvent(new MouseEvent('click',{bubbles:true})); return true})()`);
const text = sel => ev(`(document.querySelector(${JSON.stringify(sel)})||{}).textContent||''`);
const count = sel => ev(`document.querySelectorAll(${JSON.stringify(sel)}).length`);
const curId = () => ev(`(document.querySelector('.bl-play')||{dataset:{}}).dataset.card||null`);
const played = async () => +(await ev(`(document.querySelector('#bl-score b')||{}).textContent||'-1'`));
const hscroll = () => ev(`(()=>{const W=innerWidth, bad=[...document.querySelectorAll('body *')].filter(e=>{const r=e.getBoundingClientRect(); return r.width>0 && r.right>W+1 && !e.closest('[hidden]')}).map(e=>e.className&&e.className.baseVal!==undefined?e.tagName:e.tagName+'.'+e.className).slice(0,5);
  return { sw: document.documentElement.scrollWidth, W, bad }})()`);

/** play the card on screen: picks by long/short (default: the framework's own call), allocation by w (tenths) */
async function playCard(o = {}) {
  const cid = await curId(), c = BY[cid];
  const long = o.long || c.view.call.long, short = o.short || c.view.call.short, fork = o.fork || c.view.call.fork || 'none';
  await click(`[data-pick-long="${long}"]`);
  await click(`button[data-pick-fork="${fork}"]`);
  await click(`button[data-pick-short="${short}"]`);
  await click('[data-act="clear"]');
  for (const [k, n] of Object.entries(o.w || { equity: 6, bond: 4 })) for (let i = 0; i < n; i++) await click(`[data-inc="${k}"]`);
  await click('[data-act="reveal"]');
  await sleep(120);
  return { cid, c, pick: { id: cid, long, short, fork, w: o.w || { equity: 6, bond: 4 } } };
}

/* ---------- 1. a card loads (iPad) ---------- */
await size(1180, 820);
await go();
ok(await ev(`localStorage.clear(), true`), 'fresh storage');
await go();
const first = await curId();
ok(first === DECK[0].id, `first card is the first of batch 1 (${first})`);
const ttl = await text('.bl-card-title');
ok(/^(美国|日本|澳洲|中国) · \d{4} 年底$/.test(ttl), `card title 「${ttl}」`);
ok(await count('.bl-tank') === 5, '5 tanks (levels only)');
ok(await count('.bl-prow') === 4, '4 相对历史位置 bars');
ok(await count('.bl-dial') === 2, 'two dials');
ok(await count('.bl-node.call, .bl-fk.call, #bl-reveal') === 0, 'the framework call is hidden before the reveal');
ok(/GDP 离趋势/.test(await text('.bl-gap')), 'GDP gap shown');
ok(await ev(`document.querySelector('[data-act="reveal"]').disabled`), 'reveal disabled before any choice');
// concept card
await click('.bl-tank[data-term="pvtDebtGdp"]'); await sleep(150);
ok(/私人债务\/GDP/.test(await text('.bl-cc .cc-title')) && !(await ev(`document.querySelector('.bl-cc').hidden`)), 'tank -> concept card');
await click('.bl-cc [data-cc-close]');
ok(await ev(`document.querySelector('.bl-cc').hidden`), 'concept card closes');

/* ---------- 2. allocation: 10% steps, sums to 100 ---------- */
for (let i = 0; i < 6; i++) await click('[data-inc="equity"]');
for (let i = 0; i < 3; i++) await click('[data-inc="bond"]');
ok(/90%/.test(await text('#bl-total')), 'after 9 steps the total reads 90% ' + await text('#bl-total'));
await click('[data-inc="bond"]');
const vals = await ev(`[...document.querySelectorAll('.bl-aval')].map(o=>parseInt(o.textContent))`);
ok(vals.every(v => v % 10 === 0) && vals.reduce((a, b) => a + b, 0) === 100, `every row is a 10% step and they sum to 100 (${vals.join(',')})`);
ok(/合计 100%/.test(await text('#bl-total')), 'total reads 100%');
ok(await ev(`[...document.querySelectorAll('[data-inc]')].every(b=>b.disabled)`), 'all + disabled at 100%');
await click('[data-inc="cash"]');
ok((await ev(`[...document.querySelectorAll('.bl-aval')].map(o=>parseInt(o.textContent)).reduce((a,b)=>a+b,0)`)) === 100, 'cannot go above 100%');
await click('[data-dec="equity"]');
ok(/还差 10%/.test(await text('#bl-total')), '− takes one 10% step off');
await click('[data-inc="equity"]');
ok(await ev(`document.querySelector('[data-act="reveal"]').disabled`), 'reveal still disabled without the cycle picks');
ok(await ev(`(document.querySelector('.bl-step')?.getBoundingClientRect().height||0) >= 44`), 'step buttons ≥ 44px tall (touch)');
// allocation survives a reload as a draft
await go();
ok(/合计 100%/.test(await text('#bl-total')), 'the draft allocation survives a reload');

/* ---------- 3. the reveal ---------- */
const r1 = await playCard({ long: '②', short: 'tight', fork: 'none', w: { equity: 6, bond: 4 } });
const exp1 = M.scorePlay(r1.c, r1.pick);
ok(await count('#bl-reveal') === 1, 'reveal shown');
ok(await count('#bl-reveal .bl-ret tbody tr') >= 5 && /%/.test(await text('#bl-reveal .bl-ret tbody')), 'returns table per asset');
const js = +(await text('[data-score="judge"] .bl-sv')), rs = +(await text('[data-score="ret"] .bl-sv'));
ok(js === exp1.judge.total, `判断分 ${js} = model ${exp1.judge.total}`);
ok(Math.abs(rs - exp1.ret.total) < 0.051 && rs === 5, `收益分 ${rs} (60/40 = the benchmark = 5)`);
ok(/不是标准答案/.test(await text('#bl-reveal')), 'says the framework is not ground truth');
ok(await count('.bl-node.call') === 2, 'both dials now show the framework call');
ok((await text('.bl-what')).length > 5, 'one line on what happened: ' + await text('.bl-what'));
ok(await count('#bl-bias') === 0, 'no bias profile after 1 card');

/* 「只有 N 年」 */
const shortCard = BLIND.cards.find(c => (c.reveal.ret3.years || 3) < 3);
if (shortCard) {
  await go('?card=' + shortCard.id);
  await playCard({});
  ok(new RegExp(`只有 ${shortCard.reveal.ret3.years} 年`).test(await text('#bl-reveal')), `${shortCard.id}: 「只有 ${shortCard.reveal.ret3.years} 年」 label`);
  ok(/保留样本/.test(await text('.bl-head')) === !!shortCard.holdout, '保留样本 tag follows the data');
}

/* ---------- 4. 10 plays -> bias profile ---------- */
await go();
let guard = 0;
while ((await played()) < 10 && guard++ < 20) {
  if (!(await count('[data-act="reveal"]'))) await click('[data-act="next"]');
  await sleep(80);
  const n = await played();
  await playCard({ long: '②', short: 'ease', fork: n % 2 ? 'B2' : 'none', w: n % 3 ? { bond: 5, house: 5 } : { cash: 10 } });
}
ok(await played() === 10, '10 cards played');
ok(await count('#bl-reveal #bl-bias') === 1, 'bias profile appears in the 10th reveal');
ok(await count('#bl-bias li') >= 1, 'bias profile lists findings: ' + (await ev(`[...document.querySelectorAll('#bl-bias li b')].map(b=>b.textContent).join(' / ')`)));

/* ---------- 5. reload keeps progress; deck ---------- */
await go();
ok(await played() === 10, 'reload keeps 10 plays');
await go('?view=deck');
ok(await count('.bl-tile') === BLIND.cards.length && await count('.bl-tile.done') === 10, `deck: ${BLIND.cards.length} tiles, 10 done`);
await click('[data-filt="iso:JPN"]');
ok(await ev(`[...document.querySelectorAll('.bl-tile .bl-tt')].every(t=>/日本/.test(t.textContent))`) && await count('.bl-tile') > 0, 'country filter');
await click('[data-filt="type:危"]');
ok(await ev(`[...document.querySelectorAll('.bl-tile .bl-tag.type')].every(t=>t.textContent==='危')`), 'type filter');
await click('[data-filt="iso:all"]'); await click('[data-filt="type:all"]');
await click('[data-act="bias"]');
ok(await count('.bl-biasv #bl-bias') === 1, 'bias view from the deck');
await click('[data-act="deck"]');
// a done tile reopens its reveal
const doneId = await ev(`document.querySelector('.bl-tile.done').dataset.open`);
await click(`.bl-tile[data-open="${doneId}"]`);
ok(await curId() === doneId && await count('#bl-reveal') === 1, 'a done tile reopens its reveal');
ok(await count('a[href="../"]') >= 1, 'link back to the main game');

/* ---------- 6. phone 390: no horizontal scroll ---------- */
await size(390, 844, true);
for (const [q, nm] of [['', 'card'], ['?card=' + doneId, 'reveal'], ['?view=deck', 'deck'], ['?view=bias', 'bias']]) {
  await go(q);
  const h = await hscroll();
  ok(h.sw <= h.W && !h.bad.length, `phone 390 ${nm}: scrollWidth ${h.sw}, overflowing ${h.bad.join(' ') || 'none'}`);
}
await go('');
const h2 = await hscroll();
ok(h2.sw <= 390, 'phone 390 allocation screen: ' + h2.sw);

/* ---------- 7. reset with confirm ---------- */
await size(1180, 820);
await go('?view=deck');
await click('[data-act="reset"]');
ok(await played() === 10 && /再点一次/.test(await text('[data-act="reset"]')), 'reset asks to confirm first');
await click('[data-act="reset"]');
ok(await played() === 0, 'confirmed reset clears progress');
await go();
ok(await played() === 0, 'reset survives a reload');

/* ---------- 8. storage blocked: still playable ---------- */
const blockId = (await send('Page.addScriptToEvaluateOnNewDocument', { source: `Object.defineProperty(window,'localStorage',{get(){throw new Error('blocked')}})` })).result.identifier;
await go();
await playCard({});
ok(await count('#bl-reveal') === 1, 'storage blocked: a card can still be played');
await send('Page.removeScriptToEvaluateOnNewDocument', { identifier: blockId });

/* ---------- screenshots ---------- */
if (process.env.SHOTS) {
  const dir = join(ROOT, 'tools/shots/blind');
  mkdirSync(dir, { recursive: true });
  const snap = async name => writeFileSync(join(dir, name + '.png'), Buffer.from((await send('Page.captureScreenshot', { format: 'png' })).result.data, 'base64'));
  const scrollTo = sel => ev(`(()=>{const e=document.querySelector(${JSON.stringify(sel)}); if(e){ const y=e.getBoundingClientRect().top+scrollY-60; scrollTo(0,y);} return !!e})()`);
  // a 10-play history (varied picks) for the bias profile / deck
  const hist = DECK.slice(0, 10).map((c, i) => ({ id: c.id, long: i % 3 ? '②' : '⑤', fork: i % 4 ? 'none' : 'B2', short: ['ease', 'tight', 'expand', 'ease'][i % 4],
    w: i % 2 ? { bond: 4, house: 4, cash: 2 } : { equity: 5, bond: 3, cash: 2 }, at: 0 }));
  const seed = (plays, draft = null, seen = true) => ev(`localStorage.setItem('mwf-blind-v1', ${JSON.stringify(JSON.stringify({ v: 1, plays, survivorSeen: seen, draft }))}), true`);
  const devs = [['ipad', 1180, 820, false], ['phone', 390, 844, true], ['desktop', 1920, 1000, false]];
  const cardId = DECK[2].id;   // USA-2006 in batch 1
  for (const [tag, w, h, mob] of devs) {
    await size(w, h, mob);
    await go(); await seed([], null, false);
    await go('?card=' + cardId); await snap(`${tag}-1-card`);
    await seed([], { id: cardId, long: '②', fork: 'none', short: 'tight', w: { equity: 4, bond: 2, house: 2, fxJPY: 1, cash: 1 } }, true);
    await go('?card=' + cardId); await scrollTo(w >= 900 ? '#bl-judge' : '#bl-alloc'); await sleep(150); await snap(`${tag}-2-allocation`);
    await click('[data-act="reveal"]'); await sleep(250); await scrollTo('#bl-reveal'); await sleep(150); await snap(`${tag}-3-reveal`);
    await seed(hist); await go('?card=' + hist[9].id); await scrollTo('#bl-bias'); await sleep(150); await snap(`${tag}-4-bias`);
    await go('?view=deck'); await snap(`${tag}-5-deck`);
  }
  await size(1180, 820);
  await go(); await ev(`localStorage.clear(), true`);
  console.log('screenshots ->', dir);
}

ok(errors.length === 0, 'no JS errors' + (errors.length ? ': ' + errors.slice(0, 5).join(' | ') : ''));
console.log(fails ? `\n${fails} FAILED` : '\nALL OK');
try { await send('Browser.close'); } catch (e) { /* ignore */ }
stopAll();
process.exit(fails ? 1 : 0);
