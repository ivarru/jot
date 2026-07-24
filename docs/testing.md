# Testing

Jot uses several complementary test layers. Tests should live in the lowest layer that can reproduce the behavior,
with real-browser coverage added when browser behavior is part of the risk.

## Test Layers

| Layer | Location | Runner | Responsibility |
| --- | --- | --- | --- |
| Unit and integration | `src/**/*.test.ts(x)` | Vitest and jsdom | Domain logic, editor/model integration, components, storage, mocked providers, and focused regressions |
| Sync model | `src/sync/syncModel.test.ts` | Vitest | Bounded traces and invariants for Daily Note synchronization |
| Browser editing | `tests/browser/editing` | Playwright | Native selection, keyboard input, clipboard behavior, layout, and DOM geometry |
| Browser workflows | `tests/browser/workflows` | Playwright | Complete user workflows against development storage and fake providers |
| Browser smoke | `tests/browser/smoke` | Playwright | A small critical-path check that the built preview starts and serves its assets |
| Artifact | `tests/artifact` | Playwright test runner | Generated GitHub Pages files, paths, manifest, service worker, and build assets |
| Manual external | `docs/manual-*.md` | A real browser and account | OAuth and provider behavior that should not be required for routine regression coverage |

The word **smoke** is reserved for shallow application-health checks. A focused browser bug reproduction is a browser
regression even when Playwright is the runner.

## Commands

Routine verification for any code change:

```sh
npm run verify
```

This runs Vitest, TypeScript, and the production build. The individual commands remain available:

```sh
npm run test
npm run typecheck
npm run build
```

Real-browser verification:

```sh
npm run test:browser
npm run test:browser:editing
npm run test:browser:workflows
npm run test:smoke
```

Focused aliases such as `npm run test:browser:raw-keyboard` and
`npm run test:browser:reconnect-conflict` are useful while developing. Pass normal Playwright options after `--`, for
example:

```sh
npm run test:browser:raw-keyboard -- --grep "inline-code boundary"
```

Full local verification:

```sh
npm run verify:full
```

GitHub Pages preflight:

```sh
BASE_PATH=/jot/ VITE_GOOGLE_CLIENT_ID=your-client-id.apps.googleusercontent.com npm run verify:pages
```

`verify:pages` runs Vitest, typecheck, all fake-provider browser regressions, the Pages build, and artifact validation.

## Browser Environment

Browser tests build and start a fake-provider preview automatically. The build log is
`/tmp/jot-preview-test-fake-build.log`; the preview log is `/tmp/jot-preview-test-fake-preview.log`.

To use an already-running preview, set `BROWSER_TEST_BASE_URL`:

```sh
BROWSER_TEST_BASE_URL=http://127.0.0.1:4173/ npm run test:browser:editing
```

The Playwright configuration uses one Chrome worker so that browser-local storage and the preview server remain
deterministic. Failed checks retain a trace and capture a screenshot.

## Choosing a Test Layer

- Prefer a pure unit test for transformations, parsing, formatting, and state transitions.
- Use a component or integration test for Solid wiring, Milkdown's document model, storage coordination, or mocked
  network behavior.
- For sync bugs, first refine the deterministic sync model or the nearest focused sync test. Use a route test when the
  behavior depends on lifecycle wiring outside the model.
- Add a browser editing regression when the behavior depends on native selection, keyboard input, clipboard events,
  browser layout, or DOM geometry.
- Add a browser workflow regression for file inputs, camera, drag/drop, auth navigation, external pickers, or a
  multi-step user flow. Exercise the real browser boundary and assert the resulting application state.
- Add an artifact test when correctness depends on generated files or base-path rewriting rather than an interactive
  browser session.
- Keep real Google accounts out of routine automated coverage. Mock Drive requests, use fake providers for browser
  workflows, and maintain a manual checklist for provider integration.

## Regression Workflow

Bug fixes follow red-green-refactor:

1. Reproduce the issue with a named failing test in the lowest suitable layer.
2. Make the smallest production change that turns it green.
3. Add a browser regression as well when the original failure crosses a native browser boundary.
4. Refactor only after the regression is protected.

Daily Note work that crosses timers, promises, editor callbacks, storage operations, or date navigation must cover stale
date transitions explicitly. Carry the exact date and markdown snapshot through the asynchronous boundary.

## Writing Browser Tests

- Organize specs by product behavior under `editing`, `workflows`, or `smoke`; do not organize them by implementation
  module.
- Use the shared helpers in `tests/browser/helpers` for editor interaction, clipboard permissions, and fake IndexedDB
  setup.
- Assert persisted Markdown, fake remote state, navigation, or another user-visible result. Rendering a control is not
  sufficient workflow coverage.
- Prefer Playwright's locator assertions and polling over fixed delays.
- Seed deterministic state instead of depending on test order.
- Keep focused scenarios independently runnable with a file path or `--grep`.
- Do not leave preview or development servers running after a test command finishes.

## CI And Release Coverage

The Pages deployment workflow runs `npm run verify:pages` before uploading the artifact. A deployment is therefore gated
by:

1. Vitest regressions and the sync model.
2. TypeScript checking.
3. The complete fake-provider Playwright browser suite.
4. The production Pages build.
5. Pages artifact validation.

Real OAuth, Drive, and Google Photos behavior remains a manual release check because it requires account state and
external services. See [manual-google-photos-retest.md](manual-google-photos-retest.md).

## Domain-Specific References

- [Sync model](sync-model.md) documents the modeled state, events, invariants, and scope.
- [Deployment](deployment.md) documents Pages and OAuth release configuration.
- [Manual Google Photos retest](manual-google-photos-retest.md) documents real-provider validation.
