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
