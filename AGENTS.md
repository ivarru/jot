# Repository Instructions

## Versioning

This app is deployed continuously. Every commit that changes app behavior, UI, storage or sync semantics, dependencies, or deployment artifacts must bump the `version` in `package.json` and `package-lock.json` before committing.

Choose the SemVer part pragmatically:

- Patch for bug fixes, defensive hardening, regression fixes, and small polish that preserves the existing user workflow.
- Minor for new or meaningfully expanded user-visible capabilities, including new workflows, navigation surfaces, import/export paths, settings, storage/sync behaviors, or UI that lets users do something they could not previously do.
- Major for breaking changes, destructive migrations, or behavior changes that require user/operator coordination.

Pure repository documentation changes that do not affect shipped app behavior do not require a version bump.

## Date-Bound Notes

Daily Note content must never be read from or written to a date inferred after an async boundary. When changing editor, sync, autosave, local draft, or date navigation behavior, carry the explicit `IsoDate` and markdown snapshot through timers, promises, and editor callbacks.

Before finishing such changes, add or update regression tests that cover stale date transitions: switching from date A to date B while a load, autosave, blur, or sync operation for date A is still pending.

## Regression-First Bug Fixes

Bug fixes must start by reproducing the issue with a failing regression test. Do not change production code first and then add a passing test afterward.

For sync bugs, first try to refine `src/sync/syncModel.test.ts` or the focused sync tests so the failure appears as a named trace or regression case. The sync model is described in [docs/sync-model.md](docs/sync-model.md). If the issue is outside the model's scope, add the closest focused regression test and document why the model was not the right fit.

## Verification

The test layers, commands, browser environment, and CI matrix are documented in
[docs/testing.md](docs/testing.md).

Run routine verification before finishing code changes:

```sh
npm run verify
```

Google Drive provider changes must include mocked `fetch` tests for request URLs, methods, auth headers, metadata bodies, media bodies, conflict behavior, and settings behavior. Do not require a live Google account for routine regression coverage.

Browser API workflow changes must include an end-to-end browser regression. This applies to file inputs, clipboard,
camera, drag/drop, auth popups or redirects, and external pickers. The check must exercise the actual user workflow and
assert the resulting app state; verifying that controls render is not sufficient.

Prefer Playwright tests under `tests/browser` for real-browser regressions involving browser editing behavior, viewport
layout, DOM geometry, or other interactions that benefit from browser-native assertions. Put shallow application-health
checks in `tests/browser/smoke` and generated-output checks in `tests/artifact`.

For fake-provider browser checks, choose the focused browser command that covers the workflow you changed. The suite
builds and starts its own fake-provider preview unless `BROWSER_TEST_BASE_URL` is set. Common commands:

```sh
npm run test:browser:editing
npm run test:browser:workflows
npm run test:browser:code-block-layout
npm run test:browser:reconnect-conflict
```

Do not leave local development or test servers running after development or verification work is complete.
