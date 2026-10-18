# OAuth and account boundary review

Review date: 2026-10-18. Reviewed code: `3c1f8c2de6a77b5f8c344be2ad0526771a58646d`, app `0.33.8`.
This records [local issue #0022](../issues/0022-review-oauth-account-boundaries.md). It is an assessment of that revision,
not a security certification or a change to the [replication safety contract](sync-safety.md).

## Trust boundaries and lifecycle

Jot is a static browser client. Google credentials and consent stay with Google; Jot receives bearer access tokens.
The Google Identity Services script and the app's same-origin JavaScript can access those tokens. A compromised origin,
third-party script, browser profile, or credential holder is outside the protections established by state checking or
local draft locks. Session storage is a tab-scoped cache, not encryption or account isolation. Different deployments
under one origin also share the browser origin's security boundary; deployment/privacy review remains separate.

`src/auth/googleIdentity.ts` loads the fixed HTTPS Google Identity script and creates a token client. Interactive
`getAccessToken` uses Google's popup flow; Jot implements no custom popup `postMessage` receiver. The route falls back
to `redirectForAccessToken` only for popup-open failure. The redirect uses the current origin/path (no hash/query as its
redirect destination), a random 128-bit nonce on the normal Web Crypto path, and a tab-stored, single-use state record
with a ten-minute lifetime. Only the date route is saved. Consumption removes the OAuth fragment with `replaceState`;
missing, expired, and replayed state fail the token acceptance checks. A non-Web-Crypto random fallback exists but was
not exercised in the supported HTTPS/localhost browser environment. OAuth error descriptions are shown as text;
the error branch precedes state validation but does not accept a token.

Popup/redirect tokens are held in memory and `sessionStorage`, keyed by OAuth client ID, until expiry. No refresh token
or client secret is stored. A valid cached token can complete saves in the three-minute renewal window. Renewal then
requests `prompt: none`; an interaction requirement clears the cached token and prompts reconnect. `revoke` clears the
cache before asking Google to revoke a currently usable token. An expired/unavailable token means no provider-level
revocation is attempted; local sign-out and Google grant revocation are distinct guarantees. Actual Google revocation,
consent, account choice, and browser popup restrictions were not established by the mocks.

The requested scopes are `drive.file`, Photos Picker read access, Photos append-only access, and app-created Photos
read access. They map to implemented Drive notes/settings/indexes and image picking/copy/display features; no broad
Drive scope or general Photos-library read scope is requested. All are requested up front, including for note-only use.
Incremental Photos authorization is a potential minimization improvement, not a demonstrated privilege escalation.
The provider does not inspect returned granted scopes before reporting success; partial-consent behavior needs the
real-provider checks below. Google's own authorization boundary still determines which API requests are permitted.

References: Google's [token-model guide](https://developers.google.com/identity/oauth2/web/guides/use-token-model),
[JavaScript reference](https://developers.google.com/identity/oauth2/web/reference/js-reference), and
[redirect-flow reference](https://developers.google.com/identity/protocols/oauth2/javascript-implicit-flow).
The token-client reference permits account selection and scope inspection; a returned access token alone does not
establish continuity with the account that produced an existing Local Draft. A login hint alone would not establish it.

## Local writes, remote work, and findings

`SessionGuardedDraftStore` serializes draft mutations and sign-out clearing using a browser lock and the shared
`jot.accountEpoch`. Stale writers fail after the epoch changes. Route sign-out also cancels selected-note replication,
background sync, uploads, date lookups, and tag-catalog refreshes. Other open tabs handle the epoch storage event,
invalidate their cached token, and leave the editor. Existing selected/background/upload cancellation and shared-tab
tests pass. These controls prevent the covered stale draft writes; they do not bind credentials or remote workflows
to a verified Google account.

Three confirmed client-side gaps remain:

| Finding | Evidence and affected boundary | Follow-up |
| --- | --- | --- |
| High: late auth results can undo sign-out | `performFreshAccessTokenRequest` stores a callback token after invalidation, revoke, or its two-minute timeout. Outstanding redirect state also survives an epoch change. The sign-in route's continuation adopts the new epoch and sets authenticated without checking the request's original session. A Chrome probe restored the editor after a cross-tab sign-out signal. | [#0028](../issues/0028-cancel-stale-google-auth-results.md) |
| High: retained drafts are not bound to an account | `LocalDraft` and its session epoch have no provider account identity. After token loss/reload, accepting account B can synchronize retained account A drafts. The real replication core and Drive provider emitted a multipart request with A's synthetic note, B's bearer token, and B's folder. Runtime caches also survive ordinary sign-out because `createStorageRuntime` runs once per page. | [#0029](../issues/0029-bind-drafts-to-google-account.md) |
| High: image imports can cross sessions | `ImageAttachmentFlow.importPickedImage` continues after awaited download work; subsequent Photos requests obtain the current token independently. A held A response released after an epoch/token change led to a byte-upload request authorized as B. The route checks whether the result may update the editor only after the flow's remote writes. | [#0030](../issues/0030-bind-image-imports-to-auth-session.md) |

These are lifecycle/account-isolation findings, not proof of remote code execution or an attacker forging a Google
token. Account-switch disclosure requires retained data or pending work and acceptance of another account's token.
The mocked request proofs do not establish that Google accepts an old album/folder ID under another account; the
outgoing note/image data and incorrect credential pairing are established. Already submitted remote writes cannot
generally be recalled by clearing local state; fixes must at least prevent stale continuations and account mixing.

## Verification evidence

- Existing focused suites passed: **152 tests across seven files** covering token handling, renewal, guarded drafts,
  Drive requests/adversarial cases, Photos requests, and route reconnect/conflict behavior.
- Additional temporary boundary probes: **three passed** (missing/expired/replayed redirect state and fragment removal)
  and **six failed the intended security assertions**, confirming the findings above. Full source and replay instructions
  are archived in [the reproduction evidence](../issues/evidence/0022-oauth-boundaries.md).
- Chrome: **eight existing renewal/shared-tab workflows passed**; the additional pending-sign-in probe failed its
  signed-out-state assertion and showed the editor instead. Stubbed GIS and fake remote storage were used.
- No production code was changed and no live Google account, credentials, or private note data was used.

## Handoff and limits

[Issue #0026](../issues/0026-validate-security-workflows.md) should incorporate the maintained regressions from fixes and
extend the [manual provider checklist](manual-google-provider-retest.md) with these cases using disposable accounts/data:

1. Popup success, blocked-popup redirect fallback, denied consent, and selective Drive/Photos consent. Confirm the token
   fragment is removed and denied capabilities are explained without silently selecting another account.
2. Expiry/no-UI renewal and interactive reconnect with multiple signed-in Google accounts. Confirm same-account recovery;
   after #0029, deliberately select a different account and confirm retained notes are isolated before any remote write.
3. Sign-out/revocation while auth or a Photos download/import is pending, including a second tab and a suspended tab
   resuming after the epoch changed. After #0028/#0030, verify late success/error results cannot restore or mutate sessions.
4. Sign out A, sign in B without reloading, and verify folder/album/cache resolution belongs to B. Repeat after reload
   with unsynced A drafts and confirm no implicit transfer, silent discard, or cross-account request.

Privacy of other retained UI state, caches, logs, and third-party requests belongs to #0024; content/URL sink validation
belongs to #0023; production policy and script trust belongs to #0025. This review does not establish those outcomes.
The investigation can close with its findings recorded while the three remediation issues remain open.

## Remediation status

- Issue #0028 is fixed in 0.33.9: request/session-bound callbacks and route continuations prevent late auth from
  restoring a signed-out session; stored token/redirect epochs reject stale navigation. Maintained regression-first
  coverage includes an actual second-tab sign-out in Chrome.
- Issue #0029 is fixed in 0.34.0: Drive-verified account continuity precedes token use/editor entry. Account mismatch
  preserves drafts and blocks access; older unbound notes require explicit ownership confirmation. Drive instances and
  caches are scoped to their credential session. Exact-token/account/epoch-bound digest proof preserves safe offline
  reopening with previously verified, still-valid credentials.
- Issue #0030 is fixed in 0.34.1: image flows and provider requests retain their originating session through
  asynchronous steps. Old bytes, metadata, UI results, and errors cannot borrow or alter replacement credentials.
  Sign-out clears image state and stops cameras. Regressions cover held remote responses, local preparation across
  sign-out/re-entry, A-to-B navigation, and successful fresh uploads. Already submitted provider writes cannot be recalled.

The findings above describe the original assessed revision. Each remediation issue records its final verification;
live Google behavior remains unverified and the expanded manual checklist belongs to #0026.

The 0.34.2 review follow-up preserves recognizable Drive/Photos image authentication failures when a request invalidates
its own token. Existing images request reconnect and become ready after successful reconnect; obsolete auth lifecycles,
dates, and credential results remain guarded. See #0030 for regression-first and focused browser verification evidence.
