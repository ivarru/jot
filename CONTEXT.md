# Jot

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

**Active Unit**:
The markdown unit of a **Daily Note** currently being edited as markdown text, such as a paragraph, heading, list item, or image reference. It is based on markdown structure, not visual wrapping.
_Avoid_: Active line, current block, focused paragraph

**Rendered Unit**:
A markdown unit of a **Daily Note** that is displayed as formatted markdown when it is not the **Active Unit**.
_Avoid_: Rendered line, preview block, rich text block

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
The expectation that Jot keeps a **Daily Note**'s markdown text intact except for edits the user explicitly makes.
_Avoid_: Autoformatting, normalization, markdown rewriting

**Sync Conflict**:
A state where the local and remote versions of a **Daily Note** have both changed since the last successful save. A **Sync Conflict** preserves both versions in the **Daily Note** text using Git-style conflict markers.
_Avoid_: Overwrite, failed save, silent merge

**Local Draft**:
The locally persisted state of a **Daily Note** that protects edits from browser suspension, navigation, offline use, or failed remote saves.
_Avoid_: Cache, autosave buffer, unsaved text

**Drive Sync**:
Replication between a **Local Draft** and the corresponding Google Drive file for a **Daily Note**.
_Avoid_: Save, backup, upload

**Jot Settings**:
Jot-owned configuration that applies across the app, including Drive Sync timing. It is separate from **Daily Notes**.
_Avoid_: User preferences, note settings, config cache

**Daily Note Upload**:
Importing external Plain Markdown Files named `YYYY-MM-DD.md` into their matching **Daily Notes**. Upload planning compares against visible editor content, Local Drafts, and Drive Sync state before applying a conflict choice.
_Avoid_: Bulk sync, restore, migration

## Example Dialogue

Dev: If the user opens Jot just after midnight while traveling, which Daily Note should appear?

Domain expert: The Daily Note for the user's current local calendar date.

Dev: Can the user open a Daily Note other than today's?

Domain expert: Yes. The user chooses the Selected Date, including past and future dates.

Dev: Where does a Daily Note live?

Domain expert: In the Daily Notes Folder inside the Jot Folder.

Dev: If an image from Google Photos is included in a Daily Note, does Jot reference the original image?

Domain expert: No. Jot keeps an Image Attachment copy at the selected resolution in the Jot Image Album.

Dev: If the image is removed from the Daily Note, should Jot delete the Image Attachment?

Domain expert: No. Deleting the reference from the Daily Note does not delete the Image Attachment.

Dev: Can Jot always detect that a picked Google Photos image is already in the Jot Image Album?

Domain expert: Not from the current picker and album APIs alone. Future album cleanup and metadata-recovery work should inventory app-created media in the Jot Image Album before deciding whether to reuse or remove anything.

Dev: If an Image Attachment was copied from Google Photos, does Jot remember the original?

Domain expert: Yes, as Source Image metadata. The Daily Note still depends on the Image Attachment, not the Source Image.

Dev: Is the ID in `jot:image:<id>` a Google Photos media item ID?

Domain expert: No. It is an Image Attachment ID generated by Jot.

Dev: Does the Daily Note contain all details about an Image Attachment?

Domain expert: No. The Daily Note contains an Attachment Reference; Attachment Metadata is kept separately.

Dev: What does an Attachment Reference look like in a Daily Note?

Domain expert: It uses ordinary markdown image syntax with a `jot:image:<id>` target.

Dev: Is a Daily Note edited as rich text?

Domain expert: Only partly. The Active Unit is edited as markdown text, while other units are shown as Rendered Units.

Dev: Is the markdown file generated from a richer internal document model?

Domain expert: No. The Daily Note markdown is the source of truth and may use normal Markdown Structure, not only bullets.

Dev: Which markdown dialect should a Daily Note use?

Domain expert: Jot Markdown: CommonMark with GitHub Flavored Markdown extensions, plus optional render-only support that remains ordinary markdown text.

Dev: Can a Daily Note be read outside Jot?

Domain expert: Yes. It is stored as a Plain Markdown File.

Dev: Should Jot reformat the Daily Note when saving?

Domain expert: No. Source Preservation means Jot changes only what the user explicitly edits.

Dev: If the same Daily Note changes locally and remotely, should one version silently win?

Domain expert: No. The Daily Note should show a Sync Conflict that preserves both versions.

Dev: Is saving to Google Drive the first durability boundary for edits?

Domain expert: No. A Local Draft protects edits first; Drive Sync replicates them remotely.

Dev: Where do sync timing settings belong conceptually?

Domain expert: In Jot Settings, not in Daily Notes.

Dev: How should existing markdown notes be brought into Jot?

Domain expert: Use Daily Note Upload with files named for their target dates, so conflicts are planned through the same Daily Note and Drive Sync rules as ordinary editing.
