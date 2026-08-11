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

test("the sticky toolbar follows the visible viewport after pinch zoom", async ({ page, browserName }) => {
  test.skip(browserName !== "chromium", "Pinch emulation uses the Chromium DevTools protocol.");

  await page.goto("/");
  await page.getByRole("button", { name: "Use development storage" }).tap();
  await expect(page.locator(".app-toolbar")).toBeVisible();

  const devtools = await page.context().newCDPSession(page);
  await devtools.send("Input.synthesizePinchGesture", {
    x: 216,
    y: 320,
    scaleFactor: 1.4,
    relativeSpeed: 800,
    gestureSourceType: "touch"
  });

  let position = { toolbarTop: 0, visualViewportTop: 0 };
  await expect.poll(async () => {
    position = await page.evaluate(() => ({
      toolbarTop: document.querySelector(".app-toolbar")!.getBoundingClientRect().top,
      visualViewportTop: window.visualViewport?.offsetTop ?? 0
    }));
    return position.visualViewportTop;
  }).toBeGreaterThan(0);

  expect(Math.abs(position.toolbarTop - position.visualViewportTop)).toBeLessThanOrEqual(1);
});
