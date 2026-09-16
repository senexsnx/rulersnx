# Changelog

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
