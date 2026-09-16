/* Popup logic — drives the active tab through the shared exec helper. */
(function () {
  'use strict';
  var exec = window.RulerSNXExec;
  var toggleBtn = document.getElementById('toggle');
  var note = document.getElementById('note');

  // state === null means the tab cannot be scripted at all (about:, the add-on
  // store, the new tab page). Saying so beats a button that silently does nothing.
  function reflect(state) {
    var blocked = state === null;
    var on = !!(state && state.active);
    toggleBtn.textContent = on ? 'Deaktivieren' : 'Aktivieren';
    toggleBtn.classList.toggle('on', on);
    document.body.classList.toggle('blocked', blocked);
    note.textContent = blocked
      ? 'Auf dieser Seite nicht möglich — Browser erlauben Erweiterungen hier nicht. Öffne eine normale Website.'
      : '';
  }

  function run(cmd, value) { return exec.run(cmd, value).then(reflect); }

  toggleBtn.addEventListener('click', function () { run('toggle'); });
  document.getElementById('v').addEventListener('click', function () { run('vertical'); });
  document.getElementById('h').addEventListener('click', function () { run('horizontal'); });
  document.getElementById('cross').addEventListener('click', function () { run('cross'); });
  document.getElementById('clear').addEventListener('click', function () { run('clear'); });
  document.getElementById('color').addEventListener('input', function (e) { run('color', e.target.value); });

  // Read-only on open: this probe injects nothing, it only asks whether the
  // engine is already running in the tab.
  run('state');
})();
