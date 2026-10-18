# Local data retention and privacy review

Review date: 2026-10-18. Reviewed code: `cb8e70e`, app `0.34.2`.
This records [#0024](../issues/0024-review-local-data-privacy.md). It assesses the browser client and checked-in worker,
not Google's retention, browser-profile forensics, or deployed HTTP headers. All probes used synthetic data.

Follow-up status and current remediation evidence are consolidated in [security verification](security-verification.md).
The findings and results below remain the dated review snapshot.

## Data inventory and intended lifetime

| Data | Location and transmission | Lifetime and cleanup |
| --- | --- | --- |
| Daily Note source and baseline, date, raw revision ID, dirty flag and timestamps | Unencrypted IndexedDB `jot` / `drafts`; memory in editor, replication and search/conflict state. Authorized Drive media and metadata requests carry note content and identifiers. | Local Drafts deliberately survive offline restart, including clean baselines. `clearForSignOut` advances the shared account epoch, clears drafts and removes the account owner under the draft-mutation lock. Unsynced/error/conflict states require a deletion warning. This is logical deletion, not secure erasure. |
| Development-provider notes, image blobs/metadata and settings | IndexedDB `fakeRemoteNotes`, `fakeImageAlbum`, `fakeImageAttachmentMetadata`, `fakePhotoMediaItems`, `settings`. | These simulate remote storage and remain after development sign-out; they are not the production Google user's local draft store. Do not use real/private material in development storage. Production-feature exclusion is assessed in #0025. |
| Google account owner and session generation | Origin-wide localStorage `jot.googleAccountId` and `jot.accountEpoch`. Owner is an opaque Drive permission ID, not an email. | Owner is removed on successful sign-out clearing; an opaque generation remains so stale tabs cannot repopulate drafts. Token acceptance verifies owner continuity before editor entry. Legacy drafts require an explicit ownership confirmation. |
| OAuth access token and expiry | Memory and sessionStorage `jot.googleAccessToken.<clientId>`; bearer Authorization to Google APIs, authorization response URL fragment on redirect. No refresh token/client secret. | Used only before expiry and for the captured account epoch. Invalidation/revoke removes local credentials before asking Google to revoke a usable token. Other tabs receive the epoch change and invalidate their credentials. Tab storage can survive reload and browser session restoration; it is not encrypted storage or a guarantee of physical expiry deletion while a tab is idle. |
| Verified-token proof and redirect state | sessionStorage `jot.googleAccountProof` contains SHA-256 token digest, account ID and epoch; `jot.googleOAuthRedirect.<state>` contains creation time, epoch and date hash. | Proof is cleared on invalidation. Redirect state is single-use with ten-minute acceptance TTL and is removed on invalidation. Expiration is checked on consumption, not by a timed storage sweep. Accepted redirects strip the OAuth fragment. |
| Photos picker state and pending image bytes | sessionStorage `jot.googlePhotosActivePicker` (date, session object/picker URI, creation time); in-memory Blob/File, camera stream, image display URLs. | Picker restore checks a ten-minute TTL. Sign-out/date/session reset clears picker/image UI state; temporary object URLs used for image decoding are revoked on load/error. Camera tracks stop on cleanup. No claim of wiping engine memory or revoking an already-issued Google display URL. |
| Tag names and modification times | localStorage `jot.tagIndexCatalog.v1`, in-memory local/remote catalog; derived tag-index notes in Drive. | Persistent catalog supports fast browsing. Sign-out clears it and the legacy `jot.tagSuggestions.v1` key; generation checks reject delayed refresh results. Tag names can themselves be sensitive. |
| Preferences and UI state | Production preferences in Drive settings and route memory; development settings in IndexedDB; per-date ownership uses Web Locks. | No independent persistent production note-settings cache was found. Page-local dialogs, history and search state are not a secure memory boundary. Date hashes and browser navigation history can outlive sign-out. |
| Diagnostics | Opt-in `SyncDiagnosticsBuffer` in memory; explicit capture/copy to OS clipboard. Fixed lifecycle events, dates, lengths, salted noncryptographic equality hashes, version and browser context. | Disabled by default; at most 250 events and a rolling minute. Conflict pauses intentionally freeze the prior snapshot beyond a minute; disabling/reload clears it. Clipboard copies persist under OS/clipboard-manager policy and are not erased by sign-out. Hashes are not encryption/anonymization; dates and browser context remain identifying metadata. |
| Shared links and clipboard content | User-provided title/text/URL in incoming share query; readRichClipboard/DOMParser and dialog state; outgoing diagnostics or selected note text on explicit copy. | The app removes the share query from the visible URL after consuming it. That cannot retract the initial navigation request or its host/browser records. HTML link extraction never adopts the source DOM, but inert parsing is not a promise of zero resource fetching. |
| Offline shell and runtime requests | Cache Storage `jot-shell-v6`; worker caches successful same-origin GET responses and complete request URLs. | Survives sign-out. Cross-origin Google API/image responses are excluded by the worker's origin check. Same-origin query data is not excluded; see #0032. Activation also deletes unrelated cache namespaces; see #0033. |

Relevant implementations: `src/storage/{indexedDb,localDraftStore,sessionGuardedDraftStore,tagIndexCatalog}.ts`,
`src/auth/{googleIdentity,googleAccountBoundary}.ts`, `src/routes/index.tsx`, `src/attachments/imageAttachmentFlow.ts`,
`src/sync/syncDiagnostics.ts`, and `public/sw.js`.

## Outbound data and confidentiality boundaries

The reviewed application has no analytics/beacon/error-report upload call. Diagnostics are not automatically uploaded,
and production application sources contain no console logging of notes/tokens. Diagnostic call sites supply fixed event
names and selected fields, not raw provider error bodies. Notes and searches go to Drive; picked/uploaded images and
picker sessions go to Photos; identity and authorization go to Google. Provider errors may be shown to the user as
text but are not added verbatim to diagnostics. API request headers are built from the captured token provider; tests
cover cancellation between async steps and before stale credentials can be reused.

Google Identity Services is a remote script executing in the page's origin and therefore shares access to plaintext
browser data. External note images automatically contact their chosen host (#0031). App-managed Photos display URLs
also disclose access to Google. Local image import does not promise metadata stripping: original/GIF/already-small
images can preserve original bytes, while resizing uses canvas. Filename, media type, dimensions and last-modified data
may be stored in attachment metadata in Drive. Intentional uploads must not be described as anonymized images.

The worker ignores non-GET and cross-origin requests. That excludes normal Google bearer requests from its Cache
Storage, but does not establish anything about Google's cache headers, the browser HTTP/image cache, CDN logs or Photos
URL retention. Those were not measured against live services. Network intermediaries/hosts may observe URL metadata;
OAuth client IDs are public identifiers, whereas bearer tokens are credentials. No real token was used in the review.

Same-origin code can read IndexedDB/localStorage and accessible sessionStorage regardless of account checks. Project
paths are not storage isolation boundaries. Browser extensions, a shared unlocked profile, restored tabs and developer
tools can access retained data. Signing out removes the app's working drafts, not Drive/Photos data, browser history,
clipboard contents, all browser caches, backups, or another installed origin's data. The draft lock/epoch protects
against cooperative stale writers, not malicious same-origin JavaScript. No encryption or secure-erasure claim is made.

## Confirmed findings and reproduction

1. **Medium, #0032: private share-query retention.** In a controlled Chrome page, navigating to a URL containing
   synthetic share title/text caused the worker to cache that complete URL. The application cleared the visible query,
   but the marker remained in Cache Storage after sign-out. This is unnecessary persistent metadata outside draft
   cleanup, not a demonstrated network exfiltration. [Remediation issue](../issues/0032-exclude-private-requests-from-shell-cache.md).
2. **Medium, #0033: unrelated cache deletion.** After seeding an `other-app-synthetic-cache`, registering an updated
   worker deleted it on activation. Cache Storage is origin-wide; project-path worker scope does not restrict `caches.keys`.
   Another app's offline data can be lost. The [Cache Storage specification](https://w3c.github.io/ServiceWorker/#cache-storage) describes the shared storage model. [Remediation issue](../issues/0033-preserve-unrelated-origin-caches.md).
3. **Existing #0031 remains open:** arbitrary external Markdown image requests reveal note access. The content review
   established origin-only referrer and no Authorization header in its intercepted Chrome case; that is not a privacy
   permission mechanism. No duplicate issue was opened.

The [retained Chrome probes](../tests/browser/workflows/privacy-boundaries.spec.ts) assert these current cache behaviors
as characterization evidence. Passing those two probes does not establish safety; their expectations must change with
remediation. The third new test establishes logical draft/tag cleanup and signed-out UI in both tabs. The wider
account and image suites exercise different-account rejection, offline same-account restoration, pending auth
cancellation, late image work and A-to-B navigation. Those passed; no additional cross-account note disclosure was
reproduced in these cases. Existing provider data in the fake remote stores is intentionally not erased as if it were
a Local Draft.

## Verification and limitations

Replay:

```sh
npx vitest run src/sync/syncDiagnostics.test.ts src/storage/localDraftStore.test.ts src/storage/sessionGuardedDraftStore.test.ts src/storage/tagIndexCatalog.test.ts src/auth/googleIdentityLifecycle.test.ts src/auth/googleAccountBoundary.test.ts src/attachments/imageAttachmentSession.test.ts
npx playwright test tests/browser/workflows/privacy-boundaries.spec.ts tests/browser/workflows/google-account-boundaries.spec.ts tests/browser/workflows/google-auth-boundaries.spec.ts tests/browser/workflows/image-session-boundaries.spec.ts tests/browser/workflows/offline-restart.spec.ts
```

The focused unit run passed 47 cases and the Chrome run passed 12 workflows. One initial browser probe incorrectly
expected an editor for an uncached date while fake storage was deliberately unavailable; it was corrected to assert
that tab's authenticated menu before testing cross-tab sign-out. This was test setup, not a production failure.
The two existing Chrome diagnostics-copy workflows also passed. Routine `npm run verify` passed 820 tests,
typechecking and the production static build. Preview servers stopped; only tests/documentation changed.

No live Google account, HTTP-cache forensics, physical deletion, OS clipboard history, memory heap erasure, deployed
response headers, backgrounded/discarded-tab timing or every failure of storage/revocation was established. Sign-out
waits for a revocation callback before completing the local UI transition; an absent callback and failed IDB clearing
remain explicit fault-injection gaps. Diagnostic pausing and old page-local UI state are not guaranteed to be erased
at every account boundary; only the exercised note/token/session paths are established here. #0026 owns consolidated
adversarial coverage. Closing this investigation leaves #0031–#0033 open and does not accept those risks.
