---
id: "0026"
title: "Validate security boundaries with adversarial workflows"
status: open
type: investigation
priority: medium
created: "2026-10-18"
labels: [security, testing]
---

# Validate security boundaries with adversarial workflows

## Problem and evidence

Unit tests and the prior general review cannot establish all browser and real-provider security behavior.
The security reviews need a consolidated set of attack scenarios and explicit verification gaps.
[Manual provider retest](../docs/manual-google-provider-retest.md) already covers real OAuth, Drive, and Photos behavior.

## Outcome and scope

Consolidate boundary scenarios from the auth, content, privacy, and deployment reviews into reproducible automated
regressions and a minimal manual checklist. Cover malicious content, session transitions, and unintended disclosure.
Use the existing provider checklist where suitable; do not build a parallel general test suite or claim that fake
providers prove Google's real behavior.

## Acceptance criteria

- [ ] Link review results from issues #0022 through #0025 and map each material security boundary/finding to existing or added verification.
- [ ] Automate applicable adversarial scenarios with resulting app-state assertions, including unauthorized script/network effects and stale-session work where relevant.
- [ ] Document the remaining real-provider checks, required setup, safe synthetic data, and expected outcomes; record actual execution evidence or explicitly unverified checks.
- [ ] Record residual risks and remediation issue links; a confirmed unresolved weakness cannot be summarized as a clean security result.

## Verification

Follow [testing](../docs/testing.md): focused unit/mocked-fetch tests, Chrome browser workflows, and artifact checks.
Any bug fix requires a failing regression first. Use the sync model for applicable sync failures, or explain why a
focused test is needed. Run npm run verify and affected browser/artifact commands for code changes; stop local servers.
Real-account testing must be arranged explicitly and must not store credentials or private content in evidence.

## Dependencies and related work

Final completion depends on review results from [#0022](0022-review-oauth-account-boundaries.md),
[#0023](0023-review-untrusted-content.md), [#0024](0024-review-local-data-privacy.md), and
[#0025](0025-review-deployment-security.md). Test design can begin earlier. Remediation issues remain separate;
closing this validation issue records their status rather than implicitly closing them.

## Resolution

Pending. Record review evidence, findings or no-finding results, and limitations on closure.

