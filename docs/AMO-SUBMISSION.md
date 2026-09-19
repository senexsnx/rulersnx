# Releasing RulerSNX on addons.mozilla.org

Everything a submission needs, in the order AMO asks for it. The short version:
`npm run verify`, `npm run build`, upload the zip.

---

## 1. Pre-flight

```bash
npm install
npm run verify   # 207 assertions + addons-linter; errors 0, with one expected Android compatibility warning
npm run build    # web-ext-artifacts/rulersnx_ruler_guides-<version>.zip
```

Then walk the add-on once by hand, because the linter cannot:

- [ ] `about:debugging` → `Load Temporary Add-on…` → pick `manifest.json`
- [ ] On a normal website: icon → `Aktivieren`, pull a guide out of each ruler, move it,
      select it, delete it with `Entf`
- [ ] `Shift` + drag draws a marker; `Markieren` arms plain dragging
- [ ] Activate and deactivate through the popup; Alt+G is currently unavailable in Firefox
- [ ] In the popup, switch between `Deutsch` and `English`; reopen it and confirm the choice persists
- [ ] On a tall page: place a horizontal guide on an element, scroll — the guide stays on
      that element and the left ruler keeps counting (1400, not back to 0)
- [ ] Reload the page, switch the overlay on again — the guides are back
- [ ] On `about:support`: the popup shows the "Auf dieser Seite nicht möglich" hint
      instead of a dead button
- [ ] `about:addons` → RulerSNX → Permissions shows no host access

---

## 2. What the reviewer will check, and where it stands

| Point | Status |
|---|---|
| Manifest version | MV3 |
| Host permissions | **none** — no `<all_urls>`, no `host_permissions` |
| Permissions | `activeTab`, `scripting`, `storage` |
| Remote code | none — nothing fetched, no `eval`, no `new Function` |
| Network requests | none at all |
| Minified / bundled code | none, so **no source-code upload is required** |
| Third-party libraries | none at runtime |
| Data collection | declared as `none` in the manifest |
| Linter | `web-ext lint`: 0 errors, 1 expected Android compatibility warning, 0 notices |

The package holds only `manifest.json`, `LICENSE`, `icons/` and `src/` — about 46 KB.
Tests, docs and the demo are excluded through `web-ext-config.cjs`.

---

## 3. Listing fields

**Name:** `RulerSNX — Ruler & Guides`

**Summary** (max 250 characters):

> Illustrator-style ruler and draggable guide lines over any website. Pull magenta guides
> off the rulers to check optical axes, alignment and spacing, or draw a marker around a
> spot to point at it. Rulers auto-hide so they never cover your content.

**Description:**

> RulerSNX puts the ruler-and-guides move from Illustrator or InDesign into the browser.
> Pull a guide off the on-screen ruler and hold it against the layout you are building —
> you are measuring the real rendered page at whatever viewport size you like, mobile
> emulation included.
>
> - Rulers along the top and left edge with a live px scale, drawn on canvas so they stay
>   crisp on HiDPI screens.
> - Drag down from the top ruler for a horizontal guide, right from the left ruler for a
>   vertical one. Guides carry a live px label and are anchored to the page, so a guide
>   you drop on an element stays on it while you scroll.
> - Region markers: draw a rectangle or circle around an area, screenshot it, send it. It
>   saves a paragraph of explaining which element you mean.
> - Rulers auto-hide and only appear when the cursor reaches an edge, so they never cover
>   the page. The scale counts in page coordinates and keeps counting past the fold.
> - Guides, markers and colour are remembered per website and come back the next time you
>   switch the overlay on there.
> - Works with a finger too: larger grab zones and a collapsed toolbar on touch.
>
> How to use it: open any website, click the RulerSNX icon and choose "Aktivieren". Drag a guide out of a ruler. Click a guide and press Entf to delete it.
>
> Privacy: RulerSNX makes no network requests and transmits no data. It uses temporary
> access to the active tab after you click its icon and choose a popup action. There is no
> permanent permission to access all websites. Guides and settings are saved locally,
> grouped by website hostname.
>
> The interface supports German and English; German is the default. Full source: MIT licensed.

**Categories:** Web Development (primary), Appearance
**Tags:** ruler, guides, layout, alignment, web design, developer tools
**Support site / homepage:** the repository URL
**License:** MIT (already in the package)

**Screenshots:** `docs/screenshot-guides.png` and `docs/screenshot-marker.png` are the two
to upload. Give each a caption — reviewers and users both read them.

---

## 4. Data collection declaration

AMO has required this in the manifest for every new extension since 3 November 2025, and
RulerSNX already carries it:

```json
"data_collection_permissions": { "required": ["none"] }
```

In the AMO form, answer the data questions to match: **no** data collected, **no** data
transmitted. A privacy policy is not mandatory when nothing is collected; paste section 5
anyway if you want the field filled.

---

## 5. Privacy policy (paste as-is if you want one on file)

> RulerSNX does not transmit or sell your data. It has no server or user accounts.
>
> The add-on makes no network requests of any kind. It has no analytics and no telemetry,
> and contains no remote or third-party code.
>
> It saves only what you draw — the positions of your guides and markers, the chosen colour
> and the toolbar state — in the browser's local extension storage on your own device,
> under a key per website hostname. This never leaves your computer and is removed when you
> uninstall the add-on.
>
> RulerSNX uses activeTab for temporary access to the tab you choose. It declares no
> permanent host permissions. The drawing engine loads when you choose a popup action.
> It does not read page text or form values. The browser
> controls the lifetime of the temporary tab permission.
>
> Support is available through the developer contact on the add-on listing.

---

## 6. Notes for the reviewer (paste into "Notes to Reviewer")

> RulerSNX is a layout measuring tool: it draws rulers and draggable guide lines on top of
> the page you are looking at.
>
> No build step. The files in the package are the source, unminified and unbundled, with no
> runtime dependencies — nothing needs to be reproduced from a source archive.
>
> There are no host permissions. `src/popup.js` handles the popup buttons and calls
> `RulerSNXExec.run()` in `src/exec.js`,
> which is the single place anything is injected. It uses `scripting.executeScript` against
> the active tab, which is reachable only because the user's popup action just granted
> `activeTab`. The `state` command deliberately injects no files — it only asks
> whether the engine is already present, so merely opening the popup changes nothing.
>
> `src/toolbar.js` and `src/guides.js` are the injected overlay. They render into a Shadow
> DOM, read pointer and keyboard events for dragging, and do not read page content. There is
> no network access, no eval and no remote code anywhere in the add-on.
>
> `storage` holds the user's own guide coordinates and colour, per hostname. Version 1.2.0
> also migrates the equivalent state out of the visited site's localStorage, where versions
> up to 1.1.0 kept it, and deletes it there — that is the `takeLegacy()` call in
> `src/guides.js`.
>
> To try it: open any normal website, click the toolbar icon, press "Aktivieren", then drag
> downwards out of the ruler at the top of the page.

---

## 7. Version notes

### 1.4.0

> - Added a persistent Deutsch/English selector in the popup.
> - Toolbar labels, tooltips, popup controls, and status messages now follow the selected language.
> - German remains the default so existing installations keep their current interface.

### 1.3.0

> - Guides, markers and the ruler scale are anchored to the page instead of the window. A
>   guide you drop on an element now stays on it while you scroll, and the ruler keeps
>   counting in page coordinates instead of restarting at 0 on every screen.
> - Fixed: every popup button did nothing. The engine was injected under a path that only
>   resolved from the background page, so the Alt+G shortcut worked while the popup silently
>   failed. A script that cannot be loaded does not reject the injection call, so the error
>   was never surfaced — it is now.
> - The popup always says why a command did not take effect instead of ignoring clicks.
> - The overlay can no longer stay invisible if the storage read never answers.

Because guide coordinates now mean a position on the page rather than in the window, guides
saved by an earlier version shift once on first use. Worth a line in the version notes on
AMO so nobody reports it as a bug.

### 1.2.0

> - Dropped the `<all_urls>` content script. RulerSNX now runs on a page only when you click
>   its icon or press Alt+G, using `activeTab`, and asks for no access to your websites.
> - Alt+G is now a proper browser shortcut and can be rebound under `about:addons` →
>   `Manage Extension Shortcuts`. It no longer installs a key listener on every page.
> - Guides and settings moved into the add-on's own storage. Earlier versions kept them in
>   each visited site's localStorage, where the site could read them. Existing state is
>   migrated on first use and removed from the site.
> - The popup now says when a page cannot be measured (`about:` pages, the add-on store)
>   instead of showing a button that does nothing.
> - Declares `data_collection_permissions: none`.
> - Waits for saved guides before applying popup changes, preventing data loss on first use.

---

## 8. After upload

Signing usually lands within minutes; a human review can take longer. Keep the exact zip
you uploaded. If a reviewer asks something, answer in the AMO thread rather than by
re-uploading — a new version restarts the queue.
