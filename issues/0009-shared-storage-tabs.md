---
id: "0009"
title: "Coordinate shared-storage tabs"
status: closed
type: feature
priority: high
created: "2026-10-01"
labels: [browser, storage, sync]
---

# Coordinate shared-storage tabs

## Problem and evidence

Split from [#0005](0005-offline-restart-and-shared-tabs.md). Each page has independent editor and authentication state,
but pages in one browser context share IndexedDB and localStorage. The current route does not react to storage events,
so a page can retain obsolete authenticated and editor state after another page signs out. Concurrent edits to one date
also need an explicit coordination rule before a browser assertion can be meaningful.

## Intended policy

Only one page may actively edit a given Daily Note at a time. Another page sharing that date must show that it is
read-only while the first page is active. Ownership must be tied to a live browser page, never a persistent IndexedDB or
localStorage flag. Closing or crashing the owner must release ownership so another page can become editable after it
reloads the latest committed Local Draft and checks its remote baseline. Refreshes must not
silently replace an unsynced edit. Sign-out must end the account session in every open page; stale pages must stop local
and remote writes before cleared account state can be recreated.

## Acceptance criteria

- [x] Two pages in one browser context exercise overlapping edits and refreshes, asserting visible and persisted Markdown
  and status under the policy above.
- [x] Closing or crashing the editing page allows another page to acquire editing ownership without a persistent
  read-only state or loss of a committed Local Draft.
- [x] Sign-out in one page with pending work in another leaves all pages signed out and cannot resurrect cleared drafts.
- [x] Browser tests use actual IndexedDB, wait for observable transitions, and run independently.
- [x] Add focused lower-layer regressions before fixing any reproduced defect; run `npm run verify:full`.

## Resolution

Daily Note editing now uses a page-lifetime Web Lock for each date. A waiting tab shows the latest committed Local Draft
read-only, then reloads it on ownership transfer. A renderer-crash browser test confirms the lock is released without
leaving a persistent read-only date. Draft mutations and account clearing share a separate Web Lock and session epoch;
other tabs sign out on epoch change and stale writes cannot recreate cleared drafts. Background synchronization skips
dates owned by another tab.

Verification: `npm run verify:full` passed (unit tests, typecheck, build, 94 browser tests). Focused link-modal stress
test passed 20 repeats. Browser regressions cover ownership transfer, refresh, sign-out with queued writes, stale date
navigation, and renderer crash recovery. Browsers without Web Locks keep editing read-only.

Review regressions: a delayed WYSIWYG callback for date A cannot overwrite another tab's draft after navigation to B.
Navigation releases A's editing lock once the local commit finishes. A departed-date sync then checks ownership around
each Local Draft step and the start of remote work; an in-flight response cannot alter a newer owner's draft. Browser
regressions confirm that A syncs without being reopened in a single tab and that a new owner's edit reaches remote
storage while the departing tab remains on B.
