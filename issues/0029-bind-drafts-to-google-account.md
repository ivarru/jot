---
id: "0029"
title: "Bind retained drafts and runtime state to the Google account"
status: closed
type: bug
priority: high
created: "2026-10-18"
labels: [security, auth, storage]
---

# Bind retained drafts and runtime state to the Google account

## Problem and evidence

The [#0022 review](../docs/security-oauth-review.md) confirmed that Local Drafts and `jot.accountEpoch` have no Google
account binding. Token loss/reload can leave account A drafts; signing in as B adopts the current epoch and starts
replication. A probe using real token/draft/replication/Drive classes emitted A's synthetic note in a multipart request
with B's bearer token and B's folder. No live cross-account write was attempted. In-page sign-out also retains the
same remote runtime and its cached folder IDs. This is a high-severity cross-account data-disclosure risk.

## Outcome and scope

Establish account continuity before exposing or synchronizing retained data. Scope drafts, baselines, provider caches,
and applicable derived/runtime state to a stable identity obtained from the authorized provider. Define safe handling
of existing drafts with unknown provenance and deliberate account changes; preserve unsynced work without implicit
transfer. A login hint or choosing an account in Google's dialog is insufficient evidence of continuity. Any new
workflow or storage migration must be explicitly designed and versioned under repository rules.

## Acceptance criteria

- [x] First add a failing regression for A authentication and draft creation, token loss/reload, B authentication, and attempted replication; assert no A content reaches B requests or editor.
- [x] Document the provider identity source, validation/continuity rules, and treatment of legacy unbound drafts before implementation; avoid unnecessary identity scopes or private identifiers in evidence.
- [x] Isolate local drafts/baselines and account-scoped provider/runtime caches across sign-in, reconnect, renewal, reload, and multiple tabs.
- [x] Handle account mismatch without silently dropping unsynced notes or automatically transferring them; define any intentional transfer as an explicit user decision.
- [x] Add Chrome account-switch workflows and mocked provider tests asserting URLs, credentials, metadata/media bodies, and resulting local/remote state; preserve same-account reconnect and conflict behavior.

## Verification

Use the [archived request probe](evidence/0022-oauth-boundaries.md) as the initial reproduction, then refine the sync
model if account/session identity is added to its scope; otherwise document why focused auth/provider tests cover this
boundary. Include date A-to-B stale operations for changed editor/sync wiring. Run npm run verify and focused Chrome
workflows. Any real-provider validation under #0026 uses disposable accounts and synthetic data.

## Dependencies and related work

No hard dependencies for investigation/design. Coordinate auth-generation work with
[#0028](0028-cancel-stale-google-auth-results.md) and attachment identity with
[#0030](0030-bind-image-imports-to-auth-session.md). Related privacy review:
[#0024](0024-review-local-data-privacy.md).

## Resolution

Fixed in app 0.34.0. The Chrome regression first authenticated A, saved an unsynced draft, removed the token/reloaded,
and authenticated B; before the fix B entered the editor rather than being rejected. It now rejects B, preserves A's
note, and lets A recover. The real token/IndexedDB/replication/Drive integration asserts no data request receives A's
note with B credentials. Identity requests assert exact URL/method/auth headers and no-store semantics. Existing Drive
request/conflict/settings suites remain part of routine verification.

Candidate popup/redirect/restored/renewed tokens are verified before data-provider access. Provider sessions retain
caches only within their credential lifetime; old method continuations cannot use a replacement session's tokens.
The identity/credential boundary is outside the bounded replication model; focused provider tests and Chrome workflows
cover it. Existing pending date A-to-B renewal, selected-load, and shared-tab cases remain in the routine/browser suites.

Verification: npm run verify passed 775 tests, type checking, and production build. A subsequent focused run passed all
eight account-boundary tests, including rejected restored-token recovery. All 12 Chrome account/auth/renewal/shared-tab workflows passed. Final type checking also passed. An additional regression first reproduced the offline-reopen limitation; exact-token,
account-and-epoch-bound digest proof preserves offline reopening without trusting an unverified replacement token.
All 28 focused account/token tests and the Chrome offline-reopen workflow passed after that refinement; the final nine-workflow auth/image run passed.
No live Google account was used; #0026 retains the provider-level limitations.

Implementation decision (recorded before production changes):

Use Drive about.get user.permissionId, requested with the candidate token and the existing drive.file scope, as the
account continuity key. Validate before making any candidate token available to data providers. One browser storage
area belongs to one verified account at a time; a mismatch blocks entry/reconnect while preserving drafts. Switching
accounts requires signing out of the original account using the existing unsynced-data warning/clearing workflow.
Legacy unbound drafts remain untouched and inaccessible until the user explicitly confirms they belong to the selected
account. No automatic transfer or destructive database migration is introduced. This recovery confirmation is a new
user-visible workflow and will use a minor version bump. Provider caches and operations will be scoped to the verified
session, so an old operation cannot borrow a later account's credentials.
