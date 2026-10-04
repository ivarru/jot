---
id: "0011"
title: "Investigate loss of an empty nested list item during sync"
status: open
type: investigation
priority: high
created: "2026-10-04"
labels: [editor, wysiwyg, lists, sync, data-loss]
---

# Investigate loss of an empty nested list item during sync

## Problem and evidence

The owner observed the last line of a Daily Note disappear while syncing. It was an empty level-2 list item with the
caret in it. The incident occurred in Jot `0.27.0` on 2026-10-04, in WYSIWYG mode with empty-editor-placeholder
normalization enabled. The selected and loaded date were both `2026-10-04`; the browser was online and visible.

The supplied redacted sync diagnostics show frequent editor changes and autosaves near the incident. In particular,
autosave requests at sequences 522 and 525 had the same Markdown fingerprint (`length: 4364`, `hash: 6f6ca90c`),
while the next request at sequence 528 had `length: 4363`, `hash: d3018a4e`, still at editor-change generation 272.
The status reached `synced` at sequence 530. A blur request at sequence 531 used the same fingerprint as sequence 528.

These fingerprints show a changed save snapshot, but do not reveal whether the missing character was the list marker,
a terminal newline, or something else. The log does not prove that remote sync, rather than editor serialization,
placeholder normalization, or another local write-back, removed the item. Preserve the full diagnostic capture in the
original report; do not copy note contents into tests or diagnostics.

## Outcome and scope

Identify the operation that removes the empty nested list item, reproduce the loss through the WYSIWYG workflow, and
fix the proven cause while preserving the caret and the intended empty item across autosave and sync. Avoid a
speculative change to remote sync based solely on the fingerprint difference.

## Acceptance criteria

- [ ] Determine at which boundary the item disappears: editable document, serialized Markdown, local draft, remote
      save, or a later write-back.
- [ ] Add a named regression that fails before the production fix for an empty level-2 list item at the end of a note
      with the caret in that item during the relevant asynchronous operation.
- [ ] Preserve the empty item and caret through the reproduced workflow, including after the note is saved and reloaded.
- [ ] Preserve date-bound behavior if editor, autosave, or sync callbacks change; cover a pending operation for date A
      while navigating to date B.

## Verification

Start with a focused editor or sync regression that isolates the proven boundary; use the sync model if the loss is
within its scope. Add a Playwright regression with native editing, autosave, and a delayed remote response or write-back
as appropriate. Run the focused browser suite and `npm run verify` before closure.

## Dependencies and related work

Related to [#0007](0007-intermittent-list-item-trailing-space-loss.md), which found a separate editor write-back defect
around list content and caret restoration. There are no hard dependencies.

## Resolution

Pending.
