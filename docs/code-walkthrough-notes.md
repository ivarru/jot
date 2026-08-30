# Code Walkthrough Notes

Private working notes for the documentation-and-architecture walkthrough begun on 2026-08-30. This file is deliberately separate from the app documentation. It records conclusions reached together in this chat, rather than the assistant's unconfirmed impressions.

- The walkthrough's primary aim is to improve the user's understanding of this project. Explanations may be more detailed than the existing documentation without implying that those documents should change.
- The notes should be short, link to relevant source documents, and record agreed improvement ideas for code or documentation when they arise.
- Documentation primarily serves the user and future AI agents; usefulness to other readers is secondary.

## [README.md](../README.md)

- The "Experimental software" warning is user-authored; the rest was agent-written.
- Agreed improvement: add a short, user-facing limitations note. Google access may require an interactive reconnect around token expiry; local drafts continue, but remote sync is blocked until then. Whole-file Markdown synchronization is not real-time collaboration: concurrent edits can create conflicts needing resolution. Link to [sync-and-connection-statuses.md](sync-and-connection-statuses.md) for detail.
- Improvement candidate: reorganize the current "Local Development" and "Environment" material around the consequential storage choice. State plainly that `npm run dev` uses browser-local fake storage by default; a `VITE_GOOGLE_CLIENT_ID` in `.env.local` opts development into real Google storage; `VITE_ENABLE_FAKE_AUTH=true` forces fake storage. The present section split is conventional in name, but less clear than a task-oriented local-start guide.
- Agreed improvement: say that browser workflow regressions use Playwright and explain their distinct value: they exercise actual browser behavior such as editing, clipboard/camera/file-input flows, layout, OAuth-like flows, and synchronization interactions. Link to [testing.md](testing.md) for the command matrix and policy. These tests are important but relatively slow, so focused commands are useful during development and the full suite remains a completion check.
- Testing improvement: replace Playwright's fixed-duration waits where feasible with waits for an observable condition (UI, local draft, or fake remote state). Fixed waits make the already slow suite slower and can still become flaky. Prefer accessible role/label locators and shared helpers; add a stable test hook only when a meaningful user-facing locator is not possible.

## Possible sync direction

- The history of conflict work motivates considering an intermediate server so Milkdown/ProseMirror can use Yjs collaboration support. This is an open architectural option, not a decision.
- A Yjs server could merge concurrent edits continuously, but would make it the live document authority. It would add persistent server operation, authentication/access control, backups, deployment, and security responsibilities; Drive Markdown would likely become export, backup, or interchange rather than the live source of truth.

## Dependencies

- As checked on 2026-08-30, the installed TypeScript is 5.9.3 (allowed by the `^5.8.3` declaration); TypeScript 7.0.2 is current and uses a faster native implementation. Jot appears to use TypeScript only through `tsc --noEmit`, so it is a plausible upgrade candidate, but it is a major-version/toolchain migration that requires full verification. [TypeScript 7 announcement](https://devblogs.microsoft.com/typescript/announcing-typescript-7-0/)
- Routine candidates: update DOMPurify (the HTML sanitizer), Playwright, Solid, Milkdown, and test utilities. Assess Milkdown core and its exactly pinned AutoMD plugin together.
- Treat upgrades to SolidStart 2, Vite 8, Vitest 4, jsdom 30, and other major versions as distinct migration work.

## [AGENTS.md](../AGENTS.md)

- Improvement candidate: retain a short, human-visible pre-commit rule for shipped behavior changes, explicitly saying that the SemVer bump occurs near the end of development. Put the detailed choice and update checklist in a commit skill or release procedure. This avoids premature bumps while keeping the policy visible to humans who do not invoke a skill.

## Repository guidance files

- Agreed README improvement: add a small "Working on Jot" group that briefly links [AGENTS.md](../AGENTS.md), [CONTEXT.md](../CONTEXT.md), [NOTES.md](../NOTES.md), and [the ADR index](adr/README.md), explaining their separate roles for contributors and agents.
- `CONTEXT.md` is the stable vocabulary and invariant glossary; `NOTES.md` is a temporary parking lot for issues, prospective work, and unresolved questions; ADRs retain settled architectural rationale.
- Accuracy review needed: the `Active Unit` / `Rendered Unit` concepts in `CONTEXT.md` have no other current use in the repository and may describe an earlier editor design.
- `CONTEXT.md` likely originated with early Matt Pocock skills. To make it useful beyond that original workflow, route relevant work to it explicitly from `AGENTS.md` and/or repository-committed skills; otherwise agents will not reliably consult it.

## Documentation map

- Agreed improvement: add a `docs/README.md` that gives each document a clear description of its subject, authority, and purpose—not merely a vague “read this when” suggestion—and use it as the comprehensive documentation index.
- Reorganize files if that makes their role clearer. Historical investigations/postmortems should live in a clearly named historical subdirectory rather than alongside current guidance.
- Reduce redundant `testing.md` links in the root README: retain the local-development link where readers need test commands, and replace the duplicate architecture-list link with the future documentation index. Its single links from `AGENTS.md`, `deployment.md`, and `sync-model.md` each serve a distinct contextual purpose.

## [package.json](../package.json)

- Review the Playwright command menu. Named full-suite and stable group commands (for example, editing, workflows, and smoke) help because browser tests are slow; numerous individual-file shortcuts may become stale or arbitrary. Use Playwright directly for exceptional one-off files.

## Source structure

- Consider moving feature- or workflow-specific orchestration out of `src/routes/index.tsx`. It is the legitimate composition root that ties modular services and UI together, but at over 4,500 lines it is an architectural pressure point. Preserve a small top-level composition root while extracting coherent workflows.
- Prefer deep, vertical feature modules over broad horizontal layer folders. The current `components` folder is especially unhelpful as a catch-all, and the rarely used image-attachment feature is split across `attachments`, `photos`, `domain`, and the route. Future refactoring should co-locate feature UI, workflow, and feature rules where practical, reserving separate folders for genuinely shared infrastructure or external-provider adapters.
- Consider replacing the broad `domain` folder with feature-local domain rules. A restrained filename convention (for example `*.types.ts`, `*.schema.ts`, or a feature-specific name that states the concept) can make a file's role visible within its logical module. Keep only truly cross-cutting concepts in a small shared/core area; do not recreate horizontal layers inside every feature.
- `dailyNoteUploadGeneration` in `index.tsx` is route-owned cancellation state for the complete upload interaction, not replication state. The upload session correctly receives cancellation through a `canContinue` callback rather than owning UI lifecycle. In a vertical refactor, co-locate that lifecycle/UI state, the upload session, its domain rules, and upload components in a `daily-note-upload` feature module.
