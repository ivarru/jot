---
id: "0038"
title: "Add tags to search result passages"
status: closed
type: feature
priority: medium
created: "2026-11-08"
labels: [search, tags]
---

# Add tags to search result passages

## Outcome and scope

Add tags to one matching paragraph/list item from an expanded search result, with a visible exact target and existing
catalog suggestions. Skip tags already in scope. No bulk or whole-section tagging. Preserve source Markdown and the
selected date; reject stale snapshots and respect editing ownership, local drafts, account epochs, and normal sync.

## Acceptance criteria

- [x] Expanded results offer a passage preview and suggested removable tags before applying.
- [x] Adding tags preserves other content, skips duplicates/inherited tags, and updates the preview.
- [x] Changed targets and newer drafts are never overwritten; failures allow explicit refresh.
- [x] Pending operations retain their explicit date across navigation and account changes.
- [x] Routine verification and focused Chrome workflows pass.

## Verification

Domain tests cover exact source preservation, paragraph/list/table targets, inherited and duplicate tags, and heading/
section-declaration exclusion. Focused persistence tests cover remote baselines, local compare-and-set races, stale
remote/local content, retained dirty drafts on save failure, lifecycle cancellation, and explicit date A operations
remaining bound to A while navigation changes to B (or cancelling when A becomes the selected editor).

This workflow prepares a source edit outside the bounded replication model; it uses the existing replication core
unchanged. Focused persistence tests are the appropriate layer for its snapshot/ownership preparation boundaries.

`npm run verify` passed: 869 tests, typecheck, and production build. Chrome's full search suite passed 18 of 19 cases;
the WYSIWYG undo case used Ctrl+Z on macOS. After switching both open-note cases to the existing platform-aware
undo helper, both passed on a focused rerun. Together these runs cover all 19 search workflows, including ordinary
and tag-filtered unopened-note tagging, retained previews after collapse, stale-source rejection/refresh, unchanged
selected date/content, and open-note undo in both editor modes. Verification used local networking for preview servers;
no test servers were left running.

Version 0.38.0. No whole-section or bulk tagging is included. Concurrent changes conservatively require refresh;
failed remote saves retain the tagged local draft for ordinary recovery. No live Google account was required.

Table-cell review follow-up: final header/body cell regressions failed before the fix, confirming that the parser's
cell span includes the closing pipe. Taggable passages now carry a separate insertion offset at the last inline
node's end for table cells, keeping tags inside their delimiters without rewriting whitespace or other content.
Empty cells are not offered as tagging targets. Additional tests cover formatted inline content, escaped pipes,
CRLF line endings, and rows without trailing pipes. `npm run verify` passed with 876 tests, typecheck, and production
build. All 21 Chrome search workflows passed, including actual tagging of final header/body cells, exact remote
Markdown preservation, rendered table structure, and unchanged selected date. Version remains 0.38.0 for the same
uncommitted feature change.

Heading-scope review follow-up: two new domain regressions failed before the fix, confirming heading-only false
positives for text-plus-tag searches and heading previews for tag-only searches. Search now applies the same
heading/declaration exclusions as tagging, while still using those nodes to establish inherited section scope.
Tag-only results require a body passage and preview that first passage. `npm run verify` passed with 878 tests,
typecheck, and build. All 22 Chrome search workflows passed, including heading-only rejection, tag-only body previews,
and exclusion of declaration-only sections. Version remains 0.38.0 for this uncommitted feature change.
