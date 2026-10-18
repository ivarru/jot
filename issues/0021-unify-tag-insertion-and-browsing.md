---
id: "0021"
title: "Unify tag insertion and browsing in one dialog"
status: closed
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

- [x] Both existing entry points open the same dialog and capture the editor's insertion context without losing
  its explicit note date, Markdown snapshot, or selection. The merged field receives initial keyboard focus.
- [x] One field accepts a tag name and filters the shared catalog by canonical prefix. Creating a new tag remains
  possible when no existing name matches; existing normalization and validation rules still apply.
- [x] Replace the normal Refresh tags button with Add to the right of the field. Add is disabled for an empty or
  whitespace-only field. Invalid names and unavailable insertion contexts cannot insert a tag either.
- [x] Matching tags appear as compact, full-width rows similar to search results. Each shows the tag chip, index
  file last-modified time in the user's current time zone (`YYYY-MM-DD HH:mm`), and its own Add button. Handle
  unavailable modification metadata explicitly rather than displaying an invalid date.
- [x] Clicking a row outside its Add button expands or collapses its occurrences. Multiple tags can be expanded
  independently. The tag chip is part of the row, not a nested button. Provide an accessible expansion control
  and visible expanded/collapsed state without nesting interactive controls illegally.
- [x] Clicking a row's Add inserts that exact tag, without toggling expansion or navigating to an occurrence.
  Both Add actions close the dialog on success, preserve undo behavior, and place the caret after the insertion.
- [x] Retain cached rows during asynchronous refreshes. Keep the shared alphabetical toggle and newest-modified-first
  default; sorting or unchanged metadata refreshes must not initiate an insertion, request a toggle-driven refresh,
  or unexpectedly move keyboard secondary focus. Retain loading, empty, offline/error, and retry feedback without
  restoring a normal Refresh tags button or suggestion-dismissal controls.

### Expanded occurrences

- [x] Show occurrences below their own tag row, lazily loading that tag's index with independent loading/error/retry
  state. Late responses must not expand a collapsed row, overwrite another tag's results, or affect a closed dialog.
- [x] Display note dates in reverse chronological order (newest first), retaining source occurrence order within
  each date. This is display-only: preserve the original per-date ordinals/context used to resolve repeated tags.
  Do not reverse the entire occurrence array or change the generated index-file ordering.
- [x] Keep the current formatted, non-navigating excerpts. Activating an occurrence opens its note and targets that
  occurrence in either editor mode, retaining existing missing/ambiguous-target handling.
- [x] For multiple instances of this tag in the same note, show the first entry's date normally and use a noticeably
  weaker date-text color for subsequent entries of that date. Keep every date visible. Partial foreground alpha
  or a color mixed toward the actual background is acceptable; do not fade the entire row, excerpt, or controls.
  Check the treatment in both light and dark themes.
- [x] Remove visible instance-number labels such as “Instance 1” and “Instance 2”. Retain accessible differentiation
  where necessary without adding those labels back to the visual layout.

### Keyboard, caret, and fullscreen behavior

- [x] Tab in the merged field completes to the longest common prefix of all matching canonical tag names. With
  one match, complete its full name. Completion must not insert a tag or expand a row. When there is no extension
  (including no matches), allow normal Tab focus traversal so the field does not trap keyboard users.
- [x] Up/Down in the field moves a visibly indicated secondary focus through all available Add actions in visual
  order: the field-level Add and the matching rows' Add buttons. Keep actual typing focus in the field, leave its
  query unchanged, and scroll the highlighted action into view. Disabled actions cannot be activated. Moving back
  to the field-level Add restores the default Enter action.
- [x] Enter normally activates the field-level Add. If a row's Add has secondary focus, Enter activates that row's
  Add instead. Empty/invalid/disabled actions do nothing; Enter must not unexpectedly expand a row or open a note.
- [x] Changing the query or completing with Tab resets secondary focus to the field-level action. If filtering,
  ordering, or an asynchronous refresh changes the list, track the highlighted action by tag identity where still
  available; otherwise fall back safely to the field-level action. Unchanged refreshes preserve the highlight.
- [x] Escape closes the dialog and consumes the event without exiting browser fullscreen where the browser permits
  it (see environment-specific fullscreen observations below). This applies while typing,
  navigating Add actions, and interacting with expanded results; opening the dialog must not itself exit fullscreen.
- [x] Cancelling through Escape, Cancel, or the close control restores focus and the unchanged caret/selection to
  the editor in both WYSIWYG and plain text modes, regardless of which entry point opened the dialog. Do not send
  focus back to the menu or toolbar. A successful insertion restores the new insertion caret; occurrence navigation
  focuses the destination occurrence instead of restoring the old selection.
- [x] If the selected date, document, or editing ownership changes while the dialog is open, never insert into a date
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

Implemented the unified Tags dialog with prefix completion, per-tag expandable loads, metadata timestamps,
field/row Add actions, identity-based secondary focus, descending date groups, and attenuated repeated dates.
Both existing entry points capture the same explicitly dated insertion session. Tag restoration applies once,
using a synchronous Milkdown controller selection method or native textarea selection, so delayed callbacks do
not overwrite a user's next selection. Tag toolbar capture no longer queues an obsolete raw-editor focus request.

Reproduced cancellation/caret failure in all four entry-point/editor combinations before changing production
code. A later native test reproduced pending draft loss during direct URL-date changes; a focused route test
also failed before the fix. URL-date transitions now share the existing captured-draft persistence/release
path with ordinary navigation. The route test holds an index load across A-to-B navigation and verifies that
A's pending edit survives while insertion and caret restoration cannot affect B. This route wiring is outside
the bounded sync model's state/events.

Verification: `npm run verify:full` passed 732 unit/integration tests, typecheck, build, and all 146 Chrome
browser checks against the isolated fake-provider preview. After final row-layout/readiness adjustments,
routine verification again passed all 732 tests, typecheck, and build. Final focused browser checks passed all
40 Chrome tag workflows and 25 Firefox workflows, with the single
unsupported fullscreen-preservation check skipped in Firefox. The normal production build also passed, and
the isolated test preview was stopped.

Fullscreen observations: the Chromium DOM-fullscreen test passes with native Keyboard Lock permission.
The automated Firefox DOM-fullscreen experiment consumed Escape before the page received it, while the user
reports that macOS Firefox closes the dialog without leaving fullscreen. The experiment therefore does not
establish a general Firefox limitation; behavior can vary by environment and fullscreen mode. The automated
preservation check remains Chromium-only. The close control is available when an environment intercepts Escape.

Layout follow-up: the Tags dialog is anchored 24px below the viewport top, with bounded height and internal
scrolling. A browser regression reproduced its former vertical movement during filtering before the CSS fix;
the regression also checks that expanding occurrences keeps the top edge fixed.
Follow-up verification: `npm run verify` passed (732 tests, typecheck, build); the unified Firefox suite
passed 29 checks with the documented fullscreen skip, and all three focused Chrome geometry/mobile checks passed.

Further interaction refinements: the toolbar's **Tag** action and its shortcut are now the entry points; the
redundant Browse tags menu item and Cancel action are removed. Refresh status appears inside the title instead
of adding a row. Headings/code blocks redirect insertion into a following paragraph, and links/inline code
redirect it just past the element. These transformations preserve enclosing lists/quotes, the captured note
date, undo, and caret restoration. Earlier references to the menu/Cancel in the original scope are superseded
by these refinements. Coverage includes domain, route, and real-browser insertion cases in both editor modes.

Refinement verification: routine verification passed all 745 tests, typecheck, and build. Chrome coverage
passed 150 checks in the full run and all 34 unified Tags checks in the final focused run, together covering
all 154 browser workflows. Firefox passed 33 unified Tags checks with the documented fullscreen skip.
The new insertion checks assert undo in the editor that performed the insertion before switching to raw mode
for Markdown inspection. Domain cases also cover setext headings, reference links, adjacent inline elements,
unfinished fences, and nested list/quote insertion. The isolated preview was stopped after testing.

Action-label refinement: existing tag rows say **Use**. The field action says **Create** unless its normalized
value exactly matches a cached catalog tag, in which case it says **Use**. Empty/invalid fields stay disabled.
Label verification: `npm run verify` passed all 745 tests, typecheck, and build. Existing component coverage
checks normalized exact matches versus partial prefixes; browser selectors use the revised accessible labels.

Presentation/local-catalog follow-up: hide the field action for empty input, remove introductory help, add search
expansion arrows and tag-row action tooltips, and label tag timestamps Changed with a contextual tooltip. A route
regression reproduced new-tag suggestions missing on immediate reopening before the implementation change.
The catalog now merges remote metadata with explicitly dated current-note snapshots and dirty local drafts;
local and remote refreshes settle independently, with generation guards and sign-out clearing. Occurrences remain
synced-index projections. ADR 0013 supersedes the former index-only suggestion restriction.

Follow-up verification: routine verification passed all 750 tests, typecheck, and build. Focused Chrome coverage
passed search/browsing/index workflows; after the session-local-date refinement, all 39 tag/index checks passed
again, including immediate offline reuse, read-only insertion guards, and stable layout. The local-refresh date
regression holds A's draft read pending across navigation to B, then reopens Tags on B and retains A's suggestion
without modifying either note. No additional browser was run. The isolated preview was stopped after verification.

Review corrections: focused regressions reproduced stale occurrence caches after index metadata changes and
missing reference-style tags in the local overlay before production changes. Rows now invalidate cached and
pending content on index timestamp/presence changes, reloading expanded rows and lazily reloading collapsed
rows. Presence is tracked separately so a local-only tag becoming indexed works even if timestamps coincide.
Local extraction now resolves full/collapsed/shortcut references with normalized identifiers and first-definition
precedence, matching the index extractor. These are projection/presentation issues outside the sync model.
Review-fix verification: all 753 routine tests, typecheck, and build passed. Five focused Chrome workflows
passed, including an offline reference-style tag whose expanded occurrences appear automatically after sync,
local reuse, date-bound insertion guards, and light/dark occurrence layouts. The isolated preview was stopped.
