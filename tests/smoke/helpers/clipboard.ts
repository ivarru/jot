import { expect, type Page } from "@playwright/test";

export function smokeBaseUrl(): URL {
  return new URL(process.env.SMOKE_BASE_URL ?? "http://127.0.0.1:4173/");
}

export async function grantClipboardPermissions(page: Page): Promise<void> {
  await page.context().grantPermissions(["clipboard-read", "clipboard-write"], {
    origin: smokeBaseUrl().origin
  });
}

export async function writeClipboardText(page: Page, text: string): Promise<void> {
  await page.evaluate(async (value) => {
    await navigator.clipboard.writeText(value);
  }, text);
  await expect.poll(async () => await page.evaluate(async () => await navigator.clipboard.readText())).toBe(text);
}

export async function pasteFromBrowserClipboard(page: Page): Promise<void> {
  await page.keyboard.press(process.platform === "darwin" ? "Meta+V" : "Control+V");
}
