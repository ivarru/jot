# Manual Google Photos Retest

Use this checklist when validating the Google-backed image attachment flow with a real Google account.

## Setup

1. Build with the Google client ID in the shell environment:

   ```sh
   set -a
   source .env.local
   set +a
   npm run build
   npm run preview
   ```

2. Open the preview URL printed by `npm run preview`.
3. Confirm the auth screen shows `Sign in with Google`, not `Use development storage`.

## OAuth

1. Click `Sign in with Google`.
2. Complete Google OAuth with the test account.
3. Confirm the daily note editor loads for the selected date.
4. Confirm Google consent includes Drive file access, Google Photos Picker access, append-only Google Photos Library access, and app-created Google Photos read access.

## Image Insertion

1. Click `Insert image`.
2. Pick an image in Google Photos.
3. Confirm the selected-image panel appears with:
   - editable alt text,
   - only size choices smaller than the original plus full size,
   - a `Cancel` button,
   - the top `Insert image` button disabled while choosing.
4. Change the alt text.
5. Click one size choice.
6. Confirm the Daily Note markdown contains `![alt text](jot:image:<id>)`.
7. Confirm Milkdown renders the image, not just the alt text.
8. Confirm Drive contains metadata under `jot/Image Attachments`.
9. Confirm Google Photos contains the copied image in the `jot` album.

## Reuse

1. Insert the same original image again.
2. Confirm the UI offers `Insert existing image`, not size choices.
3. Insert it with different alt text.
4. Confirm the markdown uses the same `jot:image:<id>` reference with the new alt text.

## Expiry/Refresh

Google Photos media item `baseUrl` values expire. For a targeted check, leave a note with a rendered image open for at least 55 minutes and confirm the preview remains visible after the automatic refresh window.
