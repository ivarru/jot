---
id: "0028"
title: "Cancel stale Google authentication results"
status: open
type: bug
priority: high
created: "2026-10-18"
labels: [security, auth]
---

# Cancel stale Google authentication results

## Problem and evidence

The [#0022 review](../docs/security-oauth-review.md) reproduced token resurrection after invalidation, revoke, and
request timeout in `GoogleIdentityTokenProvider.performFreshAccessTokenRequest`. Outstanding redirect state also
survives account-epoch changes. The sign-in continuation in `src/routes/index.tsx` adopts the new epoch and
authenticates without checking the epoch captured before awaiting Google. A Chrome probe restored the editor after
another tab emitted the sign-out epoch signal. This is a confirmed session-boundary failure (high severity).

## Outcome and scope

Make auth completion, failure, timeout, invalidation, revocation, and redirect consumption respect request/session
identity. Retire obsolete callbacks and redirect attempts; do not let an old result restore a cleared token or alter a
new session. Apply checks to sign-in, reconnect, and renewal continuations as appropriate. Do not redesign account
selection here; account identity is separate work in #0029.

## Acceptance criteria

- [ ] Add failing focused regressions for token success after invalidate/revoke/timeout, delayed initialization, and redirect return after an account-epoch change before production fixes.
- [ ] Ensure obsolete auth success/error callbacks and continuations cannot store credentials, adopt a newer epoch, set authenticated, or invalidate a newer session.
- [ ] Ensure obsolete redirect state is rejected after sign-out across tabs, including navigation/suspension; retain valid single-use state checks and OAuth-fragment cleanup.
- [ ] Add a Chrome workflow exercising a pending Google sign-in/reconnect across another tab's actual sign-out, then release the callback and assert signed-out state and absent token.
- [ ] Verify ordinary sign-in, popup fallback, expiry/renewal, retries, and same-account reconnect still work; record residual provider limitations.

## Verification

Replay the auth and Chrome probes in [the evidence](evidence/0022-oauth-boundaries.md), then promote them into the
maintained auth/route/browser suites. Google callbacks and redirect lifecycle are outside the bounded replication
model. Run npm run verify and focused Chrome auth/shared-tab workflows. Do not rely on a live account for routine tests.

## Dependencies and related work

No hard dependencies. Related: [#0029](0029-bind-drafts-to-google-account.md),
[#0030](0030-bind-image-imports-to-auth-session.md), and [#0026](0026-validate-security-workflows.md).

## Resolution

Pending. Reproduced during #0022; no production fix has been applied.
