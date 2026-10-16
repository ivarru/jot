---
id: "0019"
title: "Browse tag indexes and jump to Reference Tag instances"
status: open
type: feature
priority: medium
created: "2026-10-16"
labels: [tags, navigation]
---

# Browse tag indexes and jump to Reference Tag instances

## Problem and evidence

Per-tag index files make occurrences available across Daily Notes, but users also need an interface for finding a
tag's instances and opening the relevant passage rather than manually locating dates and text.

## Outcome and scope

Provide an accessible interface to choose a Reference Tag, browse its indexed occurrences with ISO dates and context
text, and jump to the corresponding occurrence in its Daily Note. Use the maintained indexes from
[#0018](0018-maintain-tag-index-files.md). Preserve their ascending date and within-note position order, including
multiple instances in one note with identical context text.

Choose the entry point and layout during implementation. This issue covers presenting and navigating the index;
creation and maintenance of the Drive files are handled separately by #0018.

## Acceptance criteria

- [ ] Users can discover and open the tag-index interface, select a tag, and browse its occurrences.
- [ ] Each occurrence shows its ISO note date and extracted context, in the index's defined order.
- [ ] Show element-opening excerpts as generated under the configured length limit. Clipped or identical excerpts
      must not be used as unique occurrence identifiers; navigation still targets the original tag instance.
- [ ] Present supported inline Markdown from the `.md` indexes consistently with Jot's rendering, keeping each
      occurrence visually distinct. Embedded links must not interfere with the action for opening that occurrence;
      settle and test their interaction behavior during implementation.
- [ ] Activating an occurrence opens the correct Daily Note and brings the corresponding tag instance into view.
      Repeated instances within one note remain distinguishable and targetable.
- [ ] Navigation uses the existing date-bound editor workflow and preserves pending edits in the previously open
      note. Navigation within the already open note also reaches the selected instance.
- [ ] If a note has changed since indexing, resolve against its current content where possible. Handle removed or
      ambiguous instances explicitly rather than silently targeting an unrelated passage; opening the note remains
      possible when an exact occurrence cannot be found.
- [ ] Loading, empty indexes, unavailable/stale data, and retry states are understandable. Unsynced editor content
      is not represented as guaranteed indexed content.
- [ ] Keyboard operation, focus restoration, narrow screens, and scrolling to the selected occurrence work in the
      supported browsers. User-facing controls avoid exposing storage/provider implementation details.

## Verification

Add focused tests for tag selection, occurrence ordering, repeated contexts, stale locators, and removed instances.
Browser workflows should select an occurrence, assert the resulting date and visible target, and cover both editor
modes, the already open note, and navigation while an earlier date's persistence/sync work is pending. Include mobile
layout and keyboard navigation. Follow repository verification rules with a fake provider for routine coverage.

## Dependencies and related work

Depends on [#0018](0018-maintain-tag-index-files.md) for the maintained indexes and agreed occurrence locator contract.
Related: [#0017](0017-daily-note-drive-search.md) provides date navigation and read-only preview patterns that may be
reused where appropriate. Existing Reference Tag behavior is documented in [Tags](../docs/tags.md).

## Resolution

Pending.
