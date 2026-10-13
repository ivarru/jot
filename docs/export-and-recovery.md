# Export and recovery contract

Accepted design, 2026-10-13, for [issue #0006](../issues/0006-export-and-recovery-design.md) and
[ADR 0010](adr/0010-explicit-export-and-safe-restore.md). This specifies future behavior; no export, package restore,
or Recovery Snapshots are implemented by this documentation change. Current sync behavior remains governed by
[sync-safety.md](sync-safety.md). Terms follow [CONTEXT.md](../CONTEXT.md).

## Delivery and guarantees

| Stage | User outcome | Limits and owner |
| --- | --- | --- |
| 1 | Download committed Local Drafts without connectivity or successful sync. | This browser's captured drafts only; images and remote inventory unavailable. [#0012](../issues/0012-local-draft-export.md). |
| 2 | Preview and restore package markdown, preserving content before replacement. | Text restoration; missing images remain explicit. [#0013](../issues/0013-safe-package-restore.md). |
| 3 | Export discovered remote files together with local drafts and divergent versions. | Individually captured versions, not a global point-in-time snapshot. [#0014](../issues/0014-remote-collection-export.md). |
| 4 | Package referenced image bytes and restore them to a destination account. | Requires verified provider capabilities; no promise to recover unavailable bytes. [#0015](../issues/0015-image-inclusive-recovery.md). |
| Separate evaluation | Decide whether automatic recovery history is justified. | Not a prerequisite for stages 1–4. [#0016](../issues/0016-recovery-history-policy.md). |

The first deliverable is a local package download, not a complete collection backup. Independent recovery means the
package is kept outside browser storage and can supply the included content without reading the original account.
It does not mean automated scheduling, redundant storage, encryption, or survival of losing the exported file.
A download event establishes that the browser offered the package, not that the user retained or tested it.

## Capture and selection

Export is read-only: it does not flush edits, merge conflicts, change a Local Draft baseline, start sync, or mark any
content saved. At invocation, capture the visible editor's explicit `IsoDate`, markdown and editor generation, plus
account/session generation. Capture all Local Draft records in one readonly IndexedDB transaction and use the result
only after transaction completion. Include clean, dirty, and empty records, including dirty empty local-only dates;
`listExistingDailyNoteDates` and `listDirty` alone cannot supply this inventory. Do not hold editing locks during download.

The package distinguishes the editor capture time from the local transaction capture time. A visible snapshot is an
additional version if it differs from the captured committed draft; it is never silently substituted for durable content.
An absent committed record does not turn visible content into a committed Local Draft.

| Available versions for a date | Primary `notes/YYYY-MM-DD.md` | Preserved alternatives and report |
| --- | --- | --- |
| Local mode, committed draft | Captured committed markdown, including an empty string | Differing visible snapshot is labeled `visible-uncommitted`. |
| Local mode, only visible content | No primary committed note | Captured visible snapshot is included as an alternative; committed record absent. |
| Collection mode, dirty draft and remote | Captured committed dirty markdown | Every differing remote version and differing visible capture. |
| Collection mode, clean draft and one remote file | Captured remote markdown | Differing committed draft and visible capture. |
| Collection mode, several remote files for one date | Dirty draft if present, otherwise captured clean draft if present | All remote files remain separate; without a local draft there is no primary until a restore choice. |
| Collection mode, local record only | Captured committed markdown | Remote absence is reported only after successful inventory/read checks. |
| Collection mode, remote read failed | Captured committed markdown if available | Remote state is unknown; package is partial, not evidence of remote absence. |

Primary means the suggested restore candidate, not the uniquely correct version. Preserve captured Sync Conflict markers
verbatim and flag them for review; export never resolves them. Pending or failed local persistence leaves the last
committed record primary and the captured visible version uncommitted. If draft capture itself fails, abort local export
with a visible error; do not produce a success package from a possibly empty inventory.

Edits, navigation, blur, autosave and refresh after capture do not alter captured strings or reassociate them with a new
Selected Date. New content requires another export. Sign-out/account change cancels export and discards the in-memory
package; stale results cannot resume it or expose a previous account's content. A user cancellation offers no download.

## Remote inventory and consistency

Collection mode captures local drafts first, then enumerates all pages of active, correctly dated `.md` files in the
Daily Notes Folder, including zero-byte files and duplicates. Union that inventory with captured local dates. Report
invalid filenames and unsupported entries as excluded rather than silently discarding them. Do not scan unrelated Drive
folders, trashed files, historical Drive revisions, or other browsers' unsynced drafts.

Use an export-specific read-only provider seam. Current `loadDailyNote` can consolidate and retire duplicates, while
`listDailyNoteDates` filters zero-byte files and collapses duplicate dates. Neither is a lossless export inventory.
Export must not create folders, mutate notes, or retire duplicates. A missing Jot Folder is an explicitly empty remote
inventory only after a successful lookup, not after an authentication or network failure.

Bind each successful file read to its observed revision. Detect changed revisions with provider-supported checks;
retry a changed read at most twice after the initial attempt, then mark that entry unstable. Re-enumerate once after
reads and report observed additions, deletions and revision changes; include newly discovered files only if captured
successfully, otherwise mark them missing. Retain any earlier captured version as an alternative. These checks detect
observed drift but cannot exclude changes after the final check.

This is a set of individually captured versions during a reported time interval. It never claims an atomic collection
snapshot. Inventory completeness is `enumerated`, `partial`, or `not-requested`; note capture is independently
`complete-for-inventory` or `partial`. Failed pagination makes the inventory partial even if every discovered file was
read. Offline local export says remote inventory `not-requested`. A collection export with failures may be downloaded
only through an explicit **Download partial export** action with the failures shown.

## Package version 1

Use a ZIP with UTF-8 markdown and JSON, no front matter or markdown reserialization. The root contains:

| Path | Purpose |
| --- | --- |
| `manifest.json` | Machine-readable format/version, capture scope, completeness and entry inventory. |
| `README.txt` | Human-readable scope, missing content, external dependencies and restore instructions. |
| `notes/YYYY-MM-DD.md` | Primary captured versions, exactly the exported strings. |
| `variants/YYYY-MM-DD/<entry-id>.md` | Divergent, duplicate and visible-uncommitted versions. |
| `attachments/<ULID>.json` | Captured Attachment Metadata when available. |
| `images/<ULID>/<entry-id>.<extension>` | Verified downloaded image bytes in stage 4. |

Entry IDs are package-local generated identifiers, never filenames interpolated from provider input. Manifest version 1
has `format: "jot-export"`, `version: 1`, a random `packageId`, app version, UTC capture start/end, mode `local` or
`collection`, inventory and capture statuses, and arrays `notes`, `attachments`, `exclusions`, `failures`, and
`externalDependencies`. Each note entry has an entry ID, explicit date, role `primary` or `alternative`, source
`local-committed`, `visible-uncommitted`, or `remote`, dirty/conflict flags where applicable, capture time, path, UTF-8
byte length and SHA-256 digest. Provider revisions, when available, are provenance, never destination write authority.
Each attachment entry records ID, referencing note entry IDs, metadata path/digest or missing status, and image
path/digest/MIME/byte length or unavailable/not-requested status. Failure records identify entry/date, failed phase and a
sanitized reason; exclude credentials and transient authenticated URLs. Unknown optional fields may be ignored;
unknown format versions or required capabilities must be rejected before restore writes.

All packaged payload files are inventoried and hashed. Digests detect accidental corruption, not malicious tampering;
this is not a signed archive. An empty string is a zero-byte markdown entry, never an instruction to delete a remote file.
Alternative versions are restorable only after an explicit selection. A visible-only date remains selectable as text
with its uncommitted provenance shown.

Local mode enumerates `jot:image:` references in every captured version but includes no remote Attachment Metadata or
image bytes. Report each as unavailable in this mode. Collection mode includes metadata for the union of references in
all captured versions. Missing metadata and ambiguous duplicate metadata are failures for the attachment component.
Unreferenced Image Attachments, the rest of the Jot Image Album, Source Image originals, Jot Settings, Tag Suggestion
Catalog, credentials, and existing recovery history are excluded in version 1. Excluding an unreferenced attachment is
not permission to delete it. External image URLs and other external resources remain dependencies, not fetched assets.

Report inventory, markdown, metadata and image coverage separately, with counts and per-entry reasons. Only label
referenced-image recovery independent when every referenced Jot image has usable metadata and verified packaged bytes;
ordinary external image links still have external dependencies. Never collapse these dimensions into a bare “complete
backup” message. A package contains personal text and potentially provenance/provider identifiers; download is explicit,
unencrypted in version 1, and never automatically uploaded or added to diagnostics.

## Safe package restore

The package is untrusted input. Validate the format, explicit dates, ULIDs, roles, unique paths and entry IDs, lengths,
digests and required files before any app or provider mutation. Reject absolute paths, traversal, symlinks, duplicate ZIP
paths, unsupported compression and inconsistent metadata. Never execute imported HTML or fetch arbitrary archive URLs.
Version 1 limits: 100 MiB compressed archive, 500 MiB total expanded bytes, 50,000 entries, 10 MiB per markdown/JSON file,
and 100 MiB per image. Enforce limits during decompression, not merely from ZIP headers. Reject over-limit archives with
an explanation; larger collection streaming/limits are deferred to #0014/#0015 and require a later documented decision.

Preview shows package scope/failures, selected versions by date, missing images, unresolved conflicts, destination
content and planned changes. Default existing dates to **skip**. Offer per-date replace/append/prepend choices consistent
with Daily Note Upload; selecting alternatives or uncommitted content is explicit. Empty entries and whitespace-only
canonicalization require a visible preview. Do not silently apply the current placeholder-cleanup preference to imported
non-empty markdown: restore must preserve its source, apart from user-approved append/prepend separators or attachment
ID remapping. Whitespace-only text canonicalizes to empty as required by the domain. No restore action deletes a note.

Reuse Daily Note Upload's date parsing, combination rules and Daily Note Replication seam. Its existing global conflict
choice and re-read-at-save behavior are insufficient: a choice for yesterday's preview cannot authorize replacement of
new content discovered during execution. Add a restore plan with per-date expected visible state, committed Local Draft
and remote baseline. Acquire the date's Editing Ownership (or wait/skip with explanation), recheck under the appropriate
local mutation lock, then conditionally commit. A change after preview invalidates that date's decision and requires a
new preview; other already completed dates remain reported as completed. Remote replacement still uses revision
preconditions and surfaces a Sync Conflict on divergence. Never replay exported clean/dirty flags or revision IDs as
live destination state. An offline restore commits a dirty Local Draft and reports remote verification/sync pending.

Before any existing content is changed, durably preserve its committed and differing visible versions in a local restore
journal, with date, operation ID and expected state; preserve observed divergent remote content too. Retain the package
and its captured versions as input. Failed preservation blocks that date's mutation. The journal and conditional draft
write must share an atomic transaction for local state; a remote version first discovered through a sync conflict is
preserved by normal conflict semantics. Do not use an old journal entry to overwrite intervening edits during rollback.

The journal includes chosen package entry IDs, resulting content digests, completed/pending dates and, in stage 4,
attachment mappings. Retain it until the user explicitly discards it, display storage use and offer export of preserved
versions. Storage exhaustion blocks further restore writes; do not evict a pre-restore version automatically. Sign-out
clears browser-local journal content along with account-local drafts after an explicit restore-history warning. It is
local protection, not an independent backup or immunity to browser eviction. This targeted journal does not depend on
automatic Recovery Snapshot history.

Restore is not a cross-note or cross-provider transaction. Persist progress per date, stop on failure/cancellation and
show completed, skipped, changed-since-preview, failed and pending entries. After interruption, reload the journal,
verify current destination digests and ask to resume; an already matching result is not appended again. Changed content
requires a new choice. A lost remote response remains pending until reconciled by existing sync rules. Sign-out/account
change cancels pending work; journals never resume into a different account. Offer export of retained versions before
clearing them. Success means selected content committed locally; report Drive Sync separately, and image readiness
separately in stage 4.

## Image-inclusive recovery

Stage 4 exports the Jot-owned selected copy, not the Source Image original. Record downloaded byte digest, dimensions
and MIME; failed/expired access remains unavailable. Verify the actual read/upload behavior in mocked provider tests and
a documented manual provider check before promising image independence. Do not infer byte availability from metadata.

In an empty destination preserve Jot Image Attachment IDs, upload packaged bytes to the destination Jot Image Album,
and create metadata using new provider IDs. Preserve Source Image metadata as provenance only. Never reuse source album
or media IDs as destination identifiers. Without packaged bytes, metadata-only restore may resolve an original copy
only after verifying access and obtaining user confirmation; otherwise preserve the reference and show unavailable.
No access to the original account is needed to restore packaged bytes, but a destination account is needed for the
current provider-backed image storage. Offline text restore must not imply offline image upload or readiness.

For an existing attachment ID, reuse only after verified metadata/byte identity; otherwise allocate a fresh ULID and
show the planned remapping. Rewrite only parsed Attachment Reference destination spans in selected imported markdown,
not literal text, code examples, or existing destination notes. Keep original imported bytes in the package/journal and
record the mapping. A retry reuses journaled mappings and confirmed uploaded copies. Ambiguous upload outcomes require
reconciliation or a visible retry decision; never promise exactly-once provider upload without evidence.

Prepare and durably record attachment metadata/mappings before applying dependent notes. If image preparation fails,
stop those notes or obtain explicit consent to restore text with unavailable images. An interrupted operation may leave
unreferenced newly uploaded copies; report them without automatic cleanup. Tests compare packaged byte hashes and Jot
reference resolution; provider transformations must be disclosed and cannot silently pass a byte-identical guarantee.

## Recovery history decision boundary

| Option | Retention/location/privacy | Failure and sync policy |
| --- | --- | --- |
| Browser-local automatic history | Possible bounded per-date history; lost with storage clearing/eviction and shares the account-local privacy boundary. Retention limits and purge UI require #0016. | Would be best-effort, with visible failures; does not block ordinary sync. Not an independent backup. |
| Provider-held immutable Recovery Snapshots | Separate append-only content records with explicitly designed retention/quota/deletion rules; account loss can remove both notes and history. | No adopted policy. #0016 must decide capture boundary and whether failure blocks sync before implementation. |
| User-held export packages | Retained wherever the user keeps downloads; plaintext personal data and externally controlled deletion/retention. | Failed export never blocks sync. Captures only the reported scope; independence requires included bytes and a retained file. |

Choose explicit packages plus mandatory preservation during restore now; defer automatic history. History does not make
sync correctness optional, and storing another file in the same account is not account-independent recovery. #0016 owns
retention numbers, encryption options, remote snapshot location and any future sync-blocking policy. None changes the
first export deliverable or the existing sync acknowledgement contract.

## Acceptance scenarios for implementation

These are future executable checks, not results claimed by the design issue.

| Scenario | Required observation | Layer/owner |
| --- | --- | --- |
| Offline dirty A and clean B | ZIP has both committed strings, dirty provenance and remote inventory not-requested. Restore into fresh storage compares exact non-empty markdown. | Unit/IndexedDB, download/import browser workflow; #0012/#0013. |
| Pending/aborted A commit, then navigate to B | Captured A visible alternative and last committed A remain attached to A; B never receives A text. Failed inventory aborts download. | Controlled async integration and browser; #0012. |
| Empty/whitespace and literal `<br />`/code/fences | Empty records remain represented; export does not normalize. Restore previews whitespace canonicalization and preserves non-empty source despite enabled placeholder cleanup. | Unit plus browser round-trip; #0012/#0013. |
| Dirty A, divergent remote A, Sync Conflict | All differing versions and markers retained; no implicit winner or sync acknowledgement change. | Integration and package assertions; #0014. |
| Paginated remote inventory, duplicates, zero bytes, mid-read edits | No export writes/trash requests; every discovered file accounted for, drift/failures reported; no global snapshot claim. | Mocked fetch URLs/methods/auth/bodies/preconditions/settings invariance; #0014. |
| Metadata present, image bytes unavailable, external image URL | Text/metadata coverage distinct from images; partial download and restore limitations explicit. | Provider mocks and browser workflow; #0014/#0015. |
| Fresh destination account without original account | Packaged bytes produce new provider metadata, retained Jot IDs and resolvable references; packaged image hashes verified. | Fake-provider round-trip, mocked fetch and manual external check; #0015. |
| ID collision and literal `jot:image:` in code | Explicit remap changes only imported reference destinations; existing notes and literal code unchanged. Retry uses same mapping. | Parser/property tests and browser workflow; #0015. |
| Existing newer A, edit while preview open, second tab owns A | Default skip; stale decision rejected; prior versions committed before an authorized replacement; conditional sync conflict preserves divergence. | Integration, shared-tab browser and stale-date regression; #0013. |
| Corrupt digest, traversal, duplicate entries, oversized or unsupported package | Visible error before any note/provider writes; no arbitrary network fetch or imported HTML execution. | Parser/archive unit tests and file-input browser regression; #0013. |
| Interrupted append after A succeeds before B | Journal survives reload; A is not appended twice, B can resume after revalidation; errors and pending sync stay visible. Failed journal write blocks replacement. | IndexedDB integration and restart browser workflow; #0013. |
| Sign-out or account change during export/restore/image upload | Stale result cannot download old-account content, write notes or resume into another account. Completed side effects are reported without claiming rollback. | Controlled integration and browser lifecycle; #0012/#0013/#0015. |

Run the verification commands required by [testing.md](testing.md) when each runtime stage ships. Mock Google requests;
real accounts are reserved for the manual external check. New storage/provider seams and restore safety must supplement,
not weaken, the existing replication model and regression suite.
