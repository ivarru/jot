# Project Notes

This is a lightweight parking lot for known issues, future work, and design questions that are not yet ready for an ADR or a dedicated implementation issue.

Use:

- `Known Issues` for observed behavior that should be fixed or deliberately accepted.
- `Future Work` for useful improvements that are not part of the current implementation pass.
- `Design Questions` for unresolved product or architecture decisions.

Move stable decisions to [`CONTEXT.md`](../CONTEXT.md) or [`docs/adr/`](adr/README.md). Remove items when they are implemented, rejected, or superseded.

Promote scoped actionable work to [local issues](../issues/README.md), then replace its entry here with a link or remove
it. Issue files own status and acceptance criteria; avoid maintaining the same task in both places.

## Known Issues

- No known issues are currently recorded here.

## Future Work

- Add an explicit cleanup workflow for Image Attachments that are no longer referenced by any Daily Note.
- Inventory app-created media in the Jot Image Album before deciding whether to recover missing Attachment Metadata, reuse image copies when metadata is absent, or remove album entries. This is related to metadata repair and future album cleanup.
- Consider deriving stored image filenames from a content hash rather than the Image Attachment ID. A content-addressed filename could make duplicate detection cheaper, but would need a deliberate migration.
- Add configurable Daily Note templates. New Daily Notes currently start empty.
- Add optional render-only support for useful Markdown extensions such as Mermaid diagrams, while keeping Daily Notes valid plain Markdown.
- Broaden browser/PWA regression coverage for offline shell loading, date navigation, system theme behavior, and local
  draft persistence across reload. Existing Chrome suites cover preview health, editor input and layout, Daily Note
  upload, reconnect conflicts, image upload, LaTeX, links, and clipboard behavior.
- Revisit whether Google Identity Services Authorization Code with PKCE can replace the current token-client flow cleanly on GitHub Pages.
- If `drive.file` prevents automatic discovery of an existing manually-created Jot Folder, use explicit user selection/opening or Google Picker, or create a new app-owned folder; do not broaden to full Drive scope by default.
- If static SolidStart output becomes a deployment or routing burden, reconsider whether plain Solid/Vite is a better fit.

## Design Questions

- Should Jot expose any Google Drive revision-history affordances, or should revision recovery remain entirely in Google Drive's own UI?
- Should Sync Conflicts get richer in-app resolution tools, or should Git-style conflict markers remain the only conflict-resolution surface?
- Should the app support a full Daily Note browser or search, or remain date-navigation-only for the foreseeable future?

### Personal and work separation (discussion, 2026-11-08)

**Status:** Unresolved. No implementation decision or scheduled feature work. The user may try separate Google accounts
for a while before deciding whether Jot needs another form of separation.

**Need:** Jot is used mainly for personal Daily Notes, but sometimes at work. The primary concern is accidentally
revealing sensitive personal information while using Jot among colleagues, rather than simply organizing notes.
The boundary is sometimes blurry: privately acquired knowledge can also be relevant to work.

A persistent, clearly visible Work mode was discussed. In that mode, personal content must not appear in the normal
note view. Tag-based saved views were initially suggested, but the user considers tags too fragile for this disclosure
risk. A convention that depends on consistently tagging mixed content would not provide the intended confidence.

Two alternatives were explored:

- **Separate Personal and Work collections under one Google account.** Each collection would have its own Daily Notes
  for each date, with Work mode selecting only the Work collection. An empty Work note would remain empty, without
  falling back to Personal content. Search, tag suggestions, previews, and date indicators would also be scoped to
  the active collection. Explicitly copying a suitable passage to Work could handle overlapping interests. This
  would avoid account switching, but the user observed that it is otherwise quite similar to using separate accounts.
- **One Daily Note with explicit Personal and Work content boundaries.** Jot could manage structural boundaries,
  rather than ordinary tags, and display only Work content in Work mode. This would keep a day's writing together
  without copying passages into another collection. It would require careful editing of a partial view without
  changing hidden content; raw Markdown mode would need to be unavailable or otherwise prevented from exposing the
  full mixed file. The boundary format and editing behavior were not designed or accepted.

For either in-app mode, the discussion identified possible safeguards: persist the mode across reloads/reopening,
show an unmistakable mode indicator, require a deliberate switch to reveal Personal content, clear old content
immediately on switching, and prevent pending asynchronous loads from restoring hidden content. Browser-local mode
persistence and consistent behavior across tabs in the same browser were suggested, so switching on another device
would not unexpectedly change the work computer's view. These are design considerations, not implemented guarantees.

A mode that limits Jot's display would address accidental disclosure through its interface; it would not restrict
access to Personal files through Google Drive when both collections share an account. Separate accounts remain an
option for a stronger storage/access boundary. The next step is experience with account separation, then revisiting
whether the inconvenience or overlap justifies separate collections or a protected partial view of mixed notes.
