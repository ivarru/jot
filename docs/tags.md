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

Place the cursor where the tag should be inserted, then use the **Tag** toolbar button or
<kbd>Ctrl</kbd>+<kbd>Alt</kbd>+<kbd>K</kbd> on Windows/Linux or
<kbd>Cmd</kbd>+<kbd>Option</kbd>+<kbd>K</kbd> on macOS. The extra Alt/Option modifier distinguishes tags from the
corresponding <kbd>Ctrl</kbd>+<kbd>K</kbd> or <kbd>Cmd</kbd>+<kbd>K</kbd> link shortcut. Names are lowercased and spaces
or underscores become hyphens.
Canonical names contain letters and numbers separated by single hyphens.
Inside a heading or code block, insertion creates a paragraph immediately after that element. Inside a link or
inline code, insertion moves just after it. Enclosing list items and block quotes are retained.
The unified **Tags** dialog still permits browsing when insertion is unavailable.

The **Tag** toolbar button and its shortcut open the **Tags** dialog. One **Tag or filter** field accepts a new
name and filters indexed tags by prefix. The dialog stays anchored near the top of the viewport as its contents
change. Refresh progress appears in the title as **Tags (refreshing…)**. The button beside the field says **Create**
for a new name or **Use** when the normalized name exactly matches an indexed tag;
it inserts that name. The action is hidden when the field is empty and disabled when invalid.
Each matching row has a separate **Use** for its exact tag. Successful insertion closes the dialog and returns the
caret to the editor after the tag. The note date, source snapshot, and selection captured at opening guard insertion;
if the note changes, adding is disabled while browsing remains available.

<kbd>Tab</kbd> completes the longest shared prefix of matching tags (the whole name for one match). If there is no
extension, Tab traverses normally. <kbd>Down</kbd>/<kbd>Up</kbd> move a secondary highlight among Create/Use actions while
keeping typing focus and the query in the field. <kbd>Enter</kbd> adds the highlighted row's tag, or the field's value
by default. Changing the query or completing resets that highlight; sorting and unchanged refreshes retain the
highlighted tag by identity. Neither action expands an index.

The close control and <kbd>Escape</kbd> restore the editor's captured caret/selection in either mode, without
later callbacks overwriting a new selection. Escape is consumed inside the dialog. Fullscreen Escape behavior
can vary by browser, platform, and fullscreen mode. Chromium uses Keyboard Lock when available and permitted,
releasing it on close. The user reports that Firefox on macOS closes the dialog without leaving fullscreen.
The automated Firefox DOM-fullscreen experiment instead exited fullscreen before delivering Escape to the page;
that observation is not a general Firefox limitation. If Escape leaves fullscreen in a particular environment,
use the visible close control to close the dialog while retaining fullscreen.

In WYSIWYG mode, tags render as tinted chips. The stored text is still the ordinary Markdown link shown above.

## Suggestions

The dialog combines a browser-cached list from synced index files with tags in the captured open-note snapshot
and dirty local drafts, retaining recently seen local notes for the page session while indexes catch up. It orders by index change timestamps (newest first), using local-note change times for tags without an index. **Alphabetical order** toggles alphabetical sorting in the dialog;
the toggle is shared for the current page session. Equal or unknown modification dates use tag-name order.

Opening Tags from either entry point refreshes the list asynchronously while cached tags stay available. Index maintenance
from this page also refreshes the list, including after partial failures. Failed refreshes retain cached tags
and show an error with retry controls. The cache is cleared on sign-out. Local tags become suggestions on refresh without waiting for sync or index generation.
Reference-style tag links are included using the first matching Markdown definition, just like index generation.
Only remote index metadata is cached; local suggestions are rebuilt from local note content. There is no suggestion-dismissal control: removing a tag's
last synced occurrence deletes its empty index, and the tag disappears on refresh once local content no longer uses it.

## Compatibility

The convention is valid CommonMark/GFM and is preserved by Milkdown as a normal link. Outside Jot, software that does
not understand the `jot:tag/` destination still displays a readable `#tag` link label. Jot recognizes the destination
as the tag identity; the visible link label is presentation.

## Synced tag indexes

Jot maintains derived Markdown files under `jot/daily-notes-tag-index/` in Google Drive, one `<canonical-name>.md` per tag.
Daily Note Markdown remains the source of truth. Index files are generated and may be replaced or trashed during
maintenance; do not use them to edit tags or store additional content. Their metadata supplies the shared Tag Catalog.
Use **Tag** in the editor toolbar to browse these indexes and jump to a tag instance.

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

Open **Tag** from the editor toolbar or its keyboard shortcut. Each matching tag row shows a styled tag chip
and a **Changed** timestamp in the current browser-local time zone (`YYYY-MM-DD HH:mm`), or Unknown. Its tooltip
explains that a tag may have been added, removed, or its tagged text changed. Local-only tags use the local note
change time; expanded occurrences remain based on synced indexes and can be empty until synchronization.
A row tooltip explains its expansion action. Click the row outside its Use button to expand/collapse its occurrences. Several tags can be expanded independently;
each has its own lazy load, errors, and retry. Index metadata changes invalidate cached occurrences and reload
expanded rows, including when a previously local-only tag gets its first index. Cached metadata remains visible during refreshes or outages.

Expanded occurrences show newest note dates first, retaining occurrence order within each date. Repeated dates after
the first entry use a weaker foreground color (40% alpha), while excerpts and controls remain fully opaque. Visible
instance numbers are omitted; internal ordinals still identify repeated occurrences. Each occurrence opens the Daily
Note and selects/scrolls to its Reference Tag. Excerpt links retain their styling but do not navigate elsewhere;
activating them opens that occurrence. Missing/empty indexes have feedback and can be rebuilt in Settings.

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

## Tags in note search

Search supports removable tag conditions with suggestions from the Tag Catalog. Add each tag with **Add tag** or
Enter. All selected tags must apply to one matching paragraph or list item; search words must also match within
that passage. Tags declared immediately after a heading in a `Tags:` paragraph apply throughout that section and
its subsections, ending at the next heading of the same or higher level. Direct paragraph/list-item tags do not
apply to siblings or nested list items. Heading levels determine scope, not heading numbering.

Search words may be empty when at least one tag is selected. Existing date bounds still apply. Search first lists
Drive candidates, then reads their exact Markdown snapshots to check structural associations. Tag-only searches can
therefore read many notes. Generated Tag Index excerpts are not used as authoritative filters. Results remain grouped
by Daily Note, with tagged previews showing the first qualifying passage. Like ordinary search, this covers synced
content; tag filtering does not search unsynced drafts. Changing conditions or closing discards pending results.

Table cells are independent matching units: a tag in one cell does not qualify text in another cell, including cells
in the same row. Section declarations inside a blockquote apply within that quote and inherit outer section tags;
their scope does not escape the quote. Markdown hard breaks separate words when matching phrases.
Reference-style tags use document-wide definitions, including definitions nested inside lists or blockquotes;
when an identifier has multiple definitions, the first in source order wins.

## Adding tags from search results

Expand a search result and choose **Add tags to passage…**. Jot shows the first matching paragraph or list item
before any edit, with suggestions from the Tag Catalog. Choose one or more tags, then **Apply tags**. A tag already
attached to the unit or inherited from a containing section is skipped. Headings and section declarations are not
tagging targets; this action does not tag an entire section or multiple search results. Table cells are individual units.

For ordinary text search, the passage must contain all search words; for tag-filtered searches it must also satisfy
all selected tag conditions. If no such paragraph/list item exists, the action reports that no target is available.
The preview updates after applying tags, and the selected date stays unchanged. Edits to the open note use its normal
undo history and autosave; other dates use an exclusive editing lease, checked local persistence, and normal Drive Sync.

The full source snapshot is revalidated before background edits. Changed remote content, newer local drafts, conflicts,
or another page editing the date prevent an overwrite. Use **Refresh passage** to review the latest target before
trying again. A failed remote save retains the tagged local draft for normal sync recovery. Search results remain
snapshots; rerun Search to refresh result metadata and conditions after edits.
Headings and `Tags:` declarations establish section scope but are not matching passages themselves. A tag-only search
previews the first qualifying body passage; a section with no such content contributes no search result.
