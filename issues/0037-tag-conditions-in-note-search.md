---
id: "0037"
title: "Filter note search by all selected tags"
status: closed
type: feature
priority: medium
created: "2026-11-08"
labels: [search, tags]
---

# Filter note search by all selected tags

Add suggested removable tag conditions to note search. Require all tags to apply to one matching paragraph/list
item, including inherited ancestor section declarations. Support tag-only searches and retain date filters.
Read candidate Markdown rather than rely on eventually consistent index excerpts. Synced content only.

## Acceptance criteria

- [x] Tag suggestions, add/remove controls, AND semantics, and tag-only searches.
- [x] Paragraph/list-item association and inherited heading scopes without sibling leakage.
- [x] Tagged previews show the first qualifying passage; existing navigation remains unchanged.
- [x] Pending candidate reads cannot publish results after condition changes or closure.
- [x] Routine verification and focused Chrome search workflows pass.

## Verification

`npm run verify` passed: 850 unit/integration tests, typecheck, and production build. The initial sandboxed build
could not bind Nitro's loopback server; verification passed with local networking enabled. All 14 focused Chrome
search workflows passed, including tag-only search, inherited AND conditions, sibling rejection, qualifying previews,
and unchanged selected date on close. Component coverage rejects a pending snapshot after tag removal; domain tests
cover paragraph/section boundaries, reference tags, code, and list-item separation. Mocked Drive coverage confirms
tag-only candidate requests remain authenticated, folder-scoped GETs without content terms.

The full browser search suite also reproduced a shortcut tooltip regression: the menu item's accessible name included
the tooltip, breaking exact-name access. An explicit accessible label fixes it; the existing named menu-search
workflow passes. Tagged previews intentionally show the qualifying passage rather than the entire note.

Tag-only searches download candidate notes sequentially and can be slower for large histories. Index excerpts remain
non-authoritative. Live Google indexing latency was not retested; existing Drive eventual consistency still applies.

Review follow-up: three named regressions failed before production changes, confirming lost word boundaries at hard
breaks, cross-cell tag leakage in tables, and missing section inheritance inside blockquotes. Matching now preserves
hard-break whitespace, checks each table cell separately, and uses a container-local heading stack inheriting outer
section tags. Preview passages are serialized from their Markdown nodes so quote/list markers do not leak into prose.
`npm run verify` passed (853 tests, typecheck, build), followed by all 14 Chrome search workflows. Two additional
focused cases then passed for nested table cells, inline formatting, and quoted multi-line preview serialization
(all nine tagged-search domain tests pass). No sync/editor persistence behavior changed.

Reference-definition review follow-up: three new cases failed before the fix, reproducing missing definitions inside
quotes/lists and incorrect duplicate-definition precedence across containers. Definitions are now collected recursively
in source order and supplied to both structural matching and preview serialization. All 12 tagged-search domain
cases pass. `npm run verify` passed with 858 tests, typecheck, and production build; all 14 Chrome search workflows
also passed. The version remains 0.37.0 for this uncommitted feature change.
