---
id: "0032"
title: "Exclude private request metadata from the shell cache"
status: open
type: bug
priority: medium
created: "2026-10-18"
labels: [security, privacy, service-worker]
---

# Exclude private request metadata from the shell cache

## Problem and evidence

`public/sw.js` caches every successful same-origin GET using the full request as the cache key. The
[#0024 review](../docs/security-privacy-review.md) reproduced a shared-link navigation whose synthetic title and text
remained in Cache Storage after the app removed the query from the visible URL and the user signed out. The source is
`fetch` handler `cache.put(event.request, copy)`, not the Local Draft store. Origin equality also admits requests to
unrelated paths and does not mean a response is a public shell asset.

The retained `service worker retains share-query data after URL cleanup and sign-out` Chrome probe in
[privacy-boundaries.spec.ts](../tests/browser/workflows/privacy-boundaries.spec.ts) characterizes this exposure.
No real private data was used; this establishes local retention, not third-party exfiltration.

## Outcome and scope

Define an explicit cacheable public-asset/navigation policy. Keep offline startup without persisting share parameters
or arbitrary same-origin application responses. Include migration/cleanup of sensitive keys already in Jot's existing
cache without deleting other applications' caches. Do not erase Local Drafts or weaken their durability.

## Acceptance criteria

- [ ] Shared title/text/URL parameters do not remain in Jot's Cache Storage before or after sign-out.
- [ ] Non-asset, out-of-app and credential-bearing requests/responses are excluded by an explicit policy.
- [ ] Existing Jot cache entries violating the policy are safely removed; unrelated caches remain intact.
- [ ] Offline shell and required JS/CSS/font assets still load at the Pages base path.

## Verification

First invert the retained Chrome characterization into a failing privacy regression. Assert actual Cache Storage keys
and cached bodies for share navigation, ordinary assets, out-of-path requests and authenticated requests; exercise worker
upgrade and offline reload. Run routine verification and Pages artifact checks. This is a worker boundary outside the
bounded Daily Note Replication model.

## Dependencies and related work

Related: [#0024](0024-review-local-data-privacy.md), [#0025](0025-review-deployment-security.md),
[#0026](0026-validate-security-workflows.md), and [#0033](0033-preserve-unrelated-origin-caches.md). Coordinate the
cache migration; neither finding requires fixing the other first.

## Resolution

Pending. No production fix included in the investigation.
