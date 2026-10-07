import { expect, test } from "@playwright/test";
import { expectRawMarkdown, openDevelopmentStorage, setRawMarkdown } from "../helpers/editor";

test("Settings stays in view above a scrolled note and restores focus, scroll, and saved preferences", async ({ page }) => {
  await openDevelopmentStorage(page, "/#/date/2030-02-02", "enabled");
  const markdown = Array.from({ length: 120 }, (_, index) => `Line ${index + 1}`).join("\n\n");
  await setRawMarkdown(page, markdown);
  await page.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight));
  const scrollBefore = await page.evaluate(() => window.scrollY);
  expect(scrollBefore).toBeGreaterThan(300);

  const menu = page.getByRole("button", { name: "Open menu" });
  await menu.click();
  await page.getByRole("menuitem", { name: "Settings", exact: true }).click();

  const dialog = page.getByRole("dialog", { name: "Settings" });
  await expect(dialog).toBeVisible();
  await expect(dialog).toHaveAttribute("aria-modal", "true");
  await expect.poll(async () => dialog.evaluate((element) => {
    const bounds = element.getBoundingClientRect();
    return bounds.top >= 0 && bounds.bottom <= window.innerHeight;
  })).toBe(true);
  await expect(page.getByLabel("Markdown text editor")).not.toBeFocused();
  await expect(page.getByRole("button", { name: "Open menu" })).not.toBeFocused();
  await expect.poll(async () => page.evaluate(() => document.activeElement?.closest("dialog") !== null)).toBe(true);
  expect(await page.evaluate(() => document.querySelector("dialog")?.matches(":modal"))).toBe(true);

  const setting = dialog.getByLabel("Collect sync diagnostics for conflict reports");
  await setting.check();
  await page.keyboard.press("Escape");
  await expect(dialog).toHaveCount(0);
  await expect(menu).toBeFocused();
  expect(await page.evaluate(() => window.scrollY)).toBe(scrollBefore);
  await expectRawMarkdown(page, markdown);

  await menu.click();
  await page.getByRole("menuitem", { name: "Settings", exact: true }).click();
  await expect(page.getByRole("dialog", { name: "Settings" }).getByLabel("Collect sync diagnostics for conflict reports")).toBeChecked();
  await page.getByRole("button", { name: "Close settings" }).click();
  await expect(menu).toBeFocused();
  await page.reload();
  await menu.click();
  await page.getByRole("menuitem", { name: "Settings", exact: true }).click();
  await expect(page.getByRole("dialog", { name: "Settings" }).getByLabel("Collect sync diagnostics for conflict reports")).toBeChecked();
});
