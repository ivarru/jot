import { expect, test } from "@playwright/test";
import {
  expectRawMarkdown,
  focusRawEditorAtEnd,
  focusRawEditorRange,
  focusWysiwygEditorAtEnd,
  openDevelopmentStorage,
  setRawMarkdown,
  switchToWysiwygMode,
  wysiwygEditor
} from "../helpers/editor";
import { seedLocalDraft } from "../helpers/idb";

test("inserts a tag in the trailing empty WYSIWYG paragraph", async ({ page }) => {
  await openDevelopmentStorage(page);
  await setRawMarkdown(page, "abcd\n\nefgh");
  await switchToWysiwygMode(page);
  await focusWysiwygEditorAtEnd(page);
  await page.keyboard.press("Enter");
  const focused = await wysiwygEditor(page).evaluate((editor) => {
    const paragraph = editor.lastElementChild;
    if (!(paragraph instanceof HTMLParagraphElement) || paragraph.textContent !== "") return false;
    (editor as HTMLElement).focus();
    const selection = getSelection();
    const range = document.createRange();
    range.setStart(paragraph, 0);
    range.collapse(true);
    selection?.removeAllRanges();
    selection?.addRange(range);
    document.dispatchEvent(new Event("selectionchange"));
    return selection?.anchorNode === paragraph && selection.anchorOffset === 0;
  });
  expect(focused, "Could not focus the trailing empty WYSIWYG paragraph.").toBe(true);

  await page.getByRole("button", { name: "Add tag", exact: true }).click();
  const modal = page.locator(".tag-modal");
  await modal.getByRole("combobox", { name: "Tag" }).fill("tail");
  await modal.getByRole("button", { name: "Add", exact: true }).click();

  await expectRawMarkdown(page, "abcd\n\nefgh\n\n[#tail](jot:tag/tail)");
});

test("tags can be inserted, rendered, suggested, and removed from suggestions", async ({ page }) => {
  await openDevelopmentStorage(page);
  const initial = "Lead paragraph\n\n# Plan [#research](jot:tag/research)\n\nReview";
  const date = await page.getByRole("textbox", { name: "Selected date", exact: true }).inputValue();
  await seedLocalDraft(page, date, initial);
  await page.reload();
  await expect(wysiwygEditor(page)).toBeVisible();
  await expectRawMarkdown(page, initial);
  const modal = page.locator(".tag-modal");

  const headingStart = initial.indexOf("#");
  await focusRawEditorRange(page, 0, headingStart);
  await page.keyboard.press(process.platform === "darwin" ? "Meta+Alt+K" : "Control+Alt+K");
  await expect(modal).toBeHidden();

  const headingTextOffset = initial.indexOf("Plan") + 2;
  await focusRawEditorRange(page, headingTextOffset, headingTextOffset);
  await page.keyboard.press(process.platform === "darwin" ? "Meta+Alt+K" : "Control+Alt+K");
  await expect(modal).toBeHidden();

  const tagLabelOffset = initial.indexOf("#research") + 2;
  await focusRawEditorRange(page, tagLabelOffset, tagLabelOffset);
  await page.keyboard.press(process.platform === "darwin" ? "Meta+Alt+K" : "Control+Alt+K");
  await expect(modal).toBeHidden();

  await focusRawEditorAtEnd(page);

  await page.keyboard.press(process.platform === "darwin" ? "Meta+Alt+K" : "Control+Alt+K");
  await expect(modal).toBeVisible();
  await expect(modal.getByRole("button", { name: "#research", exact: true })).toBeVisible();
  const tagInput = modal.getByRole("combobox", { name: "Tag" });
  await tagInput.fill("res");
  await expect(modal.getByRole("button", { name: "#research", exact: true })).toBeVisible();
  await tagInput.press("ArrowDown");
  await expect(tagInput).toHaveValue("research");
  await expect(modal.getByRole("option", { selected: true })).toContainText("#research");
  await tagInput.press("Enter");

  const selectedSuggestionMarkdown = `${initial} [#research](jot:tag/research)`;
  await expectRawMarkdown(page, selectedSuggestionMarkdown);
  await focusRawEditorAtEnd(page);
  await page.keyboard.press(process.platform === "darwin" ? "Meta+Alt+K" : "Control+Alt+K");
  await expect(modal).toBeVisible();
  await tagInput.fill("Follow Up");
  await modal.getByRole("button", { name: "Add", exact: true }).click();

  const expected = `${selectedSuggestionMarkdown} [#follow-up](jot:tag/follow-up)`;
  await expectRawMarkdown(page, expected);
  await switchToWysiwygMode(page);

  const renderedTag = page.locator('.milkdown-root a[href="jot:tag/follow-up"]');
  const headingTag = page.locator('.milkdown-root h1 a[href="jot:tag/research"]');
  await expect(renderedTag).toHaveText("#follow-up");
  await expect(headingTag).toHaveText("#research");
  expect(await renderedTag.evaluate((element) => getComputedStyle(element).backgroundColor)).not.toBe("rgba(0, 0, 0, 0)");
  expect(await headingTag.evaluate((element) => getComputedStyle(element).fontSize)).toBe(
    await renderedTag.evaluate((element) => getComputedStyle(element).fontSize)
  );

  const addTagButton = page.getByRole("button", { name: "Add tag", exact: true });
  await expect(addTagButton).toHaveAttribute(
    "data-tooltip",
    `Add tag (${process.platform === "darwin" ? "Cmd+Option+K" : "Ctrl+Alt+K"})`
  );
  await addTagButton.click();
  await modal.getByRole("button", { name: "Remove #research from suggestions", exact: true }).click();
  await expect(modal.getByRole("button", { name: "#research", exact: true })).toHaveCount(0);
  await modal.getByRole("button", { name: "Cancel", exact: true }).click();

  await addTagButton.click();
  await expect(modal.getByRole("button", { name: "#research", exact: true })).toHaveCount(0);
  await modal.getByRole("button", { name: "#follow-up", exact: true }).click();
  await expect(modal.locator("input")).toHaveValue("follow-up");
  await modal.getByRole("button", { name: "Cancel", exact: true }).click();
  await expectRawMarkdown(page, expected);
});
