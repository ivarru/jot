import { expect, test } from "@playwright/test";
import { seedLocalDraft, waitForFakeRemoteNote } from "../helpers/idb";

const selectedDate = "2030-02-02";
const backgroundDate = "2030-02-01";
const backgroundMarkdown = "Saved with the still-valid token before renewal\n";
const tokenStorageKey = "jot.googleAccessToken.test-google-client-id";

test("Google renewal saves pending edits, invalidates a failed silent token, and reconnects interactively", async ({ page }) => {
  await page.addInitScript(() => {
    const testWindow = window as Window & {
      __JOT_TEST_GOOGLE_AUTH__?: boolean;
      __JOT_TEST_GOOGLE_REQUESTS__?: Array<Record<string, unknown> | undefined>;
    };
    const requests: Array<Record<string, unknown> | undefined> = [];
    testWindow.__JOT_TEST_GOOGLE_AUTH__ = true;
    testWindow.__JOT_TEST_GOOGLE_REQUESTS__ = requests;

    const tokenClient = {
      callback: (_response: unknown) => undefined,
      error_callback: (_error: unknown) => undefined,
      requestAccessToken(request?: Record<string, unknown>) {
        requests.push(request);
        const requestNumber = requests.length;
        window.setTimeout(() => {
          if (requestNumber === 1) {
            tokenClient.callback({ access_token: "initial-token", expires_in: 180 });
          } else if (requestNumber === 2) {
            tokenClient.callback({ error: "interaction_required" });
          } else {
            tokenClient.callback({ access_token: "reconnected-token", expires_in: 3600 });
          }
        }, 0);
      }
    };

    testWindow.google = {
      accounts: {
        oauth2: {
          initTokenClient: () => tokenClient,
          revoke: (_token: string, done: () => void) => done()
        }
      }
    };
  });

  await page.goto(`/#/date/${selectedDate}`);
  await seedLocalDraft(page, backgroundDate, backgroundMarkdown);
  await page.getByRole("button", { name: "Sign in with Google" }).click();

  await expect(page.getByRole("dialog", { name: "Reconnect to sync" })).toBeVisible();
  await expect(waitForFakeRemoteNote(page, backgroundDate, backgroundMarkdown)).resolves.toMatchObject({
    markdown: backgroundMarkdown
  });
  await expect.poll(async () => await page.evaluate((key) => sessionStorage.getItem(key), tokenStorageKey)).toBeNull();
  await expect.poll(async () => await page.evaluate(() => {
    const testWindow = window as Window & {
      __JOT_TEST_GOOGLE_REQUESTS__?: Array<Record<string, unknown> | undefined>;
    };
    return testWindow.__JOT_TEST_GOOGLE_REQUESTS__;
  })).toEqual([undefined, { prompt: "none" }]);

  await page.getByRole("button", { name: "Reconnect", exact: true }).click();

  await expect(page.getByRole("dialog", { name: "Reconnect to sync" })).toBeHidden();
  await expect.poll(async () => await page.evaluate((key) => sessionStorage.getItem(key), tokenStorageKey)).toContain("reconnected-token");
  await expect.poll(async () => await page.evaluate(() => {
    const testWindow = window as Window & {
      __JOT_TEST_GOOGLE_REQUESTS__?: Array<Record<string, unknown> | undefined>;
    };
    return testWindow.__JOT_TEST_GOOGLE_REQUESTS__;
  })).toEqual([undefined, { prompt: "none" }, undefined]);
});
