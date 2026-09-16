const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const root = path.resolve(__dirname, '..');
async function main() {
  // A fresh worker has neither window nor document. Test two starts, as Chrome
  // discards the worker when idle and starts it again for later keyboard events.
  for (let start = 0; start < 2; start++) {
    const calls = [], listeners = [];
    const scope = vm.createContext({ chrome: {
      commands: { onCommand: { addListener: fn => listeners.push(fn) } },
      tabs: { query: async () => [{ id: 9 }] },
      scripting: { executeScript: async opts => { calls.push(opts); return [{ result: { active: true, ready: true } }]; } }
    } });
    scope.importScripts = (...files) => files.forEach(file => vm.runInContext(fs.readFileSync(path.join(root, 'src', file), 'utf8'), scope));
    vm.runInContext(fs.readFileSync(path.join(root, 'chrome/service-worker.js'), 'utf8'), scope);
    assert.equal(listeners.length, 1, 'listener registered synchronously');
    listeners[0]('unrelated', { id: 7 });
    assert.equal(calls.length, 0, 'unrelated shortcut does nothing');
    listeners[0]('toggle-overlay', { id: 7 });
    await new Promise(resolve => setImmediate(resolve));
    assert.equal(calls.length, 2, 'worker injects then toggles');
    assert.equal(calls[0].target.tabId, 7, 'uses shortcut tab');
    assert.equal(calls[1].args[0], 'toggle');
    calls.length = 0;
    await scope.RulerSNXExec.run('state');
    assert.equal(calls.length, 1, 'state probe does not inject engine');
    assert.equal(calls[0].target.tabId, 9, 'missing tab uses query fallback');
  }
  console.log('14 Chrome worker assertions passed');
}
main().catch(error => { console.error(error); process.exitCode = 1; });
