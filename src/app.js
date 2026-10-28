// App shell: time bar, play loop, fixed water diagram, 4 tabs, pause toast.
// ENGINE SWAP: the orchestrator replaces the next import with './engine/sim.js'.
import { createSim } from './engine/sim.js';
import { renderFlow, setFlowDuration, setFlowContext } from './ui/flow.js';
import { renderHeadline } from './ui/headline.js';   // 本季看点 strip under the time bar

const $ = id => document.getElementById(id);
const params = new URLSearchParams(location.search);

// light theme by default (the html tag says data-theme="light"; the learner prefers it); ?theme=dark still forces dark
if (params.get('theme')) document.documentElement.dataset.theme = params.get('theme');

// free-run subpage (free/index.html sets <body data-mode="free">; ?mode=free also works)
const MODE = (document.body.dataset.mode === 'free' || params.get('mode') === 'free') ? 'free' : 'history';

const TABS = [
  { id: 'ledger', label: '流水账' },
  { id: 'cycle', label: '周期' },
  { id: 'assets', label: '资产' },
  { id: 'takeover', label: '接管' },
];
const SPEEDS = [1, 2, 4];

let sim, real = null;
let mainSim = null, mainReal = null;   // TOWN-LESSONS hook: the US sim/data stay here while a lesson swaps the town sim in (ctx.setSim)
let snap = null, prevSnap = null;
let playing = false, speed = 1, timer = 0, tickMs = 1000;
let activeTab = TABS.some(t => t.id === params.get('tab')) ? params.get('tab') : 'ledger';
const tabMods = {}; // id -> module | null (failed)

/* ---------- data + sim ---------- */
async function boot() {
  try { real = (await import('./data/us-quarterly.js')).US_Q; } catch (e) { real = null; }
  // DIAGRAM v2 screenshot helper: ?scenario=town boots the 万元 town economy (lessons switch scenarios themselves)
  sim = params.get('scenario') === 'town' ? createSim({ mode: MODE, scenario: 'town' }) : createSim({ data: real, mode: MODE });
  mainSim = sim; mainReal = real;                    // TOWN-LESSONS hook (see ctx.setSim in loadLessons)
  setFlowContext({ sim: () => sim, setTab, openTerm: id => openTerm(id) });   // DIAGRAM v2 hook: valve popover reads sim.valves, 去接管 button switches tab
  const skip = parseInt(params.get('t') || '0', 10);
  for (let i = 0; i < skip && !sim.done; i++) sim.step();
  snap = sim.snapshot();
  sim.on('reset', () => { snap = sim.snapshot(); prevSnap = null; renderAll(); });

  buildTabbar();
  wireControls();
  await installConcepts();
  renderAll();
  if (MODE === 'free') {                            // free-run subpage: full interface, no lessons
    if (params.get('pause') !== '1') setTimeout(() => setPlaying(true), 600);
    return;
  }
  if (params.has('lesson')) await loadLessons();   // LESSONS: ?lesson=0&step=N jumps straight into a lesson (screenshots)
  else {
    loadLessons().catch(() => {});                 // preload: role-lesson availability feeds the 接管 tab links
    if (params.get('pause') !== '1') setTimeout(() => setPlaying(true), 600);
  }
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
  if (playing) timer = setTimeout(tick, tickMs / speed);
}
function tick() {
  if (!playing) return;
  advance();
  if (sim.done) setPlaying(false);
  else if (playing) timer = setTimeout(tick, tickMs / speed);
}
function advance() {
  if (sim.done) return;
  prevSnap = snap;
  sim.step();
  snap = sim.snapshot();
  setFlowDuration($('diagram'), Math.min(800, tickMs * 0.85 / speed));
  renderAll();
  if (snap.pauses && snap.pauses.length && !lessonQuiet) {
    const wasPlaying = playing;
    setPlaying(false);
    showToast(snap.pauses.map(p => p.message).join('；'), wasPlaying);
  }
}

/* ---------- LESSONS glue (src/ui/lessons.js owns the logic; this is only the hook surface) ---------- */
let lessonsMod = null, lessonQuiet = false;
async function loadLessons() {
  if (lessonsMod) return lessonsMod;
  lessonsMod = await import('./ui/lessons.js');
  lessonsMod.initLessons({
    sim: () => sim, real: () => real, getSnap: () => snap,
    setPlaying, isPlaying: () => playing, openTerm,
    setQuiet: q => { lessonQuiet = q; if (q) hideToast(); },          // suppress key-node pause toasts during a lesson
    refresh: () => { snap = sim.snapshot(); prevSnap = null; renderAll(); },
    setTickMs: ms => { tickMs = ms || 1000; if (playing) setPlaying(true); },   // ms per quarter at 1x (lessons play slowly)
    setTab,
    // TOWN-LESSONS hook: show another sim (the town) in the same diagram; setSim(null) restores the US sim
    setSim: (s, r) => { sim = s || mainSim; real = s ? (r || mainReal) : mainReal; snap = sim.snapshot(); prevSnap = null; renderAll(); },
  });
  return lessonsMod;
}
function setTab(id) {
  if (!TABS.some(t => t.id === id)) return;
  activeTab = id; $('tab-content').scrollTop = 0; renderTabbar(); renderTab();
}
// a lesson with startParts hides what is not yet revealed: body.parts-on + body[data-vis="bank pool ledger"]
function tabLocked(id) {
  const b = document.body;
  return b.classList.contains('parts-on') && !(' ' + (b.dataset.vis || '') + ' ').includes(' ' + id + ' ');
}
// start a lesson from anywhere (e.g. the 接管 tab: detail = { id } or { role })
document.addEventListener('mw:lesson', async e => {
  try { const m = await loadLessons(); await m.startLesson(e.detail.role ? 'role:' + e.detail.role : e.detail.id, 0); } catch (err) { console.error(err); }
});
async function openCourseMenu() { try { (await loadLessons()).openMenu(); } catch (e) { console.error(e); showToast('教学模块加载失败', false); } }

// pinned 周期-tab condition became met (src/ui/tabs/_cycle-ev.js): pause + toast through the same path as the key-node pauses.
// Deferred one tick: the event fires inside sim.step(), before advance() has replaced `snap` (the toast prefixes the date).
document.addEventListener('mw:pause', e => {
  const msg = String(e.detail?.message || '');
  if (!msg) return;
  setTimeout(() => {
    if (lessonQuiet) return;
    const shown = !$('toast').hidden;                       // a key-node pause already showed a toast this same quarter: one toast, both messages
    const wasPlaying = playing || (shown && resumeOnOk);
    setPlaying(false);
    if (shown) { $('toast-msg').textContent += '；' + msg; resumeOnOk = wasPlaying; }
    else showToast(msg, wasPlaying);
  }, 0);
});

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
  const teach = $('btn-teach');                       // fixed 教学 button (top-right) -> course menu
  if (teach && MODE !== 'free') teach.onclick = () => openCourseMenu();
}

function buildTabbar() {
  const bar = $('tabbar');
  bar.innerHTML = '';
  for (const t of TABS) {
    const b = document.createElement('button');
    b.textContent = t.label; b.dataset.tab = t.id; b.dataset.part = t.id; b.setAttribute('role', 'tab');
    b.onclick = () => setTab(t.id);
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
  const free = MODE === 'free';
  const badge = $('mode-badge');
  badge.textContent = (sim.scenario === 'town' ? '小镇' : free ? '自由' : '历史') + (sim.takenOver ? ' · 接管' : '');
  badge.classList.toggle('user', !!sim.takenOver);
  const last = free ? 223 : real?.dates ? real.dates.length - 1 : 123;
  $('progress-bar').style.width = Math.min(100, (100 * sim.t) / last) + '%';
  $('btn-step').disabled = sim.done;
  renderFlow($('diagram'), snap, prevSnap);
  try { renderHeadline($('headline'), { sim, snap, openTerm, setTab }); } catch (e) { console.error(e); }
  renderTab();
  if (lessonsMod && lessonsMod.onRender) lessonsMod.onRender();   // LESSONS: re-apply highlights / step triggers
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
  if (tabLocked(id)) {
    box.innerHTML = '<div class="card muted ls-locked"><b>这一块还没出场</b><p>教学会一块一块地解锁。跟着下面的教学卡往下走。</p></div>';
    return;
  }
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
