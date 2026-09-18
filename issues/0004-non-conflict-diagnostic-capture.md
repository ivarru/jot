---
id: "0004"
title: "Capture diagnostics outside Sync Conflicts"
status: open
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

- [ ] With diagnostics enabled, a user can capture and copy a stable report without provoking a conflict; later events
  cannot change the already captured report.
- [ ] Reports identify app version, relevant browser context, editor mode, normalization setting, and event ordering
  with operation/session identity sufficient to investigate stale callbacks.
- [ ] Reports exclude note text, tokens, raw provider identifiers, and URLs; retained dates/hashes are minimized and
  their inclusion is documented.
- [ ] Disabled collection, clearing, reload behavior, and existing conflict capture retain their documented guarantees.
- [ ] Copy failure is visible and does not imply a report was copied; capture works without unexpectedly taking editor
  focus during background work.
- [ ] Documentation explains capture, retention, and what reproduction context to attach to a local issue.

## Verification

Add focused diagnostic tests for snapshot stability, redaction, and disabled collection. Add a Playwright workflow that
captures without a conflict, exercises the actual clipboard action, and asserts report content and resulting UI state.
Run `npm run verify` and the focused browser workflow; use `npm run verify:full` if changing editor/sync/settings wiring.

## Dependencies and related work

No hard dependencies. Complements [#0003](0003-generated-date-bound-lifecycle.md) by turning observed incidents into
replayable regression leads. Decide the smallest discoverable UI location during implementation.

## Resolution

Pending.
