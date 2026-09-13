const fs = require('fs');
const path = require('path');
const { JSDOM } = require('jsdom');

const code = fs.readFileSync(path.join(__dirname, '..', 'src', 'guides.js'), 'utf8');

const dom = new JSDOM('<!DOCTYPE html><html><body><h1>t</h1></body></html>', {
  url: 'https://example.com/',
  runScripts: 'outside-only',
  pretendToBeVisual: true
});
const win = dom.window;
// jsdom viewport is 1024x768 by default
win.eval(code);
const W = win.WebGuides;

let pass = 0, fail = 0;
function ok(name, cond) { (cond ? (pass++, console.log('  PASS ' + name)) : (fail++, console.log('  FAIL ' + name))); }

function shadow() { return win.document.getElementById('rulersnx-host').shadowRoot; }
function guides() { return shadow().querySelectorAll('.wg-guide'); }
function fire(target, type, props) {
  const e = new win.Event(type, { bubbles: true, cancelable: true });
  Object.assign(e, props || {});
  target.dispatchEvent(e);
  return e;
}

console.log('1) activate / build');
W.activate();
ok('host attached', !!win.document.getElementById('rulersnx-host'));
ok('shadow root open', !!shadow());
ok('top ruler present', !!shadow().querySelector('.wg-ruler-top'));
ok('left ruler present', !!shadow().querySelector('.wg-ruler-left'));
ok('toolbar present', !!shadow().querySelector('.wg-toolbar'));
ok('active state', W.isActive() === true);

console.log('2) add vertical @300, horizontal @200');
W.addVertical(300);
W.addHorizontal(200);
ok('two guides', guides().length === 2);
const v = shadow().querySelector('.wg-guide');
ok('vertical transform 294.5px', v.style.transform === 'translateX(294.5px)'); // 300 - HIT/2(5.5)
const vlabel = v.querySelector('div:last-child');
ok('vertical label "300 px"', vlabel.textContent === '300 px');

console.log('3) drag-create vertical from left ruler, then move to 420');
const left = shadow().querySelector('.wg-ruler-left');
fire(left, 'pointerdown', { clientX: 150, clientY: 400, pointerId: 1 });
ok('guide created on ruler down', guides().length === 3);
fire(win.document, 'pointermove', { clientX: 420, clientY: 400 });
fire(win.document, 'pointerup', { clientX: 420, clientY: 400 });
const created = Array.from(guides()).find(g => g.style.transform === 'translateX(414.5px)'); // 420 - 5.5
ok('created guide moved to 420 (transform 414.5px)', !!created);

console.log('4) delete by dragging created guide back into ruler');
fire(created, 'pointerdown', { clientX: 420, clientY: 400, pointerId: 2 });
fire(win.document, 'pointermove', { clientX: 5, clientY: 400 });
fire(win.document, 'pointerup', { clientX: 5, clientY: 400 }); // clientX < 22 => on ruler => delete
ok('guide removed via ruler drop', guides().length === 2);

console.log('5) delete via double-click');
const before = guides().length;
fire(shadow().querySelector('.wg-guide'), 'dblclick', {});
ok('one guide removed by dblclick', guides().length === before - 1);

console.log('6) setColor updates lines + label bg');
W.setColor('#00ffcc');
const line = shadow().querySelector('.wg-guide > div');
ok('line color updated', /0,\s*255,\s*204|#00ffcc|rgb\(0, 255, 204\)/i.test(line.style.background));

console.log('7) persistence written to localStorage');
const raw = win.localStorage.getItem('rulersnx:example.com');
ok('localStorage key exists', !!raw);
let parsed = raw && JSON.parse(raw);
ok('color persisted', parsed && parsed.color === '#00ffcc');
ok('guides persisted (array)', parsed && Array.isArray(parsed.guides));

console.log('8) clearAll empties');
W.clearAll();
ok('no guides after clearAll', guides().length === 0);
ok('cleared state persisted', JSON.parse(win.localStorage.getItem('rulersnx:example.com')).guides.length === 0);

console.log('9) restore on fresh document');
// seed storage, then load engine into a brand new DOM to test restore()
const dom2 = new JSDOM('<!DOCTYPE html><html><body></body></html>', { url: 'https://example.com/', runScripts: 'outside-only', pretendToBeVisual: true });
dom2.window.localStorage.setItem('rulersnx:example.com', JSON.stringify({ color: '#ff0000', showRulers: true, guides: [{ o: 'v', p: 111 }, { o: 'h', p: 222 }] }));
dom2.window.eval(code);
dom2.window.WebGuides.activate();
const sh2 = dom2.window.document.getElementById('rulersnx-host').shadowRoot;
ok('restored 2 guides', sh2.querySelectorAll('.wg-guide').length === 2);
const restoredV = Array.from(sh2.querySelectorAll('.wg-guide')).find(g => g.style.transform === 'translateX(105.5px)'); // 111 - 5.5
ok('restored vertical @111', !!restoredV);

console.log('10) click to select, then Entf/Delete to remove (on dom1)');
W.addVertical(500);
const sg = Array.from(guides()).find(g => g.style.transform === 'translateX(494.5px)');
// a click = pointerdown on the guide + pointerup at same spot (no movement)
fire(sg, 'pointerdown', { clientX: 500, clientY: 300, pointerId: 9 });
fire(win.document, 'pointerup', { clientX: 500, clientY: 300 });
const sgline = sg.querySelector('div');
ok('selected guide highlighted (3px)', sgline.style.width === '3px');
ok('selected guide has glow', /box-shadow/i.test(sg.querySelector('div').getAttribute('style')) || !!sgline.style.boxShadow);
const cnt = guides().length;
fire(win, 'keydown', { key: 'Delete' });
ok('Entf removes selected guide', guides().length === cnt - 1);

console.log('11) Escape deselects (keeps the guide)');
W.addVertical(600);
const sg2 = Array.from(guides()).find(g => g.style.transform === 'translateX(594.5px)');
fire(sg2, 'pointerdown', { clientX: 600, clientY: 300, pointerId: 10 });
fire(win.document, 'pointerup', { clientX: 600, clientY: 300 });
ok('selected before Esc (3px)', sg2.querySelector('div').style.width === '3px');
const cnt2 = guides().length;
fire(win, 'keydown', { key: 'Escape' });
ok('Esc deselects (back to 1px)', sg2.querySelector('div').style.width === '1px');
ok('Esc keeps the guide', guides().length === cnt2);
fire(win, 'keydown', { key: 'Delete' }); // nothing selected now
ok('Delete with no selection is a no-op', guides().length === cnt2);

console.log('12) rulers auto-hide, reveal only on edge hover (fresh dom)');
const dom3 = new JSDOM('<!DOCTYPE html><html><body></body></html>', { url: 'https://example.com/', runScripts: 'outside-only', pretendToBeVisual: true });
const w3 = dom3.window; w3.eval(code); const W3 = w3.WebGuides;
W3.activate();
const sh3 = w3.document.getElementById('rulersnx-host').shadowRoot;
const top3 = sh3.querySelector('.wg-ruler-top');
const left3 = sh3.querySelector('.wg-ruler-left');
function fire3(t, type, p) { const e = new w3.Event(type, { bubbles: true, cancelable: true }); Object.assign(e, p || {}); t.dispatchEvent(e); }
ok('auto: top ruler hidden initially', top3.style.display === 'none');
ok('auto: left ruler hidden initially', left3.style.display === 'none');
fire3(w3, 'pointermove', { clientX: 300, clientY: 5 });
ok('top ruler reveals near top edge', top3.style.display !== 'none');
ok('left stays hidden (cursor not at left)', left3.style.display === 'none');
fire3(w3, 'pointermove', { clientX: 300, clientY: 300 });
ok('top ruler hides when cursor leaves edge', top3.style.display === 'none');
fire3(w3, 'pointermove', { clientX: 4, clientY: 300 });
ok('left ruler reveals near left edge', left3.style.display !== 'none');

console.log('13) "Lineale" button cycles Auto -> An -> Aus');
const rbtn = Array.from(sh3.querySelectorAll('.wg-btn')).find(b => /Lineale/.test(b.textContent));
ok('button label starts at Auto', /Auto/.test(rbtn.textContent));
fire3(rbtn, 'click', {});
ok('-> An: always visible', top3.style.display !== 'none' && /An/.test(rbtn.textContent));
fire3(w3, 'pointermove', { clientX: 300, clientY: 300 }); // in "An" mode a far cursor must NOT hide it
ok('An mode ignores auto-hide', top3.style.display !== 'none');
fire3(rbtn, 'click', {});
ok('-> Aus: hidden', top3.style.display === 'none' && /Aus/.test(rbtn.textContent));

console.log('14) Shift+drag draws a rectangle marker, auto-selected, Entf removes it (dom1)');
const body = win.document.body;
function shapes() { return shadow().querySelectorAll('.wg-shape'); }
fire(body, 'pointerdown', { clientX: 200, clientY: 200, button: 0, shiftKey: true });
fire(win.document, 'pointermove', { clientX: 320, clientY: 280, shiftKey: true });
fire(win.document, 'pointerup', { clientX: 320, clientY: 280 });
ok('one shape created', shapes().length === 1);
const rectEl = shadow().querySelector('.wg-shape');
ok('rect geometry (200,200 120x80)', rectEl.style.left === '200px' && rectEl.style.top === '200px' && rectEl.style.width === '120px' && rectEl.style.height === '80px');
ok('rect corner (2px radius)', rectEl.style.borderRadius === '2px');
ok('new shape is selected (glow)', rectEl.style.boxShadow && rectEl.style.boxShadow !== 'none');
fire(win, 'keydown', { key: 'Delete' });
ok('Entf removes the shape', shapes().length === 0);

console.log('15) circle type via toolbar + Shift+drag + persistence');
const btns = Array.from(shadow().querySelectorAll('.wg-btn'));
const circleBtn = btns.find(b => b.textContent === '◯');
fire(circleBtn, 'click', {});
ok('circle button active', circleBtn.classList.contains('wg-on'));
fire(body, 'pointerdown', { clientX: 400, clientY: 300, button: 0, shiftKey: true });
fire(win.document, 'pointermove', { clientX: 500, clientY: 400, shiftKey: true });
fire(win.document, 'pointerup', { clientX: 500, clientY: 400 });
const circEl = shadow().querySelector('.wg-shape');
ok('circle drawn (50% radius)', circEl && circEl.style.borderRadius === '50%');
const store = JSON.parse(win.localStorage.getItem('rulersnx:example.com'));
ok('shapes persisted', Array.isArray(store.shapes) && store.shapes.length === 1);
ok('shapeType persisted = circle', store.shapeType === 'circle');

console.log('16) "Markieren" armed = plain drag draws (no Shift); clearAll clears shapes');
const markBtn = btns.find(b => b.textContent === 'Markieren');
fire(markBtn, 'click', {});
ok('markieren armed', markBtn.classList.contains('wg-on'));
fire(body, 'pointerdown', { clientX: 120, clientY: 120, button: 0 }); // no shiftKey
fire(win.document, 'pointermove', { clientX: 240, clientY: 200 });
fire(win.document, 'pointerup', { clientX: 240, clientY: 200 });
ok('plain drag drew a shape while armed', shapes().length === 2);
W.clearAll();
ok('clearAll removes all shapes', shapes().length === 0);

console.log('17) restore shapes on a fresh document');
const dom4 = new JSDOM('<!DOCTYPE html><html><body></body></html>', { url: 'https://example.com/', runScripts: 'outside-only', pretendToBeVisual: true });
dom4.window.localStorage.setItem('rulersnx:example.com', JSON.stringify({ color: '#ff00ff', rulerMode: 'auto', shapeType: 'rect', guides: [], shapes: [{ t: 'rect', x: 50, y: 60, w: 120, h: 80 }] }));
dom4.window.eval(code); dom4.window.WebGuides.activate();
const sh4 = dom4.window.document.getElementById('rulersnx-host').shadowRoot;
ok('restored 1 shape', sh4.querySelectorAll('.wg-shape').length === 1);
const rs = sh4.querySelector('.wg-shape');
ok('restored shape geometry', rs.style.left === '50px' && rs.style.width === '120px');

function setViewport(w, width, height, dispatch) {
  Object.defineProperty(w, 'innerWidth', { value: width, configurable: true });
  Object.defineProperty(w, 'innerHeight', { value: height, configurable: true });
  if (dispatch !== false) w.dispatchEvent(new w.Event('resize', { bubbles: true }));
}
function freshDom() {
  return new JSDOM('<!DOCTYPE html><html><body></body></html>',
    { url: 'https://example.com/', runScripts: 'outside-only', pretendToBeVisual: true });
}

console.log('18) guide keeps its absolute position across viewport changes');
const dom5 = freshDom();
const w5 = dom5.window;
setViewport(w5, 1440, 900, false);
w5.eval(code);
w5.WebGuides.activate();
w5.WebGuides.addVertical(800);
const sh5 = w5.document.getElementById('rulersnx-host').shadowRoot;
const g5 = sh5.querySelector('.wg-guide');
ok('guide sits at 800 on desktop', g5.style.transform === 'translateX(794.5px)');
setViewport(w5, 375, 667);
ok('guide hidden when outside the viewport', g5.style.display === 'none');
ok('guide keeps 800 while hidden', g5.style.transform === 'translateX(794.5px)');
setViewport(w5, 1440, 900);
ok('guide returns intact at 800', g5.style.display !== 'none' && g5.style.transform === 'translateX(794.5px)');

console.log('19) restore does not clamp guides to the current viewport');
const dom6 = freshDom();
const w6 = dom6.window;
setViewport(w6, 375, 667, false);
w6.localStorage.setItem('rulersnx:example.com', JSON.stringify({
  color: '#ff00ff', rulerMode: 'auto', shapeType: 'rect',
  guides: [{ o: 'v', p: 800 }], shapes: []
}));
w6.eval(code);
w6.WebGuides.activate();
const sh6 = w6.document.getElementById('rulersnx-host').shadowRoot;
const g6 = sh6.querySelector('.wg-guide');
ok('restored guide is hidden at 375px', g6.style.display === 'none');
setViewport(w6, 1440, 900);
ok('restored guide reappears at 800', g6.style.transform === 'translateX(794.5px)');

console.log('20) a guide inside the viewport stays visible');
setViewport(w6, 1440, 900);
w6.WebGuides.addHorizontal(300);
const hg6 = Array.from(sh6.querySelectorAll('.wg-guide'))
  .find(el => el.style.transform === 'translateY(294.5px)');
ok('in-range guide rendered and visible', !!hg6 && hg6.style.display !== 'none');

console.log('21) coarse flag follows the most recent pointer type');
const dom7 = freshDom();
const w7 = dom7.window;
w7.eval(code);
w7.WebGuides.activate();
const host7 = w7.document.getElementById('rulersnx-host');
ok('starts fine (no touch seen yet)', !host7.classList.contains('wg-coarse'));
function fire7(t, type, p) {
  const e = new w7.Event(type, { bubbles: true, cancelable: true });
  Object.assign(e, p || {});
  t.dispatchEvent(e);
}
fire7(w7, 'pointermove', { clientX: 300, clientY: 300, pointerType: 'touch' });
ok('touch pointer switches to coarse', host7.classList.contains('wg-coarse'));
fire7(w7, 'pointermove', { clientX: 300, clientY: 300, pointerType: 'mouse' });
ok('mouse pointer switches back to fine', !host7.classList.contains('wg-coarse'));
fire7(w7, 'pointermove', { clientX: 300, clientY: 300, pointerType: 'pen' });
ok('pen counts as fine (has hover and precision)', !host7.classList.contains('wg-coarse'));
fire7(w7, 'pointermove', { clientX: 300, clientY: 300 });
ok('event without pointerType leaves the flag alone', !host7.classList.contains('wg-coarse'));

console.log('\n' + pass + ' passed, ' + fail + ' failed');
process.exit(fail ? 1 : 0);
