/*
 * Covers src/popup.js — the surface the user actually clicks.
 *
 * The regression these tests exist for: a failing probe used to put the popup
 * into .blocked, whose CSS set pointer-events:none on every control. From that
 * moment the popup ignored every click for as long as it stayed open, and on
 * 1.2.0 it could not say why either — the add-on simply looked dead.
 */
const fs = require('fs');
const path = require('path');
const { JSDOM } = require('jsdom');

const SRC = path.join(__dirname, '..', 'src');
const popupCode = fs.readFileSync(path.join(SRC, 'popup.js'), 'utf8');
const popupHtml = fs.readFileSync(path.join(SRC, 'popup.html'), 'utf8');

let pass = 0, fail = 0;
function ok(name, cond) { (cond ? (pass++, console.log('  PASS ' + name)) : (fail++, console.log('  FAIL ' + name))); }

// Loads the real popup markup with a recording stand-in for the exec helper.
// answers[] is consumed one entry per run() call, so a test can say "the probe
// fails, then the click succeeds".
function harness(answers) {
  const dom = new JSDOM(popupHtml, { url: 'moz-extension://x/popup.html', runScripts: 'outside-only' });
  const win = dom.window;
  const calls = [];
  let i = 0;
  win.RulerSNXExec = {
    run: function (cmd, value) {
      calls.push({ cmd: cmd, value: value });
      const a = answers[Math.min(i++, answers.length - 1)];
      return Promise.resolve(a);
    }
  };
  win.eval(popupCode);
  return { win, calls, doc: win.document };
}

// Promises resolve on the microtask queue; one tick is enough to see the result.
const tick = () => new Promise((r) => setTimeout(r, 0));

async function main() {
  console.log('1) a page closed to extensions explains itself');
  {
    const t = harness([{ error: 'Missing host permission for the tab' }]);
    await tick();
    const note = t.doc.getElementById('note').textContent;
    ok('note names the page, not the exception', /Auf dieser Seite nicht möglich/.test(note));
    ok('body marked blocked', t.doc.body.classList.contains('blocked'));
  }

  console.log('2) the controls stay live after a failed probe');
  {
    const t = harness([{ error: 'Missing host permission for the tab' }, { active: true, ready: true }]);
    await tick();
    ok('probe ran', t.calls.length === 1);
    t.doc.getElementById('toggle').dispatchEvent(new t.win.Event('click'));
    await tick();
    ok('the click still reached exec', t.calls.length === 2 && t.calls[1].cmd === 'toggle');
    ok('and the popup recovered', t.doc.getElementById('toggle').textContent === 'Deaktivieren');
    ok('blocked cleared', !t.doc.body.classList.contains('blocked'));
  }

  console.log('2b) ... and after the probe returned nothing at all');
  {
    // This is the shape 1.2.0 produced for every failure: its exec swallowed the
    // error and answered null, the popup went .blocked, and that was the end of it.
    const t = harness([null, { active: true, ready: true }]);
    await tick();
    ok('body marked blocked', t.doc.body.classList.contains('blocked'));
    t.doc.getElementById('v').dispatchEvent(new t.win.Event('click'));
    await tick();
    ok('the click still reached exec', t.calls.length === 2 && t.calls[1].cmd === 'vertical');
  }

  console.log('3) .blocked never disables pointer events');
  {
    const rule = popupHtml.match(/body\.blocked[^}]*}/);
    ok('a .blocked rule exists', !!rule);
    ok('it does not switch off clicks', rule && !/pointer-events\s*:\s*none/.test(rule[0]));
  }

  console.log('4) an unexpected error is shown verbatim instead of swallowed');
  {
    const t = harness([{ error: 'kaputt' }]);
    await tick();
    ok('message surfaced', /kaputt/.test(t.doc.getElementById('note').textContent));
    ok('controls not blocked', !t.doc.body.classList.contains('blocked'));
  }

  console.log('5) no tab says so in its own words');
  {
    const t = harness([null]);
    await tick();
    ok('own message', /Kein Tab gefunden/.test(t.doc.getElementById('note').textContent));
  }

  console.log('6) a rejected promise still reaches the note');
  {
    const dom = new JSDOM(popupHtml, { url: 'moz-extension://x/popup.html', runScripts: 'outside-only' });
    const win = dom.window;
    win.RulerSNXExec = { run: () => Promise.reject(new Error('boom')) };
    win.eval(popupCode);
    await tick();
    ok('rejection reported, not silent', /boom/.test(win.document.getElementById('note').textContent));
  }

  console.log('7) a healthy page leaves the note empty');
  {
    const t = harness([{ active: false, ready: false }]);
    await tick();
    ok('no note', t.doc.getElementById('note').textContent === '');
    ok('button offers to activate', t.doc.getElementById('toggle').textContent === 'Aktivieren');
  }

  console.log('8) a command that leaves no engine in the page says so');
  {
    // exec.js answers {active:false, ready:false} when the injected command ran
    // but globalThis.WebGuides was not there. Up to 1.2.2 the popup rendered
    // that as an ordinary idle state: button unchanged, note empty, nothing on
    // screen — the exact face of the /src/src/ path bug.
    const t = harness([{ active: false, ready: false }, { active: false, ready: false }]);
    await tick();
    ok('the opening probe stays quiet', t.doc.getElementById('note').textContent === '');
    t.doc.getElementById('toggle').dispatchEvent(new t.win.Event('click'));
    await tick();
    ok('but a real command reports it', /Engine ist nicht in der Seite/.test(t.doc.getElementById('note').textContent));
  }

  console.log('\n' + pass + ' passed, ' + fail + ' failed');
  if (fail) process.exit(1);
}

main();
