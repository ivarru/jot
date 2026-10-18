---
id: "0025"
title: "Review static deployment and supply-chain controls"
status: closed
type: investigation
priority: medium
created: "2026-10-18"
labels: [security, deployment]
---

# Review static deployment and supply-chain controls

## Problem and evidence

Jot now builds with SolidStart 2, Vite 8, and an exactly pinned Nitro beta, deploying static files to GitHub Pages.
[Deployment](../docs/deployment.md) and [migration notes](../docs/dependency-maintenance.md) describe the new artifact.
The migration's correctness checks do not establish production security controls.

## Outcome and scope

Review CI permissions, action/dependency trust, lockfile installation, build-time inputs, third-party scripts, and the
actual production artifact. Verify exclusion of fake auth, test-only features, credentials, and unintended server output.
Assess CSP and other browser policies against what GitHub Pages can actually deliver, including origin sharing and
service-worker scope. Changes to hosting or external account settings require separately scoped work.

## Acceptance criteria

- [x] Record reviewed commit, workflow permissions/trust boundaries, build inputs, and dependency/action pinning risks.
- [x] Inspect a production Pages artifact for test/development features, sensitive build-time values, and deployment scope; distinguish public OAuth client IDs from secrets.
- [x] Assess third-party script trust, feasible browser policies, base-path/origin and service-worker boundaries; document host limitations and proposed remedies.
- [x] Record concrete findings or explicit no-finding results and limitations; link actionable remediation issues rather than assuming a hosting migration.

## Verification

Use generated-output tests under tests/artifact and production-like Chrome checks where needed. Confirm any proposed
policy with actual browser enforcement, not just a meta tag or configuration string. Use no real secrets in artifacts.
This review does not authorize deployment or external account changes.

## Dependencies and related work

No hard dependencies. Related: [#0027](0027-follow-up-build-dependency-advisory.md), with content/privacy findings shared
with [#0023](0023-review-untrusted-content.md) and [#0024](0024-review-local-data-privacy.md).

## Resolution

Completed against `ee29113` (app `0.34.2`). The [assessment](../docs/security-deployment-review.md) records
workflow authority, action/dependency trust, build inputs, a synthetic-client-ID Pages artifact, a read-only public
header snapshot, third-party script trust, project-path/origin limits, and a browser-enforced test-only CSP candidate.

New follow-ups: [#0034](0034-harden-deployment-workflow-trust.md) for immutable action pins/minimal build authority
and [#0035](0035-enforce-browser-security-policy.md) for a verified production browser policy. Existing #0027 and
#0031–#0033 remain unresolved. No production auth bypass, secret leak, new XSS exploit or supply-chain compromise was
reproduced. No policy, dependency, workflow, deployment or external account setting was changed.

Verification: `npm run verify` passed 820 tests, typechecking and production build. The final synthetic-canary Pages
build and all five artifact checks passed, including two Chrome workflows for the production auth gate and CSP
candidate enforcement. The fresh audit reported four high entries from the existing braces advisory and no critical
entries; it was not treated as a clean result. Live Google/policy compatibility, GitHub protection settings and a
revision-matched deployed release remain unverified. Test servers stopped; tests/docs only, app still `0.34.2`.

