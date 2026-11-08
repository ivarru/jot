import { expect, test } from "@playwright/test";
import { openDevelopmentStorage, setRawMarkdown, switchToWysiwygMode, focusRawEditorRange, expectRawMarkdown } from "../helpers/editor";

test.use({ hasTouch: true });

for (const mode of ["text", "wysiwyg"] as const) {
  for (const [label, marker, tag] of [["Bold", "**", "strong"], ["Italic", "*", "em"],
    ["Strikethrough", "~~", "del"], ["Inline code", "`", "code"]] as const) {
    test(`phone ${mode}: ${label} preserves selection and supports undo`, async ({ page }) => {
      await page.setViewportSize({ width: 360, height: 740 });
      await openDevelopmentStorage(page, "/#/date/2030-02-04", "disabled");
      await setRawMarkdown(page, "hello world");
      if (mode === "text") await focusRawEditorRange(page, 0, 5);
      else {
        await switchToWysiwygMode(page);
        await page.locator('.milkdown-root [contenteditable="true"]').evaluate((editor) => {
          const text = editor.querySelector("p")!.firstChild!;
          const range = document.createRange(); range.setStart(text, 0); range.setEnd(text, 5);
          editor.focus(); window.getSelection()!.removeAllRanges(); window.getSelection()!.addRange(range);
          document.dispatchEvent(new Event("selectionchange"));
        });
      }
      await expect(page.getByRole("button", { name: "Toggle bold format", exact: true })).toBeHidden();
      await page.getByRole("button", { name: "Text formatting", exact: true }).click();
      const menu = page.getByRole("group", { name: "Text formatting options" });
      await expect(menu).toBeVisible();
      const bounds = (await menu.boundingBox())!;
      expect(bounds.x).toBeGreaterThanOrEqual(0); expect(bounds.x + bounds.width).toBeLessThanOrEqual(360);
      await menu.getByRole("button", { name: label, exact: true }).click();
      await expect(menu).toHaveCount(0);
      if (mode === "text") await expectRawMarkdown(page, `${marker}hello${marker} world`);
      else await expect(page.locator(`.milkdown-root [contenteditable="true"] ${tag}`)).toHaveText("hello");
      await page.getByRole("button", { name: "Undo", exact: true }).click();
      await expectRawMarkdown(page, /^hello world\n?$/);
    });
  }
}

test("phone formatting menu cannot apply an old selection after changing dates", async ({ page }) => {
  await page.setViewportSize({ width: 360, height: 740 });
  await openDevelopmentStorage(page, "/#/date/2030-02-04", "disabled");
  await setRawMarkdown(page, "Keep date A");
  await focusRawEditorRange(page, 0, 4);
  await page.getByRole("button", { name: "Text formatting", exact: true }).click();
  await page.evaluate(() => { window.location.hash = "#/date/2030-02-05"; });
  await expect(page.getByLabel("Selected date", { exact: true })).toHaveValue("2030-02-05");
  await expect(page.getByRole("group", { name: "Text formatting options" })).toHaveCount(0);
  await expectRawMarkdown(page, "");
  await page.evaluate(() => { window.location.hash = "#/date/2030-02-04"; });
  await expectRawMarkdown(page, "Keep date A");
});

test("single-tilde strikethrough renders and serializes as double tildes when edited", async ({ page }) => {
  await openDevelopmentStorage(page, "/#/date/2030-02-04", "disabled");
  await setRawMarkdown(page, "~redacted~");
  await switchToWysiwygMode(page);
  const editor = page.locator('.milkdown-root [contenteditable="true"]');
  await expect(editor.locator("del")).toHaveText("redacted");
  await editor.locator("del").click();
  await page.keyboard.press("ArrowLeft");
  await page.keyboard.type("x");
  await expectRawMarkdown(page, /^~~.*x.*~~\n?$/);
});

test("phone menu supports Escape and keyboard use; desktop retains direct controls", async ({ page }) => {
  await page.setViewportSize({ width: 360, height: 740 });
  await openDevelopmentStorage(page, "/#/date/2030-02-04", "disabled");
  await setRawMarkdown(page, "hello");
  await focusRawEditorRange(page, 0, 5);
  const trigger = page.getByRole("button", { name: "Text formatting", exact: true });
  await trigger.focus(); await page.keyboard.press("Enter");
  const menu = page.getByRole("group", { name: "Text formatting options" });
  await expect(menu.getByRole("button", { name: "Bold", exact: true })).toBeFocused();
  await page.keyboard.press("Escape");
  await expect(menu).toHaveCount(0); await expect(trigger).toBeFocused();
  await page.setViewportSize({ width: 1200, height: 900 });
  await expect(trigger).toBeHidden();
  await expect(page.getByRole("button", { name: "Toggle strikethrough format", exact: true })).toBeVisible();
});

for (const mode of ["text", "wysiwyg"] as const) {
  test(`phone ${mode}: caret strikethrough applies to subsequent typing`, async ({ page }) => {
    await page.setViewportSize({ width: 360, height: 740 });
    await openDevelopmentStorage(page, "/#/date/2030-02-04", "disabled");
    await setRawMarkdown(page, "");
    if (mode === "text") await focusRawEditorRange(page, 0, 0);
    else {
      await switchToWysiwygMode(page);
      await page.locator('.milkdown-root [contenteditable="true"] p').click();
    }
    await page.getByRole("button", { name: "Text formatting", exact: true }).click();
    await page.getByRole("group", { name: "Text formatting options" }).getByRole("button", { name: "Strikethrough", exact: true }).click();
    await page.keyboard.type("typed");
    await expectRawMarkdown(page, /^~~typed~~\n?$/);
  });
}

test("touch formatting preserves the selection and outside taps dismiss the menu", async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 740 });
  await openDevelopmentStorage(page, "/#/date/2030-02-04", "disabled");
  await setRawMarkdown(page, "hello world");
  await focusRawEditorRange(page, 0, 5);
  const trigger = page.getByRole("button", { name: "Text formatting", exact: true });
  await trigger.tap();
  const menu = page.getByRole("group", { name: "Text formatting options" });
  const bounds = (await menu.boundingBox())!;
  expect(bounds.x).toBeGreaterThanOrEqual(0); expect(bounds.x + bounds.width).toBeLessThanOrEqual(320);
  await menu.getByRole("button", { name: "Strikethrough", exact: true }).tap();
  await expectRawMarkdown(page, "~~hello~~ world");
  await trigger.tap();
  await page.getByLabel("Markdown text editor").tap();
  await expect(menu).toHaveCount(0);
});

test("a delayed toolbar click cannot reuse a selection captured on a departed date", async ({ page }) => {
  await page.setViewportSize({ width: 360, height: 740 });
  await openDevelopmentStorage(page, "/#/date/2030-02-04", "disabled");
  await setRawMarkdown(page, "Keep date A");
  await focusRawEditorRange(page, 0, 4);
  const trigger = page.getByRole("button", { name: "Text formatting", exact: true });
  await trigger.dispatchEvent("pointerdown", { pointerType: "touch", button: 0 });
  await page.evaluate(() => { window.location.hash = "#/date/2030-02-05"; });
  await expect(page.getByLabel("Selected date", { exact: true })).toHaveValue("2030-02-05");
  await expectRawMarkdown(page, "");
  await trigger.evaluate((button: HTMLButtonElement) => button.click());
  await expect(page.getByRole("group", { name: "Text formatting options" })).toHaveCount(0);
  await expectRawMarkdown(page, "");
});
