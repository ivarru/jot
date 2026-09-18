---
id: "0004"
title: "Capture diagnostics outside Sync Conflicts"
status: closed
type: feature
priority: medium
created: "2026-09-18"
labels: [diagnostics, editor, reliability]
---

# Capture diagnostics outside Sync Conflicts

## Problem and evidence

The owner reports occasional minor issues without a reliable reproduction. Existing opt-in
[sync diagnostics](../docs/sync-safety.md#conflict-diagnostics) retain a rolling record and freeze it on a Sync Conflict.
Caret, read-only, or stale-content symptoms may never enter that state. The
[focus postmortem](../docs/editor-focus-investigation.md) shows why event ordering matters.

## Outcome and scope

Provide an explicit capture/copy action for the existing diagnostic buffer even when no conflict is open. Include enough
editor/session context to correlate events. Keep diagnostics opt-in, bounded, and in memory. Automatic uploads,
note-content recording, and a general telemetry service are out of scope.

## Acceptance criteria

- [x] With diagnostics enabled, a user can capture and copy a stable report without provoking a conflict; later events
  cannot change the already captured report.
- [x] Reports identify app version, relevant browser context, editor mode, normalization setting, and event ordering
  with operation/session identity sufficient to investigate stale callbacks.
- [x] Reports exclude note text, tokens, raw provider identifiers, and URLs; retained dates/hashes are minimized and
  their inclusion is documented.
- [x] Disabled collection, clearing, reload behavior, and existing conflict capture retain their documented guarantees.
- [x] Copy failure is visible and does not imply a report was copied; capture works without unexpectedly taking editor
  focus during background work.
- [x] Documentation explains capture, retention, and what reproduction context to attach to a local issue.

## Verification

Add focused diagnostic tests for snapshot stability, redaction, and disabled collection. Add a Playwright workflow that
captures without a conflict, exercises the actual clipboard action, and asserts report content and resulting UI state.
Run `npm run verify` and the focused browser workflow; use `npm run verify:full` if changing editor/sync/settings wiring.

## Dependencies and related work

No hard dependencies. Complements [#0003](0003-generated-date-bound-lifecycle.md) by turning observed incidents into
replayable regression leads. Decide the smallest discoverable UI location during implementation.

## Resolution

Added a Settings action that captures the enabled in-memory diagnostics buffer and copies a stable report without
requiring a Sync Conflict. Reports now include app/editor/settings/browser context, a random page-session identifier,
editor epoch, and monotonic event sequence numbers. Existing conflict capture remains frozen, and clipboard success or
failure is reported beside the action.

Diagnostic context is typed and bounded. Note contents and raw provider identifiers remain fingerprinted or omitted;
URL-like browser context is redacted. Documentation records why ISO dates and per-page salted hashes remain useful and
what non-sensitive reproduction context should accompany a local issue.

Verification: focused diagnostic and route suites passed, `npm run verify` passed with 650 tests plus typecheck and the
production build, the no-conflict clipboard browser regression passed, and the complete browser suite passed all 80
tests. The user-visible capability bumps the app version to `0.26.0`.
