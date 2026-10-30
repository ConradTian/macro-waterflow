// Collapsible time scrubber (under the top bar). app.js owns the clock and the seeking; this file owns the DOM, the marks and the confirm bar.
//
//   initScrubber({ progress, sim(), real(), mode, country(), last(), lock(), createSim, onDragStart(), onSeek(t) }) -> { update(), confirm(msg), rulesModified() }
//
//  - collapsed: the thin progress line + a 「⌄ 拖动」 handle at its right end (open/closed is remembered in localStorage, try/catch)
//  - expanded : a slider row. Dragging shows the quarter label live; releasing calls onSeek(t) once (one render at the end). Arrow keys = 1 quarter.
//  - marks on the track (all computed at runtime, never hard-coded dates):
//      grey bands   = WAVES.usQ.recessions (US history run only)
//      hatch        = real.reservedFrom (the 保留样本), history run only
//      triangles    = quarters where the long cycle changes stage / first takes the B2 fork, from a scratch sim run of the whole range
//      free mode    = triangles + a 「之后是模型自由运行」 note after the last real quarter
//  - hidden in the town scenario; disabled (with a tooltip) while o.lock() returns a reason (lesson / follower)
const LS_KEY = 'mw.scrubber.open';
const GLYPH = { 1: '①', 2: '②', 5: '⑤', 6: '⑥', 7: '⑦', 8: '⑧' };
const ql = t => `${1995 + Math.floor(t / 4)}Q${(t % 4) + 1}`;
const lsGet = () => { try { return localStorage.getItem(LS_KEY) === '1'; } catch (e) { return false; } };
const lsSet = v => { try { localStorage.setItem(LS_KEY, v ? '1' : '0'); } catch (e) { /* private window etc. */ } };
const esc = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

/* ---------- marks from the engine ---------- */
const stageCache = new Map();
export function computeStageMarks(createSim, real, mode, country) {
  const key = `${mode}|${country}|${real && real.dates ? real.dates.length : 0}`;
  if (stageCache.has(key)) return stageCache.get(key);
  const out = [];
  try {
    const s = createSim({ data: real, mode, country });
    let prev = null, forkSeen = false;
    const look = (snap, t) => {
      const L = snap && snap.cycles && snap.cycles.long;
      if (!L) return;
      if (prev != null && L.stage !== prev) out.push({ t, mark: GLYPH[L.stage] || String(L.stage), text: `大周期进入 ${L.label || L.stage}`, kind: 'stage' });
      prev = L.stage;
      if (!forkSeen && L.fork === 'B2') { forkSeen = true; out.push({ t, mark: 'B2', text: '地下水位跌破吸程线（B2）：债务在收缩，不是推高物价', kind: 'b2' }); }
    };
    look(s.snapshot(), 0);
    while (!s.done) { s.step(); look(s.snapshot(), s.t); }
  } catch (e) { console.error(e); }
  stageCache.set(key, out);
  return out;
}

const defCache = new Map();
const ruleSig = sim => JSON.stringify(sim.rules.map(r => [r.id, !!r.enabled, r.params]));
// true when the learner changed a rule (on/off or a parameter): sim.reset() would put the defaults back
export function rulesModified(createSim, sim, real, mode, country) {
  try {
    const key = `${mode}|${country}`;
    if (!defCache.has(key)) defCache.set(key, ruleSig(createSim({ data: real, mode, country })));
    return ruleSig(sim) !== defCache.get(key);
  } catch (e) { return false; }
}

async function recessionsFor(mode, country) {
  if (mode !== 'history' || country !== 'USA') return [];
  try { const m = await import('../data/waves.js'); return (m.WAVES.usQ && m.WAVES.usQ.recessions) || []; } catch (e) { return []; }
}

/* ---------- the widget ---------- */
export function initScrubber(o) {
  const prog = o.progress;
  if (!prog || !prog.parentNode) return null;
  const topbar = prog.closest('.topbar') || prog.parentNode;
  const row = document.createElement('div'); row.className = 'prow';
  prog.parentNode.insertBefore(row, prog); row.appendChild(prog);
  const handle = document.createElement('button');
  handle.type = 'button'; handle.id = 'scrub-handle'; handle.className = 'scrub-handle'; handle.setAttribute('aria-controls', 'scrub-panel');
  row.appendChild(handle);
  const panel = document.createElement('div');
  panel.id = 'scrub-panel'; panel.className = 'scrub-panel'; panel.hidden = true;
  panel.innerHTML = `<div class="scrub-row">
    <div class="scrub-q" id="scrub-q">1995Q1</div>
    <div class="scrub-track">
      <div class="scrub-lane"><div class="scrub-marks" id="scrub-marks"><i class="sm-fill"></i></div>
        <input type="range" class="scrub-range" id="scrub-range" min="0" max="123" step="1" value="0" aria-label="拖动时间，方向键一次一季"></div>
      <div class="scrub-tris" id="scrub-tris"></div>
    </div></div><div class="scrub-note" id="scrub-note"></div>`;
  row.after(panel);
  const bar = document.createElement('div');
  bar.className = 'scrub-confirm'; bar.hidden = true; bar.setAttribute('role', 'alertdialog');
  topbar.appendChild(bar);

  const q = panel.querySelector('#scrub-q'), range = panel.querySelector('#scrub-range'), marksEl = panel.querySelector('#scrub-marks');
  const fill = marksEl.querySelector('.sm-fill'), tris = panel.querySelector('#scrub-tris'), note = panel.querySelector('#scrub-note');
  let open = lsGet(), dragging = false, builtKey = '', buildSeq = 0, markList = [], pinnedTri = null, haveBands = false, haveHatch = false;

  const setFill = v => { const last = +range.max || 1; fill.style.width = (100 * v / last) + '%'; };
  // 真实 / 模型 mode (app.js): o.now() = the quarter on screen (the real quarter in 真实 mode, else sim.t); o.realMarks() = the long-cycle
  // marks on REAL data in 真实 mode (null in 模型 mode = the scratch model run below)
  const nowT = () => (typeof o.now === 'function' ? o.now() : o.sim().t);
  const realMarks = () => (typeof o.realMarks === 'function' ? o.realMarks() : null);

  function legend() {
    const lock = o.lock();
    if (lock) return esc(lock);
    const parts = [];
    if (haveBands) parts.push('<span class="lg-b"></span>美国衰退');
    if (markList.length) parts.push('<span class="lg-t">▲</span>大周期换阶段（点一下跳过去）');
    if (haveHatch) parts.push('<span class="lg-h"></span>保留样本');
    return parts.join('<span class="lg-sp"></span>');
  }
  function showNote(tri) { note.innerHTML = tri ? `<b>${esc(ql(tri.t))}</b> ${esc(tri.text)}` : legend(); }

  /* ---- marks ---- */
  function layoutTris() {
    const W = tris.clientWidth || 300, last = +range.max || 1;
    const ends = [];
    for (const b of tris.children) {
      const x = (+b.dataset.t / last) * W;
      let r = 0;
      while (ends[r] != null && x - 15 < ends[r]) r++;
      ends[r] = x + 15;
      b.style.setProperty('--row', r); b.style.left = (100 * +b.dataset.t / last) + '%';
    }
    tris.style.height = Math.max(1, ends.length) * 20 + 'px';
  }
  async function buildMarks() {
    const real = o.real(), last = o.last(), mode = o.mode, country = o.country(), rm = realMarks();
    const key = `${mode}|${country}|${last}|${real && real.dates ? real.dates.length : 0}|${rm ? 'real' : 'model'}`;
    if (key === builtKey) return;
    builtKey = key; const seq = ++buildSeq;
    marksEl.querySelectorAll('.sm-band,.sm-hatch,.sm-free').forEach(n => n.remove());
    tris.innerHTML = ''; markList = []; haveBands = false; haveHatch = false;
    const pct = t => (100 * t / last);
    const dates = (real && real.dates) || [];
    const realLast = dates.length ? dates.length - 1 : last;
    // reserved sample (hatched) -- history run only
    if (mode === 'history' && real && real.reservedFrom && dates.indexOf(real.reservedFrom) > 0) {
      const i = dates.indexOf(real.reservedFrom), h = document.createElement('i');
      h.className = 'sm-hatch'; h.style.left = pct(i) + '%'; h.style.right = '0'; h.title = `保留样本：${real.reservedFrom} 起`;
      marksEl.appendChild(h); haveHatch = true;
    }
    // free run: everything after the last real quarter is the model on its own
    if (mode === 'free' && realLast < last) {
      const f = document.createElement('i');
      f.className = 'sm-free'; f.style.left = pct(realLast) + '%'; f.style.right = '0'; f.textContent = '之后是模型自由运行';
      marksEl.appendChild(f);
    }
    // real recessions (US history run)
    const rec = await recessionsFor(mode, country);
    if (seq !== buildSeq) return;
    for (const [a, b] of rec) {
      const ia = dates.indexOf(a), ib = dates.indexOf(b);
      if (ia < 0 || ib < 0) continue;
      const e = document.createElement('i');
      e.className = 'sm-band'; e.style.left = pct(ia) + '%'; e.style.width = `max(4px, ${pct(ib - ia)}%)`; e.title = `美国衰退 ${a}–${b}`;
      marksEl.appendChild(e); haveBands = true;
    }
    showNote(pinnedTri);
    // stage triangles: a scratch run of the whole range (after the panel has painted)
    await new Promise(r => setTimeout(r, 30));
    if (seq !== buildSeq) return;
    markList = rm || computeStageMarks(o.createSim, real, mode, country);
    for (const m of markList) {
      const b = document.createElement('button');
      b.type = 'button'; b.className = 'scrub-tri' + (m.kind === 'b2' ? ' b2' : ''); b.dataset.t = m.t; b.dataset.kind = m.kind;
      b.innerHTML = `<i></i><b>${esc(m.mark)}</b>`;
      b.title = `${ql(m.t)} ${m.text}`; b.setAttribute('aria-label', `${ql(m.t)} ${m.text}，点一下跳到这里`);
      b.onmouseenter = b.onfocus = () => showNote(m);
      b.onmouseleave = b.onblur = () => showNote(pinnedTri);
      b.onclick = () => { pinnedTri = m; showNote(m); jump(m.t); };
      tris.appendChild(b);
    }
    layoutTris(); showNote(pinnedTri); update();
  }

  /* ---- actions ---- */
  async function jump(t) {
    if (o.lock()) return;
    o.onDragStart();
    await o.onSeek(t);
    update();
  }
  range.addEventListener('input', () => {
    if (!dragging) { dragging = true; q.classList.add('drag'); pinnedTri = null; o.onDragStart(); }
    q.textContent = ql(+range.value); setFill(+range.value);
  });
  range.addEventListener('change', async () => {
    dragging = false; q.classList.remove('drag');
    const t = +range.value, sim = o.sim();
    if (sim && t !== nowT()) await o.onSeek(t);
    update();
  });
  range.addEventListener('blur', () => { if (dragging) { dragging = false; q.classList.remove('drag'); update(); } });
  handle.onclick = () => { open = !open; lsSet(open); update(); };
  window.addEventListener('resize', () => { if (open) layoutTris(); });

  // small in-app confirm (not window.confirm): resolves true on 继续, false on 取消 / Esc
  let pending = null;
  function confirm(msg) {
    if (pending) pending(false);
    return new Promise(res => {
      bar.innerHTML = `<span class="sc-msg">${esc(msg)}</span><button type="button" class="btn" data-a="no">取消</button><button type="button" class="btn primary" data-a="yes">继续</button>`;
      bar.hidden = false;
      const done = v => { pending = null; bar.hidden = true; bar.onclick = null; document.removeEventListener('keydown', onKey, true); res(v); };
      const onKey = e => { if (e.key === 'Escape') { e.preventDefault(); done(false); } };
      pending = done;
      bar.onclick = e => { const a = e.target.closest('[data-a]'); if (a) done(a.dataset.a === 'yes'); };
      document.addEventListener('keydown', onKey, true);
      bar.querySelector('[data-a="yes"]').focus();
    });
  }

  function update() {
    const sim = o.sim();
    if (!sim) return;
    const avail = sim.scenario !== 'town';
    row.classList.toggle('has-scrub', avail);
    handle.hidden = !avail;
    if (!avail) { panel.hidden = true; if (pending) pending(false); return; }
    const last = o.last(), lock = o.lock();
    range.max = last;
    const now = nowT();
    if (!dragging) { range.value = now; q.textContent = ql(now); setFill(now); }
    range.disabled = !!lock; range.title = lock || ''; panel.title = lock || '';
    handle.title = lock || '';
    panel.classList.toggle('locked', !!lock);
    handle.textContent = open ? '⌃ 收起' : '⌄ 拖动';
    handle.setAttribute('aria-expanded', String(open));
    handle.setAttribute('aria-label', open ? '收起时间滑块' : '展开时间滑块，可以拖到任何一季');
    panel.hidden = !open;
    if (open) {
      buildMarks();
      if (pinnedTri && pinnedTri.t !== now) pinnedTri = null;
      if (!dragging) showNote(pinnedTri);
    }
  }

  update();
  return { update, confirm, rulesModified: () => rulesModified(o.createSim, o.sim(), o.real(), o.mode, o.country()), isOpen: () => open };
}
