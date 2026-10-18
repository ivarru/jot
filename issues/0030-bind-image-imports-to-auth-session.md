---
id: "0030"
title: "Bind image imports to their initiating authentication session"
status: open
type: bug
priority: high
created: "2026-10-18"
labels: [security, auth, photos]
---

# Bind image imports to their initiating authentication session

## Problem and evidence

The [#0022 review](../docs/security-oauth-review.md) held a picked-image response in
`ImageAttachmentFlow.importPickedImage`, changed the account epoch/token, and released it. The real Photos client
then sent an upload of A's synthetic image bytes with B's bearer token. The route's result guard runs after remote
writes; it cannot stop the flow's internal continuation. This proves an outgoing cross-session request, not that
Google accepts an A album under B. The same multi-step concern applies to local-image imports and metadata writes.
This is a high-severity session-isolation gap.

## Outcome and scope

Bind image import and its Photos/Drive steps to the initiating authenticated session. After sign-out, account change,
or invalidation, prevent subsequent stale side effects and credential substitution. Audit local upload/camera/paste,
picker polling/reuse, and metadata writes for the same boundary. Preserve supported date navigation semantics and
document any unavoidable already-submitted remote effects; client cancellation cannot guarantee remote rollback.

## Acceptance criteria

- [ ] Promote the held-download/replacement-token probe into a failing focused regression before production changes; cover local-image preparation and metadata stages as well.
- [ ] Check session identity after async boundaries and before starting each remote read/write; stale operations must never borrow replacement-session credentials.
- [ ] Sign-out/account changes retire pending picker/import work and clear sensitive operation state without permitting late results to repopulate the new session.
- [ ] Add mocked Photos/Drive request assertions showing no upload/create/metadata continuation after cancellation and no mixing of account credentials, albums, or content.
- [ ] Add a Chrome workflow that starts an image import, signs out or changes session while work is held, releases it, and asserts resulting app state and absence of stale subsequent requests; keep normal imports/reuse working.

## Verification

The attachment/token lifecycle is outside the bounded Daily Note replication model; use focused attachment/provider
tests and Chrome browser API workflows. Replay [the archived probe](evidence/0022-oauth-boundaries.md). Date-bound
editor/sync changes must cover pending A-to-B transitions. Run npm run verify and affected image/auth browser tests;
no live Google account is required for routine coverage.

## Dependencies and related work

No hard dependency to reproduce/cancel stale work. Coordinate credential generation with
[#0028](0028-cancel-stale-google-auth-results.md) and account-scoped state with
[#0029](0029-bind-drafts-to-google-account.md). Related: [#0026](0026-validate-security-workflows.md).

## Resolution

Pending. Reproduced during #0022; no production fix has been applied.
