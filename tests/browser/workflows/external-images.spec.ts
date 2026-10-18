import { expect, test } from "@playwright/test";
import { openDevelopmentStorage, setRawMarkdown, switchToRawMode, switchToWysiwygMode, wysiwygEditor, rawMarkdown, focusWysiwygEditorAtEnd } from "../helpers/editor";
import { grantClipboardPermissions, pasteFromBrowserClipboard, writeClipboardText } from "../helpers/clipboard";
import { readLocalDraft } from "../helpers/idb";

const image = '<svg xmlns="http://www.w3.org/2000/svg" width="2" height="2"/>';
const loadButton = (page: import("@playwright/test").Page) => wysiwygEditor(page).getByRole("button", { name: /Load external image/ });

test("external image permission expires on mode switch and reload without rewriting source", async ({ page }) => {
  const requests: string[] = [];
  await page.route("https://probe.invalid/**", route => { requests.push(route.request().url()); return route.fulfill({ contentType: "image/svg+xml", body: image }); });
  await openDevelopmentStorage(page, "/", "disabled");
  const markdown = '![Private title](https://probe.invalid/view.svg "Preserved title")';
  await setRawMarkdown(page, markdown);
  await switchToWysiwygMode(page);
  await expect(loadButton(page)).toBeVisible();
  expect(requests).toEqual([]);
  await loadButton(page).click();
  await expect.poll(() => wysiwygEditor(page).locator(".jot-image-view img").evaluate((img: HTMLImageElement) => img.naturalWidth)).toBe(2);
  await switchToRawMode(page);
  expect(await rawMarkdown(page)).toBe(markdown);
  await switchToWysiwygMode(page);
  await expect(loadButton(page)).toBeVisible();
  expect(requests).toHaveLength(1);
  await page.reload();
  await expect(loadButton(page)).toBeVisible();
  expect(requests).toHaveLength(1);
});

for (const rich of [false, true]) {
  test(`${rich ? "HTML" : "Markdown"} clipboard images require consent, including protocol-relative URLs`, async ({ page }) => {
    const requests: string[] = [];
    await page.route(/^https?:\/\/probe\.invalid\//, route => { requests.push(route.request().url()); return route.fulfill({ contentType: "image/svg+xml", body: image }); });
    await grantClipboardPermissions(page);
    await openDevelopmentStorage(page, "/", "disabled");
    await setRawMarkdown(page, "Paste here\n\n");
    await switchToWysiwygMode(page);
    await focusWysiwygEditorAtEnd(page);
    if (rich) {
      await page.evaluate(async () => navigator.clipboard.write([new ClipboardItem({
        "text/html": new Blob(['<p><strong>Benign</strong><img src="//probe.invalid/paste.svg" alt="Pasted" title="Clipboard title"></p>'], { type: "text/html" }),
        "text/plain": new Blob(["Benign Pasted"], { type: "text/plain" })
      })]));
    } else await writeClipboardText(page, '![Pasted](//probe.invalid/paste.svg "Clipboard title")');
    await pasteFromBrowserClipboard(page);
    await expect(loadButton(page)).toBeVisible();
    expect(requests).toEqual([]);
    await loadButton(page).click();
    await expect.poll(() => requests.length).toBe(1);
    await switchToRawMode(page);
    const markdown = await rawMarkdown(page);
    expect(markdown).toContain("//probe.invalid/paste.svg");
    expect(markdown).toContain("Clipboard title");
  });
}

test("imported and reopened remote notes block images until consent", async ({ page }) => {
  const requests: string[] = [];
  await page.route("https://probe.invalid/**", route => { requests.push(route.request().url()); return route.fulfill({ contentType: "image/svg+xml", body: image }); });
  await openDevelopmentStorage(page, "/", "disabled");
  const markdown = "![Imported](https://probe.invalid/import.svg)";
  await page.locator('input[accept=".md,text/markdown"]').setInputFiles({ name: "2030-02-04.md", mimeType: "text/markdown", buffer: Buffer.from(markdown) });
  await expect(page.getByText("Uploaded 1 daily note.")).toBeVisible();
  const date = page.getByRole("textbox", { name: "Selected date" });
  await date.fill("2030-02-04");
  await date.press("Enter");
  await expect(loadButton(page)).toBeVisible();
  expect(requests).toEqual([]);
  await page.reload();
  await expect(loadButton(page)).toBeVisible();
  expect(requests).toEqual([]);
  await loadButton(page).click();
  await expect.poll(() => requests.length).toBe(1);
  await switchToRawMode(page);
  expect(await rawMarkdown(page)).toBe(markdown);
});

test("a pending date-A image cannot grant date B permission or change its note", async ({ page }) => {
  let release!: () => void;
  const pending = new Promise<void>(resolve => { release = resolve; });
  const requests: string[] = [];
  await page.route("https://probe.invalid/**", async route => {
    requests.push(route.request().url());
    await pending;
    await route.fulfill({ contentType: "image/svg+xml", body: image }).catch(() => undefined);
  });
  try {
    await openDevelopmentStorage(page, "/#/date/2030-02-02", "disabled");
    const markdown = "![Same URL](https://probe.invalid/date.svg)";
    await setRawMarkdown(page, markdown);
    await switchToWysiwygMode(page);
    await loadButton(page).click();
    await expect.poll(() => requests.length).toBe(1);
    await page.getByRole("textbox", { name: "Selected date" }).fill("2030-02-03");
    await page.getByRole("textbox", { name: "Selected date" }).press("Enter");
    await setRawMarkdown(page, markdown);
    await switchToWysiwygMode(page);
    await expect(loadButton(page)).toBeVisible();
    release();
    await expect.poll(() => readLocalDraft(page, "2030-02-03")).toMatchObject({ markdown });
    await expect(wysiwygEditor(page).locator(".jot-image-view img")).toHaveCount(0);
    expect(requests).toHaveLength(1);
    await switchToRawMode(page);
    expect(await rawMarkdown(page)).toBe(markdown);
  } finally { release(); }
});
