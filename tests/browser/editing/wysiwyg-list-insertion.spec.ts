import { expect, test } from "@playwright/test";
import {
  expectNormalizedRawMarkdown,
  focusWysiwygEditor,
  focusWysiwygTextOffset,
  openDevelopmentStorage,
  setRawMarkdown,
  switchToWysiwygMode
} from "../helpers/editor";

test.beforeEach(async ({ page }) => {
  await openDevelopmentStorage(page, "/#/date/2030-02-02", "default");
});

test("Tab creates a bullet that survives autosave in a fresh note", async ({ page }) => {
  await focusWysiwygEditor(page);
  await page.keyboard.press("Tab");

  await expect(page.locator(".milkdown-root ul li")).toBeVisible();
  // Wait past the autosave debounce so a background save flushes the editor.
  await page.waitForTimeout(2500);
  await expect(page.locator(".milkdown-root ul li")).toBeVisible();
});

test("typing into a Tab bullet and pressing Enter keeps the next empty item", async ({ page }) => {
  await focusWysiwygEditor(page);
  await page.keyboard.press("Tab");
  await page.keyboard.type("foo");
  await page.keyboard.press("Enter");

  await expect(page.locator(".milkdown-root ul li")).toHaveCount(2);
  await page.waitForTimeout(2500);
  await expect(page.locator(".milkdown-root ul li")).toHaveCount(2);
  await expectNormalizedRawMarkdown(page, "* foo\n* <br />");
});

test("Enter keeps a paused empty paragraph editable through autosave", async ({ page }) => {
  await focusWysiwygEditor(page);
  await page.keyboard.type("foo");
  await page.keyboard.press("Enter");

  await expect(page.locator(".milkdown-root p").last()).toBeEmpty();
  // Wait past the autosave debounce while the caret sits on the empty paragraph.
  await page.waitForTimeout(2500);

  await page.keyboard.type("bar");
  await expectNormalizedRawMarkdown(page, "foo\n\nbar");
});

test("a second Tab keeps the empty bullet intact", async ({ page }) => {
  await focusWysiwygEditor(page);
  await page.keyboard.press("Tab");
  await page.keyboard.press("Tab");

  await expect(page.locator(".milkdown-root ul li")).toHaveCount(1);
  await page.waitForTimeout(2500);
  await expect(page.locator(".milkdown-root ul li")).toHaveCount(1);
  await expectNormalizedRawMarkdown(page, "* <br />");
});

test("editing the middle of a compact list keeps it compact", async ({ page }) => {
  await setRawMarkdown(page, "* first\n* second\n* third");
  await switchToWysiwygMode(page);
  await focusWysiwygTextOffset(page, "second", 6);
  await page.keyboard.type("X");
  await page.waitForTimeout(2500);

  await expectNormalizedRawMarkdown(page, "* first\n* secondX\n* third");
});

test("Enter between two paragraphs keeps the new empty paragraph through autosave", async ({ page }) => {
  await setRawMarkdown(page, "foo\n\nbar");
  await switchToWysiwygMode(page);
  await focusWysiwygTextOffset(page, "foo", 3);
  await page.keyboard.press("Enter");
  await page.waitForTimeout(2500);

  await expectNormalizedRawMarkdown(page, "foo\n\n<br />\n\nbar");
});

test("an empty paragraph inserted before existing text remains available briefly", async ({ page }) => {
  await setRawMarkdown(page, "first\n\nexisting");
  await switchToWysiwygMode(page);
  await page.waitForTimeout(250);
  await focusWysiwygTextOffset(page, "first", "first".length);
  await page.keyboard.press("Enter");
  await expect(page.locator(".milkdown-root p")).toHaveCount(3);
  await focusWysiwygTextOffset(page, "existing", "existing".length);

  const emptyParagraph = page.locator(".milkdown-root p").nth(1);
  await expect(emptyParagraph).toBeEmpty();
  await page.waitForTimeout(500);
  await emptyParagraph.evaluate((element) => {
    const selection = getSelection();
    const range = document.createRange();
    range.selectNodeContents(element);
    range.collapse(true);
    selection?.removeAllRanges();
    selection?.addRange(range);
    document.dispatchEvent(new Event("selectionchange"));
  });
  await page.keyboard.type("before");

  await expectNormalizedRawMarkdown(page, "first\n\nbefore\n\nexisting");
});

test("an empty bullet inserted before an existing bullet remains available briefly", async ({ page }) => {
  await setRawMarkdown(page, "* existing");
  await switchToWysiwygMode(page);
  await page.waitForTimeout(250);
  await page.locator(".milkdown-root ul li p").click();
  await page.keyboard.press("Home");
  await page.keyboard.press("Enter");

  const firstItem = page.locator(".milkdown-root ul li").first();
  await expect(firstItem.locator("p")).toBeEmpty();
  await page.waitForTimeout(500);
  await firstItem.evaluate((element) => {
    const selection = getSelection();
    const range = document.createRange();
    range.selectNodeContents(element);
    range.collapse(true);
    selection?.removeAllRanges();
    selection?.addRange(range);
    document.dispatchEvent(new Event("selectionchange"));
  });
  await page.keyboard.type("before");

  await expectNormalizedRawMarkdown(page, "* before\n* existing");
});

test("normalizing a preceding empty paragraph does not remove a trailing typed space", async ({ page }) => {
  await setRawMarkdown(page, "first\n\nexisting");
  await switchToWysiwygMode(page);
  await page.waitForTimeout(250);
  await focusWysiwygTextOffset(page, "first", "first".length);
  await page.keyboard.press("Enter");
  await expect(page.locator(".milkdown-root p")).toHaveCount(3);
  await focusWysiwygTextOffset(page, "existing", "existing".length);
  await page.keyboard.type(" ");
  await page.waitForTimeout(200);
  await page.keyboard.type("world");
  await page.waitForTimeout(3200);

  await expectNormalizedRawMarkdown(page, "first\n\nexisting world");
});
