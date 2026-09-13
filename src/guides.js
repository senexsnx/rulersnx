/*
 * RulerSNX — Illustrator-style ruler & draggable guide lines for any website.
 * Self-contained: works both as a content script and included directly in a page.
 * Exposes window.WebGuides = { activate, deactivate, toggle, isActive, addVertical,
 *                              addHorizontal, addCross, clearAll, setColor }
 */
(function () {
  'use strict';
  if (window.WebGuides) return; // guard against double-injection

  var RULER = 22;              // ruler thickness in px
  var HIT = 11;               // guide grab-strip thickness in px (mouse)
  var HIT_COARSE = 44;        // guide grab-strip thickness in px (finger)
  var HIDE_ZONE = 64;         // in 'auto' mode: hide a ruler once the cursor is this far from its edge
  var NS = 'rulersnx:';       // localStorage namespace
  var DEFAULT_COLOR = '#ff00ff';

  var host = null, sroot = null;
  var elTop, elLeft, elCorner, elLayer, elToolbar, cvTop, cvLeft;
  var tb = null;              // handle returned by RulerSNXToolbar.build
  var active = false;
  var rulerMode = 'auto';     // 'auto' (reveal near edge) | 'on' (always) | 'off'
  var topShown = false, leftShown = false;
  var dragActive = false;
  var color = DEFAULT_COLOR;
  var guides = [];            // { kind:'guide', orient:'v'|'h', pos, wrap, line, label, selected }
  var shapes = [];            // { kind:'shape', type:'rect'|'circle', x, y, w, h, el, selected }
  var shapeType = 'rect';     // current marker shape
  var drawArmed = false;      // "Markieren" mode: plain drag draws a marker
  var selected = null;        // currently selected guide OR shape
  var coarse = false;         // true while the last pointer seen was a finger
  var revealed = false;       // coarse mode: rulers pulled in via the corner grip

  // ---------- small helpers ----------
  function css(el, styles) { for (var k in styles) el.style[k] = styles[k]; return el; }
  function make(tag, styles) { return css(document.createElement(tag || 'div'), styles || {}); }

  // ---------- pointer environment ----------
  // The flag always follows the most recently seen pointer type. In the
  // devtools' responsive mode only one type exists at a time, so flipping the
  // touch switch takes effect without a reload. A pen is NOT coarse — it has
  // hover and precision.
  function notePointer(e) {
    if (!e || typeof e.pointerType !== 'string') return;
    var next = e.pointerType === 'touch';
    if (next === coarse) return;
    coarse = next;
    applyCoarse();
  }
  function detectCoarse() {
    try {
      if (typeof window.matchMedia === 'function' &&
          window.matchMedia('(pointer: coarse)').matches) return true;
    } catch (e) {}
    return (window.navigator && window.navigator.maxTouchPoints || 0) > 0;
  }
  // Current grab width. The visible line stays 1px either way — only the
  // invisible strip you can grab gets wider.
  function hit() { return coarse ? HIT_COARSE : HIT; }
  // CSS carries every visual consequence of the flag; JS only flips it.
  function applyCoarse() {
    if (!host) return;
    if (coarse) host.classList.add('wg-coarse');
    else host.classList.remove('wg-coarse');
    applyRulerVisibility();
    guides.forEach(renderGuide); // the grab width changed, so the offset did too
    drawRulers();
  }

  // ---------- persistence (per hostname) ----------
  function storeKey() { return NS + location.hostname; }
  function save() {
    try {
      localStorage.setItem(storeKey(), JSON.stringify({
        color: color,
        rulerMode: rulerMode,
        shapeType: shapeType,
        guides: guides.map(function (g) { return { o: g.orient, p: Math.round(g.pos) }; }),
        shapes: shapes.map(function (s) {
          return { t: s.type, x: Math.round(s.x), y: Math.round(s.y), w: Math.round(s.w), h: Math.round(s.h) };
        })
      }));
    } catch (e) {}
  }
  function restore() {
    try {
      var raw = localStorage.getItem(storeKey());
      if (!raw) return;
      var d = JSON.parse(raw);
      if (d.color) color = d.color;
      if (d.rulerMode) rulerMode = d.rulerMode;
      else if (typeof d.showRulers === 'boolean') rulerMode = d.showRulers ? 'on' : 'off'; // migrate old setting
      if (d.shapeType) shapeType = d.shapeType;
      (d.guides || []).forEach(function (g) { makeGuide(g.o, g.p, false); });
      (d.shapes || []).forEach(function (s) { makeShape(s.t, s.x, s.y, s.w, s.h, false); });
    } catch (e) {}
  }

  // ---------- base stylesheet (for shadow DOM) ----------
  function baseCSS() {
    return '' +
      // --wg-hit drives every grab surface; only this one value changes on touch.
      ':host{all:initial;--wg-hit:' + HIT + 'px}' +
      ':host(.wg-coarse){--wg-hit:' + HIT_COARSE + 'px}' +
      ':host(.wg-coarse) .wg-corner{width:' + HIT_COARSE + 'px;height:' + HIT_COARSE + 'px}' +
      '.wg-guide{position:fixed;pointer-events:auto;z-index:1}' +
      '.wg-guide-v{top:0;bottom:0;left:0;width:var(--wg-hit);cursor:ew-resize}' +
      '.wg-guide-h{left:0;right:0;top:0;height:var(--wg-hit);cursor:ns-resize}' +
      '.wg-guide>.wg-line{position:absolute}' +
      '.wg-guide-v>.wg-line{top:0;bottom:0;left:calc(var(--wg-hit) / 2)}' +
      '.wg-guide-h>.wg-line{left:0;right:0;top:calc(var(--wg-hit) / 2)}' +
      '.wg-label{position:absolute;color:#fff;font:10px/1.4 "Segoe UI",Arial,sans-serif;' +
        'padding:1px 4px;border-radius:2px;white-space:nowrap;pointer-events:none}' +
      '.wg-guide-v>.wg-label{top:' + (RULER + 2) + 'px;left:calc(var(--wg-hit) / 2 + 3px)}' +
      '.wg-guide-h>.wg-label{left:' + (RULER + 2) + 'px;top:calc(var(--wg-hit) / 2 + 3px)}' +
      '.wg-layer{position:fixed;inset:0;pointer-events:none;z-index:1}' +
      // Keep the browser from claiming a drag as a pan gesture on touch.
      '.wg-ruler,.wg-guide,.wg-shape,.wg-toolbar,.wg-corner{touch-action:none}' +
      '.wg-ruler{position:fixed;background:rgba(24,24,30,.9);pointer-events:auto;z-index:3;box-sizing:border-box}' +
      '.wg-ruler-top{top:0;left:0;right:0;height:' + RULER + 'px;cursor:ns-resize;border-bottom:1px solid rgba(255,255,255,.12)}' +
      '.wg-ruler-left{top:0;left:0;bottom:0;width:' + RULER + 'px;cursor:ew-resize;border-right:1px solid rgba(255,255,255,.12)}' +
      '.wg-ruler canvas{display:block}' +
      '.wg-corner{position:fixed;top:0;left:0;width:' + RULER + 'px;height:' + RULER + 'px;background:#26262f;pointer-events:auto;' +
        'z-index:4;display:flex;align-items:center;justify-content:center;font:9px "Segoe UI",system-ui,Arial,sans-serif;color:#8a8a97}' +
      '.wg-toolbar{position:fixed;left:50%;bottom:14px;transform:translateX(-50%);display:flex;gap:4px;align-items:center;' +
        'flex-wrap:wrap;justify-content:center;max-width:96vw;' +
        'padding:5px 6px;border-radius:9px;background:rgba(24,24,30,.94);box-shadow:0 4px 18px rgba(0,0,0,.35);' +
        'pointer-events:auto;z-index:5;font:12px/1 "Segoe UI",system-ui,Arial,sans-serif;color:#eee}' +
      '.wg-btn{display:flex;align-items:center;gap:5px;padding:5px 8px;border-radius:6px;cursor:pointer;' +
        'background:rgba(255,255,255,.06);color:#eee;user-select:none;white-space:nowrap;border:1px solid transparent}' +
      '.wg-btn:hover{background:rgba(255,255,255,.15)}' +
      '.wg-btn.wg-on{background:#ff00ff;border-color:#ff00ff;color:#fff}' +
      '.wg-sep{width:1px;height:18px;background:rgba(255,255,255,.15);margin:0 2px}' +
      '.wg-color{width:22px;height:22px;padding:0;border:1px solid rgba(255,255,255,.25);border-radius:5px;background:none;cursor:pointer}' +
      '.wg-title{font-weight:600;opacity:.8;padding:0 6px 0 2px;letter-spacing:.02em}';
  }

  // ---------- build overlay ----------
  function build() {
    host = document.createElement('div');
    host.id = 'rulersnx-host';
    css(host, { position: 'fixed', inset: '0', zIndex: '2147483647', pointerEvents: 'none' });
    sroot = host.attachShadow({ mode: 'open' });

    var style = document.createElement('style');
    style.textContent = baseCSS();
    sroot.appendChild(style);

    elLayer = make(); elLayer.className = 'wg-layer';
    sroot.appendChild(elLayer);

    elTop = make(); elTop.className = 'wg-ruler wg-ruler-top';
    elLeft = make(); elLeft.className = 'wg-ruler wg-ruler-left';
    elCorner = make(); elCorner.className = 'wg-corner'; elCorner.textContent = 'px'; elCorner.title = 'Nullpunkt (0,0)';
    cvTop = document.createElement('canvas'); elTop.appendChild(cvTop);
    cvLeft = document.createElement('canvas'); elLeft.appendChild(cvLeft);
    sroot.appendChild(elTop); sroot.appendChild(elLeft); sroot.appendChild(elCorner);

    elToolbar = buildToolbar();
    sroot.appendChild(elToolbar);

    document.documentElement.appendChild(host);

    // Registered first so the flag is current when the handlers below run.
    window.addEventListener('pointerdown', notePointer, true);
    window.addEventListener('pointermove', notePointer, true);
    elTop.addEventListener('pointerdown', function (e) { startCreate(e, 'h'); });
    elLeft.addEventListener('pointerdown', function (e) { startCreate(e, 'v'); });
    elCorner.addEventListener('pointerdown', function (e) {
      if (!coarse) return; // with a mouse the corner keeps its 1.0.0 role
      e.preventDefault();
      e.stopPropagation();
      toggleRulerReveal();
    });
    window.addEventListener('resize', onResize, true);
    window.addEventListener('pointerdown', onDocPointerDown, true);
    window.addEventListener('pointerdown', onDrawPointerDown, true);
    window.addEventListener('pointermove', onAutoHide, true);
    window.addEventListener('keydown', onKeyDown, true);
    window.addEventListener('blur', function () { if (rulerMode === 'auto') setRulerVis(false, false); });

    coarse = detectCoarse();
    applyCoarse();
  }

  // In 'auto' mode: reveal a ruler only when the cursor nears its edge, so the
  // rulers never permanently cover the page content (esp. in narrow/mobile layouts).
  function onAutoHide(e) {
    if (!active || rulerMode !== 'auto' || dragActive) return;
    if (coarse) return; // no hover on touch — the corner grip decides instead
    var top = topShown, left = leftShown;
    if (e.clientY < RULER) top = true; else if (e.clientY > HIDE_ZONE) top = false;
    if (e.clientX < RULER) left = true; else if (e.clientX > HIDE_ZONE) left = false;
    if (top !== topShown || left !== leftShown) setRulerVis(top, left);
  }

  // Deselect when clicking anywhere that is not one of our items.
  function onDocPointerDown(e) {
    if (!active || !selected) return;
    var path = e.composedPath ? e.composedPath() : [];
    var onItem = path.some(function (el) {
      return el && el.classList && (el.classList.contains('wg-guide') || el.classList.contains('wg-shape'));
    });
    if (!onItem) deselect();
  }

  // Delete the selected item (guide or shape) with the Entf/Delete key; Esc deselects.
  function onKeyDown(e) {
    if (!active) return;
    if (e.key === 'Escape') { deselect(); return; }
    if (e.key === 'Delete' && selected) {
      var ae = document.activeElement, tag = ae && ae.tagName;
      if (ae && (tag === 'INPUT' || tag === 'TEXTAREA' || ae.isContentEditable)) return;
      e.preventDefault();
      removeItem(selected);
    }
  }

  function buildToolbar() {
    tb = window.RulerSNXToolbar.build({
      addVertical: function () { addVertical(); },
      addHorizontal: function () { addHorizontal(); },
      addCross: function () { addCross(); },
      clearAll: clearAll,
      deactivate: deactivate,
      toggleRulers: toggleRulers,
      setColor: setColor,
      setShapeType: setShapeType,
      toggleDraw: toggleDraw,
      getRulerMode: function () { return rulerMode; },
      getShapeType: function () { return shapeType; },
      getDrawArmed: function () { return drawArmed; },
      getColor: function () { return color; }
    });
    return tb.bar;
  }

  // ---------- rulers ----------
  function sizeCanvas(cv, w, h) {
    var dpr = window.devicePixelRatio || 1;
    cv.width = Math.max(1, Math.round(w * dpr));
    cv.height = Math.max(1, Math.round(h * dpr));
    cv.style.width = w + 'px'; cv.style.height = h + 'px';
    var ctx = cv.getContext('2d');
    if (!ctx) return null;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    return ctx;
  }
  function drawRulers() {
    if (!active || rulerMode === 'off') return;
    var w = window.innerWidth, h = window.innerHeight;
    var ct = sizeCanvas(cvTop, w, RULER), cl = sizeCanvas(cvLeft, RULER, h);
    if (!ct || !cl) return; // no 2d context available (non-browser / headless)
    drawScale(ct, 'h', w);
    drawScale(cl, 'v', h);
  }
  function drawScale(ctx, orient, len) {
    ctx.clearRect(0, 0, orient === 'h' ? len : RULER, orient === 'h' ? RULER : len);
    ctx.strokeStyle = 'rgba(200,200,210,.55)';
    ctx.fillStyle = 'rgba(220,220,230,.85)';
    ctx.font = '8px "Segoe UI",system-ui,Arial,sans-serif';
    ctx.textBaseline = 'top';
    ctx.lineWidth = 1;
    for (var p = 0; p <= len; p += 5) {
      var major = p % 100 === 0, med = p % 50 === 0;
      var t = major ? RULER : med ? RULER * 0.6 : RULER * 0.35;
      ctx.beginPath();
      if (orient === 'h') { var x = p + 0.5; ctx.moveTo(x, RULER); ctx.lineTo(x, RULER - t); }
      else { var y = p + 0.5; ctx.moveTo(RULER, y); ctx.lineTo(RULER - t, y); }
      ctx.stroke();
      if (major && p > 0) {
        if (orient === 'h') ctx.fillText(String(p), p + 2, 2);
        else ctx.fillText(String(p), 2, p + 2);
      }
    }
  }
  function toggleRulers() {
    rulerMode = rulerMode === 'auto' ? 'on' : rulerMode === 'on' ? 'off' : 'auto';
    updateRulerBtn();
    applyRulerVisibility();
    if (rulerMode !== 'off') drawRulers();
    save();
  }
  function updateRulerBtn() { if (tb) tb.updateRulerBtn(); }
  function setRulerVis(top, left) {
    topShown = top; leftShown = left;
    elTop.style.display = top ? '' : 'none';
    elLeft.style.display = left ? '' : 'none';
    // On touch the corner remains as the reveal grip — otherwise there would be
    // nothing left to tap. With a mouse it hides along with the rulers, exactly
    // as in 1.0.0.
    elCorner.style.display = (top || left || coarse) ? '' : 'none';
  }
  function applyRulerVisibility() {
    // 'on' => both visible; 'off' => both hidden; 'auto' => hover (mouse) or
    // the corner grip (touch) decides.
    if (rulerMode === 'on') { setRulerVis(true, true); return; }
    if (rulerMode === 'off') { setRulerVis(false, false); return; }
    var show = coarse && revealed;
    setRulerVis(show, show);
  }
  function toggleRulerReveal() {
    revealed = !revealed;
    applyRulerVisibility();
    if (revealed) drawRulers();
  }

  // ---------- guides ----------
  function makeGuide(orient, pos, doSave) {
    // Geometry lives in the stylesheet so it can follow --wg-hit; only the
    // colour-dependent bits stay inline.
    var wrap = make(); wrap.className = 'wg-guide wg-guide-' + orient;

    var line = make(); line.className = 'wg-line';
    if (orient === 'v') css(line, { width: '1px', background: color });
    else css(line, { height: '1px', background: color });
    wrap.appendChild(line);

    var label = make(); label.className = 'wg-label';
    css(label, { background: color, display: 'none' });
    wrap.appendChild(label);

    var g = { kind: 'guide', orient: orient, pos: pos, wrap: wrap, line: line, label: label, selected: false };
    wrap.addEventListener('pointerdown', function (e) { startMove(e, g); });
    wrap.addEventListener('dblclick', function () { removeGuide(g); });
    wrap.addEventListener('pointerenter', function () { showLabel(g, true); });
    wrap.addEventListener('pointerleave', function () { if (!g.selected) showLabel(g, false); });

    elLayer.appendChild(wrap);
    guides.push(g);
    renderGuide(g); // pos is already set on g; restore() must not be clamped
    if (doSave !== false) save();
    return g;
  }
  // Render only — never writes g.pos. A guide outside the current viewport is
  // hidden but keeps its position, so switching viewport widths is lossless.
  function renderGuide(g) {
    var max = g.orient === 'v' ? window.innerWidth : window.innerHeight;
    var visible = g.pos >= 0 && g.pos <= max;
    g.wrap.style.display = visible ? '' : 'none';
    if (!visible) return;
    g.wrap.style.transform = g.orient === 'v'
      ? 'translateX(' + (g.pos - hit() / 2) + 'px)'
      : 'translateY(' + (g.pos - hit() / 2) + 'px)';
    g.label.textContent = Math.round(g.pos) + ' px';
  }
  // User interaction only: clamp into the viewport, then render.
  function setGuidePos(g, pos) {
    var max = g.orient === 'v' ? window.innerWidth : window.innerHeight;
    g.pos = Math.max(0, Math.min(pos, max));
    renderGuide(g);
  }
  function showLabel(g, on) { g.label.style.display = on ? 'block' : 'none'; }

  // ---------- selection (works for guides and shapes) ----------
  function applyGuideSel(g, on) {
    // Empty string falls back to the stylesheet, which tracks --wg-hit.
    if (g.orient === 'v') {
      g.line.style.width = on ? '3px' : '1px';
      g.line.style.left = on ? 'calc(var(--wg-hit) / 2 - 1px)' : '';
    } else {
      g.line.style.height = on ? '3px' : '1px';
      g.line.style.top = on ? 'calc(var(--wg-hit) / 2 - 1px)' : '';
    }
    g.line.style.boxShadow = on ? '0 0 5px ' + color : 'none';
    showLabel(g, on);
  }
  function applyShapeSel(s, on) {
    s.el.style.boxShadow = on ? '0 0 0 2px #fff, 0 0 8px ' + color : 'none';
  }
  function applySel(it, on) { if (it.kind === 'guide') applyGuideSel(it, on); else applyShapeSel(it, on); }
  function selectItem(it) {
    if (selected === it) { applySel(it, true); return; }
    deselect();
    selected = it; it.selected = true;
    applySel(it, true);
  }
  function deselect() {
    if (!selected) return;
    var it = selected; selected = null; it.selected = false;
    applySel(it, false);
  }
  function removeItem(it) { if (it.kind === 'guide') removeGuide(it); else removeShape(it); }

  function removeGuide(g) {
    var i = guides.indexOf(g);
    if (i >= 0) guides.splice(i, 1);
    if (g === selected) selected = null;
    if (g.wrap.parentNode) g.wrap.parentNode.removeChild(g.wrap);
    save();
  }
  function clearAll() {
    guides.slice().forEach(removeGuide);
    shapes.slice().forEach(removeShape);
  }

  // ---------- shapes (region markers to highlight a spot) ----------
  function hexA(hex, a) {
    var m = /^#?([0-9a-f]{6})$/i.exec(hex || '');
    if (!m) return hex;
    var n = parseInt(m[1], 16);
    return 'rgba(' + ((n >> 16) & 255) + ',' + ((n >> 8) & 255) + ',' + (n & 255) + ',' + a + ')';
  }
  function makeShape(type, x, y, w, h, doSave) {
    var el = make(); el.className = 'wg-shape';
    css(el, {
      position: 'fixed', pointerEvents: 'auto', zIndex: '2', boxSizing: 'border-box',
      border: '2px solid ' + color, background: hexA(color, 0.10),
      borderRadius: type === 'circle' ? '50%' : '2px', cursor: 'move'
    });
    var s = { kind: 'shape', type: type, x: x, y: y, w: w, h: h, el: el, selected: false };
    el.addEventListener('pointerdown', function (e) { startMoveShape(e, s); });
    el.addEventListener('dblclick', function () { removeShape(s); });
    setShapeRect(s, x, y, w, h);
    elLayer.appendChild(el);
    shapes.push(s);
    if (doSave !== false) save();
    return s;
  }
  function setShapeRect(s, x, y, w, h) {
    s.x = x; s.y = y; s.w = w; s.h = h;
    s.el.style.left = x + 'px'; s.el.style.top = y + 'px';
    s.el.style.width = w + 'px'; s.el.style.height = h + 'px';
  }
  function removeShape(s) {
    var i = shapes.indexOf(s);
    if (i >= 0) shapes.splice(i, 1);
    if (s === selected) selected = null;
    if (s.el.parentNode) s.el.parentNode.removeChild(s.el);
    save();
  }
  function startMoveShape(e, s) {
    e.preventDefault(); e.stopPropagation();
    var ox = e.clientX - s.x, oy = e.clientY - s.y;
    function move(ev) { setShapeRect(s, ev.clientX - ox, ev.clientY - oy, s.w, s.h); }
    function done() { save(); selectItem(s); }
    dragLoop(move, done, s.el, e.pointerId);
  }
  function setShapeType(t) { shapeType = t; updateShapeBtns(); save(); }
  function updateShapeBtns() { if (tb) tb.updateShapeBtns(); }
  function toggleDraw() { drawArmed = !drawArmed; updateShapeBtns(); }

  function inOurUI(path) {
    return path.some(function (el) {
      return el && el.classList && (el.classList.contains('wg-toolbar') || el.classList.contains('wg-guide') ||
        el.classList.contains('wg-shape') || el.classList.contains('wg-ruler') || el.classList.contains('wg-corner'));
    });
  }
  // Shift+drag (or armed "Markieren" mode) draws a region marker on the page.
  // Creation is deferred until a real drag so a plain Shift+click never interferes
  // with the page (e.g. Shift+click opening a link in a new window).
  function onDrawPointerDown(e) {
    if (!active || e.button) return;
    if (!(e.shiftKey || drawArmed)) return;
    var path = e.composedPath ? e.composedPath() : [];
    if (inOurUI(path)) return; // rulers/guides/shapes/toolbar handle their own presses
    var sx = e.clientX, sy = e.clientY, s = null;
    function move(ev) {
      if (!s) {
        if (Math.abs(ev.clientX - sx) < 3 && Math.abs(ev.clientY - sy) < 3) return; // wait for a real drag
        s = makeShape(shapeType, sx, sy, 0, 0, false);
      }
      ev.preventDefault();
      var sel = window.getSelection && window.getSelection();
      if (sel && sel.removeAllRanges) sel.removeAllRanges(); // don't leave a text selection behind
      setShapeRect(s, Math.min(sx, ev.clientX), Math.min(sy, ev.clientY),
        Math.abs(ev.clientX - sx), Math.abs(ev.clientY - sy));
    }
    function done() { if (s) { save(); selectItem(s); } }
    dragLoop(move, done, e.currentTarget, e.pointerId);
  }

  // ---------- dragging ----------
  // One drag loop for guides, shapes and marker drawing. Survives pointercancel,
  // which the browser fires when it takes a touch gesture over for panning.
  // done(ev, cancelled) runs exactly once.
  function dragLoop(move, done, el, pointerId) {
    function finish(ev, cancelled) {
      document.removeEventListener('pointermove', move, true);
      document.removeEventListener('pointerup', up, true);
      document.removeEventListener('pointercancel', cancel, true);
      if (el && pointerId != null && typeof el.releasePointerCapture === 'function') {
        try { el.releasePointerCapture(pointerId); } catch (e) {}
      }
      done(ev, cancelled);
    }
    function up(ev) { finish(ev, false); }
    function cancel(ev) { finish(ev, true); }
    document.addEventListener('pointermove', move, true);
    document.addEventListener('pointerup', up, true);
    document.addEventListener('pointercancel', cancel, true);
    if (el && pointerId != null && typeof el.setPointerCapture === 'function') {
      try { el.setPointerCapture(pointerId); } catch (e) {}
    }
  }
  function beginDrag(orient, g, el, pointerId) {
    dragActive = true; // keep rulers visible while pulling/moving a guide
    showLabel(g, true);
    var startC = null, moved = false;
    function move(ev) {
      var c = orient === 'v' ? ev.clientX : ev.clientY;
      if (startC === null) startC = c;
      if (Math.abs(c - startC) > 3) moved = true;
      setGuidePos(g, c);
    }
    function done(ev, cancelled) {
      dragActive = false;
      // A cancelled drag must never delete: the last valid position stands.
      var onRuler = !cancelled &&
        (orient === 'v' ? ev.clientX < RULER : ev.clientY < RULER);
      if (onRuler) { removeGuide(g); return; }
      save();
      selectItem(g); // a click (or finished drag) selects the guide
      if (!cancelled) onAutoHide(ev); // collapse the ruler if the cursor left the edge
    }
    dragLoop(move, done, el, pointerId);
  }
  function startCreate(e, orient) {
    e.preventDefault();
    var g = makeGuide(orient, orient === 'v' ? e.clientX : e.clientY, false);
    beginDrag(orient, g, e.currentTarget, e.pointerId);
  }
  function startMove(e, g) {
    e.preventDefault();
    e.stopPropagation();
    beginDrag(g.orient, g, g.wrap, e.pointerId);
  }

  // ---------- color ----------
  function applyColor() {
    guides.forEach(function (g) {
      g.line.style.background = color;
      g.label.style.background = color;
      if (g.selected) g.line.style.boxShadow = '0 0 5px ' + color;
    });
    shapes.forEach(function (s) {
      s.el.style.borderColor = color;
      s.el.style.background = hexA(color, 0.10);
      if (s.selected) s.el.style.boxShadow = '0 0 0 2px #fff, 0 0 8px ' + color;
    });
    if (tb) tb.setColorValue(color);
  }
  function setColor(c) { color = c; applyColor(); save(); }

  // ---------- lifecycle ----------
  function onResize() {
    if (!active) return;
    drawRulers();
    guides.forEach(renderGuide);
  }
  function activate() {
    if (!host) { build(); restore(); }
    active = true;
    host.style.display = '';
    applyColor();
    updateRulerBtn();
    updateShapeBtns();
    applyRulerVisibility();
    drawRulers();
  }
  function deactivate() {
    active = false;
    deselect();
    if (host) host.style.display = 'none';
  }
  function toggle() { if (active) deactivate(); else activate(); }

  // ---------- public API ----------
  function addVertical(x) { if (!active) activate(); makeGuide('v', typeof x === 'number' ? x : window.innerWidth / 2); }
  function addHorizontal(y) { if (!active) activate(); makeGuide('h', typeof y === 'number' ? y : window.innerHeight / 2); }
  function addCross() { addVertical(); addHorizontal(); }

  window.WebGuides = {
    activate: activate,
    deactivate: deactivate,
    toggle: toggle,
    isActive: function () { return active; },
    addVertical: addVertical,
    addHorizontal: addHorizontal,
    addCross: addCross,
    clearAll: clearAll,
    setColor: setColor
  };
})();
