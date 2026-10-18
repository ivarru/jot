---
id: "0027"
title: "Reassess the remaining build dependency advisory"
status: open
type: investigation
priority: medium
created: "2026-10-18"
labels: [security, dependencies]
---

# Reassess the remaining build dependency advisory

## Problem and evidence

The last recorded audit after migration reported four high-severity package entries from one braces stack-exhaustion
advisory in the SolidStart/micromatch/fast-glob build chain. No patched braces version was available at that assessment;
npm suggested an inappropriate framework downgrade. See [migration evidence](../docs/dependency-maintenance.md) and
[the advisory](https://github.com/advisories/GHSA-vfj7-8cjw-p6xm). These are historical results, not a fresh audit.

## Outcome and scope

Refresh advisory status and exact dependency paths; assess exposure from repository/build inputs versus user-supplied
Daily Note content in the shipped static app. Adopt a compatible upstream fix when available. Avoid force upgrades,
unsupported overrides, or framework downgrades solely to clear a report. This is a bounded follow-up, not an automatic
recurring monitor or permission to change production infrastructure.

## Acceptance criteria

- [ ] Record a fresh dated audit, exact affected dependency paths, upstream advisory status, and evidence for build/runtime reachability.
- [ ] If a compatible fix exists, apply and verify it in an isolated version-bumped commit; preserve the static deployment and documented behavior.
- [ ] If no safe fix exists, record a reasoned risk disposition, affected inputs, and a concrete upstream release/advisory trigger for reassessment; do not claim remediation.
- [ ] Update dependency maintenance notes with the outcome and remaining audit limitations.

## Verification

Use primary upstream advisory/release information and the installed dependency graph. For dependency changes, run a
clean lockfile install, npm run verify, and affected Chrome/Pages artifact checks. Record audit results separately from
exploitability conclusions. Do not use npm audit fix --force as a substitute for compatibility review.

## Dependencies and related work

No hard dependencies. Related: [#0025](0025-review-deployment-security.md). Absence of an upstream fix does not block
the other security reviews; any accepted residual risk must remain explicit.

## Resolution

Pending. Record review evidence, findings or no-finding results, and limitations on closure.

