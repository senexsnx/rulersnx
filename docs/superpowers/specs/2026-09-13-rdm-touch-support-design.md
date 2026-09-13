# RulerSNX in der DevTools-Handy-Ansicht

**Datum:** 2026-09-13
**Status:** freigegeben
**Zielversion:** 1.1.0

## Problem

RulerSNX funktioniert im Firefox Responsive Design Mode (RDM) mit aktivierter Touch-Simulation nicht brauchbar. Die Ursachen zerfallen in zwei Gruppen: echte Defekte, die auch ohne Touch-Simulation auftreten, und Bruchstellen, die erst durch die Touch-Simulation entstehen.

### Gruppe A — unabhängig von Touch

**A1 — Guides gehen beim Breitenwechsel verloren.** `setGuidePos` klemmt die Position mit `Math.max(0, Math.min(pos, max))` und schreibt das Ergebnis destruktiv nach `g.pos` zurück. `onResize` ruft `setGuidePos(g, g.pos)` für jeden Guide. Ein Guide bei x=800 wird beim Umschalten auf 375px zu x=375 und kehrt beim Zurückschalten nicht an seinen Platz zurück.

Derselbe Defekt hat einen **zweiten Weg ohne jedes Resize-Event**: `restore()` ruft `makeGuide(g.o, g.p, false)`, was ebenfalls durch `setGuidePos` läuft und gegen den aktuellen Viewport klemmt. Wer auf dem Desktop speichert und die Seite in der Handy-Ansicht öffnet, hat die Guides bereits beim Laden geklemmt; der nächste `save()` schreibt die verkürzten Werte fest.

**A2 — Toolbar belegt zu viel Fläche.** Zehn Bedienelemente plus Titel und vier Trenner ergeben rund 720px Breite. Bei 375px Viewport greift `max-width:96vw` (=360px), die Leiste bricht auf etwa drei Reihen um und belegt ~110px, also rund 16% eines 375×667-Screens. Mit 44px-Touchflächen wären es ~190px oder 28%.

**A3 — Lineale werden bei DPR-Wechsel unscharf.** `sizeCanvas` liest `window.devicePixelRatio` nur beim Zeichnen. Wird im RDM allein die DPR umgestellt, feuert kein `resize`, und der Canvas behält seine alte Auflösung.

### Gruppe B — nur mit Touch-Simulation

**B1 — Fehlendes `touch-action`.** Ohne `touch-action:none` deutet der Browser das Ziehen eines Guides als Pan, übernimmt die Geste und feuert `pointercancel`. Der Drag stirbt mitten in der Bewegung.

**B2 — `pointercancel` wird nicht behandelt.** Alle vier Drag-Schleifen räumen nur bei `pointerup` auf. Bei `pointercancel` bleiben die Listener auf `document` hängen, und der Guide klebt weiter am Finger.

**B3 — Der `auto`-Modus ist hover-basiert und damit auf Touch tot.** `onAutoHide` hängt an `pointermove`. Ohne Maus gibt es kein Hover, die Lineale erscheinen nie, und man kommt gar nicht erst an einen Guide heran. `auto` ist der Standardmodus.

**B4 — Trefferflächen zu klein.** Die Greifzone eines Guides ist mit `HIT = 11` elf Pixel breit, Toolbar-Buttons sind rund 22px hoch. Empfohlen sind 44px.

## Entscheidungen

| Frage | Entscheidung |
|---|---|
| Nutzungsart | Touch-Simulation aktiv, also Gruppe A **und** B |
| Guides beim Breitenwechsel | Absolute Position bleibt erhalten, außerhalb liegende Guides werden ausgeblendet |
| Lineale auf Touch | Eck-Griff antippen blendet ein und aus |
| Toolbar auf schmal | Einklappbar, zugeklappt nur ein Griff |
| Erkennungsansatz | Adaptiv zur Laufzeit über `pointerType` |
| Pinch-Zoom | `visualViewport` wird berücksichtigt, gekapselt und abschaltbar |

## Architektur

Leitprinzip: **CSS trägt alles Visuelle, JavaScript nur Verhalten.** Ein einziges Laufzeit-Flag `coarse` setzt eine Klasse auf dem Shadow-Container; Größen, Abstände und `touch-action` folgen daraus per Stylesheet.

Sämtliche Änderungen sind additiv und hängen an `coarse`. Solange das Flag `false` ist, verhält sich die Extension bitgenau wie in 1.0.0 — Chrome und Edge auf dem Desktop bleiben unberührt.

### Umgebungserkennung

Primärsignal ist `e.pointerType` jedes eingehenden Pointer-Events:

```js
function notePointer(e) {
  var next = e.pointerType === 'touch';
  if (next !== coarse) { coarse = next; applyCoarse(); }
}
```

Die Regel gegen Flattern lautet: **das Flag folgt immer dem zuletzt gesehenen Pointer-Typ.** Im RDM existiert ohnehin nur ein Typ zur Zeit, und beim Umlegen des Touch-Schalters greift die Umstellung ohne Reload.

Beim Start wird zusätzlich `navigator.maxTouchPoints > 0` und `matchMedia('(pointer: coarse)')` ausgewertet, letzteres hinter einem `typeof window.matchMedia === 'function'`-Guard, weil jsdom es nicht kennt.

`pointerType === 'pen'` zählt bewusst **nicht** als coarse: ein Stift hat Hover und Präzision.

`applyCoarse()` schaltet ausschließlich die Klasse `wg-coarse` auf dem Shadow-Container um und stößt ein Neuzeichnen an.

### Dateien

`guides.js` hat heute 508 Zeilen. Der Toolbar-Code darin ist mit rund 30 Zeilen klein, wächst durch die Einklapp-Logik aber am stärksten und ist ein eigener Zuständigkeitsbereich — daher wird er herausgelöst:

| Datei | Rolle | Zeilen danach |
|---|---|---|
| `src/toolbar.js` | Toolbar bauen, Klappzustand, Button-Zustände | ~180 |
| `src/guides.js` | Engine: Lineale, Guides, Shapes, Eingabe, Persistenz | ~650 |

`guides.js` bleibt damit unter der 800er-Grenze, liegt aber über der angestrebten 200–400er-Spanne. Ein weitergehender Zuschnitt der Engine ist bewusst **nicht** Teil dieser Arbeit: die Datei ist klar nach Zuständigkeiten gegliedert, und ein Umbau ohne Anlass würde das Risiko dieser Änderung unnötig vergrößern.

Die Kopplung läuft über ein explizites Interface statt geteilter Globals:

```js
window.RulerSNXToolbar = { build: function (ctx) { /* ... */ } };
```

`ctx` enthält die Callbacks aus `guides.js` (`addVertical`, `addHorizontal`, `addCross`, `setColor`, `toggleRulers`, `clearAll`, `deactivate`, `setShapeType`, `toggleDraw`) sowie Lesezugriff auf `rulerMode`, `shapeType` und `drawArmed`. Im Manifest wird `toolbar.js` vor `guides.js` gelistet.

## Komponenten

### 1. Guide-Positionen (behebt A1)

Darstellung und Datenhaltung werden getrennt:

| | bisher | neu |
|---|---|---|
| `g.pos` | wird bei jedem Resize geklemmt überschrieben | nur bei echter Nutzerinteraktion geschrieben |
| Darstellung | Nebenwirkung von `setGuidePos` | eigene, rein lesende Funktion `renderGuide(g)` |
| `onResize` | `setGuidePos(g, g.pos)` | `renderGuide(g)` |
| `restore` | `makeGuide` klemmt gegen aktuellen Viewport | übernimmt `pos` unverändert, danach `renderGuide` |

`renderGuide(g)` berechnet `max` aus `window.innerWidth` bzw. `innerHeight`, setzt `display:none` wenn `g.pos < 0 || g.pos > max`, und positioniert sonst per `transform` wie bisher. Ein Guide exakt auf `max` gilt als sichtbar.

`setGuidePos(g, pos)` bleibt für Nutzerinteraktion erhalten und klemmt dort weiterhin — einen Guide soll man nicht aus dem Fenster ziehen können.

### 2. Eck-Griff (behebt B3)

`elCorner` existiert bereits (22×22, Beschriftung „px", Titel „Nullpunkt (0,0)") und ist in `inOurUI` schon erfasst. Es erhält einen `pointerdown`-Handler auf `toggleRulerReveal()`.

Neuer Zustand `revealed` (boolean), der ausschließlich im Modus `auto` wirkt:

- `coarse === false` — Verhalten unverändert, Hover über `onAutoHide`
- `coarse === true` — `onAutoHide` wird übersprungen, `revealed` entscheidet

Notwendige Änderung am Bestand: heute blendet `setRulerVis(false, false)` auch die Ecke aus. Künftig gilt das **nur noch bei `coarse === false`**. Ist `coarse === true`, verschwinden lediglich die beiden Leisten und die Ecke bleibt als Griff stehen — andernfalls gäbe es nichts zum Antippen. Sie wächst dann per CSS auf 44×44.

Diese Fallunterscheidung ist notwendig, damit die Zusage „Desktop verhält sich bitgenau wie 1.0.0" gilt: mit Maus verschwindet im `auto`-Modus weiterhin alles, Ecke eingeschlossen.

Die Modi `on` und `off` bleiben unverändert und haben Vorrang vor `revealed`.

### 3. Einklappbare Toolbar (behebt A2, B4)

Neuer Zustand `barOpen` (boolean), wird mitpersistiert.

- **zugeklappt** — ein 44×44-Griff unten rechts; ein Tap fächert auf
- **aufgeklappt** — Layout wie bisher, im coarse-Modus mit 44px-Trefferflächen und ohne Titelzeile

**Regel für den Zustand**, damit Persistenz und Umgebung sich nicht widersprechen:

1. Beim Laden gilt der persistierte Wert; fehlt er, gilt `!coarse`.
2. **Jeder Wechsel des `coarse`-Flags setzt `barOpen` zwingend auf `!coarse`.** Beim Umschalten in die Touch-Ansicht klappt die Leiste also zu, beim Zurückschalten wieder auf.
3. Danach gewinnt die manuelle Entscheidung des Nutzers — bis zum nächsten Wechsel.

Ohne Regel 2 käme ein auf dem Desktop offen gespeicherter Zustand in der Handy-Ansicht offen zurück, also genau das, was diese Änderung verhindern soll.

### 4. Gesten (behebt B1, B2, B4)

- `touch-action:none` auf `.wg-ruler`, `.wg-guide`, `.wg-shape`, `.wg-toolbar` und `.wg-corner`
- `pointercancel` zusätzlich zu `pointerup` im Cleanup **aller vier** Drag-Schleifen: `beginDrag`, `startMoveShape`, `onDrawPointerDown` und das Ziehen vom Lineal
- `setPointerCapture` beim `pointerdown`, `releasePointerCapture` im Cleanup, beide hinter `typeof`-Guard
- Trefferfläche über die CSS-Variable `--wg-hit`, die `.wg-coarse` auf 44px setzt. Die **sichtbare Linie bleibt 1px**, nur die Greiffläche wächst. `HIT` wird dafür von einer Konstanten zu einem Helper `hit()`, weil das Transform mit dem jeweils aktuellen Wert rechnen muss.

### 5. Schärfe und Pinch-Zoom (behebt A3)

`drawRulers` merkt sich die zuletzt gezeichnete DPR und zeichnet bei Abweichung neu. Wo vorhanden, ergänzt ein `matchMedia('(resolution: Xdppx)')`-Listener das Ganze.

Pinch-Zoom wird in einer einzigen Funktion `syncVisualViewport()` gekapselt: Listener auf `window.visualViewport` für `resize` und `scroll`, die den Host um `offsetLeft`/`offsetTop` verschieben und `scale` gegenrechnen. Vollständig hinter einem Guard auf die Existenz von `visualViewport`; in jsdom passiert damit schlicht nichts. Die Funktion ist bewusst isoliert, damit sie sich mit einer Zeile stilllegen lässt, falls sie sich in der Praxis als störend erweist.

## Persistenz

Der localStorage-Key bleibt `rulersnx:<hostname>`. Das Payload-Format wächst um ein Feld:

```js
{ color, rulerMode, shapeType, barOpen, guides: [{o,p}], shapes: [{t,x,y,w,h}] }
```

`barOpen` folgt dem bereits vorhandenen Migrationsmuster von `showRulers` nach `rulerMode`: fehlt der Schlüssel, greift der Startwert `!coarse`. Alte Payloads bleiben damit ohne Sonderbehandlung lesbar.

`revealed` und `coarse` werden **nicht** persistiert — beides ist Sitzungszustand, der aus der Umgebung folgt.

## Fehlerbehandlung

Alle neuen Browser-APIs werden vor Gebrauch geprüft: `matchMedia`, `visualViewport`, `setPointerCapture`, `releasePointerCapture`. Fehlt eine, entfällt die betreffende Verbesserung, ohne dass Bestandsfunktionalität ausfällt. Das bestehende `try/catch` um `save`/`restore` bleibt unverändert.

Bricht ein Drag per `pointercancel` ab, gilt die letzte gültige Position als Endposition und wird gespeichert — der Guide springt nicht zurück.

## Tests

Acht neue Tests zu den bestehenden 52. Alle sind mit dem vorhandenen `fire3`-Muster umsetzbar, da die Tests Events als `new Event(type)` plus `Object.assign(e, props)` bauen und `pointerType` damit frei setzbar ist.

1. Guide bei 800 überlebt 1440 → 375 → 1440 (Defekt A1, Resize-Pfad)
2. Guide aus Desktop-Payload überlebt `restore()` bei 375px (Defekt A1, Restore-Pfad)
3. Guide außerhalb ist `display:none`, innerhalb sichtbar
4. `pointerType:'touch'` setzt `coarse`, `'mouse'` nimmt es zurück
5. Im coarse-Modus blendet ein Tap auf die Ecke die Lineale ein, ein zweiter aus
6. Im coarse-Modus ändert `pointermove` die Linealsichtbarkeit nicht
7. `pointercancel` räumt die Drag-Listener auf und speichert die letzte Position
8. `barOpen` übersteht einen Persistenz-Roundtrip

Der Test-Bootstrap muss `toolbar.js` zusätzlich laden und einen Helper erhalten, der `innerWidth`/`innerHeight` setzt und ein `resize` feuert.

## Nicht im Scope

- Randmarker, die außerhalb liegende Guides anzeigen
- Pinch-Gesten zum Skalieren oder Verschieben von Guides
- Getrennte Guide-Sätze pro Breakpoint (bewusst verworfen)
- Icon-Redesign der Toolbar
- Verhaltensänderungen für Desktop-Chrome und -Edge

## Auslieferung

Version 1.0.0 auf 1.1.0 in `manifest.json` und `package.json`. `manifest.json` listet `src/toolbar.js` vor `src/guides.js` in `content_scripts`.
