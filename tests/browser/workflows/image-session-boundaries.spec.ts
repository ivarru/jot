import { expect, test } from "@playwright/test";
import { readLocalDraft } from "../helpers/idb";
import { openDevelopmentStorage, clickButton } from "../helpers/editor";

const png = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMB/evp2cAAAAAASUVORK5CYII=", "base64");

for (const returnDate of ["2030-02-02", "2030-02-03"]) {
test(`a pre-sign-out image cannot enter the new session on ${returnDate}`, async ({page, context}) => {
  await openDevelopmentStorage(page, "/#/date/2030-02-02", "disabled");
  await page.evaluate(() => {
    const state = window as Window & {__releaseOldImage?: () => void; __oldImageDecoded?: boolean};
    const OriginalImage = window.Image;
    const descriptor = Object.getOwnPropertyDescriptor(HTMLImageElement.prototype, "src")!;
    let held = false;
    window.Image = class extends OriginalImage {
      override set src(value: string) {
        if (!held) {
          held = true;
          state.__releaseOldImage = () => {
            this.addEventListener("load", () => { state.__oldImageDecoded = true; }, {once: true});
            descriptor.set!.call(this, value);
          };
        } else descriptor.set!.call(this, value);
      }
      override get src() { return descriptor.get!.call(this) as string; }
    };
  });
  await clickButton(page, "Insert image");
  await page.getByRole("menuitem", {name: "Upload from device"}).click();
  await page.locator("input[type=file][accept='image/*']").setInputFiles({name: "private-before-sign-out.png", mimeType: "image/png", buffer: png});
  await expect.poll(() => page.evaluate(() => typeof (window as Window & {__releaseOldImage?: unknown}).__releaseOldImage)).toBe("function");
  const second = await context.newPage();
  await second.goto("/#/date/2030-02-03");
  await expect(second.getByRole("region", {name: "Daily note editor"})).toBeVisible();
  second.on("dialog", dialog => void dialog.accept());
  await second.getByRole("button", {name: "Open menu"}).click();
  await second.getByRole("menuitem", {name: "Sign out"}).click();
  await page.getByRole("button", {name: "Use development storage"}).click();
  await expect(page.locator(".milkdown-root [contenteditable=true]")).toBeVisible();
  if (returnDate === "2030-02-03") {
    await page.getByRole("button", {name: "Next day", exact: true}).click();
    await expect(page.getByRole("textbox", {name: "Selected date"})).toHaveValue(returnDate);
    await expect(page.locator(".milkdown-root [contenteditable=true]")).toBeVisible();
  }
  await clickButton(page, "Insert image");
  await page.getByRole("menuitem", {name: "Upload from device"}).click();
  await page.locator("input[type=file][accept='image/*']").setInputFiles([]);
  await page.evaluate(() => (window as Window & {__releaseOldImage?: () => void}).__releaseOldImage!());
  await expect.poll(() => page.evaluate(() => (window as Window & {__oldImageDecoded?: boolean}).__oldImageDecoded)).toBe(true);
  await expect(page.locator(".image-attachment-import")).not.toBeVisible();
  await expect(page.locator(".milkdown-root img[data-jot-image-id]")).toHaveCount(0);
  await page.locator("input[type=file][accept='image/*']").setInputFiles({name: "new-session.png", mimeType: "image/png", buffer: png});
  await page.locator(".image-attachment-import input[type=text]").fill("New session image");
  await page.locator(".image-attachment-sizes button").first().click();
  await expect(page.locator(".milkdown-root img[data-jot-image-id]")).toHaveAttribute("alt", "New session image");
  await expect.poll(async () => (await readLocalDraft(page, returnDate))?.markdown).toContain("![New session image](jot:image:");
});
}
