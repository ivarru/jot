# Documentation

This index explains what each project document covers and how it should be used. Current behavior and repository rules
take precedence over historical investigations and private working notes.

## Repository-level guidance

| Document | Authority and purpose |
| --- | --- |
| [README](../README.md) | User-facing project overview, limitations, local setup, and contributor entry points. |
| [AGENTS.md](../AGENTS.md) | Normative repository rules for implementation, regression coverage, versioning, and verification. |
| [CONTEXT.md](../CONTEXT.md) | High-level domain context, shared vocabulary, and stable invariants in the domain-driven-design sense. It remains at the repository root so conventions and agent skills can discover it. Consult it when naming concepts or changing the implemented domain model. |
| [Project notes](notes.md) | Non-authoritative parking lot for known issues, future work, and unresolved design questions. Remove or promote entries when they are resolved. |
| [Local issues](../issues/README.md) | Authoritative backlog and workflow for scoped work, with stable Markdown issue files, acceptance criteria, and completion evidence. Open issues are proposals, not current behavior specifications. |

## Current product and engineering references

| Document | Authority and purpose |
| --- | --- |
| [Testing](testing.md) | Normative test-layer responsibilities, commands, regression workflow, browser-test practices, and CI coverage. |
| [Deployment](deployment.md) | Current build, GitHub Pages, Google Cloud, OAuth, and release procedures. |
| [Browser security policy](browser-security-policy.md) | Current production CSP/referrer controls, compatibility evidence, offline upgrade and hosting limits. |
| [Dependency maintenance](dependency-maintenance.md) | Dependency migration decisions, compatibility notes, and verification evidence. |
| [OAuth and account boundary review](security-oauth-review.md) | Dated security assessment, reproduction evidence, open remediation work, and provider verification limits. |
| [Untrusted content review](security-content-review.md) | Dated rendering, link, math, and image-network assessment, retained payload tests, findings, and limits. |
| [Local data privacy review](security-privacy-review.md) | Dated storage, retention, cleanup, diagnostics, and outbound-data assessment with cache findings and verification limits. |
| [Deployment security review](security-deployment-review.md) | Dated CI, dependency, production artifact, public header and browser-policy assessment with follow-up work. |
| [Consolidated security verification](security-verification.md) | Current coverage map, replay commands, remediation outcomes, residual risks and explicitly unrun manual handoff. |
| [Sync and Connection Statuses](sync-and-connection-statuses.md) | Current behavioral reference for authentication, selected-note synchronization, refreshes, queued work, and conflicts. |
| [Sync Model](sync-model.md) | Scope, events, invariants, and lifecycle assumptions of the bounded Daily Note Replication model. It does not describe every provider or UI workflow. |
| [Daily Note Replication Safety](sync-safety.md) | Safety contract, threat model, diagnostics, established reliability work, and deferred sync hardening. |
| [Tags](tags.md) | Current Reference Tag syntax, structural association, storage boundaries, suggestions, derived Drive indexes, and compatibility. |
| [Manual Google Provider Retest](manual-google-provider-retest.md) | Manual checklist for real OAuth, Drive, and Google Photos behavior that automated fake-provider tests cannot establish. |
| [Architecture Decision Records](adr/README.md) | Index of accepted architectural decisions and their trade-offs. ADRs preserve historical rationale; a later decision should supersede rather than silently rewrite one. |

## Deferred designs

| Document | Authority and purpose |
| --- | --- |
| [Export and recovery contract](export-and-recovery.md) | Postponed design for export packages and safe restore, retained for reconsideration. ADR 0010 is deferred and its follow-up issues are blocked; this is not an active implementation contract. |

## Historical and working material

| Document | Authority and purpose |
| --- | --- |
| [Milkdown focus and caret investigation](editor-focus-investigation.md) | Historical postmortem for the editor focus regression resolved in version 0.21.32. Useful evidence and testing lessons, but not a current behavior specification. |
| [Code walkthrough notes](code-walkthrough-notes.md) | Private, non-authoritative working record of the 2026-08-30 documentation and architecture walkthrough. It tracks completed improvements and remaining opinions. |
| [Improvement assessment](improvement-assessment.md) | Advisory 2026-09-18 assessment of reliability, property-based testing, recovery, and a staged path toward a second brain. Recommendations are not accepted product or architecture decisions. |

The historical and working documents remain alongside current references for now. If that group grows, move it into a
clearly named historical or working-notes directory and update this index.
