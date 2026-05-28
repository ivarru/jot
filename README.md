# Jot

Static PWA for daily markdown notes. The first milestone includes a development-only fake storage provider so the editor, local drafts, settings, sync state, and image attachment flow can be exercised without Google OAuth, Drive, or Photos.

## Commands

```sh
npm install
npm run test
npm run typecheck
npm run build
```

For a static preview with fake storage enabled:

```sh
VITE_ENABLE_FAKE_AUTH=true npm run build
npm run preview
npm run smoke:preview
```

The explicit `VITE_ENABLE_FAKE_AUTH=true` build uses fake storage even if `VITE_GOOGLE_CLIENT_ID` is also present in your environment. The normal production build does not expose fake storage.

For a local Google Drive integration test, create an OAuth client for a web application in Google Cloud, add the local preview origin, and set:

```sh
VITE_GOOGLE_CLIENT_ID=your-client-id.apps.googleusercontent.com
```

The app requests the narrow `drive.file` scope and does not persist OAuth access tokens.
When it creates the Drive `jot` folder, it also creates a `README.md` in that folder explaining that Jot manages the folder and that daily notes remain plain Markdown files that can be edited manually if necessary.

The Google sign-in also requests Google Photos Picker access, append-only Library access, and read access to app-created Google Photos media items. Jot uses the Picker API to select a source image, copies the chosen resolution into a Jot-created Google Photos album named `jot`, stores attachment metadata as JSON in Drive `jot/Image Attachments`, and inserts a plain markdown `jot:image:<id>` reference. The editor resolves those references back to Google Photos image previews at runtime.

For GitHub Pages project hosting, build with a base path:

```sh
BASE_PATH=/jot/ npm run build
```
