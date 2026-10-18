---
id: "0028"
title: "Cancel stale Google authentication results"
status: closed
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

- [x] Add failing focused regressions for token success after invalidate/revoke/timeout, delayed initialization, and redirect return after an account-epoch change before production fixes.
- [x] Ensure obsolete auth success/error callbacks and continuations cannot store credentials, adopt a newer epoch, set authenticated, or invalidate a newer session.
- [x] Ensure obsolete redirect state is rejected after sign-out across tabs, including navigation/suspension; retain valid single-use state checks and OAuth-fragment cleanup.
- [x] Add a Chrome workflow exercising a pending Google sign-in/reconnect across another tab's actual sign-out, then release the callback and assert signed-out state and absent token.
- [x] Verify ordinary sign-in, popup fallback, expiry/renewal, retries, and same-account reconnect still work; record residual provider limitations.

## Verification

Replay the auth and Chrome probes in [the evidence](evidence/0022-oauth-boundaries.md), then promote them into the
maintained auth/route/browser suites. Google callbacks and redirect lifecycle are outside the bounded replication
model. Run npm run verify and focused Chrome auth/shared-tab workflows. Do not rely on a live account for routine tests.

## Dependencies and related work

No hard dependencies. Related: [#0029](0029-bind-drafts-to-google-account.md),
[#0030](0030-bind-image-imports-to-auth-session.md), and [#0026](0026-validate-security-workflows.md).

## Resolution

Implemented in app 0.33.9. Token attempts own settled callbacks and session/epoch guards; invalidation cancels
pending requests, discards old redirect state, and prevents stale cached-token restoration. Route sign-in, reconnect,
and renewal continuations cannot adopt a newer sign-out epoch. Existing redirect state/tokens without an epoch require
fresh sign-in. Local sign-out cancels credentials before awaiting draft clearing/provider revocation.

Regression-first evidence: five focused assertions failed before the fix (late invalidate/revoke/timeout callbacks,
stale redirect, delayed script initialization), and the Chrome actual-second-tab-sign-out workflow failed by restoring
the editor. The maintained regressions now pass, including a newer-token/old-callback case. These auth boundaries are
outside the bounded replication model; focused auth and browser workflows cover them. Existing A-to-B renewal traces
remain in the routine suite.

Verification: npm run verify passed 768 tests, type checking, and production build. All nine Chrome auth/renewal/shared-tab
workflows passed. No live Google account was used; provider-level checks remain with #0026. #0029 and #0030 remain open.
