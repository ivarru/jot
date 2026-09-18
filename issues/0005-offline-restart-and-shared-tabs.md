---
id: "0005"
title: "Test offline restart and shared-storage tabs"
status: open
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

Add focused fake-provider browser workflows for reopening committed offline work and concurrent tabs in the same browser
context. Decide and document the intended shared-tab editing/sign-out behavior before asserting it. Production service
worker offline-shell loading, PWA upgrades, schema migration, and additional browser engines are separate follow-ups.
Split this issue if either workflow requires a substantial independent implementation change.

## Acceptance criteria

- [ ] After an observed local commit while remote access is unavailable, closing and reopening the page recovers the
  exact Local Draft without claiming remote synchronization.
- [ ] Reconnecting against a conflicting remote edit preserves both alternatives or surfaces the expected conflict;
  no committed local version disappears silently.
- [ ] Two pages sharing one browser context exercise overlapping edits and refreshes, asserting visible and persisted
  content as well as status under the documented policy.
- [ ] Sign-out in one page with pending work in the other follows an explicit policy and does not allow obsolete work
  to resurrect cleared account state.
- [ ] Tests wait for observable transitions, isolate their state, run independently, and leave no preview server running.

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

Pending.
