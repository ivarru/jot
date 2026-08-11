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

test("narrow viewports do not reserve a page scrollbar gutter", async ({ page }) => {
  await page.goto("/");
  await expect.poll(() =>
    page.evaluate(() => getComputedStyle(document.documentElement).scrollbarWidth)
  ).toBe("none");
});

test("the mobile viewport cannot shrink below its responsive default", async ({ page }) => {
  await page.goto("/");
  await expect(page.locator('meta[name="viewport"]')).toHaveAttribute("content", /(?:^|,\s*)minimum-scale=1(?:,|$)/);
});

test("the sticky toolbar follows the visible viewport after pinch zoom", async ({ page }) => {
  await page.addInitScript(() => {
    const viewport = new EventTarget();
    Object.defineProperty(viewport, "offsetTop", { configurable: true, value: 0 });
    Object.defineProperty(window, "visualViewport", { configurable: true, value: viewport });
  });

  await page.goto("/");
  await page.getByRole("button", { name: "Use development storage" }).tap();
  await expect(page.locator(".app-toolbar")).toBeVisible();

  await page.evaluate(() => {
    const viewport = window.visualViewport!;
    Object.defineProperty(viewport, "offsetTop", { configurable: true, value: 24 });
    viewport.dispatchEvent(new Event("scroll"));
  });

  await expect.poll(() =>
    page.evaluate(() => ({
      toolbarTop: document.querySelector(".app-toolbar")!.getBoundingClientRect().top,
      visualViewportTop: window.visualViewport?.offsetTop ?? 0
    }))
  ).toEqual({ toolbarTop: 24, visualViewportTop: 24 });
});
