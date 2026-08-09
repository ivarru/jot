# Concentrate Daily Note Replication

Status: Accepted

## Context

Daily Note Replication must keep an explicit date, markdown snapshot, visible remote baseline, Local Draft state, and
asynchronous lifecycle identity aligned. The implementation grew across core sync functions, selected-session helpers,
and a selected-date lifecycle coordinator. Application code could import each part independently, so the safety model
looked like several separate interfaces even though those parts must change together.

Combining the implementation into one large source file would make the public ownership clearer but would reduce
locality inside the module. Introducing a new framework would also mix a structural refactor with changed sync
semantics.

## Decision

Place the existing core protocol, selected-session adaptation, and selected-date lifecycle implementation inside one
`dailyNoteReplication` module. Expose one supported public interface from the module index. Keep focused internal seams
and tests where they preserve locality, but prevent application code from reaching through the public seam.

This change is behavior-preserving. The module continues to use Local Draft and remote-storage adapters and retains the
Plain Markdown File as the Daily Note source of truth.

## Consequences

- Sync invariants and their tests are discoverable under one module.
- Application code has one import seam for Daily Note Replication.
- Internal protocol and editor-session functions can evolve without expanding the public interface.
- A future formal specification can map its actions to one runtime module.
- Background replication and Daily Note Upload remain supported through explicit public operations until their
  interfaces are deliberately reconsidered.
