/* Popup logic — drives the active tab through the shared exec helper. */
(function () {
  'use strict';
  var exec = window.RulerSNXExec;
  var i18n = window.RulerSNXI18n;
  var toggleBtn = document.getElementById('toggle');
  var note = document.getElementById('note');
  var languageSelect = document.getElementById('language');
  var language = 'de';
  var LANGUAGE_KEY = 'rulersnx:language';

  function storageApi() {
    try {
      var api = (typeof browser !== 'undefined' && browser) ||
        (typeof chrome !== 'undefined' && chrome);
      return api && api.storage && api.storage.local;
    } catch (e) { return null; }
  }

  function readLanguage(done) {
    var storage = storageApi();
    if (!storage) {
      var raw = null;
      try { raw = localStorage.getItem(LANGUAGE_KEY); } catch (e) {}
      done(raw);
      return;
    }
    var finished = false;
    function finish(value) { if (finished) return; finished = true; done(value); }
    try {
      var result = storage.get(LANGUAGE_KEY);
      if (result && typeof result.then === 'function') {
        result.then(function (data) { finish(data && data[LANGUAGE_KEY]); }, function () { finish(null); });
        return;
      }
    } catch (e) {}
    try { storage.get(LANGUAGE_KEY, function (data) { finish(data && data[LANGUAGE_KEY]); }); }
    catch (e) { finish(null); }
  }

  function writeLanguage() {
    var storage = storageApi();
    if (storage) {
      try {
        var data = {}; data[LANGUAGE_KEY] = language;
        var result = storage.set(data);
        if (result && typeof result.catch === 'function') result.catch(function () {});
      } catch (e) {}
      return;
    }
    try { localStorage.setItem(LANGUAGE_KEY, language); } catch (e) {}
  }

  function applyLanguage() {
    i18n.apply(document, language);
    document.documentElement.lang = language;
    languageSelect.value = language;
    languageSelect.setAttribute('aria-label', i18n.get(language, 'language'));
  }

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
    toggleBtn.textContent = i18n.get(language, on ? 'deactivate' : 'activate');
    toggleBtn.classList.toggle('on', on);
    document.body.classList.toggle('blocked', closed || state === null);
    note.textContent = state === null
      ? i18n.get(language, 'noTab')
      : closed
      ? i18n.get(language, 'closedPage')
      : err
      ? i18n.get(language, 'errorPrefix') + err
      : noEngine
      ? i18n.get(language, 'noEngine')
      : '';
  }

  // exec.run resolves rather than rejects, but a bug in here must not be the
  // thing that leaves a button silent either.
  function run(cmd, value) {
    return exec.run(cmd, value).then(function (state) { reflect(state, cmd); }, function (e) {
      reflect({ error: (e && e.message) || String(e) }, cmd);
    });
  }

  toggleBtn.addEventListener('click', function () { run('toggle', language); });
  document.getElementById('v').addEventListener('click', function () { run('vertical', language); });
  document.getElementById('h').addEventListener('click', function () { run('horizontal', language); });
  document.getElementById('cross').addEventListener('click', function () { run('cross', language); });
  document.getElementById('clear').addEventListener('click', function () { run('clear', language); });
  document.getElementById('color').addEventListener('input', function (e) { run('color', e.target.value); });
  languageSelect.addEventListener('change', function (e) {
    language = i18n.normalize(e.target.value);
    writeLanguage();
    applyLanguage();
    run('language', language);
  });

  readLanguage(function (stored) {
    language = i18n.normalize(stored);
    applyLanguage();
    // Read-only on open: this probe injects nothing, it only asks whether the
    // engine is already running in the tab.
    run('state');
  });
})();
