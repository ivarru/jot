---
id: "0009"
title: "Coordinate shared-storage tabs"
status: open
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
read-only or require an explicit takeover that first protects the previous page's committed draft. Refreshes must not
silently replace an unsynced edit. Sign-out must end the account session in every open page; stale pages must stop local
and remote writes before cleared account state can be recreated.

## Acceptance criteria

- [ ] Two pages in one browser context exercise overlapping edits and refreshes, asserting visible and persisted Markdown
  and status under the policy above.
- [ ] Sign-out in one page with pending work in another leaves all pages signed out and cannot resurrect cleared drafts.
- [ ] Browser tests use actual IndexedDB, wait for observable transitions, and run independently.
- [ ] Add focused lower-layer regressions before fixing any reproduced defect; run `npm run verify:full`.

## Resolution

Pending.
