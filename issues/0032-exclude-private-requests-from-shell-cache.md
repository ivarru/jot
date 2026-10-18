---
id: "0032"
title: "Exclude private request metadata from the shell cache"
status: closed
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

- [x] Shared title/text/URL parameters do not remain in Jot's Cache Storage before or after sign-out.
- [x] Non-asset, out-of-app and credential-bearing requests/responses are excluded by an explicit policy.
- [x] Existing Jot cache entries violating the policy are safely removed; unrelated caches remain intact.
- [x] Offline shell and required JS/CSS/font assets still load at the Pages base path.

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

Fixed in app `0.34.4`. The v8 worker caches only query-free shell, manifest, icons and build assets in its
installation path. Explicit Authorization, redirects, private/no-store responses and unrelated paths are excluded;
public fetches omit ambient credentials. Query-bearing app navigation may use a public shell offline without retaining
its URL. Both install and runtime caching use the policy.

Activation migrates valid public assets, purges obsolete installation caches and removes owned legacy private entries.
Shared legacy caches have ambiguous ownership for arbitrary non-shell paths, including nested installations; those
entries are preserved rather than deleting potential neighboring data. Recognizable shell/asset entries and share-query
keys are cleaned, while obsolete installation-specific caches can be removed in full. A regression added during #0026
first reproduced deletion of a nested neighbor key; app `0.35.1` tightens legacy cleanup to preserve it. No Local Draft is removed by cache migration.

Regression-first: Chrome failed on a retained share key, and seven focused worker assertions failed before production
changes. The 16 worker tests and four Chrome privacy workflows now pass, including legacy cleanup, authorization/query
exclusion and neighboring-cache preservation. Routine verification passed 836 tests, typechecking and build. The Pages build and all six artifact checks passed,
including `/jot/` upgrade and offline reload. Test servers stopped. This cache boundary is outside the sync model.


Follow-up verification for `0.35.1`: the nested-neighbor unit regression first failed, then all 842 unit/integration
tests, typechecking and production build passed. All six Pages artifact checks passed, including a real `/jot/`
upgrade preserving the nested legacy key and offline startup. Activation assertions now wait for the worker's activated
state rather than observing partially completed migration.
