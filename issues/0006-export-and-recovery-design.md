---
id: "0006"
title: "Define export and recovery guarantees"
status: closed
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

- [x] The design specifies which snapshot is exported when visible content, a committed dirty Local Draft, and remote
  content differ, including failed or pending persistence and Sync Conflicts. It defines behavior when editing, date
  navigation, or sync continues during export, with explicit dates and captured markdown across asynchronous boundaries.
- [x] The design defines the collection inventory and completeness boundary: locally available versus all discovered
  remote Daily Notes, dirty local-only dates, duplicate remote files, and changes or failures during discovery and reads.
  It states whether the result is a consistent collection snapshot or a set of individually captured versions.
- [x] A versioned package format and completeness report distinguish Plain Markdown Files, Attachment Metadata, actual
  image bytes, and remaining external dependencies. The design states whether Jot Settings and unreferenced Image
  Attachments are included; excluded, missing, or unavailable content is never silently called complete.
- [x] Restore into an empty environment and into existing content is specified, including preview and explicit conflict
  choices, preservation of the pre-restore version, and concurrent edits after planning. Restore is a deliberate edit
  governed by Local Draft and Drive Sync safety, with the reuse or extension of Daily Note Upload made explicit.
- [x] Image-inclusive restore specifies how Attachment References and Image Attachment IDs remain valid when provider
  identifiers change or IDs collide. It distinguishes restoring from packaged bytes without access to the original
  account from restoring metadata that still depends on the original provider-held copy.
- [x] Recovery history options document retention, storage location, privacy, failure behavior, and whether snapshot
  failure blocks sync. Local history is explicitly distinguished from an independent backup.
- [x] The design includes concrete future round-trip scenarios comparing restored markdown under the stated Source
  Preservation rules and verifying image bytes and reference resolution where included. Failure scenarios cover partial
  export, malformed or unsupported packages, interrupted restore and retry, and edits made after restore planning.
- [x] The design is linked from the documentation index, accepted architectural choices are recorded in an ADR, and
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

Completed as a documentation-only design on 2026-10-13. The then-accepted
[export and recovery contract](../docs/export-and-recovery.md) and
[ADR 0010](../docs/adr/0010-explicit-export-and-safe-restore.md) define staged delivery, package version 1, snapshot
selection, component completeness, guarded restore and attachment identity handling. At completion, the documentation index labeled
this as an accepted design awaiting implementation; current domain vocabulary and runtime safety guarantees remain
unchanged.

Review against `CONTEXT.md`, `docs/sync-safety.md`, Local Draft storage, the Drive provider and Daily Note Upload found:

- Offline dirty drafts are exported from a committed readonly transaction; a failed/pending write leaves captured
  visible content as an explicitly uncommitted alternative. A-to-B navigation cannot relabel either snapshot.
- Remote divergence and duplicate files retain alternatives. Normal Drive loads can consolidate duplicates and date
  listing drops empty files, so collection export requires a separate non-mutating inventory/read seam.
- Collection changes produce individually captured versions and explicit drift/partial reporting, never a global
  point-in-time promise. Failed pagination cannot be mistaken for a complete inventory.
- Unavailable images remain missing dependencies even when metadata exists. Packaged bytes permit recovery without
  reading the original account; a destination account and new provider metadata are needed for image upload.
- Empty-environment text restore checks source preservation. Existing/newer content defaults to skip, requires a fresh
  decision after concurrent edits, and is preserved in a transactional local journal before authorized replacement.
- Interrupted restore records progress and revalidates on resume rather than repeating append/prepend. Optional
  automatic history remains a separate policy decision and does not block ordinary sync.

Follow-up implementation issues are [#0012](0012-local-draft-export.md) (first deliverable),
[#0013](0013-safe-package-restore.md), [#0014](0014-remote-collection-export.md), and
[#0015](0015-image-inclusive-recovery.md). Deferred retention, encryption and automatic snapshot failure policy are
owned by [#0016](0016-recovery-history-policy.md); larger-collection streaming/limit revisions are owned by #0014/#0015.
No questions block the scoped first deliverable. Each runtime issue requires executable round trips and the relevant
browser/provider checks; this closure does not claim those checks have already passed or that recovery is implemented.

Verification: repository-relative links and local issue metadata were checked, and `git diff --check` passed.
No app tests were run because only documentation and backlog files changed. No version bump is required.

### Subsequent deferral — 2026-10-16

The whole export and recovery programme was postponed after reconsidering the usefulness of regular manual exports.
ADR 0010 is now Deferred and the design is retained for reconsideration. Issues #0012–#0016 are blocked, with their
original criteria preserved; none is implemented or rejected. This issue remains closed because its documentation-only
deliverable was completed. Its recorded review and checked criteria describe that completed design work, not continuing
approval to implement the plan. Built-in Google Drive revision history is a candidate for future evaluation, not an
adopted replacement.
