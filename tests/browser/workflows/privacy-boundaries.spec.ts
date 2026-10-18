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

test("service-worker activation preserves unrelated caches and migrates owned offline assets", async ({ page, context }) => {
  await page.goto("/");
  await waitForWorker(page);
  await page.evaluate(async () => {
    await (await caches.open("other-app-synthetic-cache")).put("/other-app/synthetic", new Response("OTHER_APP"));
    await (await caches.open("jot-shell:%2Fother-app%2F:v1")).put("/other-app/", new Response("OTHER_JOT"));
    await (await caches.open("jot-shell:%2F:v0")).put("/obsolete", new Response("OBSOLETE"));
    await (await caches.open("jot-shell-v6")).put("/icons/legacy-review.svg", new Response("LEGACY_ASSET"));
    await navigator.serviceWorker.register("/sw.js?ownership-regression=0033");
  });
  await expect.poll(() => page.evaluate(() => caches.keys())).not.toContain("jot-shell:%2F:v0");
  const names = await page.evaluate(() => caches.keys());
  expect(names).toContain("other-app-synthetic-cache");
  expect(names).toContain("jot-shell:%2Fother-app%2F:v1");
  await context.setOffline(true);
  expect(await page.evaluate(() => fetch("/icons/legacy-review.svg").then(response => response.text()))).toBe("LEGACY_ASSET");
});
