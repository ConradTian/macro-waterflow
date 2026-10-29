// App shell: time bar, play loop, fixed water diagram (or the curves view over it), simple panel (two cycle dials) or the 4 tabs, pause toast,
// multi-window quarter sync.
// ENGINE SWAP: the orchestrator replaces the next import with './engine/sim.js'.
import { createSim } from './engine/sim.js';
import { renderFlow, setFlowDuration, setFlowContext } from './ui/flow.js';
import { renderHeadline } from './ui/headline.js';   // 本季看点 strip under the time bar
import { renderObjective } from './ui/objective.js';   // 总目标 strip (每人真实消费 + four penalty lamps) above the 本季看点 strip
import { initScrubber } from './ui/scrubber.js';     // collapsible time scrubber under the progress line
import { setActiveCountry, registerCountryData } from './ui/country-info.js';   // unit / name / data-source labels of the country view
import { learnedLayers, lessonLayers, getShowAll, setShowAll } from './ui/progress.js';   // progressive diagram (see "layers" below)
import { LAYER_IDS, layersUpTo } from './data/layers.js';
import { REAL_MODE_ISOS, loadRealMod, viewSnapshot, realHint, badgeHtml } from './ui/real-mode.js';   // 「真实 / 模型」 mode (see "real mode" below)

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
const CNAME = { USA: '美国', AUS: '澳洲', GBR: '英国', JPN: '日本', EA: '欧元区', CHN: '中国', ROW: '其他' };

let sim, real = null;
let scrub = null, seeking = false;                    // time scrubber (src/ui/scrubber.js); seeking = a jump in time is replaying (no pause toasts)
let COUNTRY = 'USA', countryNote = '';              // ?country=ISO: which country's data the sim runs on (USA unless that country's view is ready)
let mainSim = null, mainReal = null;   // TOWN-LESSONS hook: the US sim/data stay here while a lesson swaps the town sim in (ctx.setSim)
let snap = null, prevSnap = null;
let playing = false, speed = 1, timer = 0, tickMs = 1000;
let view = params.get('view') === 'waves' ? 'waves' : 'flow';   // left panel: 'flow' = water diagram, 'waves' = curves view (mw:view event, body.dataset.view)
let following = params.get('follow') === '1';                    // mirror another window's quarter (BroadcastChannel); a follower never plays its own timer
let activeTab = TABS.some(t => t.id === params.get('tab')) ? params.get('tab') : 'ledger';
const tabMods = {}; // id -> module | null (failed)
// SIMPLE MODE: 'simple' = diagram + the two cycle dials + 本季看点 + 「更多」; 'full' = the 4 tabs. See "layout" below.
const LAYOUT_KEY = 'mw.layout';
const storedLayout = () => { try { return localStorage.getItem(LAYOUT_KEY); } catch (e) { return null; } };
let layout = params.get('full') === '1' || params.has('tab') ? 'full' : params.get('full') === '0' ? 'simple' : storedLayout() === 'full' ? 'full' : 'simple';
document.body.dataset.layout = layout;

/* ---------- data + sim ---------- */
async function boot() {
  // COUNTRY hook (地图 page): ?country=AUS loads that country's quarterly data when its view is ready, else falls back to the USA with a note
  const want = (params.get('country') || '').toUpperCase();
  if (want && want !== 'USA') {
    try {
      const ci = await import('./data/countries/index.js');
      // ?forceCountry=1 (debug, screenshots and tools/check_country_ui.mjs only): boot the country even while COUNTRY_READY says false
      if ((ci.COUNTRY_READY[want] || params.get('forceCountry') === '1') && ci.COUNTRY_DATA[want]) { real = await ci.COUNTRY_DATA[want](); COUNTRY = want; }
    } catch (e) { real = null; COUNTRY = 'USA'; }
    if (COUNTRY === 'USA') countryNote = `${CNAME[want] || want}的水流图还没做好，先回到美国。`;
  }
  if (COUNTRY === 'USA') { try { real = (await import('./data/us-quarterly.js')).US_Q; } catch (e) { real = null; } }
  if (COUNTRY !== 'USA') document.title = `${CNAME[COUNTRY] || COUNTRY} · 宏观水流模拟器`;
  setActiveCountry(COUNTRY); registerCountryData(COUNTRY, real);      // gauge.js / causal-view.js re-run the engine on this country's data (the US ones import US_Q themselves)
  // DIAGRAM v2 screenshot helper: ?scenario=town boots the 万元 town economy (lessons switch scenarios themselves)
  sim = params.get('scenario') === 'town' ? createSim({ mode: MODE, scenario: 'town' }) : createSim({ data: real, mode: MODE, country: COUNTRY });
  if (params.get('debug') === '1') window.__mw = { sim: () => sim, snap: () => snap };   // read-only handle for tools/check_scrubber.mjs
  mainSim = sim; mainReal = real;                    // TOWN-LESSONS hook (see ctx.setSim in loadLessons)
  document.body.dataset.view = view; document.body.dataset.follow = following ? '1' : '';
  setFlowContext({ sim: () => sim, setTab, openTerm: id => openTerm(id) });   // DIAGRAM v2 hook: valve popover reads sim.valves, 去接管 button switches tab
  const skip = parseInt(params.get('t') || '0', 10);
  for (let i = 0; i < skip && !sim.done; i++) sim.step();
  snap = sim.snapshot();
  sim.on('reset', () => { snap = sim.snapshot(); prevSnap = null; if (!syncing) renderAll(); });

  buildTabbar();
  wireControls();
  await initRealMode();                              // before the scrubber: its range ends at lastRealDate in 真实 mode
  buildScrubber();
  initSync();
  await installConcepts();
  renderAll();
  if (countryNote) showNote(countryNote);
  if (params.get('map') === '1') setMap(true, { select: params.get('select'), year: +params.get('year') || 0, kind: params.get('kind') });   // 地图 page by URL (screenshots, lessons)
  if (MODE === 'free') {                            // free-run subpage: full interface, no lessons
    if (params.get('pause') !== '1' && !following) setTimeout(() => setPlaying(true), 600);
    return;
  }
  if (params.has('lesson')) await loadLessons();   // LESSONS: ?lesson=0&step=N jumps straight into a lesson (screenshots)
  else {
    loadLessons().catch(() => {});                 // preload: role-lesson availability feeds the 接管 tab links
    if (params.get('pause') !== '1' && !following) setTimeout(() => setPlaying(true), 600);
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
  playing = on && !sim.done && !following && !isReal();     // 真实 mode: real data is read one quarter at a time
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
    setQuiet: q => { lessonQuiet = q; if (q) hideToast(); updateTimeControls(); syncRealMode(); },   // suppress key-node pause toasts during a lesson (and lock the scrubber)
    refresh: () => { snap = sim.snapshot(); prevSnap = null; renderAll(); },
    setTickMs: ms => { tickMs = ms || 1000; if (playing) setPlaying(true); },   // ms per quarter at 1x (lessons play slowly)
    setTab: id => setTab(id, { save: false }),       // a lesson runs in the full layout anyway (body.lesson-on); it never changes the viewer's stored choice
    // TOWN-LESSONS hook: show another sim (the town) in the same diagram; setSim(null) restores the US sim
    setSim: (s, r) => { sim = s || mainSim; real = s ? (r || mainReal) : mainReal; snap = sim.snapshot(); prevSnap = null; renderAll(); },
  });
  return lessonsMod;
}
function setTab(id, o = {}) {
  if (!TABS.some(t => t.id === id)) return;
  activeTab = id; $('tab-content').scrollTop = 0; renderTabbar();
  if (!isFull()) setLayout('full', o);                 // anything that asks for a tab (strip item, 去接管 button, dial) opens the full layout
  else renderTab();
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
  if (!msg || seeking) return;                              // a jump in time replays many quarters: no toast for those
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
function showNote(msg) { resumeOnOk = false; $('toast-msg').textContent = msg; $('toast').hidden = false; }   // a plain message (no date prefix)

/* ---------- controls ---------- */
function wireControls() {
  $('btn-play').onclick = () => { if (isReal()) return; hideToast(); setPlaying(!playing); };
  $('btn-step').onclick = () => { hideToast(); setPlaying(false); if (isReal()) realSeek(rt + 1); else advance(); };
  const back = $('btn-back');                         // ⏮ 退一季 = a seek to t-1
  if (back) back.onclick = () => {
    if (isReal()) { if (rt > 0) { hideToast(); realSeek(rt - 1); } return; }
    if (timeLock() || sim.t <= 0) return; hideToast(); setPlaying(false); seekTo(sim.t - 1);
  };
  $('btn-speed').onclick = () => {
    speed = SPEEDS[(SPEEDS.indexOf(speed) + 1) % SPEEDS.length];
    $('btn-speed').textContent = speed + '×';
    if (playing) setPlaying(true);
  };
  $('toast-ok').onclick = () => { hideToast(); if (resumeOnOk) setPlaying(true); };
  const mapBtn = $('btn-map');                        // 🌍 地图 button -> the world map overlay
  if (mapBtn) mapBtn.onclick = () => setMap(true);
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
  const back = document.createElement('button');      // SIMPLE MODE: way back from the full layout (hidden during a lesson)
  back.type = 'button'; back.className = 'tb-simple'; back.dataset.act = 'simple'; back.textContent = '◂ 简洁';
  back.setAttribute('aria-label', '收起四页，回到简洁版（水流图 + 两个周期表盘）');
  back.onclick = () => setLayout('simple');
  bar.appendChild(back);
  renderTabbar();
}
function renderTabbar() {
  for (const b of $('tabbar').children) if (b.dataset.tab) b.setAttribute('aria-selected', String(b.dataset.tab === activeTab));
}

/* ---------- layout: simple (default) / full ----------
   body[data-layout] = the viewer's choice: 'simple' = diagram + the two cycle dials + 本季看点 details + 「更多」 (src/ui/simple.js);
   'full' = the 4 tabs. A running lesson (body.lesson-on, set by lessons.js) always shows the full layout and never changes the choice.
   URL: ?full=1 or any ?tab= opens full, ?full=0 forces simple (neither is stored). Otherwise the stored choice (localStorage 'mw.layout').
   The 「更多」 button, a dial tap, ◂ 简洁, and anything that calls setTab (strip items, the valve popover's 去接管) change it and store it.
   Others may ask with document.dispatchEvent(new CustomEvent('mw:layout', { detail: { layout: 'full' | 'simple', tab?, save? } })). */
const isFull = () => layout === 'full' || document.body.classList.contains('lesson-on');
let shownFull = null;                                   // what the panel currently shows (for the lesson-on switch below)
function setLayout(l, o = {}) {
  layout = l === 'full' ? 'full' : 'simple';
  document.body.dataset.layout = layout;
  if (o.save !== false) {
    try { localStorage.setItem(LAYOUT_KEY, layout); } catch (e) { /* private window etc. */ }
    try { const u = new URL(location.href); u.searchParams.delete('full'); u.searchParams.delete('tab'); history.replaceState(null, '', u); } catch (e) { /* file:// etc. */ }
  }
  if (o.tab && TABS.some(t => t.id === o.tab)) { activeTab = o.tab; $('tab-content').scrollTop = 0; renderTabbar(); }
  syncLayers();
  renderPanel();
}
function renderPanel() {
  if (!sim || !snap) return;
  shownFull = isFull();
  if (shownFull) renderTab(); else renderSimple();
}
let simpleMod = null;
async function renderSimple() {
  if (!simpleMod) { try { simpleMod = await import('./ui/simple.js'); } catch (e) { console.error(e); return; } }
  if (isFull()) return;                                 // changed while the module loaded
  try { simpleMod.renderSimple($('simple'), { sim, snap, openTerm, openFull: tab => (tab ? setTab(tab) : setLayout('full')), ...realCtx() }); } catch (e) { console.error(e); }
}
// 真实 mode extras for the panels (周期 tab, simple dials): realSnap = the real snapshot on screen, modelSnap = the model's same quarter
// (null after the model's last quarter), realHist = the real dials quarter by quarter (realTimeline), realT / realLast = the real time range
function realCtx() {
  if (!isReal() || !rsnap) return {};
  const mLast = modelLastT();
  return { realMode: true, realSnap: rsnap, realT: rt, realLast: realLastT(), realDates: rmMod.realDates(COUNTRY),
    modelSnap: rt <= mLast ? (sim.t === rt ? snap : sim.snapshot('model', rt)) : null, modelLastDate: real?.dates?.[mLast] || '',
    realHist: rmMod.realTimeline(COUNTRY) };
}
// a lesson starting / ending flips what the panel shows: draw the side that just appeared (and the diagram layers follow)
new MutationObserver(() => {
  const b = document.body;
  if (lessonActive != null && !b.classList.contains('lesson-on') && wasLessonOn) lessonActive = null;    // a lesson ended without saying so
  wasLessonOn = b.classList.contains('lesson-on');
  if (sim) syncLayers();
  if (shownFull !== null && isFull() !== shownFull) renderPanel();
  syncRealMode();                                       // a lesson starting / ending forces / restores 模型
}).observe(document.body, { attributes: true, attributeFilter: ['class'] });
document.addEventListener('mw:layout', e => {
  const d = e.detail || {};
  if (d.tab && d.layout !== 'simple') return setTab(d.tab, { save: d.save });
  setLayout(d.layout, { save: d.save });
});

/* ---------- layers: the progressive diagram (tools/COURSE-V3.md; table src/data/layers.js, progress src/ui/progress.js) ----------
   In simple mode and during a lesson the diagram shows only the layers learned so far: body.layers-on + body[data-layers="L-water ..."]
   (CSS in app.css hides every [data-layer] not listed: diagram parts, the objective lamps, the dials; the 🌍 button is dimmed).
     - simple layout, no lesson: learnedLayers() (L-water for a first-time viewer)
     - a lesson running (document event mw:lesson-active { id }, sent by the course runner; { id: null } on exit; a ?lesson= URL seeds it):
       that lesson's layer + the earlier ones whatever the progress; a lesson outside the main line shows everything
     - full layout (「更多」) outside a lesson, a town lesson (body.parts-on: its own parts) and the town scenario: everything (layers off)
     - 「显示全部」 (#layers-toggle, top right of the diagram, localStorage 'mw.layers.all') and ?layers=all (not stored): everything
     - ?layers=L-gov (screenshots, not stored): the layers up to L-gov */
let lessonActive = MODE !== 'free' && params.get('lesson') ? params.get('lesson') : null, wasLessonOn = false;
let layersUrl = params.get('layers');                     // 'all' | a layer id | null
let ltBtn = null, layersKey = null;
const showAllOn = () => layersUrl === 'all' || getShowAll();
function layersWanted() {
  const b = document.body;
  if (b.classList.contains('parts-on') || !sim || sim.scenario === 'town') return { applies: false, set: null };
  const inLesson = lessonActive != null || b.classList.contains('lesson-on');
  if (!inLesson && layout === 'full') return { applies: false, set: null };
  if (showAllOn()) return { applies: true, set: null };
  if (layersUrl && LAYER_IDS.includes(layersUrl)) return { applies: true, set: new Set(layersUpTo(LAYER_IDS.indexOf(layersUrl))) };
  if (inLesson) return { applies: true, set: lessonActive != null ? lessonLayers(lessonActive) : null };
  return { applies: true, set: learnedLayers() };
}
function syncLayers() {
  const b = document.body, W = layersWanted();
  const key = W.set ? LAYER_IDS.filter(l => W.set.has(l)).join(' ') : '';
  if (key !== layersKey) {
    const before = layersKey == null ? null : new Set((layersKey || LAYER_IDS.join(' ')).split(' '));
    layersKey = key;
    if (key) { b.dataset.layers = key; b.classList.add('layers-on'); } else { b.classList.remove('layers-on'); delete b.dataset.layers; }
    // newly shown layers fade in once (lessons.css .part-new); the dials live in the simple panel
    const added = before ? (key ? key.split(' ') : LAYER_IDS).filter(l => !before.has(l)) : [];
    if (added.length) {
      const ns = document.querySelectorAll(added.map(l => `.flow-svg [data-layer="${l}"]`).join(','));
      ns.forEach(n => n.classList.add('part-new'));
      setTimeout(() => ns.forEach(n => n.classList.remove('part-new')), 1800);
    }
    if (before && snap && !isFull()) renderSimple();
  }
  if (ltBtn) {
    ltBtn.hidden = !W.applies;
    const on = showAllOn();
    ltBtn.setAttribute('aria-pressed', String(on));
    ltBtn.title = on ? '现在显示整张图。再点一下：只看学过的部分' : '现在只显示学过的部分。点一下：显示整张图';
  }
}
function buildLayersToggle() {
  ltBtn = document.createElement('button'); ltBtn.type = 'button'; ltBtn.id = 'layers-toggle'; ltBtn.className = 'layers-toggle'; ltBtn.hidden = true;
  ltBtn.innerHTML = '<i aria-hidden="true"></i>显示全部';
  ltBtn.onclick = () => {
    const on = !showAllOn();
    setShowAll(on);
    if (layersUrl === 'all' || (layersUrl && !on)) {        // the URL override ends with the first tap
      layersUrl = null;
      try { const u = new URL(location.href); u.searchParams.delete('layers'); history.replaceState(null, '', u); } catch (e) { /* file:// etc. */ }
    }
    syncLayers();
  };
  $('diagram').appendChild(ltBtn);
}
document.addEventListener('mw:lesson-active', e => {
  const id = e.detail ? e.detail.id : null;
  lessonActive = id == null ? null : String(id);
  if (sim) syncLayers();
  syncRealMode();
});
document.addEventListener('mw:progress', () => { if (sim) syncLayers(); });

/* ---------- left panel: water diagram or curves view ----------
   body.dataset.view = 'waves' | 'flow'. Anyone (the buttons, a lesson step with view:, the URL &view=waves) sets it through
   document.dispatchEvent(new CustomEvent('mw:view', { detail: { view } })). The flow diagram's DOM stays alive underneath
   (the curves view only covers it), so lesson highlights keep working. The view needs the US history run: not the town, not free mode. */
let wvEl = null, vtBtn = null, wvMod = null;
const wavesOk = () => !!(sim && real && sim.mode === 'history' && sim.scenario !== 'town' && COUNTRY === 'USA');
function buildViewDom() {
  const host = $('diagram');
  wvEl = document.createElement('div'); wvEl.id = 'wave-view'; wvEl.className = 'wvw wv pn-cycle'; wvEl.hidden = true;
  wvEl.setAttribute('aria-label', '曲线对照'); host.appendChild(wvEl);
  vtBtn = document.createElement('button'); vtBtn.type = 'button'; vtBtn.id = 'view-toggle'; vtBtn.className = 'view-toggle'; vtBtn.hidden = true;
  vtBtn.onclick = () => document.dispatchEvent(new CustomEvent('mw:view', { detail: { view: view === 'waves' ? 'flow' : 'waves' } }));
  host.appendChild(vtBtn);
  let rz = 0;
  window.addEventListener('resize', () => { clearTimeout(rz); rz = setTimeout(renderView, 120); });
}
document.addEventListener('mw:view', e => {
  view = e.detail && e.detail.view === 'waves' ? 'waves' : 'flow';
  document.body.dataset.view = view;
  try { const u = new URL(location.href); if (view === 'waves') u.searchParams.set('view', 'waves'); else u.searchParams.delete('view'); history.replaceState(null, '', u); } catch (err) { /* file:// etc. */ }
  if (sim && snap) renderView();
});
async function renderView() {
  if (!wvEl) return;
  const eff = view === 'waves' && wavesOk();
  wvEl.hidden = !eff;
  $('diagram').classList.toggle('wv-on', eff);
  vtBtn.hidden = !wavesOk();
  vtBtn.textContent = eff ? '💧 水流' : '📈 曲线';
  vtBtn.setAttribute('aria-label', eff ? '回到水流图' : '把左边换成曲线，和右边的环对照');
  vtBtn.setAttribute('aria-pressed', String(eff));
  if (!eff) return;
  if (!wvMod) { try { wvMod = await import('./ui/wave-view.js'); } catch (err) { console.error(err); return; } }
  if (view !== 'waves' || !wavesOk()) return;                   // changed while the module loaded
  try { wvMod.renderWaveView(wvEl, { sim, snap, real }); } catch (err) { console.error(err); }
}

/* ---------- 地图 page (src/ui/world-map.js owns the DOM inside #world-map) ----------
   Opened by the 🌍 button, ?map=1 (&select=AUS &year=2018 &kind=trade) or document.dispatchEvent(new CustomEvent('mw:map',
   { detail: { open: true|false, select?: 'AUS', year?, kind? } })). The page is an overlay: the US sim and the diagram keep their state underneath.
   Only the card's 「进入」 button leaves it: USA = back here, a ready country = ?country=ISO (full reload), not ready = disabled. */
let wmMod = null, mapWasPlaying = false;
const mapYear = () => {
  const s = (sim === mainSim || !mainSim) ? snap : mainSim.snapshot();
  const y = parseInt(String(s && s.date).slice(0, 4), 10);
  return Number.isFinite(y) ? Math.max(1995, Math.min(2025, y)) : 2025;
};
function mapUrl(open) {
  try { const u = new URL(location.href); if (open) u.searchParams.set('map', '1'); else { u.searchParams.delete('map'); u.searchParams.delete('select'); u.searchParams.delete('year'); u.searchParams.delete('kind'); } history.replaceState(null, '', u); } catch (e) { /* file:// etc. */ }
}
async function setMap(open, o = {}) {
  if (!open) {
    if (wmMod) wmMod.closeWorldMap();
    delete document.body.dataset.map; mapUrl(false);
    if (mapWasPlaying) setPlaying(true);
    mapWasPlaying = false;
    return;
  }
  try {
    if (!wmMod) wmMod = await import('./ui/world-map.js');
  } catch (e) { console.error(e); showNote('地图加载失败'); return; }
  let host = $('world-map');
  if (!host) { host = document.createElement('div'); host.id = 'world-map'; host.className = 'wm'; host.hidden = true; ($('app') || document.body).appendChild(host); }
  if (!wmMod.isMapOpen()) { mapWasPlaying = playing; setPlaying(false); }
  hideToast();
  wmMod.openWorldMap(host, {
    year: o.year || mapYear(), select: o.select || null, kind: o.kind || 'all', country: COUNTRY,
    onClose: () => setMap(false),
    onEnter: iso => {
      if (iso === COUNTRY) return setMap(false);                      // already looking at it: back to its water diagram
      if (iso === 'USA') return goCountry('');                         // from a country view: the US is the root page
      import('./data/countries/index.js').then(ci => { if (ci.COUNTRY_READY[iso]) goCountry(iso); }).catch(() => {});
    },
  });
  mapUrl(true);
}
function goCountry(iso) {                                              // a full reload is fine; keep the theme, drop everything else
  const u = new URL(location.href); const th = u.searchParams.get('theme');
  u.search = ''; if (th) u.searchParams.set('theme', th); if (iso) u.searchParams.set('country', iso);
  location.href = u.href;
}
document.addEventListener('mw:map', e => {
  const d = e.detail || {};
  if (d.open === false) setMap(false);
  else setMap(true, { select: d.select, year: d.year, kind: d.kind });
});

/* ---------- time scrubber + ⏮ 退一季 ----------
   seekTo(t): forward = keep stepping; backward = sim.reset() and step to t (the engine is deterministic and fast). One render at the end.
   Locked while a lesson runs (lessons drive time), in the town and for a follower. A backward jump clears the takeover (and any rule edits):
   asks first, with the scrubber's own small confirm bar. */
const modelLastT = () => (MODE === 'free' ? 223 : real?.dates ? real.dates.length - 1 : 123);
const lastT = () => (isReal() ? realLastT() : modelLastT());      // 真实 mode: the range ends at lastRealDate
function timeLock() {
  if (!sim) return '';
  if (sim.scenario === 'town') return '小镇里不能拖动时间';
  if (lessonQuiet) return '上课时由课程控制时间';                     // set by the lessons runner for the whole lesson (setQuiet)
  if (following) return '正在跟随另一个窗口，时间由它控制';
  return '';
}
function buildScrubber() {
  try {
    scrub = initScrubber({
      progress: document.querySelector('.topbar .progress'), sim: () => sim, real: () => real, mode: MODE, country: () => COUNTRY,
      last: lastT, lock: timeLock, createSim,
      onDragStart: () => { hideToast(); setPlaying(false); },
      onSeek: t => (isReal() ? realSeek(t) : seekTo(t)),
      // 真实 mode: the slider reads the real quarter, its triangles are the long-cycle changes on REAL data (realTimeline)
      now: () => (isReal() ? rt : sim.t), realMarks: () => (isReal() ? realStageMarks() : null),
    });
  } catch (e) { console.error(e); scrub = null; }
}
function updateTimeControls() {
  const back = $('btn-back');
  if (back && sim) {
    const lock = isReal() ? '' : timeLock(), now = isReal() ? rt : sim.t;
    back.disabled = !!lock || now <= 0;
    back.title = lock || (now <= 0 ? '已经在第一季' : '退一季');
  }
  if (scrub) scrub.update();
}
// 真实 mode: a small tag over the diagram says what grey and 「—」 mean
let rtagEl = null;
function renderRealTag(on) {
  const host = $('diagram');
  if (!host) return;
  if (!rtagEl) {
    rtagEl = document.createElement('div'); rtagEl.className = 'rm-tag'; rtagEl.id = 'rm-tag'; rtagEl.setAttribute('role', 'note');
    rtagEl.innerHTML = '<b>真实数据</b><span class="rm-est">灰字 = 模型估算</span><span class="rm-none">— = 没有数据</span>';
    rtagEl.title = '灰字：真实统计里没有这一项，显示的是模型的估算。—：这一季还没发布，或模型只算到 2025Q4。';
    host.appendChild(rtagEl);
  }
  rtagEl.hidden = !on;
}
// 真实 mode: 接管 is off (the tab stays visible, disabled, with the reason as its tooltip)
function syncTakeoverTab(on) {
  const b = document.querySelector('#tabbar [data-tab="takeover"]');
  if (!b) return;
  b.disabled = on; b.classList.toggle('rm-off', on);
  if (on) b.title = REAL_TIP + '：接管请切回「模型」'; else b.removeAttribute('title');
}
let seekBusy = false;
async function seekTo(t) {
  if (!sim || timeLock() || seekBusy) return false;
  t = Math.max(0, Math.min(lastT(), Math.round(t)));
  if (!Number.isFinite(t) || t === sim.t) { updateTimeControls(); return true; }
  if (t < sim.t) {                                          // going back resets the sim: warn if that throws away the learner's work
    const msg = sim.takenOver ? '往回拖会清掉你的接管操作，继续吗？' : (scrub && scrub.rulesModified() ? '往回拖会清掉你改过的规则，继续吗？' : '');
    if (msg && scrub) {
      seekBusy = true;
      const yes = await scrub.confirm(msg);
      seekBusy = false;
      if (!yes) { updateTimeControls(); return false; }
      if (timeLock()) return false;
    }
  }
  hideToast(); setPlaying(false);
  const from = sim.t, before = snap;
  seeking = true; syncing = true;                           // no pause toasts, no render per quarter
  try {
    if (t < sim.t) { sim.reset(); renderFlow($('diagram'), sim.snapshot(), null); }   // the diagram's 产能 index is taken from the first quarter it draws: draw t=0 first, as in a normal run
    while (sim.t < t && !sim.done) sim.step();
  } finally { seeking = false; syncing = false; }
  prevSnap = from + 1 === t ? before : null;
  snap = sim.snapshot();
  setFlowDuration($('diagram'), 400);
  renderAll();
  return true;
}

/* ---------- real mode: the 「真实 / 模型」 toggle (tools/COURSE-V3.md, data tools/REAL-DATA.md, helpers src/ui/real-mode.js) ----------
   Wanted mode: ?mode=real / ?mode=model (not stored), else localStorage 'mw.mode', else 模型. The toggle stores the choice.
   Effective 真实 needs: the history run of the USA or AUS (the main sim, not the town, not a follower) and NO lesson
   (lessons always run in 模型; the wanted mode comes back when the lesson ends).
   In 真实 mode the quarter on screen is `rt` (0 = 1995Q1 .. lastRealDate, which can be after the model's last quarter); the model sim
   follows to min(rt, its last quarter). The diagram draws viewSnapshot(model, real); 无 play, 无 接管 (真实数据只能逐季看). */
const MODE_KEY = 'mw.mode';
const REAL_TIP = '真实数据只能逐季看';
let rmMod = null, rmWant = 'model', rt = 0, rsnap = null, vsnap = null, prevV = null, wasReal = false, rmTog = null;
const storedMode = () => { try { return localStorage.getItem(MODE_KEY); } catch (e) { return null; } };
{ const u = params.get('mode'); rmWant = u === 'real' || u === 'model' ? u : storedMode() === 'real' ? 'real' : 'model'; }
const rmAvail = () => !!(rmMod && sim && MODE === 'history' && REAL_MODE_ISOS.includes(COUNTRY) && sim === mainSim && sim.scenario !== 'town');
const rmLesson = () => lessonActive != null || lessonQuiet || document.body.classList.contains('lesson-on') || document.body.classList.contains('parts-on');
function isReal() { return rmWant === 'real' && rmAvail() && !rmLesson() && !following; }
function realLastT() { if (!rmMod) return modelLastT(); const d = rmMod.realDates(COUNTRY); return Math.max(0, d.indexOf(rmMod.realLastDate(COUNTRY))); }
async function initRealMode() {
  if (MODE !== 'history' || !REAL_MODE_ISOS.includes(COUNTRY)) return;
  try { rmMod = await loadRealMod(); } catch (e) { console.error(e); rmMod = null; return; }
  try {
    if (!document.querySelector('link[href$="real-mode.css"]')) {
      const l = document.createElement('link'); l.rel = 'stylesheet'; l.href = new URL('../assets/css/real-mode.css', import.meta.url).href; document.head.appendChild(l);
    }
  } catch (e) { /* ignore */ }
  // date + badge share one box (a 390px phone stacks them, see real-mode.css), then the toggle
  const date = $('date'), badge = $('mode-badge');
  if (date && badge && !date.parentNode.classList.contains('tb-dt')) {
    const box = document.createElement('div'); box.className = 'tb-dt';
    date.parentNode.insertBefore(box, date); box.appendChild(date); box.appendChild(badge);
  }
  rmTog = document.createElement('div'); rmTog.className = 'rm-tog'; rmTog.id = 'rm-toggle'; rmTog.setAttribute('role', 'group'); rmTog.setAttribute('aria-label', '看模型还是真实数据');
  rmTog.innerHTML = '<button type="button" data-m="model" aria-pressed="true">模型</button><button type="button" data-m="real" aria-pressed="false">真实</button>';
  rmTog.addEventListener('click', e => {
    const b = e.target.closest('button[data-m]');
    if (!b || b.disabled) return;
    setRealMode(b.dataset.m);
  });
  const anchor = document.querySelector('.timebar .tb-dt') || badge;
  anchor.after(rmTog);
  rt = sim.t;
}
function setRealMode(m) {
  rmWant = m === 'real' ? 'real' : 'model';
  try { localStorage.setItem(MODE_KEY, rmWant); } catch (e) { /* private window etc. */ }
  try { const u = new URL(location.href); if (u.searchParams.get('mode') === 'real' || u.searchParams.get('mode') === 'model') { u.searchParams.delete('mode'); history.replaceState(null, '', u); } } catch (e) { /* file:// etc. */ }
  if (isReal()) setPlaying(false);
  prevSnap = null; prevV = null;
  renderAll();
}
// the effective mode changed under us (a lesson started / ended): redraw once
function syncRealMode() { if (sim && snap && rmMod && isReal() !== wasReal) { prevSnap = null; prevV = null; renderAll(); } }
// enter 真实: start from the model's quarter (or stay after the model's range if the model has not moved since)
function enterReal() {
  const mLast = modelLastT();
  if (!(rt > mLast && sim.t === mLast)) rt = sim.t;
  rt = Math.max(0, Math.min(realLastT(), rt));
  setPlaying(false);
}
let realSeekBusy = false;
async function realSeek(t) {
  if (!isReal() || realSeekBusy) return false;
  t = Math.max(0, Math.min(realLastT(), Math.round(t)));
  if (!Number.isFinite(t)) return false;
  if (t === rt) { updateTimeControls(); return true; }
  const from = rt, mt = Math.min(t, modelLastT());
  prevV = Math.abs(t - rt) === 1 ? vsnap : null;
  rt = t;
  if (mt !== sim.t) {
    if (mt === sim.t + 1) {
      prevSnap = snap;
      seeking = true;                                         // no pause toasts / pinned-row toasts for a real-data step
      try { sim.step(); } finally { seeking = false; }
      snap = sim.snapshot();
    } else {
      realSeekBusy = true;
      let done = false;
      try { done = await seekTo(mt); } finally { realSeekBusy = false; }   // seekTo renders (and asks first if a takeover would be lost)
      if (!done) { rt = from; prevV = null; renderAll(); }
      return done;
    }
  }
  setFlowDuration($('diagram'), 400);
  renderAll();
  return true;
}
let marksCache = null;
function realStageMarks() {
  if (!rmMod) return [];
  if (marksCache && marksCache.iso === COUNTRY) return marksCache.list;
  const GL = { 1: '①', 2: '②', 5: '⑤', 6: '⑥', 7: '⑦', 8: '⑧' }, out = [];
  let prev = null, fork = false;
  (rmMod.realTimeline(COUNTRY) || []).forEach((h, t) => {
    const L = h.cycles && h.cycles.long;
    if (!L || t > realLastT()) return;
    if (prev != null && L.stage !== prev) out.push({ t, mark: GL[L.stage] || String(L.stage), text: `真实数据：大周期进入 ${L.label || L.stage}`, kind: 'stage' });
    prev = L.stage;
    if (!fork && L.fork === 'B2') { fork = true; out.push({ t, mark: 'B2', text: '真实数据：大周期走上 B2 岔路', kind: 'b2' }); }
  });
  marksCache = { iso: COUNTRY, list: out };
  return out;
}
// per render: the real snapshot, the view snapshot and the time-bar controls
function prepareReal() {
  const on = isReal();
  if (on && !wasReal) enterReal();
  if (!on && wasReal) prevV = null;
  wasReal = on;
  document.body.classList.toggle('rm-avail', rmAvail() && !following);
  document.body.classList.toggle('rm-real', on);
  if (rmTog) {
    const avail = rmAvail() && !following, lesson = rmLesson();
    rmTog.hidden = !avail;
    rmTog.classList.toggle('forced', avail && lesson);
    rmTog.title = lesson ? '上课时用模型（下课后回到你的选择）' : '模型 = 模拟器自己算的；真实 = 官方统计（只能逐季看）';
    for (const b of rmTog.children) {
      b.disabled = lesson;
      b.setAttribute('aria-pressed', String((b.dataset.m === 'real') === on));
    }
  }
  if (!on) { rsnap = null; vsnap = null; return; }
  rsnap = rmMod.realSnapshot(COUNTRY, rt);
  const mLast = modelLastT();
  const model = rt <= mLast ? (sim.t === rt ? snap : sim.snapshot('model', rt)) : null;
  vsnap = viewSnapshot(model, rsnap, sim.snapshot('model', 0), rmMod.realSnapshot(COUNTRY, 0));
}

/* ---------- multi-window sync: only the quarter (BroadcastChannel 'macro-waterflow', same origin + same browser) ----------
   Any window not following is a leader: after a render it posts { t, mode, scenario, date, from }. A follower (?follow=1, or the 跟随 toggle,
   event mw:follow { on }) mirrors it: forward -> step; backwards -> reset + step to t (the engine is deterministic and fast). It ignores other
   modes / scenarios and the town, and does not play. A follower asks for the current state when it starts ({ req: true }). Tabs / lessons are not synced. */
const WID = Math.random().toString(36).slice(2, 8) + Date.now().toString(36);
let chan = null, postTimer = 0, syncing = false;
function noSync() { document.body.classList.add('no-sync'); following = false; document.body.dataset.follow = ''; }
function initSync() {
  if (typeof BroadcastChannel !== 'function') return noSync();
  try { chan = new BroadcastChannel('macro-waterflow'); } catch (e) { chan = null; return noSync(); }
  chan.onmessage = e => onSyncMsg(e.data);
  if (following) { setPlaying(false); chan.postMessage({ req: true, from: WID }); }
}
function postNow() {
  if (!chan || following || !sim || !snap || sim.scenario === 'town') return;
  chan.postMessage({ t: sim.t, mode: sim.mode, scenario: sim.scenario, date: snap.date, from: WID });
}
function schedulePost() {                                   // debounced: a lesson's silent resets collapse into one message
  if (!chan || following) return;
  clearTimeout(postTimer); postTimer = setTimeout(postNow, 40);
}
function onSyncMsg(m) {
  if (!m || m.from === WID) return;
  if (m.req) { if (!following) postNow(); return; }
  if (!following || !sim || sim.scenario === 'town' || m.scenario === 'town') return;
  if (m.mode !== sim.mode || m.scenario !== sim.scenario || !Number.isFinite(m.t) || m.t === sim.t) return;
  const t = Math.max(0, Math.floor(m.t));
  hideToast(); setPlaying(false);
  syncing = true;
  try {
    const before = snap;
    if (t < sim.t) sim.reset();
    const one = sim.t + 1 === t;
    while (sim.t < t && !sim.done) sim.step();
    prevSnap = one ? before : null;
    snap = sim.snapshot();
  } finally { syncing = false; }
  setFlowDuration($('diagram'), 400);
  renderAll();
}
document.addEventListener('mw:follow', e => {
  if (!chan) return;
  following = !!(e.detail && e.detail.on);
  document.body.dataset.follow = following ? '1' : '';
  document.querySelectorAll('[data-act="wv-follow"]').forEach(b => b.setAttribute('aria-pressed', String(following)));
  if (following) { setPlaying(false); chan.postMessage({ req: true, from: WID }); }
  else clearTimeout(postTimer);
  renderAll();
});

/* ---------- rendering ---------- */
function renderAll() {
  prepareReal();
  const RM = isReal();
  $('date').textContent = RM ? vsnap.date : snap.date;
  const free = MODE === 'free';
  const badge = $('mode-badge');
  // the country part is its own span so a 390px phone can drop the mode part (simple.css) instead of pushing 教学 off screen
  const cn = COUNTRY !== 'USA' && sim.scenario !== 'town' ? CNAME[COUNTRY] || COUNTRY : '';
  if (RM) badge.innerHTML = badgeHtml(cn, rsnap.real.lastRealDate);    // 「真实数据 · 截至 2026Q3」 (390px: 「真实 · 至 26Q3」)
  else badge.innerHTML = (cn ? `<span class="bd-c">${cn}</span><span class="bd-m"> · ` : '<span class="bd-m">') + (sim.scenario === 'town' ? '小镇' : free ? '自由' : '历史') + (sim.takenOver ? ' · 接管' : '') + '</span>';
  badge.title = RM ? `${cn ? cn + ' · ' : ''}真实数据 · 截至 ${rsnap.real.lastRealDate}` : badge.textContent;
  badge.classList.toggle('user', !!sim.takenOver && !RM);
  badge.classList.toggle('real', RM);
  const last = lastT();
  $('progress-bar').style.width = Math.min(100, (100 * (RM ? rt : sim.t)) / last) + '%';
  $('btn-step').disabled = RM ? rt >= last : sim.done || following;
  $('btn-play').disabled = following || RM;
  $('btn-play').title = RM ? REAL_TIP : '';
  if (RM) $('btn-step').title = rt >= last ? `真实数据到 ${rsnap.real.lastRealDate} 为止` : '前进一季';
  else $('btn-step').removeAttribute('title');
  updateTimeControls();
  if (following) badge.textContent += ' · 跟随';
  syncLayers();                                      // before the diagram draws: the border band follows L-border
  if (RM) renderFlow($('diagram'), vsnap, prevV);
  else {
    // 模型 mode inside 保留样本 (2022+): small 「真实 x」 next to unemployment / CPI / house prices (the model–real gap)
    const h = rmMod && rmAvail() ? realHint(rmMod, COUNTRY, sim.t) : null;
    renderFlow($('diagram'), h ? { ...snap, realHint: h } : snap, prevSnap);
  }
  if (!wvEl) buildViewDom();                         // after the first renderFlow: it empties #diagram once when it builds the SVG
  if (!ltBtn) { buildLayersToggle(); syncLayers(); }
  renderView();
  renderRealTag(RM);
  syncTakeoverTab(RM);
  try { renderObjective($('objective'), { sim, snap, openTerm, setTab, realSnap: RM ? rsnap : null }); } catch (e) { console.error(e); }
  if (RM) $('headline').hidden = true;               // 本季看点 talks about the model's quarter: not in 真实 mode
  else try { renderHeadline($('headline'), { sim, snap, openTerm, setTab }); } catch (e) { console.error(e); }
  renderPanel();                                     // the 4 tabs (full layout) or the simple panel
  if (lessonsMod && lessonsMod.onRender) lessonsMod.onRender();   // LESSONS: re-apply highlights / step triggers
  schedulePost();
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
  if (id === 'takeover' && isReal()) {
    box.innerHTML = `<div class="card muted ls-locked rm-locked"><b>${REAL_TIP}</b><p>真实数据已经发生，不能改。想自己拧阀门试试：切回「模型」再接管。</p>` +
      '<button type="button" class="btn primary" data-act="rm-model">切回模型</button></div>';
    box.querySelector('[data-act="rm-model"]').onclick = () => setRealMode('model');
    return;
  }
  if (!mod || typeof mod.render !== 'function') {
    box.innerHTML = '<div class="card muted">（面板开发中）</div>';
    return;
  }
  const ctx = { sim, snap, userSnap: sim.takenOver ? sim.snapshot('user') : null, real, openTerm, ...realCtx() };
  try {
    mod.render(box, ctx);
  } catch (e) {
    console.error(e);
    box.innerHTML = `<div class="card muted">面板出错：${String(e.message || e)}</div>`;
  }
  box.scrollTop = keep;
}

boot();
