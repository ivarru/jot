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

Daily Note Upload already imports `YYYY-MM-DD.md` files with conflict choices, but that is not a complete restore
contract for a collection and its Image Attachments. Attachment Metadata identifies provider-held image copies;
exporting that metadata alone does not make the images independently recoverable.

Medium priority remains appropriate for this design gap: no specific data-loss incident is established here, and
reproduced content-loss defects take precedence. Complete export and demonstrated recovery should precede a substantial
expansion of the stored material; synchronization success alone is not evidence of recoverability.

## Outcome and scope

Produce a reviewable design for the smallest useful export and restore contract, with separately scoped implementation
issues. Distinguish export of committed Local Drafts (including unsynced content), export of the remote collection,
image-inclusive recovery, and retained recovery history. State the first deliverable and which guarantees require later
stages; a limited local export must not be presented as a complete collection backup.

This issue delivers design and acceptance scenarios. It does not implement export, restore, or Recovery Snapshots.
Evaluate recovery history without requiring its implementation or making it a prerequisite for export. Attachment
cleanup and general document types are excluded.

## Acceptance criteria

- [ ] The design specifies which snapshot is exported when visible content, a committed dirty Local Draft, and remote
  content differ, including failed or pending persistence and Sync Conflicts. It defines behavior when editing, date
  navigation, or sync continues during export, with explicit dates and captured markdown across asynchronous boundaries.
- [ ] The design defines the collection inventory and completeness boundary: locally available versus all discovered
  remote Daily Notes, dirty local-only dates, duplicate remote files, and changes or failures during discovery and reads.
  It states whether the result is a consistent collection snapshot or a set of individually captured versions.
- [ ] A versioned package format and completeness report distinguish Plain Markdown Files, Attachment Metadata, actual
  image bytes, and remaining external dependencies. The design states whether Jot Settings and unreferenced Image
  Attachments are included; excluded, missing, or unavailable content is never silently called complete.
- [ ] Restore into an empty environment and into existing content is specified, including preview and explicit conflict
  choices, preservation of the pre-restore version, and concurrent edits after planning. Restore is a deliberate edit
  governed by Local Draft and Drive Sync safety, with the reuse or extension of Daily Note Upload made explicit.
- [ ] Image-inclusive restore specifies how Attachment References and Image Attachment IDs remain valid when provider
  identifiers change or IDs collide. It distinguishes restoring from packaged bytes without access to the original
  account from restoring metadata that still depends on the original provider-held copy.
- [ ] Recovery history options document retention, storage location, privacy, failure behavior, and whether snapshot
  failure blocks sync. Local history is explicitly distinguished from an independent backup.
- [ ] The design includes concrete future round-trip scenarios comparing restored markdown under the stated Source
  Preservation rules and verifying image bytes and reference resolution where included. Failure scenarios cover partial
  export, malformed or unsupported packages, interrupted restore and retry, and edits made after restore planning.
- [ ] The design is linked from the documentation index, accepted architectural choices are recorded in an ADR, and
  separately scoped implementation issues define the first deliverable and later stages. Questions that affect the
  first deliverable's guarantees are resolved before closure; deferred questions have an explicit scope and owner issue.

## Verification

Review the design against [CONTEXT.md](../CONTEXT.md), the [replication safety contract](../docs/sync-safety.md), and
the existing Daily Note Upload workflow. Walk through offline dirty drafts, failed local persistence, remote divergence,
collection changes during export, unavailable images, restoration without the original account, and restoring over
newer content. Record the review outcome and links to the design, ADR, and implementation issues in Resolution.

Closure establishes an agreed contract and implementation plan, not runtime recoverability. No app tests are required
for this documentation-only design issue. Follow-up implementation issues must require executable round-trip checks,
provider tests where applicable, and browser regressions that exercise the actual download/import workflow as required
by [testing.md](../docs/testing.md).

## Dependencies and related work

No hard dependencies. Closed [#0001](0001-local-draft-commit-acknowledgement.md) establishes the meaning of a committed
Local Draft. The existing [Daily Note Upload](../src/features/dailyNoteUpload/dailyNoteUpload.ts) workflow and
[Image Attachment metadata](../src/domain/imageAttachments.ts) are relevant implementation boundaries, not a substitute
for the restore guarantees being designed.

## Resolution

Pending.
