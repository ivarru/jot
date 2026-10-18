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
even-major runtime. Prerendering uses loopback; set `failOnError` so denied
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
