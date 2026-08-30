# Jot

Jot is a static progressive web app for personal Daily Notes. Each Daily Note is a plain Markdown file named `YYYY-MM-DD.md`, stored in Google Drive under `jot/Daily Notes`, with one note per browser-local calendar date.

The app is built with SolidStart's static output path and is intended to run on GitHub Pages without a backend. It uses Google OAuth in the browser, Google Drive for notes/settings/metadata, and Google Photos for image attachment copies.

**NB:** Experimental software and development process. Use at your own risk.

## Limitations

Google access may occasionally require an interactive reconnect when authorization expires. Jot continues protecting
edits in Local Drafts on the device, but cannot synchronize them with Google Drive until access is restored.

Drive synchronization operates on whole Markdown files; it is not real-time collaborative editing. If the same Daily
Note changes independently on multiple devices, Jot may require the user to resolve a Sync Conflict that preserves both
versions. See [Sync and Connection Statuses](docs/sync-and-connection-statuses.md) for the detailed behavior.

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
- Portable reference tags using `[#tag](jot:tag/tag)`, with WYSIWYG chips and browser-local suggestions.
- Development-only fake storage, fake image flows, and real-browser regression tests.

## Local Development

Install dependencies:

```sh
npm install
```

### Choose storage

`npm run dev` uses browser-local fake storage by default, so ordinary local development does not need Google credentials:

```sh
npm run dev
```

To develop against real Google storage, put a development OAuth client in `.env.local`:

```sh
VITE_GOOGLE_CLIENT_ID=your-dev-client-id.apps.googleusercontent.com
```

With that variable present, `npm run dev` uses Google-backed storage. For a built local preview with the same
non-production OAuth client, run:

```sh
npm run preview:test:oauth
```

Set `VITE_ENABLE_FAKE_AUTH=true` to force fake storage and fake image providers even when a Google client ID is present.
The explicit fake-provider preview used by browser tests is also available directly:

```sh
npm run preview:test:fake
```

Both preview commands serve the app at `http://127.0.0.1:4173`. Normal production builds do not expose fake storage.

### Verify changes

Run routine unit, integration, type, and build verification:

```sh
npm run verify
```

Playwright browser regressions complement those checks by exercising native editing and selection, clipboard, camera,
file-input and layout behavior, OAuth-like flows, and synchronization interactions against fake providers. Run the
complete browser suite with:

```sh
npm run test:browser
```

Use `npm run verify:full` for routine verification plus all browser regressions. Because browser tests are relatively
slow, focused commands are useful during development. See [Testing](docs/testing.md) for the test layers, focused
commands, environment, and CI coverage matrix.

## GitHub Pages

For the full local Pages preflight:

```sh
BASE_PATH=/jot/ VITE_GOOGLE_CLIENT_ID=your-prod-client-id.apps.googleusercontent.com npm run verify:pages
```

`verify:pages` runs tests, typecheck, all fake-provider browser regressions, a Pages build, and artifact validation. The
production GitHub Actions workflow uses the same command and expects repository variable `VITE_GOOGLE_CLIENT_ID`.

See [docs/deployment.md](docs/deployment.md) for GitHub Pages setup, Google OAuth configuration, required APIs, and release checks.

## Image Attachments

Jot copies selected images into a Jot-created Google Photos album named `jot` at the chosen resolution. The Daily Note stores only a normal Markdown image reference with a `jot:image:<id>` target. Attachment metadata lives separately in Drive under `jot/Image Attachments`.

Manual Google OAuth, Drive, and Photos validation is tracked in
[docs/manual-google-provider-retest.md](docs/manual-google-provider-retest.md).

## Working on Jot

Repository guidance is divided by purpose:

- [AGENTS.md](AGENTS.md) contains repository rules for contributors and coding agents.
- [Documentation index](docs/README.md) describes the subject, authority, and purpose of every project document.

The current deployment decision is captured in [docs/adr/0005-github-pages-hosting.md](docs/adr/0005-github-pages-hosting.md).
