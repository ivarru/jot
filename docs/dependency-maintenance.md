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
