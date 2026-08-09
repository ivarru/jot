# Daily Note Replication Safety

This document records Jot's current safety contract, threat model, and staged reliability plan. It describes required
behavior; `docs/sync-model.md` describes the bounded executable model that currently checks part of it.

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
9. **Source Preservation remains intact.** Replication does not reformat non-empty Jot Markdown or replace the Plain
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

## Device Counts

The protocol is independent of the user's device count. Executable or formal models should use the smallest count that
exposes each interaction:

- one device for crashes, retries, and ambiguous responses;
- two devices for stale-reader and stale-writer conflicts;
- three devices for overlapping writers plus an independent reader or refresh;
- four devices only as an additional bounded run when the state space remains tractable.

An eight-hour delay requires no clock-specific event: the stale device simply takes no steps while other devices
advance the remote revision.

## Staged Reliability Plan

### 1. Record the contract and threat model

Keep the required safety properties, provider assumptions, and excluded failures explicit. Refine this document whenever
a bug reveals an unstated assumption.

### 2. Deepen the Daily Note Replication module

Concentrate the current behavior behind one public module interface without changing sync semantics. Keep core
replication, selected-session adaptation, and lifecycle coordination as internal seams with focused tests. Local Draft
and remote storage remain adapter seams.

### Deferred for reconsideration

3. Specify the proposed protocol in TLA+, parameterized by devices, and turn important counterexamples into executable
   regression traces.
4. Consider immutable Recovery Snapshots created before a remote clean acknowledgement. A Recovery Snapshot would be a
   separate write-once record; conditional replacement of the canonical Plain Markdown File would remain a distinct
   compare-and-swap operation.
5. Add adversarial provider and browser checks for every modeled crash and ambiguous-response point.

Yjs or another CRDT remains deferred unless simultaneous character-level collaboration becomes a product requirement
that justifies reconsidering the Plain Markdown File source-of-truth decision.
