# Issues

This directory is Jot's authoritative backlog for scoped work. Issues are Markdown files committed alongside the code.
The [improvement assessment](../docs/improvement-assessment.md) provides direction; [project notes](../docs/notes.md)
hold ideas and observations that are not yet scoped. [ADRs](../docs/adr/README.md) record accepted architectural decisions,
and current reference documents describe implemented behavior. An open issue does not change those contracts.

## Files and metadata

Copy [TEMPLATE.md](TEMPLATE.md) to `NNNN-short-description.md`. Allocate the next unused four-digit numeric ID after the
highest previously allocated ID. Never reuse IDs. Keep closed issues and keep filenames stable when status or title
changes. Coordinate allocation if multiple changes are being prepared concurrently.

Use these required YAML fields:

| Field | Convention |
| --- | --- |
| `id` | Quoted four-digit string, such as `"0001"`, preserving leading zeroes across YAML parsers. |
| `title` | Human-readable title matching the heading. |
| `status` | `open`, `in-progress`, `blocked`, or `closed`. |
| `type` | `bug`, `feature`, `testing`, `investigation`, or `design`. |
| `priority` | `high`, `medium`, or `low`; priority does not imply a deadline. |
| `created` | Quoted ISO date, such as `"2026-09-18"`. |
| `labels` | Short descriptive strings; use `[]` if none apply. |

Use Markdown checkboxes for acceptance criteria. Separate a suspected defect from a reproduced bug. State dependencies
explicitly; related work and preferred order are not automatically blockers. Reference local issues as linked IDs, for
example [#0001](0001-local-draft-commit-acknowledgement.md). In GitHub commit/PR text, use `local issue #0001` with the file
path when needed to distinguish it from GitHub's own issue numbers; avoid GitHub closing keywords for local-only issues.

## Workflow

1. Scope the outcome, exclusions, acceptance criteria, and verification before implementation. Keep issues small enough
   to close independently; split substantial new scope into a new issue and link it.
2. Set `status: in-progress` when starting. Follow [AGENTS.md](../AGENTS.md), including regression-first bug fixes and
   version bumps for shipped changes. Record blockers when using `status: blocked`.
3. Update useful decisions and evidence in the issue as work proceeds. Git supplies detailed edit history; a transcript
   or running diary is unnecessary. Promote durable architectural decisions to ADRs.
4. In the completing implementation commit or PR, check fulfilled criteria, record verification results and relevant
   limitations, and set `status: closed`. Record earlier implementation commits when useful; the closing commit itself
   is discoverable through Git history and need not contain its own hash.
5. If closing as rejected, duplicate, or superseded, record that disposition and reason instead of checking unfulfilled
   criteria. Link replacement work. Reopen the same issue if its original outcome was not actually achieved.

Do not mirror this backlog in GitHub Issues. External reports may be linked, but local issue files own status and scope.

## Finding work

There is no manually maintained status index. Browse numbered files or search front matter:

```sh
rg -l '^status: (open|in-progress|blocked)$' issues/[0-9]*.md
rg -l '^priority: high$' issues/[0-9]*.md
```

Start with #0001 for the storage concern. #0002 establishes a small property-testing foundation before #0003's generated
lifecycle scenarios. #0004 improves incident evidence, #0005 covers browser persistence boundaries, and #0006 scopes
export and recovery. These IDs describe the initial sequence, not a separate status list. Add a generated index only
when browsing and searching the files becomes inconvenient.
