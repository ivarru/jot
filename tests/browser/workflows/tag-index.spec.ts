import { expect, test, type Page } from "@playwright/test";
import { openDevelopmentStorage, setRawMarkdown } from "../helpers/editor";
import { readFakeRemoteNote, seedDailyNoteState } from "../helpers/idb";

async function readIndex(page: Page): Promise<Record<string, string>> {
  return await page.evaluate(async () => {
    const database = await new Promise<IDBDatabase>((resolve, reject) => {
      const request = indexedDB.open("jot", 2);
      request.onsuccess = () => resolve(request.result); request.onerror = () => reject(request.error);
    });
    try {
      return await new Promise<Record<string, string>>((resolve, reject) => {
        const request = database.transaction("settings", "readonly").objectStore("settings").get("fake-tag-index");
        request.onsuccess = () => resolve(request.result?.files ?? {}); request.onerror = () => reject(request.error);
      });
    } finally { database.close(); }
  });
}
async function settings(page: Page) {
  await page.getByRole("button", { name: "Open menu" }).click();
  await page.getByRole("menuitem", { name: "Settings", exact: true }).click();
  return page.getByRole("dialog", { name: "Settings" });
}

test("tag indexes rebuild existing synced notes with the saved excerpt limit and reconcile external removals", async ({ page }) => {
  await openDevelopmentStorage(page, "/#/date/2030-02-04", "disabled");
  await seedDailyNoteState(page, { remote: { date: "2030-02-01", markdown: "**Opening text**\ncontinued [#work](jot:tag/work) ignored\n\nAgain [#work](jot:tag/work)", revisionId: "a", updatedAt: "2030-01-01T00:00:00Z" } });
  await seedDailyNoteState(page, { remote: { date: "2030-02-02", markdown: "- Later\n  list item [#work](jot:tag/work)", revisionId: "b", updatedAt: "2030-01-01T00:00:00Z" } });
  const dialog = await settings(page);
  const limit = dialog.getByLabel("Maximum excerpt length (characters)");
  await expect(limit).toHaveValue("200");
  await limit.fill("6"); await limit.press("Tab");
  await expect.poll(() => readIndex(page)).toEqual({ "work.md": "2030-02-01 **Openi**…  \n2030-02-01 Again  \n2030-02-02 Later…  \n" });
  await expect(dialog.getByRole("status")).toHaveText("Tag index is up to date.");
  await page.getByRole("button", { name: "Close settings" }).click();
  await page.reload();
  const restored = await settings(page);
  await expect(restored.getByLabel("Maximum excerpt length (characters)")).toHaveValue("6");
  await seedDailyNoteState(page, { remote: { date: "2030-02-01", markdown: "Removed tags", revisionId: "a2", updatedAt: "2030-01-02T00:00:00Z" } });
  await seedDailyNoteState(page, { remote: { date: "2030-02-02", markdown: "", revisionId: "b2", updatedAt: "2030-01-02T00:00:00Z" } });
  await expect(restored.getByRole("button", { name: "Rebuild tag index" })).toBeEnabled();
  await restored.getByRole("button", { name: "Rebuild tag index" }).click();
  await expect.poll(() => readIndex(page)).toEqual({});
});

test("pending date A edits are indexed under A after navigation to B and index maintenance recovers offline", async ({ page }) => {
  await openDevelopmentStorage(page, "/#/date/2030-02-01", "disabled");
  await setRawMarkdown(page, "Date A [#work](jot:tag/work)");
  await page.getByRole("button", { name: "Next day", exact: true }).click();
  await expect(page.getByLabel("Selected date", { exact: true })).toHaveValue("2030-02-02");
  await setRawMarkdown(page, "Date B [#work](jot:tag/work)");
  await expect.poll(async () => (await readFakeRemoteNote(page, "2030-02-02"))?.markdown).toBe("Date B [#work](jot:tag/work)");
  await expect.poll(() => readIndex(page), { timeout: 10000 }).toEqual({ "work.md": "2030-02-01 Date A  \n2030-02-02 Date B  \n" });
  const dialog = await settings(page);
  await page.evaluate(() => localStorage.setItem("jot.fakeRemoteUnavailable", "true"));
  await dialog.getByRole("button", { name: "Rebuild tag index" }).click();
  await expect(dialog.getByRole("status")).toHaveText("Could not update tag index. Retrying automatically.");
  await seedDailyNoteState(page, { remote: { date: "2030-02-03", markdown: "Date C [#work](jot:tag/work)", revisionId: "c", updatedAt: "2030-01-01T00:00:00Z" } });
  await page.evaluate(() => {
    localStorage.removeItem("jot.fakeRemoteUnavailable");
    window.dispatchEvent(new Event("online"));
  });
  await expect.poll(() => readIndex(page)).toEqual({ "work.md": "2030-02-01 Date A  \n2030-02-02 Date B  \n2030-02-03 Date C  \n" });
  await expect(page.getByLabel("Selected date", { exact: true })).toHaveValue("2030-02-02");
});

test("a tag added immediately before leaving a note is indexed without editing the destination", async ({ page }) => {
  await openDevelopmentStorage(page, "/#/date/2030-02-01", "disabled");
  const dialog = await settings(page);
  await expect(dialog.getByRole("status")).toHaveText("Tag index is up to date.");
  await page.getByRole("button", { name: "Close settings" }).click();
  await setRawMarkdown(page, "Leaving A [#departure](jot:tag/departure)");
  await page.getByRole("button", { name: "Next day", exact: true }).click();
  await expect(page.getByLabel("Selected date", { exact: true })).toHaveValue("2030-02-02");
  await expect.poll(async () => (await readFakeRemoteNote(page, "2030-02-01"))?.markdown).toBe("Leaving A [#departure](jot:tag/departure)");
  await expect.poll(() => readIndex(page), { timeout: 4000 }).toEqual({ "departure.md": "2030-02-01 Leaving A  \n" });
  await expect(page.getByLabel("Selected date", { exact: true })).toHaveValue("2030-02-02");
  await expect.poll(async () => (await readFakeRemoteNote(page, "2030-02-02"))?.markdown ?? "").toBe("");
});

test("tag dialogs share cached ordering, refresh modified indexes, and drop deleted tags", async ({ page }) => {
  await openDevelopmentStorage(page, "/#/date/2030-02-04", "disabled");
  await seedDailyNoteState(page, { remote: { date: "2030-02-01", markdown: "Alpha [#alpha](jot:tag/alpha)", revisionId: "a", updatedAt: "2030-01-01T00:00:00Z" } });
  await seedDailyNoteState(page, { remote: { date: "2030-02-02", markdown: "Zebra [#zebra](jot:tag/zebra)", revisionId: "z", updatedAt: "2030-01-01T00:00:00Z" } });
  const config = await settings(page);
  await config.getByRole("button", { name: "Rebuild tag index" }).click();
  await expect.poll(async () => Object.keys(await readIndex(page)).sort()).toEqual(["alpha.md", "zebra.md"]);
  await expect(config.getByRole("status")).toHaveText("Tag index is up to date.");
  await page.getByRole("button", { name: "Close settings" }).click();
  // Set distinct index modification dates independently of the note dates.
  await page.evaluate(async () => {
    const db = await new Promise<IDBDatabase>((resolve) => { const r = indexedDB.open("jot", 2); r.onsuccess = () => resolve(r.result); });
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction("settings", "readwrite"); const store = tx.objectStore("settings");
      const read = store.get("fake-tag-index");
      read.onsuccess = () => store.put({ ...read.result, modifiedTimes: { "alpha.md": "2020-01-01T00:00:00Z", "zebra.md": "2021-01-01T00:00:00Z" } });
      tx.oncomplete = () => resolve(); tx.onerror = () => reject(tx.error);
    }); db.close();
  });
  const browse = async () => {
    await page.getByRole("button", { name: "Open menu" }).click();
    await page.getByRole("menuitem", { name: "Browse tags", exact: true }).click();
    return page.getByRole("dialog", { name: "Browse tags" });
  };
  const tags = await browse();
  const indexed = tags.getByRole("navigation", { name: "Indexed tags" }).getByRole("button");
  await expect(indexed).toHaveText(["#zebra", "#alpha"]);
  await tags.getByRole("checkbox", { name: "Alphabetical order" }).check();
  await expect(indexed).toHaveText(["#alpha", "#zebra"]);
  await tags.getByRole("button", { name: "Close tags" }).click();
  await page.getByRole("button", { name: "Add tag", exact: true }).click();
  const add = page.getByRole("dialog", { name: "Add tag", exact: true });
  await expect(add.getByRole("checkbox", { name: "Alphabetical order" })).toBeChecked();
  await expect(add.locator(".tag-suggestion button")).toHaveText(["#alpha", "#zebra"]);
  await expect(add.getByRole("button", { name: /Remove #/ })).toHaveCount(0);
  await add.getByRole("checkbox", { name: "Alphabetical order" }).uncheck();
  await expect(add.locator(".tag-suggestion button")).toHaveText(["#zebra", "#alpha"]);
  await add.getByRole("button", { name: "Cancel", exact: true }).click();
  await page.evaluate(() => localStorage.setItem("jot.fakeRemoteUnavailable", "true"));
  await browse();
  await expect(tags.getByRole("alert")).toContainText("unavailable");
  await expect(indexed).toHaveText(["#zebra", "#alpha"]);
  await tags.getByRole("button", { name: "Close tags" }).click();
  await page.getByRole("button", { name: "Add tag", exact: true }).click();
  await expect(add.getByRole("alert")).toContainText("unavailable");
  await expect(add.locator(".tag-suggestion button")).toHaveText(["#zebra", "#alpha"]);
  await add.getByRole("button", { name: "Cancel", exact: true }).click();
  await page.evaluate(() => localStorage.removeItem("jot.fakeRemoteUnavailable"));
  await seedDailyNoteState(page, { remote: { date: "2030-02-01", markdown: "Changed Alpha [#alpha](jot:tag/alpha)", revisionId: "a2", updatedAt: "2030-01-02T00:00:00Z" } });
  await seedDailyNoteState(page, { remote: { date: "2030-02-02", markdown: "Removed", revisionId: "z2", updatedAt: "2030-01-02T00:00:00Z" } });
  await settings(page); await config.getByRole("button", { name: "Rebuild tag index" }).click();
  await expect.poll(() => readIndex(page)).toEqual({ "alpha.md": "2030-02-01 Changed Alpha  \n" });
  await expect(config.getByRole("status")).toHaveText("Tag index is up to date.");
  await page.getByRole("button", { name: "Close settings" }).click();
  await expect.poll(() => page.evaluate(() => JSON.parse(localStorage.getItem("jot.tagIndexCatalog.v1") ?? "[]").map((entry: { tag: string }) => entry.tag))).toEqual(["alpha"]);
  await browse(); await expect(indexed).toHaveText(["#alpha"]);
  await tags.getByRole("button", { name: "Close tags" }).click();
  await page.getByRole("button", { name: "Add tag", exact: true }).click();
  await expect(add.locator(".tag-suggestion button")).toHaveText(["#alpha"]);
  await add.getByRole("button", { name: "Cancel", exact: true }).click();
});
