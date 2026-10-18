---
id: "0029"
title: "Bind retained drafts and runtime state to the Google account"
status: open
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

- [ ] First add a failing regression for A authentication and draft creation, token loss/reload, B authentication, and attempted replication; assert no A content reaches B requests or editor.
- [ ] Document the provider identity source, validation/continuity rules, and treatment of legacy unbound drafts before implementation; avoid unnecessary identity scopes or private identifiers in evidence.
- [ ] Isolate local drafts/baselines and account-scoped provider/runtime caches across sign-in, reconnect, renewal, reload, and multiple tabs.
- [ ] Handle account mismatch without silently dropping unsynced notes or automatically transferring them; define any intentional transfer as an explicit user decision.
- [ ] Add Chrome account-switch workflows and mocked provider tests asserting URLs, credentials, metadata/media bodies, and resulting local/remote state; preserve same-account reconnect and conflict behavior.

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

Pending. Reproduced during #0022; no production fix has been applied.
