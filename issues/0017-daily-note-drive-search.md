---
id: "0017"
title: "Search Daily Notes through Google Drive with a date range"
status: closed
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
open the corresponding Daily Note. The start date is included and the end date is excluded. By default, bounds apply
to the Daily Note's calendar date,
derived from its `YYYY-MM-DD.md` filename. A toggle instead filters on the file's last-modified date in the browser's
local time zone, using metadata already returned by Drive.

Search only files in the app's Daily Notes Folder. Unsynced edits and Local Draft search are explicitly out of scope.
Use Drive's word/phrase matching semantics; fuzzy matching, semantic search, and a separate local search index are
out of scope. Do not require broader Drive access for this feature.

## Acceptance criteria

- [x] A clearly named Search command in the app menu opens search controls reachable by keyboard on desktop and mobile.
- [x] Users can submit a text query and see matching Daily Note dates in a predictable order, with each result providing an action
      to open that date through the normal navigation flow.
- [x] Start dates are included and end dates excluded, with an explicit end-date label. Either bound works alone;
      clearing both searches all dates. Equal bounds produce an empty range; reversed bounds show a validation message.
- [x] Date filtering defaults to the filename date and can switch to local last-modified dates. Switching the basis
      invalidates pending results; unknown modification times are excluded only when modified-date bounds apply.
- [x] Queries are restricted to valid Daily Notes in the Daily Notes Folder, exclude trashed files and unrelated files,
      and present each matching date at most once.
- [x] Pagination is handled so matching dates are not omitted, including when date filtering excludes an entire page
      of Drive results.
- [x] Loading, no matches, disconnected/offline, and request failure states are clear. Empty queries do not accidentally
      issue an unrestricted content search. Query text is escaped safely for Drive query syntax.
- [x] The interface explains that search covers synced content and that recent changes may take time to appear.
- [x] Late responses from earlier queries or date ranges cannot replace newer results. Opening or closing search
      preserves editor content; selecting a result preserves pending edits through normal date-navigation safeguards.
- [x] Search controls have accessible labels and sensible focus behavior, and closing search returns focus to its
      invoking control.

- [x] Each result has a unified heading with hover/focus feedback that toggles its preview. A separate open-note button
      and a normal click in the preview open the Daily Note through normal navigation without following hyperlink destinations.
- [x] Previews reuse read-only WYSIWYG rendering, initially bring the first visible-text match into view, and retain
      normal hyperlink styling while disabling link navigation and editing (including task toggles).
- [x] Preview loading is lazy, preserves the exact result date/file across asynchronous work, handles errors/retry,
      and ignores responses after collapse, query/range replacement, or closing Search.

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

Implemented in version 0.29.0. The menu opens a native search dialog with word/phrase queries, optional date bounds (start included, end excluded), newest-first date results, and normal Daily Note navigation. Drive search reads existing folders,
escapes terms, traverses every result page, and filters/deduplicates valid filename dates. No new OAuth scopes or
remote writes are required by search. Input changes and dialog closure invalidate pending responses. The accent-colored Search button is disabled until
the query contains non-whitespace text. Results also show the remote last-modified timestamp in `YYYY-MM-DD HH:mm` format in the browser’s local time zone and exact file size in bytes, with an explicit Unknown fallback when Drive omits metadata. This uses the
existing search response without downloading note contents. Duplicate dates use the newest matching file's metadata.
Result rows place the date on the left and the local last-modified timestamp and byte size on the right.
A magnifying-glass shortcut in the editor date-picker header closes the picker and opens Search. Symmetric header
columns preserve the month/year centering. Closing Search restores focus to the date input without reopening the
picker; menu-launched Search restores focus to the menu button.

Verification:

- `npm run verify:full`: all 666 unit/integration tests, TypeScript checking, and the production build passed. Its
  browser phase could not bind the local preview port inside the sandbox; rerunning `npm run test:browser` with local
  server permission passed all 99 browser tests.
- New mocked-provider checks cover escaped words/phrases, auth headers, GET-only requests, folder scope, pagination
  whose first page falls outside the date range, filename validation, duplicate dates, empty files, missing folders,
  invalid input, and provider errors. Existing metadata/media, settings, and conflict tests remain green.
- Component checks cover overlapping queries, changing ranges during a pending request, and closing before a response.
  A route regression navigates from A to a search result B with A's autosave pending and verifies both dates' content.
- Browser workflows cover menu access, results, each date-bound form, clearing dates, invalid ranges, no matches,
  opening a result, preservation of editor content, keyboard focus, narrow layout, and disconnected errors.
  A follow-up browser regression verifies disabled empty/whitespace queries, enabling after typing, disabling after
  clearing, and the accent-colored action. A metadata follow-up verifies ISO timestamp normalization, exact byte
  sizes without numeric precision loss, missing metadata, and duplicate-date metadata selection. The browser asserts
  rendered timestamps and sizes, including winter/summer offsets and a local date rollover in Europe/Oslo. `npm run verify` (667 tests, typecheck, build) and both focused search workflows passed
  after the metadata update.
- A live check on 2026-10-16 used the actual GoogleDriveStorageProvider with existing test authorization. It created
  two previously absent Daily Notes on 2099-10-15 and 2099-10-16, each with a unique body word. Folder-scoped search
  initially found one note, then both on the next poll. Unbounded, same-day, start-only, and end-only searches returned
  exactly the expected dates. The two test notes were retained for inspection; the temporary server was stopped.

Layout/shortcut follow-up: `npm run verify` passed (667 tests, typecheck, build). Browser geometry checks at 360px and
960px verify the compact rows, exact month-title centering with the adjacent search icon, picker dismissal, search
submission, return focus without reopening the picker, and navigation from a result. The full browser suite passed
100/101 tests; the existing raw Tab undo test failed during text replacement and passed on an isolated rerun (1/1).

Read-only preview follow-up: result headings toggle previews with shared hover/focus feedback and a separate
open-note control. Expanding lazily downloads the exact matched Drive file by ID via an authenticated
media GET; it never invokes the normal load path that can consolidate duplicate files. Preview requests carry the
explicit result date/file and are invalidated on collapse or disposal. Loaded Markdown is cached only for that
result's lifetime within the current search.

Previews reuse Milkdown in read-only mode, including lists, tables, code, math, and Image Attachment resolution.
They scroll their own viewport (and, on short screens, the dialog) to the earliest visible word/phrase match without
scrolling the editor page. Normal link styling is retained, but links are removed from tab order and navigation is
blocked for normal clicks, middle clicks, context menus, and the editor's link-opening callback. Normal preview clicks
open the associated Daily Note instead. Preview guidance is a tooltip rather than a visible paragraph. Task controls and
text editing remain read-only. Loading failures expose a retry control.

`npm run verify` passed (671 tests, typecheck, build). Focused browser checks passed on desktop and 360×640 screens,
covering whole-row metadata clicks, hover feedback, full-note rendered structure, first-hit geometry, disabled links
and task edits, retained current-date content, expand/collapse, and retry. The full browser suite passed all 104 tests;
after the final preview-only style and cleanup adjustments, `npm run verify` passed again and all seven focused search
browser workflows passed. Test preview reads require no live Google account.

Interaction refinements: result dates carry `(today)`, `(open)`, or `(today, open)` markers. The search dialog has a
larger default width, uses the available viewport height, supports centered pointer and keyboard resizing in both dimensions, and has a
larger title with reduced spacing above its help text. The end bound is explicitly excluded. A toggle filters dates
using local last-modified metadata instead of the filename date. Opening a preview uses normal navigation and sync
checks; preview content is not installed as an editor baseline.

Final refinement verification: `npm run verify` passed (673 tests, typecheck, production build). The full browser suite
passed all 105 tests, including row toggles, separate open-note actions, preview body/link clicks, tooltip-only guidance,
exclusive end bounds, local modified-date filtering, date markers, native dialog resizing, and title sizing. A further
phone check passed for combined `(today, open)` marker layout and default preview expansion. Focused component coverage
also rejects pending responses after changing the date-filter basis. The normal date-navigation/autosave regression
continues to verify that date A's pending content is not written to date B.

Centered-resize regression: the earlier growth-only test missed that the native resize corner lagged behind the
pointer. Before changing production code, the named browser case “the centered search dialog resize corner follows
the pointer throughout the drag” failed in both Chrome and Firefox: after a 20px pointer movement, the corner was
10px behind. The replacement handle uses twice the pointer delta for each dimension while keeping the center fixed,
clamps dimensions to the viewport, supports arrow-key resizing, and keeps its grip outside the scrolling content.
Preview match positioning scrolls the new content surface. Date markers use an explicit `0.375rem` inline gap.
Verification: `npm run verify` passed (673 tests, typecheck, build); all 10 search workflows passed in Chrome and
six focused search/resize/preview workflows passed in Firefox. The pointer-tracking regression now passes in both,
including keyboard resizing. Desktop geometry verifies the 6px marker gap and phone checks retain the compact layout.

Open-note preview refinement: expansion takes an immediate snapshot of the loaded editor's explicit date and
Markdown, reusing it when all search words/phrases match. A missing term falls back to the result's Drive file;
search itself remains limited to synced content. Other notes still load lazily. Preview height is now capped at
`min(22dvh, 220px)`, about one third of its previous limit. Focused tests cover synchronous rendering without
provider access, word/phrase matching, remote fallback without replacing local edits, and first-match visibility
in long notes at desktop and phone sizes. Routine verification passed (675 tests, typecheck, build);
all 11 search workflows passed in Chrome and Firefox.

Drive indexing is eventually consistent. Large-note indexing and long-term repeatability remain outside this
verification; the interface tells users recent changes may take time to appear.
