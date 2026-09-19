import { expect, test } from "@playwright/test";
import { focusWysiwygTextOffset, openDevelopmentStorage, wysiwygEditor } from "../helpers/editor";
import { readFakeRemoteNote, readLocalDraft, seedDailyNoteState } from "../helpers/idb";

// These races require native whitespace and selection handling, outside the sync model.
for (const boundary of ["remote merge", "placeholder cleanup", "date navigation"] as const) {
  test(`middle list item retains a typed separator through ${boundary}`, async ({ page }) => {
    const date = "2030-02-02";
    const nextDate = "2030-02-03";
    const markdown = "* First item\n* Middle item\n* Last item\n";
    await page.clock.install({ time: "2030-02-01T12:00:00.000Z" });
    await openDevelopmentStorage(page, "/", "enabled");
    await seedDailyNoteState(page, {
      remote: { date, markdown, revisionId: "initial", updatedAt: "2030-01-01T00:00:00.000Z" }
    });
    await seedDailyNoteState(page, {
      remote: { date: nextDate, markdown: "Other date", revisionId: "other", updatedAt: "2030-01-01T00:00:00.000Z" }
    });
    await page.goto(`/#/date/${date}`);
    const editor = wysiwygEditor(page);
    await expect(editor).toContainText("Last item");
    await expect(page.locator(".sync-status")).toHaveAttribute("aria-label", /Sync status: Synced/);
    await editor.evaluate(() => new Promise<void>((resolve) => requestAnimationFrame(() => resolve())));
    await page.clock.pauseAt("2030-02-01T12:01:00.000Z");

    if (boundary !== "remote merge") {
      await focusWysiwygTextOffset(page, "First item", 10);
      await page.keyboard.press("Enter");
      await page.clock.runFor(250);
      await expect(editor.locator("li")).toHaveCount(4);
    }
    await focusWysiwygTextOffset(page, "Middle item", 11);
    await page.keyboard.type(" word ");
    await page.clock.runFor(250);

    if (boundary === "remote merge") {
      await seedDailyNoteState(page, {
        remote: { date, markdown: `${markdown}* Remote append\n`, revisionId: "remote-append", updatedAt: "2030-01-01T00:00:01.000Z" }
      });
      await page.clock.runFor(2250);
      await expect(editor).toContainText("Remote append");
    } else if (boundary === "placeholder cleanup") {
      await page.clock.runFor(3500);
      await expect(editor.locator("li")).toHaveCount(3);
    } else {
      // Leave A while its autosave and cleanup timers are pending.
      await page.getByRole("button", { name: "Next day", exact: true }).click();
      await expect(editor).toHaveText("Other date");
      await page.clock.runFor(4000);
      await expect(editor).toHaveText("Other date");
      await expect.poll(async () => (await readFakeRemoteNote(page, nextDate))?.markdown).toBe("Other date");
      await expect.poll(async () => (await readLocalDraft(page, date))?.markdown).toContain("Middle item word \n");
      await page.clock.resume();
      return;
    }

    await expect(editor).toBeFocused();
    await page.keyboard.type("next");
    await page.clock.runFor(250);
    await expect(editor.locator("li").nth(1)).toHaveText("Middle item word next");
    await page.clock.runFor(2250);
    await expect.poll(async () => (await readFakeRemoteNote(page, date))?.markdown).toContain("Middle item word next");
    await expect.poll(async () => (await readLocalDraft(page, date))?.markdown).toContain("Middle item word next");
    await page.clock.resume();
    await page.reload();
    await expect(wysiwygEditor(page).locator("li").nth(1)).toHaveText("Middle item word next");
  });
}
