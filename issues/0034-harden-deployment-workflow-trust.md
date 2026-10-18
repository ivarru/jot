---
id: "0034"
title: "Pin deployment actions and reduce build-job authority"
status: open
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

- [ ] All action references use verified full commit SHAs with readable release labels and update guidance.
- [ ] Build permissions are minimal; deployment/OIDC authority is granted only where required and justified.
- [ ] Checkout does not persist credentials unless a concrete later operation requires them.
- [ ] Allowed manual-dispatch revisions and protected-environment assumptions are explicit; unverified settings remain labeled.
- [ ] Pages artifacts and deployment handoff remain valid; any external execution needed for verification is explicitly recorded.

## Verification

Validate workflow syntax and job/token permission boundaries against official action documentation, then run local routine
and Pages artifact checks. Record actual Actions execution if authorized; local tests cannot prove GitHub environment
protection. Version the deployment-artifact/workflow behavior change under repository rules.

## Dependencies and related work

Related: [#0025](0025-review-deployment-security.md), [#0026](0026-validate-security-workflows.md), and
[#0027](0027-follow-up-build-dependency-advisory.md). No hard dependency.

## Resolution

Pending. No workflow or external setting changed in the assessment.
