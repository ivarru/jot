## 1. Regression Coverage

- [x] 1.1 Add failing domain and editor regressions for selective normalization with a protected collapsed-caret line, including paragraph and list-item placeholders; verify they fail against 419d3f9.
- [x] 1.2 Add focused route regressions for foreground-loss saving and sync completion while the caret remains in the protected line; verify live editability, selection, Local Draft, and remote Markdown.
- [x] 1.3 Add a Playwright editing regression that waits through the asynchronous sync boundary for an empty list item; verify caret placement, live editability, and persisted canonical content.
- [x] 1.4 Add disabled-preference regressions in raw and WYSIWYG route/sync flows; verify autosave and sync completion preserve active and non-active placeholders in the live editor, Local Draft, and remote state.

## 2. Selective Normalization

- [x] 2.1 Extend context-aware Markdown normalization to accept a protected source line for a collapsed caret while retaining fenced-code, indented-code, and raw-HTML preservation, including a caret on a raw-HTML opening line; verify focused domain tests.
- [x] 2.2 Derive distinct selective-live and fully canonical persistence snapshots from the current date-bound editor value and selection; capture the explicit date and canonical snapshot before autosave timers, and verify A-to-B navigation cannot retarget them.
- [x] 2.3 Apply selective live normalization without losing the protected caret line or moving its selection in WYSIWYG and raw modes; verify focused component/route regressions.

## 3. Sync Result Safety

- [x] 3.1 Prevent a successful local/Drive canonical sync result from overwriting a divergent live snapshot whose only retained placeholder is the protected caret line; verify date A stale completion after navigation to date B remains ignored.
- [x] 3.2 Keep sync status, canonical baselines, clean remote-refresh eligibility, retry deduplication, conflict handling, and disabled-preference behavior correct when live and persistence snapshots intentionally differ; verify replication and route tests.

## 4. Documentation and Verification

- [x] 4.1 Update sync-safety and settings-facing documentation to describe active-line preservation and canonical persistence; verify the documented behavior matches the acceptance tests.
- [x] 4.2 Patch-bump package.json and package-lock.json for the behavioral fix, then run `npm run verify` and the focused Playwright workflow with no test or build failures.
