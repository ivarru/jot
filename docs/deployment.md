# Deployment

This document covers the GitHub Pages release path for Jot. The checked-in workflow builds and verifies the static artifact; final account-level setup still has to be done in GitHub and Google Cloud.

## Build

Jot uses SolidStart 2 with Vite 8 and Nitro's static deployment preset.
Framework/build options live in `vite.config.ts`; there is no running app
server in the deployed Pages artifact. Use the pinned Node version in
`.node-version` (24.16.0); the toolchain requires Node 24 or newer.
Nitro 3 is currently a beta dependency, pinned exactly for reproducible builds.
Prerender failures fail the build instead of publishing an incomplete shell.

Static prerendering starts a local loopback worker. In a restricted development
sandbox, run verification with permission to bind loopback ports.

GitHub Pages project hosting serves Jot below `/jot/`, so production Pages builds use:

```sh
BASE_PATH=/jot/ npm run build:pages
npm run test:artifact
```

`npm run build:pages` writes the static app to `.output/public`. `npm run test:artifact` validates the generated Pages
artifact without starting the preview server and verifies that it contains:

- `.nojekyll`
- `index.html`
- `manifest.webmanifest`
- `sw.js`
- `icons/icon.svg`
- `_build/assets`
- `/jot/`-based asset, manifest, and icon references
- relative service-worker app-shell paths

## GitHub Actions

`.github/workflows/deploy.yml` runs on pushes to `master` and manual dispatches. It runs:

```sh
npm ci
npm run verify:pages
```

The preflight includes Vitest, typecheck, the full fake-provider browser suite, the Pages build, and artifact validation.
See [testing.md](testing.md) for the test layers and CI coverage matrix.

The workflow uploads `.output/public` with GitHub's Pages artifact action and deploys it through GitHub Pages.

Before the first deployment, configure GitHub Pages to use GitHub Actions and add one of these repository-level values:

- Repository variable `VITE_GOOGLE_CLIENT_ID`
- Repository secret `VITE_GOOGLE_CLIENT_ID`

The value is the Google OAuth web client id.

## Google Cloud

Enable these APIs in the Google Cloud project that owns the OAuth client:

- Google Drive API
- Google Photos Picker API
- Google Photos Library API

Create or update a Web application OAuth client.

For local preview, add:

- Authorized JavaScript origin: `http://127.0.0.1:4173`
- Authorized redirect URI: `http://127.0.0.1:4173/`

If Vite falls back to another local port because `4173` is occupied, add that exact origin and redirect URI temporarily as well, or stop the process occupying `4173` and keep testing on the documented URL.

For GitHub Pages, add:

- Authorized JavaScript origin: `https://<github-owner>.github.io`
- Authorized redirect URI: `https://<github-owner>.github.io/jot/`

The redirect URI is exact. Jot's same-tab fallback computes it from the current browser origin and pathname, without the hash route, so project Pages must use the trailing-slash `/jot/` URI.

If the OAuth consent screen remains in Testing mode, add the Google account used for Jot as a test user.

## OAuth And Photos Notes

Jot uses Google Identity Services token popups first. If a browser cannot open the popup, Jot falls back to a full-page OAuth redirect and stores the returned access token in tab-scoped `sessionStorage` until expiry. Signing out clears the token. Three minutes before actual token expiry, Jot uses the still-valid token to synchronize all unsynced drafts, if any, then tries a no-UI renewal even when the session is already clean. If Google requires interaction, Jot discards the old cached token, reports whether all edits were synchronized, and asks the user to reconnect with a fresh token.

For image insertion, Jot creates a Google Photos Picker session, opens a picker tab during the user action, and keeps an explicit `Open Google Photos` link as fallback. Active picker session state is stored in tab-scoped `sessionStorage` so returning from Google Photos can resume the import flow.

## PWA Notes

`public/sw.js` is intentionally static. It caches the app shell and same-origin GET responses, then falls back to the cached shell for offline navigations. Cache names include the installation base path and a manual version. Activation removes only obsolete versions in
that namespace. Shared legacy `jot-shell-vN` caches are retained; matching installation entries can migrate without
deleting neighboring applications' caches. Offline lookup uses only the active installation cache. Bump the worker
cache version when changing shell behavior or release expectations.

The manifest uses `start_url: "."` and relative icon paths so it works under the `/jot/` project path.

## Release Checklist

Before pushing a release commit:

```sh
BASE_PATH=/jot/ VITE_GOOGLE_CLIENT_ID=your-client-id.apps.googleusercontent.com npm run verify:pages
```

Before enabling the GitHub Actions deployment, confirm:

1. Repository Pages is set to deploy from GitHub Actions.
2. Repository variable or secret `VITE_GOOGLE_CLIENT_ID` exists.
3. The Google OAuth client has the production Pages origin and redirect URI.
4. Drive, Photos Picker, and Photos Library APIs are enabled in the same Google Cloud project.

After the first Pages deployment:

1. Open `https://<github-owner>.github.io/jot/`.
2. Sign in with Google.
3. Verify today's Daily Note loads and syncs.
4. Edit text and confirm Drive sync returns to `Synced`.
5. Insert an image from Google Photos and confirm it renders in Milkdown.
6. Reload and confirm the note and image preview still render.
7. Install the PWA where supported and confirm the app shell loads after a reload.

Use [manual-google-provider-retest.md](manual-google-provider-retest.md) for the fuller real-account OAuth, token-renewal,
Drive, and Google Photos checks.

## Account-bound local notes

Before accepting a candidate Google token, Jot requests only `user.permissionId` from Drive `about.get`, using the
existing `drive.file` scope. The opaque identifier binds this browser's local notes to one account. It is not an email
address or a new authorization scope. See Google's [about.get reference](https://developers.google.com/workspace/drive/api/reference/rest/v3/about/get)
and [User resource](https://developers.google.com/workspace/drive/api/reference/rest/v3/User).
A different account is rejected before editor entry or sync. To switch, sign in with the original account and use
Sign out, including its warning about deleting unsynced local data. Account binding is removed with successful draft
clearing. Notes from before this check require an explicit ownership confirmation; canceling leaves them untouched.
Provider instances/caches and their pending methods are bound to their initiating token session. Candidate tokens
from popup, redirect, cache restore, and renewal must pass account verification before data-provider use. Tab-scoped
proof containing only a token digest, account identifier, and epoch allows an exact previously verified, still-valid
token to reopen local notes offline. An unverified replacement token still needs online identity verification; sign-out
or invalidation clears the proof, and an epoch/account mismatch makes old proof unusable. No live
provider identity or account-switch validation has been performed; the maintained checks mock Google's responses.

Image imports retain their originating auth session through preparation, download, upload, album creation, and metadata
writes. Sign-out clears image operation state and stops camera streams; new sign-in/reconnect attempts retire older
UI continuations. A canceled operation cannot continue with replacement-session credentials. Google may already have
accepted a submitted request, so cancellation does not promise remote rollback; a partial import can leave an app-created
image or album without a note reference. Routine coverage uses mocks and Chrome workflows, not live provider writes.
