# Tags

Jot tags are ordinary Markdown links with a reserved destination:

```md
[#architecture](jot:tag/architecture)
```

The visible `#architecture` label remains understandable in other Markdown editors, while the `jot:tag/` destination
lets Jot distinguish a tag from prose and normal links without adding custom Markdown syntax.

## Tagging Markdown Units

Put a tag at the end of a paragraph or list item to tag that unit:

```md
Review the synchronization invariants. [#architecture](jot:tag/architecture)

- Follow up on stale-date coverage. [#testing](jot:tag/testing)
```

To tag a section, put a `Tags:` paragraph immediately below its heading. It applies to the section introduced by that
heading, through the next heading of the same or higher level:

```md
## Storage design

Tags: [#architecture](jot:tag/architecture) [#drive](jot:tag/drive)

The section content starts here.
```

Do not put tags directly in heading text because doing so would affect the heading text and generated section-link slug.

## Adding Tags

Place the cursor where the tag should be inserted, then use the **Add tag** toolbar button or
<kbd>Ctrl</kbd>+<kbd>Alt</kbd>+<kbd>K</kbd> on Windows/Linux or
<kbd>Cmd</kbd>+<kbd>Option</kbd>+<kbd>K</kbd> on macOS. The extra Alt/Option modifier distinguishes tags from the
corresponding <kbd>Ctrl</kbd>+<kbd>K</kbd> or <kbd>Cmd</kbd>+<kbd>K</kbd> link shortcut. Names are lowercased and spaces
or underscores become hyphens.
Canonical names contain letters and numbers separated by single hyphens.
The cursor must be outside headings, existing links, and inline or fenced code.

As you type, the picker shows previously used tags whose canonical names start with the typed prefix. Use
<kbd>Down</kbd> and <kbd>Up</kbd> to move through the matches; the highlighted match fills the input and can be added
with <kbd>Enter</kbd>.

In WYSIWYG mode, tags render as tinted chips. The stored text is still the ordinary Markdown link shown above.

## Suggestions

The tag picker suggests tags encountered in Daily Notes opened in the current browser and tags inserted through the
picker. The suggestion catalog is browser-local convenience state; it is not synced, is cleared on sign-out, and is not
part of any Daily Note.

Use the × control on a suggestion to hide a mistaken or unwanted entry. Hiding a suggestion never edits tag links
already present in Daily Notes. If the tag is deliberately inserted again through the tag picker, it returns to the
suggestion catalog.

## Compatibility

The convention is valid CommonMark/GFM and is preserved by Milkdown as a normal link. Outside Jot, software that does
not understand the `jot:tag/` destination still displays a readable `#tag` link label. Jot recognizes the destination
as the tag identity; the visible link label is presentation.

## Synced tag indexes

Jot maintains derived Markdown files under `jot/tag-index/` in Google Drive, one `<canonical-name>.md` per tag.
Daily Note Markdown remains the source of truth. Index files are generated and may be replaced or trashed during
maintenance; do not use them to edit tags or store additional content. The Tag Suggestion Catalog remains separate.
Use **Browse tags** in the app menu to browse these indexes and jump to a tag instance.

Each occurrence occupies one physical line, starting with the note's `YYYY-MM-DD` date and a space followed by its
excerpt. Two trailing spaces make entries render on separate lines in Markdown. Date-only entries are permitted.
Lines sort ascending by date, then tag source offset within the note. Repeated occurrences remain separate, including
identical excerpts. Within a date, the line's ordinal for that tag is the occurrence locator; a future navigator must
reparse the current note rather than assume an excerpt or old offset uniquely identifies an occurrence.

Excerpts start at the beginning of the tagged Markdown element and end before that particular tag, excluding text
after it. A paragraph uses its opening text; a list item includes its direct paragraphs but excludes nested lists
and sibling items. Nested items have their own context. Headings and table cells use their own inline content, even
inside a list item. Source soft wraps and paragraph breaks within an item become spaces. List, heading, and task markers are omitted,
as are other Reference Tag links in the prefix. A standalone tag uses the nearest preceding element with usable
text. A `Tags:` declaration containing only tags uses this preceding context, normally its section heading. Code
blocks and link definitions are not fallback elements. Both sides of conflict-preserved Markdown can contribute;
Jot's conflict wrapper lines are excluded from excerpt prose without changing occurrence offsets.

Complete emphasis, strong emphasis, strikethrough, links, and inline code are retained. Reference links are resolved
into inline links using the first definition for each normalized identifier, matching CommonMark; optional link
titles are omitted. Images contribute alt text rather than loading an image.
HTML is escaped as readable text, and code fences are never copied as index structure. Extraction and clipping use
parsed inline content followed by Markdown serialization, so formatting cannot remain open across entries.

Settings → **Tag index** controls **Maximum excerpt length (characters)**, default 200, with whole-number values
from 1 through 2000. The limit counts visible Unicode grapheme clusters, excluding the date, link destinations,
and formatting syntax. Clipped excerpts end with `…`, which counts toward the limit; closing Markdown syntax does
not count. Changing the saved limit regenerates all excerpts on the next maintenance pass. **Rebuild tag index**
requests an immediate reconciliation and the status reports pending, updating, up to date, or retrying.

Maintenance runs after sign-in/settings load, after selected-note sync, departed-note background saves, or uploads, when connectivity returns, and
periodically at the clean-polling interval (minimum five seconds). Only successfully synced content is indexed;
Local Drafts and editor changes awaiting sync do not contribute. No page needs to open each historical note.
Unchanged note media is cached by Drive file ID and revision for the page lifetime; metadata scans still detect
external edits/deletions, and index files are read to detect missing or altered generated content.

Index maintenance is independent of Daily Note Replication. A failed index update does not fail a successful note
save. It retries automatically (at least five seconds between failed passes), and startup reconciliation repairs
interrupted work even without another edit. It never writes source notes. Obsolete tag files are conditionally
trashed, and duplicate generated files are reconciled. Concurrently created index folders are scanned together;
duplicate folders may remain and are treated as one logical index collection, with one file per tag.

Drive cannot atomically update a note and all affected tag files together. Source revisions and the saved excerpt
limit are checked before and after index writes, and existing targets use ETag-conditional writes. Races retry with
fresh source/target metadata, with up to three attempts per pass; continued changes or failures are retried later.
Indexes are therefore eventually consistent while a signed-in page can reach Drive. They can temporarily be stale
or partially rebuilt, particularly while offline or during concurrent edits. Reopening Jot or rebuilding reconciles
all app-visible synced notes with the current saved limit. Drive's existing `drive.file` access rules still apply.

## Browsing tag instances

Open **Browse tags** from the menu, optionally filter the tag names, then choose a tag. The list shows ISO dates,
formatted excerpts, and an instance number within each date, in index order. Every row is a button that opens the
Daily Note and selects/scrolls to that particular Reference Tag. Excerpt links retain their styling but do not
navigate; activating them opens the row's tag instance. The list works with keyboard Tab/Enter and on narrow screens.
Escape or the close button returns focus to the menu button. Refresh reloads tag names; choosing a tag reloads its
index. Empty or unavailable data has a message and retry controls; missing indexes can be rebuilt in Settings.

Opening a row goes through normal Daily Note navigation and preserves pending edits. It also works within the
already open note and in both WYSIWYG and raw Markdown modes. The indexed list still describes synced content;
target resolution uses the current loaded note, which may include local edits. If a clean cached note is still
refreshing from Drive, navigation waits for that existing refresh before resolving the instance; it does not consume
the target against the older cached content or start a duplicate refresh. WYSIWYG navigation also waits for the
target editor to finish its initial focus, so initialization cannot override the jump.

The resolver compares the current tag/excerpt sequence with the indexed sequence for that date. If they match,
the row's ordinal selects the instance, including repeated identical excerpts. If the sequence changed, it can
relocate a uniquely matching context, allowing formatting changes and the excerpt's original clipping limit. It
refuses to guess when matching contexts are ambiguous or an indexed duplicate may have been removed. The note
still opens, with an explicit notice when the selected instance cannot be resolved. Refresh/rebuild the index or
locate the tag in that note. The plain index format cannot distinguish an undetectable reorder of identical
instances whose count and excerpt sequence remain identical; their current document order defines their ordinals.
