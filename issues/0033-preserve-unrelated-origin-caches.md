---
id: "0033"
title: "Preserve unrelated origin caches during worker activation"
status: open
type: bug
priority: medium
created: "2026-10-18"
labels: [security, storage, service-worker]
---

# Preserve unrelated origin caches during worker activation

## Problem and evidence

`public/sw.js` activation enumerates origin-wide Cache Storage and deletes every key except `jot-shell-v6`.
A Chrome probe seeded `other-app-synthetic-cache` and then registered an updated Jot worker; activation removed that
unrelated cache. Other project applications on the same GitHub Pages origin can lose offline data. A `/jot/`
registration scope controls documents, not which origin cache namespaces the worker can enumerate/delete.

See the [#0024 assessment](../docs/security-privacy-review.md) and retained
`service-worker activation deletes an unrelated origin cache` probe in
[privacy-boundaries.spec.ts](../tests/browser/workflows/privacy-boundaries.spec.ts). No actual neighboring application
was touched; the cache and body were synthetic.

## Outcome and scope

Make cache ownership explicit and delete only obsolete caches belonging to this Jot installation. Consider multiple
Jot base paths sharing one origin when choosing the namespace. Preserve cleanup of obsolete owned cache versions.

## Acceptance criteria

- [ ] Worker install/upgrade/activation preserves other applications' caches and other Jot installations' caches.
- [ ] Only obsolete cache versions owned by this installation are removed.
- [ ] Offline startup and migration from the current cache namespace remain functional under `/jot/`.

## Verification

Start with a failing Chrome regression by reversing the retained characterization. Seed unrelated and obsolete owned
caches, activate an update, and assert surviving keys and offline content. Verify project-path scope and routine/Pages
checks. This is Cache Storage ownership outside the bounded Daily Note Replication model.

## Dependencies and related work

Related: [#0032](0032-exclude-private-requests-from-shell-cache.md), [#0025](0025-review-deployment-security.md), and
[#0026](0026-validate-security-workflows.md). Coordinate namespace migration without combining unrelated cache ownership.

## Resolution

Pending. No production fix included in the investigation.
