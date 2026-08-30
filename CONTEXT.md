# Jot Domain Context

This file describes Jot's high-level domain context and shared vocabulary in the domain-driven-design sense. Consult it
when naming product concepts, clarifying invariants, or deciding whether different parts of the code refer to the same
domain idea. It is not an implementation map, task list, or substitute for the more specific documents indexed in
[docs/README.md](docs/README.md).

Jot is a personal note-taking context centered on calendar-bound writing.

## Language

**Daily Note**:
A markdown document for one calendar date in the user's current browser-local timezone. There is at most one **Daily Note** per date, and the markdown text is the source of truth.
_Avoid_: Log, journal entry, note

**Selected Date**:
The browser-local calendar date whose **Daily Note** is currently open. It is displayed as `YYYY-MM-DD`, with the day of week and whether it is today.
_Avoid_: Current date, file date, active day

**Jot Folder**:
The top-level app-owned folder in the user's Google Drive. It contains Jot's own content and organizational subfolders.
_Avoid_: Root folder, workspace, app folder

**Daily Notes Folder**:
The folder inside the **Jot Folder** that contains **Daily Notes**.
_Avoid_: Notes directory, markdown folder

**Image Attachment**:
A Jot-owned copy of an image included from an external source at a user-selected resolution. An **Image Attachment** belongs to the **Jot Image Album**, and removing it from a **Daily Note** does not delete it.
_Avoid_: Photo attachment, linked image, embedded original, Google Photos reference

**Image Attachment ID**:
A stable Jot-generated ULID for an **Image Attachment**. It is used in `jot:image:<id>` references and is independent of storage-provider identifiers.
_Avoid_: Google Photos ID, media item ID, file ID

**Source Image**:
The original external image from which an **Image Attachment** was copied. It is provenance metadata for the **Image Attachment**, not the content that a **Daily Note** depends on.
_Avoid_: Source photo, original attachment, linked image

**Jot Image Album**:
The Google Photos album managed by Jot for **Image Attachments**. Jot stores the album ID in the **Jot Folder** and adds app-created image copies to the album.
_Avoid_: Attachments folder, image cache

**Attachment Reference**:
An ordinary markdown image marker in a **Daily Note** that identifies where an **Image Attachment** belongs in the note using a `jot:image:<Image Attachment ID>` target.
_Avoid_: Embedded metadata, photo manifest entry, copied photo URL

**Attachment Metadata**:
Jot-owned information about one **Image Attachment**, including its selected copy and any **Source Image** provenance. It is stored as one JSON file per **Image Attachment** in the **Image Attachments Folder**, separately from the **Daily Note** text.
_Avoid_: Note metadata, front matter, image markdown

**Image Attachments Folder**:
The folder inside the **Jot Folder** that contains **Attachment Metadata** JSON files for **Image Attachments**.
_Avoid_: Photos folder, media folder, album folder

**Editor Mode**:
The way the whole **Daily Note** is currently edited: either WYSIWYG mode or plain text mode. Both modes edit the same
markdown source; WYSIWYG mode parses and serializes that source rather than becoming a separate source of truth.

**Markdown Structure**:
The ordinary markdown constructs in a **Daily Note**, such as paragraphs, headings, lists, links, and image references.
_Avoid_: Block model, outline model, projected document

**Jot Markdown**:
The markdown dialect expected for **Daily Notes**: CommonMark with GitHub Flavored Markdown extensions. Optional render-only extensions may be supported when they remain valid fenced code or ordinary markdown text.
_Avoid_: Custom markdown, proprietary markdown, app markdown

**Plain Markdown File**:
A normal `.md` file that can be read and edited outside Jot. A **Daily Note** is stored as a Plain Markdown File.
_Avoid_: App-private document, projected file, proprietary note

**Source Preservation**:
The expectation that Jot keeps a non-empty **Daily Note**'s markdown text intact except for edits the user explicitly
makes. A document containing only whitespace has no visible note content and is canonicalized to the empty string when
persisted. Existing whitespace-only notes are deliberately not scanned or rewritten; canonicalization happens when a
later persistence operation receives their content.
_Avoid_: Autoformatting, normalization, markdown rewriting

**Reference Tag**:
An ordinary markdown link in a **Daily Note** whose `jot:tag/<canonical-name>` destination associates a reusable name
with a paragraph, list item, or section. The visible label convention is `#<canonical-name>`.
_Avoid_: Hashtag, label metadata, custom inline node

**Tag Suggestion Catalog**:
Browser-local convenience state containing previously encountered or inserted **Reference Tags**. Removing an entry
from the catalog hides the suggestion without editing any **Daily Note**. Signing out clears the catalog so it cannot
carry tag names or dismissals into another account.
_Avoid_: Tag index, synced tag database, note metadata

**Sync Conflict**:
A state where the local and remote versions of a **Daily Note** have both changed since the last successful save. A **Sync Conflict** preserves both versions in the **Daily Note** text using Git-style conflict markers.
_Avoid_: Overwrite, failed save, silent merge

**Local Draft**:
The locally persisted state of a **Daily Note** that protects edits from browser suspension, navigation, offline use, or failed remote saves.
_Avoid_: Cache, autosave buffer, unsaved text

**Drive Sync**:
Replication between a **Local Draft** and the corresponding Google Drive file for a **Daily Note**.
_Avoid_: Save, backup, upload

**Daily Note Replication**:
The safety-critical coordination of Local Draft persistence, Drive Sync, and visible editor state for one explicit date,
markdown snapshot, and remote baseline. It must preserve dirty content and surface a Sync Conflict rather than silently
replace a newer Daily Note.
_Avoid_: Sync pipeline, sync service, note save

**Jot Settings**:
Jot-owned configuration that applies across the app, including Drive Sync timing. It is separate from **Daily Notes**.
_Avoid_: User preferences, note settings, config cache

**Daily Note Upload**:
Importing external Plain Markdown Files named `YYYY-MM-DD.md` into their matching **Daily Notes**. Upload planning compares against visible editor content, Local Drafts, and Drive Sync state before applying a conflict choice.
_Avoid_: Bulk sync, restore, migration
