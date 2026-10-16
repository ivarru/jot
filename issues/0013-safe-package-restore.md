---
id: "0013"
title: "Restore export packages with preserved versions"
status: blocked
type: feature
priority: medium
created: "2026-10-13"
labels: [recovery, portability, storage]
---

# Restore export packages with preserved versions

## Problem and evidence

Daily Note Upload supports markdown conflict choices but does not validate an export archive, preserve pre-restore
versions durably, or resume an interrupted package restore. Re-reading content must not silently extend an old preview's
authorization to replace newer edits.

## Outcome and scope

Implement stage 2 of the [export contract](../docs/export-and-recovery.md). Validate, preview and restore selected
package markdown through ownership-aware Local Draft persistence and Daily Note Replication. Add the targeted local
restore journal and its export/discard UI. Remote collection export, image upload and automatic history are excluded;
metadata-only references remain explicitly unavailable unless verified by a later image stage.

## Acceptance criteria

- [ ] Validate archive version, paths, entry identity, dates, hashes and decompression limits before any storage/provider mutation; malformed or unsupported packages fail visibly.
- [ ] Preview scope, alternatives, uncommitted provenance, conflicts and missing images. Default existing dates to skip and require per-date choices for replace/append/prepend and empty content.
- [ ] Preserve non-empty imported markdown without placeholder normalization; show whitespace canonicalization and user-approved combination changes.
- [ ] Durably preserve prior committed/differing visible versions and progress in a restore journal atomically with the local conditional write; preservation failure blocks mutation.
- [ ] Revalidate preview expectations under date ownership and local mutation coordination; stale visible/draft/remote state requires a new choice. Drive Sync retains revision preconditions and conflict preservation.
- [ ] Persist per-date progress, expose retained versions and their storage use, and resume after reload without repeating append/prepend. Changed destination content and ambiguous remote outcomes remain pending until reconciled.
- [ ] Offline restore reports committed dirty content separately from pending sync. Cancellation/account changes cannot apply stale results; warn before sign-out clears local restore history.
- [ ] Executable package-to-fresh-storage round trips, corruption/limit tests, failure/interruption/retry tests, and real-browser file-input, shared-tab, stale A-to-B and concurrent-preview regressions establish the contract.

## Verification

Test validation and markdown choices at the lowest layer, journal atomicity with IndexedDB aborts, and provider/sync
conflicts through controlled integration seams. Browser tests must download or use a real package fixture, select it via
the file input, restore, and assert persisted text/progress. Run `npm run verify:full`; mocked fetch coverage is required
for any changed Google provider behavior. No live Google account is needed for routine tests.

## Dependencies and related work

Blocked by the 2026-10-16 decision to postpone the whole export and recovery programme; see
[ADR 0010's deferral](../docs/adr/0010-explicit-export-and-safe-restore.md#deferral--2026-10-16).
Resume only after the recovery direction and this issue's scope/criteria have been reconsidered. The remaining
relationships below describe the original plan and do not override this blocker.

No runtime prerequisite: a contract-conforming package fixture can drive implementation. Related [#0012](0012-local-draft-export.md)
supplies the download producer. [#0015](0015-image-inclusive-recovery.md) extends the journal with image mappings later.
Reuse Daily Note Upload helpers, but do not change ordinary upload semantics incidentally.

## Resolution

Postponed on 2026-10-16, not implemented or rejected. Retain this issue and its unchecked criteria for reconsideration.
Built-in Google Drive revision history is a candidate to evaluate when recovery planning resumes; it is not yet an
accepted replacement. No active implementation commitment or deadline.
