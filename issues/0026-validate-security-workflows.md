---
id: "0026"
title: "Validate security boundaries with adversarial workflows"
status: closed
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

- [x] Link review results from issues #0022 through #0025 and map each material security boundary/finding to existing or added verification.
- [x] Automate applicable adversarial scenarios with resulting app-state assertions, including unauthorized script/network effects and stale-session work where relevant.
- [x] Document the remaining real-provider checks, required setup, safe synthetic data, and expected outcomes; record actual execution evidence or explicitly unverified checks.
- [x] Record residual risks and remediation issue links; a confirmed unresolved weakness cannot be summarized as a clean security result.

## Verification

Follow [testing](../docs/testing.md): focused unit/mocked-fetch tests, Chrome browser workflows, and artifact checks.
Any bug fix requires a failing regression first. Use the sync model for applicable sync failures, or explain why a
focused test is needed. Run npm run verify and affected browser/artifact commands for code changes; stop local servers.
Real-account testing must be arranged explicitly and must not store credentials or private content in evidence.

## Dependencies and related work

Reviews [#0022](0022-review-oauth-account-boundaries.md), [#0023](0023-review-untrusted-content.md),
[#0024](0024-review-local-data-privacy.md) and [#0025](0025-review-deployment-security.md) are complete. The
[consolidated evidence map](../docs/security-verification.md) links their findings and current regressions. Original
remediations #0028–#0030 and image/cache remediations #0031–#0033 are closed with retained automated evidence;
#0027, #0034 and #0035 remain open. The CSP candidate is test-only, and live-provider/deployed-release checks remain
explicitly unverified in the existing [manual checklist](../docs/manual-google-provider-retest.md#consolidated-security-release-retest).

## Resolution

Completed the [consolidated coverage map and replay guide](../docs/security-verification.md), linking all four
assessments and each material auth/content/privacy/deployment finding to retained unit, mocked-provider, Chrome or
artifact coverage. The existing manual provider checklist now contains safe synthetic setup and expected outcomes;
live-provider, deployed-policy and GitHub settings checks remain explicitly unexecuted.

Added a real rich-clipboard link-suggestion case: the intended link is inserted without requesting its unrelated image.
The consolidated Chrome run passed 37 workflows at `2c3e21a` (0.35.0). Validation also found nested-neighbor legacy
cache deletion; a failing regression preceded the `959c440` fix (0.35.1). That worker-only follow-up passed all 842
unit/integration tests, typechecking/build, four affected Chrome privacy workflows and six Pages artifact checks.
Final Pages/canary build and artifact checks passed after restoring production output; servers stopped.

Closed implementation work #0028–#0033 is distinguished from open #0027 (dependency advisory), #0034 (workflow trust)
and #0035 (production policy). Unknown legacy cache ownership and same-origin/profile limits remain explicit; a CSP
candidate pass is not a shipped policy. No live account, deployment, external account change or real private payload
was used. This closing change contains only tests/documentation; app remains `0.35.1`. Closing records validation and
handoff, not a clean security certification or acceptance of unresolved risks.

