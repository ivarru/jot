# Dependency maintenance

This records the dependency migrations started on 2026-10-18. Versions are
resolved in `package-lock.json`; each implementation stage has its own commit
and app patch version so regressions can be bisected.

## Browser security and editor compatibility (0.33.1)

- Update DOMPurify to 3.4.17, Solid to 1.9.17, SolidStart to 1.4.0,
  and Seroval to the patched 1.6 series.
- Resolve ProseMirror View to 1.42.6, beyond the paste-XSS fix in 1.42.3.
- Update Milkdown kit and automd together to 7.22.3. Patched ProseMirror's
  attribute validation exposed the older Milkdown parser's string-valued
  list attributes; the new parser supplies booleans.
- Preserve Jot's existing inline-code affinity behavior with inclusive marks.
  Jot already controls code entry/exit with its own DOM/source affinity plugin;
  adopting Milkdown's new non-inclusive default breaks toolbar exit and source
  selection. Existing component and Chrome regressions reproduce both failures.
- Update the direct serializer assertion for empty paragraphs: Milkdown now
  omits their content without its preservation plugin. The assertion still
  checks that the live paragraph and caret survive structural Tab.
- Allow canonical `jot:tag/<name>` links through the new DOM scheme filter;
  all other destinations retain upstream sanitization. A component regression
  first failed for valid tags and now also verifies unsafe schemes stay blocked.

Verification: `npm run verify` passed (754 tests, typecheck, production build).
Eleven focused Chrome checks passed for inline-code typing/toggling and repeated
tag navigation at desktop and mobile widths. An earlier full browser run was
interrupted after a concurrent rebuild invalidated its preview; the complete
suite will be repeated against the final stable migration build.

Audit counts include inherited build/test dependencies and are not a count of
confirmed vulnerabilities in Jot's deployed static application. Do not use
`npm audit fix --force`: suggested downgrades can remove required functionality.

## Math renderer (0.33.2)

Update KaTeX to 0.19.0. Override only `micromark-extension-math`'s older KaTeX
range with the direct dependency (`$katex`) so parsing and rendering resolve one
patched version. Its public renderer API is unchanged for this use; keep
`trust: false` and DOMPurify sanitization as independent defenses.

The initial install retained an invalid nested 0.16.47 lock entry. Removing that
stale entry and resolving again produces a single deduplicated 0.19.0; verify
with `npm ls katex`, not only the manifest's requested version.

Verification: `npm run verify` passed (754 tests, typecheck, build), and the
Chrome LaTeX workflow passed, including persisted Markdown preservation.

## Test tools (0.33.3)

Migrate Vitest 3 to 5.0.5, jsdom 26 to 30.1.3, and jest-dom 6 to 7.0.1.
Update Playwright to 1.64.1, user-event to 14.6.8, fast-check to 4.10.2,
and Vite to 6.4.4. The existing pinned Node 24.16 runtime meets their
requirements. Keep Vitest's new mock-clearing default; no compatibility
setting is needed by the existing tests.

Retain and exactly pin fake-indexeddb 6.2.5. Version 6.2.6 reproducibly throws
an uncaught `should have been able to remove transaction` from its transaction
queue when running `src/storage/indexedDb.test.ts`; all six assertions pass
but the run correctly fails on that uncaught exception. Do not suppress the
error or alter application transaction handling to compensate for a test fake.

Verification: `npm run verify` passed (754 tests, typecheck, build) with no
unhandled errors. The upgraded Playwright runner passed the preview-assets
check using the Chrome-configured fake-provider preview.

## Diff engine (0.33.4)

Update `diff` from 8.0.4 to 9.0.0 independently of framework changes because
its line/character diffs participate in conflict merging and source selections.
The existing public APIs need no adaptation. `npm run verify` passed all 754
tests (including merge properties, replication traces, and editor selections),
type checking, and the production build.

## Framework and static deployment (0.33.5)

Migrate to SolidStart 2.0.6, Router 1.0.0, and Vite 8.3.4. Replace Vinxi
commands and `app.config.ts` with `vite.config.ts`, SolidStart's Vite plugin,
and Nitro's static preset. Preserve client-only rendering, `.output/public`,
`_build/assets`, the root preview, and the `/jot/` Pages artifact.

SolidStart 2's documented deployment plugin is Nitro 3, currently beta;
pin 3.0.260903-beta exactly. This plugin runs only during development/build/
preview; Pages still publishes static files. Remove the old global H3 v1
override so the new framework can use its required H3 v2.

Use `@solidjs/start/env`, make document assets optional as required by v2,
and declare Node 24 build types explicitly. Remove obsolete missing-Node-type
suppression comments from CSS tests. Require Node 24.16 or a supported newer
runtime on Node 26+. Prerendering uses loopback; set `failOnError` so denied
worker startup cannot silently produce a missing app shell.

The new compiler can place comments before dynamic date text. The browser
geometry check now measures the date text node, not `firstChild`. The artifact
check imports the emitted module directly instead of expecting Vinxi's removed
`window.manifest`; actual base-path rendering remains required.

Verification: `npm run verify` passed (754 tests, types, static build).
Twelve selected Chrome startup/search/auth-renewal checks passed; the adapted
date geometry check passed on an isolated rerun. Both Pages artifact checks
passed after `npm run build:pages`, including importing the built app at `/jot/`.

## TypeScript compiler (0.33.6)

Migrate TypeScript 5.9 to 7.0.2. Remove the deleted `baseUrl` option and make
the existing `~/*` path mapping explicitly relative (`./src/*`). Preserve
strictness and the existing alias; no application types need weakening.
Use JSON import attributes in the Vite config for native Node compatibility.

Verification: all 754 tests, TypeScript 7 checking, and the production static
build passed. Type checking/build are repeated after the JSON import cleanup.

## Editor snapshot compatibility (0.33.7)

The complete Chrome run exposed three additional compatibility regressions.
Preserve a final empty paragraph's block boundary in source snapshots so link
and tag insertion cannot join the preceding paragraph. A focused snapshot test
failed before this fix. Keep the new canonical tight-list/angle-URL output for
explicit link insertions; browser tests still assert the exact resulting text.

Deferred app focus now belongs to a focus revision: newer input, pointer
activity, content replacement, or an explicit selection cancels it. Two focused
tests first reproduced old-caret overwrites. Empty-block DOM retries also retain
their document/selection and active-session guards.

A transaction trace identified Milkdown's list-item node view restoring its
mount-time caret after the first typed character. Guard only that node view's
selection-only dispatches against a newer document/selection; keep the upstream
rendering, task interaction, cleanup, and shared per-editor batching. A real
ProseMirror wrap/insert test fails with the upstream view and passes with the
guard. The unmodified native typing workflow failed twice in five repetitions
before the fix and passed all five afterward, without sleeps or retries.

Extend the old-date callback regression to include a trailing empty paragraph
while A changes to B. These editor DOM/snapshot behaviors are outside the bounded
replication model; existing replication/date-bound tests remain in the full run.

Verification: 78 editor component tests, type checking, and all 14 affected
Chrome list/link/tag workflows passed. Routine verification is repeated against
the dependency tree from the preceding commit before committing this fix.
That run passed all 759 tests, type checking, and the production static build.

## Transitive patches and final verification (0.33.8)

Refresh Browserslist to 4.29.3 and baseline-browser-mapping to 2.11.29,
including compatible supporting packages. A clean `npm ci` succeeds from the
final lockfile. `npm outdated` lists only the deliberate fake-indexeddb pin
and Node types retained on major 24 to match the runtime.

An actual Vite development-server check exposed an unresolved CommonJS default
import from the SolidStart overlay's trace-mapping chain. A startup health test
first failed on the JavaScript/console errors; explicitly prebundling
`@jridgewell/trace-mapping` fixes it. That test and native editor/date shortcuts
both pass against `npm run dev`, and the temporary dev server is stopped.

The audit reports four high-severity package entries, down from 32 affected
entries initially (including five critical). All four remaining entries
originate from one advisory:
[braces stack exhaustion](https://github.com/advisories/GHSA-vfj7-8cjw-p6xm),
in the SolidStart → micromatch/fast-glob build dependency chain. The available
braces version is still affected. npm suggests downgrading SolidStart to 1.4.0;
do not apply that as an automatic fix. The affected path processes build-time
glob patterns; this is not evidence of an exploitable path from Daily Note
content in the static application. Reassess when upstream publishes a fix.

Final verification: `npm run verify` passed all 759 tests, type checking, and
the production build. The Pages build and both artifact checks passed. The
complete Chrome suite passed 156 of 157 tests; the raw Tab undo test failed in
its text-replacement setup, matching the existing flake recorded in
[issue 0017](../issues/0017-daily-note-drive-search.md). Its isolated rerun
passed. All other Chrome tests, including startup health, passed in the full
run. No local development or test servers remain running.

## November refresh: security and routine packages (0.39.1)

Update Solid to 1.9.18, Meta to 0.29.8, Router to 1.0.1, KaTeX to 0.19.1,
Vite to 8.3.6, Playwright to 1.65.0, and Vitest to 5.1.0. Refresh Seroval
and its plugins to 1.6.12, addressing
[GHSA-f86p-h4j2-7qgj](https://github.com/advisories/GHSA-f86p-h4j2-7qgj).
Keep the math override deduplicated and the editor/framework pins unchanged
for separate verification stages. npm audit now reports zero vulnerabilities.

Verification: `npm run verify` passed all 879 tests, typecheck, and production
build. All 40 focused Chrome checks passed for preview health, math, search,
and compact inline formatting. No application code changes were needed.

## November refresh: Milkdown (0.39.2)

Update kit and the exactly pinned automd plugin together to 7.23.0. Upstream
fixes include hard-break attribute preservation and long-space parsing; see the
[kit changelog](https://github.com/milkdown/milkdown/blob/v7.23.0/packages/kit/CHANGELOG.md).
Retain Jot's existing selection, inline-code affinity, and list-view guards.
No application adaptation was needed.

Verification: `npm run verify` passed 879 tests, types, and build. The complete
Chrome suite passed all 210 tests, including native editor input, paste,
selection, undo, tags, search, storage, auth, and security-policy workflows.

## November refresh: framework and build (0.39.3)

Update SolidStart to 2.2.2 and the exact Nitro pin to 3.0.261103-rc. Preserve
static output, the root preview, fail-on-error prerendering, and Pages paths.

The first production build failed during prerendering: SolidStart's Seroval
1.7 imports were externalized to the root Seroval 1.6 copy required by Solid.
The missing `Stream` export reproduced the incompatibility. Bundle Seroval
and its plugins in SSR so each importer retains its own dependency resolution;
do not force Solid onto an unsupported serialization range. Both installed
Seroval series are patched. The existing build and rendered-artifact checks
exercise this boundary without adding a configuration-mirroring unit test.

Verification: 879 tests, types, and production build passed. All 210 Chrome
regressions passed. The Pages build and all seven artifact/security checks
passed at `/jot/`. The actual Vite development server passed the Chrome
app/editor startup check with no JavaScript or console errors. Servers stopped.

## November refresh: pinned Node runtime (0.39.4)

Move `.node-version` to Node 26.13.0 LTS and Node types to 26.6.6. Deployment
already reads this file, so CI follows the new pin without workflow changes.
The existing engine range still permits Node 24.16+, which passed the preceding
stages; this changes the default development/deployment runtime rather than
introducing a new runtime API requirement. See the
[official LTS release](https://nodejs.org/en/blog/release/v26.13.0).

Verification used the official macOS ARM64 archive checked against its
published SHA-256. A clean `npm ci`, all 879 tests, typecheck, production and
Pages builds, 17 focused Chrome startup/formatting checks, all seven artifact
checks, and actual development-server startup passed under Node 26.13.0
(with its bundled npm 11.20.0). No machine-global runtime was replaced.

## November refresh: jsdom (0.39.5)

Update the test DOM from 30.1.3 to 31.0.0 independently of the runtime and
framework upgrades. Its engine requirement is met by the pinned Node 26 LTS.
No test compatibility settings or application changes were necessary.

Verification under Node 26: `npm run verify` passed 879 tests, typecheck, and
build. The Pages build and all seven artifact checks passed, including actual
base-path rendering through the test DOM. Production browser dependencies did
not change in this stage; earlier full Chrome coverage remains applicable.
