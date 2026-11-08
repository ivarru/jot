---
id: "0039"
title: "Compact inline formatting with strikethrough"
status: closed
type: feature
priority: medium
created: "2026-11-08"
labels: [editor, mobile]
---

# Compact inline formatting with strikethrough

Replace direct inline controls with an Aa popover on narrow screens, containing Bold, Italic, Strikethrough and Inline
code. Retain direct controls on wider screens. Support selections and caret formatting through existing editor paths.
Honor GFM single-tilde input while inserting double tildes. Preserve date-bound snapshots when opening the popover.

## Acceptance criteria

- [x] Compact menu fits a phone and supports pointer, keyboard, Escape and outside dismissal.
- [x] All four formats work in both editor modes with selection retention and undo.
- [x] Date/content changes invalidate pending menu actions before they can affect another note.
- [x] Single-tilde compatibility and double-tilde output are covered.
- [x] Routine verification and focused Chrome editing regressions pass.

## Verification

Implemented in 0.39.0. Aa replaces direct inline controls at widths up to 720px; wider layouts retain direct
buttons, including Strikethrough. Both modes use their existing formatting and undo paths. GFM single/double-tilde
input remains supported; new strikethrough actions emit double tildes. Pointer selection captures now retain the
explicit date, source snapshot, and editor mode; stale clicks are rejected. An open menu also closes on content,
date, mode, write-availability, or viewport changes. The popup is clamped inside the viewport.

`npm run verify` passed: 879 tests, typecheck, production build. All 18 focused Chrome editing cases passed across
the new menu suite and existing inline-code toolbar regressions. Coverage includes all four selected-text formats
and undo in both modes, caret typing with strikethrough, native touch selection at 320px, 360px geometry, keyboard/
Escape/outside dismissal, desktop controls, and date changes while a menu or delayed click is pending.

Phone overflow and a delayed click across date navigation were reproduced with failing browser regressions before
their fixes. A native edit also confirmed single-tilde rendering and double-tilde serialization. Test expectations
account for Milkdown's normal trailing newline. No additional browsers or live accounts were required; no local
servers were left running.
