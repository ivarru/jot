---
id: "0014"
title: "Export remote collections without mutating them"
status: open
type: feature
priority: medium
created: "2026-10-13"
labels: [recovery, portability, storage]
---

# Export remote collections without mutating them

## Problem and evidence

Current Drive date listing collapses duplicate dates and omits zero-byte files. Normal Daily Note loads can merge and
retire duplicates. These interfaces cannot establish a lossless, read-only collection export.

## Outcome and scope

Implement stage 3 of the [export contract](../docs/export-and-recovery.md): read-only remote discovery and versioned
capture combined with Local Drafts, referenced Attachment Metadata and alternatives. No image bytes,
trash/history scan, attachment cleanup or provider writes during export. Own future large-collection streaming/limit
changes here; version 1 limits remain in force until an explicit revised decision.

## Acceptance criteria

- [ ] Add paginated export-specific inventory/read seams that do not create folders, write markdown, consolidate or trash duplicates. Include zero-byte correctly dated files and report excluded entries.
- [ ] Export each duplicate as a separate version and union local-only dirty/empty dates with discovered remote files; select primary versions according to the contract.
- [ ] Bind captured bytes to observed revisions, implement bounded drift retries and final re-enumeration, and distinguish individually captured versions from a global snapshot.
- [ ] Report failed pagination, missing/unstable reads, changed inventory and all excluded entries with per-component counts; partial download requires an explicit action.
- [ ] Include metadata for references in all captured versions, retain external dependencies, and flag missing/ambiguous metadata or unavailable image bytes without claiming independent image recovery.
- [ ] Mocked fetch tests cover URLs, pagination, methods, auth headers, metadata/media bodies where relevant, duplicate/conflict behavior, and unchanged settings. Assert no export write/trash/folder-create requests.
- [ ] Browser download coverage inspects remote-only, local-only, divergent, duplicate, zero-byte and partial cases; cancellation and account changes cannot produce stale exports.

## Verification

Use a stateful mocked transport to vary revisions during inventory/media reads and fail later pages. Assert the package
accounts for every observed file, contains source strings, and leaves provider state/settings unchanged. Add browser
workflow regressions for actual downloads and partial-export choices. Run `npm run verify:full` when integrating with
editor/sync lifecycle. Real Google tests remain manual.

## Dependencies and related work

Depends on [#0012](0012-local-draft-export.md) for local capture and package download. Related
[#0013](0013-safe-package-restore.md) consumes alternatives; it is not a blocker for collection export.
[#0015](0015-image-inclusive-recovery.md) supplies independent image recovery later.

## Resolution

Pending.
