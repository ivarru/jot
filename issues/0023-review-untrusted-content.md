---
id: "0023"
title: "Review untrusted content and rendering boundaries"
status: open
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

- [ ] Inventory input sources, transformations, sanitization boundaries, and DOM/navigation/network sinks.
- [ ] Assess script execution, unsafe URLs, sanitizer bypasses, external image disclosure, and practical parser/rendering exhaustion using bounded payloads.
- [ ] Check custom tag-link handling and upstream sanitization together, including malformed/encoded schemes and paste/import round trips.
- [ ] Record reproducible findings or explicit no-finding results, reviewed commit, tested payload classes, and limitations; file confirmed fixes separately.

## Verification

Use focused renderer/parser tests plus Chrome checks where browser interpretation matters. Test benign content alongside
adversarial cases to preserve existing source and editing behavior. Add failing regressions before fixes; date-bound
editor changes must cover pending A-to-B transitions. Keep payloads local and avoid contacting untrusted endpoints.

## Dependencies and related work

No hard dependencies. Related: [#0026](0026-validate-security-workflows.md); coordinate retention/network findings with
[#0024](0024-review-local-data-privacy.md).

## Resolution

Pending. Record review evidence, findings or no-finding results, and limitations on closure.

