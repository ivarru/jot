# Daily Note Replication Safety

This document records Jot's current safety contract, threat model, reliability work, and deferred proposals. It
describes required behavior; `docs/sync-model.md` describes the bounded executable model that currently checks part of
it.

## Safety Contract

Daily Note Replication must satisfy these properties:

1. **Explicit identity.** Every asynchronous operation carries its `IsoDate` and markdown snapshot. A remote baseline
   is usable only when that revision was visible with that snapshot.
2. **Local durability first.** An edit is persisted as a Local Draft before remote replication. A remote failure cannot
   discard or clean that dirty Local Draft.
3. **Conditional remote replacement.** An existing remote Daily Note is replaced only when its current revision still
   matches the revision expected by the Local Draft. Otherwise Drive Sync produces or rebases through a Sync Conflict.
4. **Dirty content remains authoritative.** Loading, refreshing, reconnecting, retrying, or applying a late result cannot
   replace a dirty Local Draft without an explicit conflict decision.
5. **Late results cannot advance state.** A result for an old date, markdown snapshot, editor epoch, Local Draft, or
   lifecycle generation cannot mark newer visible content clean or update another Selected Date.
6. **Clean refreshes commit conditionally.** A remote refresh may update the Local Draft baseline only if the editor and
   Local Draft stayed clean while the remote read and visible application were pending.
7. **Acknowledgements are honest.** `saved-locally` means only the Local Draft is durable. `synced` means the remote
   adapter confirmed the current canonical content and revision, or confirmed that identical content already exists at
   the current revision. An error or ambiguous result cannot become `synced`.
8. **Conflicts preserve both versions.** When local and remote content changed from a shared baseline and cannot merge
   automatically, neither version is silently selected. Both remain available through a Sync Conflict.
9. **Duplicate retirement is conditional.** When concurrent first writes create duplicate Daily Note files, Jot retires
   a duplicate only if its Drive revision still matches the revision whose content was incorporated into the canonical
   file. A changed duplicate remains active and prevents a clean acknowledgement until a later consolidation includes it.
10. **Source Preservation remains intact.** Replication does not reformat non-empty Jot Markdown or replace the Plain
   Markdown File with a richer document representation.

The strongest operational rule is: if Jot cannot prove that a remote revision was visible to the edit being
replicated, or that the remote replacement was accepted against the expected revision, it keeps the Local Draft dirty
or surfaces a Sync Conflict.

## Threat Model

The contract covers:

- multiple browsers or devices acting on the same Daily Note;
- a device remaining offline or suspended for an arbitrary time;
- stale HTTP reads and cached metadata;
- delayed, reordered, duplicated, dropped, or retried requests and responses;
- a remote update between Jot's read and write;
- browser suspension, reload, navigation, sign-out, or process termination at any asynchronous step;
- authentication expiry and reconnection;
- edits made directly to the Plain Markdown File outside Jot;
- clock disagreement between devices, except for choosing a new browser-local date before an operation starts.

Jot assumes:

- Google Drive correctly enforces a strong ETag precondition on a conditional update of the same file;
- a successful Google Drive response describes content durably accepted by the provider;
- IndexedDB provides atomic completion or failure for one Local Draft write;
- the user and provider do not maliciously alter, delete, or corrupt acknowledged data.

The contract does not guarantee recovery after Google account deletion, deliberate file deletion, provider-wide data
loss, device storage being cleared before an unsynced Local Draft reaches another durability location, or a malicious
client with the user's credentials. Recovery from an implementation defect is a separate proposed defense described
below.

## Conflict Diagnostics

Sync diagnostics are opt-in and disabled by default. When enabled in Settings, Jot keeps a rolling in-memory record of
the preceding minute of editor and sync lifecycle events. The record includes event times, ISO dates, save sources,
sync states, Markdown lengths with diagnostic hashes, and hashes of expected and observed revisions. It never records
note contents, OAuth data, Drive URLs or file IDs, or raw revision IDs.

When Jot opens a Sync Conflict, it records the conflict boundary and then pauses diagnostics collection along with
editing. That pause freezes the preceding one-minute snapshot, so it remains available if the dialog stays open longer.
Jot loads this opt-in before starting initial background synchronization. The conflict dialog can copy the retained
report to the clipboard. Its first line identifies the running Jot version, so reports can be compared with the
corresponding behavior. Diagnostics are never uploaded or persisted and are cleared when collection is disabled or the
page reloads.

## Empty Editor Placeholders

By default, Jot canonicalizes empty editor placeholders at the Local Draft and Google Drive persistence boundaries.
A standalone line containing only `<br />` becomes one blank line; an empty Markdown list item such as `* <br />` is
removed. Runs of blank lines are collapsed so the saved file does not contain consecutive blank lines. The live WYSIWYG document is not rewritten merely because its equivalent saved representation is canonicalized,
which preserves its focus, caret, and undo history. This behavior can be disabled in **Settings** for source-preserving
workflows. Literal placeholder-looking lines inside fenced or indented code blocks, or raw HTML blocks, are never
normalized.

## Device Counts

The protocol is independent of the user's device count. Executable or formal models should use the smallest count that
exposes each interaction:

- one device for crashes, retries, and ambiguous responses;
- two devices for stale-reader and stale-writer conflicts;
- three devices for overlapping writers plus an independent reader or refresh;
- four devices only as an additional bounded run when the state space remains tractable.

An eight-hour delay requires no clock-specific event: the stale device simply takes no steps while other devices
advance the remote revision.

## Reliability Work

### Maintain the contract and threat model

Keep the required safety properties, provider assumptions, and excluded failures explicit. Refine this document whenever
a bug reveals an unstated assumption.

### Concentrate Daily Note Replication — completed

Daily Note Replication is concentrated behind one public module interface without changing the Plain Markdown File
source of truth. Core replication, selected-session adaptation, and lifecycle coordination remain internal seams with
focused tests. Local Draft and remote storage remain adapter seams. See
[ADR 0009](adr/0009-concentrate-daily-note-replication.md).

### Adversarial provider and browser checks — established

The initial adversarial suite uses independent provider instances and a stateful Drive transport to check:

- competing replacements of one revision, including the losing `412 Precondition Failed` path;
- a successful replacement whose response is lost, followed by an idempotent retry;
- concurrent first creation, temporary duplicate files, and eventual content-preserving consolidation;
- an edit to a duplicate between merge and retirement;
- atomic compare-and-swap behavior in the development Fake Remote Storage Provider;
- clean stale-device refresh and dirty stale-device conflict behavior in a real browser workflow.

Google Drive filenames are not treated as unique. Concurrent first creation may temporarily produce multiple files with
the same Daily Note filename. The safety requirement is that all versions remain active until their content has been
incorporated, and that stable duplicates eventually consolidate; immediate singleton creation is not assumed.

## Deferred For Reconsideration

- Specify the protocol in TLA+, parameterized by devices, and turn important counterexamples into executable regression
  traces.
- Consider immutable Recovery Snapshots created before a remote clean acknowledgement. A Recovery Snapshot would be a
  separate write-once record; conditional replacement of the canonical Plain Markdown File would remain a distinct
  compare-and-swap operation.

Further adversarial checks should be added for newly modeled crash and ambiguous-response points as they are identified.

Yjs or another CRDT remains deferred unless simultaneous character-level collaboration becomes a product requirement
that justifies reconsidering the Plain Markdown File source-of-truth decision.
