---
id: "0002"
title: "Establish Markdown property tests"
status: open
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

- [ ] Generated merge cases establish `merge(b, x, b) = x`, `merge(b, b, x) = x`, and `merge(b, x, x) = x`, without conflicts.
- [ ] Normalization is idempotent and preserves literal code/HTML regions where the current policy promises that.
- [ ] Enabled and disabled normalization policies have distinct expectations derived from current product behavior.
- [ ] Bounded generators include structured and incomplete Markdown, whitespace, empty input, Unicode, and missing
  final newlines; they exercise combinations rather than only random plain strings.
- [ ] Failures report enough seed/shrink information to replay a minimized example; important discovered defects become
  named regressions before fixes.
- [ ] A controlled mutation demonstrates that a critical property detects a broken implementation; the mutation is
  removed before completion.
- [ ] Routine verification runs a measured, bounded property suite, and contributor documentation explains replay.

## Verification

Use independent expectations, not the production transformation to compute its own expected result. Do not require
merge commutativity: append-only merging intentionally orders local then remote. Do not assert arbitrary byte-identical
Markdown parse/serialize round trips. Run `npm run verify` and record property budgets and observed runtime. No browser
suite is needed solely to add pure tests; apply the normal browser requirements to any discovered production fixes.

## Dependencies and related work

No hard dependencies. Establishes reusable conventions for [#0003](0003-generated-date-bound-lifecycle.md).

## Resolution

Pending.
