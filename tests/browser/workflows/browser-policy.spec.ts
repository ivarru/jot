import { expect, test } from "@playwright/test";
import { clickButton, openDevelopmentStorage, setRawMarkdown, switchToWysiwygMode, wysiwygEditor } from "../helpers/editor";
import { waitForSavedImageMarkdown } from "../helpers/idb";

test.use({ launchOptions: { args: ["--use-fake-device-for-media-stream", "--use-fake-ui-for-media-stream"] } });

// Deliver a synthetic GIS implementation through the real approved script URL,
// rather than installing window.google before the page's CSP can evaluate it.
async function installGoogleRoutes(page: import("@playwright/test").Page, redirect: boolean) {
  await page.addInitScript(() => {
    (window as unknown as Record<string, unknown>).__JOT_TEST_GOOGLE_AUTH__ = true;
    (window as unknown as Record<string, unknown>).__unexpectedPolicyViolations = [];
    document.addEventListener("securitypolicyviolation", event => {
      ((window as unknown as Record<string, unknown>).__unexpectedPolicyViolations as string[]).push(`${event.effectiveDirective}: ${event.blockedURI}`);
    });
  });
  await page.route("https://accounts.google.com/gsi/client", route => route.fulfill({ contentType: "text/javascript", body: `
    const client = { callback() {}, error_callback() {}, requestAccessToken() {
      ${redirect ? 'client.error_callback({type: "popup_failed_to_open"});' : 'window.open("about:blank", "synthetic-policy-popup"); queueMicrotask(() => client.callback({access_token: "synthetic-policy-token", expires_in: 3600}));'}
    }};
    window.google = {accounts: {oauth2: {initTokenClient: () => client, revoke: (_token, done) => done()}}};
  ` }));
  await page.route("https://www.googleapis.com/drive/v3/about?*", route => route.fulfill({ json: { user: { permissionId: "synthetic-policy-account" } } }));
}

test("shipped policy permits approved GIS script, native popup, token gate and editing", async ({ page }) => {
  await installGoogleRoutes(page, false);
  await page.goto("/#/date/2030-02-02");
  await expect(page.locator('meta[http-equiv="content-security-policy"]')).toHaveCount(1);
  const popupPromise = page.waitForEvent("popup");
  await page.getByRole("button", { name: "Sign in with Google" }).click();
  const popup = await popupPromise;
  expect(await popup.evaluate(() => window.opener !== null)).toBe(true);
  await popup.close();
  await expect(page.getByRole("region", { name: "Daily note editor" })).toBeVisible();
  await setRawMarkdown(page, "Synthetic signed-in policy note\n\n$$\\sqrt{2}$$");
  await switchToWysiwygMode(page);
  await expect(wysiwygEditor(page).locator(".katex svg")).toBeVisible();
  expect(await page.evaluate(() => (window as unknown as Record<string, unknown>).__unexpectedPolicyViolations)).toEqual([]);
});

test("shipped policy permits blocked-popup OAuth redirect and token-fragment cleanup", async ({ page }) => {
  await installGoogleRoutes(page, true);
  let redirected = false;
  await page.route("https://accounts.google.com/o/oauth2/v2/auth?*", route => {
    redirected = true;
    const params = new URL(route.request().url()).searchParams;
    const target = new URL(params.get("redirect_uri")!);
    target.hash = new URLSearchParams({ access_token: "synthetic-redirect-policy-token", expires_in: "3600", state: params.get("state")! }).toString();
    return route.fulfill({ status: 302, headers: { location: target.href } });
  });
  await page.goto("/#/date/2030-02-03");
  await page.getByRole("button", { name: "Sign in with Google" }).click();
  await expect(page.getByRole("region", { name: "Daily note editor" })).toBeVisible();
  expect(redirected).toBe(true);
  expect(page.url()).not.toContain("access_token");
  expect(page.url()).toContain("#/date/2030-02-03");
  expect(await page.evaluate(() => (window as unknown as Record<string, unknown>).__unexpectedPolicyViolations)).toEqual([]);
});

test("shipped policy permits Photos/API/media requests and documents strict referrers", async ({ page }) => {
  await page.goto("/");
  const endpoints = [
    "https://photospicker.googleapis.com/v1/sessions/synthetic",
    "https://photoslibrary.googleapis.com/v1/mediaItems/synthetic",
    "https://oauth2.googleapis.com/revoke",
    "https://accounts.google.com/gsi/status"
  ];
  const seen: { url: string; referer?: string }[] = [];
  for (const endpoint of endpoints) await page.route(endpoint, route => {
    seen.push({ url: route.request().url(), ...('referer' in route.request().headers() ? { referer: route.request().headers().referer } : {}) });
    return route.fulfill({ contentType: "application/json", body: '{}', headers: { "access-control-allow-origin": "*" } });
  });
  await page.route("https://lh3.googleusercontent.com/synthetic=w1200", route => route.fulfill({ contentType: "image/svg+xml", body: '<svg xmlns="http://www.w3.org/2000/svg" width="2" height="2"/>', headers: { "access-control-allow-origin": "*" } }));
  const result = await page.evaluate(async endpoints => {
    const requests = await Promise.all(endpoints.map(async url => (await fetch(url)).ok));
    const blob = await (await fetch("https://lh3.googleusercontent.com/synthetic=w1200")).blob();
    const url = URL.createObjectURL(blob);
    try {
      const image = new Image();
      image.src = url;
      await image.decode();
      return { requests, width: image.naturalWidth };
    } finally { URL.revokeObjectURL(url); }
  }, endpoints);
  expect(result).toEqual({ requests: [true, true, true, true], width: 2 });
  expect(seen).toHaveLength(4);
  expect(seen.every(request => request.referer === new URL(page.url()).origin + "/")).toBe(true);
});

test.describe("camera policy compatibility", () => {
  test("shipped policy permits a native synthetic camera capture and saved image", async ({ page, context }) => {
    await context.grantPermissions(["camera"]);
    await openDevelopmentStorage(page, "/", "disabled");
    await clickButton(page, "Insert image");
    await page.getByRole("menuitem", { name: "Use camera" }).click();
    const video = page.locator(".camera-capture-panel video");
    await expect(video).toBeVisible();
    await expect.poll(() => video.evaluate(element => (element as HTMLVideoElement).videoWidth)).toBeGreaterThan(0);
    await page.getByRole("button", { name: "Capture", exact: true }).click();
    await expect(page.locator(".image-attachment-import input[type=text]")).toBeVisible();
    await page.locator(".image-attachment-import input[type=text]").fill("Synthetic camera policy image");
    await page.locator(".image-attachment-sizes button").first().click();
    const image = page.locator(".milkdown-root img[data-jot-image-id]");
    await expect(image).toBeVisible();
    await expect(image).toHaveAttribute("alt", "Synthetic camera policy image");
    await expect.poll(() => image.evaluate(element => (element as HTMLImageElement).naturalWidth)).toBeGreaterThan(0);
    expect(await waitForSavedImageMarkdown(page)).toContain("![Synthetic camera policy image](jot:image:");
  });
});
