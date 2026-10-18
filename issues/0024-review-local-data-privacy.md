---
id: "0024"
title: "Review local data retention and privacy"
status: closed
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

- [x] Record a data inventory showing purpose, storage/transmission location, lifetime, and cleanup behavior for notes, credentials, provider identifiers, and diagnostics.
- [x] Assess sign-out/account-change cleanup and delayed writes against intended privacy and durability behavior, including other tabs.
- [x] Verify diagnostic/log redaction and service-worker cache boundaries; identify any unexpected third-party disclosure or sensitive cached responses.
- [x] Record findings or explicit no-finding results with reviewed commit and evidence; document intentional retention and residual limitations without including private data.

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

Completed against `cb8e70e` (app `0.34.2`). The [assessment](../docs/security-privacy-review.md) records the
sensitive-data inventory, storage lifetimes, cleanup, network destinations, diagnostic exclusions, origin assumptions,
and explicit shared-device/verification limits.

Confirmed cache findings are tracked separately: [#0032](0032-exclude-private-requests-from-shell-cache.md) for retained
share-query data and [#0033](0033-preserve-unrelated-origin-caches.md) for unrelated origin-cache deletion. Existing
[#0031](0031-control-external-note-image-loading.md) remains open. Closing the investigation does not fix or accept them.

Verification: 47 focused unit cases, 12 Chrome privacy/account/image/offline workflows and two Chrome diagnostics-copy
workflows passed. Routine `npm run verify` passed 820 tests, typechecking and the production static build. Three new
Chrome probes are retained; two characterize the confirmed unsafe behavior and must change during remediation.
All data and accounts were synthetic; no live provider/deployment, physical erasure or HTTP-cache retention was tested.
Only documentation/tests changed, so no app version bump was required. Preview servers stopped after the runs.

