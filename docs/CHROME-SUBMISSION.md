# Chrome submission status — 2026-09-16

Paused at the user's request while publisher verification is unresolved. No Chrome
item has been uploaded or submitted for review.

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
- Upload archive: `chrome-artifacts/rulersnx-chrome-1.2.0.zip`.
- SHA-256: `1132D5557912AA10817E9D15DBB2267BF8F4091A2814925EFFE6610B28489E7F`.
- Unpacked output: `dist/chrome`.
- Chrome MV3 classic service worker imports the shared execution helper and keyboard
  shortcut listener synchronously. Shared helper now uses globalThis, compatible
  with both the Firefox event page and Chrome worker.
- No permanent host permissions; activeTab, scripting and storage only.
- `npm run verify` passes: 143 existing assertions plus 14 worker assertions;
  Firefox lint has zero errors, warnings or notices.
- Worker tests simulate a context without window/document and repeated worker starts.
  This is not a real installed-Chrome end-to-end test.
- Firefox's already submitted archive is unchanged; SHA-256 remains
  `9ADD90F96BDCAC4A317584906A5E9C8EEC6DD7B8E8CD109B840B9FCCADCD30E6`.

## Remaining work

Resolve publisher verification; save display name and verify contact email; finalize
Chrome listing copy, permission explanations, privacy disclosures and a public privacy
policy URL; finish store images; inspect/test the Chrome archive, upload and submit.

Image work in progress: `demo/store.html` runs the actual guide engine on a layout demo.
`docs/chrome-store/screenshot-guides.png` is a 1280×800 screenshot from that demo, not
an installed-extension test. `docs/chrome-promo.html` is the source for the required
440×280 promotional image; it has not yet been rendered or uploaded.
