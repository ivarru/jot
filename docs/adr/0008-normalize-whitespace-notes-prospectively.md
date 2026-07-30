# Normalize Whitespace-Only Notes Prospectively

Status: Accepted

## Context

A Daily Note containing only whitespace has no visible note content. Treating such a snapshot as empty prevents local
drafts and remote files with invisible content from making a date appear to contain a note.

Applying the rule retroactively would require scanning existing local drafts and downloading remote Daily Note files to
inspect their content. Rewriting those files would also introduce a migration that changes stored note source without a
new user edit.

## Decision

Normalize whitespace-only snapshots to the empty string when their content reaches a local persistence or remote sync
boundary. Do not proactively scan or rewrite existing all-whitespace local drafts or remote Daily Note files.

## Consequences

- New and subsequently persisted whitespace-only content is treated as an empty note.
- Existing all-whitespace notes may remain unchanged until their content later passes through persistence or sync.
- Deploying this behavior does not require a remote inventory scan, bulk download, or source-rewriting migration.
