import { expect, test, type Page } from "@playwright/test";
import { openDevelopmentStorage, setRawMarkdown } from "../helpers/editor";
import { readLocalDraft } from "../helpers/idb";

async function waitForWorker(page: Page): Promise<void> {
  await page.evaluate(() => navigator.serviceWorker.ready.then(() => undefined));
  await expect.poll(() => page.evaluate(() => navigator.serviceWorker.controller !== null)).toBe(true);
}

async function cacheKeys(page: Page): Promise<string[]> {
  return page.evaluate(async () => {
    const keys: string[] = [];
    for (const name of await caches.keys()) {
      keys.push(...(await (await caches.open(name)).keys()).map(request => request.url));
    }
    return keys;
  });
}

test("sign-out clears drafts and tag caches across pages", async ({ page, context }) => {
  await openDevelopmentStorage(page, "/#/date/2030-02-02", "disabled");
  await page.evaluate(() => localStorage.setItem("jot.fakeRemoteUnavailable", "true"));
  await setRawMarkdown(page, "SYNTHETIC_PRIVATE_DRAFT_0024");
  await expect.poll(() => readLocalDraft(page, "2030-02-02")).toMatchObject({ dirty: true });
  const second = await context.newPage();
  await second.goto("/");
  await expect(second.getByRole("button", { name: "Open menu" })).toBeVisible();
  await page.evaluate(() => localStorage.setItem("jot.tagIndexCatalog.v1", JSON.stringify([{ tag: "synthetic-private-tag", modifiedTime: null }])));
  page.on("dialog", dialog => void dialog.accept());
  await page.getByRole("button", { name: "Open menu" }).click();
  await page.getByRole("menuitem", { name: "Sign out" }).click();
  await expect(page.getByRole("button", { name: "Use development storage" })).toBeVisible();
  await expect(second.getByRole("button", { name: "Use development storage" })).toBeVisible();
  expect(await readLocalDraft(page, "2030-02-02")).toBeNull();
  expect(await page.evaluate(() => localStorage.getItem("jot.tagIndexCatalog.v1"))).toBeNull();
  await expect(second.getByText("SYNTHETIC_PRIVATE_DRAFT_0024")).toHaveCount(0);
});

// Characterization evidence for #0032. The remediation must invert these
// retention assertions rather than treating a passing probe as a privacy control.
test("service worker retains share-query data after URL cleanup and sign-out", async ({ page }) => {
  await openDevelopmentStorage(page, "/", "disabled");
  await waitForWorker(page);
  await page.goto("/?title=SYNTHETIC_PRIVATE_SHARE_0024&text=SYNTHETIC_PRIVATE_TEXT_0024&url=https%3A%2F%2Fexample.test%2Fshared");
  await expect.poll(() => cacheKeys(page)).toContainEqual(expect.stringContaining("SYNTHETIC_PRIVATE_SHARE_0024"));
  await expect.poll(() => new URL(page.url()).search).toBe("");
  const cancel = page.getByRole("button", { name: "Cancel", exact: true });
  if (await cancel.isVisible()) await cancel.click();
  page.on("dialog", dialog => void dialog.accept());
  await page.getByRole("button", { name: "Open menu" }).click();
  await page.getByRole("menuitem", { name: "Sign out" }).click();
  await expect(page.getByRole("button", { name: "Use development storage" })).toBeVisible();
  expect(await cacheKeys(page)).toContainEqual(expect.stringContaining("SYNTHETIC_PRIVATE_SHARE_0024"));
});

// Characterization evidence for #0033: Cache Storage is origin-wide even when
// service-worker registration and document control have a narrower scope.
test("service-worker activation deletes an unrelated origin cache", async ({ page }) => {
  await page.goto("/");
  await waitForWorker(page);
  await page.evaluate(async () => {
    const cache = await caches.open("other-app-synthetic-cache");
    await cache.put("/other-app/synthetic", new Response("SYNTHETIC_OTHER_APP"));
    await navigator.serviceWorker.register("/sw.js?privacy-review=0024");
  });
  await expect.poll(() => page.evaluate(() => caches.keys())).not.toContain("other-app-synthetic-cache");
});
