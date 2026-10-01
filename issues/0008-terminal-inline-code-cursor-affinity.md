---
id: "0008"
title: "Append plain text after terminal inline code"
status: closed
type: bug
priority: medium
created: "2026-10-01"
labels: [editor, wysiwyg, inline-code, cursor]
---

# Append plain text after terminal inline code

## Problem and evidence

In WYSIWYG mode, placing the caret at the visible end of inline code that also ends a line or list item and typing more
text extends the code span. Appending ordinary prose therefore requires toggling code formatting or switching to raw
mode. The browser can only represent this terminal caret inside the final `<code>` element because there is no plain
text DOM node on its right.

## Outcome and scope

Treat the visible caret at the end of terminal inline code as outside the code span, matching the existing link-boundary
behavior. Preserve the existing DOM-side affinity for inline code with neighboring content and for caret positions
inside the code span.

## Acceptance criteria

- [x] Typing at the end of terminal inline code appends plain text on an ordinary line.
- [x] The same behavior applies to a non-final item in a compact list.
- [x] Typing inside inline code and at either side of a non-terminal code boundary retains its existing behavior.

## Verification

Use a real-browser editing regression for the ordinary-line and compact-list workflows, plus the focused editor and
inline-code affinity suites. Run `npm run verify` before closure.

## Dependencies and related work

Related to [#0007](0007-intermittent-list-item-trailing-space-loss.md), which preserves terminal separators during
editor document replacement. There are no hard dependencies.

## Resolution

A Playwright regression reproduced the defect before the production change: typing ` bar` at the visible end of
`Use \`foo\`` produced `Use \`foo bar\``. The inline-code affinity plugin now treats an inside-`<code>` DOM selection at
the end of its text block as the plain-text side. Other boundaries continue to follow the DOM-reported side, and
explicit toolbar affinity remains authoritative.

Focused verification passed for 74 editor and affinity tests and two Chromium boundary scenarios, including both the
ordinary line and compact-list regression. Full `npm run verify` passed with 655 tests, TypeScript checking, and the
production build.
