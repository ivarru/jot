# Sync Model

Jot's sync model is documented in code by `src/sync/syncModel.test.ts`. It is a bounded deterministic model, not a separate runtime implementation. The model explores short traces over one shared remote Daily Note and one or two independent clients, each with its own local draft store and visible editor state.

The model exists to clarify sync requirements and intended behavior in executable form. It should make the app's expectations precise enough to catch race conditions, invalid state transitions, stale-baseline saves, and other mistakes that are easy to miss in example-based tests alone.

When a sync bug is reported, the preferred workflow is still red-green-refactor:

1. Refine the model or a focused sync regression test so the bug fails first.
2. Make the smallest production change that turns the failing test green.
3. Refactor only after the failing trace is covered.

## State

The model tracks:

- One remote note with markdown and a revision id.
- One or two clients, `A` and `B`.
- Each client's persisted local draft.
- Each client's visible editor markdown.
- The remote revision that has actually been visible in that editor.
- Whether the visible editor is clean or locally dirty.
- In-flight clean refresh steps.

The distinction between visible editor state and persisted local draft state is intentional. The real app debounces local draft writes and uses asynchronous IndexedDB operations, so there can be a short window where the editor has changed but the local draft store has not caught up.

## Events

The model explores events such as:

- `load`: load a Daily Note into a client.
- `edit`: change the visible editor without immediately persisting the local draft.
- `persist-visible-edit`: flush the visible editor state to the local draft store.
- `save`: persist and sync a note snapshot.
- `start-clean-refresh`: read remote state for a clean editor without mutating local draft state.
- `finish-clean-refresh`: apply a clean refresh to the visible editor.
- `commit-clean-refresh-draft`: commit the visible clean refresh baseline to the local draft store.
- `remote`: mutate the shared remote note externally.

Splitting clean refresh into read, visible apply, and draft commit events is important. It expresses the intended ordering and lets the model catch races where a refresh starts while clean, but the editor changes before the local baseline write completes.

## Invariants

The model currently checks these properties:

- A clean client must refresh when another client creates or updates the remote note.
- Dirty local drafts remain authoritative while loading or refreshing.
- A stale client must not silently overwrite a newer remote revision.
- A stale clean client that receives a new local edit must merge that edit with newer remote changes from the shared baseline, instead of diffing the whole stale document against the remote document.
- A save must not use a remote revision as its baseline unless that revision was visible in the editor.
- A late save must not mark a newer local edit clean.
- An unchanged empty note must not create a remote file.

The strongest practical rule is: a local edit may only sync against a baseline revision that the user could have seen in the editor. If the app cannot prove that, it must keep the local draft dirty or produce a conflict instead of silently advancing the baseline.

## Date-Bound Async Lifecycle Cancellation

The route lifecycle has additional invariants that sit outside the deterministic sync model: async work that is bound to a date, local draft store, or visible editor lifecycle must carry explicit identity across read, write, and apply boundaries. Sign-out, date teardown, upload cancellation, or any other lifecycle reset must advance the relevant generation before clearing IndexedDB-backed drafts, so delayed local loads, remote refreshes, local draft persists, saves, upload saves, or conflict resolutions cannot repopulate draft state or update the visible editor after the reset.

The selected-date sync implementation expresses this as `SelectedDateDriveSync.cancelInFlightWork()` plus `DailyNoteSyncControl.canContinue`. Route-owned work that is not part of the selected-date sync helper, such as background dirty-draft sync and Daily Note Upload, owns its own route generation and passes `canContinue` into sync helpers where storage can be mutated. Image preparation and camera flows carry the explicit `IsoDate` through their async boundaries before applying visible UI results.

Focused coverage lives in `src/sync/selectedDateDriveSync.test.ts` for the selected-date lifecycle helper, `src/sync/dailyNoteUploadSession.test.ts` for upload-session cancellation handoffs, and `src/routes/reconnectConflict.test.tsx` for route sign-out, image, and camera wiring. The sign-out route tests intentionally exercise delayed storage or remote operations across `clearAll()`, which catches regressions where cancellation is moved after the IndexedDB clear.

## Scope

The current model covers Daily Note text sync. It does not model Daily Note Upload, image attachment imports, Google Photos album behavior, OAuth expiry, Drive folder setup, or route/editor lifecycle events such as a previous date's editor blur firing after date navigation. Those flows should have focused tests of their own, and may later be incorporated into the model if their state interactions become sync-critical.
