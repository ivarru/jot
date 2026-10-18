import { expect, test, type Page } from "@playwright/test";
import { openDevelopmentStorage, setRawMarkdown, switchToWysiwygMode, rawEditor, expectRawMarkdown } from "../helpers/editor";
import { readLocalDraft, seedDailyNoteState } from "../helpers/idb";
const tag = "[#work](jot:tag/work)";
async function buildIndex(page: Page) {
  await page.getByRole("button", { name: "Open menu" }).click();
  await page.getByRole("menuitem", { name: "Settings", exact: true }).click();
  const dialog = page.getByRole("dialog", { name: "Settings" });
  await expect(dialog.getByRole("button", { name: "Rebuild tag index" })).toBeEnabled();
  await dialog.getByRole("button", { name: "Rebuild tag index" }).click();
  await expect(dialog.getByRole("status")).toHaveText("Tag index is up to date.");
  await expect.poll(async () => page.evaluate(async () => {
    const db = await new Promise<IDBDatabase>((resolve) => { const request = indexedDB.open("jot", 2); request.onsuccess = () => resolve(request.result); });
    try { return await new Promise<boolean>((resolve) => { const request = db.transaction("settings").objectStore("settings").get("fake-tag-index"); request.onsuccess = () => resolve(Boolean(request.result?.files["work.md"])); }); }
    finally { db.close(); }
  })).toBe(true);
  await dialog.getByRole("button", { name: "Close settings" }).click();
}
async function browse(page: Page) {
  await page.getByRole("button", { name: "Tag", exact: true }).click();
  const dialog = page.getByRole("dialog", { name: "Tags", exact: true });
  await expect(dialog.getByRole("combobox", { name: "Tag or filter" })).toBeFocused();
  return dialog;
}

for (const [mode, width] of [["raw", 960], ["wysiwyg", 360], ["wysiwyg", 960]] as const) {
  test(`tag browsing targets repeated occurrences and scrolls in ${mode} at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 700 });
    await openDevelopmentStorage(page, "/#/date/2030-02-04", "disabled");
    const note = [
      ...Array.from({ length: 25 }, (_, i) => `Before ${i}.`), `Same ${tag}`,
      ...Array.from({ length: 25 }, (_, i) => `Between ${i}.`), `Same ${tag}`, "Last paragraph"
    ].join("\n\n");
    await seedDailyNoteState(page, { remote: { date: "2030-02-02", markdown: note, revisionId: "b", updatedAt: "2030-01-01T00:00:00Z" } });
    await buildIndex(page);
    await setRawMarkdown(page, "Date A pending text");
    if (mode === "wysiwyg") await switchToWysiwygMode(page);
    const dialog = await browse(page);
    await dialog.getByRole("combobox", { name: "Tag or filter" }).fill("wor");
    await dialog.getByRole("button", { name: "Expand #work", exact: true }).press("Enter");
    const rows = dialog.locator(".tag-index-occurrence");
    await expect(rows).toHaveCount(2);
    await expect(rows.nth(1)).not.toContainText("Instance");
    await expect.poll(() => dialog.evaluate((element) => element.scrollWidth <= element.clientWidth)).toBe(true);
    await rows.nth(1).press("Enter");
    await expect(dialog).toHaveCount(0);
    await expect(page.getByLabel("Selected date", { exact: true })).toHaveValue("2030-02-02");
    await expect.poll(async () => (await readLocalDraft(page, "2030-02-04"))?.markdown).toBe("Date A pending text");
    if (mode === "raw") {
      await expect(rawEditor(page)).toHaveValue(note);
      await expect.poll(() => rawEditor(page).evaluate((element) => (element as HTMLTextAreaElement).selectionStart)).toBe(note.lastIndexOf(tag));
      await expect.poll(() => page.evaluate(() => window.scrollY)).toBeGreaterThan(500);
      const mirror = page.locator(".plain-text-hard-break-highlights").first();
      expect(await mirror.evaluate((element, offset) => {
        const walker = document.createTreeWalker(element, NodeFilter.SHOW_TEXT); let remaining = offset; let node;
        while ((node = walker.nextNode())) { const size = node.textContent?.length ?? 0; if (remaining < size) { const range = document.createRange(); range.setStart(node, remaining); range.setEnd(node, remaining + 1); const rect = range.getBoundingClientRect(); return rect.top >= 0 && rect.bottom <= innerHeight; } remaining -= size; }
        return false;
      }, note.lastIndexOf(tag))).toBe(true);
    } else {
      await expect.poll(() => page.evaluate(() => window.getSelection()?.toString())).toContain("#work");
      const target = page.locator('.milkdown-root [contenteditable="true"] a[href="jot:tag/work"]').nth(1);
      await expect(target).toBeInViewport();
    }
    // The same already-open note can jump back to its first identical occurrence.
    const again = await browse(page);
    await again.getByRole("button", { name: "Expand #work", exact: true }).click();
    await again.locator(".tag-index-occurrence").first().click();
    if (mode === "raw") await expect.poll(() => rawEditor(page).evaluate((element) => (element as HTMLTextAreaElement).selectionStart)).toBe(note.indexOf(tag));
    else await expect(page.locator('.milkdown-root [contenteditable="true"] a[href="jot:tag/work"]').first()).toBeInViewport();
  });
}

test("tag browsing renders inline formatting, keeps excerpt links inert, and retries offline listing", async ({ page }) => {
  await openDevelopmentStorage(page, "/#/date/2030-02-04", "disabled");
  await seedDailyNoteState(page, { remote: { date: "2030-02-02", markdown: `**Target** [external](https://example.com) ${tag}`, revisionId: "b", updatedAt: "2030-01-01T00:00:00Z" } });
  await buildIndex(page);
  await page.evaluate(() => localStorage.setItem("jot.fakeRemoteUnavailable", "true"));
  const dialog = await browse(page);
  await expect(dialog.getByRole("alert")).toContainText("unavailable");
  await page.evaluate(() => localStorage.removeItem("jot.fakeRemoteUnavailable"));
  await dialog.getByRole("button", { name: "Retry tags" }).click();
  await dialog.getByRole("button", { name: "Expand #work", exact: true }).click();
  await expect(dialog.locator("strong")).toHaveText("Target");
  await dialog.getByRole("link", { name: "external" }).click();
  await expect(page.getByLabel("Selected date", { exact: true })).toHaveValue("2030-02-02");
  expect(page.url()).not.toContain("example.com");
  const reopened = await browse(page);
  await page.keyboard.press("Escape");
  await expect(reopened).toHaveCount(0);
  await expect(page.locator('.milkdown-root [contenteditable="true"]')).toBeFocused();
});

for (const scenario of ["ambiguous", "missing"] as const) {
  test(`a stale ${scenario} tag occurrence opens the note with an explicit notice`, async ({ page }) => {
    await openDevelopmentStorage(page, "/#/date/2030-02-04", "disabled");
    await seedDailyNoteState(page, { remote: { date: "2030-02-02", markdown: `Same ${tag}\n\nSame ${tag}`, revisionId: "b1", updatedAt: "2030-01-01T00:00:00Z" } });
    await buildIndex(page);
    const dialog = await browse(page);
    await dialog.getByRole("button", { name: "Expand #work", exact: true }).click();
    await expect(dialog.locator(".tag-index-occurrence")).toHaveCount(2);
    const updated = scenario === "ambiguous" ? `Same ${tag}` : "Tags removed";
    await seedDailyNoteState(page, { remote: { date: "2030-02-02", markdown: updated, revisionId: "b2", updatedAt: "2030-01-02T00:00:00Z" } });
    await dialog.locator(".tag-index-occurrence").nth(1).click();
    await expect(page.getByLabel("Selected date", { exact: true })).toHaveValue("2030-02-02");
    await expect(page.getByRole("status", { name: "Tag navigation" })).toContainText(scenario === "ambiguous" ? "ambiguous" : "could not be found");
    await expectRawMarkdown(page, updated);
  });
}

for (const mode of ["raw", "wysiwyg"] as const) {
  test(`tag navigation resolves against the refreshed clean cache in ${mode} mode`, async ({ page }) => {
    await openDevelopmentStorage(page, "/#/date/2030-02-04", "disabled");
    const cached = mode === "raw" ? `New target ${tag}` : "Old cached note";
    const refreshed = `Introductory paragraph\n\nNew target ${tag}`;
    await seedDailyNoteState(page, {
      draft: { date: "2030-02-02", markdown: cached, baselineMarkdown: cached, baselineRevisionId: "b-old",
        dirty: false, updatedAt: "2030-01-01T00:00:00Z" },
      remote: { date: "2030-02-02", markdown: refreshed, revisionId: "b-new", updatedAt: "2030-01-02T00:00:00Z" }
    });
    await buildIndex(page);
    await setRawMarkdown(page, "A edit before cached-note navigation");
    if (mode === "wysiwyg") await switchToWysiwygMode(page);
    const dialog = await browse(page);
    await dialog.getByRole("button", { name: "Expand #work", exact: true }).click();
    await dialog.locator(".tag-index-occurrence").click();
    await expect(page.getByLabel("Selected date", { exact: true })).toHaveValue("2030-02-02");
    if (mode === "raw") {
      await expect(rawEditor(page)).toHaveValue(refreshed);
      await expect.poll(() => rawEditor(page).evaluate((element) => (element as HTMLTextAreaElement).selectionStart)).toBe(refreshed.indexOf(tag));
    } else {
      await expect(page.locator('.milkdown-root [contenteditable="true"]')).toContainText("Introductory paragraph");
      await expect.poll(() => page.evaluate(() => window.getSelection()?.toString())).toContain("#work");
      await expect(page.locator('.milkdown-root [contenteditable="true"] a[href="jot:tag/work"]')).toBeInViewport();
    }
    await expect(page.getByRole("status", { name: "Tag navigation" })).toHaveCount(0);
    await expect.poll(async () => (await readLocalDraft(page, "2030-02-04"))?.markdown).toBe("A edit before cached-note navigation");
  });
}
