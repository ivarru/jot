---
id: "0017"
title: "Search Daily Notes through Google Drive with a date range"
status: open
type: feature
priority: medium
created: "2026-10-16"
labels: [search, google-drive, navigation]
---

# Search Daily Notes through Google Drive with a date range

## Problem and evidence

Jot needs a way to find existing Daily Notes by their content without opening dates individually. Search must be
accessible from the app menu and support limiting results to a date range.

The [live Markdown search experiment](../docs/manual-google-provider-retest.md#markdown-search-experiment-2026-10-16)
confirmed that Drive `fullText` queries matched body-only words in a `text/markdown` file using Jot's existing
`drive.file` scope. Following an edit, both old and new words briefly matched; only the new word matched by the
five-second check. This single run establishes feasibility, not a reliability or indexing-latency guarantee.

## Outcome and scope

Provide a menu command to search synced Daily Notes using Google Drive search. Show matching dates and let the user
open the corresponding Daily Note. Optional start and end dates restrict results by the Daily Note's calendar date,
derived from its `YYYY-MM-DD.md` filename, rather than Drive creation or modification timestamps.

Search only files in the app's Daily Notes Folder. Unsynced edits and Local Draft search are explicitly out of scope.
Use Drive's word/phrase matching semantics; fuzzy matching, semantic search, and a separate local search index are
out of scope. Do not require broader Drive access for this feature.

## Acceptance criteria

- [ ] A clearly named Search command in the app menu opens search controls reachable by keyboard on desktop and mobile.
- [ ] Users can submit a text query and see matching Daily Note dates in a predictable order, with each result opening
      that date through the normal navigation flow.
- [ ] Optional start and end dates are inclusive. Either bound can be supplied alone; clearing both searches all dates.
      Same-day ranges work, and an end date before the start date produces a clear validation message.
- [ ] Date filtering uses the note's filename date, so editing an older note today does not change its range membership.
- [ ] Queries are restricted to valid Daily Notes in the Daily Notes Folder, exclude trashed files and unrelated files,
      and present each matching date at most once.
- [ ] Pagination is handled so matching dates are not omitted, including when date filtering excludes an entire page
      of Drive results.
- [ ] Loading, no matches, disconnected/offline, and request failure states are clear. Empty queries do not accidentally
      issue an unrestricted content search. Query text is escaped safely for Drive query syntax.
- [ ] The interface explains that search covers synced content and that recent changes may take time to appear.
- [ ] Late responses from earlier queries or date ranges cannot replace newer results. Opening or closing search
      preserves editor content; selecting a result preserves pending edits through normal date-navigation safeguards.
- [ ] Search controls have accessible labels and sensible focus behavior, and closing search returns focus to its
      invoking control.

## Verification

Add mocked-fetch provider tests covering request URLs, methods, authorization headers, folder restrictions, escaped
queries, pagination, date-boundary filtering, malformed filenames, duplicate dates, and errors. Preserve existing
metadata/media, settings, and conflict regression coverage; search must not mutate remote files.

Add focused application tests for overlapping search requests and range changes. Add a Playwright workflow that opens
Search from the menu, searches seeded notes, applies and clears inclusive date bounds, follows a result, and asserts
the selected date and content. Cover an old note modified recently, no results, invalid ranges, keyboard access, and
navigating from date A to result date B while a load or autosave for A is pending. Keep explicit dates and Markdown
Snapshots attached to asynchronous work.

Run `npm run verify` and the focused browser workflow suite before closure. Repeat a live test with app-created Daily
Notes to confirm folder-scoped content search and date filtering against real Drive indexing; use only local ignored
account configuration and keep identifiers and credentials out of tracked evidence. Live Google access must not be
required for routine regression coverage.

## Dependencies and related work

No hard dependencies. The live experiment above informs feasibility; reusable local test authorization is useful
for manual verification but does not block mocked implementation coverage.

## Resolution

Pending.
