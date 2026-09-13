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
  var HIT = 11;               // guide grab-strip thickness in px
  var HIDE_ZONE = 64;         // in 'auto' mode: hide a ruler once the cursor is this far from its edge
  var NS = 'rulersnx:';       // localStorage namespace
  var DEFAULT_COLOR = '#ff00ff';

  var host = null, sroot = null;
  var elTop, elLeft, elCorner, elLayer, elToolbar, cvTop, cvLeft, colorInput, rulerBtn, rectBtn, circleBtn, markBtn;
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

  // ---------- small helpers ----------
  function css(el, styles) { for (var k in styles) el.style[k] = styles[k]; return el; }
  function make(tag, styles) { return css(document.createElement(tag || 'div'), styles || {}); }

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
      ':host{all:initial}' +
      '.wg-layer{position:fixed;inset:0;pointer-events:none;z-index:1}' +
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

    elTop.addEventListener('pointerdown', function (e) { startCreate(e, 'h'); });
    elLeft.addEventListener('pointerdown', function (e) { startCreate(e, 'v'); });
    window.addEventListener('resize', onResize, true);
    window.addEventListener('pointerdown', onDocPointerDown, true);
    window.addEventListener('pointerdown', onDrawPointerDown, true);
    window.addEventListener('pointermove', onAutoHide, true);
    window.addEventListener('keydown', onKeyDown, true);
    window.addEventListener('blur', function () { if (rulerMode === 'auto') setRulerVis(false, false); });
  }

  // In 'auto' mode: reveal a ruler only when the cursor nears its edge, so the
  // rulers never permanently cover the page content (esp. in narrow/mobile layouts).
  function onAutoHide(e) {
    if (!active || rulerMode !== 'auto' || dragActive) return;
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
    var bar = make(); bar.className = 'wg-toolbar';
    var title = make(); title.className = 'wg-title'; title.textContent = 'RulerSNX'; bar.appendChild(title);
    bar.appendChild(btn('+ Vertikal', 'Vertikale Hilfslinie in der Mitte', function () { addVertical(); }));
    bar.appendChild(btn('+ Horizontal', 'Horizontale Hilfslinie in der Mitte', function () { addHorizontal(); }));
    bar.appendChild(btn('+ Kreuz', 'Fadenkreuz in der Mitte', function () { addCross(); }));
    bar.appendChild(sep());
    colorInput = document.createElement('input');
    colorInput.type = 'color'; colorInput.className = 'wg-color'; colorInput.value = color; colorInput.title = 'Farbe der Hilfslinien';
    colorInput.addEventListener('input', function (e) { setColor(e.target.value); });
    bar.appendChild(colorInput);
    bar.appendChild(sep());
    rectBtn = btn('▭', 'Rechteck aufziehen (Standard) — Shift+Ziehen auf der Seite', function () { setShapeType('rect'); });
    circleBtn = btn('◯', 'Kreis/Ellipse aufziehen — Shift+Ziehen auf der Seite', function () { setShapeType('circle'); });
    markBtn = btn('Markieren', 'Markier-Modus an/aus: normales Ziehen zieht eine Form auf (alternativ immer Shift+Ziehen)', toggleDraw);
    bar.appendChild(rectBtn); bar.appendChild(circleBtn); bar.appendChild(markBtn);
    bar.appendChild(sep());
    rulerBtn = btn('Lineale: Auto', 'Lineale: Auto (nur am Rand) → An (immer) → Aus', toggleRulers);
    bar.appendChild(rulerBtn);
    bar.appendChild(btn('Löschen', 'Alle Hilfslinien löschen', clearAll));
    bar.appendChild(sep());
    bar.appendChild(btn('✕', 'Ausblenden (Alt+G)', deactivate));
    return bar;
  }
  function btn(label, title, fn) {
    var b = make(); b.className = 'wg-btn'; b.textContent = label; b.title = title;
    b.addEventListener('click', fn); return b;
  }
  function sep() { var s = make(); s.className = 'wg-sep'; return s; }

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
  function updateRulerBtn() {
    if (rulerBtn) rulerBtn.textContent = 'Lineale: ' + (rulerMode === 'auto' ? 'Auto' : rulerMode === 'on' ? 'An' : 'Aus');
  }
  function setRulerVis(top, left) {
    topShown = top; leftShown = left;
    elTop.style.display = top ? '' : 'none';
    elLeft.style.display = left ? '' : 'none';
    elCorner.style.display = (top || left) ? '' : 'none';
  }
  function applyRulerVisibility() {
    // 'on' => both visible; 'off'/'auto' => start hidden ('auto' reveals on edge hover)
    setRulerVis(rulerMode === 'on', rulerMode === 'on');
  }

  // ---------- guides ----------
  function makeGuide(orient, pos, doSave) {
    var wrap = make(); wrap.className = 'wg-guide';
    var base = { position: 'fixed', pointerEvents: 'auto', zIndex: '1' };
    if (orient === 'v') css(wrap, Object.assign(base, { top: '0', bottom: '0', left: '0', width: HIT + 'px', cursor: 'ew-resize' }));
    else css(wrap, Object.assign(base, { left: '0', right: '0', top: '0', height: HIT + 'px', cursor: 'ns-resize' }));

    var line = make();
    if (orient === 'v') css(line, { position: 'absolute', top: '0', bottom: '0', left: (HIT / 2) + 'px', width: '1px', background: color });
    else css(line, { position: 'absolute', left: '0', right: '0', top: (HIT / 2) + 'px', height: '1px', background: color });
    wrap.appendChild(line);

    var label = make();
    css(label, {
      position: 'absolute', background: color, color: '#fff', font: '10px/1.4 "Segoe UI",Arial,sans-serif',
      padding: '1px 4px', borderRadius: '2px', whiteSpace: 'nowrap', pointerEvents: 'none', display: 'none'
    });
    if (orient === 'v') css(label, { top: (RULER + 2) + 'px', left: (HIT / 2 + 3) + 'px' });
    else css(label, { left: (RULER + 2) + 'px', top: (HIT / 2 + 3) + 'px' });
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
      ? 'translateX(' + (g.pos - HIT / 2) + 'px)'
      : 'translateY(' + (g.pos - HIT / 2) + 'px)';
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
    if (g.orient === 'v') {
      g.line.style.width = on ? '3px' : '1px';
      g.line.style.left = (on ? HIT / 2 - 1 : HIT / 2) + 'px';
    } else {
      g.line.style.height = on ? '3px' : '1px';
      g.line.style.top = (on ? HIT / 2 - 1 : HIT / 2) + 'px';
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
    function up() {
      document.removeEventListener('pointermove', move, true);
      document.removeEventListener('pointerup', up, true);
      save(); selectItem(s);
    }
    document.addEventListener('pointermove', move, true);
    document.addEventListener('pointerup', up, true);
  }
  function setShapeType(t) { shapeType = t; updateShapeBtns(); save(); }
  function updateShapeBtns() {
    if (rectBtn) rectBtn.classList.toggle('wg-on', shapeType === 'rect');
    if (circleBtn) circleBtn.classList.toggle('wg-on', shapeType === 'circle');
  }
  function toggleDraw() { drawArmed = !drawArmed; if (markBtn) markBtn.classList.toggle('wg-on', drawArmed); }

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
    function up() {
      document.removeEventListener('pointermove', move, true);
      document.removeEventListener('pointerup', up, true);
      if (s) { save(); selectItem(s); }
    }
    document.addEventListener('pointermove', move, true);
    document.addEventListener('pointerup', up, true);
  }

  // ---------- dragging ----------
  function beginDrag(orient, g) {
    dragActive = true; // keep rulers visible while pulling/moving a guide
    showLabel(g, true);
    var startC = null, moved = false;
    function move(ev) {
      var c = orient === 'v' ? ev.clientX : ev.clientY;
      if (startC === null) startC = c;
      if (Math.abs(c - startC) > 3) moved = true;
      setGuidePos(g, c);
    }
    function up(ev) {
      document.removeEventListener('pointermove', move, true);
      document.removeEventListener('pointerup', up, true);
      dragActive = false;
      var onRuler = orient === 'v' ? ev.clientX < RULER : ev.clientY < RULER;
      if (onRuler) { removeGuide(g); }
      else { save(); selectItem(g); } // a click (or finished drag) selects the guide
      onAutoHide(ev); // collapse the ruler again if the cursor has left the edge
    }
    document.addEventListener('pointermove', move, true);
    document.addEventListener('pointerup', up, true);
  }
  function startCreate(e, orient) {
    e.preventDefault();
    var g = makeGuide(orient, orient === 'v' ? e.clientX : e.clientY, false);
    beginDrag(orient, g);
  }
  function startMove(e, g) {
    e.preventDefault();
    e.stopPropagation();
    beginDrag(g.orient, g);
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
    if (colorInput) colorInput.value = color;
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
