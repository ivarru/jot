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
