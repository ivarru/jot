---
id: "0001"
title: "Validate Local Draft commit acknowledgement"
status: closed
type: investigation
priority: high
created: "2026-09-18"
labels: [storage, reliability]
---

# Validate Local Draft commit acknowledgement

## Problem and evidence

The [assessment](../docs/improvement-assessment.md#1-validate-the-storage-acknowledgement-boundary) identified a potential
gap: [withStore](../src/storage/indexedDb.ts) resolves its request branch on request success, while its Promise branch
waits for transaction completion. Ordinary [Local Draft saves](../src/storage/localDraftStore.ts) use the request branch.
The helper has no explicit transaction abort handler. Request success alone does not establish committed storage.

This is a code-review finding, not reproduced user-visible loss or an established explanation of intermittent issues.
The [safety contract](../docs/sync-safety.md) requires honest local acknowledgement.

## Outcome and scope

Establish whether the public save promise can report success before a later transaction abort. If confirmed, fix the
acknowledgement boundary and its error handling. Keep unrelated connection management, schema upgrades, and broader
storage refactoring out of this issue.

## Acceptance criteria

- [x] A focused regression establishes request-success-then-abort behavior before any production fix; if the concern
  cannot be reproduced, record the tested assumptions and evidence explaining why.
- [x] Successful writes resolve only after transaction completion; aborted or failed transactions reject the public
  operation instead of reporting success or remaining pending.
- [x] Synchronous operation failures and both request-returning and Promise-returning paths have focused coverage.
- [x] Integration coverage shows that failed local persistence cannot produce a successful local-save status.
- [x] Successful committed content remains available after reopening storage, and compare-and-swap contention retains
  the intended conditional-write behavior.

## Verification

Use fake-indexeddb for deterministic transaction regressions and a focused browser persistence check where browser
semantics matter. Document why this adapter boundary is outside the atomic sync model. Run `npm run verify`; if changing
editor/autosave/sync wiring, run `npm run verify:full` as required by [testing.md](../docs/testing.md). Commit completion
must not be described as protection against every OS crash or storage eviction.

## Dependencies and related work

No hard dependencies. [#0005](0005-offline-restart-and-shared-tabs.md) exercises broader browser durability boundaries.

## Resolution

Confirmed and fixed in version 0.25.16. The regression reproduced `withStore` resolving a successful request before an
explicit abort of the same transaction. `withStore` now installs completion, error, and abort handlers before invoking
the operation, waits for both the operation result and transaction completion, and aborts an active transaction when
the operation throws or rejects.

Focused fake-indexeddb coverage exercises request-success-then-abort, Promise-success-then-abort, request failure,
synchronous failure, both completion orderings, committed reads through a subsequent database operation, and Local
Draft compare-and-swap contention. Daily Note Replication integration coverage confirms that a rejected draft write
cannot return `saved-locally`. This adapter acknowledgement boundary is below the atomic sync model: the model assumes
that `LocalDraftStore` operations truthfully report their outcome, so the regression belongs at the IndexedDB adapter
and replication integration seams rather than as a model trace.

Verification passed with `npm run verify` (635 tests, typecheck, and production build) and the focused real-browser
persistence/reload check in `tests/browser/editing/remote-note-caret.spec.ts` (2 tests). Transaction completion confirms
the browser's IndexedDB commit boundary; it is not a guarantee against later OS-level storage loss or eviction.
