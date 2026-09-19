---
id: "0007"
title: "Investigate intermittent list-item trailing-space loss"
status: closed
type: investigation
priority: high
created: "2026-09-19"
labels: [editor, wysiwyg, autosave, diagnostics, lifecycle]
---

# Investigate intermittent list-item trailing-space loss

## Problem and evidence

The owner regularly observes an intermittent WYSIWYG editing defect in Brave on macOS: after extending a compact
bulleted-list item with normal text, typing a word and a space, and pausing briefly, the visible trailing space can
disappear. Continuing to type would then join the next word to the previous word. The affected item was not the final
item in the list. No deterministic action sequence is known.

Treat this as a suspected ordering or stale-snapshot problem until the code investigation establishes otherwise. A
pause allows debounced editor notifications, autosave, normalization, and save completions to run; the symptom could
depend on their relative order rather than on the keystrokes alone. A race condition is the leading investigation
hypothesis, not a demonstrated root cause. A deterministic parse/serialize transformation triggered by a delayed update
could produce the same symptom.

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

These negative results cover those particular documents and schedules. They do not exclude a race, establish that all
relevant callbacks ran in the problematic order, or prove that normalization performed an actual document change.
Further reproduction attempts should follow a code-derived hypothesis rather than repeatedly varying pause lengths.

## Outcome and scope

Trace ownership and ordering of editor snapshots, identify a concrete path that could remove the separator, and turn
that path into a faithful failing regression. Then fix the proven cause without weakening date-bound sync safety or
empty-placeholder normalization. Code inspection and temporary test instrumentation should precede further broad
browser experiments; production fixes still require a failing regression first.

Speculative changes based only on the diagnostic length difference are out of scope. Broad replacement of Milkdown,
disabling autosave, or recording note contents in diagnostics is also out of scope.

## Proposed investigation

1. **Map the path from typing to write-back.** Start with `MilkdownEditor.tsx`: DOM-to-ProseMirror updates, the Milkdown
   listener, `applyMilkdownUpdatedMarkdown`, live snapshot getters, and `applyExternalMarkdown`. Follow the route's
   `flushCurrentVisibleEditorSnapshot`, `scheduleLivePlaceholderNormalization`, and autosave effect into
   `createDailyNoteReplication` and the selected-session result application. Inspect the installed AutoMD and listener
   implementations where their scheduling or parsing affects this path. Record which representation each operation
   reads, when it captures it, and what later permits it to replace visible content.
2. **Identify vulnerable orderings and their guards.** Trace a typed separator arriving while an older notification,
   normalization callback, or save result is pending. Check date, editor epoch, snapshot equality, and external-update
   acknowledgement at each boundary. Distinguish an acknowledgement of the live document from a genuinely different
   document update. State the exact sequence required for each hypothesis and the guard that should prevent it.
3. **Inspect transformations as well as timing.** Determine whether reparsing a document can remove an interior
   list-item trailing space, and whether the document-difference transaction can apply that change unintentionally.
   One candidate is cleanup of an eligible placeholder elsewhere in the document causing a live write-back; another
   is a genuinely different incoming document. Neither is established by the incident. Inspect inline marks, links,
   list normalization, and AutoMD only where the code shows that they can participate in that replacement.
4. **Build a deterministic schedule from the strongest hypothesis.** Use synthetic note content and explicit gates at
   the relevant notification, snapshot, commit, or response boundary. Do not equate delaying a save response with
   delaying its remote acceptance. Preserve native typing/DOM handling where it matters, and verify that any intended
   normalization or external update actually executes. Prefer a focused editor integration test for a transformation
   or callback race that it can faithfully express; confirm the visible symptom in Playwright.
5. **Locate the first divergence.** For the controlled reproduction, compare DOM text and selection, ProseMirror text
   and selection, serialized Markdown, route state, the save snapshot, and the applied external transaction. Assert
   that typing the next word retains its separator. Record the first representation that loses the space and the
   operation responsible, rather than inferring loss from total Markdown length.
6. **Instrument narrowly if evidence is still missing.** Only after identifying an unobservable boundary, add bounded
   structural context such as operation origin, captured/current epoch, trailing-space presence, or whether a document
   replacement occurred. Synthetic test traces may inspect their fixture text; diagnostics from real notes must remain
   redacted. A screen recording or details about marks can refine the hypothesis but should not block code analysis.

## Acceptance criteria

- [x] The investigation documents the relevant snapshot owners, asynchronous boundaries, candidate ordering, and
  guard or transformation responsible; it establishes whether the failure is a race or another kind of defect.
- [x] A named failing regression reproduces the space loss through the user-visible WYSIWYG workflow before production
  code is changed.
- [x] The reproduction covers a non-final item in a compact bulleted list and the async boundary that triggers the loss.
- [x] The root cause is identified with evidence distinguishing DOM text, ProseMirror state, serialized Markdown,
  application state, the persistence snapshot, and any later external write-back.
- [x] The fix preserves the typed separator and caret while retaining correct autosave, sync, list compactness, and
  placeholder normalization behavior.
- [x] Diagnostic coverage is extended only with bounded, redacted structural or operation context needed to distinguish
  this failure if the existing report cannot isolate it.

## Verification

Start with code inspection and a concrete scheduling or transformation hypothesis. Add the failing regression at the
lowest layer that faithfully exercises it, plus a focused Playwright regression under `tests/browser/editing` for native
typing, the separator, and caret behavior. If the cause belongs in the sync model, add a named trace there; if it depends
on ProseMirror or DOM state outside that model, document why focused editor coverage is appropriate. Include a stale
date-A-to-date-B case for any changed editor, autosave, or sync callback. Run the focused browser regression,
`npm run verify`, and `npm run verify:full` before closure.

## Dependencies and related work

Related to [#0004](0004-non-conflict-diagnostic-capture.md), which supplied the redacted incident timeline. There are no
hard dependencies. Useful missing evidence includes a screen recording with the caret visible, whether the affected
item contains marks or links despite the appended text being normal, and a diagnostic event that can distinguish the
live DOM/ProseMirror snapshot from serialized Markdown without retaining note content.

## Resolution

Reproduced on 2026-09-19 using native Chromium typing with controlled browser time:

1. Open a compact three-item list and insert an empty item after the first item.
2. Move to the end of the original middle item, type ` word `, and wait for the three-second cleanup boundary.
3. Confirm the empty item was removed, then type `next`. Before the fix, the middle item becomes `Middle item wordnext`.

A second regression reproduces loss of the separator and caret displacement when a remote append is merged during
autosave. Both tests failed before production changes. Unlike earlier timing-only attempts, these sequences force a
genuine document write-back while a live trailing separator exists.

The proven mechanism is a delayed representation change rather than a demonstrated stale remote overwrite. The live
editor and persistence snapshot contain the separator. Cleanup writes normalized Markdown back through
`applyExternalMarkdown`; CommonMark parsing drops whitespace at paragraph ends, so the document difference also changes
the otherwise unrelated middle item. Native typing represents that terminal separator as NBSP. Merely restoring an
ordinary ASCII space in the parsed document still lets the next native input remove it. Separately, the source-to-caret
mapping omitted the same trailing whitespace, restoring the caret before the separator during cleanup.

The fix restores whitespace omitted at paragraph ends from the source-position gap in the Markdown AST, using NBSP for
editable spaces. Existing Milkdown serialization converts NBSP back to ordinary source spaces. Cursor mapping uses the
same transformation and source positions. Fenced/indented code, raw HTML, and actual hard breaks retain their existing
handling. No additional real-note diagnostics or speculative timer changes were needed.

Coverage includes the two browser reproductions, navigation to date B while date A's cleanup/autosave are pending,
persisted/reloaded text, parser boundary cases, and a named caret-mapping regression that also failed before its fix.
This belongs outside the atomic sync model because the failure depends on Markdown parsing and native editable DOM
whitespace. The original private incident cannot be matched conclusively from its redacted timeline alone.

Verification passed: `npm run verify:full` ran 655 unit/integration tests, TypeScript checking, the production build,
and all 83 browser tests, including the three new regressions. The preview server stopped after verification. Fixed in
patch version `0.26.1`; no claim is made that the unavailable original incident trace proves this was its only cause.
