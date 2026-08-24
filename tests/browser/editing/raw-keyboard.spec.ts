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
} from "../helpers/editor";
import { readFakeRemoteNote, readLocalDraft, seedLocalDraft } from "../helpers/idb";

test.beforeEach(async ({ page }) => {
  await openDevelopmentStorage(page, "/", "disabled");
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

test("WYSIWYG typing after a rendered link stays outside the link", async ({ page }) => {
  const url = "https://example.com/a:b?x=1";

  await setRawMarkdown(page, `See <${url}>`);
  await switchToWysiwygMode(page);
  await focusWysiwygTextOffset(page, url, url.length);
  await cdpInsertText(page, "next");
  await expectUnderlyingMarkdown(page, `See <${url}>next`);
});

test("WYSIWYG typing after a rendered link in a heading stays outside the link", async ({ page }) => {
  const url = "https://example.com/a:b?x=1";

  await setRawMarkdown(page, `# Heading <${url}>`);
  await switchToWysiwygMode(page);
  await focusWysiwygTextOffset(page, url, url.length);
  await cdpInsertText(page, "next");
  await expectUnderlyingMarkdown(page, `# Heading <${url}>next`);
});

test("WYSIWYG inline Markdown still synchronizes away from a heading link", async ({ page }) => {
  const url = "https://example.com/a:b?x=1";

  await setRawMarkdown(page, `# Heading <${url}>`);
  await switchToWysiwygMode(page);
  await focusWysiwygTextOffset(page, "Heading", 3);
  await cdpInsertText(page, " *important* ");
  await expect(page.locator(".milkdown-root h1 em")).toHaveText("important");
  await expectUnderlyingMarkdown(page, `# Hea *important* ding <${url}>`);
});

test("WYSIWYG inline-code boundary typing follows the visible caret side", async ({ page }) => {
  const markdown = "Use `foo` today";

  await setRawMarkdown(page, markdown);
  await switchToWysiwygMode(page);
  await focusWysiwygTextOffset(page, "foo", 0);
  await page.keyboard.insertText("X");
  await expectUnderlyingMarkdown(page, "Use `Xfoo` today");

  await setRawMarkdown(page, markdown);
  await switchToWysiwygMode(page);
  await focusWysiwygTextOffset(page, " today", 0);
  await page.keyboard.insertText("X");
  await expectUnderlyingMarkdown(page, "Use `foo`X today");
});

test("WYSIWYG inline-code toolbar exit keeps following text outside code", async ({ page }) => {
  const markdown = "`foo`";
  const codeEnd = markdown.lastIndexOf("`");

  await setRawMarkdown(page, markdown);
  await focusRawEditorRange(page, codeEnd, codeEnd);
  await switchToWysiwygMode(page);
  await page.getByRole("button", { name: "Toggle inline code format" }).click();
  await page.keyboard.insertText("bar");

  await expectUnderlyingMarkdown(page, "`foo`bar");
});

test("WYSIWYG collapsed inline-code toggle persists until toggled off", async ({ page }) => {
  const markdown = "Use today";
  const cursor = "Use".length;

  await setRawMarkdown(page, markdown);
  await focusRawEditorRange(page, cursor, cursor);
  await switchToWysiwygMode(page);
  const codeButton = page.getByRole("button", { name: "Toggle inline code format" });
  await codeButton.click();
  await page.keyboard.type("abc", { delay: 50 });
  await codeButton.click();
  await page.keyboard.type("xy", { delay: 50 });

  await expectUnderlyingMarkdown(page, "Use`abc`xy today");
});

test("WYSIWYG inline code formats the selected list text after an HTML break", async ({ page }) => {
  const markdown = "<br />\n\n* foo: bar\n* baz";
  const start = markdown.indexOf("bar");

  await setRawMarkdown(page, markdown);
  await focusRawEditorRange(page, start, start + "bar".length);
  await switchToWysiwygMode(page);
  await page.getByRole("button", { name: "Toggle inline code format" }).click();

  await expectUnderlyingMarkdown(page, "<br />\n\n* foo: `bar`\n* baz");
});

test("background saving preserves a compact list of links", async ({ page }) => {
  const markdown = [
    "* [pi-msg (github.com)](https://github.com/zachpmanson/pi-msg)",
    "* [omp (Oh my Pi)](https://omp.sh/)",
    "* [Weakest link oldest theorem (Pedro Santa Clara, www.linkedin.com)](https://www.linkedin.com/pulse/weakest-link-oldest-theorem-pedro-santa-clara-vl6oe/)"
  ].join("\n");

  await setRawMarkdown(page, markdown);
  await switchToWysiwygMode(page);
  await page.evaluate(() => {
    Object.defineProperty(document, "visibilityState", { configurable: true, value: "hidden" });
    document.dispatchEvent(new Event("visibilitychange"));
    Object.defineProperty(document, "visibilityState", { configurable: true, value: "visible" });
    document.dispatchEvent(new Event("visibilitychange"));
  });

  await expectNormalizedRawMarkdown(page, markdown);
});

test("Compactify lists removes gaps between nested and task list items", async ({ page }) => {
  await setRawMarkdown(page, [
    "* one",
    "",
    "* two",
    "",
    "  * nested one",
    "",
    "  * nested two",
    "",
    "* [ ] three",
    "",
    "* [x] four"
  ].join("\n"));

  await page.getByRole("button", { name: "Open menu" }).click();
  await page.getByRole("menuitem", { name: "Compactify lists" }).click();

  await expectNormalizedRawMarkdown(page, [
    "* one",
    "* two",
    "  * nested one",
    "  * nested two",
    "* [ ] three",
    "* [x] four"
  ].join("\n"));
});

test("raw compactification replaces the hidden WYSIWYG document before background saving", async ({ page }) => {
  const looseMarkdown = "* first\n\n* second";
  const compactMarkdown = "* first\n* second";

  await setRawMarkdown(page, looseMarkdown);
  await switchToWysiwygMode(page);
  await switchToRawMode(page);
  const blankLine = looseMarkdown.indexOf("\n\n");
  await focusRawEditorRange(page, blankLine + 1, blankLine + 2);
  await page.keyboard.press("Backspace");
  await expectRawMarkdown(page, compactMarkdown);
  await switchToWysiwygMode(page);
  await expect(page.locator(".milkdown-root ul")).toHaveAttribute("data-spread", "false");
  await page.evaluate(() => {
    Object.defineProperty(document, "visibilityState", { configurable: true, value: "hidden" });
    document.dispatchEvent(new Event("visibilitychange"));
    Object.defineProperty(document, "visibilityState", { configurable: true, value: "visible" });
    document.dispatchEvent(new Event("visibilitychange"));
  });

  await expectNormalizedRawMarkdown(page, compactMarkdown);
});

test("equivalent background snapshots do not replace the live WYSIWYG document", async ({ page }) => {
  await setRawMarkdown(page, "before");
  await switchToWysiwygMode(page);
  await focusWysiwygEditorAtEnd(page);
  await page.keyboard.insertText("A");
  const editor = page.locator(".milkdown-root [contenteditable=\"true\"]");
  await expect(editor).toHaveText("beforeA");
  await expect(editor).toBeFocused();

  await page.evaluate(() => {
    Object.defineProperty(document, "visibilityState", { configurable: true, value: "hidden" });
    document.dispatchEvent(new Event("visibilitychange"));
  });

  await expect(editor).toBeFocused();
  await expect(editor).toHaveAttribute("contenteditable", "true");
  expect(await editor.evaluate((element) => {
    const selection = getSelection();
    return {
      anchorInsideEditor: selection?.anchorNode !== null && element.contains(selection?.anchorNode ?? null),
      collapsed: selection?.isCollapsed,
      text: element.textContent
    };
  })).toEqual({
    anchorInsideEditor: true,
    collapsed: true,
    text: "beforeA"
  });
});

test("a trailing-space background snapshot does not reset the live WYSIWYG selection", async ({ page }) => {
  await setRawMarkdown(page, "before");
  await switchToWysiwygMode(page);
  await focusWysiwygEditorAtEnd(page);
  await page.keyboard.insertText("A ");
  await expectUnderlyingMarkdown(page, "beforeA ");
  const editor = page.locator(".milkdown-root [contenteditable=\"true\"]");
  await expect(editor).toBeFocused();

  await page.evaluate(() => {
    Object.defineProperty(document, "visibilityState", { configurable: true, value: "hidden" });
    document.dispatchEvent(new Event("visibilitychange"));
  });

  await expect(editor).toBeFocused();
  await page.keyboard.insertText("B");
  await expectUnderlyingMarkdown(page, "beforeA B");
});

test("returning to a background-synced note restores focus without interrupting typing", async ({ page }) => {
  const initial = "before after";
  await setRawMarkdown(page, initial);
  await switchToWysiwygMode(page);
  await focusWysiwygTextOffset(page, "before", "before".length);
  await page.keyboard.insertText("A");
  await expectUnderlyingMarkdown(page, "beforeA after");

  const editor = page.locator(".milkdown-root [contenteditable=\"true\"]");
  await page.evaluate(() => {
    window.dispatchEvent(new Event("blur"));
    const editor = document.querySelector<HTMLElement>(".milkdown-root [contenteditable=\"true\"]");
    editor?.blur();
    Object.defineProperty(document, "visibilityState", { configurable: true, value: "hidden" });
    document.dispatchEvent(new Event("visibilitychange"));
  });
  await expect(editor).not.toBeFocused();
  await expect(page.locator(".sync-status")).toHaveAttribute("aria-label", /Sync status: Synced/);

  await page.evaluate(() => {
    Object.defineProperty(document, "visibilityState", { configurable: true, value: "visible" });
    document.dispatchEvent(new Event("visibilitychange"));
    window.dispatchEvent(new Event("focus"));
    window.dispatchEvent(new Event("pageshow"));
  });
  await expect(editor).toBeFocused();
  await expect(editor).toHaveAttribute("contenteditable", "true");

  for (const [character, delay] of [["B", 250], ["C", 750], ["D", 1_250], ["E", 2_000]] as const) {
    await page.keyboard.insertText(character);
    await page.waitForTimeout(delay);
    await expect(editor).toBeFocused();
  }

  expect(await editor.evaluate((element) => {
    const selection = getSelection();
    return {
      anchorInsideEditor: selection?.anchorNode !== null && element.contains(selection?.anchorNode ?? null),
      collapsed: selection?.isCollapsed
    };
  })).toEqual({ anchorInsideEditor: true, collapsed: true });

  const expected = "beforeABCDE after";
  await expectUnderlyingMarkdown(page, expected);
  await switchToRawMode(page);
  await expectNormalizedRawMarkdown(page, expected);
  await expectRawSelection(page, "beforeABCDE".length);

  const date = await page.locator("input[aria-label='Selected date']").inputValue();
  await expect.poll(async () => normalizeMarkdown((await readFakeRemoteNote(page, date))?.markdown ?? null)).toBe(expected);
  await expect.poll(async () => normalizeMarkdown((await readLocalDraft(page, date))?.markdown ?? null)).toBe(expected);

  await page.reload();
  await expectNormalizedRawMarkdown(page, expected);
});

test("controlled WYSIWYG updates keep delayed typing in order", async ({ page }) => {
  await setRawMarkdown(page, "before after");
  await switchToWysiwygMode(page);
  await focusWysiwygTextOffset(page, "before", "before".length);
  await page.keyboard.type("ABC", { delay: 250 });
  await expectUnderlyingMarkdown(page, "beforeABC after");

  await page.waitForTimeout(3_500);
  await expect(page.locator(".sync-status")).toHaveAttribute("aria-label", /Sync status: Synced/);
  await page.keyboard.type("DEF", { delay: 250 });
  await expectUnderlyingMarkdown(page, "beforeABCDEF after");

  await setRawMarkdown(page, "ending");
  await switchToWysiwygMode(page);
  await focusWysiwygEditorAtEnd(page);
  await page.keyboard.type("XYZ", { delay: 250 });
  await expectUnderlyingMarkdown(page, "endingXYZ");
});

test("loose-list bullets align with their first line of text", async ({ page }) => {
  await setRawMarkdown(page, "* first\n\n* second");
  await switchToWysiwygMode(page);

  const centerOffsets = await page.locator(".milkdown-list-item-block > .list-item").evaluateAll((items) =>
    items.map((item) => {
      const label = item.querySelector(".label-wrapper")?.getBoundingClientRect();
      const paragraph = item.querySelector(".children p")?.getBoundingClientRect();
      if (label === undefined || paragraph === undefined) throw new Error("List item layout is incomplete.");
      return Math.abs((label.top + label.bottom) / 2 - (paragraph.top + paragraph.bottom) / 2);
    })
  );

  expect(centerOffsets).not.toHaveLength(0);
  expect(Math.max(...centerOffsets)).toBeLessThanOrEqual(1);
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
