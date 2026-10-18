---
id: "0024"
title: "Review local data retention and privacy"
status: open
type: investigation
priority: high
created: "2026-10-18"
labels: [security, privacy, storage]
---

# Review local data retention and privacy

## Problem and evidence

Jot retains Local Drafts and tab-scoped auth/picker state, offers diagnostics, and uses a service worker.
[Sync safety](../docs/sync-safety.md#sync-diagnostics) specifies diagnostic exclusions and retention.
The review must verify implemented confidentiality boundaries as well as existing durability guarantees; no leak is
asserted by opening this issue.

## Outcome and scope

Map sensitive data through IndexedDB, local/session storage, memory, caches, clipboard, logs, and outbound requests.
Review sign-out, account changes, reload/offline behavior, diagnostic capture, and service-worker caching. Distinguish
intentional local durability from unintended retention. Document same-origin/browser-storage assumptions and shared-device
limitations. New encryption, backups, and recovery workflows are out of scope.

## Acceptance criteria

- [ ] Record a data inventory showing purpose, storage/transmission location, lifetime, and cleanup behavior for notes, credentials, provider identifiers, and diagnostics.
- [ ] Assess sign-out/account-change cleanup and delayed writes against intended privacy and durability behavior, including other tabs.
- [ ] Verify diagnostic/log redaction and service-worker cache boundaries; identify any unexpected third-party disclosure or sensitive cached responses.
- [ ] Record findings or explicit no-finding results with reviewed commit and evidence; document intentional retention and residual limitations without including private data.

## Verification

Use storage, diagnostics, and service-worker tests, with Chrome for actual cache, clipboard, and multi-tab behavior.
Use synthetic notes/accounts and mocked network endpoints. Any confirmed fix needs a failing regression and appropriate
browser/provider coverage; preserve Local Draft durability and explicit date snapshots.

## Dependencies and related work

No hard dependencies. Coordinate shared session cases with [#0022](0022-review-oauth-account-boundaries.md).
Related: [#0004](0004-non-conflict-diagnostic-capture.md), [#0009](0009-shared-storage-tabs.md), and
[#0026](0026-validate-security-workflows.md).

The [content assessment](../docs/security-content-review.md) confirmed automatic external-image requests,
tracked as [#0031](0031-control-external-note-image-loading.md). Include that exposure and clipboard parsing
resource behavior in the outbound-data inventory; the content review does not establish deployment-wide network isolation.

## Resolution

Pending. Record review evidence, findings or no-finding results, and limitations on closure.

