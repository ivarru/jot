import { expect, test, type Page } from "@playwright/test";
import { browserTestBaseUrl, grantClipboardPermissions, writeClipboardText } from "../helpers/clipboard";
import {
  clickButton,
  expectRawMarkdown,
  focusRawEditorRange,
  focusWysiwygEditorAtEnd,
  focusWysiwygTextOffset,
  openDevelopmentStorage,
  rawMarkdown,
  setRawMarkdown,
  switchToRawMode,
  switchToWysiwygMode
} from "../helpers/editor";

test("link modal supports clipboard autofill, editing, and share-target insertion", async ({ page }) => {
  await assertManifestShareTarget(page);
  await grantClipboardPermissions(page);
  await openDevelopmentStorage(page);
  await switchToRawMode(page);

  await assertWysiwygTrailingEmptyParagraphInsert(page);
  await assertWysiwygFinalListItemTextInsert(page);
  await assertWysiwygEmptyListItemClipboardAutofill(page);
  await assertWysiwygTrailingEmptyListItemInsert(page);
  await assertClipboardAutoFill(page);
  await assertWysiwygCollapsedCursorInsert(page);
  await assertManualLinkModalInsert(page);
  await assertClipboardButtonLinkEdit(page);
  await assertExistingLinkEdit(page);
  await assertShareTargetInsert(page);
});

async function assertManifestShareTarget(page: Page): Promise<void> {
  const response = await page.request.get(new URL("manifest.webmanifest", browserTestBaseUrl()).href);
  expect(response.ok(), `manifest.webmanifest returned HTTP ${response.status()}.`).toBe(true);
  const manifest = await response.json();
  expect(manifest.share_target?.action).toBe(".");
  expect(manifest.share_target?.method).toBe("GET");
  expect(manifest.share_target?.params?.title).toBe("title");
  expect(manifest.share_target?.params?.text).toBe("text");
  expect(manifest.share_target?.params?.url).toBe("url");
}

async function assertWysiwygEmptyListItemClipboardAutofill(page: Page): Promise<void> {
  await setRawMarkdown(page, "abcd\n\n* efgh");
  await switchToWysiwygMode(page);
  await focusWysiwygEditorAtEnd(page);
  await page.keyboard.press("Enter");
  await focusTrailingEmptyWysiwygTextblock(page);
  await writeClipboardText(page, "Google https://www.google.com/");

  await clickButton(page, "Insert or edit link");
  await expectLinkModalValues(page, {
    text: "Google",
    url: "https://www.google.com/"
  });
  await clickLinkModalButton(page, "Insert");
  await expectRawMarkdown(page, "abcd\n\n* efgh\n\n* [Google](https://www.google.com/)\n");
}

async function assertWysiwygTrailingEmptyParagraphInsert(page: Page): Promise<void> {
  await setRawMarkdown(page, "abcd\n\nefgh");
  await switchToWysiwygMode(page);
  await focusWysiwygEditorAtEnd(page);
  await page.keyboard.press("Enter");
  await focusTrailingEmptyWysiwygTextblock(page);
  await writeClipboardText(page, "[https://www.google.com/](https://www.google.com/)");

  await insertGoogleClipboardLink(page);
  await expectRawMarkdown(page, "abcd\n\nefgh\n\n[www.google.com](<https://www.google.com/>)");
}

async function assertWysiwygFinalListItemTextInsert(page: Page): Promise<void> {
  await setRawMarkdown(page, "abcd\n\n* efgh");
  await switchToWysiwygMode(page);
  await focusWysiwygTextOffset(page, "efgh", "efgh".length);
  await writeClipboardText(page, "[https://www.google.com/](https://www.google.com/)");

  await insertGoogleClipboardLink(page);
  await expectRawMarkdown(page, "abcd\n\n* efgh[www.google.com](<https://www.google.com/>)");
}

async function assertWysiwygTrailingEmptyListItemInsert(page: Page): Promise<void> {
  const variants = [
    {
      markdown: "abcd\n\n* efgh",
      expected: "abcd\n\n* efgh\n\n* [www.google.com](https://www.google.com/)\n"
    },
    {
      markdown: "abcd\n\n1. efgh",
      expected: "abcd\n\n1. efgh\n2. [www.google.com](<https://www.google.com/>)"
    },
    {
      markdown: "abcd\n\n* [ ] efgh",
      expected: "abcd\n\n* [ ] efgh\n\n* [ ] [www.google.com](https://www.google.com/)\n"
    }
  ];

  for (const variant of variants) {
    await setRawMarkdown(page, variant.markdown);
    await switchToWysiwygMode(page);
    await focusWysiwygEditorAtEnd(page);
    await page.keyboard.press("Enter");
    await focusTrailingEmptyWysiwygTextblock(page);
    await writeClipboardText(page, "[https://www.google.com/](https://www.google.com/)");

    await insertGoogleClipboardLink(page);
    await expectRawMarkdown(page, variant.expected);
  }
}

async function focusTrailingEmptyWysiwygTextblock(page: Page): Promise<void> {
  const focused = await page.locator(".milkdown-root [contenteditable='true']").evaluate((editor) => {
    const paragraphs = editor.querySelectorAll("p");
    const paragraph = paragraphs.item(paragraphs.length - 1);
    if (!(paragraph instanceof HTMLParagraphElement) || paragraph.textContent !== "") return false;
    (editor as HTMLElement).focus();
    const selection = getSelection();
    const range = document.createRange();
    range.setStart(paragraph, 0);
    range.collapse(true);
    selection?.removeAllRanges();
    selection?.addRange(range);
    document.dispatchEvent(new Event("selectionchange"));
    return selection?.anchorNode === paragraph && selection.anchorOffset === 0;
  });
  expect(focused, "Could not focus the trailing empty WYSIWYG paragraph.").toBe(true);
}

async function insertGoogleClipboardLink(page: Page): Promise<void> {
  await clickButton(page, "Insert or edit link");
  await expect(page.locator(".link-modal input").nth(1)).toHaveValue("https://www.google.com/");
  await page.locator(".link-modal input").nth(0).fill("www.google.com");
  await clickLinkModalButton(page, "Insert");
}

async function assertWysiwygCollapsedCursorInsert(page: Page): Promise<void> {
  const markdown = "**First** paragraph with [an existing link](<https://example.com/existing>) and `inline code`.\n\nInsert the link right here in the final paragraph.";
  const cursorOffsetInText = "Insert the link right ".length;
  const expected = "**First** paragraph with [an existing link](https://example.com/existing) and `inline code`.\n\nInsert the link right [Jot](<https://example.com/jot>)here in the final paragraph.";
  await setRawMarkdown(page, markdown);
  await switchToWysiwygMode(page);
  await writeClipboardText(page, "");
  await focusWysiwygTextOffset(page, "Insert the link right here in the final paragraph.", cursorOffsetInText);

  await clickButton(page, "Insert or edit link");
  await expectLinkModalValues(page, { text: "", url: "" });
  await page.locator(".link-modal input").nth(0).fill("Jot");
  await setLinkModalUrl(page, "https://example.com/jot");
  await clickLinkModalButton(page, "Insert");
  await expectRawMarkdown(page, expected);
}

async function assertManualLinkModalInsert(page: Page): Promise<void> {
  const markdown = "Read selected text today";
  await setRawMarkdown(page, markdown);
  await writeClipboardText(page, "");
  await focusRawEditorRange(page, markdown.indexOf("selected text"), markdown.indexOf("selected text") + "selected text".length);

  await clickButton(page, "Insert or edit link");
  await expectLinkModalValues(page, {
    text: "selected text",
    url: ""
  });
  await setLinkModalUrl(page, "https://example.com/clipboard");
  await clickLinkModalButton(page, "Insert");
  await expectRawMarkdown(page, "Read [selected text](<https://example.com/clipboard>) today");
}

async function assertClipboardAutoFill(page: Page): Promise<void> {
  await setRawMarkdown(page, "");
  await writeClipboardText(page, "Clipboard title https://example.com/auto-fill");
  await focusRawEditorRange(page, 0, 0);

  await clickButton(page, "Insert or edit link");
  await expectLinkModalValues(page, {
    text: "Clipboard title",
    url: "https://example.com/auto-fill"
  });
  await clickLinkModalButton(page, "Insert");
  await expectRawMarkdown(page, "[Clipboard title](<https://example.com/auto-fill>)");
}

async function assertExistingLinkEdit(page: Page): Promise<void> {
  const markdown = "Read [old text](<https://example.com/old>) today";
  await setRawMarkdown(page, markdown);
  await focusRawEditorRange(page, markdown.indexOf("old text"), markdown.indexOf("old text"));

  await clickButton(page, "Insert or edit link");
  await expectLinkModalValues(page, {
    text: "old text",
    url: "https://example.com/old"
  });
  await setLinkModalUrl(page, "https://example.com/new");
  await clickLinkModalButton(page, "Update");
  await expectRawMarkdown(page, "Read [old text](<https://example.com/new>) today");
}

async function assertClipboardButtonLinkEdit(page: Page): Promise<void> {
  const markdown = "Read [old text](<https://example.com/old>) today";
  await setRawMarkdown(page, markdown);
  await writeClipboardText(page, "Clipboard title https://example.com/from-smoke");
  await focusRawEditorRange(page, markdown.indexOf("old text"), markdown.indexOf("old text"));

  await clickButton(page, "Insert or edit link");
  await expectLinkModalValues(page, {
    text: "old text",
    url: "https://example.com/old"
  });
  await expect(page.getByRole("button", { name: "Use clipboard text" })).toBeEnabled();
  await expect(page.getByRole("button", { name: "Use clipboard URL" })).toBeEnabled();

  await clickButton(page, "Use clipboard text");
  await expectLinkModalValues(page, {
    text: "Clipboard title",
    url: "https://example.com/old"
  });

  await clickButton(page, "Use clipboard URL");
  await expectLinkModalValues(page, {
    text: "Clipboard title",
    url: "https://example.com/from-smoke"
  });
  await clickLinkModalButton(page, "Update");
  await expectRawMarkdown(page, "Read [Clipboard title](<https://example.com/from-smoke>) today");
}

async function assertShareTargetInsert(page: Page): Promise<void> {
  const shareUrl = browserTestBaseUrl();
  shareUrl.searchParams.set("title", "Shared title");
  shareUrl.searchParams.set("url", "https://example.com/shared");
  await page.goto(shareUrl.href);
  await expectLinkModalValues(page, {
    text: "Shared title",
    url: "https://example.com/shared"
  });
  await clickLinkModalButton(page, "Insert");
  await switchToRawMode(page);
  await expect.poll(async () => (await rawMarkdown(page)).includes("[Shared title](<https://example.com/shared>)")).toBe(true);
}

async function expectLinkModalValues(page: Page, expected: { readonly text: string; readonly url: string }): Promise<void> {
  await expect(page.locator(".link-modal")).toBeVisible();
  const inputs = page.locator(".link-modal input");
  await expect(inputs.nth(0)).toHaveValue(expected.text);
  await expect(inputs.nth(1)).toHaveValue(expected.url);
}

async function setLinkModalUrl(page: Page, url: string): Promise<void> {
  await page.locator(".link-modal input").nth(1).fill(url);
  await expect(page.locator(".link-modal input").nth(1)).toHaveValue(url);
}

async function clickLinkModalButton(page: Page, name: string): Promise<void> {
  await page.locator(".link-modal").getByRole("button", { name }).click();
}
