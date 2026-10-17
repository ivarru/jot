# Share an index-backed tag catalog

Status: Accepted; supersedes the suggestion-catalog portion of ADR 0007.

## Context

Tag browsing and insertion previously used separate tag lists. Browser-local suggestion history and dismissals
could disagree with the derived index files, which already disappear when their last occurrence is removed.

## Decision

Use index filenames and modification dates for one cached Tag Catalog shared by both dialogs. Order by newest
index modification, with a shared page-session alphabetical toggle and alphabetical ties. Display cached tags
while refreshing asynchronously on opening either dialog and after index maintenance settles, including partial
failures. A failed refresh retains the cache; successful refresh replaces it, removing vanished indexes.

Do not offer suggestion dismissals. Synced Daily Note Markdown remains the durable tag source, and unsynced tags
join the catalog after index generation. Clear the cache and invalidate pending responses on sign-out.

Use `daily-notes-tag-index` as the folder name to scope these projections to Daily Notes. The previous folder
name has not been released, so no migration or legacy lookup is needed. Reconciliation still treats duplicate
folders as one logical collection and uses the same canonical file for browsing and metadata.

## Consequences

- Both dialogs see the same tags and order; names no longer depend on which notes this browser opened.
- Cached metadata supports immediate and offline use, but may be stale until a successful refresh.
- Index modification order describes generated-file changes, not the last insertion time of a tag link.
- ADR 0007's Markdown representation and structural association decisions remain unchanged.
