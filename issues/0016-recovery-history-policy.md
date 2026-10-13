---
id: "0016"
title: "Decide automatic recovery history policy"
status: open
type: design
priority: low
created: "2026-10-13"
labels: [recovery, portability, storage]
---

# Decide automatic recovery history policy

## Problem and evidence

Explicit packages enable independent recovery only when retained. Automatic history might help undo synchronized
mistakes, but local history shares browser failure modes and provider-held history shares account failure modes.
The [safety reference](../docs/sync-safety.md#deferred-for-reconsideration) leaves Recovery Snapshots deferred.

## Outcome and scope

Evaluate browser-local bounded history and provider-held immutable Recovery Snapshots against the options in the
[export contract](../docs/export-and-recovery.md). Decide whether either warrants implementation and create scoped issues
if adopted. This design must not introduce an implicit sync prerequisite or conflate optional history with the mandatory
pre-restore journal. Encryption of future packages/history is a related decision owned here, not a version 1 guarantee.

## Acceptance criteria

- [ ] Document covered failures and exclusions for each option, including browser eviction, account loss and validly synchronized bad edits.
- [ ] Specify retention counts/time/size, snapshot capture boundary, storage location, quotas, deletion/expiry behavior and user-visible recovery controls for any adopted option.
- [ ] Define privacy, encryption/key-loss and account/sign-out behavior; explain which copies remain independently recoverable.
- [ ] Explicitly decide whether snapshot failures block ordinary sync and how partial/ambiguous writes are surfaced without false saved/synced acknowledgements.
- [ ] Record the accepted or rejected decision in an ADR and link implementation issues with executable recovery/retention/failure scenarios if adopted.

## Verification

Walk through offline edits, corrupt synchronized text, quota exhaustion, interrupted snapshot writes, browser clearing,
account loss, expiry and restore over newer content. Review against the replication safety contract. No runtime tests
are required for this design-only issue; adopted runtime work must have focused and browser regressions.

## Dependencies and related work

No hard dependencies. [#0012](0012-local-draft-export.md) through [#0015](0015-image-inclusive-recovery.md) deliver
explicit export/restore independently. The targeted journal in [#0013](0013-safe-package-restore.md) does not wait for this decision.

## Resolution

Pending.
