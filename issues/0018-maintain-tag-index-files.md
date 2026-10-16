---
id: "0018"
title: "Create and maintain per-tag index files in Google Drive"
status: open
type: feature
priority: medium
created: "2026-10-16"
labels: [tags, google-drive, indexing]
---

# Create and maintain per-tag index files in Google Drive

## Problem and evidence

Reference Tags can associate names with Daily Note content, but there is no maintained collection of their
occurrences. The browser-local Tag Suggestion Catalog is only a convenience for insertion and cannot serve as a
synced index. See [Tags](../docs/tags.md) and the [domain context](../CONTEXT.md).

## Outcome and scope

Create a separate folder under the Google Drive Jot Folder for generated tag indexes, proposed as `jot/tag-index`.
Maintain one readable Markdown file per canonical Reference Tag, named `<canonical-name>.md`. Daily Note Markdown
remains the source of truth; indexes are derived, rebuildable data and must not rewrite notes.

Each occurrence produces one line containing the note's ISO date and a context excerpt. Use the opening text of
its current Markdown element (for example a paragraph or list item), stopping immediately before that tag occurrence.
Exclude the tag itself and everything after it, even when more text follows on the same source line. Remove leading
list/bullet, task, or heading indicators from the context. Normalize soft line breaks to spaces: source wrapping must
not affect excerpts for either paragraphs or long list items. A list item's context must not include sibling items.

If the element contains no meaningful text before the tag, retain the earlier fallback intent by using the preceding
Markdown element's opening text, rather than the preceding physical source line. If there is no preceding element
with usable context, retain a date-only entry. Specify structural boundaries for nested/multi-paragraph list items
and section-tag declarations during implementation, using the established Reference Tag associations.

Add a maximum excerpt length to Jot Settings, defaulting to 200 characters. Apply it to context text, excluding the
date and Markdown syntax needed for formatting. Define the precise Unicode counting and truncation-marker rules
during implementation; avoid splitting a user-perceived character. Clipping must preserve a self-contained Markdown
fragment: truncate parsed content and safely serialize it, closing formatting or falling back to escaped/readable
text rather than cutting the raw Markdown string. Changing the setting must allow existing indexes to be regenerated
with the new limit, not leave different dates permanently indexed with different limits.

Preserve one output line per occurrence, even when two occurrences produce identical excerpts. Sort ascending by
note date, then by source position within that note, including multiple occurrences on the same line.

For example, `- Review the API [#work](jot:tag/work)` in `2026-10-16.md` contributes
`2026-10-16 Review the API` to the `work` index. A standalone tag immediately following `## Storage design`
contributes `2026-10-16 Storage design`. If no preceding element provides usable context, retain a date-only entry.
A long paragraph or list item contributes its opening excerpt, clipped to the configured limit or the tag position,
whichever comes first. Text after the tag is never included.

Retain useful inline Markdown, such as emphasis, links, and inline code, when it can be represented as a complete,
self-contained fragment. Extract with awareness of the source Markdown structure rather than copying arbitrary
syntax boundaries. Serialize each dated entry on one physical line. Escape or reduce incomplete/unsupported
constructs to readable text instead of emitting syntax that changes the interpretation of subsequent entries.
In particular, never copy an opening or closing code fence from fallback context into the index. Both
individual entries and their concatenation must render as intended under Jot's CommonMark/GFM dialect; merely
being accepted by a permissive Markdown parser is insufficient. Do not copy unresolved reference-style links
without making them self-contained. These transformations apply only to generated indexes, never to source notes.

Maintain indexes for successfully synced note content, including conflict-preserved Markdown. Initial creation and
repair must account for existing notes, not only notes edited after this feature is enabled. Reconcile edits made
outside the current browser when refreshing/rebuilding the index. Presentation and navigation belong to
[#0019](0019-browse-tag-index-and-open-instances.md).

## Acceptance criteria

- [ ] A dedicated index folder exists under the Jot Folder, separate from Daily Notes and attachment metadata.
- [ ] Each canonical tag has one index file containing every recognized occurrence in synced Daily Notes.
- [ ] Recognition uses Reference Tag destinations and Markdown parsing rules; code examples and ordinary links are
      not indexed as tag occurrences. The visible link label does not determine tag identity.
- [ ] Entries follow the context extraction and ordering rules above, retaining repeated occurrences.
- [ ] Excerpts start at the current Markdown element and stop before the tag, subject to the configured length
      limit. Paragraphs and list items use the same rule regardless of soft line wrapping or trailing text. Empty
      prefixes use the preceding-element fallback, not a physical-line rule.
- [ ] Jot Settings exposes a validated maximum excerpt length, defaults to 200 for existing and new settings, and
      persists through the established settings workflow. Document character counting, truncation indication, and
      allowed values; changing the limit supports regeneration of all existing excerpts.
- [ ] Clipping at any supported boundary leaves valid, self-contained Markdown, including when the limit falls
      inside emphasis, a link label, an escape, or inline code. Required closing syntax does not consume the
      visible-text allowance, and the excerpt never splits a user-perceived Unicode character.
- [ ] Index files use `.md` and preserve complete supported inline Markdown. Truncated emphasis, backticks, links,
      code fences (backtick or tilde), and other block syntax cannot leak formatting or block structure across
      entries. Fall back to escaped/readable text when safe Markdown preservation is not possible.
- [ ] Specify and test how prior tag links in the same prefix, task markers, nested/ordered lists, and existing
      `Tags:` section declarations affect context text. Preserve the established tagging conventions.
- [ ] Adding/removing/moving a tag, changing its preceding text, or emptying/removing a note updates all affected
      indexes without duplicates or stale entries. Define cleanup for tags with no remaining occurrences.
- [ ] Existing content can be indexed and the derived files can be rebuilt after missing files, interrupted work,
      or external edits. Repeated maintenance with unchanged notes produces unchanged index contents.
- [ ] Maintenance uses explicit note dates, Markdown Snapshots, and revision information across async work. Older
      work cannot overwrite newer index entries; concurrent clients and partial failures converge through retry or
      reconciliation without losing occurrences from other dates.
- [ ] Index failure does not compromise Local Draft persistence or Daily Note sync; pending maintenance can recover
      after reconnect/restart without requiring a new note edit.
- [ ] Document the folder/file format, context rules, maintenance lifecycle, and any eventual-consistency limits.
      Resolve how occurrence positions are retained or reconstructed for #0019 without changing readable entry text.

## Verification

Use focused extraction tests for multiple tags, duplicate occurrences, same-line ordering, Unicode names, list and
heading prefixes, preceding-element fallback, section declarations, code exclusion, and empty context. Cover multiline
paragraphs and long list items, tags mid-line/mid-element, trailing text exclusion, repeated tags within an element,
unchanged excerpts after source rewrapping, and nested/multi-paragraph list boundaries.
Test limits below/at/above the excerpt length, Unicode boundaries, Markdown-safe clipping, settings validation and
default compatibility, persisted settings, and regeneration after a limit change. Include complete
and truncated inline formatting, reference links, fallback adjacent to fenced code, unmatched backticks/fences, and
syntax that could become a heading, list, table, or HTML block. Assert rendered structure and entry boundaries for the entire
generated file as well as individual fragments. Test deterministic
ordering across dates and idempotent rebuilds. Add mocked Drive request coverage for folder discovery/creation,
index reads/writes, auth, conflicts, pagination, and failures. Exercise interrupted updates, two-client maintenance,
external note edits, and stale date A work finishing after navigation to B. Follow repository verification rules;
routine coverage must not require a live Google account.

## Dependencies and related work

No hard dependency on another open issue. Builds on existing Reference Tags and Drive Sync. Supplies the maintained
data for [#0019](0019-browse-tag-index-and-open-instances.md). Folder name, file encoding/separators, and locator
representation should be finalized during implementation and recorded in the relevant reference documentation.

## Resolution

Pending.
