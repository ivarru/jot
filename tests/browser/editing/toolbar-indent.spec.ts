import { expect, test, type Locator, type Page } from "@playwright/test";

test.beforeEach(async ({ page }) => {
  await page.goto("/");
  await page.getByRole("button", { name: "Use development storage" }).click();
  await expect(page.locator(".milkdown-root [contenteditable=\"true\"]")).toBeVisible();
});

test("toolbar indent keeps the WYSIWYG caret on marker-only lines", async ({ page }) => {
  for (const { markdown, line, expected } of [
    {
      markdown: "before\n#",
      line: page.locator(".milkdown-root h1").last(),
      expected: /^before\n\nx/
    },
    {
      markdown: "before\n\n* ",
      line: page.locator(".milkdown-root .content-dom p").last(),
      expected: /^before\n\n\* x/
    }
  ]) {
    await setRawMarkdown(page, markdown);
    await switchToWysiwygMode(page);
    await line.click();

    await clickToolbarButtonAndType(page, "Indent", "x");

    await expectRawMarkdown(page, expected);
  }
});

test("toolbar indent keeps the WYSIWYG caret on a freshly entered empty paragraph", async ({ page }) => {
  await typeFreshEmptyParagraph(page, "abc");

  await clickToolbarButtonAndType(page, "Indent", "x");

  await expectRawMarkdown(page, /^abc\n\n\* x/);
});

test("toolbar dedent keeps the WYSIWYG caret on a freshly entered empty paragraph", async ({ page }) => {
  await typeFreshEmptyParagraph(page, "abc");

  await clickToolbarButtonAndType(page, "Dedent", "x");

  await expectRawMarkdown(page, /^abc\n\n# x/);
});

test("toolbar dedent keeps the WYSIWYG caret on an empty heading", async ({ page }) => {
  await setRawMarkdown(page, "before\n#");
  await switchToWysiwygMode(page);
  await page.locator(".milkdown-root h1").last().click();

  await clickToolbarButtonAndType(page, "Dedent", "x");

  await expectRawMarkdown(page, /^before\s*\n## x/);
});

async function typeFreshEmptyParagraph(page: Page, text: string): Promise<void> {
  const editable = page.locator(".milkdown-root [contenteditable=\"true\"]");
  await editable.click();
  await page.keyboard.type(text);
  await page.keyboard.press("Enter");
}

async function clickToolbarButtonAndType(page: Page, buttonName: string, text: string): Promise<void> {
  await page.getByRole("button", { name: buttonName }).click();
  await page.keyboard.type(text);
}

async function setRawMarkdown(page: Page, markdown: string): Promise<void> {
  await switchToRawMode(page);
  const textarea = page.getByLabel("Markdown text editor");
  await textarea.fill(markdown);
}

async function switchToRawMode(page: Page): Promise<void> {
  const toggle = rawModeToggle(page);
  await expect(toggle).toBeVisible();
  if (await toggle.getAttribute("aria-pressed") !== "true") await toggle.click();
  await expect(page.getByLabel("Markdown text editor")).toBeVisible();
}

async function switchToWysiwygMode(page: Page): Promise<void> {
  const toggle = rawModeToggle(page);
  await expect(toggle).toBeVisible();
  if (await toggle.getAttribute("aria-pressed") === "true") await toggle.click();
  await expect(page.locator(".milkdown-root [contenteditable=\"true\"]")).toBeVisible();
}

async function expectRawMarkdown(page: Page, expected: RegExp): Promise<void> {
  await switchToRawMode(page);
  await expect.poll(async () => await rawMarkdown(page)).toMatch(expected);
}

async function rawMarkdown(page: Page): Promise<string> {
  return await page.getByLabel("Markdown text editor").evaluate((element) => {
    if (!(element instanceof HTMLTextAreaElement)) throw new Error("Raw editor is not a textarea.");
    return element.value;
  });
}

function rawModeToggle(page: Page): Locator {
  return page.locator("button.raw-mode-toggle[aria-label=\"Toggle raw Markdown\"]");
}
