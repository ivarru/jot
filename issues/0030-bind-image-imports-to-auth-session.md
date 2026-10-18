---
id: "0030"
title: "Bind image imports to their initiating authentication session"
status: closed
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

- [x] Promote the held-download/replacement-token probe into a failing focused regression before production changes; cover local-image preparation and metadata stages as well.
- [x] Check session identity after async boundaries and before starting each remote read/write; stale operations must never borrow replacement-session credentials.
- [x] Sign-out/account changes retire pending picker/import work and clear sensitive operation state without permitting late results to repopulate the new session.
- [x] Add mocked Photos/Drive request assertions showing no upload/create/metadata continuation after cancellation and no mixing of account credentials, albums, or content.
- [x] Add a Chrome workflow that starts an image import, signs out or changes session while work is held, releases it, and asserts resulting app state and absence of stale subsequent requests; keep normal imports/reuse working.

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

Fixed in app 0.34.1. Image operations capture their initiating
credential session and check it after asynchronous preparation, downloads, album reads/creation, uploads, and metadata
writes. Photos methods use session-scoped credentials across internal upload/batch-create and pagination requests.
Both providers check before request dispatch and after awaited responses/error bodies, so old errors cannot invalidate
new credentials. UI continuations carry explicit dates and the initiating auth lifecycle; sign-in/reconnect retires
older UI work, and sign-out clears picker/source/display state and stops the camera immediately.

Regression-first evidence: the held-download probe sent an old image with replacement credentials before the fix;
the actual Chrome file-input workflow exposed a pre-sign-out image in a newly opened same-date session. Both now pass.
Further failing probes reproduced Photos/Drive requests dispatched after an awaited token became stale and old error
bodies invalidating new credentials. A focused route regression ensures a request invalidating its own expired token
still opens reconnect. These provider/browser boundaries are outside the bounded replication model; focused tests use
the real flow/clients and mocked fetch. Existing A-to-B route regressions remain, and new Chrome coverage exercises
same-date and A-to-B re-entry followed by a successful fresh image upload.

Cancellation prevents later steps and result application; it cannot recall a request already submitted to Google.
A partial import may leave an app-created image/album without a note reference. No automatic remote rollback is
attempted, and no live Google account or private content was used for routine coverage.


Final verification: npm run verify passed all 789 tests, type checking, and production build. The final Pages build and
both artifact checks passed. Focused provider/route coverage passed 148 tests, including the auth-error regression.
Nine focused Chrome auth/account/image workflows passed. The final complete Chrome run passed 162/164; the mode-switch
cursor test (raw-keyboard.spec.ts:107) and narrow-screen disconnected-search test (daily-note-search.spec.ts:77) failed.
Both passed three isolated repetitions each (6/6) without implementation or test changes. This does not establish a
clean full-suite pass or rule out intermittent editor/search defects. All added security workflows passed in that run;
an earlier complete run passed 163/163 before the offline-reopen test was added. No local servers remain running.
