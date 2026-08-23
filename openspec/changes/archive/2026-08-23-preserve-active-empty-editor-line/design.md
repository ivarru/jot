## Context

See proposal.md for motivation and specs/editor-placeholder-normalization/spec.md for the behavior contract. The current
implementation uses one Markdown value both for the live editor and for synchronization. Placeholder canonicalization
therefore lets a successful save feed its canonical result back into an active document.

## Goals / Non-Goals

**Goals:**

- Keep the collapsed-caret line editable while selectively canonicalizing the rest of the live document.
- Keep Local Draft and Google Drive representations fully canonical.
- Preserve editor selection, focus, and typed-character order through asynchronous sync completion.
- Apply the existing setting consistently to WYSIWYG and raw Markdown modes.

**Non-Goals:**

- Changing the on-disk/Drive Markdown format beyond the canonicalization already introduced.
- Preserving placeholder lines after navigation, reload, or an explicit document replacement.
- Normalizing literal content inside protected code or HTML regions.

## Decisions

### Derive two snapshots from each live editor state

Each save boundary will derive (a) a selective live-editor representation that protects the full source line containing a
collapsed caret, and (b) a fully canonical persistence representation. This separates what remains interactive from what
is durable without adding a storage field.

When the preference is disabled, both snapshots are the same raw Markdown. The selective normalizer, protected-line
guard, and canonical-result divergence handling are all bypassed, preserving the pre-normalization editing and sync
behavior.

Using only the fully canonical snapshot is rejected because it erases the just-created editing target. Never
canonicalizing the live document is rejected because the requested behavior is to clean every non-active eligible line.

### Carry caret-line identity through the normalization operation

The normalizer will accept an optional protected source-line range derived from the current editor selection. It will
leave that line unchanged while applying the existing context-aware placeholder rules everywhere else. Selection-aware
application will use the editor's existing selection-preservation facilities so removal of an earlier line cannot move
the caret away from the protected line.

If the protected line opens a raw HTML block, the scanner will recognize that opening line and enter the block before
returning from its protected-line handling. This preserves later literal placeholder-looking lines in the same HTML
block; protection of the caret line must not disable protected-region tracking.

Protecting only a Markdown offset is rejected because an empty line must remain intact as a unit; protecting no range
cannot distinguish a transient empty block from a stale placeholder elsewhere in the note.

### Do not apply persisted canonical results over a divergent live snapshot

Replication results will acknowledge the canonical persistence snapshot, but the date-bound editor will retain its
selectively normalized live Markdown whenever that differs from the persisted snapshot solely because of the protected
caret line. A later user edit produces a new pair of snapshots and is saved normally.

Blindly applying every successful sync result is rejected because it is the direct cause of the regression. Leaving all
sync results unapplied is rejected because genuine remote refreshes and conflict resolutions still need to update the
editor.

### Treat canonical equivalence as clean for remote refresh

When the live Markdown differs only because it retains the protected caret line, its fully canonical form is the
acknowledged clean snapshot. Clean-refresh eligibility will compare those canonical forms rather than requiring the
live and persisted strings to be identical. An unchanged remote canonical result preserves the live caret line; a
different remote canonical result remains a real document update and follows the normal guarded refresh path.

Treating the divergent live string as dirty is rejected because it permanently disables polling while the user pauses
on the protected line. Treating every refresh as unchanged is rejected because it would hide genuine remote edits.

### Capture date-bound autosave snapshots before debounce timers

An autosave timer will receive an explicit `IsoDate` and fully canonical snapshot created before the timer is started.
Its callback will operate only on that captured note, rather than reading the currently selected date or editor after
the asynchronous boundary. Navigation therefore cannot turn an A autosave into an unintended B save.

Reading the live editor in the timer is rejected because the selected date and document can change without the
Markdown signal itself changing.

### Treat a collapsed caret as the protection condition

The protected line is defined only when the active editor reports a collapsed selection. A non-collapsed selection has
no single caret line and receives normal canonicalization. This is consistent with the requested cursor/caret behavior
and avoids arbitrarily preserving a multi-line selected region.

## Risks / Trade-offs

- [Source-position changes while removing placeholders above the caret] → Use selection-aware normalization tests in
  both editors and preserve the active line rather than restoring a stale absolute position.
- [Repeated saves while live and persisted snapshots differ] → Deduplicate by canonical persistence snapshot and ensure
  status/baseline comparisons use the canonical form.
- [Preference is applied to only one save path] → Exercise enabled and disabled behavior through autosave, blur,
  foreground, and sync-completion tests.
- [A remote refresh replacing a transient line] → Apply the protected-line guard only to a result that acknowledges the
  same local persistence snapshot; retain normal date/generation guards for remote results.
- [A selective live snapshot being treated as dirty forever] → Determine clean-refresh eligibility from its canonical
  equivalence and preserve the active line only when the remote canonical result is unchanged.
- [An autosave using a later selected date] → Capture the explicit date and canonical snapshot before scheduling the
  debounce callback and test A-to-B navigation while it is pending.
- [Code and HTML source corruption] → Retain the existing protected-region scanner and extend its regression coverage
  alongside the new selective-line tests, including a caret on a raw-HTML opening line.

## Migration Plan

1. Release as a patch-level behavioral correction under the existing preference, which remains enabled by default.
2. No data migration is needed because Local Draft and Drive content are already canonical.
3. Roll back by restoring the prior normalizer path; no stored data requires conversion.
