---
id: "0007"
title: "Investigate intermittent list-item trailing-space loss"
status: open
type: investigation
priority: high
created: "2026-09-19"
labels: [editor, wysiwyg, autosave, diagnostics]
---

# Investigate intermittent list-item trailing-space loss

## Problem and evidence

The owner regularly observes an intermittent WYSIWYG editing defect in Brave on macOS: after extending a compact
bulleted-list item with normal text, typing a word and a space, and pausing briefly, the visible trailing space can
disappear. Continuing to type would then join the next word to the previous word. The affected item was not the final
item in the list. No deterministic action sequence is known.

The incident was observed in Jot `0.26.0` with empty-placeholder normalization enabled. A manually captured sync
diagnostic report covered the incident in Brave on macOS; Brave exposed a Chromium user agent containing
`Chrome/153.0.0.0`, so the report itself did not identify the browser brand. Its relevant timeline showed:

- An editor change followed roughly two seconds later by an autosave request whose Markdown fingerprint length was one
  character shorter.
- The first relevant remote save remained pending for about 2.9 seconds before reaching `synced`.
- A later autosave showed the same one-character editor-event versus save-snapshot length difference.
- No conflict, navigation, connectivity change, or poll event appeared around the symptom.

The one-character difference is not by itself proof that the typed space was removed. Milkdown editor events include a
terminal Markdown newline that the live save snapshot intentionally omits, producing the same length difference in a
healthy trace. The report records fingerprints rather than content or cursor structure, so it cannot distinguish that
expected newline normalization from loss of an interior list-item space.

## Reproduction attempts

The following real-Chromium Playwright scenarios were tried on 2026-09-19. None reproduced the defect:

1. An ordinary paragraph ending in a newly typed word and space, followed by the normal two-second autosave pause.
2. The same paragraph through the three-second delayed live-placeholder-normalization boundary.
3. The same paragraph with the fake remote provider temporarily delaying its save response by three seconds.
4. A compact three-item bulleted list, with the caret at the end of the middle item, followed by a word and trailing
   space, normal autosave, and delayed live normalization.
5. The same middle-list-item scenario with a three-second delayed remote response.
6. The same delayed middle-list-item scenario using separate real keyboard events for the word and final space rather
   than inserting the text in one browser operation.

In every attempt, the underlying Markdown retained the trailing space and typing the next word kept it separated.
Chromium represented the terminal visible space as a non-breaking space in the editable DOM in the paragraph scenario;
that representation was expected and did not remove the Markdown space. All temporary test and provider-delay changes
were reverted after the experiments.

## Outcome and scope

Obtain a faithful reproduction of the intermittent compact-list symptom, identify which editor, serialization,
normalization, autosave, or external-update boundary removes the visible separator, and fix the proven cause without
weakening date-bound sync safety or empty-placeholder normalization.

Speculative changes based only on the diagnostic length difference are out of scope. Broad replacement of Milkdown,
disabling autosave, or recording note contents in diagnostics is also out of scope.

## Acceptance criteria

- [ ] A named failing regression reproduces the space loss through the user-visible WYSIWYG workflow before production
  code is changed.
- [ ] The reproduction covers a non-final item in a compact bulleted list and the async boundary that triggers the loss.
- [ ] The root cause is identified with evidence distinguishing DOM text, ProseMirror state, serialized Markdown,
  application state, the persistence snapshot, and any later external write-back.
- [ ] The fix preserves the typed separator and caret while retaining correct autosave, sync, list compactness, and
  placeholder normalization behavior.
- [ ] Diagnostic coverage is extended only with bounded, redacted structural or operation context needed to distinguish
  this failure if the existing report cannot isolate it.

## Verification

Start with a focused Playwright regression under `tests/browser/editing`, since the symptom concerns native browser
editing, DOM whitespace, caret behavior, and an asynchronous save boundary. Once reproduced, add the lowest suitable
unit or integration test for the identified cause. Run the focused browser regression, `npm run verify`, and
`npm run verify:full` before closure.

## Dependencies and related work

Related to [#0004](0004-non-conflict-diagnostic-capture.md), which supplied the redacted incident timeline. There are no
hard dependencies. Useful missing evidence includes a screen recording with the caret visible, whether the affected
item contains marks or links despite the appended text being normal, and a diagnostic event that can distinguish the
live DOM/ProseMirror snapshot from serialized Markdown without retaining note content.

## Resolution

Pending.
