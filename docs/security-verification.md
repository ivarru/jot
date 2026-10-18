# Consolidated security verification

Date: 2026-10-18. Release under validation: `0.35.1`. This records
[#0026](../issues/0026-validate-security-workflows.md). It consolidates bounded automated evidence and explicitly
unverified manual cases; it is not a clean security certification or authorization to deploy.

## Reviews and verified boundaries

The dated assessments remain snapshots of their reviewed commits:
[OAuth/account](security-oauth-review.md) (#0022), [content](security-content-review.md) (#0023),
[privacy](security-privacy-review.md) (#0024), and [deployment](security-deployment-review.md) (#0025).
Current remediation status is recorded below; historical reproductions must not be mistaken for current behavior.

| Boundary / finding | Retained evidence | Current outcome and limits |
| --- | --- | --- |
| Pending popup/redirect/token results after sign-out (#0028) | `src/auth/googleIdentityLifecycle.test.ts`, `googleIdentity.test.ts`; browser `google-auth-boundaries.spec.ts` and `google-auth-renewal.spec.ts` | Closed. State rejection, invalidation and real-browser delayed-callback effects are covered with synthetic GIS. Actual Google popup/redirect/consent remains manual. |
| Draft account continuity and offline restoration (#0029) | `src/auth/googleAccountBoundary.test.ts`, `src/storage/sessionGuardedDraftStore.test.ts`; browser `google-account-boundaries.spec.ts` | Closed. Account B cannot open A's retained synthetic draft; confirmed-token offline restore, legacy confirmation and same-page account changes are covered. Browser storage is plaintext and origin-wide. |
| Image imports/session expiry (#0030 and 0.34.2 auth-error fix) | `src/attachments/imageAttachmentSession.test.ts`, `imageAttachmentDisplayAuth.test.ts`, route reconnect tests; browser `image-session-boundaries.spec.ts`, `image-upload.spec.ts` | Closed. Old work cannot insert/upload into a fresh session, including A→B date transitions. Self-invalidating 401s remain recognizable to reconnect handling. Accepted remote writes cannot be rolled back locally. |
| Script/unsafe URL/tag/math boundaries (#0023) | `src/editor/untrustedContent.test.ts`, link/tag/clipboard tests; browser `untrusted-content.spec.ts`, `latex.spec.ts`, `link-modal.spec.ts` | Tested payloads stay inert; canonical tags and benign math/links still work through import/paste/raw round trips. No exhaustive sanitizer fuzzing or unbounded parser/resource proof. |
| External note-image disclosure (#0031) | `src/components/milkdownImages.test.ts`; browser `external-images.spec.ts` and `untrusted-content.spec.ts` | Closed in 0.35.0. No request before a per-view image decision; native rich/plain paste, import/reopen, reload, mode changes and pending A→B load are exercised. Consent permits ordinary browser image cookies; requests use no-referrer. Managed Photos retains its authorized flow. |
| Clipboard link suggestions / diagnostics (#0024) | `src/sync/syncDiagnostics.test.ts`, route diagnostics tests; browser rich-clipboard suggestion case in `external-images.spec.ts` and two diagnostic cases in `reconnect-conflict.spec.ts` | Rich clipboard link extraction did not fetch the unrelated probe image in Chrome. Copied reports omit note text/raw IDs and preserve the intended paused snapshot. OS clipboard history, every HTML parser resource feature and heap erasure are not covered. |
| Logical sign-out cleanup and offline durability (#0024) | Local Draft/account/lock/catalog tests; browser `privacy-boundaries.spec.ts`, `offline-restart.spec.ts` | Cleared drafts/tags and signed-out UI in both tabs; offline drafts survive reopening until explicit sign-out. No physical erasure or browser-profile isolation claim. |
| Private cache URLs/headers/bodies (#0032) | `src/storage/serviceWorker.test.ts`; browser `privacy-boundaries.spec.ts`; Pages upgrade test | Closed in 0.34.4 with a 0.35.1 follow-up. Query/Authorization/non-asset requests, private/no-store responses and redirects are excluded. Public asset fetches omit ambient credentials. Known legacy private keys are removed; ambiguous shared legacy paths remain untouched rather than risking neighboring data. |
| Cache ownership / nested installations (#0033) | Same worker unit/browser tests; `tests/artifact/deployment-security.spec.ts` | Closed in 0.34.3. Installation-specific namespaces, migration and actual `/jot/` offline startup are covered. A later named regression exposed nested-neighbor legacy deletion; the 0.35.1 follow-up preserves those keys. Cache namespaces are cooperative ownership, not origin isolation. |
| Production artifact and fake-auth exclusion (#0025) | `tests/artifact/deployment-security.spec.ts`, `pages-artifact.spec.ts` | Production ignores forged development flags, requires real account verification, uses the `/jot/` worker scope and excludes targeted private/test canaries and server/source files. Targeted inspection is not a general secret audit. |
| CSP enforcement mechanism (#0035) | Test-only candidate in `tests/artifact/deployment-security.spec.ts` | Chrome blocks inline/unlisted scripts and fetches while the sign-in screen starts. Candidate is not shipped and does not establish live OAuth, Photos, framing protection or production policy delivery. Issue remains open. |

Browser paths above are under `tests/browser/workflows` unless stated otherwise. Model tests remain part of routine
verification; browser/network/cache/auth boundaries need focused coverage outside the bounded replication model.

## Replay and execution evidence

Run unit/type/build verification, then the focused Chrome set. Run builds and browser previews sequentially because
they share `.output`:

```sh
npm run verify
npx playwright test tests/browser/workflows/external-images.spec.ts tests/browser/workflows/untrusted-content.spec.ts tests/browser/workflows/privacy-boundaries.spec.ts tests/browser/workflows/google-auth-boundaries.spec.ts tests/browser/workflows/google-account-boundaries.spec.ts tests/browser/workflows/google-auth-renewal.spec.ts tests/browser/workflows/image-session-boundaries.spec.ts tests/browser/workflows/image-upload.spec.ts tests/browser/workflows/reconnect-conflict.spec.ts tests/browser/workflows/offline-restart.spec.ts tests/browser/workflows/link-modal.spec.ts tests/browser/workflows/latex.spec.ts
BASE_PATH=/jot/ VITE_ENABLE_FAKE_AUTH=false VITE_GOOGLE_CLIENT_ID=security-review-public-client.apps.googleusercontent.com JOT_PRIVATE_BUILD_CANARY=SYNTHETIC_NONPUBLIC_BUILD_CANARY_0025 VITE_UNUSED_SECURITY_CANARY=SYNTHETIC_UNUSED_VITE_CANARY_0025 npm run build:pages
npm run test:artifact
```

The consolidated Chrome run passed 37 workflows against image-feature commit `2c3e21a` (0.35.0). The worker-only
nested-neighbor follow-up `959c440` (0.35.1) then passed routine verification (842 unit/integration tests, typechecking,
production build), all four affected Chrome privacy workflows, and six Pages artifact checks including actual offline
startup and the nested legacy key. Final Pages output was rebuilt after the fake-provider run with the synthetic
canaries above and checked again. Earlier targeted runs passed 20 image/content/reconnect workflows. Each cache bug and the initial image-permission
expectation failed before its production fix. The nested-neighbor follow-up also started with a failing regression.
All accounts, notes, image bytes, tokens and cache fixtures were synthetic. Probe image requests were intercepted,
Google responses mocked, and production artifact checks served only local files. No production deployment or account
configuration was changed. Test servers stop after each run.

## Residual risks and manual handoff

- [#0027](../issues/0027-follow-up-build-dependency-advisory.md) remains open: the deployment review's 2026-10-18 audit
  reported four high entries from one braces advisory, with no patched version then listed. No dependency changes or
  forced downgrade were made here, and this validation did not repeat the audit. Build/configuration trust remains relevant.
- [#0034](../issues/0034-harden-deployment-workflow-trust.md) remains open: actions use mutable major tags and build
  permissions remain broad. GitHub branch/environment/OIDC controls were not inspected or exercised.
- [#0035](../issues/0035-enforce-browser-security-policy.md) remains open: no production CSP/header policy is shipped.
  The public header snapshot from #0025 was not matched to a deployed revision; the current local release was not deployed.
- Shared origin/profile access, restored tabs, diagnostic/clipboard metadata, physical deletion, HTTP/image-cache
  retention and vendor-script compromise remain outside established protections. Unknown historical paths in a shared
  legacy shell cache cannot safely be attributed to one installation; automatic migration preserves those ambiguous
  keys. Operator/browser site-data cleanup is a separate deliberate action, never an implied upgrade guarantee.
- Real provider consent, popup fallback, account selection, revocation and Photos display/expiry behavior are **not run**.
  Suspended/discarded-tab timing, storage/revocation failures and native drop/context-menu behavior remain bounded gaps.
  The existing [manual provider checklist](manual-google-provider-retest.md#consolidated-security-release-retest) supplies
  setup, safe synthetic data and expected outcomes. Record execution evidence there or in the release record when arranged;
  absence of execution is not a pass.

Closing #0026 records coverage and the remaining work; it does not close these issues or accept their risks.
