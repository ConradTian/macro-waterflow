// node tools/check_causal_view.mjs
// The 传导链 block of the concept card (src/ui/causal-view.js): render it for every concept x mode x direction and check that
//   - nothing throws, the block is non-empty (detected cards: the one-line "不在传导链上" note), every chip points at a real concept / extra node;
//   - the diagram helpers (highlightTargets / pushBadges / playScript) only name real nodes;
//   - the 用模拟核对 computation returns numbers (US and town) and renders.
import { CONCEPTS } from '../src/data/concepts.js';
import { EXTRA_NODES, METRIC } from '../src/data/causal.js';
import { chainView, allNodes } from '../src/ui/causal-graph.js';
import { chainHtml, highlightTargets, pushBadges, playScript, checkPlan, runCheckSync, fmtChange, judge, nodeName } from '../src/ui/causal-view.js';

let fail = 0, n = 0;
const bad = m => { fail++; if (fail < 40) console.log('FAIL ' + m); };
const ON_MAP = new Set(allNodes());
const off = [];
const real = id => !!(CONCEPTS[id] || EXTRA_NODES[id]);

for (const id of Object.keys(CONCEPTS)) {
  for (const mode of ['history', 'free']) {
    const detected = chainView(id, { mode }).detected;
    if (!detected && !ON_MAP.has(id)) { if (!off.includes(id)) off.push(id); continue; }
    for (const push of [null, 1, -1]) {
      for (const open of [new Set(), new Set(['up-more', 'in-more', 'down-more', 'd:housePrice', 'd:M', 'l:0', 'l:1', 'l:2'])]) {
        let h;
        try { h = chainHtml(id, { mode, push, open, playing: push === 1, status: 'x', check: null }); } catch (e) { bad(`${id}/${mode}/${push}: throws ${e.message}`); continue; }
        n++;
        if (!h || !h.includes('data-cv')) { bad(`${id}/${mode}: empty`); continue; }
        if (detected && !h.includes('cv-det')) bad(`${id}: detected card without the note`);
        if (!detected && !h.includes('data-cv-act="play"')) bad(`${id}: no play button`);
        for (const m of h.matchAll(/data-(?:term|xnode|cv-chip)="([^"]+)"/g)) if (!real(m[1])) bad(`${id}/${mode}: chip for unknown node ${m[1]}`);
        if (/undefined|NaN|\[object/.test(h)) bad(`${id}/${mode}: broken text in html`);
      }
      if (push === null) continue;
      const dir = push;
      try {
        const ht = highlightTargets(id, { mode, dir }), pb = pushBadges(id, { mode, dir }), ps = playScript(id, { mode, dir });
        for (const x of [...ht.from, ...ht.to, ...pb.keys(), ...ps.map(s => s.node)]) if (!real(x)) bad(`${id}: helper names unknown node ${x}`);
        if (!detected && !ps.length) bad(`${id}: empty play script`);
        if (!detected && !ht.from.length && !ht.to.length) bad(`${id}: nothing to highlight`);
        if (!detected && ps.length && !ps.some(s => s.role === 'self')) bad(`${id}: play script never reaches the card itself`);
      } catch (e) { bad(`${id}/${mode}/${dir}: helper throws ${e.message}`); }
    }
  }
}
for (const id of off) { const h = chainHtml(id, {}); if (!h.includes('cv-det') || h.includes('undefined')) bad(`${id}: off-map card renders badly`); }
console.log(off.length ? `concepts not on the causal map yet (note only): ${off.join(', ')}` : 'every concept is on the causal map or detected');
console.log(`rendered ${n} blocks (${Object.keys(CONCEPTS).length} concepts x 2 modes x 3 push states x 2 fold states)`);

// ---- 用模拟核对
const CASES = [['us', 'dsr', 56], ['us', 'housePrice', 56], ['us', 'qe', 30], ['us', 'bankApproval', 70], ['town', 'newLoans', 6], ['town', 'housePrice', 6], ['town', 'bankApproval', 6]];
for (const [scenario, id, t] of CASES) {
  for (const dir of [1, -1]) {
    const plan = checkPlan(id, { mode: 'history', dir });
    if (!plan) { bad(`${scenario}/${id}: no check plan`); continue; }
    const t0 = Date.now();
    let r;
    try { r = runCheckSync({ valveNode: plan.valveNode, valveId: plan.valveId, vdir: plan.vdir, t, scenario, mode: 'history' }); } catch (e) { bad(`${scenario}/${id}/${dir}: check throws ${e.message}`); continue; }
    const ms = Date.now() - t0;
    if (r.status === 'impossible') { console.log(`  ${scenario}/${id} ${dir > 0 ? '↑' : '↓'} (${plan.valveNode} ${plan.vdir > 0 ? '↑' : '↓'}): impossible - ${r.reason}`); if (!r.reason) bad('impossible without a reason'); continue; }
    if (r.status !== 'ok') { bad(`${scenario}/${id}: status ${r.status}`); continue; }
    const nums = Object.values(r.metrics).filter(m => m.y1 && Number.isFinite(m.y1[0]) && Number.isFinite(m.y1[1]) && m.y2 && Number.isFinite(m.y2[1]));
    if (nums.length < 10) bad(`${scenario}/${id}: only ${nums.length} metrics`);
    const html = chainHtml(id, { mode: 'history', push: dir, check: r });
    if (!html.includes('cv-sim') || !html.includes('cv-what')) bad(`${scenario}/${id}: check not rendered`);
    const own = r.metrics[id] && judge(r.metrics[id], { sign: dir, lag: 0 });
    const hp = r.metrics.housePrice && fmtChange(r.metrics.housePrice.kind, ...r.metrics.housePrice.y2);
    console.log(`  ${scenario}/${id} ${dir > 0 ? '↑' : '↓'}: ${r.turn}${scenario === 'us' ? ' from ' + r.date : ''}, ${r.steps}q, ${nums.length} metrics, housePrice(2y) ${hp ? hp.text : '-'}${own ? ', self ' + own.mark : ''}  [${ms} ms]`);
  }
}
// an impossible turn is reported, not thrown (rate already at 0 in 2009)
const imp = runCheckSync({ valveNode: 'policyRate', valveId: 'policyRate', vdir: -1, t: 56, scenario: 'us', mode: 'history' });
if (imp.status !== 'impossible' || !imp.reason) bad('policyRate down at ~0.2% should be impossible');
const ok2 = runCheckSync({ valveNode: 'policyRate', valveId: 'policyRate', vdir: -1, t: 30, scenario: 'us', mode: 'history' });
if (ok2.status !== 'ok') bad('policyRate down in 2002 should be possible: ' + ok2.reason);
// formatting
const f1 = fmtChange('pp', 0.02, 0.0215), f2 = fmtChange('rel', 100, 96.9), f3 = fmtChange('rel', 100, 100.1);
if (f1.text !== '+0.15pp' || f2.text !== '−3.1%' || f3.sign !== 0) bad(`fmtChange: ${JSON.stringify([f1, f2, f3])}`);
if (nodeName('dsr') !== 'DSR 偿债率') bad('nodeName');
console.log(fail ? `\n${fail} FAIL` : '\nOK: causal view');
process.exit(fail ? 1 : 0);
