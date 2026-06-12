# Architecture Decision Records

This directory records durable architecture decisions for Jot. ADRs explain why the project chose a direction and what trade-offs follow from that choice.

## Relationship To Other Docs

- `CONTEXT.md` is the current domain language and invariant glossary. Update it when the app gains or sharpens a domain concept.
- `docs/adr/` records durable decisions and trade-offs. Add an ADR when future maintainers need to know why an alternative was rejected or when a decision should not be rediscovered in each review.
- `NOTES.md` is the volatile parking lot for known issues, future work, and open questions. Move task-like follow-ups there instead of keeping them in ADRs.

## Index

| ADR | Status | Scope |
| --- | --- | --- |
| [0001: Use SolidStart as a static PWA](0001-static-solidstart-pwa.md) | Accepted | Static app shape and framework choice. |
| [0002: Store Daily Notes as plain markdown source](0002-plain-markdown-source-of-truth.md) | Accepted | Daily Note storage model and source preservation. |
| [0003: Use CommonMark and GFM for Daily Notes](0003-jot-markdown-dialect.md) | Accepted | Jot Markdown portability baseline. |
| [0004: Reference Image Attachments with markdown image syntax](0004-photo-attachment-references.md) | Accepted | Image Attachment references, metadata, and storage-provider identity separation. |
| [0005: Host the static app on GitHub Pages](0005-github-pages-hosting.md) | Accepted | Hosting target and no-backend deployment constraints. |
| [0006: Render List Bullets with CSS](0006-render-list-bullets-with-css.md) | Accepted | WYSIWYG list marker rendering and cross-platform font consistency. |

## Maintenance

Keep ADRs stable after acceptance. If an implementation follow-up is completed, update `CONTEXT.md` for changed domain truth and prune `NOTES.md`; do not rewrite ADR history unless the decision itself has changed. If a decision is replaced, add a new ADR and mark the old one superseded in this index.
