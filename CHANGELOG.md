# Changelog

## 1.3.1 — 2026-09-19

- Limit the Firefox package to desktop Firefox; Firefox for Android is not supported by the current UI.
- Remove the Android compatibility declaration so AMO does not offer this version for mobile.
- Document popup activation and the working Shift+drag marker gesture.

## 1.3.0 — 2026-09-19

- Fix popup activation in Firefox by loading the injection engine from root-absolute paths.
- Surface script-injection failures in the popup instead of silently ignoring clicks.
- Share the injected engine through `globalThis` so popup commands work reliably in Firefox MV3.
- Anchor guides, markers, and ruler labels to document coordinates so they stay aligned while scrolling.
- Add popup regression coverage; the full suite now passes 195 assertions.
- Firefox package validated with `web-ext lint`: 0 errors, 0 warnings, 0 notices.

## 1.2.0 — 2026-09-16

- Activate only when requested from the popup or Alt+G. Removes automatic scripts
  on all websites in favor of temporary activeTab access.
- Store guides, markers and settings in extension-local storage per hostname,
  migrating settings from the previous page-local storage on first use.
- Fix a race where early actions could overwrite saved guides before restoration.
- Register a configurable browser shortcut and explain restricted-page failures.
- Add a dedicated Chrome/Edge MV3 service-worker build with no persistent host access.
- Add regression tests for injection, storage migration, asynchronous restoration,
  and service-worker startup without a DOM. All 157 assertions pass.
- Add Firefox packaging/lint tooling and patch vulnerable development dependencies.

Firefox packages require Firefox 140+ (Android 142+). Chrome builds require Chromium
102+. Android and an installed Chrome extension still require manual verification;
automated tests use jsdom and a simulated worker environment.

Firefox 1.2.0 has been submitted to Mozilla for review. Chrome Web Store publication
is pending; this repository release does not imply Chrome Store approval.
