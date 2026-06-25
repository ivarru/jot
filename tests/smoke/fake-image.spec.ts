import { expect, test } from "@playwright/test";
import { writeFile } from "node:fs/promises";
import { clickButton, openDevelopmentStorage } from "./helpers/editor";
import { waitForSavedImageMarkdown } from "./helpers/idb";

const pngBytes = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMB/evp2cAAAAAASUVORK5CYII=",
  "base64"
);

test("fake image upload inserts a rendered Jot image and saves Markdown", async ({ page }, testInfo) => {
  const imagePath = testInfo.outputPath("smoke.png");
  await writeFile(imagePath, pngBytes);

  await openDevelopmentStorage(page);
  await clickButton(page, "Insert image");
  await page.getByRole("menuitem", { name: "Upload from device" }).click();
  await page.locator("input.hidden-file-input[type=\"file\"][accept=\"image/*\"]").setInputFiles(imagePath);

  await expect(page.locator(".image-attachment-import input[type=\"text\"]")).toBeVisible();
  await page.locator(".image-attachment-import input[type=\"text\"]").fill("Smoke image");
  await page.locator(".image-attachment-sizes button").first().click();
  const renderedImage = page.locator(".milkdown-root img[data-jot-image-id]");
  await expect(renderedImage).toBeVisible();

  await expect(renderedImage).toHaveAttribute("alt", "Smoke image");
  await expect(renderedImage).toHaveAttribute("src", /^data:image\/png/);
  await expect.poll(async () => await renderedImage.getAttribute("data-jot-image-id")).toMatch(/^[0-9A-HJKMNP-TV-Z]{26}$/);

  const markdown = await waitForSavedImageMarkdown(page);
  expect(markdown).toContain("![Smoke image](jot:image:");
});
