import { expect, test, type Page } from "@playwright/test";
import {
  openDevelopmentStorage,
  setRawMarkdown,
  switchToWysiwygMode
} from "../helpers/editor";

test.beforeEach(async ({ page }) => {
  await openDevelopmentStorage(page);
});

test("typing a space then using the toolbar code button keeps the space outside the code span", async ({ page }) => {
  await setRawMarkdown(page, "");
  await switchToWysiwygMode(page);

  const editor = page.locator(".milkdown-root [contenteditable='true']");
  await editor.focus();
  await page.keyboard.type("Use ");
  await page.waitForTimeout(200);

  const codeButton = page.getByRole("button", { name: "Toggle inline code format" });
  await codeButton.click();
  await page.keyboard.type("code", { delay: 0 });
  await page.waitForTimeout(500);
  await codeButton.click();
  await page.waitForTimeout(500);

  await expectUnderlyingMarkdown(page, "Use `code`");
});

test("typing a space then code at a mid-sentence cursor keeps the space outside", async ({ page }) => {
  const markdown = "Use foo today";

  await setRawMarkdown(page, markdown);
  await switchToWysiwygMode(page);
  await clickAtTextOffset(page, "Use foo today", "Use ".length);
  const codeButton = page.getByRole("button", { name: "Toggle inline code format" });
  await codeButton.click();
  await page.keyboard.type("bar", { delay: 0 });
  await page.waitForTimeout(500);
  await codeButton.click();
  await page.waitForTimeout(500);

  await expectUnderlyingMarkdown(page, "Use `bar`foo today");
});

test("typing code at a double-space gap keeps both spaces outside the code span", async ({ page }) => {
  const markdown = "Use  today";

  await setRawMarkdown(page, markdown);
  await switchToWysiwygMode(page);
  await clickAtTextOffset(page, "Use  today", "Use ".length);
  const codeButton = page.getByRole("button", { name: "Toggle inline code format" });
  await codeButton.click();
  await page.keyboard.type("foo", { delay: 0 });
  await page.waitForTimeout(500);
  await codeButton.click();
  await page.waitForTimeout(500);

  await expectUnderlyingMarkdown(page, "Use `foo` today");
});

async function clickAtTextOffset(page: Page, text: string, offset: number): Promise<void> {
  const box = await page.evaluate(([text, offset]) => {
    const editor = document.querySelector(".milkdown-root [contenteditable='true']");
    if (!(editor instanceof HTMLElement)) return null;
    const walker = document.createTreeWalker(editor, NodeFilter.SHOW_TEXT);
    let node = walker.nextNode();
    while (node !== null) {
      const value = node.textContent ?? "";
      const index = value.indexOf(text);
      if (index !== -1) {
        const range = document.createRange();
        range.setStart(node, index + offset);
        range.collapse(true);
        const rect = range.getBoundingClientRect();
        return { x: rect.left + 1, y: rect.top + rect.height / 2 };
      }
      node = walker.nextNode();
    }
    return null;
  }, [text, offset] as const);
  if (box === null) throw new Error(`Text not found: ${JSON.stringify(text)}`);
  await page.mouse.click(box.x, box.y);
  await page.waitForTimeout(150);
}

async function expectUnderlyingMarkdown(page: Page, expected: string): Promise<void> {
  await expect.poll(async () => await page.evaluate(() => {
    const textarea = document.querySelector('textarea[aria-label="Markdown text editor"]');
    return textarea instanceof HTMLTextAreaElement ? textarea.value.replace(/\n$/, "") : null;
  })).toBe(expected);
}
