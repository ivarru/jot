# Code Walkthrough Notes

Private, non-authoritative working notes for the documentation and architecture walkthrough begun on 2026-08-30. The
primary aim is to improve the owner's understanding of Jot. Durable behavior belongs in current documentation; settled
architectural rationale belongs in ADRs; actionable but unresolved work belongs in `docs/notes.md` or a focused change.

## Completed during the walkthrough

- Clarified that `CONTEXT.md` is the high-level domain context and shared vocabulary in the domain-driven-design sense,
  and removed its repetitive example dialogue. The file originated in an earlier Matt Pocock skill-guided workflow and
  remains at the repository root for convention and agent-skill discoverability.
- Added a user-facing README limitations section covering interactive Google reconnects, Local Draft protection, and
  conflict-based whole-file synchronization.
- Reorganized local development around the consequential choice between browser-local fake storage and Google-backed
  storage, and explained the distinct value of Playwright browser regressions.
- Added `docs/README.md` as the comprehensive documentation index, with each document's subject, authority, and purpose.
- Routed agents and contributors to that index from `AGENTS.md`, with explicit guidance for when to consult
  `CONTEXT.md`.
- Moved the temporary project parking lot from root-level `NOTES.md` to `docs/notes.md`, and kept the root README's
  `Working on Jot` section concise by delegating the detailed document map to `docs/README.md`.
- Extracted Daily Note Upload from the route into `src/features/dailyNoteUpload`, colocating its domain rules, storage
  session, Solid workflow state, cancellation lifetime, UI surfaces, and tests while keeping application-owned auth,
  editor snapshot, replication result, and date-picker refresh decisions explicit at the composition root.
- Extracted the Daily Note date picker into `src/features/datePicker`, including its focus and month state, calendar UI,
  and the asynchronous existing-note-date loader shared with the section-link picker.

## Remaining documentation and testing opinions

- Prefer Playwright waits for observable UI, Local Draft, or fake-remote state over fixed-duration sleeps. This policy is
  already in `testing.md`; future work should be a concrete inventory and cleanup rather than more policy text.
- Keep the detailed SemVer policy in repository-owned `AGENTS.md`. A commit skill may reinforce it, and the guidance may
  say that the bump normally happens near the end of development, but correctness should not depend on a skill being
  installed or invoked.
- Keep stable browser-suite aliases such as editing, workflows, and smoke. Review the numerous individual-file aliases
  using actual maintenance value and usage; use Playwright paths directly for exceptional one-off files.
- Dependency observations are timestamped leads, not durable guidance. As checked on 2026-08-30, installed TypeScript is
  5.9.3 under the `^5.8.3` declaration. A TypeScript major upgrade affects framework, build-tool, test, and third-party
  type compatibility even though the direct script is `tsc --noEmit`. Assess Milkdown core and its exactly pinned AutoMD
  plugin together; treat other major toolchain upgrades as separate migration work.

## Architecture opinions

- `src/routes/index.tsx` is the legitimate composition root, but at roughly 4,900 lines it remains an architectural pressure
  point. Preserve a small top-level composition root while extracting coherent workflows according to state ownership
  and asynchronous lifetime.
- Daily Note Upload established the first vertical feature boundary. Its workflow owns UI state and cancellation, while
  the session receives cancellation through a `canContinue` callback rather than owning UI lifecycle.
- Prefer incremental vertical feature modules over a wholesale folder reshuffle. Move feature-local UI, orchestration,
  and rules together where that clarifies ownership, while keeping genuinely shared infrastructure and Google provider
  adapters visibly separate.
- The owner confirms that image attachments are rarely used and that the owner is currently the only known user. That
  lowers the feature's near-term product priority and does not by itself justify spending time reorganizing it. If route
  decomposition reaches the feature, its fragmented ownership across `attachments`, `photos`, `domain`, and the route
  makes co-location reasonable, while low usage may reduce migration risk.
- Reconsider the broad `domain` folder incrementally as features are extracted. Keep genuinely cross-cutting concepts in
  a small shared/core area, and avoid recreating horizontal layers inside every feature.

## Open sync direction

- A Yjs collaboration server remains an architectural option, not a decision or an incremental sync upgrade. It could
  merge concurrent edits continuously, but would become the live document authority and add persistent operation,
  authentication and access control, backups, deployment, and security responsibilities. Drive Markdown would likely
  become export, backup, or interchange rather than the live source of truth.
- Promote this to a design question only if real-time or continuously merged multi-device editing becomes an explicit
  product goal.
