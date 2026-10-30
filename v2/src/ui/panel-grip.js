// PANEL GRIP (phones only, < 768px): a grabber bar on top of the bottom panel (.panel: the 4 tabs or the simple dials).
//   Drag it up: the panel grows (snap points: default · about half · about 75% of the space under the top bars) and the water diagram
//   above it scales down (it is SVG; it is never cut off). Drag down: back. A tap toggles default <-> 75%. Keyboard: ↑ / ↓ (Home / End).
//   State: body[data-panel] = 'half' | 'max' (CSS in app.css "PANEL GRIP"); no attribute = default (the layout as it always was).
//   While dragging: body[data-panel="drag"] + an inline px height on .panel. Remembered in localStorage 'mw.panelH' (try/catch: the page
//   works when storage is blocked). Hidden during a lesson (body.lesson-on: the lesson card has its own sizing, lessons.css); iPad / desktop:
//   the grip is display:none and body[data-panel] changes nothing.
//   initPanelGrip({ panel, main }) -> { raiseForTab() }   raiseForTab: a tab tap at default height raises the panel to 75%
//   (only while the viewer has not set a height themselves).
const KEY = 'mw.panelH';
const LEVELS = ['default', 'half', 'max'];
const MAXF = 0.75, HALFF = 0.5;
const PHONE = typeof matchMedia === 'function' ? matchMedia('(max-width: 767.98px)') : null;
const isPhone = () => !!(PHONE && PHONE.matches);
const lessonOn = () => document.body.classList.contains('lesson-on');

function readStored() { try { const v = localStorage.getItem(KEY); return LEVELS.includes(v) ? v : null; } catch (e) { return null; } }
function store(v) { try { localStorage.setItem(KEY, v); } catch (e) { /* private window / blocked storage */ } }

export function initPanelGrip({ panel, main }) {
  if (!panel || !main) return { raiseForTab() {} };
  const stored = readStored();
  let level = stored || 'default';
  let userSet = !!stored;                                      // the viewer chose a height (now or on an earlier visit)

  const grip = document.createElement('div');
  grip.className = 'panel-grip'; grip.id = 'panel-grip';
  grip.setAttribute('role', 'separator'); grip.setAttribute('aria-orientation', 'horizontal'); grip.tabIndex = 0;
  grip.setAttribute('aria-label', '拖动调整下方面板的高度（上下键也可以）');
  grip.setAttribute('aria-controls', 'tab-content simple');
  grip.title = '上下拖动：调整面板高度。点一下：展开 / 收起';
  grip.innerHTML = '<i aria-hidden="true"></i>';
  panel.insertBefore(grip, panel.firstChild);

  // the default panel height = .main minus the diagram's own phone height (app.css: min(100vw * 1.38, 56dvh)); a probe reads that exactly
  const probe = document.createElement('div');
  probe.className = 'panel-grip-probe'; probe.setAttribute('aria-hidden', 'true');
  main.appendChild(probe);
  const mainH = () => main.getBoundingClientRect().height;
  function snaps() {
    const H = mainH(), d = Math.max(0, H - probe.getBoundingClientRect().height);
    const s = [{ k: 'default', h: d }];
    const half = Math.max(d, H * HALFF), max = Math.max(half, H * MAXF);
    if (half > d + 8) s.push({ k: 'half', h: half });
    if (max > s[s.length - 1].h + 8) s.push({ k: 'max', h: max });
    return s;
  }
  const hOf = k => { const s = snaps(); return (s.find(x => x.k === k) || s[s.length - 1]).h; };
  function aria(hpx) {
    const H = mainH() || 1, s = snaps();
    const h = hpx != null ? hpx : hOf(level);
    grip.setAttribute('aria-valuemin', String(Math.round(100 * s[0].h / H)));
    grip.setAttribute('aria-valuemax', String(Math.round(100 * s[s.length - 1].h / H)));
    grip.setAttribute('aria-valuenow', String(Math.round(100 * h / H)));
    grip.setAttribute('aria-valuetext', level === 'max' ? '面板展开（约四分之三）' : level === 'half' ? '面板一半' : '面板默认高度');
  }
  function apply(k, o = {}) {
    level = LEVELS.includes(k) ? k : 'default';
    panel.style.removeProperty('height');
    if (level === 'default') delete document.body.dataset.panel; else document.body.dataset.panel = level;
    if (o.user) { userSet = true; store(level); }
    aria();
  }
  apply(level);

  /* ---- drag: pointer events (mouse, pen, touch); a touch-events fallback for browsers without them ---- */
  let drag = null;
  let dragged = false;                                         // the last press was a real drag: the click that may follow it is not a tap
  function start(y) {
    if (!isPhone() || lessonOn()) return false;
    dragged = false;
    drag = { y0: y, h0: panel.getBoundingClientRect().height, moved: false, s: snaps() };
    return true;
  }
  function move(y) {
    if (!drag) return;
    const dy = drag.y0 - y;
    if (!drag.moved && Math.abs(dy) < 6) return;
    if (!drag.moved) { drag.moved = true; document.body.dataset.panel = 'drag'; grip.classList.add('on'); }
    const lo = drag.s[0].h, hi = drag.s[drag.s.length - 1].h;
    const h = Math.max(lo, Math.min(hi, drag.h0 + dy));
    panel.style.height = h + 'px';
    drag.h = h;
    aria(h);
  }
  const toggle = () => apply(level === 'default' ? 'max' : 'default', { user: true });             // a tap: default <-> 75%
  function end(tap) {
    if (!drag) return;
    const d = drag; drag = null;
    grip.classList.remove('on');
    if (!d.moved) { if (tap) toggle(); return; }               // pointer / mouse: the click event does the tap (keyboard-less clicks too)
    dragged = true;
    const h = d.h != null ? d.h : d.h0;
    let best = d.s[0];
    for (const x of d.s) if (Math.abs(x.h - h) < Math.abs(best.h - h)) best = x;
    apply(best.k, { user: true });
  }
  function cancel() { if (!drag) return; drag = null; grip.classList.remove('on'); apply(level); }

  if (typeof window.PointerEvent === 'function') {
    grip.addEventListener('pointerdown', e => {
      if (e.button != null && e.button > 0) return;
      if (!start(e.clientY)) return;
      e.preventDefault();
      try { grip.setPointerCapture(e.pointerId); } catch (err) { /* ignore */ }
    });
    grip.addEventListener('pointermove', e => { if (drag) { e.preventDefault(); move(e.clientY); } });
    grip.addEventListener('pointerup', () => end(false));
    grip.addEventListener('pointercancel', () => cancel());
    grip.addEventListener('lostpointercapture', () => { if (drag) end(false); });
  } else {
    grip.addEventListener('touchstart', e => { if (e.touches.length === 1 && start(e.touches[0].clientY)) e.preventDefault(); }, { passive: false });
    grip.addEventListener('touchmove', e => { if (drag && e.touches.length) { e.preventDefault(); move(e.touches[0].clientY); } }, { passive: false });
    grip.addEventListener('touchend', () => end(true));          // touchstart's preventDefault stops the click: the tap is handled here
    grip.addEventListener('touchcancel', () => cancel());
    grip.addEventListener('mousedown', e => {
      if (e.button > 0 || !start(e.clientY)) return;
      e.preventDefault();
      const mm = ev => move(ev.clientY), mu = () => { window.removeEventListener('mousemove', mm); window.removeEventListener('mouseup', mu); end(false); };
      window.addEventListener('mousemove', mm); window.addEventListener('mouseup', mu);
    });
  }
  grip.addEventListener('click', () => {
    if (dragged) { dragged = false; return; }
    if (!isPhone() || lessonOn()) return;
    toggle();
  });

  /* ---- keyboard: ↑ / ↓ one snap point, Home / End, Enter / Space = the tap toggle ---- */
  grip.addEventListener('keydown', e => {
    if (!isPhone() || lessonOn()) return;
    const ks = snaps().map(x => x.k), i = Math.max(0, ks.indexOf(level));
    let k = null;
    if (e.key === 'ArrowUp') k = ks[Math.min(ks.length - 1, i + 1)];
    else if (e.key === 'ArrowDown') k = ks[Math.max(0, i - 1)];
    else if (e.key === 'Home') k = ks[0];
    else if (e.key === 'End') k = ks[ks.length - 1];
    else if (e.key === 'Enter' || e.key === ' ') k = level === 'default' ? 'max' : 'default';
    if (!k) return;
    e.preventDefault();
    apply(k, { user: true });
  });

  // the snap heights are percentages in CSS, so a rotation / resize needs nothing but fresh aria numbers
  let rz = 0;
  window.addEventListener('resize', () => { clearTimeout(rz); rz = setTimeout(() => aria(), 150); });

  return {
    raiseForTab() {
      if (!isPhone() || lessonOn() || userSet || level !== 'default') return;
      apply('max');                                             // not stored: the viewer did not choose it
    },
  };
}
