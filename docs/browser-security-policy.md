# Browser security policy

Production HTML enforces a Content Security Policy (CSP) through an early meta element, before scripts and resource
links. The static Pages artifact and offline shell carry the same policy. Development omits CSP because Vite's inline
bootstrap and websocket would otherwise require broader production allowances. The production-build fake-provider
browser preview enforces the release policy too. The source of truth is `src/documentHead.ts`.

## Allowed resources and reasons

| Directive | Allowance and purpose |
| --- | --- |
| `default-src` | None; individual resource types require explicit permission. |
| `script-src` / `script-src-attr` | Same-origin bundled scripts and Google's exact GIS client URL; no inline scripts, event handlers, eval, data scripts or arbitrary remote scripts. |
| `connect-src` | Same-origin resources, Drive API, Photos Library/Picker APIs, Google media subdomains, GIS endpoints and OAuth revocation. Google media subdomains accommodate provider-returned attachment URLs. |
| `style-src` | Same-origin CSS, GIS stylesheet and inline styles required by KaTeX and editor layout. This does not permit inline JavaScript. |
| `font-src` | Same-origin fonts and data fonts: Vite inlines a small KaTeX font in generated CSS. |
| `img-src` | Same-origin, data/blob images and ordinary HTTP/HTTPS URLs. External note images still require per-view consent; CSP does not replace that control. Browser mixed-content restrictions still apply. |
| `frame-src` / `form-action` | GIS and OAuth paths; forms can also target this origin. GIS can create its own frames. |
| `worker-src`, `manifest-src` | Same-origin workers and app manifest. |
| `media-src` | Same-origin and blob media; camera preview uses a browser `MediaStream`. |
| `base-uri`, `object-src` | None; content cannot replace the base URL or embed plugin documents. |

The document referrer policy is `strict-origin-when-cross-origin`, preserving origin information expected by GIS without
sending note routes or query strings cross-origin. Individual external image/link actions retain their stricter
`no-referrer` behavior. An attacker controlling an allowed same-origin script or trusted Google script remains trusted
by CSP. Inline styles and broad image URLs are deliberate compatibility allowances, not sanitizer substitutes.

The GIS paths follow [Google's CSP guidance](https://developers.google.com/identity/gsi/web/guides/get-google-api-clientid#content_security_policy).
OAuth redirects use full-page navigation; CSP resource directives do not constrain every top-level navigation target.

## Offline upgrades

The worker's v9 cache installs a fresh shell. Activation migrates public assets but never copies HTML documents from
older caches over the current shell, so an old unprotected `index.html` cannot bypass the new policy offline. Existing
open documents keep their original policy until navigation/reload. Installation-specific ownership and conservative
handling of ambiguous neighboring legacy keys remain unchanged. No Local Drafts are deleted by this migration.

## Verification and remaining release checks

Artifact tests inspect the actual generated policy ordering and enforce blocked inline scripts/event handlers,
unlisted remote scripts/fetches and base-URL replacement in Chrome. They also exercise `/jot/` startup and an offline
upgrade with an old unprotected HTML fixture. Workflow tests load a synthetic GIS implementation through its approved
script URL, open a native popup, follow a mocked OAuth redirect, verify account gating/date restoration, edit math,
fetch mocked Photos/media endpoints, decode a blob image and capture/save Chrome’s synthetic camera stream.
Existing image import, per-view consent, untrusted content,
clipboard and editor regressions run under the production policy.

These mocks do **not** establish Google's current full script/frame tree, popup consent UI, real picker navigation,
account selection, revocation or expiring media behavior. Complete the
[manual provider retest](manual-google-provider-retest.md#production-browser-policy-retest) against an authorized test
release before treating live-provider compatibility as established. No deployment or Google configuration change is
part of local verification.

## Header and hosting limits

Pages' repository artifact supplies HTML meta controls, not arbitrary response headers. The CSP specification does
[not support `frame-ancestors`, `sandbox` or report-only policy through meta](https://www.w3.org/TR/CSP/#meta-element).
No framing protection, CSP reporting endpoint, Permissions-Policy, COOP, COEP, HSTS or new HTTPS enforcement is claimed
here. In particular, blindly enabling COOP could break the OAuth popup opener relationship. Inspect actual response
headers and Pages HTTPS settings separately after an authorized deployment.

Other projects on a shared origin can access origin-wide browser storage; CSP and cache namespaces do not isolate
those applications. A dedicated origin or header-capable host would require an operator decision and explicit OAuth
origin/redirect migration. It is separate work, not an implicit requirement to change hosting in this release.
