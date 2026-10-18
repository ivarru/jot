---
id: "0031"
title: "Control loading of external images in notes"
status: closed
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

## Chosen loading policy

Arbitrary network image URLs (including relative and protocol-relative URLs) start blocked. Each image has an explicit
Load control identifying the destination host. Permission belongs to that exact URL/node view only, expires on mode/date
switch or reload, and is never persisted or shared with another note. Refreshes of the same view may retain permission
for the same URL; changing the URL resets it. Managed `jot:image:` attachments keep the authorized Photos workflow.
Local data-image and same-origin blob sources do not contact an external host. Other schemes are unsupported.
Permitted requests use no-referrer and no manually supplied Authorization header; normal browser image-cookie policy
still applies after consent. Markdown stays unchanged. Clipboard serialization must not construct a live external img.

## Acceptance criteria

- [x] Define the default and permission scope for external image loading, including managed Photos images and reloads.
- [x] Imported, remotely loaded, pasted, and raw-edited notes make no arbitrary image request before the required user decision.
- [x] The explicit loading workflow displays the image and preserves Markdown; declining loading keeps editing usable.
- [x] Record referrer/credential policy and actual browser request evidence; update the existing characterization test to verify the intended privacy boundary.

## Verification

Start with a failing Chrome regression for the chosen default policy. Intercept a unique external image URL and
assert zero requests before consent, then resulting image state after consent. Test paste, import/open, mode switches,
reload, protocol-relative URLs, and a managed attachment. Include date A-to-B transitions if loading permission or
callbacks are date-bound. Follow routine verification and versioning rules for the implementation.

## Dependencies and related work

No hard dependency. Originated in [#0023](0023-review-untrusted-content.md). Coordinate outbound privacy inventory with
[#0024](0024-review-local-data-privacy.md) and consolidated validation with [#0026](0026-validate-security-workflows.md).

## Resolution

Implemented in app `0.35.0` under the chosen policy above. Network images render a host-labelled Load control;
permission is exact-URL/node-view scoped, never persisted, reset on hidden/raw mode, and cannot transfer between dates.
Harmless refreshes retain the same node's permission without repeating requests. Unsupported schemes/userinfo are not
offered a load action. Managed Photos, local image data and same-origin blob displays retain their existing behavior.
All displayed images use no-referrer; ordinary browser cookie rules remain explicit after a user's load decision.

Image serialization uses inert span metadata so plain-Markdown paste/clipboard DOM creation cannot fetch before consent.
Native HTML and Markdown clipboard workflows both preserve image source/title and require permission. No image load
callback modifies Markdown; an in-flight date-A image cannot grant date B permission or change B's Local Draft.
This rendering/browser boundary is outside the bounded sync model.

The initial permission browser regression failed before production changes. Twenty Chrome workflows now pass, covering
five new permission workflows, adversarial content, managed upload, stale-session images, reconnect/conflict and diagnostic
copying. Routine `npm run verify` passed 842 tests, typechecking and the production build. The Pages build and all six artifact checks passed. Servers stopped after verification. No live account or untrusted endpoint
was contacted; probe requests were intercepted locally.
