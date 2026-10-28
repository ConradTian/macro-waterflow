// App shell: time bar, play loop, fixed water diagram, 4 tabs, pause toast.
// ENGINE SWAP: the orchestrator replaces the next import with './engine/sim.js'.
import { createSim } from './engine/sim.js';
import { renderFlow, setFlowDuration } from './ui/flow.js';

const $ = id => document.getElementById(id);
const params = new URLSearchParams(location.search);

// ?theme=dark|light forces a theme (also handy for screenshots)
if (params.get('theme')) document.documentElement.dataset.theme = params.get('theme');

const TABS = [
  { id: 'ledger', label: '流水账' },
  { id: 'cycle', label: '周期' },
  { id: 'assets', label: '资产' },
  { id: 'takeover', label: '接管' },
];
const SPEEDS = [1, 2, 4];

let sim, real = null;
let snap = null, prevSnap = null;
let playing = false, speed = 1, timer = 0;
let activeTab = TABS.some(t => t.id === params.get('tab')) ? params.get('tab') : 'ledger';
const tabMods = {}; // id -> module | null (failed)

/* ---------- data + sim ---------- */
async function boot() {
  try { real = (await import('./data/us-quarterly.js')).US_Q; } catch (e) { real = null; }
  sim = createSim({ data: real, mode: 'history' });
  const skip = parseInt(params.get('t') || '0', 10);
  for (let i = 0; i < skip && !sim.done; i++) sim.step();
  snap = sim.snapshot();
  sim.on('reset', () => { snap = sim.snapshot(); prevSnap = null; renderAll(); });

  buildTabbar();
  wireControls();
  await installConcepts();
  renderAll();
  if (params.get('pause') !== '1') setTimeout(() => setPlaying(true), 600);
}

async function installConcepts() {
  try {
    const m = await import('./ui/concepts.js');
    m.initConcepts({ getSnap: () => snap, sim });
    if (typeof m.openTerm === 'function') openTermFn = m.openTerm;
  } catch (e) { /* PANELS module not there yet */ }
}
let openTermFn = null;
function openTerm(id) {
  if (openTermFn) return openTermFn(id);
  // fall back to the document-level click delegate
  const b = document.createElement('button');
  b.className = 'term'; b.dataset.term = id; b.hidden = true;
  document.body.appendChild(b); b.click(); b.remove();
}

/* ---------- play loop ---------- */
function setPlaying(on) {
  playing = on && !sim.done;
  $('btn-play').textContent = playing ? '⏸' : '▶';
  clearTimeout(timer);
  if (playing) timer = setTimeout(tick, 1000 / speed);
}
function tick() {
  if (!playing) return;
  advance();
  if (sim.done) setPlaying(false);
  else if (playing) timer = setTimeout(tick, 1000 / speed);
}
function advance() {
  if (sim.done) return;
  prevSnap = snap;
  sim.step();
  snap = sim.snapshot();
  setFlowDuration($('diagram'), Math.min(800, 850 / speed));
  renderAll();
  if (snap.pauses && snap.pauses.length) {
    const wasPlaying = playing;
    setPlaying(false);
    showToast(snap.pauses.map(p => p.message).join('；'), wasPlaying);
  }
}

/* ---------- toast ---------- */
let resumeOnOk = false;
function showToast(msg, resume) {
  resumeOnOk = resume;
  $('toast-msg').textContent = `${snap.date} 暂停：${msg}`;
  $('toast').hidden = false;
}
function hideToast() { $('toast').hidden = true; }

/* ---------- controls ---------- */
function wireControls() {
  $('btn-play').onclick = () => { hideToast(); setPlaying(!playing); };
  $('btn-step').onclick = () => { hideToast(); setPlaying(false); advance(); };
  $('btn-speed').onclick = () => {
    speed = SPEEDS[(SPEEDS.indexOf(speed) + 1) % SPEEDS.length];
    $('btn-speed').textContent = speed + '×';
    if (playing) setPlaying(true);
  };
  $('toast-ok').onclick = () => { hideToast(); if (resumeOnOk) setPlaying(true); };
  $('banner-go').onclick = () => { showToast('教学模式开发中', false); resumeOnOk = false; };
  $('banner-x').onclick = () => {
    $('banner').hidden = true;
    try { sessionStorage.setItem('bannerOff', '1'); } catch (e) { /* ignore */ }
  };
  try { if (sessionStorage.getItem('bannerOff')) $('banner').hidden = true; } catch (e) { /* ignore */ }
  if (params.get('banner') === '0') $('banner').hidden = true;
}

function buildTabbar() {
  const bar = $('tabbar');
  bar.innerHTML = '';
  for (const t of TABS) {
    const b = document.createElement('button');
    b.textContent = t.label; b.dataset.tab = t.id; b.setAttribute('role', 'tab');
    b.onclick = () => { activeTab = t.id; $('tab-content').scrollTop = 0; renderTabbar(); renderTab(); };
    bar.appendChild(b);
  }
  renderTabbar();
}
function renderTabbar() {
  for (const b of $('tabbar').children) b.setAttribute('aria-selected', String(b.dataset.tab === activeTab));
}

/* ---------- rendering ---------- */
function renderAll() {
  $('date').textContent = snap.date;
  const free = sim.mode === 'free';
  const badge = $('mode-badge');
  badge.textContent = (free ? '自由' : '历史') + (sim.takenOver ? ' · 接管' : '');
  badge.classList.toggle('user', !!sim.takenOver);
  const last = real?.dates ? real.dates.length - 1 : free ? 223 : 123;
  $('progress-bar').style.width = Math.min(100, (100 * sim.t) / last) + '%';
  $('btn-step').disabled = sim.done;
  renderFlow($('diagram'), snap, prevSnap);
  renderTab();
}

async function renderTab() {
  const id = activeTab;
  const box = $('tab-content');
  if (!(id in tabMods)) {
    try { tabMods[id] = await import(`./ui/tabs/${id}.js`); } catch (e) { tabMods[id] = null; }
    if (id !== activeTab) return;
  }
  const mod = tabMods[id];
  const keep = box.scrollTop;
  if (!mod || typeof mod.render !== 'function') {
    box.innerHTML = '<div class="card muted">（面板开发中）</div>';
    return;
  }
  const ctx = { sim, snap, userSnap: sim.takenOver ? sim.snapshot('user') : null, real, openTerm };
  try {
    mod.render(box, ctx);
  } catch (e) {
    console.error(e);
    box.innerHTML = `<div class="card muted">面板出错：${String(e.message || e)}</div>`;
  }
  box.scrollTop = keep;
}

boot();
