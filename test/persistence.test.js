const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { JSDOM } = require('jsdom');

function harness() {
  const dom = new JSDOM('<!doctype html><html><body></body></html>', {
    url: 'https://example.com', runScripts: 'outside-only', pretendToBeVisual: true
  });
  const w = dom.window;
  w.HTMLCanvasElement.prototype.getContext = () => null;
  const key = 'rulersnx:example.com';
  const stored = { color: '#00ff00', guides: [{ o: 'v', p: 111 }], shapes: [] };
  let resolveRead;
  let saved = structuredClone(stored);
  w.browser = { storage: { local: {
    get: () => new Promise(resolve => { resolveRead = resolve; }),
    set: value => { saved = structuredClone(value[key]); return Promise.resolve(); }
  } } };
  for (const file of ['i18n.js', 'toolbar.js', 'guides.js']) {
    w.eval(fs.readFileSync(path.join(__dirname, '..', 'src', file), 'utf8'));
  }
  return {
    dom, W: w.WebGuides,
    saved: () => saved,
    guides: () => w.document.getElementById('rulersnx-host').shadowRoot.querySelectorAll('.wg-guide'),
    release: async () => { resolveRead({ [key]: stored }); await Promise.resolve(); }
  };
}

(async () => {
  let h = harness();
  h.W.addVertical(300);
  assert.equal(h.saved().guides[0].p, 111, 'first command must not overwrite unread storage');
  await h.release();
  assert.deepEqual(h.saved().guides.map(g => g.p), [111, 300]);
  assert.equal(h.guides().length, 2);
  h.dom.window.close();

  h = harness();
  h.W.activate();
  h.W.clearAll();
  await h.release();
  assert.equal(h.guides().length, 0, 'clear during restore must not resurrect saved guides');
  assert.equal(h.saved().guides.length, 0);
  h.dom.window.close();

  h = harness();
  h.W.setColor('#123456');
  await h.release();
  assert.equal(h.saved().color, '#123456');
  assert.equal(h.saved().guides[0].p, 111, 'changing color before activation preserves saved guides');
  assert.equal(h.W.isActive(), false, 'changing color alone does not activate the overlay');
  h.dom.window.close();

  h = harness();
  h.W.addCross();
  h.W.deactivate();
  await h.release();
  assert.equal(h.saved().guides.length, 3);
  assert.equal(h.W.isActive(), false, 'finishing restore must not reactivate the overlay');
  h.dom.window.close();
  // The storage read that never answers. Before the reveal guard this left the
  // overlay at display:none for good while exec.js happily reported active:true
  // — the add-on looked completely dead and no click could recover it.
  h = harness();
  h.W.activate();
  const hostEl = () => h.dom.window.document.getElementById('rulersnx-host');
  assert.equal(hostEl().style.display, 'none', 'stays hidden while the read is outstanding');
  assert.equal(h.W.isActive(), true, 'yet it already reports itself active');
  await new Promise(r => setTimeout(r, 1700));
  assert.equal(hostEl().style.display, '', 'the reveal guard un-hides it anyway');
  h.dom.window.close();

  h = harness();
  h.W.addCross();
  await new Promise(r => setTimeout(r, 1700));
  assert.equal(h.guides().length, 2, 'a queued crosshair still runs when storage never answers');
  h.dom.window.close();

  console.log('14 asynchronous persistence assertions passed');
})().catch(error => { console.error(error); process.exitCode = 1; });
