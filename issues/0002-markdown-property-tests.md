---
id: "0002"
title: "Establish Markdown property tests"
status: closed
type: testing
priority: high
created: "2026-09-18"
labels: [markdown, property-testing]
---

# Establish Markdown property tests

## Problem and evidence

The [assessment](../docs/improvement-assessment.md#3-add-properties-for-markdown-and-editor-transformations) identifies
repeated normalization and editing-context regressions. Example tests are valuable but explore few syntax combinations.
[Merge](../src/domain/merge.ts) and persistence normalization provide a bounded starting point for generated properties.

## Outcome and scope

Add a small property-testing foundation with reproducible seeds and minimized failures. Evaluate fast-check as the
initial candidate. Cover merge identities and persistence normalization first; editor selection, general formatting,
and generated lifecycle commands are separate work.

## Acceptance criteria

- [x] Generated merge cases establish `merge(b, x, b) = x`, `merge(b, b, x) = x`, and `merge(b, x, x) = x`, without conflicts.
- [x] Normalization is idempotent and preserves literal code/HTML regions where the current policy promises that.
- [x] Enabled and disabled normalization policies have distinct expectations derived from current product behavior.
- [x] Bounded generators include structured and incomplete Markdown, whitespace, empty input, Unicode, and missing
  final newlines; they exercise combinations rather than only random plain strings.
- [x] Failures report enough seed/shrink information to replay a minimized example; important discovered defects become
  named regressions before fixes.
- [x] A controlled mutation demonstrates that a critical property detects a broken implementation; the mutation is
  removed before completion.
- [x] Routine verification runs a measured, bounded property suite, and contributor documentation explains replay.

## Verification

Use independent expectations, not the production transformation to compute its own expected result. Do not require
merge commutativity: append-only merging intentionally orders local then remote. Do not assert arbitrary byte-identical
Markdown parse/serialize round trips. Run `npm run verify` and record property budgets and observed runtime. No browser
suite is needed solely to add pure tests; apply the normal browser requirements to any discovered production fixes.

## Dependencies and related work

No hard dependencies. Establishes reusable conventions for [#0003](0003-generated-date-bound-lifecycle.md).

## Resolution

Completed in version 0.25.17 using fast-check. Reusable bounded generators combine headings, lists, nested quotes,
links, tables, fenced and indented code, raw HTML, editor placeholders, malformed fragments, whitespace, empty input,
Unicode, trailing spaces, conflict-marker-like text, and optional final newlines. Merge identities use the production
merge only as the subject and compare its output directly with the independently supplied changed input. Normalization
policy cases use an independently constructed expected document rather than invoking the normalizer as an oracle.

Each of the four routine properties runs 200 cases with fixed seed `20260918`; the focused routine run completed in
about 43 ms. A 5,000-case-per-property exploratory run passed in about 400 ms. `FC_SEED`, `FC_PATH`, and `FC_NUM_RUNS`
support exact replay and longer exploration, and [testing documentation](../docs/testing.md#property-test-replay) records
the workflow.

For the controlled mutation, the `local === remote` merge identity was temporarily changed to return the baseline. The
property failed after its first case and shrank to baseline `" "`, changed `"a"`, reporting seed `20260918` and path
`0:0:0:0:0`. The mutation was then removed. No production defect was discovered, so no named regression was needed.

Verification passed with `npm run verify`: 639 tests, typecheck, and the production build. No browser suite was required
because this change adds pure generators, tests, and contributor documentation without changing browser behavior.
