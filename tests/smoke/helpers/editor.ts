import { expect, type Locator, type Page } from "@playwright/test";

export function rawModeToggle(page: Page): Locator {
  return page.locator("button.raw-mode-toggle[aria-label=\"Toggle raw Markdown\"]");
}

export function rawEditor(page: Page): Locator {
  return page.getByLabel("Markdown text editor");
}

export function wysiwygEditor(page: Page): Locator {
  return page.locator(".milkdown-root [contenteditable=\"true\"]");
}

export async function openDevelopmentStorage(page: Page, path = "/"): Promise<void> {
  await page.goto(path);
  await page.getByRole("button", { name: "Use development storage" }).click();
  await expect(wysiwygEditor(page)).toBeVisible();
}

export async function switchToRawMode(page: Page): Promise<void> {
  const toggle = rawModeToggle(page);
  await expect(toggle).toBeVisible();
  if (await toggle.getAttribute("aria-pressed") !== "true") await toggle.click();
  await expect(rawEditor(page)).toBeVisible();
}

export async function switchToWysiwygMode(page: Page): Promise<void> {
  const toggle = rawModeToggle(page);
  await expect(toggle).toBeVisible();
  if (await toggle.getAttribute("aria-pressed") === "true") await toggle.click();
  await expect(wysiwygEditor(page)).toBeVisible();
}

export async function setRawMarkdown(page: Page, markdown: string): Promise<void> {
  await switchToRawMode(page);
  await rawEditor(page).evaluate((element, value) => {
    if (!(element instanceof HTMLTextAreaElement)) throw new Error("Raw editor is not a textarea.");
    element.value = value;
    element.dispatchEvent(new InputEvent("input", { bubbles: true, inputType: "insertText", data: value }));
  }, markdown);
  await expectRawMarkdown(page, markdown);
}

export async function replaceRawMarkdownWithKeyboard(page: Page, markdown: string): Promise<void> {
  await switchToRawMode(page);
  await focusRawEditor(page);
  await page.keyboard.press("Backspace");
  await expectNormalizedRawMarkdown(page, "");
  await page.keyboard.insertText(markdown);
  await expectRawMarkdown(page, markdown);
}

export async function focusRawEditor(page: Page): Promise<void> {
  const editor = rawEditor(page);
  await expect(editor).toBeVisible();
  await editor.focus();
  await editor.evaluate((element) => {
    if (!(element instanceof HTMLTextAreaElement)) throw new Error("Raw editor is not a textarea.");
    element.select();
  });
  await expect.poll(async () => await rawSelection(page)).toEqual({
    start: 0,
    end: (await rawMarkdown(page)).length
  });
}

export async function focusRawEditorAtEnd(page: Page): Promise<void> {
  const editor = rawEditor(page);
  await expect(editor).toBeVisible();
  await editor.focus();
  await editor.evaluate((element) => {
    if (!(element instanceof HTMLTextAreaElement)) throw new Error("Raw editor is not a textarea.");
    const offset = element.value.length;
    element.setSelectionRange(offset, offset);
  });
}

export async function focusRawEditorRange(page: Page, start: number, end: number): Promise<void> {
  const editor = rawEditor(page);
  await expect(editor).toBeVisible();
  await editor.focus();
  await editor.evaluate(
    (element, range) => {
      if (!(element instanceof HTMLTextAreaElement)) throw new Error("Raw editor is not a textarea.");
      element.setSelectionRange(range.start, range.end);
    },
    { start, end }
  );
  await expect.poll(async () => await rawSelection(page)).toEqual({ start, end });
}

export async function focusWysiwygEditor(page: Page): Promise<void> {
  const editor = wysiwygEditor(page);
  await expect(editor).toBeVisible();
  await editor.focus();
}

export async function focusWysiwygEditorAtEnd(page: Page): Promise<void> {
  await focusWysiwygEditor(page);
  await page.keyboard.press(process.platform === "darwin" ? "Meta+ArrowDown" : "Control+End");
}

export async function focusWysiwygTextOffset(page: Page, text: string, offset: number): Promise<void> {
  const focused = await wysiwygEditor(page).evaluate(
    (editor, input) => {
      const walker = document.createTreeWalker(editor, NodeFilter.SHOW_TEXT);
      let node = walker.nextNode();
      while (node !== null) {
        const value = node.textContent ?? "";
        const index = value.indexOf(input.text);
        if (index !== -1) {
          (editor as HTMLElement).focus();
          const selection = getSelection();
          const range = document.createRange();
          range.setStart(node, index + input.offset);
          range.collapse(true);
          selection?.removeAllRanges();
          selection?.addRange(range);
          document.dispatchEvent(new Event("selectionchange"));
          return document.activeElement === editor &&
            selection?.anchorNode === node &&
            selection.anchorOffset === index + input.offset;
        }
        node = walker.nextNode();
      }
      return false;
    },
    { text, offset }
  );
  expect(focused, `Could not focus WYSIWYG text ${JSON.stringify(text)} at offset ${offset}.`).toBe(true);
}

export async function clickButton(page: Page, name: string): Promise<void> {
  await page.getByRole("button", { name }).first().click();
}

export async function rawMarkdown(page: Page): Promise<string> {
  return await rawEditor(page).evaluate((element) => {
    if (!(element instanceof HTMLTextAreaElement)) throw new Error("Raw editor is not a textarea.");
    return element.value;
  });
}

export async function rawSelection(page: Page): Promise<{ start: number; end: number }> {
  return await rawEditor(page).evaluate((element) => {
    if (!(element instanceof HTMLTextAreaElement)) throw new Error("Raw editor is not a textarea.");
    return {
      start: element.selectionStart,
      end: element.selectionEnd
    };
  });
}

export async function expectRawMarkdown(page: Page, expected: string | RegExp): Promise<void> {
  await switchToRawMode(page);
  if (typeof expected === "string") {
    await expect.poll(async () => await rawMarkdown(page)).toBe(expected);
    return;
  }
  await expect.poll(async () => await rawMarkdown(page)).toMatch(expected);
}

export async function expectNormalizedRawMarkdown(page: Page, expected: string): Promise<void> {
  await switchToRawMode(page);
  await expect.poll(async () => normalizeMarkdown(await rawMarkdown(page))).toBe(expected);
}

export async function expectRawSelection(page: Page, expected: number): Promise<void> {
  await switchToRawMode(page);
  await expect.poll(async () => await rawSelection(page)).toEqual({ start: expected, end: expected });
}

export async function expectRawSelectionRange(page: Page, start: number, end: number): Promise<void> {
  await switchToRawMode(page);
  await expect.poll(async () => await rawSelection(page)).toEqual({ start, end });
}

export async function pressUndo(page: Page, useMac = process.platform === "darwin"): Promise<void> {
  await page.keyboard.press(useMac ? "Meta+Z" : "Control+Z");
}

export async function pressOpenLink(page: Page): Promise<void> {
  await page.keyboard.press("Control+Enter");
}

export async function setTextareaValue(page: Page, selector: string, value: string): Promise<void> {
  const changed = await page.locator(selector).evaluate((element, nextValue) => {
    if (!(element instanceof HTMLTextAreaElement)) return false;
    element.value = nextValue;
    element.dispatchEvent(new InputEvent("input", { bubbles: true, inputType: "insertText", data: nextValue }));
    return true;
  }, value);
  expect(changed, `Could not set textarea ${selector}.`).toBe(true);
}

export function normalizeMarkdown(markdown: string | null): string {
  return typeof markdown === "string" ? markdown.replace(/\n$/, "") : "";
}
