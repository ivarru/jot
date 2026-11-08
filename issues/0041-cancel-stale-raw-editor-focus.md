---
id: "0041"
title: "Cancel stale raw-editor caret retries"
status: closed
type: bug
priority: high
created: "2026-11-08"
labels: [editor, focus, regression]
---

# Cancel stale raw-editor caret retries

## Problem and reproduction

CI's raw caret-strikethrough workflow produced `~~pedty~~` instead of `~~typed~~`. The unchanged Chrome case failed
three of fifteen local repetitions. Before production changes, a deterministic component regression reproduced the
exact reordered text by delivering a pending animation frame after inserting `ty`. A second failing regression showed
date A's pending focus moving date B's caret. Existing raw focus retries unconditionally re-focused and re-selected
in a microtask, zero-delay timer, and animation frame.

## Outcome

Keep mobile focus retries, but bind them to an editor lifetime/revision, explicit document date/reset, source snapshot,
and applied selection. New input, key/pointer activity, another focused control, or changed date/source supersedes
pending retries. Acknowledge initial focus only after the captured source reaches the textarea value binding.
This is browser/editor focus behavior outside the bounded replication model; focused component and native browser
regressions are the appropriate tests. No note persistence or merge algorithm changes are needed.

## Acceptance criteria

- [x] Reproduce before changing production code and retain deterministic regressions.
- [x] Deferred raw focus cannot reorder typing or overwrite another date's selection.
- [x] Normal initial/requested focus and existing editing/navigation workflows remain functional.
- [x] Repeated unchanged caret workflow and routine/full Chrome verification pass.

## Verification

Implemented in 0.39.6. The original browser case and its assertions remain unchanged; no sleeps, retries, or
weakened expectations were added. Its baseline run failed 3/15 times; the fixed run passed all 20 repetitions.

`npm run verify` passed all 882 tests, typecheck, and production build under the pinned Node 26 runtime. The full
Chrome suite passed all 210 cases, including raw caret formatting, normal initial/requested focus, date navigation,
tag/link dialogs, browser API workflows, shared editing ownership, and security policy checks. Three retained
component regressions cover exact reordered typing, A-to-B pending-frame isolation, and another control's focus.
No development/test servers remain running.
