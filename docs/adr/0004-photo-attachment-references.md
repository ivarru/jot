# Reference Image Attachments with markdown image syntax

Image Attachments will appear in Daily Notes as ordinary markdown image syntax with a `jot:image:<id>` target, where the ID is a Jot-generated ULID rather than a Google Photos or other storage-provider identifier. Full attachment details live in separate Attachment Metadata. This preserves visible placement in the plain markdown file without embedding Google Photos metadata or source-image provenance into the note text. The trade-off is that attachment images require Jot to resolve them, but outside editors can still show the attachment intent as normal markdown image markup.

The Google-backed Image Attachment flow uses the Google Photos Picker API to let the user select a Source Image, fetches the selected resolution while the Picker base URL is valid, uploads that copy through the append-only Google Photos Library API into a Jot-created album named `jot`, and stores one JSON Attachment Metadata file per Image Attachment in Drive `jot/Image Attachments`. Jot also stores the managed album ID in Drive so it does not need to search the user's Photos library during normal insertion.

Attachment Metadata records both sides: the Picker media item as Source Image provenance and the app-created Library media item as the durable Image Attachment copy. Removing a markdown reference from a Daily Note still does not delete the Image Attachment or remove it from the Jot Image Album.

Consequence: Google Photos separates picking, append-only upload, and app-created-library reads across different APIs and scopes. Album inventory, metadata recovery, cleanup of unreferenced Image Attachments, and any content-addressed filename migration are follow-up concerns rather than part of the core markdown reference decision.
