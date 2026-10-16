This is the source template for the automatically managed Google Drive `jot/AGENTS.md` file; it is not repository guidance for coding agents.
Template modified: 2026-10-16T19:00:00.000Z
The generated Google Drive file starts after this marker.

--- jot-drive-agents-content ---

# Agent Notes for the jot Drive Folder

This file is managed automatically by the Jot web app. The app updates this Drive file when the bundled template modification date is newer than this file's Google Drive modification date.

Do not add personal agent directions here. They may be replaced by a future template update; change the source template in the Jot repository instead.

## Folder Structure

- `Daily Notes/` contains daily note Markdown files named `YYYY-MM-DD.md`.
- `Image Attachments/` contains one JSON metadata file per image attachment, named `<jot-image-id>.json`.
- `tag-index/` contains generated per-tag Markdown indexes named `<canonical-name>.md`.
- `settings.json` stores app settings, including the tag index excerpt limit (default 200 characters).
- `image-album.json` stores metadata for the managed Google Photos album.

## Daily Notes

- Daily notes are plain Markdown files.
- There should be at most one daily note per local date.
- Jot uses the Google Drive `drive.file` permission, so files manually created or uploaded directly into Drive might not be visible to the app until they are created or explicitly selected through Jot.
- To add existing notes to Jot, use the app's Upload daily notes menu item with files named `YYYY-MM-DD.md`.
- Markdown image targets of the form `jot:image:<id>` refer to images in the Google Photos album `jot`.
- The `<id>` in `jot:image:<id>` maps to `Image Attachments/<id>.json`.
- Image attachment metadata records the source type, such as Google Photos picker, device upload, camera, or clipboard.
- Image attachment metadata records source and copied Google Photos media item ids when available.
- Do not replace `jot:image:<id>` references with Google Photos URLs in daily notes.

## Generated Tag Indexes

- Daily Note Markdown is the source of truth; tag indexes are rebuildable, eventually consistent projections.
- Do not edit index files to change notes or tags, or store additional user content in the index folder.
- Each occurrence is a dated Markdown line, ordered by note date and source position. Repeated occurrences are kept.
- Excerpts use the opening text of the tagged Markdown element, stopping before the tag and at the configured limit.
- Index failures do not fail note saves. A signed-in Jot page retries and can rebuild missing or stale files.
