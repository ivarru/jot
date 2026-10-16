# Reconcile derived tag indexes independently of Daily Note Replication

Status: Accepted

## Context

Per-tag Markdown indexes combine occurrences from many Daily Notes. An incremental append on note save would be
simple initially, but could lose other dates during concurrent updates and would not repair old excerpts, external
edits, missing files, changed settings, or interrupted multi-file updates. Index failure must not turn a successful
Daily Note save into a reported sync failure.

## Decision

Treat tag indexes as rebuildable projections of app-visible synced Daily Note Markdown. A separate page worker
reconciles the full collection on startup, after relevant changes, and periodically. It captures explicit source
dates and revisions, caches unchanged note media, validates source/setting fingerprints, and compares generated
content before writing. Existing index files use the same ETag-conditional Markdown update primitive as Daily Notes.
Competing workers retry rather than unconditionally overwriting captured target revisions. Missing targets can be
created concurrently; later reconciliation collapses duplicates. Removed entries are recovered by rebuilding each
tag's entire desired file, with empty tag files conditionally trashed.

Excerpt extraction and clipping operate on parsed Markdown. A visible-character limit counts grapheme clusters,
while serialization supplies complete inline syntax. One readable dated line per occurrence retains order and an
implicit per-date ordinal; future navigation must resolve that ordinal against the current source note.

## Consequences

- Daily Note safety and save acknowledgements do not depend on index success.
- A fresh page can repair index state without a persistent maintenance queue or another user edit.
- Maintenance scans all visible note metadata and generated files; the first pass downloads all note media.
- Source notes, generated files, and settings cannot be changed atomically across Drive files. Index consistency is
  eventual, with bounded retries followed by automatic later reconciliation. Rebuilds can be temporarily partial.
- Duplicate index folders can remain after a concurrent first creation; they are treated as one logical collection
  and generated files converge to one per tag across them.
- This adds no index browser. Presentation and occurrence navigation remain local issue #0019.
