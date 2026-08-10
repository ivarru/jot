import { expect, test } from "@playwright/test";

test.use({
  viewport: { width: 432, height: 800 },
  hasTouch: true,
  isMobile: true
});

test("tapping date navigation does not leave its tooltip visible", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("button", { name: "Use development storage" }).tap();

  const nextDay = page.getByRole("button", { name: "Next day" });
  await expect(nextDay).toBeVisible();
  await nextDay.tap();

  await expect.poll(() =>
    nextDay.evaluate((button) => getComputedStyle(button, "::after").opacity)
  ).toBe("0");
});

test("narrow viewports use a compact page scrollbar", async ({ page }) => {
  await page.goto("/");
  await expect.poll(() =>
    page.evaluate(() => getComputedStyle(document.documentElement).scrollbarWidth)
  ).toBe("thin");
});
