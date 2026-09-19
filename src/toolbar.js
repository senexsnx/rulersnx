/*
 * RulerSNX toolbar — builds the floating control bar and owns its button state.
 * Loaded before guides.js; talks to the engine only through the ctx object it
 * is handed, never through globals.
 */
(function () {
  'use strict';
  // globalThis is the content-script sandbox, shared by every script this
  // add-on injects into the tab — the unambiguous place to hand the engine over.
  if (globalThis.RulerSNXToolbar) return; // guard against double-injection

  function css(el, styles) { for (var k in styles) el.style[k] = styles[k]; return el; }
  function make(tag, styles) { return css(document.createElement(tag || 'div'), styles || {}); }

  function btn(label, title, fn) {
    var b = make(); b.className = 'wg-btn'; b.textContent = label; b.title = title;
    b.addEventListener('click', fn); return b;
  }
  function sep() { var s = make(); s.className = 'wg-sep'; return s; }

  function build(ctx) {
    var bar = make(); bar.className = 'wg-toolbar';
    var title = make(); title.className = 'wg-title'; title.textContent = 'RulerSNX';
    bar.appendChild(title);
    bar.appendChild(btn('+ Vertikal', 'Vertikale Hilfslinie in der Mitte', function () { ctx.addVertical(); }));
    bar.appendChild(btn('+ Horizontal', 'Horizontale Hilfslinie in der Mitte', function () { ctx.addHorizontal(); }));
    bar.appendChild(btn('+ Kreuz', 'Fadenkreuz in der Mitte', function () { ctx.addCross(); }));
    bar.appendChild(sep());

    var colorInput = document.createElement('input');
    colorInput.type = 'color'; colorInput.className = 'wg-color';
    colorInput.value = ctx.getColor(); colorInput.title = 'Farbe der Hilfslinien';
    colorInput.addEventListener('input', function (e) { ctx.setColor(e.target.value); });
    bar.appendChild(colorInput);
    bar.appendChild(sep());

    var rectBtn = btn('▭', 'Rechteck aufziehen (Standard) — Shift+Ziehen auf der Seite', function () { ctx.setShapeType('rect'); });
    var circleBtn = btn('◯', 'Kreis/Ellipse aufziehen — Shift+Ziehen auf der Seite', function () { ctx.setShapeType('circle'); });
    var markBtn = btn('Markieren', 'Markier-Modus an/aus: normales Ziehen zieht eine Form auf (alternativ immer Shift+Ziehen)', function () { ctx.toggleDraw(); });
    bar.appendChild(rectBtn); bar.appendChild(circleBtn); bar.appendChild(markBtn);
    bar.appendChild(sep());

    var rulerBtn = btn('Lineale: Auto', 'Lineale: Auto (nur am Rand) → An (immer) → Aus', function () { ctx.toggleRulers(); });
    bar.appendChild(rulerBtn);
    bar.appendChild(btn('Löschen', 'Alle Hilfslinien löschen', function () { ctx.clearAll(); }));
    bar.appendChild(sep());
    bar.appendChild(btn('⌄', 'Leiste einklappen', function () { ctx.setBarOpen(false); }));
    bar.appendChild(btn('✕', 'Ausblenden (Alt+G)', function () { ctx.deactivate(); }));

    // Collapsed state: a single grip in the corner. On a narrow touch viewport
    // the expanded bar would eat roughly a quarter of the screen.
    var grip = make(); grip.className = 'wg-bar-grip';
    grip.textContent = '⁘';
    grip.title = 'RulerSNX einblenden';
    grip.addEventListener('click', function () { ctx.setBarOpen(true); });

    function setOpen(open) {
      bar.style.display = open ? '' : 'none';
      grip.style.display = open ? 'none' : '';
    }

    function updateRulerBtn() {
      var m = ctx.getRulerMode();
      rulerBtn.textContent = 'Lineale: ' + (m === 'auto' ? 'Auto' : m === 'on' ? 'An' : 'Aus');
    }
    function updateShapeBtns() {
      var t = ctx.getShapeType();
      rectBtn.classList.toggle('wg-on', t === 'rect');
      circleBtn.classList.toggle('wg-on', t === 'circle');
      markBtn.classList.toggle('wg-on', !!ctx.getDrawArmed());
    }
    function setColorValue(hex) { colorInput.value = hex; }

    return {
      bar: bar,
      grip: grip,
      setOpen: setOpen,
      updateRulerBtn: updateRulerBtn,
      updateShapeBtns: updateShapeBtns,
      setColorValue: setColorValue
    };
  }

  globalThis.RulerSNXToolbar = { build: build };
})();
