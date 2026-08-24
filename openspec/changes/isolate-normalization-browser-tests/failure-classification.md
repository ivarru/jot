# Original browser-failure classification

The full browser run that motivated this change reported 14 failures. This checklist records the disposition used while
implementing the change; the final full-suite run remains the acceptance check.

| # | Failing scenario / invariant | Classification | Disposition |
| --- | --- | --- | --- |
| 1 | Raw Tab/undo setup lost its requested selection | Stale test harness behavior | Make the raw selection helper apply and observe the selection atomically. |
| 2 | Equivalent WYSIWYG background serialization replaced the live document | Production behavior | Compare normalized live Markdown with the exact live input. |
| 3 | Trailing-space background serialization moved the WYSIWYG caret | Production behavior | Keep serializer equivalence separate from normalization replacement. |
| 4 | Toolbar indent from a fresh empty paragraph lost its anchor | Production behavior | Retain a collapsed date/mode/snapshot-bound editor selection across app-control focus. |
| 5 | Toolbar dedent from a fresh empty paragraph lost its anchor | Production behavior | Use the same guarded retained selection. |
| 6 | Block-quote formatting from a fresh empty paragraph lost its anchor | Production behavior | Use the same guarded retained selection. |
| 7 | Task-checkbox formatting from a fresh empty paragraph lost its anchor | Production behavior | Use the same guarded retained selection. |
| 8 | Modal insertion into a trailing empty paragraph moved to another position | Production behavior | Bind the insertion anchor to the retained current-date selection. |
| 9 | Exact Markdown editing fixtures changed under an unrelated normalization policy | Normalization-policy isolation | Run general editing and fidelity fixtures with normalization explicitly disabled. |
| 10 | LaTeX/exact serializer fixtures inherited placeholder policy | Normalization-policy isolation | Use the disabled profile and retain a focused enabled compatibility case elsewhere. |
| 11 | Image/link/tag workflow fixtures inherited placeholder policy | Normalization-policy isolation | Select disabled or enabled explicitly according to the workflow contract. |
| 12 | Diagnostics heading expected a hard-coded diagnostics version | Stale assertion | Derive the expectation from the production Jot version format. |
| 13 | Conflict workflow expected editing to remain enabled | Stale assertion | Assert the production safety rule: the editor is read-only and diagnostics are frozen. |
| 14 | A clean stale phone cache could overwrite the newer remote editor/draft/note | Production behavior | Establish a pre-refresh barrier and revalidate timer-captured same-date Markdown after refresh. |

The policy-isolation entries are intentionally covered by many general tests rather than duplicating normalization
assertions. Enabled integration coverage remains in the toolbar, tag-modal, placeholder sync, conflict, and date
navigation workflows.
