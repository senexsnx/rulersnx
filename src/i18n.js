/* Shared German/English strings for the popup and injected toolbar. */
(function () {
  'use strict';
  if (globalThis.RulerSNXI18n) return;

  var strings = {
    de: {
      activate: 'Aktivieren',
      deactivate: 'Deaktivieren',
      hint: 'Lineal & magenta Hilfslinien über jede Website legen.',
      vertical: '+ Vertikal',
      horizontal: '+ Horizontal',
      cross: '+ Fadenkreuz (Mitte)',
      color: 'Farbe',
      clear: 'Alle löschen',
      kbd: 'Aus dem Lineal ziehen · Linie anklicken + Entf löscht · Alt + G zum Ein-/Ausschalten',
      noTab: 'Kein Tab gefunden, auf den RulerSNX zugreifen kann.',
      closedPage: 'Auf dieser Seite nicht möglich — Browser erlauben Erweiterungen hier nicht. Öffne eine normale Website und klicke erneut.',
      errorPrefix: 'Fehler beim Ausführen: ',
      noEngine: 'Die Engine ist nicht in der Seite angekommen. Lade die Seite neu und versuche es erneut.',
      language: 'Sprache',
      languageDe: 'Deutsch',
      languageEn: 'English',
      toolbarVerticalTitle: 'Vertikale Hilfslinie in der Mitte',
      toolbarHorizontalTitle: 'Horizontale Hilfslinie in der Mitte',
      toolbarCrossTitle: 'Fadenkreuz in der Mitte',
      colorTitle: 'Farbe der Hilfslinien',
      rectTitle: 'Rechteck aufziehen (Standard) — Shift+Ziehen auf der Seite',
      circleTitle: 'Kreis/Ellipse aufziehen — Shift+Ziehen auf der Seite',
      mark: 'Markieren',
      markTitle: 'Markier-Modus an/aus: normales Ziehen zieht eine Form auf (alternativ immer Shift+Ziehen)',
      rulers: 'Lineale',
      rulerTitle: 'Lineale: Auto (nur am Rand) → An (immer) → Aus',
      rulerAuto: 'Auto',
      rulerOn: 'An',
      rulerOff: 'Aus',
      clearTitle: 'Alle Hilfslinien löschen',
      collapseTitle: 'Leiste einklappen',
      hideTitle: 'Ausblenden (Alt+G)',
      showTitle: 'RulerSNX einblenden'
    },
    en: {
      activate: 'Activate',
      deactivate: 'Deactivate',
      hint: 'Place a ruler and magenta guides over any website.',
      vertical: '+ Vertical',
      horizontal: '+ Horizontal',
      cross: '+ Crosshair (center)',
      color: 'Color',
      clear: 'Clear all',
      kbd: 'Drag from a ruler · Click a line + Delete removes it · Alt + G toggles the overlay',
      noTab: 'No tab was found that RulerSNX can access.',
      closedPage: 'Not available on this page — browsers do not allow extensions here. Open a normal website and try again.',
      errorPrefix: 'Execution error: ',
      noEngine: 'The engine did not reach the page. Reload the page and try again.',
      language: 'Language',
      languageDe: 'Deutsch',
      languageEn: 'English',
      toolbarVerticalTitle: 'Add a vertical guide at the center',
      toolbarHorizontalTitle: 'Add a horizontal guide at the center',
      toolbarCrossTitle: 'Add a crosshair at the center',
      colorTitle: 'Guide color',
      rectTitle: 'Draw a rectangle (default) — Shift+drag on the page',
      circleTitle: 'Draw a circle/ellipse — Shift+drag on the page',
      mark: 'Mark',
      markTitle: 'Toggle marking mode: normal dragging draws a shape (or always use Shift+drag)',
      rulers: 'Rulers',
      rulerTitle: 'Rulers: Auto (at the edge) → On (always) → Off',
      rulerAuto: 'Auto',
      rulerOn: 'On',
      rulerOff: 'Off',
      clearTitle: 'Clear all guides',
      collapseTitle: 'Collapse toolbar',
      hideTitle: 'Hide overlay (Alt+G)',
      showTitle: 'Show RulerSNX'
    }
  };

  function normalize(locale) {
    var value = locale == null || locale === '' ? 'en' : String(locale).toLowerCase();
    return value.indexOf('en') === 0 ? 'en' : 'de';
  }

  function get(locale, key) {
    var lang = normalize(locale);
    return (strings[lang] && strings[lang][key]) || strings.de[key] || key;
  }

  function apply(root, locale) {
    var base = root || document;
    var lang = normalize(locale);
    Array.prototype.forEach.call(base.querySelectorAll('[data-i18n]'), function (el) {
      el.textContent = get(lang, el.getAttribute('data-i18n'));
    });
    Array.prototype.forEach.call(base.querySelectorAll('[data-i18n-title]'), function (el) {
      el.title = get(lang, el.getAttribute('data-i18n-title'));
    });
  }

  globalThis.RulerSNXI18n = { normalize: normalize, get: get, apply: apply };
})();
