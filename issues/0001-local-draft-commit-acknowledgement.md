---
id: "0001"
title: "Validate Local Draft commit acknowledgement"
status: open
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

- [ ] A focused regression establishes request-success-then-abort behavior before any production fix; if the concern
  cannot be reproduced, record the tested assumptions and evidence explaining why.
- [ ] Successful writes resolve only after transaction completion; aborted or failed transactions reject the public
  operation instead of reporting success or remaining pending.
- [ ] Synchronous operation failures and both request-returning and Promise-returning paths have focused coverage.
- [ ] Integration coverage shows that failed local persistence cannot produce a successful local-save status.
- [ ] Successful committed content remains available after reopening storage, and compare-and-swap contention retains
  the intended conditional-write behavior.

## Verification

Use fake-indexeddb for deterministic transaction regressions and a focused browser persistence check where browser
semantics matter. Document why this adapter boundary is outside the atomic sync model. Run `npm run verify`; if changing
editor/autosave/sync wiring, run `npm run verify:full` as required by [testing.md](../docs/testing.md). Commit completion
must not be described as protection against every OS crash or storage eviction.

## Dependencies and related work

No hard dependencies. [#0005](0005-offline-restart-and-shared-tabs.md) exercises broader browser durability boundaries.

## Resolution

Pending.
