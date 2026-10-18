---
id: "0023"
title: "Review untrusted content and rendering boundaries"
status: closed
type: investigation
priority: high
created: "2026-10-18"
labels: [security, editor]
---

# Review untrusted content and rendering boundaries

## Problem and evidence

Jot accepts Markdown, pasted content, links, images, and imported notes. Recent Milkdown, DOMPurify, ProseMirror, and
KaTeX migrations changed relevant dependencies and introduced a custom canonical tag-link adapter; see
[dependency maintenance](../docs/dependency-maintenance.md). This is review scope, not evidence of an exploit.

## Outcome and scope

Trace untrusted input from paste, files, Drive notes, link/tag dialogs, image sources, and math into DOM, navigation,
and network sinks. Review sanitization, URL scheme handling (including canonical jot:tag/ links), HTML/LaTeX options,
and practical resource-exhaustion risks. Include raw/WYSIWYG transitions and serialization. Do not redesign Markdown
semantics or impose arbitrary limits without evidence.

## Acceptance criteria

- [x] Inventory input sources, transformations, sanitization boundaries, and DOM/navigation/network sinks.
- [x] Assess script execution, unsafe URLs, sanitizer bypasses, external image disclosure, and practical parser/rendering exhaustion using bounded payloads.
- [x] Check custom tag-link handling and upstream sanitization together, including malformed/encoded schemes and paste/import round trips.
- [x] Record reproducible findings or explicit no-finding results, reviewed commit, tested payload classes, and limitations; file confirmed fixes separately.

## Verification

Use focused renderer/parser tests plus Chrome checks where browser interpretation matters. Test benign content alongside
adversarial cases to preserve existing source and editing behavior. Add failing regressions before fixes; date-bound
editor changes must cover pending A-to-B transitions. Keep payloads local and avoid contacting untrusted endpoints.

## Dependencies and related work

No hard dependencies. Related: [#0026](0026-validate-security-workflows.md); coordinate retention/network findings with
[#0024](0024-review-local-data-privacy.md).

## Resolution

Completed against `7c6096c413399c40585deac76829e669ef72c805` (app `0.34.2`). The
[assessment](../docs/security-content-review.md) records the input/sink inventory, upstream and custom link/schema
boundaries, math controls, tested payload classes, and explicit limits.

No script-execution or unsafe-scheme finding was reproduced in the tested cases. Automatic requests for external
note images were confirmed and tracked separately in [#0031](0031-control-external-note-image-loading.md); closing
this investigation does not resolve that privacy exposure. Bounded parser/math cases completed, while total-size,
rendering-dimension and main-thread budgets remain unbounded and are documented as residual limitations.

Retained coverage: 23 new focused link-boundary unit cases and four Chrome content workflows. The focused unit run
passed 76 cases; the combined content/link/tag/LaTeX Chrome run passed 44 workflows. Routine `npm run verify` passed
820 tests, typechecking, and the production static build. Only tests and documentation changed, so the app version
remains `0.34.2`. All content was synthetic, probe requests were intercepted, no live Google account was used, and
local preview servers stopped. Handoffs for privacy/deployment and consolidated verification are recorded in #0024
and #0026; no production remediation was included.

