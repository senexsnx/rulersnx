const fs = require('fs');
const path = require('path');
const { JSDOM } = require('jsdom');

const code = fs.readFileSync(path.join(__dirname, '..', 'src', 'guides.js'), 'utf8');
const toolbarCode = fs.readFileSync(path.join(__dirname, '..', 'src', 'toolbar.js'), 'utf8');
const i18nCode = fs.readFileSync(path.join(__dirname, '..', 'src', 'i18n.js'), 'utf8');

// Same order the manifest uses: the toolbar module must exist before the engine
// builds its overlay.
function boot(w) { w.eval(i18nCode); w.eval(toolbarCode); w.eval(code); return w.WebGuides; }

const dom = new JSDOM('<!DOCTYPE html><html><body><h1>t</h1></body></html>', {
  url: 'https://example.com/',
  runScripts: 'outside-only',
  pretendToBeVisual: true
});
const win = dom.window;
// jsdom viewport is 1024x768 by default
boot(win);
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
const initialToolbar = shadow().querySelector('.wg-toolbar');
ok('toolbar starts in German', initialToolbar.textContent.includes('+ Vertikal'));
W.setLanguage('en');
ok('toolbar switches to English', initialToolbar.textContent.includes('+ Vertical'));
ok('English tooltip switches too', initialToolbar.querySelector('.wg-btn').title.includes('vertical'));
ok('language is persisted', JSON.parse(win.localStorage.getItem('rulersnx:example.com')).language === 'en');
W.setLanguage('de');

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
boot(dom2.window);
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
const w3 = dom3.window; boot(w3); const W3 = w3.WebGuides;
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
boot(dom4.window); dom4.window.WebGuides.activate();
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
boot(w5);
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
boot(w6);
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
boot(w7);
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

console.log('22) on touch the corner grip reveals the rulers, hover does not');
const dom8 = freshDom();
const w8 = dom8.window;
boot(w8);
w8.WebGuides.activate();
const sh8 = w8.document.getElementById('rulersnx-host').shadowRoot;
const top8 = sh8.querySelector('.wg-ruler-top');
const left8 = sh8.querySelector('.wg-ruler-left');
const corner8 = sh8.querySelector('.wg-corner');
function fire8(t, type, p) {
  const e = new w8.Event(type, { bubbles: true, cancelable: true });
  Object.assign(e, p || {});
  t.dispatchEvent(e);
}
fire8(w8, 'pointermove', { clientX: 300, clientY: 300, pointerType: 'touch' });
ok('rulers hidden on touch by default', top8.style.display === 'none');
ok('corner stays as the grip on touch', corner8.style.display !== 'none');
fire8(w8, 'pointermove', { clientX: 300, clientY: 5, pointerType: 'touch' });
ok('hovering the edge does NOT reveal on touch', top8.style.display === 'none');
fire8(corner8, 'pointerdown', { clientX: 5, clientY: 5, pointerType: 'touch' });
ok('corner tap reveals top ruler', top8.style.display !== 'none');
ok('corner tap reveals left ruler', left8.style.display !== 'none');
fire8(corner8, 'pointerdown', { clientX: 5, clientY: 5, pointerType: 'touch' });
ok('second corner tap hides them again', top8.style.display === 'none');

console.log('23) with a mouse the corner hides along with the rulers (1.0.0 behaviour)');
const dom9 = freshDom();
const w9 = dom9.window;
boot(w9);
w9.WebGuides.activate();
const sh9 = w9.document.getElementById('rulersnx-host').shadowRoot;
ok('corner hidden with mouse in auto mode', sh9.querySelector('.wg-corner').style.display === 'none');

console.log('24) pointercancel ends a drag cleanly and keeps the guide');
const domA = freshDom();
const wA = domA.window;
boot(wA);
wA.WebGuides.activate();
wA.WebGuides.addVertical(500);
const shA = wA.document.getElementById('rulersnx-host').shadowRoot;
function fireA(t, type, p) {
  const e = new wA.Event(type, { bubbles: true, cancelable: true });
  Object.assign(e, p || {});
  t.dispatchEvent(e);
}
const gA = shA.querySelector('.wg-guide');
// These events carry pointerType 'touch', so the window is in coarse mode from
// here on and the grab offset is 44/2 rather than 11/2.
fireA(gA, 'pointerdown', { clientX: 500, clientY: 300, pointerId: 20, pointerType: 'touch' });
fireA(wA.document, 'pointermove', { clientX: 640, clientY: 300, pointerType: 'touch' });
fireA(wA.document, 'pointercancel', { clientX: 640, clientY: 300, pointerType: 'touch' });
ok('guide survives a cancelled drag', shA.querySelectorAll('.wg-guide').length === 1);
ok('guide keeps its last position', gA.style.transform === 'translateX(618px)');
fireA(wA.document, 'pointermove', { clientX: 900, clientY: 300, pointerType: 'touch' });
ok('cancel detached the move listener', gA.style.transform === 'translateX(618px)');
const storeA = JSON.parse(wA.localStorage.getItem('rulersnx:example.com'));
ok('cancelled drag persisted the last position', storeA.guides[0].p === 640);

console.log('25) a cancelled drag never deletes the guide, even over the ruler');
wA.WebGuides.addVertical(400);
const gA2 = Array.from(shA.querySelectorAll('.wg-guide')).pop(); // newest one
fireA(gA2, 'pointerdown', { clientX: 400, clientY: 300, pointerId: 21, pointerType: 'touch' });
fireA(wA.document, 'pointermove', { clientX: 4, clientY: 300, pointerType: 'touch' });
const countA = shA.querySelectorAll('.wg-guide').length;
fireA(wA.document, 'pointercancel', { clientX: 4, clientY: 300, pointerType: 'touch' });
ok('cancel over the ruler does not delete', shA.querySelectorAll('.wg-guide').length === countA);

console.log('26) draggable surfaces opt out of browser panning');
ok('stylesheet sets touch-action none', /touch-action:\s*none/.test(shA.querySelector('style').textContent));

console.log('27) grab zone grows on touch, the visible line does not');
const domB = freshDom();
const wB = domB.window;
boot(wB);
wB.WebGuides.activate();
wB.WebGuides.addVertical(500);
const shB = wB.document.getElementById('rulersnx-host').shadowRoot;
const gB = shB.querySelector('.wg-guide');
ok('fine mode keeps the 11px offset', gB.style.transform === 'translateX(494.5px)');
ok('fine mode line is 1px', gB.querySelector('div').style.width === '1px');
function fireB(t, type, p) {
  const e = new wB.Event(type, { bubbles: true, cancelable: true });
  Object.assign(e, p || {});
  t.dispatchEvent(e);
}
fireB(wB, 'pointermove', { clientX: 300, clientY: 300, pointerType: 'touch' });
ok('coarse mode offsets by 44/2', gB.style.transform === 'translateX(478px)');
ok('coarse mode leaves the line at 1px', gB.querySelector('div').style.width === '1px');
ok('stylesheet exposes the hit variable', /--wg-hit/.test(shB.querySelector('style').textContent));
fireB(wB, 'pointermove', { clientX: 300, clientY: 300, pointerType: 'mouse' });
ok('back to fine restores the 11px offset', gB.style.transform === 'translateX(494.5px)');

console.log('28) toolbar collapses on touch and follows the coarse flag');
const domC = freshDom();
const wC = domC.window;
boot(wC);
wC.WebGuides.activate();
const shC = wC.document.getElementById('rulersnx-host').shadowRoot;
const barC = shC.querySelector('.wg-toolbar');
const gripC = shC.querySelector('.wg-bar-grip');
function fireC(t, type, p) {
  const e = new wC.Event(type, { bubbles: true, cancelable: true });
  Object.assign(e, p || {});
  t.dispatchEvent(e);
}
ok('grip element exists', !!gripC);
ok('bar open with a mouse', barC.style.display !== 'none');
ok('grip hidden with a mouse', gripC && gripC.style.display === 'none');
fireC(wC, 'pointermove', { clientX: 300, clientY: 300, pointerType: 'touch' });
ok('switching to touch collapses the bar', barC.style.display === 'none');
ok('grip visible on touch', gripC && gripC.style.display !== 'none');
fireC(gripC, 'click', {});
ok('tapping the grip opens the bar', barC.style.display !== 'none');
fireC(wC, 'pointermove', { clientX: 300, clientY: 300, pointerType: 'mouse' });
ok('switching back to mouse reopens the bar', barC.style.display !== 'none');

console.log('29) barOpen survives a persistence roundtrip');
wC.WebGuides.addVertical(200); // force a save()
const storeC = JSON.parse(wC.localStorage.getItem('rulersnx:example.com'));
ok('barOpen persisted', storeC.barOpen === true);
const domD = freshDom();
const wD = domD.window;
wD.localStorage.setItem('rulersnx:example.com', JSON.stringify({
  color: '#ff00ff', rulerMode: 'auto', shapeType: 'rect',
  barOpen: false, guides: [], shapes: []
}));
boot(wD);
wD.WebGuides.activate();
const shD = wD.document.getElementById('rulersnx-host').shadowRoot;
ok('restored barOpen=false keeps the bar closed', shD.querySelector('.wg-toolbar').style.display === 'none');

console.log('30) an old payload without barOpen still loads');
const domE = freshDom();
const wE = domE.window;
wE.localStorage.setItem('rulersnx:example.com', JSON.stringify({
  color: '#ff00ff', rulerMode: 'auto', shapeType: 'rect', guides: [], shapes: []
}));
boot(wE);
wE.WebGuides.activate();
const shE = wE.document.getElementById('rulersnx-host').shadowRoot;
ok('missing barOpen defaults to open with a mouse', shE.querySelector('.wg-toolbar').style.display !== 'none');

console.log('31) a DPR change alone triggers a redraw');
const domF = freshDom();
const wF = domF.window;
Object.defineProperty(wF, 'devicePixelRatio', { value: 1, configurable: true });
boot(wF);
wF.WebGuides.activate();
const shF = wF.document.getElementById('rulersnx-host').shadowRoot;
const cvF = shF.querySelector('.wg-ruler-top canvas');
const widthAt1 = cvF.width;
Object.defineProperty(wF, 'devicePixelRatio', { value: 3, configurable: true });
wF.WebGuides.checkDpr();
ok('canvas backing store grew with the DPR', cvF.width === widthAt1 * 3);
ok('css width stayed the same', cvF.style.width === wF.innerWidth + 'px');

console.log('32) visualViewport is optional');
ok('no visualViewport in jsdom, activate still worked', !!shF.querySelector('.wg-ruler-top'));

console.log('33) a touchscreen laptop driven by a mouse starts in fine mode');
// Real finding from a browser probe: maxTouchPoints was 10 while
// '(pointer: coarse)' was false and '(pointer: fine)' true. Trusting
// maxTouchPoints there would collapse the toolbar on every touchscreen laptop.
function withPointerMedia(coarseMatches, touchPoints) {
  const d = freshDom();
  const w = d.window;
  w.matchMedia = q => ({ matches: /coarse/.test(q) ? coarseMatches : !coarseMatches, media: q });
  Object.defineProperty(w.navigator, 'maxTouchPoints', { value: touchPoints, configurable: true });
  boot(w);
  w.WebGuides.activate();
  return w.document.getElementById('rulersnx-host').classList.contains('wg-coarse');
}
ok('touch hardware + fine primary pointer => fine', withPointerMedia(false, 10) === false);
ok('coarse primary pointer => coarse', withPointerMedia(true, 10) === true);
ok('no touch hardware => fine', withPointerMedia(false, 0) === false);

console.log('34) without matchMedia the engine falls back to maxTouchPoints');
const domG = freshDom();
const wG = domG.window;
delete wG.matchMedia;
Object.defineProperty(wG.navigator, 'maxTouchPoints', { value: 5, configurable: true });
boot(wG);
wG.WebGuides.activate();
ok('fallback used when matchMedia is missing',
  wG.document.getElementById('rulersnx-host').classList.contains('wg-coarse') === true);

console.log('35) inside the extension the state stays out of the visited page');
// A stand-in for browser.storage.local. Its thenable settles synchronously so
// these cases stay in step with the rest of the suite; the engine only ever
// calls .then(ok, err) on what get()/set() return.
function thenable(v) { return { then: function (ok) { ok(v); return thenable(undefined); } }; }
function withExtStorage(seedPage, seedExt) {
  const d = freshDom();
  const w = d.window;
  const mem = Object.assign({}, seedExt || {});
  // Must exist before boot(): the engine picks its backend at load time.
  w.browser = { storage: { local: {
    get: key => thenable(key in mem ? { [key]: mem[key] } : {}),
    set: obj => { Object.assign(mem, obj); return thenable(undefined); }
  } } };
  if (seedPage) w.localStorage.setItem('rulersnx:example.com', JSON.stringify(seedPage));
  boot(w);
  w.WebGuides.activate();
  return { w, mem, shadow: () => w.document.getElementById('rulersnx-host').shadowRoot };
}
const extA = withExtStorage(null, null);
extA.w.WebGuides.addVertical(300);
const savedA = extA.mem['rulersnx:example.com'];
ok('state written to storage.local', !!savedA);
ok('guide landed in storage.local', !!savedA && savedA.guides.length === 1 && savedA.guides[0].p === 300);
ok('page localStorage left untouched', extA.w.localStorage.getItem('rulersnx:example.com') === null);

console.log('36) a 1.1.0 payload is lifted out of the visited site');
const extB = withExtStorage({ color: '#ff0000', guides: [{ o: 'v', p: 111 }], shapes: [] }, null);
ok('legacy guide restored', extB.shadow().querySelectorAll('.wg-guide').length === 1);
ok('legacy key deleted from the page', extB.w.localStorage.getItem('rulersnx:example.com') === null);
ok('legacy payload adopted into storage.local', !!extB.mem['rulersnx:example.com']);
ok('adopted payload kept the colour', extB.mem['rulersnx:example.com'].color === '#ff0000');

console.log('37) storage.local wins over a stale legacy key, which is cleaned up anyway');
const extC = withExtStorage(
  { color: '#ff0000', guides: [{ o: 'v', p: 111 }, { o: 'v', p: 222 }], shapes: [] },
  { 'rulersnx:example.com': { color: '#00ff00', rulerMode: 'auto', shapeType: 'rect', guides: [{ o: 'h', p: 150 }], shapes: [] } }
);
ok('extension state used, not the legacy one', extC.shadow().querySelectorAll('.wg-guide').length === 1);
ok('stale legacy key removed too', extC.w.localStorage.getItem('rulersnx:example.com') === null);
ok('extension state not overwritten', extC.mem['rulersnx:example.com'].color === '#00ff00');

console.log('38) a throwing storage backend never falls through to the page');
const domH = freshDom();
const wH = domH.window;
wH.browser = { storage: { local: {
  get: () => { throw new Error('storage unavailable'); },
  set: () => { throw new Error('storage unavailable'); }
} } };
boot(wH);
wH.WebGuides.activate();
wH.WebGuides.addVertical(300);
ok('activate survived a throwing backend', !!wH.document.getElementById('rulersnx-host'));
ok('guide still drawn', wH.document.getElementById('rulersnx-host').shadowRoot.querySelectorAll('.wg-guide').length === 1);
ok('nothing leaked into the page', wH.localStorage.getItem('rulersnx:example.com') === null);

console.log('scroll) guides and rulers are anchored to the DOCUMENT, not the window');
{
  // Everything is stored in document coordinates, so a guide dropped on an
  // element stays on it while the page scrolls, and the left ruler keeps
  // counting past the fold instead of restarting at 0 on every screen.
  const d = new JSDOM('<!DOCTYPE html><html><body><h1>t</h1></body></html>', {
    url: 'https://example.com/', runScripts: 'outside-only', pretendToBeVisual: true
  });
  const w = d.window;
  let sx = 0, sy = 0;
  Object.defineProperty(w, 'pageXOffset', { get: () => sx, configurable: true });
  Object.defineProperty(w, 'pageYOffset', { get: () => sy, configurable: true });

  // Record every listener the engine registers, so the scroll wiring itself can
  // be asserted — not just the arithmetic behind it.
  const listeners = [];
  const wAdd = w.addEventListener.bind(w);
  const dAdd = w.document.addEventListener.bind(w.document);
  w.addEventListener = (t, f, c) => { listeners.push(['window', t, c]); return wAdd(t, f, c); };
  w.document.addEventListener = (t, f, c) => { listeners.push(['document', t, c]); return dAdd(t, f, c); };

  // requestAnimationFrame refuses a detached call, exactly like the real one.
  // Calling it as a bare variable throws "Illegal invocation", and inside an
  // event handler that throw is invisible — the scroll listener looks dead.
  const frames = [];
  w.requestAnimationFrame = function (cb) {
    if (this !== w) throw new TypeError('Illegal invocation');
    frames.push(cb);
    return frames.length;
  };
  const runFrame = () => { const q = frames.splice(0); q.forEach((f) => f()); };

  const painted = [];
  w.HTMLCanvasElement.prototype.getContext = function () {
    return {
      setTransform() {}, clearRect() {}, beginPath() {}, moveTo() {}, lineTo() {},
      stroke() {}, fillText(t) { painted.push(String(t)); },
      strokeStyle: '', fillStyle: '', font: '', textBaseline: '', lineWidth: 0
    };
  };
  boot(w);
  const E = w.WebGuides;
  E.activate();
  const sh = () => w.document.getElementById('rulersnx-host').shadowRoot;
  const hGuides = () => sh().querySelectorAll('.wg-guide-h');

  // A page scroll fires at the document; a capturing listener on the content
  // script's window proxy never sees it. Measured in Firefox 156.
  const scrollReg = listeners.filter((l) => l[1] === 'scroll' && l[0] === 'document');
  ok('scroll is listened for on the document', scrollReg.length === 1);
  ok('and it captures, so nested scrollers count too', scrollReg[0] && scrollReg[0][2] === true);

  const scroll = (to) => {
    sy = to;
    w.document.dispatchEvent(new w.Event('scroll'));
    runFrame();
  };

  E.addHorizontal(422);
  ok('unscrolled: drawn where it was placed', /translateY\(41[0-9]/.test(hGuides()[0].style.transform));

  scroll(200);
  ok('scrolled 200: the guide travels up with the page',
    /translateY\(21[0-9]/.test(hGuides()[0].style.transform));
  ok('its label still names the same place on the page',
    hGuides()[0].querySelector('.wg-label').textContent === '422 px');
  ok('and it is still on screen', hGuides()[0].style.display !== 'none');

  scroll(900);
  ok('scrolled past it: the guide leaves the window', hGuides()[0].style.display === 'none');

  scroll(0);
  ok('scrolling back brings it right where it was',
    hGuides()[0].style.display !== 'none' && /translateY\(41[0-9]/.test(hGuides()[0].style.transform));

  sx = 500; sy = 500;
  painted.length = 0;
  w.dispatchEvent(new w.Event('resize'));
  ok('ruler labels continue past the fold', painted.indexOf('600') !== -1);
  ok('and reach positions no window is that tall for', painted.indexOf('1200') !== -1);
  ok('neither ruler restarts at 100 on every screen', painted.indexOf('100') === -1);
}

console.log('\n' + pass + ' passed, ' + fail + ' failed');
process.exit(fail ? 1 : 0);
