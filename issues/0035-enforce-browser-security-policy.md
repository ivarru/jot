---
id: "0035"
title: "Introduce a verified production browser security policy"
status: open
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
It is not shipped and has not been validated with real OAuth/Photos or every editor workflow. It still permits inline
styles and HTTPS images and therefore does not resolve #0031.

## Outcome and scope

Design and enforce a policy compatible with static Pages delivery, Google identity/Drive/Photos, editor/math rendering,
and offline startup. Separate document-deliverable controls from response-header controls that the current host has no
verified app configuration path for. Document explicit residual risks rather than silently requiring a hosting migration.
Do not deploy or change OAuth/hosting settings as part of local implementation without authorization.

## Acceptance criteria

- [ ] Ship an early, appropriately restricted CSP and explicit referrer policy where supported; avoid broad script allowances without evidence.
- [ ] Real Chrome tests assert blocked script/network effects and preserved editing, math, images, auth and offline workflows under the actual generated policy.
- [ ] Verify Google popup/redirect/Photos compatibility with synthetic data and authorized live-provider checks, or label remaining gaps explicitly before release.
- [ ] Record framing, Permissions-Policy/COOP, same-origin project trust and HTTPS enforcement limits; never claim meta frame-ancestors provides protection.
- [ ] Any required header-capable delivery or dedicated-origin change is a separately approved operator decision with OAuth migration scope.

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

Pending. No production policy or hosting change was made in the assessment.
