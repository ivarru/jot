---
id: "0021"
title: "Unify tag insertion and browsing in one dialog"
status: open
type: feature
priority: medium
created: "2026-10-17"
labels: [tags, ui, accessibility, editor]
---

# Unify tag insertion and browsing in one dialog

## Problem and evidence

Add tag and Browse tags now share the cached Tag Catalog but still present separate dialogs, fields, and tag
lists. Users should be able to find a tag, inspect its occurrences, and insert it without changing dialogs.
The user also reports that cancelling either dialog fails to return the caret to the editor. Reproduce that
focus failure in a regression test before implementing its fix; it has not yet been independently reproduced.

## Outcome and scope

Open one unified tag dialog from both the existing Add tag toolbar/keyboard entry point and Browse tags menu
entry point. Merge the tag-name and filter fields. Keep the shared cached catalog, newest-modified-first default,
alphabetical-order toggle, background refresh, and safe navigation to indexed occurrences.

Replace the separate tag list and occurrence pane with expandable tag rows resembling Daily Note search results.
A row presents a styled tag, its index file's last-modified time, and an Add button. The tag styling matches the
current Add tag suggestion chips, but the tag itself is not a separate button. Clicking the rest of the row toggles
that tag's occurrences below it; adding and expanding are separate actions.

Confirmed interaction choices:

- Match tag names by prefix using the existing canonical-name conventions.
- With no row highlighted, Enter adds the field's tag. When a row's Add button has secondary focus, Enter adds
  that row's tag instead.
- A successful Add closes the dialog and returns the caret to the editor after the inserted tag.

This issue changes presentation and interaction, not tag syntax, index serialization, reconciliation semantics,
or the `daily-notes-tag-index` folder. Existing occurrence identities must survive the new display ordering.

## Acceptance criteria

### Shared field and tag rows

- [ ] Both existing entry points open the same dialog and capture the editor's insertion context without losing
  its explicit note date, Markdown snapshot, or selection. The merged field receives initial keyboard focus.
- [ ] One field accepts a tag name and filters the shared catalog by canonical prefix. Creating a new tag remains
  possible when no existing name matches; existing normalization and validation rules still apply.
- [ ] Replace the normal Refresh tags button with Add to the right of the field. Add is disabled for an empty or
  whitespace-only field. Invalid names and unavailable insertion contexts cannot insert a tag either.
- [ ] Matching tags appear as compact, full-width rows similar to search results. Each shows the tag chip, index
  file last-modified time in the user's current time zone (`YYYY-MM-DD HH:mm`), and its own Add button. Handle
  unavailable modification metadata explicitly rather than displaying an invalid date.
- [ ] Clicking a row outside its Add button expands or collapses its occurrences. Multiple tags can be expanded
  independently. The tag chip is part of the row, not a nested button. Provide an accessible expansion control
  and visible expanded/collapsed state without nesting interactive controls illegally.
- [ ] Clicking a row's Add inserts that exact tag, without toggling expansion or navigating to an occurrence.
  Both Add actions close the dialog on success, preserve undo behavior, and place the caret after the insertion.
- [ ] Retain cached rows during asynchronous refreshes. Keep the shared alphabetical toggle and newest-modified-first
  default; sorting or unchanged metadata refreshes must not initiate an insertion, request a toggle-driven refresh,
  or unexpectedly move keyboard secondary focus. Retain loading, empty, offline/error, and retry feedback without
  restoring a normal Refresh tags button or suggestion-dismissal controls.

### Expanded occurrences

- [ ] Show occurrences below their own tag row, lazily loading that tag's index with independent loading/error/retry
  state. Late responses must not expand a collapsed row, overwrite another tag's results, or affect a closed dialog.
- [ ] Display note dates in reverse chronological order (newest first), retaining source occurrence order within
  each date. This is display-only: preserve the original per-date ordinals/context used to resolve repeated tags.
  Do not reverse the entire occurrence array or change the generated index-file ordering.
- [ ] Keep the current formatted, non-navigating excerpts. Activating an occurrence opens its note and targets that
  occurrence in either editor mode, retaining existing missing/ambiguous-target handling.
- [ ] For multiple instances of this tag in the same note, show the first entry's date normally and use a noticeably
  weaker date-text color for subsequent entries of that date. Keep every date visible. Partial foreground alpha
  or a color mixed toward the actual background is acceptable; do not fade the entire row, excerpt, or controls.
  Check the treatment in both light and dark themes.
- [ ] Remove visible instance-number labels such as “Instance 1” and “Instance 2”. Retain accessible differentiation
  where necessary without adding those labels back to the visual layout.

### Keyboard, caret, and fullscreen behavior

- [ ] Tab in the merged field completes to the longest common prefix of all matching canonical tag names. With
  one match, complete its full name. Completion must not insert a tag or expand a row. When there is no extension
  (including no matches), allow normal Tab focus traversal so the field does not trap keyboard users.
- [ ] Up/Down in the field moves a visibly indicated secondary focus through all available Add actions in visual
  order: the field-level Add and the matching rows' Add buttons. Keep actual typing focus in the field, leave its
  query unchanged, and scroll the highlighted action into view. Disabled actions cannot be activated. Moving back
  to the field-level Add restores the default Enter action.
- [ ] Enter normally activates the field-level Add. If a row's Add has secondary focus, Enter activates that row's
  Add instead. Empty/invalid/disabled actions do nothing; Enter must not unexpectedly expand a row or open a note.
- [ ] Changing the query or completing with Tab resets secondary focus to the field-level action. If filtering,
  ordering, or an asynchronous refresh changes the list, track the highlighted action by tag identity where still
  available; otherwise fall back safely to the field-level action. Unchanged refreshes preserve the highlight.
- [ ] Escape closes the dialog and consumes the event without exiting browser fullscreen. This applies while typing,
  navigating Add actions, and interacting with expanded results; opening the dialog must not itself exit fullscreen.
- [ ] Cancelling through Escape, Cancel, or the close control restores focus and the unchanged caret/selection to
  the editor in both WYSIWYG and plain text modes, regardless of which entry point opened the dialog. Do not send
  focus back to the menu or toolbar. A successful insertion restores the new insertion caret; occurrence navigation
  focuses the destination occurrence instead of restoring the old selection.
- [ ] If the selected date, document, or editing ownership changes while the dialog is open, never insert into a date
  inferred after an asynchronous boundary or restore a stale selection into another note. Preserve existing insertion
  safety checks. Browsing remains available when insertion is not allowed, with Add controls disabled and an explanation.

## Verification

Before implementation, reproduce the reported cancellation/caret defect with a failing regression covering each
entry point and both editor modes. Follow the repository's explicit-date and stale-transition requirements.

Use focused tests for prefix filtering/completion (zero, one, and multiple matches), secondary-focus identity,
metadata sorting, date-group reversal with stable occurrence identity, and per-tag asynchronous load cancellation.
Cover an empty field, invalid names, typed new tags, independent expansions, and insertion versus expansion events.

Add real-browser workflows under `tests/browser` that:

- Insert through the field Add, row Add, and Enter with/without a highlighted row; assert exact persisted Markdown,
  undo behavior, destination caret, and that a row Add does not toggle expansion.
- Exercise Tab completion and ordinary Tab traversal, Up/Down highlighting and scrolling, and a background refresh
  while typing or highlighting an Add action.
- Expand multiple tags, verify newest-note-first ordering and repeated-date styling, then open a non-first repeated
  occurrence to prove that display order did not change its navigation target.
- Cancel from both entry points in both editor modes and assert the native selection and subsequent typed text.
- Enter actual browser fullscreen, open the dialog, press Escape, and assert both dialog closure and continued
  fullscreen state. A render-only check or mocked key handler is insufficient for this browser boundary.
- Switch from note A to B during pending index loading or insertion-related work and verify that A's captured
  context cannot modify B or steal its caret. Include read-only/unavailable insertion contexts and mobile layout.

Check light/dark repeated-date contrast and ensure only date text is attenuated. Run `npm run verify:full` before
completion because this work crosses editor selection, navigation, and browser keyboard/fullscreen behavior.
Routine coverage must not require a live Google account.

## Dependencies and related work

Builds on completed local issues [#0019](0019-browse-tag-index-and-open-instances.md) and
[#0020](0020-share-index-backed-tag-catalog.md). Preserve the Tag Catalog contract documented in
[Tags](../docs/tags.md) and [ADR 0012](../docs/adr/0012-shared-index-backed-tag-catalog.md).
No open blocking dependency.

## Resolution

Pending. This issue records the requested design and confirmed interaction choices; no app behavior has changed.
