---
id: "0022"
title: "Review OAuth and account boundaries"
status: closed
type: investigation
priority: high
created: "2026-10-18"
labels: [security, auth]
---

# Review OAuth and account boundaries

## Problem and evidence

The dependency migration is complete, but passing tests and a general code review do not establish that authentication
boundaries are secure. [Deployment](../docs/deployment.md#oauth-and-photos-notes) describes popup and redirect flows,
tab-scoped tokens, renewal, and sign-out. No new vulnerability is established by this issue.

## Outcome and scope

Review Google Identity Services popup and same-tab redirect handling, redirect/state validation, token lifetime and
storage, requested scopes, renewal, sign-out, and account changes. Trace pending Drive/Photos requests and local writes
across session changes. Document trust boundaries and assumptions about compromised credentials; do not expand the
[sync safety contract](../docs/sync-safety.md) silently. Production account changes and new auth flows are out of scope.

## Acceptance criteria

- [x] Record the reviewed commit, auth entry points, token lifecycle, trust boundaries, and provider assumptions.
- [x] Assess redirect/state handling, URL token cleanup, popup messaging where applicable, and scope minimization.
- [x] Assess expiry, renewal, sign-out, and account-switch behavior, including delayed requests and cross-tab state; establish whether old-session work can expose or restore data.
- [x] Record findings with concrete evidence and severity, or explicit no-finding results and limitations; create separate remediation issues for confirmed defects.

## Verification

Use focused auth/token tests and mocked provider requests to investigate boundary behavior. Any fix must begin with a
failing regression; browser auth workflow changes require an actual Chrome workflow asserting resulting app state.
Identify real-provider checks for [#0026](0026-validate-security-workflows.md). Never record tokens or account data.

## Dependencies and related work

No hard dependencies. Recommended first review. Related: [#0024](0024-review-local-data-privacy.md) and
[#0026](0026-validate-security-workflows.md).

## Resolution

Completed the investigation against `3c1f8c2de6a77b5f8c344be2ad0526771a58646d` (app `0.33.8`).
The [assessment](../docs/security-oauth-review.md) records entry points, token/session lifecycle, trust boundaries,
scope assessment, provider assumptions, and real-provider checks handed to #0026.

Three high-severity client-side gaps were reproduced and remain open in separate remediation issues:
[late auth results](0028-cancel-stale-google-auth-results.md),
[account-unbound drafts/runtime state](0029-bind-drafts-to-google-account.md), and
[cross-session image imports](0030-bind-image-imports-to-auth-session.md).
Closing this investigation does not resolve or accept those risks.

Verification: 152 existing focused tests passed, along with eight existing Chrome auth/shared-tab workflows.
Additional temporary probes passed three redirect-state rejection checks and failed six intended security assertions;
a Chrome probe failed because pending sign-in restored the editor after a cross-tab sign-out signal.
The [full probe source and replay instructions](evidence/0022-oauth-boundaries.md) are retained outside normal CI.
All accounts, tokens, content, and provider responses were synthetic or mocked. Actual Google account switching,
revocation, popup behavior, and cross-account API acceptance remain unverified; no live account was used.
No production code was changed.

