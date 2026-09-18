---
id: "0003"
title: "Generate date-bound lifecycle scenarios"
status: closed
type: testing
priority: high
created: "2026-09-18"
labels: [sync, lifecycle, property-testing]
---

# Generate date-bound lifecycle scenarios

## Problem and evidence

The [bounded sync model](../src/sync/dailyNoteReplication/syncModel.test.ts) already explores short traces, but primarily
uses one date and atomic operations. Stale queued saves and date-bound callbacks also depend on lifecycle orchestration.
Commit `aaaac1e` and [selected-date regressions](../src/sync/dailyNoteReplication/selectedDate.test.ts) provide concrete
starting cases. See the [assessment](../docs/improvement-assessment.md#2-extend-the-model-in-two-directions).

## Outcome and scope

Add a separate generated harness around production lifecycle seams, initially one client and two dates. Keep the existing
bounded enumeration and named regressions. Generate edits, queued saves, refresh start/completion, local persistence,
navigation, blur, and cancellation with explicit scheduling gates. Additional clients, account switching, and arbitrary
merge semantics are follow-ups unless required to reproduce the initial scenarios.

## Acceptance criteria

- [x] The harness uses production lifecycle behavior and a small independent specification of allowed outcomes.
- [x] Pending date-A work cannot mutate date B's editor or draft, and stale completions cannot clean newer edits.
- [x] Cancellation invalidates pending work, and a failed remote save retains a committed dirty Local Draft.
- [x] Once edits and failures stop and scheduled work is fairly completed, the harness reaches synchronization or an
  explicit conflict rather than remaining pending indefinitely.
- [x] At least one historical stale-autosave trace is represented; temporarily removing its relevant guard makes the
  harness fail, and the guard is restored before completion.
- [x] Read, mutation/commit, and response gates reflect real effect boundaries; scheduled fakes preserve required
  atomicity rather than treating a delayed response as a delayed mutation.
- [x] Seeds and minimized command traces are replayable, and the test reports/checks execution of meaningful categories
  so skipped preconditions cannot make the suite vacuously pass.
- [x] The model documentation explains covered invariants, deliberate exclusions, and a measured routine test budget.

## Verification

Build on [#0002](0002-markdown-property-tests.md)'s replay conventions. Start with a bounded budget such as 200 sequences
of up to 30 commands and adjust using runtime and scenario coverage. Use distinct edit markers where an independent
preservation oracle is needed. Run `npm run verify`; run `npm run verify:full` if production lifecycle wiring changes.
Browser selection behavior remains a separate test responsibility.

## Dependencies and related work

Depends on [#0002](0002-markdown-property-tests.md) for the initial property-testing setup and replay convention.
Related: [#0001](0001-local-draft-commit-acknowledgement.md) and [#0005](0005-offline-restart-and-shared-tabs.md).

## Resolution

Added a generated one-client, two-date harness around production `createDailyNoteReplication` and date-bound editor
transitions. The independent checks cover date ownership, visible-edit preservation, clean/dirty outcomes, explicit
conflicts, fair draining, and non-vacuous command/gate coverage. Gated fakes separate reads, atomic draft commits,
atomic compare-and-swap, remote acceptance, and response delivery.

The routine property runs 200 replayable traces of 12–30 commands with seed `20260918` and completed in about 114 ms.
An exploratory 1,000-trace run passed in about 472 ms. Named cases cover the stale autosave from `aaaac1e`, a stale save
response racing a newer committed edit, an unpersisted visible edit before navigation, an old-date response arriving
after navigation, cancellation before a pending mutation, and failed remote save recovery.

As a mutation check, visible-snapshot revalidation was temporarily removed from `saveAndSyncSnapshot`. The historical
trace then accepted a stale `* plain item` save over the refreshed linked note. The guard was restored, and the focused
suite passed again. No production lifecycle change was required, so routine `npm run verify` is sufficient and no app
version bump is needed.
