---
id: "0034"
title: "Pin deployment actions and reduce build-job authority"
status: closed
type: feature
priority: medium
created: "2026-10-18"
labels: [security, deployment, supply-chain]
---

# Pin deployment actions and reduce build-job authority

## Problem and evidence

The [#0025 assessment](../docs/security-deployment-review.md) found all deployment actions referenced by mutable major
version tags. Workflow-level `pages:write` and `id-token:write` are inherited by the build job, where dependencies,
plugins and tests execute. Checkout also persists its read credential by default. These are hardening gaps, not
evidence of a compromised action, available cloud role or bypassed `github-pages` environment.

## Outcome and scope

Pin reviewed official action revisions and restrict credentials/permissions to the jobs and steps that need them.
Preserve Pages build/upload/deploy behavior and a practical documented update process. Decide how manual-dispatch refs
are permitted; do not assume the push branch filter also constrains manual runs. External branch/environment protection
configuration must be inspected or changed only under separately authorized operator work.

## Acceptance criteria

- [x] All action references use verified full commit SHAs with readable release labels and update guidance.
- [x] Build permissions are minimal; deployment/OIDC authority is granted only where required and justified.
- [x] Checkout does not persist credentials unless a concrete later operation requires them.
- [x] Allowed manual-dispatch revisions and protected-environment assumptions are explicit; unverified settings remain labeled.
- [x] Pages artifacts and deployment handoff remain valid; any external execution needed for verification is explicitly recorded.

## Verification

Validate workflow syntax and job/token permission boundaries against official action documentation, then run local routine
and Pages artifact checks. Record actual Actions execution if authorized; local tests cannot prove GitHub environment
protection. Version the deployment-artifact/workflow behavior change under repository rules.

## Dependencies and related work

Related: [#0025](0025-review-deployment-security.md), [#0026](0026-validate-security-workflows.md), and
[#0027](0027-follow-up-build-dependency-advisory.md). No hard dependency.

## Resolution

Implemented in app `0.35.2`. Workflow defaults grant no permissions; build has only contents-read, credentials are not
persisted by checkout, and production fake auth is explicitly off. Pages configuration (enablement disabled) moved into
the deploy job with Pages/OIDC write permissions, before deploying the same verified artifact. Both jobs accept only
`refs/heads/master`, including manual dispatch. Protected-branch/environment settings remain unverified and unchanged.

Official repository tag resolution on 2026-10-18 supplied these full commit pins (existing major versions retained):

| Action | Release label | Commit |
| --- | --- | --- |
| checkout | v5 | `fbc6f3992d24b796d5a048ff273f7fcc4a7b6c09` |
| setup-node | v5 | `a0853c24544627f65ddf259abe73b1d18a591444` |
| configure-pages | v6 | `45bfe0192ca1faeb007ade9deae92b16b8254a0d` |
| upload-pages-artifact | v5 | `fc324d3547104276b827a68afc52ff2a11cc49c9` |
| deploy-pages | v5 | `368f82528645a54fb793d4d04e342629a3f51346` |

The official configure/upload/deploy action metadata was inspected; upload's nested action is already SHA-pinned.
[Deployment guidance](../docs/deployment.md#github-actions) records the pin-update process and trust/dispatch limits.
Official actionlint v1.7.12 (downloaded checksum verified) passed. Routine verification passed 842 tests, typechecking
and production build. The Pages build and all six artifact checks passed, including production auth and offline worker migration.
No test server remains running. No Actions run, deployment, OIDC
exchange, branch/environment setting or external account change was performed; actual CI handoff remains unverified.
