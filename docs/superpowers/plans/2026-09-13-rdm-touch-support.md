# RulerSNX Touch- und RDM-Unterstützung — Implementierungsplan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** RulerSNX im Firefox Responsive Design Mode mit Touch-Simulation benutzbar machen, ohne das Desktop-Verhalten zu verändern.

**Architecture:** Ein einziges Laufzeit-Flag `coarse`, gespeist aus `e.pointerType`, setzt die Klasse `wg-coarse` auf dem Shadow-Host. CSS trägt daraufhin alles Visuelle (Trefferflächen, Toolbar-Layout, `touch-action`), JavaScript nur Verhalten (Reveal-Logik, Drag-Abbruch). Guide-Positionen werden von ihrer Darstellung entkoppelt, damit Viewport-Wechsel verlustfrei sind.

**Tech Stack:** Vanilla ES5-JavaScript ohne Laufzeit-Abhängigkeiten, Shadow DOM, Canvas 2D, MV3 Content Scripts. Tests: Node + jsdom, eigenes Mini-Harness in `test/guides.test.js`.

**Spec:** `docs/superpowers/specs/2026-09-13-rdm-touch-support-design.md`
**Branch:** `feature/rdm-touch-support`

## Global Constraints

- **Keine Laufzeit-Abhängigkeiten.** Die Extension bleibt bei null Runtime-Deps. `jsdom` ist und bleibt reine devDependency.
- **ES5-Syntax.** Der Bestand nutzt `var` und `function`. Keine Arrow Functions, kein `let`/`const`, keine Template Literals in `src/`. Tests dürfen modernes JS nutzen.
- **Desktop-Verhalten bleibt bitgenau.** Solange `coarse === false` ist, muss sich die Extension exakt wie 1.0.0 verhalten. Alle 52 Bestandstests müssen durchgehend grün bleiben.
- **Jede neue Browser-API wird geprüft** vor Gebrauch: `matchMedia`, `visualViewport`, `setPointerCapture`, `releasePointerCapture`. Fehlt eine, entfällt nur die betreffende Verbesserung.
- **Konstanten statt Magic Numbers.** Neue Schwellenwerte werden als benannte Konstante oben in der Datei definiert, wie `RULER`, `HIT`, `HIDE_ZONE` es vormachen.
- **Dateigrenze 800 Zeilen.** `src/guides.js` landet bei ~650, `src/toolbar.js` bei ~180.
- **Testkommando:** `npm test`. Erwartete Ausgabe endet auf `N passed, 0 failed`.
- **Commits** enden mit `Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>`.

## File Structure

| Datei | Verantwortung | Status |
|---|---|---|
| `src/guides.js` | Engine: Lineale, Guides, Shapes, Eingabe, Persistenz, Umgebungserkennung | ändern |
| `src/toolbar.js` | Toolbar aufbauen, Klappzustand, Button-Zustände | **neu** (Task 6) |
| `src/content.js` | Bridge Popup ↔ Engine | unverändert |
| `src/popup.js` | Popup-Logik | unverändert |
| `test/guides.test.js` | Gesamtes Test-Harness | erweitern |
| `manifest.json` | Content-Script-Liste, Version | ändern |
| `package.json` | Version | ändern |
| `README.md` | Abschnitt zur Handy-Ansicht | ändern (Task 9) |

**Schnittstelle zwischen `toolbar.js` und `guides.js`:**

```js
window.RulerSNXToolbar = {
  build: function (ctx) { /* → { bar, updateRulerBtn, updateShapeBtns, setOpen, isOpen } */ }
};
```

`ctx` ist ein Objekt aus Callbacks und Gettern, das `guides.js` bereitstellt. Kein Zugriff auf Globals in beide Richtungen.

---

## Task 1: Guide-Position von der Darstellung entkoppeln

Behebt Defekt A1 — den Datenverlust beim Viewport-Wechsel, auf beiden Wegen (Resize und Restore). Unabhängig von allen anderen Tasks.

**Files:**
- Modify: `src/guides.js:278-287` (`setGuidePos`), `src/guides.js:272-274` (Ende von `makeGuide`), `src/guides.js:468-472` (`onResize`)
- Test: `test/guides.test.js` (anhängen vor der Schlusszeile)

**Interfaces:**
- Consumes: nichts
- Produces: `renderGuide(g)` — rein lesende Darstellungsfunktion, schreibt **nie** `g.pos`. Wird ab Task 8 auch von `syncVisualViewport` genutzt.

- [ ] **Step 1: Test-Helper und die drei failing tests anhängen**

In `test/guides.test.js` **vor** der Schlusszeile `console.log('\n' + pass + ...)` einfügen:

```js
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
```

- [ ] **Step 2: Test laufen lassen und Fehlschlag bestätigen**

Run: `npm test`
Expected: FAIL — `guide hidden when outside the viewport` schlägt fehl, weil `onResize` den Guide auf 375 klemmt statt ihn auszublenden; `restored guide reappears at 800` schlägt fehl, weil `restore` bereits beim Laden geklemmt hat.

- [ ] **Step 3: `setGuidePos` aufteilen**

In `src/guides.js` die Funktion `setGuidePos` vollständig ersetzen durch:

```js
  // Render only — never writes g.pos. A guide outside the current viewport is
  // hidden but keeps its position, so switching viewport widths is lossless.
  function renderGuide(g) {
    var max = g.orient === 'v' ? window.innerWidth : window.innerHeight;
    var visible = g.pos >= 0 && g.pos <= max;
    g.wrap.style.display = visible ? '' : 'none';
    if (!visible) return;
    g.wrap.style.transform = g.orient === 'v'
      ? 'translateX(' + (g.pos - HIT / 2) + 'px)'
      : 'translateY(' + (g.pos - HIT / 2) + 'px)';
    g.label.textContent = Math.round(g.pos) + ' px';
  }
  // User interaction only: clamp into the viewport, then render.
  function setGuidePos(g, pos) {
    var max = g.orient === 'v' ? window.innerWidth : window.innerHeight;
    g.pos = Math.max(0, Math.min(pos, max));
    renderGuide(g);
  }
```

- [ ] **Step 4: `makeGuide` auf `renderGuide` umstellen**

In `makeGuide` die Zeile `setGuidePos(g, pos);` ersetzen durch:

```js
    renderGuide(g); // pos is already set on g; restore() must not be clamped
```

- [ ] **Step 5: `onResize` auf `renderGuide` umstellen**

`onResize` vollständig ersetzen durch:

```js
  function onResize() {
    if (!active) return;
    drawRulers();
    guides.forEach(renderGuide);
  }
```

- [ ] **Step 6: Tests laufen lassen**

Run: `npm test`
Expected: PASS — `59 passed, 0 failed`. Die 52 Bestandstests bleiben grün, weil `renderGuide` bei Guides im sichtbaren Bereich dasselbe Transform erzeugt wie bisher.

- [ ] **Step 7: Commit**

```bash
git add src/guides.js test/guides.test.js
git commit -m "fix: Guide-Positionen beim Viewport-Wechsel erhalten

setGuidePos hat die geklemmte Position destruktiv nach g.pos
zurueckgeschrieben. Bei Resize und bei restore() gingen dadurch
Guides ausserhalb des Viewports dauerhaft verloren.

Darstellung ist jetzt in renderGuide getrennt und rein lesend;
g.pos wird nur noch bei echter Nutzerinteraktion geschrieben.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

## Task 2: Umgebungserkennung über `pointerType`

Führt das `coarse`-Flag ein. Basis für Task 3, 4, 5 und 7. Ändert für sich genommen noch kein sichtbares Verhalten.

**Files:**
- Modify: `src/guides.js` (Konstanten- und Variablenblock oben, `build()`)
- Test: `test/guides.test.js`

**Interfaces:**
- Consumes: nichts
- Produces: `coarse` (Modulvariable, boolean) · `notePointer(e)` · `applyCoarse()` · Klasse `wg-coarse` auf dem Host-Element

- [ ] **Step 1: Failing test anhängen**

```js
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
```

- [ ] **Step 2: Test laufen lassen und Fehlschlag bestätigen**

Run: `npm test`
Expected: FAIL — `touch pointer switches to coarse`, weil weder das Flag noch die Klasse existiert.

- [ ] **Step 3: Flag und Erkennung implementieren**

Im Variablenblock oben in `src/guides.js`, direkt nach `var selected = null;`, ergänzen:

```js
  var coarse = false;         // true while the last pointer seen was a finger
```

Direkt nach der Funktion `make(...)` im Helper-Block einfügen:

```js
  // ---------- pointer environment ----------
  // The flag always follows the most recently seen pointer type. In the
  // devtools' responsive mode only one type exists at a time, so flipping the
  // touch switch takes effect without a reload. A pen is NOT coarse — it has
  // hover and precision.
  function notePointer(e) {
    if (!e || typeof e.pointerType !== 'string') return;
    var next = e.pointerType === 'touch';
    if (next === coarse) return;
    coarse = next;
    applyCoarse();
  }
  function detectCoarse() {
    try {
      if (typeof window.matchMedia === 'function' &&
          window.matchMedia('(pointer: coarse)').matches) return true;
    } catch (e) {}
    return (window.navigator && window.navigator.maxTouchPoints || 0) > 0;
  }
  // CSS carries every visual consequence of the flag; JS only flips it.
  function applyCoarse() {
    if (!host) return;
    if (coarse) host.classList.add('wg-coarse');
    else host.classList.remove('wg-coarse');
    applyRulerVisibility();
    drawRulers();
  }
```

- [ ] **Step 4: In `build()` verdrahten**

In `build()` die Listener-Registrierung so ergänzen, dass `notePointer` **als erstes** hängt — dann ist das Flag aktuell, wenn die übrigen Capture-Listener laufen:

```js
    window.addEventListener('pointerdown', notePointer, true);
    window.addEventListener('pointermove', notePointer, true);
    elTop.addEventListener('pointerdown', function (e) { startCreate(e, 'h'); });
```

Und am Ende von `build()`, nach der letzten Listener-Zeile:

```js
    coarse = detectCoarse();
    applyCoarse();
```

- [ ] **Step 5: Tests laufen lassen**

Run: `npm test`
Expected: PASS — `64 passed, 0 failed`.

- [ ] **Step 6: Commit**

```bash
git add src/guides.js test/guides.test.js
git commit -m "feat: coarse-Flag aus pointerType ableiten

Setzt die Klasse wg-coarse auf dem Shadow-Host, sobald der zuletzt
gesehene Pointer ein Finger war. Grundlage fuer Trefferflaechen,
Reveal-Griff und Toolbar-Verhalten. Noch ohne sichtbare Wirkung.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

## Task 3: Eck-Griff als Reveal auf Touch

Behebt Defekt B3 — den hover-basierten `auto`-Modus. Baut auf Task 2 auf.

**Files:**
- Modify: `src/guides.js` — `onAutoHide`, `setRulerVis`, `applyRulerVisibility`, `build()`
- Test: `test/guides.test.js`

**Interfaces:**
- Consumes: `coarse` aus Task 2
- Produces: `revealed` (Modulvariable, boolean) · `toggleRulerReveal()`

- [ ] **Step 1: Failing tests anhängen**

```js
console.log('22) on touch the corner grip reveals the rulers, hover does not');
const dom8 = freshDom();
const w8 = dom8.window;
w8.eval(code);
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
w9.eval(code);
w9.WebGuides.activate();
const sh9 = w9.document.getElementById('rulersnx-host').shadowRoot;
ok('corner hidden with mouse in auto mode', sh9.querySelector('.wg-corner').style.display === 'none');
```

- [ ] **Step 2: Test laufen lassen und Fehlschlag bestätigen**

Run: `npm test`
Expected: FAIL — `corner stays as the grip on touch`, weil `setRulerVis(false,false)` die Ecke bislang unbedingt ausblendet.

- [ ] **Step 3: `revealed` einführen und die drei Funktionen anpassen**

Im Variablenblock nach `var coarse = false;` ergänzen:

```js
  var revealed = false;       // coarse mode: rulers pulled in via the corner grip
```

`onAutoHide` ersetzen durch:

```js
  function onAutoHide(e) {
    if (!active || rulerMode !== 'auto' || dragActive) return;
    if (coarse) return; // no hover on touch — the corner grip decides instead
    var top = topShown, left = leftShown;
    if (e.clientY < RULER) top = true; else if (e.clientY > HIDE_ZONE) top = false;
    if (e.clientX < RULER) left = true; else if (e.clientX > HIDE_ZONE) left = false;
    if (top !== topShown || left !== leftShown) setRulerVis(top, left);
  }
```

`setRulerVis` ersetzen durch:

```js
  function setRulerVis(top, left) {
    topShown = top; leftShown = left;
    elTop.style.display = top ? '' : 'none';
    elLeft.style.display = left ? '' : 'none';
    // On touch the corner remains as the reveal grip — otherwise there would be
    // nothing left to tap. With a mouse it hides along with the rulers, exactly
    // as in 1.0.0.
    elCorner.style.display = (top || left || coarse) ? '' : 'none';
  }
```

`applyRulerVisibility` ersetzen durch:

```js
  function applyRulerVisibility() {
    // 'on' => both visible; 'off' => both hidden; 'auto' => hover (mouse) or
    // the corner grip (touch) decides.
    if (rulerMode === 'on') { setRulerVis(true, true); return; }
    if (rulerMode === 'off') { setRulerVis(false, false); return; }
    var show = coarse && revealed;
    setRulerVis(show, show);
  }
  function toggleRulerReveal() {
    revealed = !revealed;
    applyRulerVisibility();
    if (revealed) drawRulers();
  }
```

- [ ] **Step 4: Eck-Griff verdrahten**

In `build()`, direkt nach der `elLeft.addEventListener(...)`-Zeile:

```js
    elCorner.addEventListener('pointerdown', function (e) {
      if (!coarse) return; // with a mouse the corner keeps its 1.0.0 role
      e.preventDefault();
      e.stopPropagation();
      toggleRulerReveal();
    });
```

- [ ] **Step 5: Tests laufen lassen**

Run: `npm test`
Expected: PASS — `71 passed, 0 failed`. Test 12 und 13 (Bestand) bleiben grün, weil dort nie ein `pointerType` gesetzt wird und `coarse` damit `false` bleibt.

- [ ] **Step 6: Commit**

```bash
git add src/guides.js test/guides.test.js
git commit -m "feat: Eck-Griff blendet die Lineale auf Touch ein

Der auto-Modus haengt an pointermove und ist ohne Maus tot. Auf Touch
uebernimmt jetzt die ohnehin vorhandene Ecke das Ein- und Ausblenden;
sie bleibt dafuer als Griff stehen. Mit Maus bleibt alles wie in 1.0.0.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

## Task 4: Drag-Abbruch und `touch-action`

Behebt B1 und B2. Unabhängig von Task 2 und 3 — `touch-action` ist reines CSS, `pointercancel` reines Verhalten.

**Files:**
- Modify: `src/guides.js` — `baseCSS()`, `beginDrag`, `startMoveShape`, `onDrawPointerDown`
- Test: `test/guides.test.js`

**Interfaces:**
- Consumes: nichts
- Produces: `dragLoop(move, done, el, pointerId)` — gemeinsame Drag-Schleife. `done(ev, cancelled)` wird genau einmal aufgerufen.

- [ ] **Step 1: Failing tests anhängen**

```js
console.log('24) pointercancel ends a drag cleanly and keeps the guide');
const domA = freshDom();
const wA = domA.window;
wA.eval(code);
wA.WebGuides.activate();
wA.WebGuides.addVertical(500);
const shA = wA.document.getElementById('rulersnx-host').shadowRoot;
function fireA(t, type, p) {
  const e = new wA.Event(type, { bubbles: true, cancelable: true });
  Object.assign(e, p || {});
  t.dispatchEvent(e);
}
const gA = shA.querySelector('.wg-guide');
fireA(gA, 'pointerdown', { clientX: 500, clientY: 300, pointerId: 20, pointerType: 'touch' });
fireA(wA.document, 'pointermove', { clientX: 640, clientY: 300, pointerType: 'touch' });
fireA(wA.document, 'pointercancel', { clientX: 640, clientY: 300, pointerType: 'touch' });
ok('guide survives a cancelled drag', shA.querySelectorAll('.wg-guide').length === 1);
ok('guide keeps its last position', gA.style.transform === 'translateX(634.5px)');
fireA(wA.document, 'pointermove', { clientX: 900, clientY: 300, pointerType: 'touch' });
ok('cancel detached the move listener', gA.style.transform === 'translateX(634.5px)');
const storeA = JSON.parse(wA.localStorage.getItem('rulersnx:example.com'));
ok('cancelled drag persisted the last position', storeA.guides[0].p === 640);

console.log('25) a cancelled drag never deletes the guide, even over the ruler');
wA.WebGuides.addVertical(400);
const gA2 = Array.from(shA.querySelectorAll('.wg-guide'))
  .find(el => el.style.transform === 'translateX(394.5px)');
fireA(gA2, 'pointerdown', { clientX: 400, clientY: 300, pointerId: 21, pointerType: 'touch' });
fireA(wA.document, 'pointermove', { clientX: 4, clientY: 300, pointerType: 'touch' });
const countA = shA.querySelectorAll('.wg-guide').length;
fireA(wA.document, 'pointercancel', { clientX: 4, clientY: 300, pointerType: 'touch' });
ok('cancel over the ruler does not delete', shA.querySelectorAll('.wg-guide').length === countA);

console.log('26) draggable surfaces opt out of browser panning');
ok('stylesheet sets touch-action none', /touch-action:\s*none/.test(shA.querySelector('style').textContent));
```

- [ ] **Step 2: Test laufen lassen und Fehlschlag bestätigen**

Run: `npm test`
Expected: FAIL — `cancel detached the move listener`, weil `pointercancel` heute nirgends behandelt wird und der `pointermove`-Listener hängen bleibt.

- [ ] **Step 3: Gemeinsame Drag-Schleife einführen**

In `src/guides.js` direkt vor `// ---------- dragging ----------` einfügen:

```js
  // One drag loop for guides, shapes and marker drawing. Survives pointercancel,
  // which the browser fires when it takes a touch gesture over for panning.
  // done(ev, cancelled) runs exactly once.
  function dragLoop(move, done, el, pointerId) {
    function finish(ev, cancelled) {
      document.removeEventListener('pointermove', move, true);
      document.removeEventListener('pointerup', up, true);
      document.removeEventListener('pointercancel', cancel, true);
      if (el && pointerId != null && typeof el.releasePointerCapture === 'function') {
        try { el.releasePointerCapture(pointerId); } catch (e) {}
      }
      done(ev, cancelled);
    }
    function up(ev) { finish(ev, false); }
    function cancel(ev) { finish(ev, true); }
    document.addEventListener('pointermove', move, true);
    document.addEventListener('pointerup', up, true);
    document.addEventListener('pointercancel', cancel, true);
    if (el && pointerId != null && typeof el.setPointerCapture === 'function') {
      try { el.setPointerCapture(pointerId); } catch (e) {}
    }
  }
```

- [ ] **Step 4: `beginDrag` auf `dragLoop` umstellen**

`beginDrag` vollständig ersetzen durch:

```js
  function beginDrag(orient, g, el, pointerId) {
    dragActive = true; // keep rulers visible while pulling/moving a guide
    showLabel(g, true);
    var startC = null, moved = false;
    function move(ev) {
      var c = orient === 'v' ? ev.clientX : ev.clientY;
      if (startC === null) startC = c;
      if (Math.abs(c - startC) > 3) moved = true;
      setGuidePos(g, c);
    }
    function done(ev, cancelled) {
      dragActive = false;
      // A cancelled drag must never delete: the last valid position stands.
      var onRuler = !cancelled &&
        (orient === 'v' ? ev.clientX < RULER : ev.clientY < RULER);
      if (onRuler) { removeGuide(g); return; }
      save();
      selectItem(g);
      if (!cancelled) onAutoHide(ev);
    }
    dragLoop(move, done, el, pointerId);
  }
```

- [ ] **Step 5: Die drei Aufrufer von `beginDrag` mit Element und Pointer-Id versorgen**

`startCreate` ersetzen durch:

```js
  function startCreate(e, orient) {
    e.preventDefault();
    var g = makeGuide(orient, orient === 'v' ? e.clientX : e.clientY, false);
    beginDrag(orient, g, e.currentTarget, e.pointerId);
  }
```

`startMove` ersetzen durch:

```js
  function startMove(e, g) {
    e.preventDefault();
    e.stopPropagation();
    beginDrag(g.orient, g, g.wrap, e.pointerId);
  }
```

- [ ] **Step 6: `startMoveShape` auf `dragLoop` umstellen**

`startMoveShape` vollständig ersetzen durch:

```js
  function startMoveShape(e, s) {
    e.preventDefault(); e.stopPropagation();
    var ox = e.clientX - s.x, oy = e.clientY - s.y;
    function move(ev) { setShapeRect(s, ev.clientX - ox, ev.clientY - oy, s.w, s.h); }
    function done() { save(); selectItem(s); }
    dragLoop(move, done, s.el, e.pointerId);
  }
```

- [ ] **Step 7: `onDrawPointerDown` auf `dragLoop` umstellen**

Im Rumpf von `onDrawPointerDown` den Block ab `function up(ev) {` bis zur letzten `document.addEventListener('pointerup', up, true);` ersetzen durch:

```js
    function done(ev, cancelled) {
      if (s) { save(); selectItem(s); }
      if (cancelled) return;
    }
    dragLoop(move, done, e.currentTarget, e.pointerId);
```

- [ ] **Step 8: `touch-action` ins Stylesheet**

In `baseCSS()` die `.wg-layer`-Zeile unverändert lassen und direkt danach einfügen:

```js
      '.wg-ruler,.wg-guide,.wg-shape,.wg-toolbar,.wg-corner{touch-action:none}' +
```

- [ ] **Step 9: Tests laufen lassen**

Run: `npm test`
Expected: PASS — `77 passed, 0 failed`.

- [ ] **Step 10: Commit**

```bash
git add src/guides.js test/guides.test.js
git commit -m "fix: Drag-Abbruch durch pointercancel sauber behandeln

Bei uebernommenen Touch-Gesten feuert der Browser pointercancel. Die
vier Drag-Schleifen haben nur auf pointerup aufgeraeumt, ihre Listener
blieben haengen und der Guide klebte am Finger.

Alle vier laufen jetzt ueber eine gemeinsame dragLoop-Funktion mit
Pointer-Capture. Ein abgebrochener Drag loescht nie, auch nicht ueber
dem Lineal. touch-action:none nimmt dem Browser das Panning.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

## Task 5: Trefferflächen auf Touch vergrößern

Behebt B4. Baut auf Task 2 auf. Die sichtbare Linie bleibt 1px — nur die Greiffläche wächst.

**Files:**
- Modify: `src/guides.js` — Konstanten, `baseCSS()`, `makeGuide`, `renderGuide`, `applyGuideSel`
- Test: `test/guides.test.js`

**Interfaces:**
- Consumes: `coarse` aus Task 2
- Produces: `hit()` — liefert die aktuelle Greifbreite in px. Ersetzt jede direkte Nutzung von `HIT`.

- [ ] **Step 1: Failing test anhängen**

```js
console.log('27) grab zone grows on touch, the visible line does not');
const domB = freshDom();
const wB = domB.window;
wB.eval(code);
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
```

- [ ] **Step 2: Test laufen lassen und Fehlschlag bestätigen**

Run: `npm test`
Expected: FAIL — `coarse mode offsets by 44/2`, weil `HIT` eine feste Konstante ist.

- [ ] **Step 3: Konstante und Helper**

Die Zeile `var HIT = 11;` ersetzen durch:

```js
  var HIT = 11;               // guide grab-strip thickness in px (mouse)
  var HIT_COARSE = 44;        // guide grab-strip thickness in px (finger)
```

Direkt nach `function detectCoarse()` einfügen:

```js
  // Current grab width. The visible line stays 1px either way — only the
  // invisible strip you can grab gets wider.
  function hit() { return coarse ? HIT_COARSE : HIT; }
```

- [ ] **Step 4: Stylesheet auf die Variable umstellen**

In `baseCSS()` die `:host{all:initial}`-Zeile ersetzen durch:

```js
      ':host{all:initial;--wg-hit:' + HIT + 'px}' +
      ':host(.wg-coarse){--wg-hit:' + HIT_COARSE + 'px}' +
      ':host(.wg-coarse) .wg-corner{width:' + HIT_COARSE + 'px;height:' + HIT_COARSE + 'px}' +
```

- [ ] **Step 5: `makeGuide` auf `hit()` umstellen**

In `makeGuide` die beiden `css(wrap, ...)`-Zweige und die `css(line, ...)`-Zweige ersetzen durch:

```js
    if (orient === 'v') css(wrap, Object.assign(base, { top: '0', bottom: '0', left: '0', width: 'var(--wg-hit)', cursor: 'ew-resize' }));
    else css(wrap, Object.assign(base, { left: '0', right: '0', top: '0', height: 'var(--wg-hit)', cursor: 'ns-resize' }));

    var line = make();
    if (orient === 'v') css(line, { position: 'absolute', top: '0', bottom: '0', left: 'calc(var(--wg-hit) / 2)', width: '1px', background: color });
    else css(line, { position: 'absolute', left: '0', right: '0', top: 'calc(var(--wg-hit) / 2)', height: '1px', background: color });
```

Und die beiden Label-Positionen:

```js
    if (orient === 'v') css(label, { top: (RULER + 2) + 'px', left: 'calc(var(--wg-hit) / 2 + 3px)' });
    else css(label, { left: (RULER + 2) + 'px', top: 'calc(var(--wg-hit) / 2 + 3px)' });
```

- [ ] **Step 6: `renderGuide` und `applyGuideSel` auf `hit()` umstellen**

In `renderGuide` die beiden Transform-Zeilen ersetzen durch:

```js
    g.wrap.style.transform = g.orient === 'v'
      ? 'translateX(' + (g.pos - hit() / 2) + 'px)'
      : 'translateY(' + (g.pos - hit() / 2) + 'px)';
```

`applyGuideSel` ersetzen durch:

```js
  function applyGuideSel(g, on) {
    if (g.orient === 'v') {
      g.line.style.width = on ? '3px' : '1px';
      g.line.style.left = on ? 'calc(var(--wg-hit) / 2 - 1px)' : 'calc(var(--wg-hit) / 2)';
    } else {
      g.line.style.height = on ? '3px' : '1px';
      g.line.style.top = on ? 'calc(var(--wg-hit) / 2 - 1px)' : 'calc(var(--wg-hit) / 2)';
    }
    g.line.style.boxShadow = on ? '0 0 5px ' + color : 'none';
    showLabel(g, on);
  }
```

- [ ] **Step 7: `applyCoarse` muss die Guides neu positionieren**

In `applyCoarse` die Zeile `drawRulers();` ersetzen durch:

```js
    guides.forEach(renderGuide); // the grab width changed, so the offset did too
    drawRulers();
```

- [ ] **Step 8: Tests laufen lassen**

Run: `npm test`
Expected: PASS — `83 passed, 0 failed`. Die Bestandstests mit `translateX(294.5px)` bleiben grün, weil `hit()` ohne Touch weiterhin 11 liefert.

- [ ] **Step 9: Commit**

```bash
git add src/guides.js test/guides.test.js
git commit -m "feat: Greifflaeche der Guides auf Touch auf 44px

Elf Pixel trifft man mit dem Finger nicht. Die Greifbreite haengt jetzt
an der CSS-Variablen --wg-hit und waechst im coarse-Modus auf 44px,
die sichtbare Linie bleibt bei 1px. Die Ecke waechst mit.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

## Task 6: Toolbar nach `src/toolbar.js` herauslösen

Reiner Refactor ohne Verhaltensänderung. Voraussetzung für Task 7. Alle Tests müssen unverändert grün bleiben.

**Files:**
- Create: `src/toolbar.js`
- Modify: `src/guides.js` — `buildToolbar`, `btn`, `sep` entfernen; `build()`, `activate()`, `setColor`, `toggleRulers`, `setShapeType`, `toggleDraw` auf das Handle umstellen
- Modify: `manifest.json`
- Modify: `test/guides.test.js` — Bootstrap lädt beide Dateien

**Interfaces:**
- Consumes: nichts
- Produces: `window.RulerSNXToolbar.build(ctx)` → `{ bar, updateRulerBtn, updateShapeBtns, setColorValue }`
  - `ctx.addVertical()`, `ctx.addHorizontal()`, `ctx.addCross()`, `ctx.clearAll()`, `ctx.deactivate()`, `ctx.toggleRulers()`, `ctx.setColor(hex)`, `ctx.setShapeType(t)`, `ctx.toggleDraw()`
  - `ctx.getRulerMode()`, `ctx.getShapeType()`, `ctx.getDrawArmed()`, `ctx.getColor()`

- [ ] **Step 1: `src/toolbar.js` anlegen**

```js
/*
 * RulerSNX toolbar — builds the floating control bar and owns its button state.
 * Loaded before guides.js; talks to the engine only through the ctx object it
 * is handed, never through globals.
 */
(function () {
  'use strict';
  if (window.RulerSNXToolbar) return; // guard against double-injection

  function css(el, styles) { for (var k in styles) el.style[k] = styles[k]; return el; }
  function make(tag, styles) { return css(document.createElement(tag || 'div'), styles || {}); }

  function btn(label, title, fn) {
    var b = make(); b.className = 'wg-btn'; b.textContent = label; b.title = title;
    b.addEventListener('click', fn); return b;
  }
  function sep() { var s = make(); s.className = 'wg-sep'; return s; }

  function build(ctx) {
    var bar = make(); bar.className = 'wg-toolbar';
    var title = make(); title.className = 'wg-title'; title.textContent = 'RulerSNX';
    bar.appendChild(title);
    bar.appendChild(btn('+ Vertikal', 'Vertikale Hilfslinie in der Mitte', function () { ctx.addVertical(); }));
    bar.appendChild(btn('+ Horizontal', 'Horizontale Hilfslinie in der Mitte', function () { ctx.addHorizontal(); }));
    bar.appendChild(btn('+ Kreuz', 'Fadenkreuz in der Mitte', function () { ctx.addCross(); }));
    bar.appendChild(sep());

    var colorInput = document.createElement('input');
    colorInput.type = 'color'; colorInput.className = 'wg-color';
    colorInput.value = ctx.getColor(); colorInput.title = 'Farbe der Hilfslinien';
    colorInput.addEventListener('input', function (e) { ctx.setColor(e.target.value); });
    bar.appendChild(colorInput);
    bar.appendChild(sep());

    var rectBtn = btn('▭', 'Rechteck aufziehen (Standard) — Shift+Ziehen auf der Seite', function () { ctx.setShapeType('rect'); });
    var circleBtn = btn('◯', 'Kreis/Ellipse aufziehen — Shift+Ziehen auf der Seite', function () { ctx.setShapeType('circle'); });
    var markBtn = btn('Markieren', 'Markier-Modus an/aus: normales Ziehen zieht eine Form auf (alternativ immer Shift+Ziehen)', function () { ctx.toggleDraw(); });
    bar.appendChild(rectBtn); bar.appendChild(circleBtn); bar.appendChild(markBtn);
    bar.appendChild(sep());

    var rulerBtn = btn('Lineale: Auto', 'Lineale: Auto (nur am Rand) → An (immer) → Aus', function () { ctx.toggleRulers(); });
    bar.appendChild(rulerBtn);
    bar.appendChild(btn('Löschen', 'Alle Hilfslinien löschen', function () { ctx.clearAll(); }));
    bar.appendChild(sep());
    bar.appendChild(btn('✕', 'Ausblenden (Alt+G)', function () { ctx.deactivate(); }));

    function updateRulerBtn() {
      var m = ctx.getRulerMode();
      rulerBtn.textContent = 'Lineale: ' + (m === 'auto' ? 'Auto' : m === 'on' ? 'An' : 'Aus');
    }
    function updateShapeBtns() {
      var t = ctx.getShapeType();
      rectBtn.classList.toggle('wg-on', t === 'rect');
      circleBtn.classList.toggle('wg-on', t === 'circle');
      markBtn.classList.toggle('wg-on', !!ctx.getDrawArmed());
    }
    function setColorValue(hex) { colorInput.value = hex; }

    return {
      bar: bar,
      updateRulerBtn: updateRulerBtn,
      updateShapeBtns: updateShapeBtns,
      setColorValue: setColorValue
    };
  }

  window.RulerSNXToolbar = { build: build };
})();
```

- [ ] **Step 2: Aus `guides.js` entfernen und ersetzen**

`buildToolbar`, `btn`, `sep`, `updateRulerBtn` und `updateShapeBtns` vollständig aus `src/guides.js` löschen. Aus der Variablendeklaration oben `colorInput, rulerBtn, rectBtn, circleBtn, markBtn` entfernen und stattdessen ergänzen:

```js
  var host = null, sroot = null;
  var elTop, elLeft, elCorner, elLayer, elToolbar, cvTop, cvLeft;
  var tb = null;              // handle returned by RulerSNXToolbar.build
```

Neu einfügen, wo `buildToolbar` stand:

```js
  function buildToolbar() {
    tb = window.RulerSNXToolbar.build({
      addVertical: function () { addVertical(); },
      addHorizontal: function () { addHorizontal(); },
      addCross: function () { addCross(); },
      clearAll: clearAll,
      deactivate: deactivate,
      toggleRulers: toggleRulers,
      setColor: setColor,
      setShapeType: setShapeType,
      toggleDraw: toggleDraw,
      getRulerMode: function () { return rulerMode; },
      getShapeType: function () { return shapeType; },
      getDrawArmed: function () { return drawArmed; },
      getColor: function () { return color; }
    });
    return tb.bar;
  }
  function updateRulerBtn() { if (tb) tb.updateRulerBtn(); }
  function updateShapeBtns() { if (tb) tb.updateShapeBtns(); }
```

- [ ] **Step 3: `applyColor` und `toggleDraw` anpassen**

In `applyColor` die Schlusszeile `if (colorInput) colorInput.value = color;` ersetzen durch:

```js
    if (tb) tb.setColorValue(color);
```

`toggleDraw` ersetzen durch:

```js
  function toggleDraw() { drawArmed = !drawArmed; updateShapeBtns(); }
```

- [ ] **Step 4: Manifest ergänzen**

In `manifest.json` den `js`-Eintrag unter `content_scripts` ersetzen durch:

```json
      "js": ["src/toolbar.js", "src/guides.js", "src/content.js"],
```

- [ ] **Step 5: Test-Bootstrap beide Dateien laden lassen**

In `test/guides.test.js` nach der `const code = ...`-Zeile ergänzen:

```js
const toolbarCode = fs.readFileSync(path.join(__dirname, '..', 'src', 'toolbar.js'), 'utf8');
```

Und **jede** Stelle, die bisher `X.eval(code)` aufruft, wird zu:

```js
X.eval(toolbarCode); X.eval(code);
```

Betroffen sind die Bootstraps von `win`, `w3`, `dom4.window` sowie alle in Task 1–5 ergänzten (`w5`, `w6`, `w7`, `w8`, `w9`, `wA`, `wB`). Am saubersten über einen Helper direkt nach `toolbarCode`:

```js
function boot(w) { w.eval(toolbarCode); w.eval(code); return w.WebGuides; }
```

- [ ] **Step 6: Tests laufen lassen**

Run: `npm test`
Expected: PASS — `83 passed, 0 failed`. Identische Zahl wie nach Task 5: reiner Refactor, kein neuer Test, keine Regression.

- [ ] **Step 7: Commit**

```bash
git add src/toolbar.js src/guides.js manifest.json test/guides.test.js
git commit -m "refactor: Toolbar nach src/toolbar.js herausloesen

Reiner Umzug ohne Verhaltensaenderung. Die Toolbar waechst durch die
Einklapp-Logik am staerksten und ist ein eigener Zustaendigkeitsbereich.
Kopplung laeuft ueber ein explizites ctx-Objekt statt geteilter Globals.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

## Task 7: Toolbar einklappbar

Behebt A2. Baut auf Task 2 und Task 6 auf.

**Files:**
- Modify: `src/toolbar.js` — Griff, Klappzustand
- Modify: `src/guides.js` — `barOpen`, `save`, `restore`, `applyCoarse`
- Test: `test/guides.test.js`

**Interfaces:**
- Consumes: `coarse` (Task 2), `RulerSNXToolbar.build` (Task 6)
- Produces: `barOpen` (Modulvariable) · `ctx.getBarOpen()`, `ctx.setBarOpen(v)` · Handle erhält zusätzlich `setOpen(v)`

- [ ] **Step 1: Failing tests anhängen**

```js
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
ok('grip hidden with a mouse', gripC.style.display === 'none');
fireC(wC, 'pointermove', { clientX: 300, clientY: 300, pointerType: 'touch' });
ok('switching to touch collapses the bar', barC.style.display === 'none');
ok('grip visible on touch', gripC.style.display !== 'none');
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
```

- [ ] **Step 2: Test laufen lassen und Fehlschlag bestätigen**

Run: `npm test`
Expected: FAIL — `grip element exists`, weil `.wg-bar-grip` noch nicht gebaut wird.

- [ ] **Step 3: Griff und Klapplogik in `toolbar.js`**

In `build(ctx)` direkt vor dem `return`-Block einfügen:

```js
    // Collapsed state: a single grip in the corner. On a narrow touch viewport
    // the full bar would eat roughly a quarter of the screen.
    var grip = make(); grip.className = 'wg-bar-grip';
    grip.textContent = '⁘';
    grip.title = 'RulerSNX einblenden';
    grip.addEventListener('click', function () { ctx.setBarOpen(true); });

    function setOpen(open) {
      bar.style.display = open ? '' : 'none';
      grip.style.display = open ? 'none' : '';
    }
    bar.appendChild(btn('⌄', 'Leiste einklappen', function () { ctx.setBarOpen(false); }));
```

Und den `return`-Block ersetzen durch:

```js
    return {
      bar: bar,
      grip: grip,
      setOpen: setOpen,
      updateRulerBtn: updateRulerBtn,
      updateShapeBtns: updateShapeBtns,
      setColorValue: setColorValue
    };
```

- [ ] **Step 4: Stylesheet für Griff und coarse-Layout**

In `baseCSS()` in `src/guides.js` nach der `.wg-title`-Zeile ergänzen:

```js
      '.wg-bar-grip{position:fixed;right:14px;bottom:14px;width:44px;height:44px;' +
        'display:flex;align-items:center;justify-content:center;border-radius:12px;' +
        'background:rgba(24,24,30,.94);box-shadow:0 4px 18px rgba(0,0,0,.35);color:#eee;' +
        'font:18px/1 "Segoe UI",system-ui,Arial,sans-serif;cursor:pointer;' +
        'pointer-events:auto;z-index:5;touch-action:none}' +
      ':host(.wg-coarse) .wg-btn{min-height:44px;padding:5px 12px}' +
      ':host(.wg-coarse) .wg-color{width:44px;height:44px}' +
      ':host(.wg-coarse) .wg-title{display:none}' +
```

- [ ] **Step 5: `barOpen` in `guides.js` einführen**

Im Variablenblock nach `var revealed = false;` ergänzen:

```js
  var barOpen = true;         // toolbar expanded; collapsed to a grip on touch
```

In `build()` nach `elToolbar = buildToolbar(); sroot.appendChild(elToolbar);` ergänzen:

```js
    sroot.appendChild(tb.grip);
```

`buildToolbar`s ctx-Objekt um zwei Einträge erweitern:

```js
      getBarOpen: function () { return barOpen; },
      setBarOpen: function (v) { barOpen = !!v; if (tb) tb.setOpen(barOpen); save(); },
```

- [ ] **Step 6: Persistenz und die Umschaltregel**

In `save()` das Objekt um ein Feld ergänzen, direkt nach `shapeType: shapeType,`:

```js
        barOpen: barOpen,
```

In `restore()` nach der `if (d.shapeType) shapeType = d.shapeType;`-Zeile ergänzen:

```js
      if (typeof d.barOpen === 'boolean') barOpen = d.barOpen;
```

In `applyCoarse()` vor `applyRulerVisibility();` ergänzen:

```js
    // Every flip of the flag forces the bar to match. Without this, a state
    // saved open on the desktop would come back open on a phone viewport —
    // exactly what this change is meant to prevent.
    barOpen = !coarse;
    if (tb) tb.setOpen(barOpen);
```

In `activate()` nach `updateShapeBtns();` ergänzen:

```js
    if (tb) tb.setOpen(barOpen);
```

- [ ] **Step 7: Tests laufen lassen**

Run: `npm test`
Expected: PASS — `94 passed, 0 failed`.

- [ ] **Step 8: Commit**

```bash
git add src/toolbar.js src/guides.js test/guides.test.js
git commit -m "feat: Toolbar auf Touch einklappbar

Zehn Bedienelemente ergeben rund 720px Breite. Auf 375px bricht das auf
drei Reihen um und belegt mit 44px-Touchflaechen gut ein Viertel des
Schirms. Zugeklappt bleibt ein 44px-Griff unten rechts.

Jeder Wechsel des coarse-Flags erzwingt den passenden Zustand, danach
gewinnt die manuelle Entscheidung bis zum naechsten Wechsel.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

## Task 8: DPR-Schärfe und Pinch-Zoom

Behebt A3 und den in der Spec als experimentell markierten Pinch-Zoom-Teil. Unabhängig von Task 3–7.

**Files:**
- Modify: `src/guides.js` — `drawRulers`, `build()`, neue Funktionen `checkDpr` und `syncVisualViewport`
- Test: `test/guides.test.js`

**Interfaces:**
- Consumes: `renderGuide` (Task 1)
- Produces: `checkDpr()` · `syncVisualViewport()` — beide no-ops, wenn die jeweilige API fehlt

- [ ] **Step 1: Failing test anhängen**

```js
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
```

- [ ] **Step 2: Test laufen lassen und Fehlschlag bestätigen**

Run: `npm test`
Expected: FAIL — `TypeError: wF.WebGuides.checkDpr is not a function`.

- [ ] **Step 3: DPR-Abgleich implementieren**

Im Variablenblock nach `var barOpen = true;` ergänzen:

```js
  var lastDpr = 0;            // DPR the rulers were last drawn at
```

In `drawRulers` direkt nach `if (!ct || !cl) return;` ergänzen:

```js
    lastDpr = window.devicePixelRatio || 1;
```

Direkt nach `drawRulers` einfügen:

```js
  // The devtools let you change the device pixel ratio without resizing, which
  // fires no resize event — the canvas would keep its old resolution.
  function checkDpr() {
    if (!active) return;
    if ((window.devicePixelRatio || 1) !== lastDpr) drawRulers();
  }
```

- [ ] **Step 4: Pinch-Zoom kapseln**

Direkt nach `checkDpr` einfügen:

```js
  // Pinch-zooming moves the visual viewport away from the layout viewport, and
  // position:fixed follows the layout one — the rulers would drift off screen.
  // Entirely optional: without visualViewport this is a no-op. To switch the
  // behaviour off, make this function return immediately.
  function syncVisualViewport() {
    var vv = window.visualViewport;
    if (!vv || !host) return;
    host.style.transformOrigin = '0 0';
    host.style.transform = 'translate(' + vv.offsetLeft + 'px,' + vv.offsetTop + 'px) ' +
      'scale(' + (1 / vv.scale) + ')';
    host.style.width = (vv.width * vv.scale) + 'px';
    host.style.height = (vv.height * vv.scale) + 'px';
  }
```

- [ ] **Step 5: Listener und API verdrahten**

In `build()` nach der `window.addEventListener('resize', onResize, true);`-Zeile ergänzen:

```js
    if (window.visualViewport) {
      window.visualViewport.addEventListener('resize', syncVisualViewport);
      window.visualViewport.addEventListener('scroll', syncVisualViewport);
    }
    if (typeof window.matchMedia === 'function') {
      try {
        var mq = window.matchMedia('(resolution: ' + (window.devicePixelRatio || 1) + 'dppx)');
        if (mq && typeof mq.addEventListener === 'function') mq.addEventListener('change', checkDpr);
      } catch (e) {}
    }
```

In `onResize` nach `drawRulers();` ergänzen:

```js
    syncVisualViewport();
```

Im `window.WebGuides`-Objekt nach `setColor: setColor` ergänzen:

```js
    checkDpr: checkDpr
```

- [ ] **Step 6: Tests laufen lassen**

Run: `npm test`
Expected: PASS — `97 passed, 0 failed`.

- [ ] **Step 7: Commit**

```bash
git add src/guides.js test/guides.test.js
git commit -m "fix: Lineale bei DPR-Wechsel neu zeichnen, Pinch-Zoom folgen

Die Devtools erlauben einen DPR-Wechsel ohne Resize; der Canvas behielt
seine alte Aufloesung. checkDpr gleicht das ab.

syncVisualViewport haelt das Overlay beim Pinch-Zoom am sichtbaren
Ausschnitt. Vollstaendig hinter einem Guard und bewusst isoliert.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

## Task 9: Version, Dokumentation und Abschluss

**Files:**
- Modify: `manifest.json`, `package.json`, `README.md`

**Interfaces:**
- Consumes: alles aus Task 1–8
- Produces: nichts

- [ ] **Step 1: Version anheben**

In `manifest.json`:

```json
  "version": "1.1.0",
```

In `package.json`:

```json
  "version": "1.1.0",
```

- [ ] **Step 2: README um einen Abschnitt ergänzen**

Vor dem Lizenz-Abschnitt in `README.md` einfügen:

```markdown
## Handy-Ansicht in den DevTools

RulerSNX erkennt die Touch-Simulation im Responsive Design Mode selbst und
stellt sich um, sobald der erste Finger-Pointer auftaucht — ohne Reload.

- **Lineale einblenden:** das `px`-Eck oben links antippen. Ohne Maus gibt es
  kein Hover, daher übernimmt der Eck-Griff das Ein- und Ausblenden.
- **Hilfslinien greifen:** die unsichtbare Greifzone wächst von 11px auf 44px,
  die sichtbare Linie bleibt 1px dünn.
- **Toolbar:** klappt auf Touch zu einem Griff unten rechts zusammen und beim
  Zurückschalten auf die Maus wieder auf.
- **Viewport-Wechsel:** Hilfslinien behalten ihre absolute Position. Was
  ausserhalb der aktuellen Breite liegt, wird ausgeblendet und kommt beim
  Zurückschalten unverändert zurück.

Mit Maus verhält sich alles unverändert wie in 1.0.0.
```

- [ ] **Step 3: Volle Testsuite und Abschlussprüfung**

Run: `npm test`
Expected: PASS — `97 passed, 0 failed`.

Run: `node -e "JSON.parse(require('fs').readFileSync('manifest.json','utf8')); console.log('manifest ok')"`
Expected: `manifest ok`

Run: `git status -s`
Expected: leer nach dem Commit in Step 4.

- [ ] **Step 4: Commit**

```bash
git add manifest.json package.json README.md
git commit -m "release: Version 1.1.0

Handy-Ansicht in den DevTools: Touch-Erkennung zur Laufzeit, Eck-Griff
statt Hover, 44px-Greifflaechen, einklappbare Toolbar und verlustfreie
Guide-Positionen beim Viewport-Wechsel.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

- [ ] **Step 5: In Firefox laden und von Hand prüfen**

1. `about:debugging#/runtime/this-firefox` → **Temporäres Add-on laden…** → `manifest.json` wählen
2. `demo/index.html` öffnen, **Alt+G** drücken
3. DevTools öffnen, Responsive Design Mode einschalten, **Touch-Simulation aktivieren** (Hand-Symbol)
4. Prüfen: Toolbar klappt zu · Eck-Tap holt die Lineale · Hilfslinie lässt sich mit der Maus ziehen, ohne dass die Seite pannt · Breitenwechsel von 1440 auf 375 und zurück lässt die Linien überleben

---

## Self-Review

**Spec-Abdeckung:**

| Spec-Anforderung | Task |
|---|---|
| A1 Guide-Verlust, Resize-Pfad | 1 |
| A1 Guide-Verlust, Restore-Pfad | 1 |
| A2 Toolbar-Flächenbedarf | 7 |
| A3 DPR-Unschärfe | 8 |
| B1 `touch-action` | 4 |
| B2 `pointercancel` | 4 |
| B3 hover-basierter auto-Modus | 3 |
| B4 Trefferflächen | 5, 7 |
| Umgebungserkennung über `pointerType` | 2 |
| `pen` zählt nicht als coarse | 2 |
| Toolbar-Extraktion | 6 |
| `barOpen`-Persistenz und Umschaltregel | 7 |
| Alte Payloads ohne `barOpen` | 7 |
| Pinch-Zoom, gekapselt und abschaltbar | 8 |
| Version 1.1.0 | 9 |

Alle acht Tests aus der Spec sind abgedeckt: Spec-Test 1 → Task 1 Test 18, Spec-Test 2 → Test 19, Spec-Test 3 → Test 20, Spec-Test 4 → Test 21, Spec-Test 5 → Test 22, Spec-Test 6 → Test 22, Spec-Test 7 → Test 24, Spec-Test 8 → Test 29.

**Namenskonsistenz geprüft:** `renderGuide` (Task 1, genutzt in 5 und 8) · `coarse`/`applyCoarse` (Task 2, genutzt in 3, 5, 7) · `hit()` (Task 5) · `dragLoop` (Task 4) · `tb` als Toolbar-Handle (Task 6, erweitert in 7) · `ctx.setBarOpen` gegen `tb.setOpen` sauber getrennt.

**Zählstand der Tests:** 52 → 59 (T1) → 64 (T2) → 71 (T3) → 77 (T4) → 83 (T5) → 83 (T6, Refactor) → 94 (T7) → 97 (T8).
