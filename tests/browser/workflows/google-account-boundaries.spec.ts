import { expect, test, type Page } from "@playwright/test";
import { setRawMarkdown } from "../helpers/editor";
import { readLocalDraft, seedLocalDraft } from "../helpers/idb";

async function installAccounts(page: Page) {
  await page.route("https://www.googleapis.com/drive/v3/about?*", route => {
    const account = route.request().headers().authorization?.replace("Bearer synthetic-", "");
    return route.fulfill({json: {user: {permissionId: account}}});
  });
  await page.addInitScript(() => {
    (window as Window & {__JOT_TEST_GOOGLE_AUTH__?: boolean}).__JOT_TEST_GOOGLE_AUTH__ = true;
    const client = {callback: (_: unknown) => {}, requestAccessToken() {
      queueMicrotask(() => client.callback({access_token: `synthetic-${localStorage.getItem("review.account") ?? "A"}`, expires_in: 3600}));
    }};
    window.google = {accounts: {oauth2: {initTokenClient: () => client, revoke: (_: string, done: () => void) => done()}}};
  });
}

test("account B cannot open or upload account A's retained draft after reload", async ({page}) => {
  await installAccounts(page);
  await page.goto("/#/date/2030-02-02");
  await page.getByRole("button", {name: "Sign in with Google"}).click();
  await expect(page.getByRole("region", {name: "Daily note editor"})).toBeVisible();
  await page.evaluate(() => localStorage.setItem("jot.fakeRemoteUnavailable", "true"));
  await setRawMarkdown(page, "Synthetic account A private draft");
  await expect.poll(() => readLocalDraft(page, "2030-02-02")).toMatchObject({markdown: "Synthetic account A private draft", dirty: true});
  await page.evaluate(() => { sessionStorage.removeItem("jot.googleAccessToken.test-google-client-id"); localStorage.setItem("review.account", "B"); });
  await page.reload();
  await page.getByRole("button", {name: "Sign in with Google"}).click();
  await expect(page.locator(".auth-error")).toContainText("different Google account");
  await expect(page.getByRole("region", {name: "Daily note editor"})).not.toBeVisible();
  await expect(readLocalDraft(page, "2030-02-02")).resolves.toMatchObject({markdown: "Synthetic account A private draft", dirty: true});
  await page.evaluate(() => localStorage.setItem("review.account", "A"));
  await page.getByRole("button", {name: "Sign in with Google"}).click();
  await expect(page.getByRole("region", {name: "Daily note editor"})).toBeVisible();
  await expect(page.locator(".milkdown-root")).toContainText("Synthetic account A private draft");
});


test("legacy local notes require explicit ownership confirmation", async ({page}) => {
  await installAccounts(page);
  await page.goto("/#/date/2030-02-02");
  await seedLocalDraft(page, "2030-02-02", "Synthetic legacy note");
  page.once("dialog", dialog => void dialog.dismiss());
  await page.getByRole("button", {name: "Sign in with Google"}).click();
  await expect(page.locator(".auth-error")).toContainText("unchanged");
  await expect(page.getByRole("region", {name: "Daily note editor"})).not.toBeVisible();
  await expect(readLocalDraft(page, "2030-02-02")).resolves.toMatchObject({markdown: "Synthetic legacy note"});
  page.once("dialog", dialog => void dialog.accept());
  await page.getByRole("button", {name: "Sign in with Google"}).click();
  await expect(page.locator(".milkdown-root")).toContainText("Synthetic legacy note");
});

test("sign out A then sign in B in the same page starts a fresh account session", async ({page}) => {
  await installAccounts(page);
  await page.goto("/#/date/2030-02-02");
  await page.getByRole("button", {name: "Sign in with Google"}).click();
  await expect(page.getByRole("region", {name: "Daily note editor"})).toBeVisible();
  page.on("dialog", dialog => void dialog.accept());
  await page.getByRole("button", {name: "Open menu"}).click();
  await page.getByRole("menuitem", {name: "Sign out"}).click();
  await expect(page.getByRole("button", {name: "Sign in with Google"})).toBeVisible();
  await page.evaluate(() => localStorage.setItem("review.account", "B"));
  await page.getByRole("button", {name: "Sign in with Google"}).click();
  await expect(page.getByRole("region", {name: "Daily note editor"})).toBeVisible();
  expect(await page.evaluate(() => localStorage.getItem("jot.googleAccountId"))).toBe("B");
});


test("a valid previously verified token can reopen local notes while identity requests are offline", async ({page}) => {
  await installAccounts(page);
  await page.goto("/#/date/2030-02-02");
  await page.getByRole("button", {name: "Sign in with Google"}).click();
  await expect(page.getByRole("region", {name: "Daily note editor"})).toBeVisible();
  await page.route("https://www.googleapis.com/drive/v3/about?*", route => route.abort());
  await page.evaluate(() => localStorage.setItem("jot.fakeRemoteUnavailable", "true"));
  await page.reload();
  await page.getByRole("button", {name: "Sign in with Google"}).click();
  await expect(page.getByRole("region", {name: "Daily note editor"})).toBeVisible();
  await setRawMarkdown(page, "Synthetic offline edit");
  await expect.poll(() => readLocalDraft(page, "2030-02-02")).toMatchObject({markdown: "Synthetic offline edit", dirty: true});
});
