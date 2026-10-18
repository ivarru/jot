import { expect, test } from "@playwright/test";

for (const changeDateWhileVerifying of [false, true]) {
  test(`OAuth redirect restores its date before routing${changeDateWhileVerifying ? " and preserves navigation during verification" : ""}`, async ({ page }) => {
    await page.addInitScript(() => {
      (window as unknown as Record<string, unknown>).__JOT_TEST_GOOGLE_AUTH__ = true;
    });
    await page.route("https://accounts.google.com/gsi/client", route => route.fulfill({
      contentType: "text/javascript",
      body: `const client = { callback() {}, error_callback() {}, requestAccessToken() {
        client.error_callback({type: "popup_failed_to_open"});
      }}; window.google = {accounts: {oauth2: {initTokenClient: () => client}}};`
    }));
    await page.route("https://accounts.google.com/o/oauth2/v2/auth?*", route => {
      const params = new URL(route.request().url()).searchParams;
      const target = new URL(params.get("redirect_uri")!);
      target.hash = new URLSearchParams({ access_token: "synthetic-redirect-token", expires_in: "3600", state: params.get("state")! }).toString();
      return route.fulfill({ status: 302, headers: { location: target.href } });
    });
    let releaseVerification!: () => void;
    const verificationGate = new Promise<void>(resolve => { releaseVerification = resolve; });
    let verificationStarted!: () => void;
    const started = new Promise<void>(resolve => { verificationStarted = resolve; });
    await page.route("https://www.googleapis.com/drive/v3/about?*", async route => {
      verificationStarted();
      if (changeDateWhileVerifying) await verificationGate;
      await route.fulfill({ json: { user: { permissionId: "synthetic-redirect-account" } } });
    });
    await page.goto("/#/date/2030-02-03");
    await page.getByRole("button", { name: "Sign in with Google" }).click();
    if (changeDateWhileVerifying) {
      await Promise.race([started, new Promise((_, reject) => setTimeout(() => reject(new Error("Redirect token was not consumed")), 10_000))]);
      await expect(page).toHaveURL(/#\/date\/2030-02-03$/);
      await page.evaluate(() => { window.location.hash = "/date/2030-02-04"; });
      await expect(page).toHaveURL(/#\/date\/2030-02-04$/);
      releaseVerification();
    }
    await expect(page.getByRole("region", { name: "Daily note editor" })).toBeVisible();
    await expect(page).toHaveURL(new RegExp(`#/date/2030-02-0${changeDateWhileVerifying ? "4" : "3"}$`));
    expect(page.url()).not.toContain("access_token");
  });
}
