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
    await focusWysiwygTextOffset(page, "First item", 5);
    await page.keyboard.type(" added", { delay: 250 });
    await expect(editor.locator("li").first()).toHaveText("First added item");

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

    // Keep typing across the autosave timer and resulting merge. These keys
    // arrive faster than Milkdown's change debounce, as in a burst of typing.
    const continuation = " continued typing across the save";
    await page.keyboard.type(continuation, { delay: 100 });
    if (latePhoneSave) await expect(editor).toContainText("Last phone edit");
    await expect(editor).toBeFocused();
    await expect(editor.locator("li").first()).toHaveText(`First added${continuation} item`);
    await expect.poll(async () => editor.evaluate((element) => {
      const selection = getSelection();
      return selection?.isCollapsed === true && selection.anchorNode !== null
        && element.querySelector("li")!.contains(selection.anchorNode);
    })).toBe(true);

    const expected = markdown.replace("First item", `First added${continuation} item`)
      + (latePhoneSave ? "* Last phone edit\n" : "");
    await expect.poll(async () => (await readFakeRemoteNote(page, date))?.markdown).toBe(expected);
    await expect.poll(async () => (await readLocalDraft(page, date))?.markdown).toBe(expected);
    await page.reload();
    await expect(wysiwygEditor(page).locator("li").first()).toHaveText(`First added${continuation} item`);
  });
}
