# Toolbar Localization Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a persistent German/English UI choice to RulerSNX and release it as version 1.4.0.

**Architecture:** Add a dependency-free `src/i18n.js` global with both dictionaries and locale helpers. Load it in the popup and inject it before the toolbar and engine. The popup persists the locale through the existing `storage.local`/`localStorage` fallback and sends a `language` command to the active engine; the engine updates the live toolbar through a `setLanguage` method.

**Tech Stack:** Plain JavaScript, HTML, jsdom tests, Firefox Manifest V3, `web-ext`.

## Global Constraints

- Preserve German as the default for existing and new users.
- Preserve all guide, marker, color, ruler-mode, and toolbar-open state when changing language.
- Keep zero runtime dependencies and no network access.
- Do not add host permissions or change active-tab injection behavior.
- Version `manifest.json` and `package.json` must remain identical at `1.4.0`.

---

### Task 1: Add shared translations and injection support

**Files:**
- Create: `src/i18n.js`
- Modify: `src/exec.js:15-21`
- Modify: `src/popup.html:40-61`
- Test: `test/i18n.test.js`

**Interfaces:**
- `globalThis.RulerSNXI18n.get(locale, key)` returns a translated string and falls back to German.
- `globalThis.RulerSNXI18n.normalize(locale)` returns `de` or `en`.
- `globalThis.RulerSNXI18n.apply(root, locale)` updates elements carrying `data-i18n` and `data-i18n-title`.

- [ ] **Step 1: Write the failing shared dictionary test**

```js
const fs = require('fs');
const vm = require('vm');
const code = fs.readFileSync('src/i18n.js', 'utf8');
const context = { globalThis: {} };
vm.runInNewContext(code, context);
const i18n = context.globalThis.RulerSNXI18n;
if (!i18n || i18n.get('en', 'activate') !== 'Activate') process.exit(1);
if (i18n.get('de', 'activate') !== 'Aktivieren') process.exit(1);
if (i18n.get('xx', 'activate') !== 'Aktivieren') process.exit(1);
console.log('i18n dictionary works');
```

- [ ] **Step 2: Run `node test/i18n.test.js` and verify it fails because `src/i18n.js` is missing.**

- [ ] **Step 3: Implement the dictionary** with keys for popup labels/statuses, toolbar labels/tooltips, and ruler-mode values. `apply()` must set text content only for elements with `data-i18n` and set `title` for `data-i18n-title`.

- [ ] **Step 4: Run `node test/i18n.test.js` and verify it passes.**

- [ ] **Step 5: Load the module in both contexts**: add `/src/i18n.js` as the first `ENGINE` entry in `src/exec.js`, and add `<script src="i18n.js"></script>` before `popup.js` in `src/popup.html`.

- [ ] **Step 6: Run `node test/i18n.test.js` again.**

### Task 2: Localize the injected toolbar and persist locale

**Files:**
- Modify: `src/toolbar.js`
- Modify: `src/guides.js`
- Modify: `test/guides.test.js`

**Interfaces:**
- `RulerSNXToolbar.build(ctx)` receives `ctx.getLanguage()` and exposes `setLanguage(locale)`.
- `WebGuides.setLanguage(locale)` updates the active toolbar and saves the locale.
- `WebGuides.getLanguage()` returns the current normalized locale.
- `src/guides.js` reads `language` from the saved state and writes it in `snapshot()`.

- [ ] **Step 1: Add failing toolbar assertions** after activation in `test/guides.test.js`:

```js
const toolbar = shadow().querySelector('.wg-toolbar');
ok('toolbar starts in German', toolbar.textContent.includes('+ Vertikal'));
W.setLanguage('en');
ok('toolbar switches to English', toolbar.textContent.includes('+ Vertical'));
ok('English tooltip switches too', toolbar.querySelector('.wg-btn').title.includes('vertical'));
ok('language is persisted', JSON.parse(win.localStorage.getItem('rulersnx:example.com')).language === 'en');
```

- [ ] **Step 2: Run `node test/guides.test.js` and verify the new assertions fail because the language API does not exist.**

- [ ] **Step 3: Implement toolbar translation** by building controls with stable translation keys, storing references to text-bearing controls, and reapplying text/title values in `setLanguage()`. Keep symbol-only controls unchanged.

- [ ] **Step 4: Implement engine state**: initialize `language = 'de'`, read `d.language` in `applyState()`, include it in `snapshot()`, pass language callbacks into `RulerSNXToolbar.build()`, and expose `setLanguage()` / `getLanguage()` on `WebGuides`.

- [ ] **Step 5: Run `node test/guides.test.js` and verify all guide, marker, persistence, touch, and localization assertions pass.**

### Task 3: Localize the popup and add language selection

**Files:**
- Modify: `src/popup.html`
- Modify: `src/popup.js`
- Modify: `test/popup.test.js`

**Interfaces:**
- Popup uses `data-i18n` and `data-i18n-title` keys for all visible copy.
- Popup stores locale under `rulersnx:language` through `browser.storage.local` or `localStorage` fallback.
- Popup sends `run('language', locale)` after a selector change.

- [ ] **Step 1: Add failing popup tests** for English rendering and command dispatch:

```js
const t = harness([{ active: false, ready: false }]);
await tick();
t.doc.getElementById('language').value = 'en';
t.doc.getElementById('language').dispatchEvent(new t.win.Event('change'));
await tick();
ok('language command sent', t.calls.some(c => c.cmd === 'language' && c.value === 'en'));
ok('popup button translated', t.doc.getElementById('toggle').textContent === 'Activate');
```

- [ ] **Step 2: Run `node test/popup.test.js` and verify the new assertions fail.**

- [ ] **Step 3: Add a native `<select id="language">` with `Deutsch` and `English` options, mark popup copy with translation keys, and apply the stored locale during startup.**

- [ ] **Step 4: Extend `reflect()` to use the current locale for activation, closed-page, no-tab, engine, and error messages. Add the `change` handler that applies the popup locale and calls `run('language', locale)`.**

- [ ] **Step 5: Extend `applyCommand()` in `src/exec.js` with `case 'language': W.setLanguage(value); break;`.**

- [ ] **Step 6: Run `node test/popup.test.js` and the full existing popup suite; verify German remains the default and English selection persists.**

### Task 4: Version and documentation updates

**Files:**
- Modify: `manifest.json:4`
- Modify: `package.json:3`
- Modify: `README.md`
- Modify: `docs/AMO-SUBMISSION.md`
- Modify: `docs/amo-listing-de.json`
- Modify: `docs/CHROME-SUBMISSION.md`
- Modify: `docs/EDGE-SUBMISSION.md`

- [ ] **Step 1: Update both package versions from `1.3.1` to `1.4.0`.**

- [ ] **Step 2: Update README usage and roadmap text** to document the DE/EN selector and remove the completed English-localization roadmap item.

- [ ] **Step 3: Update AMO listing/reviewer text** so it says the UI supports German and English, and add a version-note entry describing the selector and preserved default.

- [ ] **Step 4: Update Chromium/Edge submission references** from `1.3.1` to `1.4.0` where they describe the current package.

- [ ] **Step 5: Run `rg -n "1\\.3\\.1|interface is in German|English UI / localization" README.md docs manifest.json package.json` and verify no stale release/UI statements remain except historical changelog entries.**

### Task 5: Verify, build, commit, and publish

**Files:**
- Build output: `web-ext-artifacts/rulersnx_ruler_guides-1.4.0.zip`

- [ ] **Step 1: Install dependencies with `npm install` if `node_modules` is absent.**

- [ ] **Step 2: Run `npm test`; expected result is all existing assertions plus localization assertions passing.**

- [ ] **Step 3: Run `npm run lint`; expected result is zero errors and only the repository’s known Android compatibility warning if it remains.**

- [ ] **Step 4: Run `npm run build`; verify `web-ext-artifacts/rulersnx_ruler_guides-1.4.0.zip` exists.**

- [ ] **Step 5: Review `git diff --check`, `git status`, and the package contents.**

- [ ] **Step 6: Commit with `feat: add German and English UI` and push `main` to `origin` using the active `senexsnx` GitHub account.**

- [ ] **Step 7: Attempt the Firefox AMO submission using the verified 1.4.0 package and configured Mozilla credentials. If credentials are unavailable, stop before upload and report the exact missing credential/session; do not claim store publication.**

- [ ] **Step 8: After a successful upload, verify the AMO submission/version status and report the submission URL or review-pending status.**
