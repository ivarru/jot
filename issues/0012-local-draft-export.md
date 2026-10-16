---
id: "0012"
title: "Export Local Drafts"
status: open
type: feature
priority: medium
created: "2026-10-13"
labels: [recovery, portability, storage]
---

# Export Local Drafts

## Problem and evidence

Local Drafts contain unsynced content that a remote folder download cannot protect. Issue [#0006](0006-export-and-recovery-design.md)
defines a first deliverable that works without connectivity or successful persistence of the current visible edit.

## Outcome and scope

Implement stage 1 of the [export contract](../docs/export-and-recovery.md): a user-triggered version 1 ZIP export
with all committed local records, visible alternatives and honest coverage reporting. Do not add remote reads, restore,
image downloads or automatic history. Export is read-only and must not change sync status.

## Acceptance criteria

- [ ] Capture every Local Draft, including clean, dirty and empty records, in one readonly transaction; abort on capture failure.
- [ ] Capture explicit visible date/markdown/session before async work; keep differing visible text as an uncommitted alternative without flushing it.
- [ ] Produce the versioned manifest, ordinary markdown, hashes and README specified by the contract; report remote inventory not-requested and image dependencies per reference.
- [ ] Expose an export action with success/error/cancellation feedback; edits after capture do not alter the package and account changes cancel stale exports.
- [ ] Package round-trip unit checks recover exact captured strings, including whitespace-only records, conflict markers and placeholder-looking code; no baseline or saved-status mutation occurs.
- [ ] A real-browser download regression inspects the downloaded ZIP, exercises offline dirty content and pending A persistence while navigating to B, and checks abort/account cancellation.

## Verification

Use deterministic IndexedDB failure and snapshot tests plus package digest/manifest tests. Use Playwright's actual
download event and inspect the resulting package bytes; button rendering is insufficient. Run `npm run verify:full`
for editor/storage lifecycle integration, and keep preview servers stopped after verification.

## Dependencies and related work

No hard dependencies. The accepted contract and [ADR 0010](../docs/adr/0010-explicit-export-and-safe-restore.md) define
version 1. [#0013](0013-safe-package-restore.md) consumes the format; its runtime restore is not required to ship export.

## Resolution

Pending.
