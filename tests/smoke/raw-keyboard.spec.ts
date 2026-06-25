import { expect, test, type Page } from "@playwright/test";
import {
  expectNormalizedRawMarkdown,
  expectRawMarkdown,
  expectRawSelection,
  expectRawSelectionRange,
  focusRawEditor,
  focusRawEditorAtEnd,
  focusRawEditorRange,
  focusWysiwygEditor,
  focusWysiwygEditorAtEnd,
  focusWysiwygTextOffset,
  normalizeMarkdown,
  openDevelopmentStorage,
  pressOpenLink,
  pressUndo,
  rawMarkdown,
  replaceRawMarkdownWithKeyboard,
  setRawMarkdown,
  switchToRawMode,
  switchToWysiwygMode
} from "./helpers/editor";
import { seedLocalDraft } from "./helpers/idb";

test.beforeEach(async ({ page }) => {
  await openDevelopmentStorage(page);
  await switchToRawMode(page);
});

test("raw Tab indentation participates in undo", async ({ page }) => {
  await assertRawTabUndo(page, "plain line", "* plain line");
  await assertRawTabUndo(page, "abc\ndef\\\nghi", "* abc\n  def\\\n  ghi");
  await assertRawTabNoop(page, "| A | B |\n| --- | --- |\n| one | two |");
  await assertRawTabUndo(page, "# Heading", "Heading");
});

test("raw undo survives mode switches and stays out of WYSIWYG history", async ({ page }) => {
  await assertRawUndoSurvivesModeSwitch(page);
  await assertRawEditDoesNotEnterWysiwygUndo(page);
  await assertWysiwygUndoStopsAtRawHistoryBoundary(page);
});

test("mode switches preserve WYSIWYG cursor positions and selections", async ({ page }) => {
  await assertWysiwygCursorSurvivesSwitchToRaw(page);
  await assertWysiwygTypingCursorSurvivesSwitchToRaw(page);
  await assertSelectionSurvivesModeSwitches(page);
});

test("WYSIWYG typing can edit between rendered full links", async ({ page }) => {
  await assertWysiwygTypingBetweenRenderedFullLinks(page);
});

test("raw internal section link shortcut opens the target section", async ({ page }) => {
  await assertRawInternalSectionLinkShortcut(page);
});

async function assertRawTabUndo(page: Page, before: string, afterTab: string): Promise<void> {
  await replaceRawMarkdownWithKeyboard(page, before);
  await page.keyboard.press("Tab");
  await expectRawMarkdown(page, afterTab);
  await pressUndo(page);
  if (normalizeMarkdown(await rawMarkdown(page)) !== before) {
    await pressUndo(page, process.platform !== "darwin");
  }
  await expectNormalizedRawMarkdown(page, before);
}

async function assertRawTabNoop(page: Page, markdown: string): Promise<void> {
  await replaceRawMarkdownWithKeyboard(page, markdown);
  await focusRawEditorRange(page, markdown.length, markdown.length);
  await page.keyboard.press("Tab");
  await expectRawMarkdown(page, markdown);
  await expectRawSelectionRange(page, markdown.length, markdown.length);
}

async function assertWysiwygUndoStopsAtRawHistoryBoundary(page: Page): Promise<void> {
  await setRawMarkdown(page, "");

  await switchToWysiwygMode(page);
  await focusWysiwygEditor(page);
  await page.keyboard.type("A");
  await expectUnderlyingMarkdown(page, "A");

  await setRawMarkdown(page, "AB");
  await focusRawEditorAtEnd(page);

  await switchToWysiwygMode(page);
  await focusWysiwygEditorAtEnd(page);
  await page.keyboard.type("C");
  await expectUnderlyingMarkdown(page, "ABC");

  await pressUndo(page);
  await expectUnderlyingMarkdown(page, "AB");
  await expect(page.getByRole("button", { name: "Undo" })).toBeDisabled();

  await pressUndo(page);
  await expectUnderlyingMarkdown(page, "AB");
}

async function assertRawUndoSurvivesModeSwitch(page: Page): Promise<void> {
  const markdown = "undo survives mode switches";
  await setRawMarkdown(page, "");
  await focusRawEditor(page);
  await page.keyboard.insertText(markdown);
  await expectRawMarkdown(page, markdown);

  await switchToWysiwygMode(page);
  await switchToRawMode(page);
  await focusRawEditor(page);
  await pressUndo(page);
  if (await rawMarkdown(page) !== "") {
    await pressUndo(page, process.platform !== "darwin");
  }
  await expectRawMarkdown(page, "");
}

async function assertRawEditDoesNotEnterWysiwygUndo(page: Page): Promise<void> {
  const before = "before raw edit";
  const after = `${before}\nraw mode change`;
  await setRawMarkdown(page, before);
  await switchToWysiwygMode(page);
  await switchToRawMode(page);
  await focusRawEditorAtEnd(page);
  await page.keyboard.insertText(after.slice(before.length));
  await expectRawMarkdown(page, after);

  await switchToWysiwygMode(page);
  await focusWysiwygEditor(page);
  await pressUndo(page);
  await expectUnderlyingMarkdown(page, after);
}

async function assertWysiwygCursorSurvivesSwitchToRaw(page: Page): Promise<void> {
  const markdown = Array.from({ length: 20 }, (_item, index) => `- item ${index + 1}`).join("\n");
  await setRawMarkdown(page, markdown);
  await switchToWysiwygMode(page);
  await focusWysiwygEditorAtEnd(page);
  await page.waitForTimeout(100);

  await switchToRawMode(page);
  await expectRawSelection(page, markdown.length);
}

async function assertWysiwygTypingCursorSurvivesSwitchToRaw(page: Page): Promise<void> {
  const before = "ab";
  const inserted = "XYZ";
  await setRawMarkdown(page, before);
  await switchToWysiwygMode(page);
  await focusWysiwygEditorAtEnd(page);
  await page.keyboard.type(inserted);
  await expectUnderlyingMarkdown(page, `${before}${inserted}`);
  await focusWysiwygEditorAtEnd(page);
  await page.waitForTimeout(100);

  await switchToRawMode(page);
  await expectRawSelection(page, normalizeMarkdown(await rawMarkdown(page)).length);
}

async function assertWysiwygTypingBetweenRenderedFullLinks(page: Page): Promise<void> {
  const before = "[first](https://example.com/first) middle [second](https://example.com/second)";
  const after = "[first](https://example.com/first) middle edit [second](https://example.com/second)";
  await setRawMarkdown(page, before);
  await switchToWysiwygMode(page);
  await focusWysiwygTextOffset(page, "middle", "middle".length);
  await cdpInsertText(page, " edit");
  await expectUnderlyingMarkdown(page, after);
}

async function assertSelectionSurvivesModeSwitches(page: Page): Promise<void> {
  const markdown = "before selected after";
  const start = markdown.indexOf("selected");
  const end = start + "selected".length;
  await setRawMarkdown(page, markdown);
  await focusRawEditorRange(page, start, end);

  await switchToWysiwygMode(page);
  await page.waitForTimeout(100);
  await page.keyboard.type("chosen");
  await expectUnderlyingMarkdown(page, "before chosen after");

  await setRawMarkdown(page, markdown);
  await switchToWysiwygMode(page);
  await focusWysiwygEditor(page);
  await page.locator(".milkdown-root [contenteditable=\"true\"]").click();
  await cdpSelectAll(page);
  await switchToRawMode(page);
  await expectRawSelectionRange(page, 0, markdown.length);
}

async function assertRawInternalSectionLinkShortcut(page: Page): Promise<void> {
  const targetDate = "2030-02-01";
  const targetMarkdown = "# Decisions\n\nBody";
  const sourceMarkdown = `See [decision](#/date/${targetDate}#decisions)`;
  await seedLocalDraft(page, targetDate, targetMarkdown);
  await setRawMarkdown(page, sourceMarkdown);

  const cursor = sourceMarkdown.indexOf("decision");
  await focusRawEditorRange(page, cursor, cursor);
  await pressOpenLink(page);

  await expect.poll(async () => new URL(page.url()).hash).toBe(`#/date/${targetDate}#decisions`);
  await expectRawMarkdown(page, targetMarkdown);
  await expectRawSelectionRange(page, "# ".length, "# Decisions".length);

  const relativeMarkdown = "# Decisions\n\nSee [decision](#decisions)";
  await setRawMarkdown(page, relativeMarkdown);
  await focusRawEditorRange(page, relativeMarkdown.indexOf("decision"), relativeMarkdown.indexOf("decision"));
  await pressOpenLink(page);
  await expect.poll(async () => new URL(page.url()).hash).toBe(`#/date/${targetDate}#decisions`);
  await expectRawSelectionRange(page, "# ".length, "# Decisions".length);
}

async function expectUnderlyingMarkdown(page: Page, expected: string): Promise<void> {
  await expect.poll(async () => await page.evaluate(() => {
    const textarea = document.querySelector('textarea[aria-label="Markdown text editor"]');
    return textarea instanceof HTMLTextAreaElement ? textarea.value.replace(/\n$/, "") : null;
  })).toBe(expected);
}

async function cdpInsertText(page: Page, text: string): Promise<void> {
  const client = await page.context().newCDPSession(page);
  try {
    await client.send("Input.insertText", { text });
  } finally {
    await client.detach();
  }
}

async function cdpSelectAll(page: Page): Promise<void> {
  const client = await page.context().newCDPSession(page);
  const modifier = process.platform === "darwin"
    ? { key: "Meta", code: "MetaLeft", windowsVirtualKeyCode: 91, nativeVirtualKeyCode: 91, modifiers: 4 }
    : { key: "Control", code: "ControlLeft", windowsVirtualKeyCode: 17, nativeVirtualKeyCode: 17, modifiers: 2 };
  try {
    await client.send("Input.dispatchKeyEvent", { type: "keyDown", ...modifier });
    await client.send("Input.dispatchKeyEvent", {
      type: "keyDown",
      key: "a",
      code: "KeyA",
      windowsVirtualKeyCode: 65,
      nativeVirtualKeyCode: 65,
      modifiers: modifier.modifiers,
      commands: ["SelectAll"]
    });
    await client.send("Input.dispatchKeyEvent", {
      type: "keyUp",
      key: "a",
      code: "KeyA",
      windowsVirtualKeyCode: 65,
      nativeVirtualKeyCode: 65,
      modifiers: modifier.modifiers
    });
    await client.send("Input.dispatchKeyEvent", {
      type: "keyUp",
      key: modifier.key,
      code: modifier.code,
      windowsVirtualKeyCode: modifier.windowsVirtualKeyCode,
      nativeVirtualKeyCode: modifier.nativeVirtualKeyCode
    });
  } finally {
    await client.detach();
  }
}
