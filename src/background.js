/*
 * Background event page. Its only job is the keyboard shortcut — everything
 * else happens in the popup. Registering Alt+G here instead of in a content
 * script is what let the manifest drop <all_urls>: the shortcut lives in the
 * browser, not in a key listener sitting on every page you visit.
 */
(function () {
  'use strict';
  var api = (typeof browser !== 'undefined') ? browser : chrome;

  api.commands.onCommand.addListener(function (command, tab) {
    if (command !== 'toggle-overlay') return;
    // tab is passed from Firefox 96; resolveTab falls back to a query without it.
    globalThis.RulerSNXExec.run('toggle', null, tab);
  });
})();
