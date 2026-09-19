/* Popup logic — drives the active tab through the shared exec helper. */
(function () {
  'use strict';
  var exec = window.RulerSNXExec;
  var toggleBtn = document.getElementById('toggle');
  var note = document.getElementById('note');

  // Firefox refuses the injection with one of these messages on every page that
  // is closed to extensions — about:, the add-on store, the new tab page.
  // activeTab is never granted there, so the tab carries no URL we could have
  // inspected up front; the refusal itself is the only signal we get.
  function looksClosed(msg) {
    return /host permission|cannot be scripted|not allowed|Invalid tab ID/i.test(msg || '');
  }

  // A click must never be swallowed. Up to 1.2.1 any failed probe put the popup
  // into .blocked, which set pointer-events:none on every control: from then on
  // the popup ignored every click for as long as it stayed open, and 1.2.0 could
  // not even say why — the add-on looked simply dead. The controls now stay live
  // and the note always carries the reason, so a click always answers something.
  function reflect(state, cmd) {
    var err = state && state.error;
    var closed = err ? looksClosed(err) : false;
    var on = !!(state && state.active);
    // ready:false after a real command means the browser accepted the call and
    // the engine still is not in the page. On the opening 'state' probe that is
    // the normal answer, because the probe injects nothing.
    var noEngine = !err && cmd && cmd !== 'state' && !!state && state.ready === false;
    toggleBtn.textContent = on ? 'Deaktivieren' : 'Aktivieren';
    toggleBtn.classList.toggle('on', on);
    document.body.classList.toggle('blocked', closed || state === null);
    note.textContent = state === null
      ? 'Kein Tab gefunden, auf den RulerSNX zugreifen kann.'
      : closed
      ? 'Auf dieser Seite nicht möglich — Browser erlauben Erweiterungen hier nicht. Öffne eine normale Website und klicke erneut.'
      : err
      ? 'Fehler beim Ausführen: ' + err
      : noEngine
      ? 'Die Engine ist nicht in der Seite angekommen. Lade die Seite neu und versuche es erneut.'
      : '';
  }

  // exec.run resolves rather than rejects, but a bug in here must not be the
  // thing that leaves a button silent either.
  function run(cmd, value) {
    return exec.run(cmd, value).then(function (state) { reflect(state, cmd); }, function (e) {
      reflect({ error: (e && e.message) || String(e) }, cmd);
    });
  }

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
