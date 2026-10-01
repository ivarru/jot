---
id: "0005"
title: "Test offline restart and shared-storage tabs"
status: closed
type: testing
priority: high
created: "2026-09-18"
labels: [browser, storage, sync]
---

# Test offline restart and shared-storage tabs

## Problem and evidence

Independent-device and reconnect tests do not by themselves establish behavior for two pages sharing IndexedDB or a
dirty Local Draft surviving page closure. These boundaries are highlighted in the
[assessment](../docs/improvement-assessment.md#4-cover-browser-lifetimes-and-improve-failure-reports).

## Outcome and scope

Add focused fake-provider browser workflows for reopening committed offline work. Concurrent shared-storage tabs were split
to [#0009](0009-shared-storage-tabs.md) after inspection showed that editing and sign-out need a coordinated behavior change.
Production service worker offline-shell loading, PWA upgrades, schema migration, and additional browser engines are
separate follow-ups.

## Acceptance criteria

- [x] After an observed local commit while remote access is unavailable, closing and reopening the page recovers the
  exact Local Draft without claiming remote synchronization.
- [x] Reconnecting against a conflicting remote edit preserves both alternatives or surfaces the expected conflict;
  no committed local version disappears silently.
- [x] Tests wait for observable transitions, isolate their state, run independently, and leave no preview server running.

## Verification

Use actual browser IndexedDB and existing fake-provider helpers. Distinguish page restart with preserved storage from
browser-process crash or OS durability; do not claim the latter are proven. Run the focused Playwright workflow and
`npm run verify`. Any production editor/autosave/sync/settings changes require `npm run verify:full` and regression-first
fixes. Record policy decisions and exact scenarios in the resolution.

## Dependencies and related work

No hard dependency for test development. Coordinate any acknowledgement failures with
[#0001](0001-local-draft-commit-acknowledgement.md) rather than duplicating its fix.
Related: [#0003](0003-generated-date-bound-lifecycle.md). Shared-tab policy is an explicit open design question.

## Resolution

The fake-provider browser preview now has a local-storage outage switch for Daily Note reads, date listing, and writes.
Two independent Playwright cases use actual browser IndexedDB to verify exact dirty Local Draft recovery after page closure, no remote
acknowledgement while unavailable, and a conflict after a different remote revision appears before reconnection. This
proves page restart with preserved browser storage, not browser-process crash or OS durability. Shared-tab coverage and
its editing/sign-out policy are tracked in [#0009](0009-shared-storage-tabs.md).

Verification: `npx playwright test tests/browser/workflows/offline-restart.spec.ts` (2 passed) and
`npm run verify:full` (unit tests, typecheck, build, 86 browser tests passed). The Playwright preview exited with the suite.
After review, the outage switch also covers remote date listing. The focused provider regression and date-picker browser
workflow passed, followed by `npm run verify`.
