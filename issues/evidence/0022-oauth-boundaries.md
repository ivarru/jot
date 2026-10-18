# OAuth boundary review reproduction probes

Reviewed commit: `3c1f8c2de6a77b5f8c344be2ad0526771a58646d` (app `0.33.8`).
These are investigation probes, intentionally asserting boundaries the reviewed code does not enforce.
They are archived as Markdown so ordinary CI stays green; they are not fixes or passing regression coverage.
All credentials, account labels, notes, files, and endpoints below are synthetic or mocked. No live account was used.

## Replay

In an otherwise clean checkout of the reviewed revision with dependencies installed, copy the first code block into
`src/auth/oauthBoundaryReview.probe.test.ts` and the second into
`tests/browser/workflows/oauth-boundary-review.probe.spec.ts`. Run:

```sh
./node_modules/.bin/vitest run src/auth/oauthBoundaryReview.probe.test.ts --reporter=verbose
./node_modules/.bin/playwright test tests/browser/workflows/oauth-boundary-review.probe.spec.ts
```

Expected at the reviewed revision: Vitest reports **6 failed / 3 passed**; Chrome reports **1 failed** because the
pending callback restores the editor. These failures reproduce the gaps in local issues #0028–#0030.
Remove only the two temporary files created above afterward. The browser runner owns and stops its local preview.
Do not run production builds concurrently with the browser preview. For remediation, promote the relevant probes
into the closest maintained test suites before fixing production code; add realistic account/provider coverage.
The replication model does not include Google token callbacks, provider identity, or Photos imports, so these probes
use the real token provider, IndexedDB store, replication core, Drive/Photos clients, and attachment flow instead.

The unit probes model account A/B through distinct synthetic bearer tokens and mocked provider responses; they prove
outgoing client request content/headers, not Google accepting a cross-account write. The image probe holds a response
body across a session change and observes the upload request; the fake batch-create response is not evidence that
Google accepts an account A album under account B. The browser probe emits the exact cross-tab epoch signal used by
sign-out, rather than testing Google's real popup or revocation service.

## Unit/integration probes

```ts
import "fake-indexeddb/auto";
import { GoogleIdentityTokenProvider } from "./googleIdentity";
import { GoogleDriveStorageProvider } from "~/storage/googleDriveStorage";
import { IndexedDbLocalDraftStore } from "~/storage/localDraftStore";
import { SessionGuardedDraftStore } from "~/storage/sessionGuardedDraftStore";
import { syncDailyNote } from "~/sync/dailyNoteReplication/replicationCore";
import { ImageAttachmentFlow } from "~/attachments/imageAttachmentFlow";
import { GooglePhotosAttachmentProvider } from "~/photos/googlePhotosAttachments";
import { resolveImageAttachmentResolution } from "~/domain/imageAttachments";

function installGoogle() {
  const client = { callback: (_: { access_token?: string; expires_in?: number }) => {}, requestAccessToken: vi.fn() };
  window.google = { accounts: { oauth2: { initTokenClient: () => client, revoke: (_: string, done: () => void) => done() } } };
  return client;
}
function json(value: unknown) { return new Response(JSON.stringify(value), { headers: { "Content-Type": "application/json" } }); }
afterEach(async () => {
  vi.useRealTimers();
  delete window.google;
  sessionStorage.clear(); localStorage.clear();
  window.history.replaceState(null, "", "/");
  await new IndexedDbLocalDraftStore().clearAll();
});

it.each(["invalidate", "revoke"])("rejects a late callback after %s", async (action) => {
  const client = installGoogle();
  const provider = new GoogleIdentityTokenProvider("review-client", ["scope"]);
  await provider.initialize();
  const pending = provider.getAccessToken({ interactive: true });
  await vi.waitFor(() => expect(client.requestAccessToken).toHaveBeenCalled());
  if (action === "revoke") await provider.revoke(); else provider.invalidateAccessToken();
  client.callback({ access_token: "synthetic-late-token", expires_in: 3600 });
  await pending.catch(() => undefined);
  expect(sessionStorage.getItem("jot.googleAccessToken.review-client")).toBeNull();
});

it("rejects a token callback after the request timeout", async () => {
  vi.useFakeTimers();
  const client = installGoogle();
  const provider = new GoogleIdentityTokenProvider("review-client", ["scope"]);
  await provider.initialize();
  const pending = provider.getAccessToken({ interactive: true }).catch(() => undefined);
  await Promise.resolve(); await Promise.resolve();
  await vi.advanceTimersByTimeAsync(120001);
  await pending;
  client.callback({ access_token: "synthetic-timed-out-token", expires_in: 3600 });
  expect(sessionStorage.getItem("jot.googleAccessToken.review-client")).toBeNull();
});

it("rejects an outstanding redirect after another tab signs out", () => {
  const provider = new GoogleIdentityTokenProvider("review-client", ["scope"]);
  let target = "";
  provider.redirectForAccessToken({}, url => { target = url; });
  const state = new URL(target).searchParams.get("state");
  localStorage.setItem("jot.accountEpoch", "signed-out-generation");
  provider.invalidateAccessToken();
  window.history.replaceState(null, "", `/#access_token=synthetic-old-session&state=${state}&expires_in=3600`);
  expect(provider.consumeRedirectAccessToken().type).toBe("error");
});

it.each(["missing", "expired", "replayed"])("rejects %s redirect state and removes the token fragment", kind => {
  const provider = new GoogleIdentityTokenProvider("review-client", ["scope"]);
  if (kind !== "missing") sessionStorage.setItem("jot.googleOAuthRedirect.state", JSON.stringify({createdAtMs: kind === "expired" ? Date.now()-600001 : Date.now(), hash: "#/date/2030-02-02"}));
  const url = "/#access_token=synthetic-token&state=state&expires_in=3600";
  window.history.replaceState(null, "", url);
  if (kind === "replayed") {
    expect(provider.consumeRedirectAccessToken().type).toBe("authenticated");
    provider.invalidateAccessToken();
    window.history.replaceState(null, "", url);
  }
  expect(provider.consumeRedirectAccessToken().type).toBe("error");
  expect(window.location.hash).not.toContain("access_token");
  expect(sessionStorage.getItem("jot.googleAccessToken.review-client")).toBeNull();
});

it("does not upload retained account A drafts with an account B token", async () => {
  const client = installGoogle();
  client.requestAccessToken.mockImplementation(() => client.callback({ access_token: "synthetic-account-A", expires_in: 3600 }));
  const oldTokens = new GoogleIdentityTokenProvider("review-client", ["scope"]);
  await oldTokens.getAccessToken({ interactive: true });
  const drafts = new SessionGuardedDraftStore(new IndexedDbLocalDraftStore(), localStorage);
  await drafts.save({ date: "2030-02-02", markdown: "synthetic private account A note", baselineMarkdown: "", baselineRevisionId: null, dirty: true, updatedAt: new Date().toISOString() });
  oldTokens.invalidateAccessToken();
  client.requestAccessToken.mockImplementation(() => client.callback({ access_token: "synthetic-account-B", expires_in: 3600 }));
  const tokens = new GoogleIdentityTokenProvider("review-client", ["scope"]);
  await tokens.getAccessToken({ interactive: true });
  drafts.adoptCurrentEpoch();
  const folder = (id: string, name: string) => ({id, name, mimeType: "application/vnd.google-apps.folder", version: "1", modifiedTime: "2030-01-01T00:00:00.000Z"});
  const responses = [json({ files: [folder("B-root", "jot")] }), json({ files: [{id: "B-agents", name: "AGENTS.md", mimeType: "text/markdown", modifiedTime: "2099-01-01T00:00:00.000Z"}] }), json({ files: [folder("B-daily", "Daily Notes")] }), json({ files: [] }), json({id: "B-note", name: "2030-02-02.md", version: "1", modifiedTime: "2030-01-01T00:00:00.000Z"})];
  const uploads: RequestInit[] = [];
  const fetchFn = vi.fn(async (url: RequestInfo | URL, init?: RequestInit) => {
    if (String(url).includes("/upload/")) uploads.push(init!);
    const response = responses.shift(); if (!response) throw new Error("unexpected request"); return response;
  });
  const remote = new GoogleDriveStorageProvider(tokens, fetchFn as typeof fetch);
  await syncDailyNote("2030-02-02", drafts, remote, {canContinue: () => drafts.hasCurrentEpoch()});
  expect(uploads.filter(init => new Headers(init.headers).get("Authorization") === "Bearer synthetic-account-B" && String(init.body).includes("synthetic private account A note"))).toEqual([]);
});

it("does not upload an old-session image with a replacement session token", async () => {
  let token = "synthetic-account-A";
  let release!: () => void;
  const held = new Promise<void>(resolve => { release = resolve; });
  let started!: () => void;
  const start = new Promise<void>(resolve => { started = resolve; });
  const uploads: RequestInit[] = [];
  const fetchFn = vi.fn(async (url: RequestInfo | URL, init?: RequestInit) => {
    if (String(url).startsWith("https://lh3.googleusercontent.com/")) { started(); await held; return new Response("synthetic-private-image", {headers: {"Content-Type": "image/jpeg"}}); }
    if (String(url).endsWith("/uploads")) { uploads.push(init!); return new Response("synthetic-upload-token"); }
    return json({newMediaItemResults: [{mediaItem: {id: "synthetic-copy"}}]});
  });
  const photos = new GooglePhotosAttachmentProvider({ getAccessToken: async () => token }, fetchFn as typeof fetch);
  const metadata = { loadJotImageAlbum: async () => ({version: 1 as const, albumId: "synthetic-album-A", title: "jot", createdAt: "2030-01-01T00:00:00.000Z"}), saveJotImageAlbum: async () => {}, loadImageAttachmentMetadata: async () => null, findImageAttachmentMetadataByMediaItemId: async () => null, saveImageAttachmentMetadata: async () => {} };
  const flow = new ImageAttachmentFlow(photos, metadata);
  const pending = flow.importPickedImage({picked: {id: "synthetic-source-A", type: "PHOTO", mediaFile: {baseUrl: "https://lh3.googleusercontent.com/p/review", mimeType: "image/jpeg"}}, selectedResolution: resolveImageAttachmentResolution("original"), altText: "review"});
  await start;
  localStorage.setItem("jot.accountEpoch", "signed-out");
  token = "synthetic-account-B";
  release(); await pending;
  expect(uploads.filter(init => new Headers(init.headers).get("Authorization") === "Bearer synthetic-account-B")).toEqual([]);
});
```

## Chrome probe

```ts
import { expect, test } from "@playwright/test";

test("a pending Google sign-in cannot undo another tab's sign-out", async ({ page, context }) => {
  await page.addInitScript(() => {
    const reviewWindow = window as Window & { __JOT_TEST_GOOGLE_AUTH__?: boolean; __reviewDeliverToken?: () => void };
    reviewWindow.__JOT_TEST_GOOGLE_AUTH__ = true;
    const client = { callback: (_: unknown) => {}, requestAccessToken() {} };
    reviewWindow.__reviewDeliverToken = () => client.callback({access_token: "synthetic-pending-token", expires_in: 3600});
    window.google = { accounts: { oauth2: {initTokenClient: () => client, revoke: (_: string, done: () => void) => done()} } };
  });
  await page.goto("/#/date/2030-02-02");
  await page.getByRole("button", {name: "Sign in with Google"}).click();
  await expect(page.getByRole("button", {name: "Signing in..."})).toBeVisible();
  const second = await context.newPage();
  await second.goto("/");
  // Use the exact account-epoch signal emitted by clearForSignOut in another tab.
  await second.evaluate(() => localStorage.setItem("jot.accountEpoch", "synthetic-signed-out-epoch"));
  await expect.poll(() => page.evaluate(() => localStorage.getItem("jot.accountEpoch"))).toBe("synthetic-signed-out-epoch");
  // A round trip after the storage-event task makes the invalidation observable
  // before the deliberately delayed provider callback is released.
  await page.evaluate(() => new Promise<void>(resolve => setTimeout(resolve, 0)));
  await page.evaluate(() => (window as Window & {__reviewDeliverToken?: () => void}).__reviewDeliverToken!());
  await expect(page.getByRole("button", {name: "Sign in with Google"})).toBeVisible();
});
```
