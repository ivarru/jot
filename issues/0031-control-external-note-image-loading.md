---
id: "0031"
title: "Control loading of external images in notes"
status: open
type: feature
priority: medium
created: "2026-10-18"
labels: [security, privacy, editor]
---

# Control loading of external images in notes

## Problem and evidence

The [#0023 assessment](../docs/security-content-review.md) confirmed that an arbitrary Markdown image URL is fetched
as soon as its note renders in WYSIWYG. `src/components/milkdownImages.ts:createImg` assigns the supplied src directly.
An imported or externally edited note can therefore beacon that it was opened to a third-party host, including a
unique URL marker and the browser's network connection. Chrome sent an origin-only Referer and no Authorization header
in the local intercepted reproduction. This does not establish leakage of surrounding note text or OAuth credentials.

The passing `external Markdown images make automatic unauthenticated requests` case in
[the browser evidence](../tests/browser/workflows/untrusted-content.spec.ts) reproduces current behavior; it is not the
desired future privacy assertion. All probe requests are intercepted locally.

## Outcome and scope

Give users a deliberate loading decision for arbitrary external note images, with a safe initial state for imported
and remotely supplied Markdown. Choose and document the scope/lifetime of permission before implementation. Preserve
Markdown source and ordinary editing; distinguish app-managed Photos attachments from arbitrary note URLs. Cover HTML
paste and protocol-relative URLs as well as Markdown image syntax. Coordinate any clipboard-only resource fetches
with #0024. Do not add an image proxy or silently rewrite external URLs as part of this issue.

## Acceptance criteria

- [ ] Define the default and permission scope for external image loading, including managed Photos images and reloads.
- [ ] Imported, remotely loaded, pasted, and raw-edited notes make no arbitrary image request before the required user decision.
- [ ] The explicit loading workflow displays the image and preserves Markdown; declining loading keeps editing usable.
- [ ] Record referrer/credential policy and actual browser request evidence; update the existing characterization test to verify the intended privacy boundary.

## Verification

Start with a failing Chrome regression for the chosen default policy. Intercept a unique external image URL and
assert zero requests before consent, then resulting image state after consent. Test paste, import/open, mode switches,
reload, protocol-relative URLs, and a managed attachment. Include date A-to-B transitions if loading permission or
callbacks are date-bound. Follow routine verification and versioning rules for the implementation.

## Dependencies and related work

No hard dependency. Originated in [#0023](0023-review-untrusted-content.md). Coordinate outbound privacy inventory with
[#0024](0024-review-local-data-privacy.md) and consolidated validation with [#0026](0026-validate-security-workflows.md).

## Resolution

Pending. Review evidence only; no loading policy has been implemented or accepted.
