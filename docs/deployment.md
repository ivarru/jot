# Deployment

This document covers the GitHub Pages release path for Jot. The checked-in workflow builds and verifies the static artifact; final account-level setup still has to be done in GitHub and Google Cloud.

## Build

GitHub Pages project hosting serves Jot below `/jot/`, so production Pages builds use:

```sh
BASE_PATH=/jot/ npm run build:pages
npm run smoke:pages
```

`npm run build:pages` writes the static app to `.output/public`. `npm run smoke:pages` runs the Playwright Pages artifact check without starting the preview server, and verifies that the artifact contains:

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

Jot uses Google Identity Services token popups first. If a browser cannot open the popup, Jot falls back to a full-page OAuth redirect and stores the returned access token in tab-scoped `sessionStorage` until expiry. Signing out clears the token.

For image insertion, Jot creates a Google Photos Picker session, opens a picker tab during the user action, and keeps an explicit `Open Google Photos` link as fallback. Active picker session state is stored in tab-scoped `sessionStorage` so returning from Google Photos can resume the import flow.

## PWA Notes

`public/sw.js` is intentionally static. It caches the app shell and same-origin GET responses, then falls back to the cached shell for offline navigations. Because `CACHE_NAME` is manual, bump it when changing the service worker's app-shell behavior or release expectations.

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
