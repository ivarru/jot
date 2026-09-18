# Strengthening Jot for a second brain

Assessment date: 2026-09-18. Reviewed revision: `80b8859`, app version `0.25.15`.

This is an advisory assessment, not a new product specification or accepted architecture decision. Recommendations
should become small implementation tasks; decisions that change product invariants should become ADRs and updates to
[CONTEXT.md](../CONTEXT.md). Existing [testing rules](testing.md) and [replication safety requirements](sync-safety.md)
remain authoritative.

The first six scoped follow-ups now live in [local issues](../issues/README.md). Those files own implementation scope,
status, and completion evidence; this assessment remains the dated rationale and broader direction.

## Recommendation

Invest first in the boundaries between durable storage, editor state, and asynchronous lifecycle work. Add property-based
testing, but concentrate it on meaningful invariants and generated operation sequences. Then build search and retrieval
on top of the existing Plain Markdown Files before expanding the underlying document model.

Jot already has a substantial reliability foundation: explicit date-bound snapshots, conditional remote writes,
conflict preservation, a bounded sync model, adversarial Drive tests, browser regressions, and deployment verification.
The recurring issues suggest incomplete coverage of interactions more than an absence of testing discipline. A rewrite
or CRDT migration would introduce new uncertainty without directly addressing several of the observed editor failures.

## Evidence and limits

I reviewed the latest 180 commit subjects, selected changes, current architecture and testing documents, the sync model,
storage implementation, and representative test coverage. `npm run verify` passed locally: **71 test files, 627 tests,
TypeScript checking, and production build**. Vitest reported 9.90 seconds. I did not run the Playwright suite, artifact
checks, or real Google provider checks for this assessment. Passing this baseline does not establish that the reported
intermittent issues are resolved. Their precise symptoms and triggering conditions remain unknown.

The history provides useful clusters, not a measured defect rate:

| Recurring difficulty | Evidence | Implication |
| --- | --- | --- |
| Focus and caret preservation across synchronization | `2330aa7`, `ff009dc`, `db01e00`, rollback `fd3438b`, `8f9404b`, later `94aa90a` and `86c40b1`; [postmortem](editor-focus-investigation.md) | Correct text synchronization can still produce an incorrect editing experience. Native selection and editor transaction behavior need their own contracts. |
| Stale asynchronous work | `227f245`, `2280c0c`, `4049bc7`, `aaaac1e`; sign-out cancellation work including `b17e4ff` and `c72b6c9` | Test operation interleavings across date, editor, and account lifetimes, beyond atomic save operations. |
| Markdown representation and editing context | `419d3f9`, `f772acd`, `6613e6d`, `49088cc`, `b69bde6`, `4966b9f`, `80b8859` | Generated syntax combinations and explicit normalization laws should supplement individual fixtures. |
| Provider concurrency | `6a75f79`, `7b12f52`, `1e788b8` | Retain the stateful transport tests; expand failure scheduling instead of replacing them with simpler mocks. |
| Test synchronization | `92d7ea9`, `5b83a07`, `178c25e`, `ff6497f` | Test readiness and observable completion are part of reliability work. A timing adjustment alone is not proof of broader coverage. |

## Priorities

Effort is relative: small means a focused change; medium spans a few seams; large needs product design and staged work.

| Order | Improvement | Effort | Completion evidence |
| --- | --- | --- | --- |
| 1 | Validate Local Draft transaction acknowledgement | Small–medium | Tests distinguish request success from commit and exercise aborts. |
| 2 | Add generated lifecycle and Markdown properties | Medium | Reproducible minimized failures, meaningful scenario coverage, and named regression promotion. |
| 3 | Make intermittent editor failures diagnosable | Small–medium | An opt-in report can capture a non-conflict failure without including note text. |
| 4 | Exercise restart, multiple tabs, and PWA upgrade boundaries | Medium | Browser workflows assert persisted content and honest status after each boundary. |
| 5 | Add recovery and complete export | Medium–large | Restore into an empty environment succeeds, including attachment availability reporting. |
| 6 | Clarify editor/session ownership incrementally | Medium | Fewer cross-lifetime callbacks; behavior remains protected by existing and generated tests. |
| 7 | Add local search, backlinks, and tag browsing | Medium–large | A rebuildable index retrieves source content without changing the persistence contract. |

### 1. Validate the storage acknowledgement boundary

In [indexedDb.ts](../src/storage/indexedDb.ts), `withStore` resolves the `IDBRequest` branch from `request.onsuccess`.
The Promise branch instead waits for `transaction.oncomplete`. Ordinary Local Draft `save` uses the request branch.
The helper handles transaction errors but has no explicit transaction abort handler.

This is a concrete code-review concern: successful completion of one request is not successful transaction commit.
The [IndexedDB transaction lifecycle](https://w3c.github.io/IndexedDB/#transaction-lifecycle) distinguishes those events
and permits transaction abort. A resolved promise cannot subsequently be rejected if the transaction fails. That is
relevant to Jot's promise that `saved-locally` means the Local Draft is durable.

Before changing production code, reproduce request-success-then-abort with a focused failing regression. Assert that
the public save promise rejects and cannot advance the UI to a successful local acknowledgement. Also test synchronous
operation failure, transaction failure, compare-and-swap contention, and reopening after successful commit. Use
fake-indexeddb for focused coverage and a real-browser persistence check where browser semantics matter. Commit
completion still does not promise survival of every OS crash or storage eviction.

This review did not reproduce user-visible loss. Treat the above as the first investigation, not an explanation of the
unspecified minor issues. Separately audit connection closure, `versionchange`, blocked upgrades, and storage exhaustion.
The current local-draft test file primarily checks note existence; it does not establish the full adapter contract.

### 2. Extend the model in two directions

The existing [sync model](../src/sync/dailyNoteReplication/syncModel.test.ts) enumerates traces of depth one through four
over 15 events: **54,240 traces**. It also contains longer named regressions. This is already bounded exhaustive testing
for that event alphabet, not merely a set of ordinary happy-path examples.

Its boundaries matter: one date, two independent clients, small fixed text values, and mostly atomic operations. Its
generic trace runner checks selected invariants; other promises are checked by named tests. It does not systematically
schedule every internal storage or network await. Several recent bugs intentionally sit outside its scope.

**Keep the short enumeration. Add a separate generated lifecycle harness around production seams.** Start with two
dates and one client; then add a second client. Generate edit, enqueue-save, begin/finish-refresh, persist, navigate,
blur, cancel, reload, and reconnect commands. Add account changes and more clients only after the small model is useful.
Represent remote changes and transaction commits as separate controlled boundaries where needed.

Use a small specification model of identities, acknowledged snapshots, pending work, and allowed transitions. Do not
copy the replication algorithm into the oracle or calculate expected merges with the same production function under
test. Run invariants after every observable transition, not just at the end:

- Work bound to date A never changes date B's editor or draft.
- A stale completion cannot clean or replace a newer local edit.
- A cancelled account/session generation cannot repopulate cleared state.
- Remote failure leaves a committed dirty draft recoverable after restart.
- A remote acknowledgement corresponds to the accepted snapshot and revision.
- Every generated edit remains represented in current content or an explicitly retained conflict/recovery version,
  unless a later user operation deliberately deletes or replaces it.
- With failures stopped, fair completion of pending work, and no further edits, clients eventually synchronize or
  expose a conflict requiring a decision. A conflict is a valid terminal outcome; silent indefinite pending work is not.

For the preservation property, initially generate tagged, non-overlapping edits with a simple independent oracle.
Arbitrary prose merging requires more careful semantics than checking that every old substring remains forever.

[fast-check's command model](https://fast-check.dev/docs/advanced/model-based-testing/) supports generated sequences
and shrinking failing scenarios. Its [scheduler](https://fast-check.dev/docs/advanced/race-conditions/) can explore
controlled asynchronous orderings. It is a suitable candidate for this project. Scheduling must wrap the relevant
effect boundaries: delaying a resolved promise does not undo a storage mutation that already happened. Start with
explicit deferred read/commit/response gates if they make the model easier to trust.

Do not reuse the model's in-memory `saveIfUnchanged` as proof of concurrent IndexedDB correctness: its read and write are
separate awaited operations. Keep adapter atomicity tests separate and make any scheduled fake honor the intended
transaction boundary.

Proposed initial budgets are 200 seeded sequences of up to 30 commands in routine verification, with a longer scheduled
run exploring thousands of sequences. These are starting budgets to measure, not claims of completeness. Save seed,
shrink path, minimized trace, and app revision on failure; promote important failures into permanent named regressions.
Track executed categories such as dirty navigation, pending refresh plus edit, restart with dirty data, and failed save.
Otherwise many generated commands may simply fail their preconditions and provide little coverage.

### 3. Add properties for Markdown and editor transformations

Generate structured Markdown with bounded nesting, plus malformed fragments that can occur while typing. Include
headings, tight and loose lists, empty items, nested quotes, fenced and indented code, raw HTML, links, tables, Unicode,
trailing spaces, and missing final newlines. Weight combinations seen in the history more heavily.

| Target | Useful property | Important qualification |
| --- | --- | --- |
| Persistence normalization | Applying the canonicalizer twice equals applying it once. Literal code/HTML regions remain unchanged where the policy promises that. | Test normalization enabled and disabled independently; live caret protection has a different contract from persistence. |
| Three-way merge | `merge(b, x, b) = x`, `merge(b, b, x) = x`, and `merge(b, x, x) = x`, without conflicts. | Do not assert commutativity: current append-only merge deliberately orders local then remote tails. |
| Conflicting edits | Independently generated overlapping alternatives remain accessible through conflict choices. | Include deletion, repeated lines, empty files, and text resembling conflict markers. |
| Raw formatting | Text outside the declared affected range remains unchanged; selections stay in bounds. | Some commands intentionally affect a containing block. Specify that range first. |
| Mode switches | No-edit switching preserves content according to the documented source/normalization policy. | Arbitrary Markdown parse/serialize round trips are not necessarily byte-identical. Distinguish source preservation from semantic equivalence. |
| External editor updates | Acknowledging the live snapshot does not replace the document, move the selection, or add an undo step. | Real remote edits may legitimately map the caret; use fixtures whose expected mapping is independently known. |
| Tags and links | Constructed supported destinations parse back to the same identity, and code literals are not interpreted as references. | Invalid input needs an explicit reject-or-preserve policy. |

Use ProseMirror-level tests for document transformations and a smaller browser set for native selection, typing, and
undo. A particularly valuable browser sequence is: type at a known location, autosave, apply a remote append elsewhere,
type again, undo, switch mode, reload, then assert text, caret, and persisted results.

Add a small mutation exercise for the critical properties: temporarily disable a stale-generation guard or broaden an
external replacement and confirm a test fails. This checks oracle strength. A global line-coverage target would provide
less confidence about these particular risks.

### 4. Cover browser lifetimes and improve failure reports

The Playwright configuration currently uses one Chrome worker. Preserve a fast primary suite; add focused WebKit and
Firefox coverage for editing, persistence, and reconnect if those browsers are supported. Include physical phone/PWA
checks for keyboard and background behavior that desktop automation cannot establish.

Prioritize these complete workflows:

- Two pages in one browser context sharing IndexedDB, in addition to separate-device simulations. Verify simultaneous
  local edits, refresh, and sign-out behavior against an explicitly chosen cross-tab policy.
- Save offline, close/reopen, recover the draft, then reconnect with a conflicting remote edit.
- Interrupt work before local commit, after commit, and after remote acceptance but before its response. A pre-commit
  edit cannot be promised durable; the UI must not claim otherwise.
- Install a production-shaped service worker, load offline, then update the app while a dirty draft exists. Include the
  `/jot/` base path and storage schema upgrade, rather than testing only the fake preview shell.
- Composition input, emoji, combining characters, paste, undo, and mode switching around sync and normalization.
- Open and dismiss dialogs using the keyboard; ensure background sync cannot steal dialog focus. Check accessible
  names and status announcements without announcing every keystroke.

There are fixed sleeps in the paste, inline-code, list, raw-keyboard, normalization, and reconnect specs. Inventory them
and replace readiness sleeps with observable editor/draft/remote conditions. Retain deliberate elapsed-time tests where
time itself is the behavior; use controlled time where feasible and a few real-time integration checks.

Current opt-in [sync diagnostics](sync-safety.md#conflict-diagnostics) freeze on a conflict. Extend them with a manual
“capture report” action for caret, read-only, or stale-content incidents that never create a conflict. Include version,
browser, editor mode, normalization setting, operation identity, lifecycle generation, and event ordering. Continue to
exclude text, tokens, and raw provider identifiers; copying or downloading remains an explicit user action. Hashes and
dates can still reveal information, so minimize them and keep retention short.

Maintain a small incident record: symptom, approximate time, device, last actions, settings, and eventual regression
test. `docs/notes.md` currently records no known issues; the owner's intermittent symptoms deserve entries marked
unreproduced rather than assumptions that all behavior is healthy.

### 5. Make recovery independent of sync correctness

Conditional writes protect against concurrency mistakes. They cannot protect against every validly synchronized bad
edit or implementation defect. Before storing substantially more valuable material, make recovery a first-class workflow.

Start with export of committed Local Drafts, including unsynced content, then a complete export/restore path for Plain
Markdown Files and Attachment Metadata. An attachment reference is not the image bytes: explicitly report whether the
package includes each image or still depends on Google Photos. Define which snapshot wins when local and remote differ;
never silently export only the remote version while newer local work exists.

Revisit the deferred Recovery Snapshot proposal in [sync-safety.md](sync-safety.md). Specify retention, storage location,
privacy, restore semantics, and failure handling before making snapshots a prerequisite for successful sync. Local
history helps with accidental edits but disappears with browser storage; it is not an independent backup. Restore must
create a new deliberate edit and preserve the current version, not overwrite it invisibly.

Completion means restoring into an empty environment and comparing content and attachment availability, not merely
producing a download. Attachment cleanup should come later and require a complete reference inventory, a reviewable
candidate list, and a grace period.

### 6. Reduce lifecycle complexity through ownership

At the reviewed revision, `src/routes/index.tsx` has 4,988 lines and `MilkdownEditor.tsx` has 2,355. Size alone is not a
defect; the concern is how many owners can initiate saves, replace content, cancel work, or restore focus.

Continue the vertical extractions already used by Daily Note Upload and the date picker. The next useful boundary is
the selected editor session: date, generation, editor epoch, visible snapshot, pending persistence, and external-update
application. Give each side effect one owner. Keep the route as composition and retain the existing public replication
module rather than introducing another competing save coordinator.

Write a compact ownership table before extraction: who captures the snapshot, who can persist it, who can acknowledge
it, who cancels it, and who may affect selection. Consider a typed operation context carrying date, generation, and
snapshot together where it prevents invalid combinations. Avoid a universal event bus or a generic document framework
until concrete feature requirements justify one.

Keep Milkdown-specific comparison and transaction rules behind an adapter. Promote assumptions such as generated
heading IDs to executable compatibility fixtures. Dependency upgrades should run those fixtures plus the browser
caret/history cases. Clarify the deliberate boundary between Source Preservation and enabled placeholder normalization
so new features do not accidentally broaden what may be rewritten.

## A staged path toward a second brain

### First: retrieve what is already written

Add full-text search across Daily Notes, Reference Tag browsing, backlinks, and recent-note navigation. Existing tags and
date/section links offer a useful foundation without immediately introducing another kind of document.

Keep search and link indexes derived and rebuildable from Plain Markdown Files. Index committed local content, including
dirty drafts, ahead of stale remote content. Track indexed revision and index schema separately from the source. Account
changes must invalidate the appropriate derived data. Make completeness visible: “searched downloaded notes” is different
from “searched all Drive notes.” Plan incremental remote discovery, pagination, and deleted-file reconciliation.

Test incremental indexing against a fresh full rebuild after generated edits and deletions. Opening a result should
reach the matching date and section without changing that note. A broken link should explain what is missing. Start
with lexical search; evaluate semantic search later against actual retrieval failures and explicit privacy choices.

### Next: capture and revisit

Add Daily Note templates, quick capture, and saved searches or review lists. Each capture must carry an explicit target
date across async work. Decide whether tasks are derived Markdown checkboxes or independent entities before adding
cross-note task state; do not maintain two silently divergent sources of truth.

### Then: general documents, if Daily Notes become limiting

Before implementing project or topic documents, decide stable identity, file naming, renaming, linking, deletion,
conflicts, and export. Daily Note identity is currently a date; that does not naturally cover arbitrary titled documents.
Introduce a new concept alongside Daily Notes through an ADR, then generalize only the shared persistence contracts
that real use cases demonstrate. Avoid retroactively changing every Daily Note identifier just to enable expansion.

Measure representative larger collections before choosing infrastructure: for example 10,000 Daily Notes, long
individual documents, and many links. Track typing responsiveness, startup, search latency, index rebuild cost, and
Drive request volume. Move indexing off the interaction path if measurements justify it. A graph visualization or AI
assistant can follow once retrieval, provenance, recovery, and index completeness are dependable.

## Suggested first implementation sequence

1. Reproduce and resolve the IndexedDB acknowledgement concern; verify failure status and restart behavior.
2. Add a small property suite for merge identities and normalization, with seed replay and minimized counterexamples.
3. Build the two-date lifecycle harness around existing production seams; port one historical stale-autosave trace and
   prove that removing its guard makes the harness fail.
4. Add a non-conflict diagnostic capture and a browser regression for shared-storage tabs or offline restart.
5. Design and exercise export/restore, then deliver local search with an explicitly rebuildable index.

Use a bounded foundation milestone: storage acknowledgement verified, critical invariants mapped to tests, generated
failures reproducible, restart/reconnect covered, and recovery demonstrated. Continue recording real incidents and their
regressions rather than waiting for an impossible claim that all interleavings have been tested. Formal protocol
modeling remains an option if executable tests leave a specific unanswered safety question; it need not block useful
retrieval features.
