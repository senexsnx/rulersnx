# Toolbar Localization Design

**Goal:** Add a user-selectable German/English interface to RulerSNX and release it as version 1.4.0.

## Scope

- Translate every visible label, tooltip, popup status message, and extension command description currently hard-coded in German.
- Add a `Deutsch` / `English` selector to the popup.
- Persist the selected language in extension storage and use German as the migration-safe default for existing installations.
- Apply a language change to an already active toolbar without removing guides, markers, colors, or other saved state.
- Update README, AMO listing data, and release notes to describe both languages.
- Keep the runtime dependency-free and preserve the current Firefox/Chromium packaging model.

## Architecture

Use one small shared translation module exposed as `globalThis.RulerSNXI18n`. The popup loads it directly, and the injected overlay receives the same file before `toolbar.js` and `guides.js`. The module contains the two locale dictionaries and a safe fallback to German for missing keys.

The popup reads and writes the selected locale through the existing extension storage path. It sends a `language` command through `src/exec.js`; `src/guides.js` updates the active toolbar through a `setLanguage` context method. The saved guide/marker snapshot remains unchanged except for a `language` field at the extension-level state, so existing drawing data migrates without loss.

## UI behavior

- Existing users start in German unless they choose English.
- New users also start in German to preserve the current product behavior and AMO screenshots.
- The selector is visible in the popup and uses native labels (`Deutsch`, `English`) so it remains understandable in either locale.
- Toolbar text and tooltips use the selected locale, including ruler mode values (`Auto`, `On`, `Off` in English; `Auto`, `An`, `Aus` in German).
- Switching language does not activate/deactivate the overlay or alter guides, markers, or color.

## Testing and release

- Add focused popup tests for both locales, persisted language selection, and language switching.
- Add toolbar/engine tests proving translated labels and ruler-mode updates.
- Run `npm test`, `npm run lint`, and `npm run build`.
- Bump `manifest.json` and `package.json` to `1.4.0`.
- Update the GitHub branch and release notes using the authenticated `senexsnx` account.
- Submit the generated Firefox package to AMO if the required Mozilla upload credentials/session are available; otherwise retain the verified package and report the exact authentication blocker.

## Non-goals

- No third language, automatic browser-language detection, or redesign of the toolbar.
- No changes to guide geometry, persistence semantics, permissions, or network behavior.
