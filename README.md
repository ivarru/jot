# Jot

Static PWA for daily markdown notes. The first milestone uses a development-only fake storage provider so the editor, local drafts, settings, and sync state can be built before Google OAuth and Drive are wired.

## Commands

```sh
npm install
npm run test
npm run typecheck
npm run build
```

For a static preview with the fake storage sign-in enabled:

```sh
VITE_ENABLE_FAKE_AUTH=true npm run build
npm run preview
```

The normal production build does not expose fake storage.

For a local Google Drive integration test, create an OAuth client for a web application in Google Cloud, add the local preview origin, and set:

```sh
VITE_GOOGLE_CLIENT_ID=your-client-id.apps.googleusercontent.com
```

The app requests the narrow `drive.file` scope and does not persist OAuth access tokens.

For GitHub Pages project hosting, build with a base path:

```sh
BASE_PATH=/jot/ npm run build
```
