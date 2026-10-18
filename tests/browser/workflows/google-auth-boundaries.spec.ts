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
  await second.getByRole("button", {name: "Use development storage"}).click();
  await expect(second.getByRole("region", {name: "Daily note editor"})).toBeVisible();
  second.on("dialog", dialog => void dialog.accept());
  await second.getByRole("button", {name: "Open menu"}).click();
  await second.getByRole("menuitem", {name: "Sign out"}).click();
  await expect(second.getByRole("button", {name: "Use development storage"})).toBeVisible();
  // A round trip after the storage-event task makes the invalidation observable
  // before the deliberately delayed provider callback is released.
  await page.evaluate(() => new Promise<void>(resolve => setTimeout(resolve, 0)));
  await page.evaluate(() => (window as Window & {__reviewDeliverToken?: () => void}).__reviewDeliverToken!());
  await expect(page.getByRole("button", {name: "Sign in with Google"})).toBeVisible();
});
