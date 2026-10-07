---
id: "0010"
title: "Open Settings in a modal"
status: closed
type: feature
priority: medium
created: "2026-10-04"
labels: [settings, navigation, accessibility]
---

# Open Settings in a modal

## Problem and evidence

Settings currently opens as a section above the Daily Note in `src/routes/index.tsx`. When a note is long and the
reader is scrolled down, opening Settings does not bring that section into view. It can appear that the Settings
command did nothing, and reaching the controls requires scrolling away from the current place in the note.

## Outcome and scope

Open Settings in a modal that is visible from the current scroll position. Keep the existing settings and their save
behavior. Closing the modal should return the reader to the same place in the note.

## Acceptance criteria

- [x] Opening Settings from the menu shows a modal in the viewport, including when the Daily Note is long and scrolled.
- [x] The existing settings controls and their save behavior remain available in the modal.
- [x] Keyboard users can reach the controls, close the modal with Escape or its close button, and return focus to the
      invoking control.
- [x] Closing Settings preserves the Daily Note's content and scroll position.
- [x] The open modal is identified as a dialog to assistive technology, and background page controls are not
      interactive while it is open.

## Verification

Add a Playwright workflow that opens Settings from a long, scrolled Daily Note, changes a setting, closes the modal,
and checks focus, scroll position, and the saved value. Include keyboard and dialog accessibility assertions. Run
`npm run verify` and the focused browser workflow suite before closure.

## Dependencies and related work

None.

## Resolution

Settings now opens in a native modal dialog. The browser keeps the background inert while it is open, and closing it
returns focus to the menu button. The existing Settings panel and save path remain in use.

Verified with `npm run verify` and `npm run test:browser:workflows` (36 passed). The new Playwright workflow covers a
long scrolled note, dialog accessibility, Escape and close-button focus restoration, unchanged note content and scroll,
and a saved preference after reload. Existing workflows now close Settings before interacting with the background.
