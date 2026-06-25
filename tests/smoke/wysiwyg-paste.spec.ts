import { expect, test, type Page } from "@playwright/test";
import { grantClipboardPermissions, pasteFromBrowserClipboard, writeClipboardText } from "./helpers/clipboard";
import {
  expectRawMarkdown,
  focusWysiwygEditorAtEnd,
  openDevelopmentStorage,
  rawMarkdown,
  setRawMarkdown,
  switchToRawMode,
  switchToWysiwygMode
} from "./helpers/editor";

const pastedUrl = "https://example.com/a:b?x=1";
const insertedUrl = "https://example.com/from-keyboard:a?x=1";

test("WYSIWYG URL typing and paste keep raw Markdown link syntax stable", async ({ page }) => {
  await grantClipboardPermissions(page);
  await openDevelopmentStorage(page);

  await focusWysiwygEditorAtEnd(page);
  await insertWysiwygText(page, insertedUrl);
  await expectWysiwygLink(page, insertedUrl);
  await switchToRawMode(page);
  await expectRawMarkdown(page, expectedUrlMarkdown(insertedUrl));
  await expectRawMarkdownNotToEscapeColons(page);

  await setRawMarkdown(page, "");
  await switchToWysiwygMode(page);
  await focusWysiwygEditorAtEnd(page);

  await writeClipboardText(page, pastedUrl);
  await pasteFromBrowserClipboard(page);
  await expectWysiwygText(page, pastedUrl);
  await expectWysiwygLink(page, pastedUrl);

  await switchToRawMode(page);
  await expectRawMarkdown(page, expectedUrlMarkdown(pastedUrl));
  await expectRawMarkdownNotToEscapeColons(page);

  await switchToWysiwygMode(page);
  await placeCursorAtEndOfWysiwygLink(page, pastedUrl);
  await insertWysiwygText(page, " ");
  await switchToRawMode(page);
  await expectRawMarkdown(page, expectedUrlMarkdown(`${pastedUrl} `));
  expect(await rawMarkdown(page)).not.toContain(`[${pastedUrl} ](${pastedUrl})`);
  await expectRawMarkdownNotToEscapeColons(page);
});

async function insertWysiwygText(page: Page, text: string): Promise<void> {
  await page.keyboard.insertText(text);
  if (text.trim().length > 0) {
    await expectWysiwygText(page, text);
  }
  await page.waitForTimeout(500);
}

async function expectWysiwygText(page: Page, text: string): Promise<void> {
  await expect(page.locator(".milkdown-root [contenteditable=\"true\"]")).toContainText(text);
}

async function expectWysiwygLink(page: Page, url: string): Promise<void> {
  const link = page.locator(".milkdown-root a").filter({ hasText: url }).first();
  await expect(link).toHaveAttribute("href", url);
  await expect(link).toHaveText(url);
}

async function placeCursorAtEndOfWysiwygLink(page: Page, url: string): Promise<void> {
  const placed = await page.locator(".milkdown-root [contenteditable=\"true\"]").evaluate((editor, targetUrl) => {
    const link = [...editor.querySelectorAll("a")].find((candidate) => candidate.getAttribute("href") === targetUrl);
    if (!(link instanceof HTMLAnchorElement)) return false;
    const text = link.firstChild;
    if (!(text instanceof Text)) return false;
    (editor as HTMLElement).focus();
    const range = document.createRange();
    range.setStart(text, text.data.length);
    range.collapse(true);
    const selection = getSelection();
    selection?.removeAllRanges();
    selection?.addRange(range);
    return document.activeElement === editor;
  }, url);
  expect(placed, "Could not place the cursor at the end of the pasted WYSIWYG link.").toBe(true);
}

function expectedUrlMarkdown(url: string): string {
  const trailingSpace = url.endsWith(" ") ? " " : "";
  const trimmedUrl = trailingSpace.length > 0 ? url.trimEnd() : url;
  return `<${trimmedUrl}>${trailingSpace}\n`;
}

async function expectRawMarkdownNotToEscapeColons(page: Page): Promise<void> {
  expect(await rawMarkdown(page)).not.toContain("\\:");
}
