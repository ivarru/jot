## Context

See proposal.md for motivation. The route currently derives a live editor serialization, selectively normalizes it, and
compares the result with application Markdown to decide whether to replace the editor. Milkdown serialization can be
semantically equivalent without being textually identical, so that comparison conflates editor serialization with a
normalizer transformation. Browser tests also inherit the product-default setting even when normalization is unrelated
to the behavior under test.

## Goals / Non-Goals

**Goals:**

- Detect selective normalization from the before/after live serialization pair.
- Keep tests explicit about whether normalization is part of their contract.
- Retain compact enabled coverage for cross-feature compatibility and startup ordering.
- Make future normalization-policy changes local to their contract tests.

**Non-Goals:**

- Redefining which Markdown lines are currently eligible for normalization.
- Changing the shipped default preference in this change.
- Weakening conflict read-only behavior or other safety invariants to make tests pass.

## Decisions

### Compare normalized live Markdown with its live input

The selective-normalization path will decide that the editor needs replacement only when its normalized output differs
from the exact live serialization supplied to the normalizer. Application-state and canonical-persistence comparisons
remain separate concerns used to decide whether a save is needed.

Comparing normalized live Markdown with application state is rejected because editor serializers may produce an
equivalent representation without any placeholder transformation. Skipping all live replacement is rejected because
non-active placeholders are intentionally removed from the live document.

### Preserve the last date-bound collapsed selection across app-control focus

The route will continuously remember the editor's most recent collapsed Markdown selection together with the explicit
date, editor mode, and live snapshot identity. Selective normalization may use it after focus moves to an app-owned
toolbar or modal only while those identities still match. Date navigation, document replacement, non-collapsed
selection, read-only/conflict state, or newer editor activity invalidates it.

Inferring a caret from the end of the document is rejected because the user may edit non-linearly. Replaying an
unscoped old selection is rejected because asynchronous date and document changes make it unsafe.

### Give browser fixtures explicit normalization profiles

The shared fake-provider setup will accept `enabled`, `disabled`, or `default`. It will seed the setting before the app
loads the editor or begins synchronization. General editing and exact-serialization tests will request `disabled`;
normalization contract tests will request `enabled`; only settings/default tests will request `default`.

A global disabled browser environment is rejected because it would hide integration failures. Leaving every test on
the product default is rejected because unrelated tests then encode mutable normalization policy.

### Maintain a small enabled compatibility matrix

Representative enabled tests will cover toolbar formatting, a modal insertion workflow, autosave/sync, conflict pause,
and date-bound navigation. They will assert focus, editability, selection, insertion position, character order, and
persisted content while avoiding incidental serializer layout where that layout is not the feature under test.

### Hold pre-refresh saves behind a per-date refresh barrier

Starting a clean remote refresh will establish a per-date barrier before remote loading begins. Every scheduled
selected-note save carries its explicit `IsoDate`, Markdown snapshot, selected-note generation, and expected remote
revision across asynchronous boundaries. A save captured before the barrier cannot begin remote I/O until the refresh
resolves.

If the refresh applies newer content, it advances the date's generation and canonical revision and discards held stale
snapshots. If the refresh is unchanged, fails, or aborts without applying content, the barrier is released and the route
re-captures the current explicit date and Markdown; it saves only when that current snapshot is still dirty and eligible.
Multiple requests behind the barrier coalesce into this one current-snapshot evaluation. User edits during the refresh
therefore survive without rebasing an older snapshot.

Rebasing an old save onto the newly loaded revision is rejected because it combines stale Markdown with a current
revision and can silently overwrite the refresh. Advancing generation only after refresh application is insufficient
because the stale save may already have written. Current-generation writes outside a refresh barrier continue to use
the existing provider conflict semantics.

## Risks / Trade-offs

- [Tests accidentally use the wrong profile] → Require the profile at shared setup call sites and provide named helpers
  for normalization-specific suites.
- [Remembered selection crosses a stale document boundary] → Bind it to explicit date, mode, and snapshot identity and
  add A-to-B navigation regressions.
- [A stale save reaches remote I/O before a newer refresh applies] → Establish a per-date barrier before remote loading,
  hold and coalesce pre-refresh saves, then re-evaluate one current explicit snapshot after resolution.
- [A failed or aborted refresh strands held saves] → Release the barrier in every terminal path and trigger current-
  snapshot re-evaluation from `finally`-equivalent cleanup.
- [Disabled general tests hide integration bugs] → Keep the enabled compatibility matrix in the full browser suite.
- [Browser suite is skipped during development] → Make `npm run verify:full` an explicit completion task and document
  that cross-cutting editor changes require it.

## Migration Plan

1. Add the failing focused regressions before changing route behavior.
2. Correct live-change detection and date-bound selection retention.
3. Guard scheduled saves against a newer remote refresh generation and verify the exact stale-cache sequence.
4. Introduce explicit browser profiles and migrate existing tests by intent.
5. Update stale assertions, patch-bump the application, and run the complete verification suite.
6. Roll back by reverting this patch; no stored data migration is involved.
