# Use explicit export packages and safe restore

Status: Deferred (previously Accepted)

Date: 2026-10-13

## Deferral — 2026-10-16

The export and recovery programme is postponed. Manual exports require repeated user effort and have not been
established as the right primary recovery workflow. Google Drive's built-in revision history is a candidate to evaluate
when recovery work resumes, before deciding whether a separate history store is needed. No replacement architecture
has been adopted and no implementation is authorized by this deferred ADR.

The original decision below is retained as historical design work, not an active implementation commitment. Revisit
its scope and ordering before resuming any stage. Issues #0012–#0016 are blocked pending that reconsideration; their
IDs and acceptance criteria are retained for review, not treated as an agreed delivery sequence.

## Context

Conditional Drive Sync protects concurrent edits but cannot undo an erroneous edit accepted by both local and remote
storage. Local Drafts protect unsynced work but disappear when browser storage is cleared. Daily Note Upload handles
markdown import; it does not establish collection completeness, image independence, or durable preservation before
replacement. Attachment Metadata alone cannot recover provider-held image bytes.

The current Drive read path can consolidate duplicate Daily Note files. Reusing it for export would modify the very
collection being captured. A collection also cannot be captured atomically across local storage, Drive and Photos.

## Decision

Adopt the staged [export and recovery contract](../export-and-recovery.md): committed local package export first,
safe text restore second, read-only remote collection export third, and verified image-inclusive recovery fourth.
This is an accepted implementation direction, not a statement that these capabilities are already shipped.

Use a versioned ZIP with ordinary markdown, separately inventoried metadata/images, hashes, divergent alternatives and
an explicit completeness manifest. Export reads captured versions and never flushes or acknowledges edits. Committed
dirty Local Drafts take precedence over remote content; differing visible or remote versions remain alternatives.
Collection export uses a separate non-mutating inventory/read seam and reports individually captured revisions,
not a point-in-time collection snapshot.

Restore is a deliberate edit through Local Draft persistence and conditional Drive Sync. Validate and preview before
writes, default existing content to skip, revalidate explicit choices against concurrent changes, and durably preserve
pre-restore versions in a local journal before replacement. Resume interrupted work by checking progress and current
content rather than replaying append/prepend operations. Preserve Jot Image Attachment IDs where possible; new provider
identifiers are destination metadata, and ID collisions require explicit, narrowly scoped reference remapping.

Do not require automatic Recovery Snapshots for export or ordinary sync. Evaluate automatic history separately with
retention, privacy and failure policies. Local restore preservation is mandatory for restore safety and is distinct
from optional automatic edit history.

## Alternatives considered

- Remote-only export omits newer unsynced content and cannot safely represent divergent local versions.
- A folder download or metadata-only package cannot establish image recovery without original-provider access.
- Flushing all edits before export couples recovery to the persistence/sync operation that may already be failing.
- Reusing normal Drive loads can consolidate duplicates and conceal original versions during a recovery operation.
- Silent replacement or unguarded replay of Daily Note Upload choices can overwrite changes made after preview.
- A global atomic snapshot would require coordination the current independent providers do not offer through Jot's
  adapters. Claiming one would overstate what the package proves.
- Mandatory remote history before every successful sync adds a new availability boundary without an agreed policy.

## Consequences

Plain Markdown Files remain the source of truth. Packages are inspectable outside Jot, while Jot-specific image
references still require metadata and restore support. Completeness becomes several explicit dimensions, and a
successful download is not evidence of a successful restore.

The local stage can ship independently of remote providers. Remote export needs new read-only seams; restore needs
transactional preservation, ownership-aware conditional writes and a resumable journal. Packages and journals contain
personal data; version 1 packages are unencrypted and journals are vulnerable to browser storage loss.

The work is owned by [#0012](../../issues/0012-local-draft-export.md),
[#0013](../../issues/0013-safe-package-restore.md), [#0014](../../issues/0014-remote-collection-export.md),
[#0015](../../issues/0015-image-inclusive-recovery.md), and [#0016](../../issues/0016-recovery-history-policy.md).
Runtime implementation must update the domain context when these new capabilities become implemented domain concepts.
