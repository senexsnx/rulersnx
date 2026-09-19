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
    var i18n = globalThis.RulerSNXI18n;
    var language = i18n.normalize(ctx.getLanguage ? ctx.getLanguage() : 'de');
    var localized = [];
    var bar = make(); bar.className = 'wg-toolbar';
    var title = make(); title.className = 'wg-title'; title.textContent = 'RulerSNX';
    bar.appendChild(title);
    function localizedBtn(labelKey, titleKey, fn) {
      var b = btn(labelKey ? i18n.get(language, labelKey) : '', i18n.get(language, titleKey), fn);
      localized.push({ el: b, labelKey: labelKey, titleKey: titleKey });
      return b;
    }
    bar.appendChild(localizedBtn('vertical', 'toolbarVerticalTitle', function () { ctx.addVertical(); }));
    bar.appendChild(localizedBtn('horizontal', 'toolbarHorizontalTitle', function () { ctx.addHorizontal(); }));
    bar.appendChild(localizedBtn('cross', 'toolbarCrossTitle', function () { ctx.addCross(); }));
    bar.appendChild(sep());

    var colorInput = document.createElement('input');
    colorInput.type = 'color'; colorInput.className = 'wg-color';
    colorInput.value = ctx.getColor(); colorInput.title = i18n.get(language, 'colorTitle');
    colorInput.addEventListener('input', function (e) { ctx.setColor(e.target.value); });
    bar.appendChild(colorInput);
    bar.appendChild(sep());

    var rectBtn = localizedBtn(null, 'rectTitle', function () { ctx.setShapeType('rect'); });
    rectBtn.textContent = '▭';
    var circleBtn = localizedBtn(null, 'circleTitle', function () { ctx.setShapeType('circle'); });
    circleBtn.textContent = '◯';
    var markBtn = localizedBtn('mark', 'markTitle', function () { ctx.toggleDraw(); });
    bar.appendChild(rectBtn); bar.appendChild(circleBtn); bar.appendChild(markBtn);
    bar.appendChild(sep());

    var rulerBtn = localizedBtn(null, 'rulerTitle', function () { ctx.toggleRulers(); });
    bar.appendChild(rulerBtn);
    var clearBtn = localizedBtn('clear', 'clearTitle', function () { ctx.clearAll(); });
    bar.appendChild(clearBtn);
    bar.appendChild(sep());
    var collapseBtn = localizedBtn(null, 'collapseTitle', function () { ctx.setBarOpen(false); });
    collapseBtn.textContent = '⌄';
    bar.appendChild(collapseBtn);
    var hideBtn = localizedBtn(null, 'hideTitle', function () { ctx.deactivate(); });
    hideBtn.textContent = '✕';
    bar.appendChild(hideBtn);

    // Collapsed state: a single grip in the corner. On a narrow touch viewport
    // the expanded bar would eat roughly a quarter of the screen.
    var grip = make(); grip.className = 'wg-bar-grip';
    grip.textContent = '⁘';
    grip.title = i18n.get(language, 'showTitle');
    grip.addEventListener('click', function () { ctx.setBarOpen(true); });

    function setOpen(open) {
      bar.style.display = open ? '' : 'none';
      grip.style.display = open ? 'none' : '';
    }

    function updateRulerBtn() {
      var m = ctx.getRulerMode();
      var modeKey = m === 'auto' ? 'rulerAuto' : m === 'on' ? 'rulerOn' : 'rulerOff';
      rulerBtn.textContent = i18n.get(language, 'rulers') + ': ' + i18n.get(language, modeKey);
    }
    function updateShapeBtns() {
      var t = ctx.getShapeType();
      rectBtn.classList.toggle('wg-on', t === 'rect');
      circleBtn.classList.toggle('wg-on', t === 'circle');
      markBtn.classList.toggle('wg-on', !!ctx.getDrawArmed());
    }
    function setColorValue(hex) { colorInput.value = hex; }
    function setLanguage(locale) {
      language = i18n.normalize(locale);
      localized.forEach(function (item) {
        if (item.labelKey) item.el.textContent = i18n.get(language, item.labelKey);
        item.el.title = i18n.get(language, item.titleKey);
      });
      colorInput.title = i18n.get(language, 'colorTitle');
      grip.title = i18n.get(language, 'showTitle');
      updateRulerBtn();
    }

    return {
      bar: bar,
      grip: grip,
      setOpen: setOpen,
      updateRulerBtn: updateRulerBtn,
      updateShapeBtns: updateShapeBtns,
      setColorValue: setColorValue,
      setLanguage: setLanguage
    };
  }

  globalThis.RulerSNXToolbar = { build: build };
})();
