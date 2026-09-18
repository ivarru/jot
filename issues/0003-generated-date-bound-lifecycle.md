---
id: "0003"
title: "Generate date-bound lifecycle scenarios"
status: open
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

- [ ] The harness uses production lifecycle behavior and a small independent specification of allowed outcomes.
- [ ] Pending date-A work cannot mutate date B's editor or draft, and stale completions cannot clean newer edits.
- [ ] Cancellation invalidates pending work, and a failed remote save retains a committed dirty Local Draft.
- [ ] Once edits and failures stop and scheduled work is fairly completed, the harness reaches synchronization or an
  explicit conflict rather than remaining pending indefinitely.
- [ ] At least one historical stale-autosave trace is represented; temporarily removing its relevant guard makes the
  harness fail, and the guard is restored before completion.
- [ ] Read, mutation/commit, and response gates reflect real effect boundaries; scheduled fakes preserve required
  atomicity rather than treating a delayed response as a delayed mutation.
- [ ] Seeds and minimized command traces are replayable, and the test reports/checks execution of meaningful categories
  so skipped preconditions cannot make the suite vacuously pass.
- [ ] The model documentation explains covered invariants, deliberate exclusions, and a measured routine test budget.

## Verification

Build on [#0002](0002-markdown-property-tests.md)'s replay conventions. Start with a bounded budget such as 200 sequences
of up to 30 commands and adjust using runtime and scenario coverage. Use distinct edit markers where an independent
preservation oracle is needed. Run `npm run verify`; run `npm run verify:full` if production lifecycle wiring changes.
Browser selection behavior remains a separate test responsibility.

## Dependencies and related work

Depends on [#0002](0002-markdown-property-tests.md) for the initial property-testing setup and replay convention.
Related: [#0001](0001-local-draft-commit-acknowledgement.md) and [#0005](0005-offline-restart-and-shared-tabs.md).

## Resolution

Pending.
