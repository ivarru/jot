---
id: "0020"
title: "Share an index-backed tag catalog between browsing and insertion"
status: closed
type: feature
priority: medium
created: "2026-10-17"
labels: [tags, storage, ui]
---

# Share an index-backed tag catalog between browsing and insertion

## Problem and evidence

Browse tags lists remote indexes while Add tag uses a separate browser-local history with dismissals.
The two lists can disagree, and neither shares ordering by the index files' modification dates.

## Outcome and scope

Both dialogs use one cached list derived from index metadata. Recent index modifications come first,
with a shared alphabetical-order toggle. Opening either dialog and completing local index maintenance
refreshes the list asynchronously. Failed refreshes retain the cache. Suggestions cannot be dismissed.
Use `daily-notes-tag-index` for the Drive folder; the old name has not been released and requires no migration.

## Acceptance criteria

- [x] Both dialogs use the same cached tags and ordering, defaulting to newest modified index first.
- [x] Both dialogs offer a shared alphabetical toggle and asynchronous refresh on opening.
- [x] Local index maintenance refreshes the shared list; deleted indexes disappear after refresh.
- [x] Add tag has no dismissal control; sign-out clears cached names and pending responses.
- [x] Index discovery and creation use `daily-notes-tag-index`, without migration code.
- [x] Provider metadata and folder requests, cache races, and browser workflows have coverage.

## Verification

Focused catalog, component, route, fake-provider, and mocked Drive tests; full local verification,
including tag insertion, browsing, ordering, offline cache, index updates and removals.

## Dependencies and related work

Builds on local issues [#0018](0018-maintain-tag-index-files.md) and
[#0019](0019-browse-tag-index-and-open-instances.md).

## Resolution

Implemented with a shared browser-cached metadata catalog, page-session ordering toggle, stale-while-refreshing
lists, cancellation on sign-out, and no dismissal history. Both dialogs refresh on opening; maintenance completion
or partial failure also refreshes the catalog. Unchanged names/order preserve keyboard selection during refresh.
Read-only browsing and maintenance use `daily-notes-tag-index` and the same canonical duplicate file.
No legacy-folder compatibility is included because the previous name has not been released.

Verification before removing unneeded migration code: `npm run verify:full` passed 727 unit/integration tests, typecheck, production build, and all 120
Chrome browser checks. A named unchanged-list notification test first reproduced a keyboard-selection race
found during browser verification, then passed with stable catalog equality. Mocked Drive tests cover authenticated
metadata/media requests, duplicate folders, and existing conflict/settings behavior. Fake storage
preserves modification times for unchanged indexes and removes metadata with deleted indexes. No live Google
account was required.

After removing the unnecessary migration and its dedicated test, `npm run verify` passed all 726
unit/integration tests, typecheck, and the production build. The UI and fake-provider browser workflows
were unchanged from the successful 120-check browser run.
