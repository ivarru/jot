import { expect, test } from "@playwright/test";
import { focusWysiwygTextOffset, openDevelopmentStorage, wysiwygEditor } from "../helpers/editor";
import { readFakeRemoteNote, readLocalDraft, seedDailyNoteState } from "../helpers/idb";

const date = "2030-02-02";
const markdown = [
  "# Morning", "", "* First item", "* Second item", "",
  "# Afternoon", "", "* Third item", "* Fourth item", "",
  "# Evening", "", "* Fifth item", "* Sixth item", ""
].join("\n");

// The sync model tracks Markdown, not Milkdown's generated heading attributes
// or native browser selection. Exercise their interaction through real typing.
for (const latePhoneSave of [false, true]) {
  test(`typing in a remote note keeps the caret through ${latePhoneSave ? "a merged phone save" : "autosave"}`, async ({ page }) => {
    await page.clock.install({ time: "2030-02-01T12:00:00.000Z" });
    await openDevelopmentStorage(page, "/", "default");
    await seedDailyNoteState(page, {
      remote: { date, markdown, revisionId: "phone-revision", updatedAt: "2030-01-01T00:00:00.000Z" }
    });
    await page.goto(`/#/date/${date}`);
    const editor = wysiwygEditor(page);
    await expect(editor).toContainText("Sixth item");
    await expect(page.locator(".sync-status")).toHaveAttribute("aria-label", /Sync status: Synced/);
    // Allow the initial queued editor focus to finish before placing a caret.
    await editor.evaluate(() => new Promise<void>((resolve) => requestAnimationFrame(() => resolve())));
    // Freeze autosave before editing so a slow runner cannot save the first
    // phrase before the simulated phone append establishes its revision.
    await page.clock.pauseAt("2030-02-01T12:01:00.000Z");
    await focusWysiwygTextOffset(page, "First item", 5);
    await page.keyboard.type(" added");
    await page.clock.runFor(250);
    await expect(editor.locator("li").first()).toHaveText("First added item");
    await expect(readFakeRemoteNote(page, date)).resolves.toMatchObject({
      markdown,
      revisionId: "phone-revision"
    });

    if (latePhoneSave) {
      // Another device finishes saving after this editor loaded its baseline.
      await seedDailyNoteState(page, {
        remote: {
          date,
          markdown: `${markdown}* Last phone edit\n`,
          revisionId: "later-phone-revision",
          updatedAt: "2030-01-01T00:00:01.000Z"
        }
      });
    }

    // Type before and after an explicit autosave/merge boundary instead of
    // relying on wall-clock keyboard delays to land inside the debounce.
    const continuation = " continued typing across the save";
    await page.keyboard.type(" continued typing");
    await page.clock.runFor(2_250);
    if (latePhoneSave) await expect(editor).toContainText("Last phone edit");
    await page.keyboard.type(" across the save");
    await page.clock.runFor(250);
    await expect(editor).toBeFocused();
    await expect(editor.locator("li").first()).toHaveText(`First added${continuation} item`);
    await expect.poll(async () => editor.evaluate((element) => {
      const selection = getSelection();
      return selection?.isCollapsed === true && selection.anchorNode !== null
        && element.querySelector("li")!.contains(selection.anchorNode);
    })).toBe(true);

    const expected = markdown.replace("First item", `First added${continuation} item`)
      + (latePhoneSave ? "* Last phone edit\n" : "");
    await page.clock.runFor(2_001);
    await expect.poll(async () => (await readFakeRemoteNote(page, date))?.markdown).toBe(expected);
    await expect.poll(async () => (await readLocalDraft(page, date))?.markdown).toBe(expected);
    await page.clock.resume();
    await page.reload();
    await expect(wysiwygEditor(page).locator("li").first()).toHaveText(`First added${continuation} item`);
  });
}
