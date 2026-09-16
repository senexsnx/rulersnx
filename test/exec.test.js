/*
 * Covers src/exec.js — the only code that can put anything into a web page.
 * The engine itself is exercised by guides.test.js; what matters here is that
 * nothing is injected unless a command asks for it, and that an unscriptable
 * tab fails quietly instead of throwing at the popup.
 */
const fs = require('fs');
const path = require('path');
const { JSDOM } = require('jsdom');

const execCode = fs.readFileSync(path.join(__dirname, '..', 'src', 'exec.js'), 'utf8');

let pass = 0, fail = 0;
function ok(name, cond) { (cond ? (pass++, console.log('  PASS ' + name)) : (fail++, console.log('  FAIL ' + name))); }

// A fake WebExtension API that records every call instead of touching a tab.
function harness(opts) {
  opts = opts || {};
  const dom = new JSDOM('<!DOCTYPE html><html><body></body></html>',
    { url: 'https://example.com/', runScripts: 'outside-only' });
  const win = dom.window;
  const calls = [];
  win.browser = {
    tabs: {
      query: () => Promise.resolve(opts.noTab ? [] : [{ id: 7 }])
    },
    scripting: {
      executeScript: (o) => {
        calls.push(o);
        if (opts.reject) return Promise.reject(new Error('Missing host permission for the tab'));
        if (o.files) return Promise.resolve(o.files.map(() => ({ result: undefined })));
        // Same as the browser does: run the serialized function in the page world.
        const fn = win.eval('(' + o.func.toString() + ')');
        return Promise.resolve([{ result: fn.apply(null, o.args) }]);
      }
    }
  };
  win.eval(execCode);
  return { win, calls, exec: win.RulerSNXExec };
}

// Stand-in for an engine that is already injected.
function engine(win, active) {
  win.WebGuides = {
    _active: !!active,
    toggle() { this._active = !this._active; },
    activate() { this._active = true; },
    deactivate() { this._active = false; },
    clearAll() { this.cleared = true; },
    addVertical() { this.v = (this.v || 0) + 1; },
    addHorizontal() { this.h = (this.h || 0) + 1; },
    addCross() { this.addVertical(); this.addHorizontal(); },
    setColor(c) { this.color = c; },
    isActive() { return this._active; }
  };
  return win.WebGuides;
}

async function main() {
  console.log('1) a command injects the engine, then applies itself');
  {
    const t = harness();
    const W = engine(t.win, false);
    const state = await t.exec.run('toggle');
    ok('two executeScript calls (files, then func)', t.calls.length === 2);
    ok('engine files injected in order',
      JSON.stringify(t.calls[0].files) === JSON.stringify(['src/toolbar.js', 'src/guides.js']));
    ok('targets the resolved tab', t.calls[0].target.tabId === 7);
    ok('toggle reached the engine', W.isActive() === true);
    ok('state reported back', state && state.active === true && state.ready === true);
  }

  console.log('2) the state probe injects nothing');
  {
    const t = harness();
    engine(t.win, true);
    const state = await t.exec.run('state');
    ok('one executeScript call only', t.calls.length === 1);
    ok('no files injected', !t.calls[0].files);
    ok('reads the running engine', state && state.active === true);
  }

  console.log('3) a page without the engine reports not-ready instead of throwing');
  {
    const t = harness();
    const state = await t.exec.run('state');
    ok('ready=false', state && state.ready === false);
    ok('active=false', state && state.active === false);
  }

  console.log('4) an unscriptable tab resolves to null');
  {
    const t = harness({ reject: true });
    const state = await t.exec.run('toggle');
    ok('null, not a rejection', state === null);
  }

  console.log('5) no active tab resolves to null and injects nothing');
  {
    const t = harness({ noTab: true });
    const state = await t.exec.run('toggle');
    ok('null returned', state === null);
    ok('nothing injected', t.calls.length === 0);
  }

  console.log('6) every popup command is wired through');
  {
    const t = harness();
    const W = engine(t.win, true);
    await t.exec.run('vertical');
    await t.exec.run('horizontal');
    await t.exec.run('cross');
    await t.exec.run('color', '#00ffcc');
    await t.exec.run('clear');
    ok('vertical guides requested', W.v === 2);   // one direct, one via cross
    ok('horizontal guides requested', W.h === 2);
    ok('colour passed through', W.color === '#00ffcc');
    ok('clear reached the engine', W.cleared === true);
    await t.exec.run('color', null);
    ok('an empty colour is ignored', W.color === '#00ffcc');
  }

  console.log('7) an unknown command changes nothing');
  {
    const t = harness();
    const W = engine(t.win, true);
    const state = await t.exec.run('nonsense');
    ok('still active', W.isActive() === true);
    ok('state still reported', state && state.active === true);
  }

  console.log('\n' + pass + ' passed, ' + fail + ' failed');
  process.exit(fail ? 1 : 0);
}

main();
