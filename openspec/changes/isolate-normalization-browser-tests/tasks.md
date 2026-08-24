## 1. Regression Classification and Coverage

- [x] 1.1 Preserve the current 14-failure full-browser result as a classification checklist, assign each failure to production behavior, normalization-policy isolation, or stale assertion, and verify every failure has an explicit disposition before code changes.
- [x] 1.2 Add a failing focused route/component regression where equivalent live editor serialization differs from application Markdown but normalization changes nothing; verify autosave does not replace the editor or alter selection.
- [x] 1.3 Add failing focused browser regressions for toolbar and modal insertion after leaving the caret in an empty paragraph, with normalization enabled; verify the current code loses or moves the insertion anchor.
- [x] 1.4 Add a stale-date regression that navigates A→B while remembered selection or autosave work for A is pending; verify no A selection or Markdown is applied to B.
- [x] 1.5 Add a failing sync-model or closest focused replication regression where a short clean revision-7 snapshot schedules a save, a longer revision-8 refresh starts before the save reaches remote I/O, and the save becomes due while loading is delayed; verify the current code can overwrite the refresh.
- [x] 1.6 Add focused regressions for an unchanged, failed, and aborted refresh plus edits typed during refresh; verify barrier cleanup re-evaluates only the latest explicit date/Markdown snapshot.

## 2. Live Normalization Safety

- [x] 2.1 Determine live replacement from the normalized-live versus input-live pair while keeping canonical persistence comparisons separate; verify serializer-only LaTeX and equivalent-Markdown fixtures are not replaced.
- [x] 2.2 Retain a date-, mode-, and snapshot-bound collapsed editor selection across focus transfer to app-owned controls, invalidate it on stale or unsafe activity, and verify toolbar/image/tag insertion uses the correct anchor.
- [x] 2.3 Preserve selective removal of eligible non-active placeholders and translated caret placement when normalization genuinely changes the live document; verify focused raw and WYSIWYG regressions.
- [x] 2.4 Establish a per-date barrier before clean remote loading, hold and coalesce pre-refresh saves, and on every refresh outcome release the barrier and re-evaluate one current explicit snapshot; discard stale snapshots when newer content applies and verify current-generation conflicts remain unchanged.

## 3. Browser Test Isolation

- [x] 3.1 Extend fake-provider browser setup with explicit `enabled`, `disabled`, and `default` normalization profiles seeded before editor loading or sync; verify startup cannot normalize before the requested profile applies.
- [x] 3.2 Migrate general editing and exact-Markdown-fidelity tests to the disabled profile, normalization-contract tests to enabled, and default-setting coverage to default; verify profile choices are explicit at shared setup call sites.
- [x] 3.3 Add a compact enabled compatibility matrix for formatting, modal insertion, autosave/sync, conflict pause, and date navigation; verify focus, editability, selection, character order, and persisted content without over-specifying incidental serialization.

## 4. Existing Browser Assertions

- [x] 4.1 Replace the hard-coded diagnostics version expectation with the package version or another production-derived value and verify the diagnostics workflow passes after future version bumps.
- [x] 4.2 Restore or verify read-only editor behavior while a sync conflict is open, without changing normalization policy, and verify both the conflict browser workflow and diagnostics pause behavior.
- [x] 4.3 Re-run each formerly failing browser spec in isolation, including the clean stale-phone-cache workflow with its original exact editor/draft/remote assertions, and verify all 14 original failures are resolved by their recorded disposition.

## 5. Documentation and Verification

- [x] 5.1 Update browser-testing documentation to explain normalization profiles and require `npm run verify:full` for cross-cutting editor, autosave, sync, or settings changes.
- [x] 5.2 Patch-bump package.json and package-lock.json for the behavioral correction, run focused regressions repeatedly, then run `npm run verify:full` with no unit, typecheck, build, or browser failures.
