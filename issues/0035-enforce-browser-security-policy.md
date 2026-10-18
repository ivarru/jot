---
id: "0035"
title: "Introduce a verified production browser security policy"
status: closed
type: feature
priority: medium
created: "2026-10-18"
labels: [security, deployment, browser]
---

# Introduce a verified production browser security policy

## Problem and evidence

The [#0025 assessment](../docs/security-deployment-review.md) found no CSP meta policy in the local production artifact.
A read-only public Pages response also lacked CSP and framing/security policy headers on 2026-10-18; that snapshot was
not revision-matched and does not prove every host setting. This is a defense-in-depth gap, not a demonstrated XSS bug.

A test-only meta CSP candidate in [deployment-security.spec.ts](../tests/artifact/deployment-security.spec.ts) allowed
production sign-in-screen startup and blocked inline/unlisted remote scripts and unlisted fetches in Chrome.
At assessment time it was not shipped or validated with real OAuth/Photos or every editor workflow. Inline styles
and HTTPS image allowances alone did not resolve #0031, which was subsequently handled through per-view image consent.

## Outcome and scope

Design and enforce a policy compatible with static Pages delivery, Google identity/Drive/Photos, editor/math rendering,
and offline startup. Separate document-deliverable controls from response-header controls that the current host has no
verified app configuration path for. Document explicit residual risks rather than silently requiring a hosting migration.
Do not deploy or change OAuth/hosting settings as part of local implementation without authorization.

## Acceptance criteria

- [x] Ship an early, appropriately restricted CSP and explicit referrer policy where supported; avoid broad script allowances without evidence.
- [x] Real Chrome tests assert blocked script/network effects and preserved editing, math, images, auth and offline workflows under the actual generated policy.
- [x] Verify Google popup/redirect/Photos compatibility with synthetic data and authorized live-provider checks, or label remaining gaps explicitly before release.
- [x] Record framing, Permissions-Policy/COOP, same-origin project trust and HTTPS enforcement limits; never claim meta frame-ancestors provides protection.
- [x] Any required header-capable delivery or dedicated-origin change is a separately approved operator decision with OAuth migration scope.

## Verification

Begin with generated-output and Chrome assertions for the chosen policy. Adapt the retained candidate test to exercise
the shipped policy, not a test-only injected string. Assert requests/effects are blocked, not just that a meta tag exists.
Check the actual deployed response only after an authorized deployment; preserve offline/base-path behavior. This is a
browser/deployment boundary outside the bounded Daily Note Replication model. Run routine and Pages artifact checks.

## Dependencies and related work

Related: [#0023](0023-review-untrusted-content.md), [#0024](0024-review-local-data-privacy.md),
[#0025](0025-review-deployment-security.md), [#0026](0026-validate-security-workflows.md), and
[#0031](0031-control-external-note-image-loading.md). Coordinate image permissions with #0031; no hard dependency.

## Resolution

Implemented in app `0.35.4`. Production HTML places CSP immediately after charset, before executable/fetchable
resources, and supplies strict-origin-when-cross-origin referrers. Scripts are limited to bundled same-origin code
and the exact GIS client URL; inline JavaScript/eval and script attributes are prohibited. KaTeX/editor inline styles,
Vite-inlined fonts and existing explicitly permitted image behavior have documented allowances.

Worker v9 never migrates old HTML over its freshly installed shell. Its focused regression failed before the change
and passes afterward. The generated `/jot/` artifact tests enforce the actual shipped policy rather than injecting
a candidate, including blocked inline handlers, base replacement, remote scripts/fetches and protected offline HTML.

Compatibility testing discovered the existing blocked-popup redirect ordering bug, fixed separately in
[#0036](0036-consume-oauth-redirect-before-routing.md) before completing this policy. Synthetic Google popup/redirect,
identity gating, date restoration, Photos/media requests, math and native camera behavior have Chrome coverage.

[The policy reference](../docs/browser-security-policy.md) documents rationale, current coverage and header/origin
limits. [Manual release checks](../docs/manual-google-provider-retest.md#production-browser-policy-retest) explicitly
remain unrun for live Google script/frame/consent/picker/expiry behavior. No deployment, Google account/settings,
GitHub protection or hosting configuration was changed. Dedicated-origin/header-capable hosting remains an operator
decision, not an implied migration in this issue.

Verification: all 184 Chrome browser checks passed under the production policy, including native synthetic camera
capture, upload, rich clipboard, editor/math, auth/date, external-image permission and offline/session regressions.
All seven generated Pages artifact checks passed with production fake auth disabled and synthetic build canaries.
Routine verification passed 843 unit/integration tests, typechecking and the production build. No test servers remain.
