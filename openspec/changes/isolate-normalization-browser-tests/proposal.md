## Why

The enabled-by-default placeholder normalizer is coupled to browser tests for unrelated editor behavior, so policy
changes create widespread expectation churn. It also currently mistakes equivalent Milkdown serialization differences
for normalization changes and can replace the live document, moving selections and breaking toolbar or modal insertion.

## What Changes

- Apply a selective live-editor replacement only when placeholder normalization actually changes the editor's current
  serialized Markdown.
- Preserve focus, selection, insertion anchors, and equivalent Markdown formatting when normalization has no work to do.
- Add explicit enabled, disabled, and product-default normalization profiles to the fake-provider browser harness, with
  settings established before editor loading or synchronization.
- Run general editor and Markdown-fidelity tests with normalization disabled; keep normalization-contract tests enabled.
- Keep a small enabled compatibility matrix for representative toolbar, modal insertion, autosave, sync, and conflict
  workflows, asserting user-visible invariants rather than incidental serialization.
- Hold saves captured from a date's pre-refresh state while a clean remote refresh for that date is in flight, then
  discard stale snapshots or re-evaluate the current explicit snapshot after the refresh resolves.
- Correct stale browser assertions for the application version and conflict editing state.
- Require the complete browser suite through `npm run verify:full` before completion.

## Capabilities

### New Capabilities

- None.

### Modified Capabilities

- `editor-placeholder-normalization`: Require normalization to leave an equivalent live editor document and its active
  selection untouched when no eligible placeholder changes, including across focus transfer to app controls, and keep
  canonical persistence safe when a newer remote refresh supersedes an older scheduled snapshot.

## Impact

- Affects live/canonical snapshot comparison in the Daily Note route, selected-note replication generations, scheduled
  save guards, fake-provider settings setup, shared Playwright helpers, browser workflow classification, and
  normalization compatibility coverage.
- No public API, storage schema, Drive format, or intended normalization policy change is expected.
