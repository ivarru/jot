# Untrusted content and rendering review

Review date: 2026-10-18. Reviewed code: `7c6096c413399c40585deac76829e669ef72c805`, app `0.34.2`.
This records [local issue #0023](../issues/0023-review-untrusted-content.md). It is a bounded assessment of this revision,
not a security certification. The automated payloads are retained in
[Chrome workflows](../tests/browser/workflows/untrusted-content.spec.ts) and
[link boundary tests](../src/editor/untrustedContent.test.ts).

## Input and sink inventory

| Source | Transformation and trust boundary | Sink and observed protection |
| --- | --- | --- |
| Raw editing, imported `.md` files, Drive note bodies | File names are checked as `YYYY-MM-DD.md`; file contents and Drive media text remain untrusted Markdown. Upload planning, replication, and drafts preserve source rather than sanitize storage. All reach the same Milkdown parser. | Raw mode uses a textarea. WYSIWYG uses ProseMirror schema nodes and node views. HTML Markdown nodes render literal text through upstream `htmlSchema`, not live HTML. Switching modes is not a storage sanitization step. |
| Rich HTML clipboard and drag/drop | ProseMirror parses clipboard/drop HTML into its schema; Milkdown's clipboard plugin uses the preprocessed slice. Plain clipboard Markdown uses the Markdown parser. Image-file paste has a separate attachment workflow. | Schema admits supported elements/attributes, not arbitrary event handlers, scripts, iframes, or embedded HTML. This is schema filtering, not a general DOMPurify pass. Browser paste and round-trip checks exercise the resulting editor DOM. Drop uses upstream parsing; native drag/drop was inspected but not separately exercised. |
| Link dialog, clipboard link suggestion, share URL | `linkEditing.ts` parses clipboard HTML in a separate `DOMParser` document and extracts anchor href and textContent; supported destination checks reject unsafe schemes. It never adopts those source elements into the editor. | Labels become text/Markdown, not HTML. `dailyNoteLinks.ts` checks external protocols with `URL`; same-origin date fragments become internal navigation. `openEditorLink` opens supported external links with `noopener,noreferrer`. Primary editor clicks are prevented even when a destination is rejected. |
| Stored or pasted link nodes | Milkdown `sanitizeLinkHref` filters explicit schemes, including control-character obfuscation. Jot overrides it only for exact `jot:tag/` plus an already canonical tag name (`[a-z0-9]+` segments separated by single hyphens). | Only canonical tags regain their href. Encoded/noncanonical tag destinations remain filtered. HTTP(S), mailto, tel and upstream FTP anchors remain possible; the app's primary-click external allowlist is narrower. Native auxiliary/context-menu navigation is subject to the DOM href, not the primary-click route callback. No script scheme survived the tested renderer cases. |
| Markdown images and pasted HTML images | `milkdownImages.ts` assigns src/alt/title as DOM properties. It does not concatenate HTML and does not restrict external image locations. | An `img` loads its source automatically. Inline SVG data-image content is an image context, not an embedded document; the tested script/event payload did not execute. Arbitrary remote images disclose access to their hosts; see finding below. |
| App-managed `jot:image:` attachments, local files/camera, Photos picker | Strict attachment ID syntax selects metadata lookup. Drive stores IDs; Photos responses supply display base URLs. Local files are prepared as images, not HTML. Downloads/uploads use authenticated providers scoped to the initiating session. | Attachment IDs are encoded in API paths; note Markdown does not supply the authenticated Photos download URL. Display URLs also go to `img`. Google API response integrity is a trust assumption: picker base URLs are not host-allowlisted before provider download attaches a bearer header. No note-controlled path to that header sink was established. Prior auth/session findings are covered by #0028–#0030. |
| Math source, including pasted math data attributes | `milkdownLatex.ts` parses math, shares macros within an editor render scope, calls KaTeX with `trust:false`, then DOMPurify with HTML/SVG profiles. Source attributes use DOM assignment. Errors fall back to textContent. | The sole app HTML string rendering sink is sanitized KaTeX output assigned to innerHTML. Trusted commands cannot create the tested href/class/image payloads. SVG roots for ordinary square roots still render. No unsanitized app error HTML sink was found. |

The installed Milkdown commonmark source (`node_modules/@milkdown/preset-commonmark/src/{mark/link.ts,
mark/sanitize-href.ts,node/html.ts,node/image.ts}`) and clipboard source were inspected, alongside the app's custom
schema/view configuration in `src/components/MilkdownEditor.tsx`. These upstream implementations are part of the
reviewed lockfile, not a claim about future releases. KaTeX's [security guidance](https://katex.org/docs/security)
identifies trusted commands, macro expansion, and dimensions as separate controls. DOM parsing into an inert document
is not a guarantee of zero network activity; see the browser [DOMParser reference](https://developer.mozilla.org/en-US/docs/Web/API/DOMParser/parseFromString).
The link-dialog extraction path therefore must not be treated as a network isolation boundary.

## Findings and tested outcomes

**Confirmed privacy exposure, medium priority:** an external Markdown image is fetched when its note is rendered,
without a per-image loading decision. An imported or remotely edited note can carry a unique tracking URL. The
intercepted Chrome request contained the URL marker and an origin-only Referer, and no Authorization header.
The endpoint would also see the network client's connection; no real endpoint was contacted. This establishes an
access beacon, not extraction of arbitrary surrounding note text or Google tokens. It is tracked separately as
[#0031](../issues/0031-control-external-note-image-loading.md), with the broader inventory handed to #0024.
No production fix or new loading policy is introduced by this review.

**No script-execution or unsafe-scheme finding in the tested cases.** Payloads covered script tags, HTML image event
handlers, SVG onload/foreignObject/iframe markup, javascript/data links, HTML-entity and tab-obfuscated schemes,
canonical and malformed/encoded tag destinations, KaTeX href/htmlClass/includegraphics commands, and an inline SVG
image. Browser assertions checked absence of executable nodes/attributes, a script sentinel, resulting source/DOM,
and blocked script-link versus allowed HTTPS navigation. Benign bold paste, canonical tags, square-root SVG,
ordinary HTTPS links and note source survived. The imported note was opened from fake remote storage and checked
again; live Google media delivery was not required to test the common rendering sink.

**Bounded resource assessment:** a roughly 60 KB note (4,000 repetitions of ordinary words) plus 40 nested square
roots rendered and returned to raw mode within the ordinary browser test timeout. A recursive macro returned without
hanging the editor. Installed KaTeX defaults cap macro expansion at 1,000; Jot does not override that default.
KaTeX dimensions remain unbounded (`maxSize: Infinity`), and total note size, nesting, aggregate formulas, image decode
cost and synchronous parse time have no application-wide hard budget. These are residual availability limits, not a
reproduced practical exhaustion finding from the bounded probes. No arbitrary size limit was added. This is neither a
benchmark nor evidence that very large/adversarial documents cannot hang the main thread.

## Verification and limits

Replay the focused security coverage with:

```sh
npx vitest run src/editor/untrustedContent.test.ts src/editor/linkEditing.test.ts src/components/milkdownClipboard.test.ts src/components/milkdownImages.test.ts src/domain/jotTags.test.ts src/domain/dailyNoteLinks.test.ts
npx playwright test tests/browser/workflows/untrusted-content.spec.ts
```

Results: the focused unit run passed 76 cases (including 23 new cases); the combined content, link-modal,
unified-tags and LaTeX Chrome run passed 44 workflows (including four new content cases). Routine `npm run verify`
passed 820 tests, typechecking and the production static build. No production code or dependency changed, and the
app remains `0.34.2`. The preview servers stopped after verification.

All payloads and accounts were synthetic. The probe hostname `probe.invalid` is intercepted and fulfilled/aborted
locally. Clipboard payload injection exercises Chrome and the real paste handler with a constructed ClipboardEvent;
it does not certify every OS clipboard producer. The existing link-modal workflows additionally exercise browser
clipboard permissions and read APIs. No independent sanitizer bypass corpus, mutation fuzzer, every supported URI
scheme, native context-menu action, exhaustive MathML/SVG grammar, image decompression bomb, or unbounded complexity
search was run. No live Drive/Photos account or deployment-specific referrer/CSP configuration was tested. Same-origin
script compromise, browser extensions and malicious installed dependencies remain outside the content boundary.

The new tests preserve the current external-image behavior as review evidence; #0031 must change those expectations
to assert the chosen user-controlled policy. Their current passing status must not be used as a clean privacy result.
[#0026](../issues/0026-validate-security-workflows.md) owns consolidated adversarial/manual verification;
[#0024](../issues/0024-review-local-data-privacy.md) owns broader outbound-data analysis and retention;
[#0025](../issues/0025-review-deployment-security.md) owns deployed browser policy and origin assumptions.
