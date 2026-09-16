/*
 * RulerSNX — "run one command in the active tab".
 *
 * Shared by the background event page and the popup. Both are contexts the user
 * has just interacted with, and that interaction is what grants activeTab: the
 * engine is injected into a page at that moment and never before. No host
 * permission is declared, so RulerSNX cannot touch a tab you did not point it at.
 */
(function () {
  'use strict';
  var api = (typeof browser !== 'undefined') ? browser : chrome;

  // Injection order matters: guides.js expects the toolbar module to exist.
  // Both files no-op when they are already present, so re-running is free.
  var ENGINE = ['src/toolbar.js', 'src/guides.js'];

  // Serialized and executed in the tab's isolated world — it must not close over
  // anything in this file.
  function applyCommand(cmd, value) {
    var W = window.WebGuides;
    if (!W) return { active: false, ready: false };
    switch (cmd) {
      case 'toggle': W.toggle(); break;
      case 'activate': W.activate(); break;
      case 'deactivate': W.deactivate(); break;
      case 'clear': W.clearAll(); break;
      case 'vertical': W.addVertical(); break;
      case 'horizontal': W.addHorizontal(); break;
      case 'cross': W.addCross(); break;
      case 'color': if (value) W.setColor(value); break;
      case 'state': break; // read-only probe
    }
    return { active: W.isActive(), ready: true };
  }

  function resolveTab(tab) {
    if (tab && tab.id != null) return Promise.resolve(tab);
    return api.tabs.query({ active: true, currentWindow: true })
      .then(function (tabs) { return tabs && tabs[0]; });
  }

  /*
   * Resolves to { active, ready } or to null when the tab cannot be scripted.
   * Internal pages — about:, the add-on store, the new tab page — are closed to
   * every extension, and the popup turns that null into a plain hint.
   *
   * 'state' only asks whether the engine is already there, so it skips the
   * injection: opening the popup on a page you then leave alone changes nothing.
   */
  function run(cmd, value, tab) {
    return resolveTab(tab).then(function (t) {
      if (!t || t.id == null) return null;
      var target = { tabId: t.id };
      var ready = (cmd === 'state')
        ? Promise.resolve()
        : api.scripting.executeScript({ target: target, files: ENGINE });
      return ready.then(function () {
        return api.scripting.executeScript({
          target: target,
          func: applyCommand,
          args: [cmd, value == null ? null : value]
        });
      }).then(function (res) {
        return (res && res[0] && res[0].result) || null;
      });
    }).catch(function () { return null; });
  }

  globalThis.RulerSNXExec = { run: run };
})();
