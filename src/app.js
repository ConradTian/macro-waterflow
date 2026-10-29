// App shell: time bar, play loop, fixed water diagram (or the curves view over it), 4 tabs, pause toast, multi-window quarter sync.
// ENGINE SWAP: the orchestrator replaces the next import with './engine/sim.js'.
import { createSim } from './engine/sim.js';
import { renderFlow, setFlowDuration, setFlowContext } from './ui/flow.js';
import { renderHeadline } from './ui/headline.js';   // 本季看点 strip under the time bar
import { initScrubber } from './ui/scrubber.js';     // collapsible time scrubber under the progress line
import { setActiveCountry, registerCountryData } from './ui/country-info.js';   // unit / name / data-source labels of the country view

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
  playing = on && !sim.done && !following;
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
    setQuiet: q => { lessonQuiet = q; if (q) hideToast(); updateTimeControls(); },   // suppress key-node pause toasts during a lesson (and lock the scrubber)
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
  $('btn-play').onclick = () => { hideToast(); setPlaying(!playing); };
  $('btn-step').onclick = () => { hideToast(); setPlaying(false); advance(); };
  const back = $('btn-back');                         // ⏮ 退一季 = a seek to t-1
  if (back) back.onclick = () => { if (timeLock() || sim.t <= 0) return; hideToast(); setPlaying(false); seekTo(sim.t - 1); };
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
  renderTabbar();
}
function renderTabbar() {
  for (const b of $('tabbar').children) b.setAttribute('aria-selected', String(b.dataset.tab === activeTab));
}

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
const lastT = () => (MODE === 'free' ? 223 : real?.dates ? real.dates.length - 1 : 123);
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
      onSeek: t => seekTo(t),
    });
  } catch (e) { console.error(e); scrub = null; }
}
function updateTimeControls() {
  const back = $('btn-back');
  if (back && sim) {
    const lock = timeLock();
    back.disabled = !!lock || sim.t <= 0;
    back.title = lock || (sim.t <= 0 ? '已经在第一季' : '退一季');
  }
  if (scrub) scrub.update();
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
  $('date').textContent = snap.date;
  const free = MODE === 'free';
  const badge = $('mode-badge');
  badge.textContent = (COUNTRY !== 'USA' && sim.scenario !== 'town' ? (CNAME[COUNTRY] || COUNTRY) + ' · ' : '') + (sim.scenario === 'town' ? '小镇' : free ? '自由' : '历史') + (sim.takenOver ? ' · 接管' : '');
  badge.classList.toggle('user', !!sim.takenOver);
  const last = lastT();
  $('progress-bar').style.width = Math.min(100, (100 * sim.t) / last) + '%';
  $('btn-step').disabled = sim.done || following;
  $('btn-play').disabled = following;
  updateTimeControls();
  if (following) badge.textContent += ' · 跟随';
  renderFlow($('diagram'), snap, prevSnap);
  if (!wvEl) buildViewDom();                         // after the first renderFlow: it empties #diagram once when it builds the SVG
  renderView();
  try { renderHeadline($('headline'), { sim, snap, openTerm, setTab }); } catch (e) { console.error(e); }
  renderTab();
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
