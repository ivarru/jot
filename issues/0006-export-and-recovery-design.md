---
id: "0006"
title: "Define export and recovery guarantees"
status: open
type: design
priority: medium
created: "2026-09-18"
labels: [recovery, portability, storage]
---

# Define export and recovery guarantees

## Problem and evidence

Conditional synchronization protects against concurrent replacement, but an erroneous edit can still synchronize
successfully. The [safety reference](../docs/sync-safety.md#deferred-for-reconsideration) defers Recovery Snapshots, and the
[assessment](../docs/improvement-assessment.md#5-make-recovery-independent-of-sync-correctness) recommends a verified
export/restore workflow before expanding the value and volume of stored material.

## Outcome and scope

Specify the smallest useful export and restore contract and create scoped implementation issues. Distinguish committed
local export, complete remote collection export, attachment availability, and retained recovery history. This issue
delivers design and acceptance scenarios, not a claim that backup or restore has been implemented.

## Acceptance criteria

- [ ] The design specifies which snapshot is exported when visible content, a committed dirty Local Draft, and remote
  content differ, including pending persistence and conflict states.
- [ ] The package format and completeness report distinguish Plain Markdown Files, Attachment Metadata, actual image
  bytes, and remaining external dependencies; missing or unavailable content is never silently called complete.
- [ ] Restore behavior into an empty environment and into existing conflicting content is specified, with current
  versions preserved until an explicit user decision.
- [ ] Recovery history options document retention, storage location, privacy, failure behavior, and whether snapshot
  failure blocks sync. Local history is explicitly distinguished from an independent backup.
- [ ] The design includes concrete future round-trip test scenarios comparing restored content and attachment
  availability, plus failure cases for partial export and interrupted restore.
- [ ] Accepted architectural choices are recorded in an ADR; remaining questions and separately scoped implementation
  issues are linked before closure.

## Verification

Review the design against the current domain vocabulary and replication safety contract. Walk through offline dirty
drafts, remote divergence, unavailable images, empty-environment restoration, and restoring over newer content. Record
the review outcome; do not check off runtime recovery based solely on a document. No app tests are required for a
documentation-only design change.

## Dependencies and related work

No hard dependencies. [#0001](0001-local-draft-commit-acknowledgement.md) establishes the meaning of a committed Local Draft.
Attachment cleanup and general document types remain outside this design's initial implementation scope.

## Resolution

Pending.
