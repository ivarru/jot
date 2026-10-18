---
id: "0022"
title: "Review OAuth and account boundaries"
status: open
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

- [ ] Record the reviewed commit, auth entry points, token lifecycle, trust boundaries, and provider assumptions.
- [ ] Assess redirect/state handling, URL token cleanup, popup messaging where applicable, and scope minimization.
- [ ] Assess expiry, renewal, sign-out, and account-switch behavior, including delayed requests and cross-tab state; establish whether old-session work can expose or restore data.
- [ ] Record findings with concrete evidence and severity, or explicit no-finding results and limitations; create separate remediation issues for confirmed defects.

## Verification

Use focused auth/token tests and mocked provider requests to investigate boundary behavior. Any fix must begin with a
failing regression; browser auth workflow changes require an actual Chrome workflow asserting resulting app state.
Identify real-provider checks for [#0026](0026-validate-security-workflows.md). Never record tokens or account data.

## Dependencies and related work

No hard dependencies. Recommended first review. Related: [#0024](0024-review-local-data-privacy.md) and
[#0026](0026-validate-security-workflows.md).

## Resolution

Pending. Record review evidence, findings or no-finding results, and limitations on closure.

