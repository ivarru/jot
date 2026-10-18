# Include local tags in the Tag Catalog

Status: Accepted; supersedes ADR 0012's requirement to wait for index generation before suggesting a tag.

## Decision

Keep the cached index metadata as the remote catalog and merge tags from dirty local drafts and an explicitly dated
snapshot of the open note on refresh. Re-read notes seen by the catalog during the current page session so
a completed upload does not drop a suggestion before its index catches up. Refresh local and remote sources independently so local tags appear while
Drive is pending or unavailable. Keep index timestamps authoritative for recency and the Changed display; use local-note timestamps for tags
without an index.
Only remote metadata is persisted in the catalog cache; local suggestions are derived again from note content.

## Consequences

New tags can be reused before syncing. A local-only tag may have no synced occurrences yet. Local overlays are
replaced on refresh, cleared on sign-out, and protected against superseded responses. Index deletion removes a
suggestion only when local content also stops using it. Index contents and reconciliation semantics are unchanged.
