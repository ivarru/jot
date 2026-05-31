# Project Notes

This is a lightweight parking lot for known issues, future work, and design questions that are not yet ready for an ADR or a dedicated implementation issue.

Use:

- `Known Issues` for observed behavior that should be fixed or deliberately accepted.
- `Future Work` for useful improvements that are not part of the current implementation pass.
- `Design Questions` for unresolved product or architecture decisions.

Move stable decisions to `CONTEXT.md` or `docs/adr/`. Remove items when they are implemented, rejected, or superseded.

## Known Issues

- Google Drive file uploads do not expose a compare-and-swap write control that Jot can rely on for plain `.md` files. The app can detect stale revisions before writing and after later refreshes, but the final Drive media update is not known to be atomic against a near-simultaneous writer.

## Future Work

- Add an explicit cleanup workflow for Image Attachments that are no longer referenced by any Daily Note.
- Inventory app-created media in the Jot Image Album before deciding whether to reuse image copies or remove album entries. This is related to duplicate detection and future album cleanup.
- Consider deriving stored image filenames from a content hash rather than the Image Attachment ID. A content-addressed filename could make duplicate detection cheaper, but would need a deliberate migration.
- Add configurable Daily Note templates. New Daily Notes currently start empty.
- Add optional render-only support for useful Markdown extensions such as Mermaid diagrams, while keeping Daily Notes valid plain Markdown.
- Add Playwright browser/PWA smoke tests covering mocked auth, app-shell/editor load, offline shell loading, date navigation, system theme behavior, local draft persistence across reload, and basic editor typing.
- Revisit whether Google Identity Services Authorization Code with PKCE can replace the current token-client flow cleanly on GitHub Pages.
- If `drive.file` prevents automatic discovery of an existing manually-created Jot Folder, use explicit user selection/opening or Google Picker, or create a new app-owned folder; do not broaden to full Drive scope by default.
- If static SolidStart output becomes a deployment or routing burden, reconsider whether plain Solid/Vite is a better fit.

## Design Questions

- Should Jot expose any Google Drive revision-history affordances, or should revision recovery remain entirely in Google Drive's own UI?
- Should Sync Conflicts get richer in-app resolution tools, or should Git-style conflict markers remain the only conflict-resolution surface?
- Should the app support a full Daily Note browser or search, or remain date-navigation-only for the foreseeable future?
