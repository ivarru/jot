# Static deployment and supply-chain review

Review date: 2026-10-18. Reviewed code: `ee29113`, app `0.34.2`.
This records [#0025](../issues/0025-review-deployment-security.md). No deployment, GitHub/Google setting, dependency,
workflow, or production browser policy was changed. Local artifacts use a synthetic public OAuth client ID.

Follow-up status and current remediation evidence are consolidated in [security verification](security-verification.md).
The findings and results below remain the dated review snapshot.

## Build and workflow trust

`.github/workflows/deploy.yml` runs on `master` pushes and manual dispatch, not pull-request events. The build checks
out the selected revision, installs with `npm ci`, requires a Google client ID, and runs `verify:pages`: tests,
typecheck, fake-provider browser workflows, a fresh production Pages build, and artifact checks. Test preview scripts
set fake auth only in their child build process; the final Pages build runs afterward. Only `.output/public` is uploaded.
The deploy job depends on that build and names the `github-pages` environment. Whether branch protection, environment
reviewers and allowed deployment branches are configured is not established by the YAML and was not inspected.
A manual run's selected ref is another trusted release input; do not assume the push branch filter constrains dispatch.

Workflow-level permissions grant `contents:read`, `pages:write` and `id-token:write` to both jobs. This makes the build
and dependency/action execution environment broader than necessary. Checkout also persists its read credential by
default. Build code and actions must be trusted; npm integrity is not a sandbox. There is no demonstrated compromised
package or permission escalation here. [#0034](../issues/0034-harden-deployment-workflow-trust.md) tracks reducing the
build's authority and pinning action revisions. The protected environment must not be described as proven enforced.

All five action references are mutable major tags: checkout/setup-node v5, configure-pages v6,
upload-pages-artifact/deploy-pages v5. `.node-version` pins Node `24.16.0`, while `ubuntu-latest` and installed runner
tools can change. The lockfile records 465 npm-registry package entries, all with integrity values; no git/URL package
source or registry entry missing integrity was found. The sole `hasInstallScript` entry is optional `fsevents`.
This inventory does not imply other package code cannot execute: the bundler, tests and plugins run with build access.
GitHub's [secure-use guidance](https://docs.github.com/en/actions/reference/security/secure-use) recommends full-length
commit pins and least-privilege token access; integrity/pinning limits unexpected changes, not malicious pinned code.

Build inputs are repository sources, lockfile/package metadata, pinned Node, installed toolchain, `BASE_PATH`, Vite
mode/env files and environment values. `vite.config.ts` injects version/license/author/project URL/Milkdown version;
`src/config.ts` uses the Google client ID and explicit fake-auth flag. Only `.env.example` is tracked. Local ignored
`.env*` files exist; the review inspected their key names without copying their values into evidence. Any `VITE_`
value must be treated as potentially public, even when an unused key happens to be removed by this build. The workflow
passes an OAuth web client ID from a variable or legacy secret fallback; that ID is intentionally public, not a client
secret or bearer credential. Source changes to `public/`, Vite config, plugins and preparation scripts are release inputs.

## Inspected production artifact

Built with `BASE_PATH=/jot/`, `VITE_ENABLE_FAKE_AUTH=false`, synthetic client ID
`security-review-public-client.apps.googleusercontent.com`, and two synthetic environment canaries:

```sh
BASE_PATH=/jot/ VITE_ENABLE_FAKE_AUTH=false VITE_GOOGLE_CLIENT_ID=security-review-public-client.apps.googleusercontent.com JOT_PRIVATE_BUILD_CANARY=SYNTHETIC_NONPUBLIC_BUILD_CANARY_0025 VITE_UNUSED_SECURITY_CANARY=SYNTHETIC_UNUSED_VITE_CANARY_0025 npm run build:pages
npm run test:artifact
```

The output contained 95 public files: HTML, manifest, static worker/icons, build manifest and hashed JS/CSS/fonts.
There was no `.output/server` directory, no source map, source/test tree, environment file, key file or node_modules in
the public artifact. The synthetic client ID appeared as expected. Neither nonpublic nor unused Vite canary appeared;
test account-email key, `test-google-client-id` and the `__JOT_TEST_GOOGLE_AUTH__` hook were absent. This is targeted
artifact inspection, not a general secret-scanner guarantee. The build manifest can expose module labels/asset names;
it is not a secret store. Package-lock SHA-256: `c405303fdba56de46990f94c1d32c50fb18425ec3598ef5900b4b1bf7ade5eb8`.

The bundle retained the literal “Use development storage” in a generic UI branch, so string presence alone would be a
false positive for an exposed bypass. A Chrome test served the actual `/jot/` artifact, forged `jot.fakeAuth` and
`__JOT_TEST_GOOGLE_AUTH__`, and supplied a synthetic Google callback. There was no development sign-in control and no
editor entry; sign-in reached the real Drive account gate, whose intercepted 401 produced an account verification
error. Worker registration scope was exactly the served `/jot/`. No live account was contacted. This establishes the
exercised auth gate, not formal proof of elimination of every unused fake-provider instruction.

The [retained artifact suite](../tests/artifact/deployment-security.spec.ts) adds these checks. Existing artifact tests
also verify base-path asset imports and app startup. Local HTTP serving closes in `finally`; no preview is left running.

## Browser policies, third parties and origin boundaries

A public unauthenticated GET to `https://ivarru.github.io/jot/` returned 200 HTML over HTTPS on the review date.
It contained no CSP meta tag. The response had no CSP/report-only CSP, X-Frame-Options, X-Content-Type-Options,
Referrer-Policy, Permissions-Policy, Cross-Origin-Opener-Policy or Strict-Transport-Security header. This is one public
response snapshot, not proof of account-level HTTPS settings or every edge response, and the deployed revision was
not matched to the reviewed local commit. The local production artifact also has no CSP meta policy. The snapshot
establishes a browser hardening gap, not a reproduced XSS exploit; #0023's bounded rendering tests remain separate.

Google Identity Services loads the fixed HTTPS `https://accounts.google.com/gsi/client` script, without SRI pinning.
It is intentionally a vendor-managed changing library executing with the app's origin access. Milkdown, DOMPurify,
KaTeX and fonts are bundled locally; no additional analytics/CDN-script sink was found in application code. The GIS
library's integrity and Google API response integrity remain trust assumptions. Introducing SRI for a mutable vendor
script without an update agreement is not a verified remedy. Google's
[GIS CSP setup guidance](https://developers.google.com/identity/gsi/web/guides/get-google-api-clientid) describes its
script/style/frame/connect requirements; exact OAuth/Photos flows still need real-provider testing.

A **test-only meta CSP candidate** in the artifact suite permits same-origin app scripts/fonts/worker/manifest,
the GIS script/style/frame URLs and Google API connect destinations, forbids objects and base changes, and limits
forms. It still allows inline styles (editor/KaTeX need review) and HTTPS/data/blob images; it does not resolve #0031.
Chrome rendered the sign-in screen and enforced blocking of an injected inline script, an unlisted remote script and
an unlisted fetch, with violation events and zero requests to the intercepted probe host. No candidate policy was
written into production output or source. This validates those enforcement mechanisms, not complete OAuth/editor
compatibility. #0035 owns turning this into a reviewed, end-to-end tested production policy.

GitHub Pages serves uploaded static files; this repository has no verified mechanism for app-defined response headers.
Do not assume a `_headers` file or Vite development-server configuration changes Pages response headers. An early CSP
meta tag and meta referrer policy are feasible document controls, subject to browser tests. The
[CSP specification](https://www.w3.org/TR/CSP/#meta-element) excludes frame-ancestors, sandbox and report-uri from meta
policies; report-only CSP is a header mechanism. Framing protection, COOP/Permissions-Policy and other response-header
controls therefore need a separately approved delivery capability or an explicit residual-risk decision. Blindly
setting COOP can break auth popups. GitHub documents an account-level
[HTTPS enforcement setting](https://docs.github.com/en/pages/getting-started-with-github-pages/securing-your-github-pages-site-with-https);
its configured state was not checked or changed. No hosting migration is assumed.

`/jot/` scopes normal worker control and manifest resolution, not IndexedDB, localStorage, Cache Storage or the origin
security principal. Other projects on `ivarru.github.io` share that boundary. The worker's fetch handler also caches
requests to other same-origin paths made by controlled pages. Existing #0032/#0033 address excessive cache retention
and unrelated cache deletion. Dedicated-origin hosting can reduce neighboring-code trust, but requires a separate
operator decision and corresponding OAuth origins/redirect registration. Same-origin compromise can read browser notes
and credentials despite account continuity checks; CSP 'self' does not isolate neighboring app paths.

## Fresh dependency audit and findings

The 2026-10-18 `npm audit --json` returned four high entries, zero critical, from one advisory:
[GHSA-vfj7-8cjw-p6xm](https://github.com/advisories/GHSA-vfj7-8cjw-p6xm), braces nested-pattern stack exhaustion.
Installed chain: `@solidjs/start@2.0.6 → fast-glob@3.3.3 → micromatch@4.0.8 → braces@3.0.3`, also a direct
SolidStart-to-micromatch edge. The upstream advisory still lists no patched release. npm proposes SolidStart 1.4.0,
which would undo the migration; no downgrade/override was performed. #0027 remains open for the bounded dependency
follow-up; this review is not an acceptance of the risk.

Installed SolidStart `dist/config/fs-routes/router.js` and `dist/directives/index.js` use these libraries for configured
route/source globbing. The static output has no request-handling Node process. No Daily Note-to-build-glob path was
found; untrusted repository/build configuration is the relevant boundary. `dependencies` versus `devDependencies` and
an audit's “production” classification alone do not prove browser runtime reachability. No exploit PoC against the
build tooling, complete module reachability proof or clean reinstall was performed in this investigation.

Actionable follow-ups: [#0034](../issues/0034-harden-deployment-workflow-trust.md) (action pins/build authority) and
[#0035](../issues/0035-enforce-browser-security-policy.md) (verified production browser policy). Existing
[#0031](../issues/0031-control-external-note-image-loading.md),
[#0032](../issues/0032-exclude-private-requests-from-shell-cache.md),
[#0033](../issues/0033-preserve-unrelated-origin-caches.md), and
[#0027](../issues/0027-follow-up-build-dependency-advisory.md) remain unresolved. These are concrete control gaps and
bounded exposure assessments; no supply-chain compromise, production auth bypass, secret leak or new XSS exploit was
reproduced. #0026 should preserve that distinction when consolidating verification.

## Verification limits

Routine `npm run verify` passed 820 tests, typechecking and the production build. The final synthetic-canary Pages
build and five artifact checks passed, including two Chrome workflows. Test servers stopped; tests/docs only, with
app version `0.34.2` unchanged.
The first candidate-CSP assertion incorrectly expected origin-only violation URLs; Chrome emitted full probe URLs,
and the assertion was corrected. Enforcement itself blocked both requests in that run as well as the passing rerun.
No policy test proves actual Google popup/redirect/Photos compatibility, framing prevention or production CSP delivery.
No GitHub run, environment approval/OIDC exchange, signing/provenance verification, repository secret audit or
operator-setting inspection was performed. The public header GET was read-only and unauthenticated; no deployment
or external account change was made. The production artifact will change with build inputs and must be rechecked
when its code, environment, dependencies or policy changes.
