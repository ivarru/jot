---
id: "0019"
title: "Browse tag indexes and jump to Reference Tag instances"
status: closed
type: feature
priority: medium
created: "2026-10-16"
labels: [tags, navigation]
---

# Browse tag indexes and jump to Reference Tag instances

## Problem and evidence

Per-tag index files make occurrences available across Daily Notes, but users also need an interface for finding a
tag's instances and opening the relevant passage rather than manually locating dates and text.

## Outcome and scope

Provide an accessible interface to choose a Reference Tag, browse its indexed occurrences with ISO dates and context
text, and jump to the corresponding occurrence in its Daily Note. Use the maintained indexes from
[#0018](0018-maintain-tag-index-files.md). Preserve their ascending date and within-note position order, including
multiple instances in one note with identical context text.

The entry point is **Browse tags**, immediately after Search daily notes in the app menu. This issue covers presenting and navigating the index;
creation and maintenance of the Drive files are handled separately by #0018.

## Acceptance criteria

- [x] Users can discover and open the tag-index interface, select a tag, and browse its occurrences.
- [x] Each occurrence shows its ISO note date and extracted context, in the index's defined order.
- [x] Show element-opening excerpts as generated under the configured length limit. Clipped or identical excerpts
      must not be used as unique occurrence identifiers; navigation still targets the original tag instance.
- [x] Present supported inline Markdown from the `.md` indexes consistently with Jot's rendering, keeping each
      occurrence visually distinct. Embedded links must not interfere with the action for opening that occurrence;
      settle and test their interaction behavior during implementation.
- [x] Activating an occurrence opens the correct Daily Note and brings the corresponding tag instance into view.
      Repeated instances within one note remain distinguishable and targetable.
- [x] Navigation uses the existing date-bound editor workflow and preserves pending edits in the previously open
      note. Navigation within the already open note also reaches the selected instance.
- [x] If a note has changed since indexing, resolve against its current content where possible. Handle removed or
      ambiguous instances explicitly rather than silently targeting an unrelated passage; opening the note remains
      possible when an exact occurrence cannot be found.
- [x] Loading, empty indexes, unavailable/stale data, and retry states are understandable. Unsynced editor content
      is not represented as guaranteed indexed content.
- [x] Keyboard operation, focus restoration, narrow screens, and scrolling to the selected occurrence work in the
      supported browsers. User-facing controls avoid exposing storage/provider implementation details.

## Verification

Add focused tests for tag selection, occurrence ordering, repeated contexts, stale locators, and removed instances.
Browser workflows should select an occurrence, assert the resulting date and visible target, and cover both editor
modes, the already open note, and navigation while an earlier date's persistence/sync work is pending. Include mobile
layout and keyboard navigation. Follow repository verification rules with a fake provider for routine coverage.

## Dependencies and related work

Depends on [#0018](0018-maintain-tag-index-files.md) for the maintained indexes and agreed occurrence locator contract.
Related: [#0017](0017-daily-note-drive-search.md) provides date navigation and read-only preview patterns that may be
reused where appropriate. Existing Reference Tag behavior is documented in [Tags](../docs/tags.md).

## Resolution

Implemented for version 0.31.0. The menu opens a filterable tag list and dated occurrence rows, with supported
inline Markdown rendered as safe elements. Excerpt links are styled but non-navigating; row activation opens the
tag instance. Instance numbers distinguish repeated rows within each note. Provider reads do not create folders
or update instruction files, and choose the same canonical duplicate index file as maintenance.

Navigation reuses the date-bound editor workflow, preserving pending drafts and resolving only against the loaded
target date. Current tag/excerpt sequences support ordinal navigation for identical repeats and uniquely matching
context for changed sequences. Missing/ambiguous matches open the note with an explicit notice. Identical instances
with an unchanged count/sequence retain their current order; the plain index format cannot identify an otherwise
undetectable swap. Raw selection scrolling waits for native focus/layout and carries the explicit date/source/range
through its frames, ignoring stale navigation or changed selections. WYSIWYG uses the existing source-selection API.

A browser regression initially reproduced raw-mode selection being correct but remaining scrolled at the note top;
waiting until the editor's focus/resize frame fixes it. Focused Chrome browsing coverage now passes all six workflows,
including phone/desktop WYSIWYG, raw selection geometry, repeated-instance navigation, pending edits, stale matches,
non-navigating excerpt links, retry, and focus restoration. Unit/provider/route checks cover parsing, resolution,
late responses, provider requests, and cancellation of a pending date B target after navigating to C.

Verification: `npm run verify:full` passed (720 unit/integration tests, TypeScript, production build, and all 116
Chrome browser workflows). All six focused browsing workflows also passed in Firefox. No live Google account was
required; authenticated mocked requests cover read-only folder/index discovery, canonical duplicate choice, media
reads, invalid tag names, and missing indexes. These UI navigation guards sit outside the bounded replication model;
the existing replication model and its tests remain unchanged.

### Cached-note review follow-up

Reproduced the reported race with a failing route regression: a clean cached date B lacked the indexed tag, a
pending Drive refresh supplied it, but the early missing-occurrence notice remained after refresh. Navigation now
awaits the existing date-bound clean-refresh barrier before resolving against the latest loaded Markdown Snapshot.
The observer does not initiate a refresh or change replication state, and route cleanup/explicit date checks cancel
superseded navigation. Cached matches also wait, so a tag moved by the remote update is selected at its new offset.

Focused tests cover added/moved tags after a clean-cache refresh and navigation to C while B's cached or uncached
load is pending. A lifecycle test verifies waiting is scoped to the explicit date, completes after refresh, and adds
no remote requests. This UI-target state is outside the bounded sync model, so the regression belongs in route and
focused lifecycle tests rather than a model trace. Native browser cases cover refreshed caches in both editor modes.
Native checks also reproduced selection loss when a refresh completed before WYSIWYG initialization finished.
The controller now exposes its captured document key, and navigation waits until that target editor completes its
initial focus before applying the resolved selection. Focus state commits atomically without rebuilding the editor.
Follow-up verification: all 724 unit/integration tests, TypeScript, and the production build passed. The initial full
browser run had one toolbar-heading failure; all seven focused toolbar workflows then passed, followed by a clean
complete rerun (`npm run test:browser`: 118 passed). All eight tag-browsing workflows passed in Firefox as well.
No toolbar production code was changed.
