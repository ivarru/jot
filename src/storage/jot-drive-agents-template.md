This is the source template for the automatically managed Google Drive `jot/AGENTS.md` file; it is not repository guidance for coding agents.
Template modified: 2026-05-29T08:19:54.000Z

# Agent Notes for the jot Drive Folder

This file is managed automatically by the Jot web app. The app updates this Drive file when the bundled template modification date is newer than this file's Google Drive modification date.

Do not add personal agent directions here. They may be replaced by a future template update; change the source template in the Jot repository instead.

## Folder Structure

- `Daily Notes/` contains daily note Markdown files named `YYYY-MM-DD.md`.
- `Image Attachments/` contains one JSON metadata file per image attachment, named `<jot-image-id>.json`.
- `settings.json` stores app settings.
- `image-album.json` stores metadata for the managed Google Photos album.

## Daily Notes

- Daily notes are plain Markdown files.
- There should be at most one daily note per local date.
- Markdown image targets of the form `jot:image:<id>` refer to images in the Google Photos album `jot`.
- The `<id>` in `jot:image:<id>` maps to `Image Attachments/<id>.json`.
- Image attachment metadata records source and copied Google Photos media item ids when available.
- Do not replace `jot:image:<id>` references with Google Photos URLs in daily notes.
