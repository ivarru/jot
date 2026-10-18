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
