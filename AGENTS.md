# Repository Instructions

## Versioning

This app is deployed continuously. Every commit that changes app behavior, UI, documentation, or deployment artifacts must bump the `version` in `package.json` and `package-lock.json` before committing. Choose the SemVer part pragmatically: patch for fixes and small polish, minor for user-visible improvements, and major for breaking or migration-heavy changes.

## Date-Bound Notes

Daily Note content must never be read from or written to a date inferred after an async boundary. When changing editor, sync, autosave, local draft, or date navigation behavior, carry the explicit `IsoDate` and markdown snapshot through timers, promises, and editor callbacks.

Before finishing such changes, add or update regression tests that cover stale date transitions: switching from date A to date B while a load, autosave, blur, or sync operation for date A is still pending.

## Regression-First Bug Fixes

Bug fixes must start by reproducing the issue with a failing regression test. Do not change production code first and then add a passing test afterward.

For sync bugs, first try to refine `src/sync/syncModel.test.ts` or the focused sync tests so the failure appears as a named trace or regression case. The sync model is described in [docs/sync-model.md](docs/sync-model.md). If the issue is outside the model's scope, add the closest focused regression test and document why the model was not the right fit.

## Verification

Run these before finishing code changes:

```sh
npm run test
npm run typecheck
npm run build
```

Google Drive provider changes must include mocked `fetch` tests for request URLs, methods, auth headers, metadata bodies, media bodies, conflict behavior, and settings behavior. Do not require a live Google account for routine regression coverage.

For browser checks of the fake-storage milestone:

```sh
VITE_ENABLE_FAKE_AUTH=true npm run build
npm run preview
```
