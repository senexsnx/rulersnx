# Toolbar Layout and Default Language Design

## Goal

Keep the floating RulerSNX toolbar on one horizontal row and make English the
default language for new or unsaved installations.

## Behavior

- The toolbar uses a wider desktop-sized layout and never wraps its controls.
- The hide-overlay `✕` control stays at the end of the same row.
- Compact spacing is used at narrow widths so the row remains usable without a
  second line or a horizontal scrollbar.
- Existing stored `de`/`en` choices remain authoritative; only the fallback for
  users without a saved choice changes to English.
- Popup copy and the injected toolbar use the same English default.

## Protected invariants

- Existing toolbar actions, labels, tooltips, persistence, and command routing
  remain unchanged apart from layout and default locale.
- German remains selectable and a stored German preference is not overwritten.
- The toolbar remains keyboard/pointer operable and the hide-overlay action stays
  available in the row.

## Verification

- Unit tests assert the English fresh-install default, German preference
  persistence, and non-wrapping/wider toolbar CSS.
- Existing test, lint, and build commands are rerun.
- The generated extension package is inspected for the updated popup and
  injected-toolbar files.
