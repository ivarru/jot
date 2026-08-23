import { expect, test } from "@playwright/test";
import {
  clickButton,
  expectRawMarkdown,
  expectRawSelection,
  openDevelopmentStorage,
  rawEditor,
  setRawMarkdown,
  switchToRawMode
} from "../helpers/editor";
import { readFakeRemoteNote } from "../helpers/idb";

test("sync keeps the current empty list item editable while saving the canonical note", async ({ page }) => {
  await openDevelopmentStorage(page);
  const date = "2030-02-02";
  await page.goto(`/#/date/${date}`);
  await expect(rawEditor(page)).toBeHidden();
  const pending = "before\n* <br />\n* <br />";
  const caret = pending.lastIndexOf("* <br />") + 2;
  await switchToRawMode(page);
  await rawEditor(page).evaluate((element, input) => {
    if (!(element instanceof HTMLTextAreaElement)) throw new Error("Raw editor is not a textarea.");
    element.value = input.markdown;
    element.focus();
    element.setSelectionRange(input.caret, input.caret);
    element.dispatchEvent(new Event("select", { bubbles: true }));
    element.dispatchEvent(new InputEvent("input", { bubbles: true, inputType: "insertText", data: input.markdown }));
  }, { markdown: pending, caret });

  await expect(page.locator(".sync-status[aria-label*='Saved locally']")).toBeVisible();
  await clickButton(page, "Saved locally");
  await expect.poll(async () => (await readFakeRemoteNote(page, date))?.markdown).toBe("before");

  await expectRawMarkdown(page, "before\n* <br />");
  await expectRawSelection(page, "before\n* ".length);
  await expect(rawEditor(page)).toBeEditable();
});

test("disabled normalization preserves all empty placeholders locally and remotely", async ({ page }) => {
  await openDevelopmentStorage(page);
  const date = "2030-02-04";
  await page.goto(`/#/date/${date}`);
  await page.getByRole("button", { name: "Open menu" }).click();
  await page.getByRole("menuitem", { name: "Settings", exact: true }).click();
  await page.getByLabel("Normalize empty editor placeholders when saving").uncheck();

  const pending = "before\n* <br />\n* <br />";
  await setRawMarkdown(page, pending);
  await expect(page.locator(".sync-status[aria-label*='Saved locally']")).toBeVisible();
  await clickButton(page, "Saved locally");
  await expect.poll(async () => (await readFakeRemoteNote(page, date))?.markdown).toBe(pending);
  await expectRawMarkdown(page, pending);
});
