# Chrome / Chromium submission status — 2026-09-19

The Chromium build is current at version 1.4.0 and is ready for both the Chrome Web
Store and Microsoft Edge Add-ons. The store submissions remain paused while the
publisher verification details are unresolved.

- Google account: snxsolutions1@gmail.com, display name SNX Solutions.
- Publisher ID: c3e0baeb-0cac-4405-801c-7e50dd4e93ec.
- Registration fee completed by the user; dashboard is accessible.
- Trader declaration selected, and marketplace compliance checkbox confirmed with
  explicit user approval. Google then requested publisher verification. The user
  stated that a business registration is not yet available and asked to wait.
- Do not change to non-trader merely to avoid verification. Resume only when the
  user asks, with their accurate self-declaration and available verification data.

## Prepared build

- Run `npm run build:chrome`.
- Upload archive: `chrome-artifacts/rulersnx-chrome-1.4.0.zip`.
- SHA-256: `6B78EFA89C48AD20B1A79020377D68219CE6611B07E234FB69455DEE34184B68`.
- Unpacked output: `dist/chrome`.
- Chrome MV3 classic service worker imports the shared execution helper and keyboard
  shortcut listener synchronously. Shared helper now uses globalThis, compatible
  with both the Firefox event page and Chrome worker.
- No permanent host permissions; activeTab, scripting and storage only.
- `npm test` passes: 124 guide assertions, 25 execution assertions, 18 popup assertions,
  14 persistence assertions and 14 Chrome worker assertions.
- `npm run lint` passes with zero errors; the remaining notices are Firefox manifest/CSP
  compatibility warnings and do not affect the Chromium package.
- Worker tests simulate a context without window/document and repeated worker starts.
  This is not a real installed-Chrome end-to-end test.
- Firefox's already submitted archive is unchanged; SHA-256 remains
  `9ADD90F96BDCAC4A317584906A5E9C8EEC6DD7B8E8CD109B840B9FCCADCD30E6`.

## Store work still requiring account access

Resolve publisher verification; save display name and verify contact email; finalize
Chrome listing copy, permission explanations, privacy disclosures and a public privacy
policy URL; finish store images; inspect/test the Chrome archive, upload and submit.

`demo/store.html` runs the actual guide engine on a layout demo. The Chrome/Edge ZIP is
also attached to the GitHub release so it can be downloaded and tested independently
of either store.
