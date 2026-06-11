# Jot

Jot is a static progressive web app for personal Daily Notes. Each Daily Note is a plain Markdown file named `YYYY-MM-DD.md`, stored in Google Drive under `jot/Daily Notes`, with one note per browser-local calendar date.

The app is built with SolidStart's static output path and is intended to run on GitHub Pages without a backend. It uses Google OAuth in the browser, Google Drive for notes/settings/metadata, and Google Photos for image attachment copies.

## Features

- Date-based navigation with ISO dates, weekday display, and a jump-to-today indicator.
- Milkdown WYSIWYG-style Markdown editing plus a plain text editor mode.
- Local drafts before Drive sync, configurable sync intervals, and Git-style conflict markers.
- Daily Note upload for existing `YYYY-MM-DD.md` files, with conflict choices when local or remote content already exists.
- System light/dark theme.
- Google Drive storage under the top-level `jot` folder.
- Managed Drive `AGENTS.md` describing the Drive folder structure for agents.
- Image attachments from Google Photos, device upload, camera, or clipboard paste.
- Jot-owned Google Photos album named `jot` for copied image attachments.
- Plain Markdown image references using `![alt](jot:image:<id>)`.
- Development-only fake storage, fake image flows, and browser smoke scripts for local testing.

## Local Development

Install dependencies:

```sh
npm install
```

Run routine checks:

```sh
npm run test
npm run typecheck
npm run build
```

Start a local development server:

```sh
npm run dev
```

## Environment

For Google-backed local preview, put the development OAuth client in `.env.local`:

```sh
VITE_GOOGLE_CLIENT_ID=your-dev-client-id.apps.googleusercontent.com
```

Then build and preview:

```sh
source .env.local
npm run build
npm run preview
```

For a local fake-storage preview:

```sh
VITE_ENABLE_FAKE_AUTH=true npm run build
npm run preview
```

`VITE_ENABLE_FAKE_AUTH=true` forces fake storage and fake image providers even when a Google client id is present. Normal production builds do not expose fake storage.

## GitHub Pages

For the full local Pages preflight:

```sh
BASE_PATH=/jot/ VITE_GOOGLE_CLIENT_ID=your-prod-client-id.apps.googleusercontent.com npm run verify:pages
```

`verify:pages` runs tests, typecheck, a Pages build, and artifact smoke checks. The production GitHub Actions workflow uses the same command and expects repository variable `VITE_GOOGLE_CLIENT_ID`.

See [docs/deployment.md](docs/deployment.md) for GitHub Pages setup, Google OAuth configuration, required APIs, and release checks.

## Image Attachments

Jot copies selected images into a Jot-created Google Photos album named `jot` at the chosen resolution. The Daily Note stores only a normal Markdown image reference with a `jot:image:<id>` target. Attachment metadata lives separately in Drive under `jot/Image Attachments`.

Manual Google Photos validation is tracked in [docs/manual-google-photos-retest.md](docs/manual-google-photos-retest.md).

## Architecture Notes

Project terminology and decisions are documented in:

- [CONTEXT.md](CONTEXT.md)
- [NOTES.md](NOTES.md) for known issues, future work, and unsettled design questions
- [docs/sync-model.md](docs/sync-model.md)
- [docs/adr](docs/adr)

The current deployment decision is captured in [docs/adr/0005-github-pages-hosting.md](docs/adr/0005-github-pages-hosting.md).
