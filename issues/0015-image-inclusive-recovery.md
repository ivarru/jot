---
id: "0015"
title: "Export and restore referenced image bytes"
status: open
type: feature
priority: medium
created: "2026-10-13"
labels: [recovery, portability, storage]
---

# Export and restore referenced image bytes

## Problem and evidence

Attachment Metadata points at provider-held copies. Text plus metadata cannot restore images without original-account
access. The accepted design requires verified bytes and destination metadata, not a promise based on provider IDs.

## Outcome and scope

Implement stage 4 of the [export contract](../docs/export-and-recovery.md): package referenced selected-copy bytes and
restore them to destination Image Attachments. Own provider capability validation, exact-byte versus transformed-copy
reporting, ID collision remapping and image preparation/resume. Exclude Source Image originals, unreferenced album
export and automatic cleanup. Decide any image streaming/limit expansion explicitly before changing version 1 limits.

## Acceptance criteria

- [ ] Fetch referenced Jot-owned copies, record byte hashes/MIME/dimensions and report unavailable bytes distinctly from available metadata; never claim original-image recovery.
- [ ] Restore from a package without reading the original account, upload to the destination Jot Image Album and write metadata with new provider IDs while retaining Jot IDs where safe.
- [ ] Verify identity before reusing a colliding destination ID; otherwise preview a fresh ULID mapping and rewrite only imported Attachment Reference destination spans, preserving original source in the package/journal.
- [ ] Journal mappings and confirmed uploads before dependent note writes; retries reuse results, and ambiguous responses require reconciliation or an explicit retry decision.
- [ ] Failed image preparation stops dependent notes or requires explicit text-only consent. Report unavailable images, pending uploads and orphaned new copies without deleting existing attachments.
- [ ] Mocked provider tests cover request URLs/methods/auth, metadata and binary media bodies, expired/unavailable reads, conflict/settings invariance, uploads and interrupted retries.
- [ ] Fake-provider/browser round trips restore packaged bytes into a fresh destination and assert hashes, new provider IDs and reference resolution; collisions leave literal code and existing notes unchanged.
- [ ] A documented manual external check establishes the real provider read/upload capabilities and discloses any transformation; routine tests require no live account.

## Verification

Use byte fixtures and a fake destination independent of the source provider. Exercise actual download and package
file-input restore in Playwright, including image failure, ID collision, reload/retry and account cancellation. Run
`npm run verify:full` and the applicable manual checklist before promising provider-backed image independence.

## Dependencies and related work

Depends on [#0013](0013-safe-package-restore.md) for restore validation/journaling and
[#0014](0014-remote-collection-export.md) for remote inventory/metadata packaging. No dependency on automatic history.

## Resolution

Pending.
