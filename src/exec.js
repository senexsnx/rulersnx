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
  //
  // The leading slash is load-bearing. Firefox resolves these paths against the
  // CALLING document, and this file runs in two of them: the background page at
  // the add-on root, and the popup at /src/popup.html. Written as 'src/…' the
  // popup asked for /src/src/toolbar.js, which does not exist — so the keyboard
  // shortcut worked while every popup button did nothing at all.
  var ENGINE = ['/src/toolbar.js', '/src/guides.js'];

  // Serialized and executed in the tab's isolated world — it must not close over
  // anything in this file.
  function applyCommand(cmd, value) {
    // globalThis is the content-script sandbox itself; window is the page's
    // window seen through an Xray wrapper. Firefox shares both between a files
    // injection and a func injection, so either would find the engine — the
    // sandbox global is simply the one that says what it means.
    var W = globalThis.WebGuides;
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

  /*
   * A file that cannot be loaded does NOT reject the call: the frame comes back
   * carrying an `error` instead of a `result`, and executeScript resolves as if
   * all were well. Dropping that value on the floor is precisely what turned a
   * wrong engine path into "I click the button and absolutely nothing happens".
   */
  function injectionError(res) {
    if (!res || !res.length) return null;
    for (var i = 0; i < res.length; i++) {
      var e = res[i] && res[i].error;
      if (e) return (typeof e === 'string') ? e : (e.message || e.name || String(e));
    }
    return null;
  }

  function resolveTab(tab) {
    if (tab && tab.id != null) return Promise.resolve(tab);
    return api.tabs.query({ active: true, currentWindow: true })
      .then(function (tabs) { return tabs && tabs[0]; });
  }

  /*
   * Resolves to { active, ready }, or an error object when the tab cannot be
   * scripted. Keeping the message lets the popup explain what went wrong.
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
      return ready.then(function (injected) {
        var bad = injectionError(injected);
        if (bad) throw new Error('Engine nicht geladen — ' + bad);
        return api.scripting.executeScript({
          target: target,
          func: applyCommand,
          args: [cmd, value == null ? null : value]
        });
      }).then(function (res) {
        return (res && res[0] && res[0].result) || null;
      });
    }).catch(function (err) {
      return { error: (err && err.message) || 'Die Seite konnte nicht angesprochen werden.' };
    });
  }

  globalThis.RulerSNXExec = { run: run };
})();
