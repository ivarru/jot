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

test("service worker excludes share-query data before and after sign-out", async ({ page }) => {
  await openDevelopmentStorage(page, "/", "disabled");
  await waitForWorker(page);
  await page.goto("/?title=SYNTHETIC_PRIVATE_SHARE_0024&text=SYNTHETIC_PRIVATE_TEXT_0024&url=https%3A%2F%2Fexample.test%2Fshared");
  await expect.poll(() => new URL(page.url()).search).toBe("");
  expect(await cacheKeys(page)).not.toContainEqual(expect.stringContaining("SYNTHETIC_PRIVATE_SHARE_0024"));
  const cancel = page.getByRole("button", { name: "Cancel", exact: true });
  if (await cancel.isVisible()) await cancel.click();
  page.on("dialog", dialog => void dialog.accept());
  await page.getByRole("button", { name: "Open menu" }).click();
  await page.getByRole("menuitem", { name: "Sign out" }).click();
  await expect(page.getByRole("button", { name: "Use development storage" })).toBeVisible();
  expect(await cacheKeys(page)).not.toContainEqual(expect.stringContaining("SYNTHETIC_PRIVATE_SHARE_0024"));
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

test("worker upgrade removes private legacy keys and excludes query and authorized fetches", async ({ page }) => {
  await page.goto("/");
  await waitForWorker(page);
  await page.evaluate(async () => {
    await (await caches.open("jot-shell-v6")).put("/?text=LEGACY_PRIVATE_0032", new Response("LEGACY_PRIVATE_BODY"));
    await (await caches.open("jot-shell:%2F:v7")).put("/private-note", new Response("PRIVATE_BODY_0032"));
    await (await caches.open("other-app-cache")).put("/other/", new Response("OTHER_APP"));
    await navigator.serviceWorker.register("/sw.js?privacy-migration=0032");
  });
  await expect.poll(() => page.evaluate(() => navigator.serviceWorker.controller?.scriptURL)).toContain("privacy-migration=0032");
  await expect.poll(() => page.evaluate(() => caches.keys())).not.toContain("jot-shell:%2F:v7");
  await page.evaluate(async () => {
    await fetch("/manifest.webmanifest?text=FETCH_PRIVATE_0032");
    await fetch("/icons/icon.svg", { headers: { Authorization: "Bearer SYNTHETIC_PRIVATE_0032" } });
  });
  expect(await cacheKeys(page)).not.toContainEqual(expect.stringMatching(/LEGACY_PRIVATE_0032|FETCH_PRIVATE_0032|private-note/));
  const cached = await page.evaluate(async () => {
    const entries: { body: string; auth: string | null }[] = [];
    for (const name of await caches.keys()) {
      const cache = await caches.open(name);
      for (const request of await cache.keys()) entries.push({ body: await (await cache.match(request))!.text(), auth: request.headers.get("Authorization") });
    }
    return entries;
  });
  expect(cached.some(entry => entry.body.includes("PRIVATE_BODY") || entry.auth !== null)).toBe(false);
  expect(await page.evaluate(() => caches.keys())).toContain("other-app-cache");
});
