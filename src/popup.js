/* Popup logic — talks to the content script in the active tab. */
(function () {
  'use strict';
  var api = (typeof browser !== 'undefined') ? browser : chrome;

  function activeTab() {
    return api.tabs.query({ active: true, currentWindow: true }).then(function (tabs) { return tabs[0]; });
  }
  function send(cmd, extra) {
    return activeTab().then(function (tab) {
      if (!tab) return null;
      var msg = Object.assign({ cmd: cmd }, extra || {});
      return api.tabs.sendMessage(tab.id, msg).catch(function () { return null; });
    });
  }
  function reflect(state) {
    var btn = document.getElementById('toggle');
    var on = state && state.active;
    btn.textContent = on ? 'Deaktivieren' : 'Aktivieren';
    btn.classList.toggle('on', !!on);
  }

  document.getElementById('toggle').addEventListener('click', function () {
    send('toggle').then(reflect);
  });
  document.getElementById('v').addEventListener('click', function () { send('vertical').then(reflect); });
  document.getElementById('h').addEventListener('click', function () { send('horizontal').then(reflect); });
  document.getElementById('cross').addEventListener('click', function () { send('cross').then(reflect); });
  document.getElementById('clear').addEventListener('click', function () { send('clear'); });
  document.getElementById('color').addEventListener('input', function (e) { send('color', { value: e.target.value }); });

  // Reflect current state on open (ask the content script without changing anything).
  send('state').then(reflect);
})();
