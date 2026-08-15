# Milkdown focus and caret investigation

## Current status

Version `0.21.32` fixes both return-focus failures without capturing or replaying a caret:

- Jot continuously remembers which editor was last focused, including before Brave clears `activeElement`.
- The first foreground event for the same date, editor mode, and editor generation synchronously focuses the existing live selection.
- Duplicate Brave `focus`, `pageshow`, and `visibilitychange` events are coalesced into one foreground action.
- No synchronization callback focuses the editor or writes a selection.
- Controlled Markdown that represents the live Milkdown document is acknowledged without running `replaceAll`.

Pointer, keyboard, selection, or input activity cancels a pending foreground focus. Date, mode, editor-generation, modal, and read-only checks prevent a stale foreground event from focusing a different editor session.

## Distinct problems observed

These symptoms should not be treated as one bug.

### Editor becomes read-only

The original failure after date navigation had the following DOM state:

- The editor container reported `aria-readonly="false"`.
- ProseMirror reported `contenteditable="false"` and `aria-readonly="true"`.
- No dialog or conflict UI was visible, and synchronization reported `Synced`.
- Switching to another date and back recreated the editor with `contenteditable="true"`.

Manually changing `contenteditable` did not produce a real fix because ProseMirror's state still considered the editor read-only; edits were buggy and disappeared on refresh. Commit `1d05cdd` addressed the read-only transition problem. This is separate from browser focus and caret placement.

### Editor loses browser focus

After switching to another application and returning, `document.activeElement` can be `BODY` rather than the ProseMirror editor. A click restores focus. Brave on macOS may clear `activeElement` before Jot receives `window.blur`, so inspecting only `activeElement` in the blur handler is not a reliable way to remember what had focus.

The delayed variant was caused by a redundant controlled document replacement. On backgrounding, Jot flushed Milkdown's editable snapshot, which intentionally omits a serializer-only terminal newline. Feeding that value back through the controlled `value` prop could make Milkdown run `replaceAll` even though the value came from the live editor. The replacement blurred the editor and reset ProseMirror's selection. Browser throttling determined whether it happened while Jot was hidden or after the user returned and started typing.

### Caret is moved or repeatedly reset

The attempted fixes introduced more serious failures:

- Text typed immediately after returning could be inserted at the start of the note or at a stale pre-switch position.
- A later synchronization completion could move the caret behind text already typed, producing `BA` when the user typed `A` followed by `B`.
- In the worst case, every character was inserted before the previous character because the caret was reset before each controlled editor update.

These are selection-management failures, not merely focus failures. Focusing an editor and restoring a caret must be considered separate operations.

## Confirmed root cause and final fix

The Brave/Drive trace captured the complete failing sequence:

1. The user edited the note and switched applications before synchronization completed.
2. Brave cleared editor focus while the hidden-page save flushed the live editor snapshot.
3. The controlled value differed only because Milkdown's editable representation omits its serializer-only terminal newline.
4. With a trailing editable space, parsing that snapshot also normalized the space, so a parser-round-trip equality check alone was insufficient.
5. Milkdown ran `replaceAll`, moved its live selection to the start, and left `body` focused.
6. On return, focusing the current selection faithfully focused the now-wrong position at the start.

`applyExternalMarkdown` now skips replacement in either of two cases:

- The incoming Markdown exactly equals the live editable snapshot.
- Parsing and serializing the incoming Markdown exactly equals the live serialized ProseMirror document.

This is deliberately an avoidance fix. It does not translate Markdown offsets, dispatch a ProseMirror selection, or replay a saved position. Genuinely different incoming documents still follow the existing replacement and sync/merge paths.

Foreground focus is similarly narrow. Jot records only the editor identity (`IsoDate`, mode, and reset generation), then calls the existing focus-current-selection operation once on return. The return-triggered Drive refresh remains prompt but cannot focus the editor when its promise resolves.

## Attempted fixes and outcomes

### `2330aa7` — restore focus after background synchronization

This commit captured the date, editor mode, and Markdown selection when the window became hidden or blurred. It restored that selection both when the window returned and when the return-triggered synchronization completed.

The second restoration raced with typing. If the user typed before synchronization finished, the completion callback replayed the older selection and moved the caret backward. It also created multiple focus opportunities because Brave can emit both visibility and focus events for one application switch.

### `ff009dc` — track the last focused editor and preserve selection across refreshes

This commit tried to handle Brave's event ordering by remembering the last focused editor independently of `activeElement`. It also preserved focus and selection while Milkdown applied external Markdown.

The external-update path was unsafe. It serialized the current selection, replaced the document, mapped the old Markdown offsets into the new serialization, dispatched a new selection, and focused the view. Serializer normalization and asynchronous controlled updates could resolve that selection to the start or replay a position older than the latest input.

### `db01e00` — preserve ProseMirror positions instead of Markdown offsets

This changed the external-update preservation from Markdown source offsets to ProseMirror document coordinates. Although simpler, it retained the underlying problem: application code still dispatched a saved selection during controlled or synchronized document replacement. The live Brave failure continued, including repeated movement to the start of the note.

### `fd3438b` — emergency rollback

This commit reverted the three behavioral focus commits as one recovery change. It intentionally restored the original mild click-to-refocus behavior and removed:

- Window-return focus tracking and synchronization-completion refocusing.
- Captured-selection replay.
- Selection dispatch and forced focus around external Markdown replacement.
- Tests and mock instrumentation that required automatic focus restoration.

It retained `92d7ea9`, which only waits for Milkdown's queued animation-frame focus work before browser tests place their own synthetic caret.

## Testing lessons

- Headless Chromium did not reliably reproduce the live Brave/macOS behavior. Several browser tests passed repeatedly while the installed application remained severely broken.
- Synthetic `blur`, `visibilitychange`, and `focus` events do not fully reproduce the ordering or native selection behavior of switching macOS applications.
- A test that waits for synchronization before typing misses the critical interval. Future tests must type before, during, and after the asynchronous boundary.
- Checking only final Markdown can hide intermediate focus loss and lost keystrokes. Tests should also record `activeElement`, DOM selection, ProseMirror selection, and editability at each input.
- The unrelated test `WYSIWYG typing can edit between rendered full links` was a test race: Milkdown's queued mode-switch focus restoration overwrote a synthetic test caret. Waiting one animation frame in the helper stabilized it without changing production behavior.

The final regression coverage includes:

- Equivalent and trailing-space background snapshots do not replace the live WYSIWYG document.
- A background-synced return focuses once despite duplicate foreground events and keeps focus through a delayed refresh completion.
- Typing before, during, and after the asynchronous boundary preserves active element, editability, DOM selection, Markdown selection, character order, local draft, remote note, and reload state.
- A delayed return refresh for date A cannot change or focus date B after navigation.

The temporary production trace was removed after validation. The final build recorded 23 visible returns in a normal Brave tab and 9 in Brave app mode, with zero `replaceAll` calls, intact focus/selection, and no reported focus or cursor failure. The manual timing was exploratory rather than an exact 30-cycle scripted run for every transition.

The rollback was verified with:

- `controlled WYSIWYG updates keep delayed typing in order`, repeated five times.
- The complete browser editing suite: 32 tests.
- `npm run verify`: 538 tests, typechecking, and production build.

The recovery test did not fail against the broken version in headless Chromium, so it is a guard for basic typing order rather than a faithful reproduction of the Brave issue.

## Constraints retained by the fix

1. Never write focus or selection from an asynchronous synchronization completion callback after the editor is available for input.
2. Never replay a selection captured before user input unless a generation or interaction token proves that no newer focus, selection, or input event occurred.
3. Treat focus restoration and caret restoration separately. Calling `focus()` should not imply changing the current live ProseMirror selection.
4. Do not replace the Milkdown document when the incoming Markdown is semantically the same editor snapshot. Avoiding replacement is safer than reconstructing selection afterward.
5. If a genuinely newer remote document must be applied while the editor is focused, define explicit product behavior first. Silently replacing the document and guessing a caret position is unsafe.
6. Keep the explicit `IsoDate` and Markdown snapshot across every asynchronous boundary. A callback for date A must not focus, read, or write date B.
7. Any focus operation must be cancelled by subsequent pointer, focus, selection, keyboard, or input activity and by date or mode changes.
8. Keystroke preservation is more important than automatic refocusing. Requiring one click is preferable to losing, relocating, or reversing note content.

## Investigation environment

The causal trace was recorded with an isolated Brave profile, a dedicated Google account, real Drive synchronization, one fixed synthetic note date, and content hashes/lengths rather than note contents. The issue was reproduced first in a normal Brave tab. The final fix was checked in both a normal tab and a Brave app-mode window.

Authentication was completed by the user. Credentials, tokens, cookies, and unrelated Drive content were not inspected or logged. Diagnostic code and the isolated browser profile were not retained.
