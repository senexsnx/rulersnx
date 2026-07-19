/* Content script: bridges the popup and an in-page hotkey to the WebGuides engine. */
(function () {
  'use strict';
  var api = (typeof browser !== 'undefined') ? browser : chrome;

  api.runtime.onMessage.addListener(function (msg, sender, sendResponse) {
    var W = window.WebGuides;
    if (!W) return;
    switch (msg && msg.cmd) {
      case 'toggle': W.toggle(); break;
      case 'activate': W.activate(); break;
      case 'deactivate': W.deactivate(); break;
      case 'clear': W.clearAll(); break;
      case 'vertical': W.addVertical(); break;
      case 'horizontal': W.addHorizontal(); break;
      case 'cross': W.addCross(); break;
      case 'color': if (msg.value) W.setColor(msg.value); break;
    }
    sendResponse({ active: W.isActive() });
    return true;
  });

  // In-page hotkey: Alt+G toggles the overlay (no background script needed).
  window.addEventListener('keydown', function (e) {
    if (e.altKey && !e.ctrlKey && !e.metaKey && (e.key === 'g' || e.key === 'G')) {
      if (window.WebGuides) { window.WebGuides.toggle(); e.preventDefault(); }
    }
  }, true);
})();
