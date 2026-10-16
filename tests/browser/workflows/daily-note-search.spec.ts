import { expect, test } from "@playwright/test";
import { expectRawMarkdown, openDevelopmentStorage, setRawMarkdown } from "../helpers/editor";
import { readLocalDraft, seedDailyNoteState } from "../helpers/idb";

test.use({ timezoneId: "Europe/Oslo" });

test("menu search filters synced notes by exclusive calendar bounds and local modified dates and opens a result", async ({ page }) => {
  await openDevelopmentStorage(page, "/#/date/2030-02-04", "disabled");
  for (const [date, markdown] of [
    ["2030-02-01", "Orchard apples"], ["2030-02-02", "Orchard pears"], ["2030-02-03", "Orchard plums"]
  ] as const) {
    await seedDailyNoteState(page, { remote: { date, markdown, revisionId: date, updatedAt: date === "2030-02-01" ? "2040-07-01T23:45:00Z" : "2040-01-01T00:00:00Z" } });
  }
  await setRawMarkdown(page, "Keep this pending edit");
  const menu = page.getByRole("button", { name: "Open menu" });
  await menu.click();
  await page.getByRole("menuitem", { name: "Search daily notes", exact: true }).click();
  const dialog = page.getByRole("dialog", { name: "Search daily notes" });
  await expect(dialog.getByLabel("Search words")).toBeFocused();
  expect(await dialog.evaluate((element) => element.matches(":modal"))).toBe(true);
  await dialog.getByLabel("Search words").fill("orchard");
  const submit = dialog.getByRole("button", { name: "Search", exact: true });
  const results = dialog.getByRole("list", { name: "Matching daily notes" });
  await submit.click();
  await expect(results.locator(".search-result-date")).toHaveText(["2030-02-03", "2030-02-02", "2030-02-01"]);
  const pears = results.getByRole("listitem").filter({ has: page.getByRole("button", { name: "2030-02-02", exact: true }) });
  await expect(pears.locator("time")).toHaveText("2040-01-01 01:00");
  await expect(pears.locator("time")).toHaveAttribute("datetime", "2040-01-01T00:00:00.000Z");
  await expect(pears).toContainText("Size 13 bytes");
  expect(await pears.evaluate((element) => {
    const date = element.querySelector(".search-result-date")!.getBoundingClientRect();
    const metadata = element.querySelector(".search-result-metadata")!.getBoundingClientRect();
    return metadata.left >= date.right && Math.abs((date.top + date.bottom) / 2 - (metadata.top + metadata.bottom) / 2) < 1;
  })).toBe(true);
  const apples = results.getByRole("listitem").filter({ has: page.getByRole("button", { name: "2030-02-01", exact: true }) });
  await expect(apples.locator("time")).toHaveText("2040-07-02 01:45");
  await dialog.getByLabel("Start date").fill("2030-02-02");
  await submit.click();
  await expect(results.locator(".search-result-date")).toHaveText(["2030-02-03", "2030-02-02"]);
  await dialog.getByLabel("End date").fill("2030-02-03");
  await submit.click();
  await expect(results.locator(".search-result-date")).toHaveText(["2030-02-02"]);
  await dialog.getByLabel("Start date").fill("2030-02-04");
  await submit.click();
  await expect(dialog.getByRole("alert")).toContainText("End date must be on or after start date");
  await dialog.getByRole("button", { name: "Clear dates" }).click();
  await dialog.getByLabel("End date").fill("2030-02-02");
  await submit.click();
  await expect(results.locator(".search-result-date")).toHaveText(["2030-02-01"]);
  await dialog.getByRole("button", { name: "Clear dates" }).click();
  await dialog.getByLabel("Filter by last modified date").check();
  await dialog.getByLabel("Start date").fill("2040-07-02");
  await dialog.getByLabel("End date (not included)").fill("2040-07-03");
  await submit.click();
  await expect(results.locator(".search-result-date")).toHaveText(["2030-02-01"]);
  await dialog.getByLabel("End date (not included)").fill("2040-07-02");
  await submit.click();
  await expect(dialog.getByRole("status")).toContainText("No matching daily notes");
  await dialog.getByLabel("Filter by last modified date").uncheck();
  await dialog.getByRole("button", { name: "Clear dates" }).click();
  await dialog.getByLabel("Search words").fill("no-such-word");
  await submit.click();
  await expect(dialog.getByRole("status")).toContainText("No matching daily notes");
  await page.keyboard.press("Escape");
  await expect(dialog).toHaveCount(0);
  await expect(menu).toBeFocused();
  await expectRawMarkdown(page, "Keep this pending edit");
  await menu.click();
  await page.getByRole("menuitem", { name: "Search daily notes", exact: true }).click();
  await dialog.getByLabel("Search words").fill("pears");
  await submit.click();
  await results.getByRole("button", { name: "Open note 2030-02-02", exact: true }).click();
  await expect(page.getByLabel("Selected date", { exact: true })).toHaveValue("2030-02-02");
  await expectRawMarkdown(page, "Orchard pears");
});

test("search fits a narrow screen and reports disconnected search failures", async ({ page }) => {
  await page.setViewportSize({ width: 360, height: 640 });
  await openDevelopmentStorage(page, "/#/date/2030-02-04", "disabled");
  await page.getByRole("button", { name: "Open menu" }).click();
  await page.getByRole("menuitem", { name: "Search daily notes", exact: true }).click();
  const dialog = page.getByRole("dialog", { name: "Search daily notes" });
  await expect.poll(() => dialog.evaluate((element) => element.scrollWidth <= element.clientWidth)).toBe(true);
  const search = dialog.getByRole("button", { name: "Search", exact: true });
  await expect(search).toBeDisabled();
  await dialog.getByLabel("Search words").fill("   ");
  await expect(search).toBeDisabled();
  await dialog.getByLabel("Search words").fill("orchard");
  await expect(search).toBeEnabled();
  expect(await search.evaluate((element) => getComputedStyle(element).backgroundColor))
    .not.toBe(await dialog.getByRole("button", { name: "Clear dates" }).evaluate((element) => getComputedStyle(element).backgroundColor));
  await dialog.getByLabel("Search words").fill("");
  await expect(search).toBeDisabled();
  await page.evaluate(() => localStorage.setItem("jot.fakeRemoteUnavailable", "true"));
  await dialog.getByLabel("Search words").fill("orchard");
  await dialog.getByLabel("Search words").press("Enter");
  await expect(dialog.getByRole("alert")).toContainText("unavailable");
  await dialog.getByRole("button", { name: "Close search" }).click();
  await expect(page.getByRole("button", { name: "Open menu" })).toBeFocused();
});

for (const width of [360, 960]) {
  test(`date picker search shortcut keeps the month centered and opens search at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 800 });
    await openDevelopmentStorage(page, "/#/date/2030-09-02", "disabled");
    await seedDailyNoteState(page, { remote: { date: "2030-09-03", markdown: "Calendar search result",
      revisionId: "calendar-search", updatedAt: "2030-09-01T12:00:00Z" } });
    const selectedDate = page.getByRole("textbox", { name: "Selected date", exact: true });
    await selectedDate.click();
    const picker = page.getByRole("dialog", { name: "Date picker", exact: true });
    expect(await picker.locator(".date-picker-header").evaluate((element) => {
      const header = element.getBoundingClientRect();
      const label = element.querySelector(".date-picker-month-label")!;
      const range = document.createRange();
      range.selectNodeContents(label);
      const text = range.getBoundingClientRect();
      const search = element.querySelector('button[aria-label="Search daily notes"]')!.getBoundingClientRect();
      const next = element.querySelector('button[aria-label="Next month"]')!.getBoundingClientRect();
      return Math.abs((header.left + header.right) / 2 - (text.left + text.right) / 2) < 1
        && search.left >= text.right && next.left >= search.right;
    })).toBe(true);
    await picker.getByRole("button", { name: "Search daily notes", exact: true }).click();
    const search = page.getByRole("dialog", { name: "Search daily notes", exact: true });
    await expect(picker).toHaveCount(0);
    await expect(search.getByLabel("Search words")).toBeFocused();
    await search.getByLabel("Search words").fill("Calendar");
    await search.getByRole("button", { name: "Search", exact: true }).click();
    const row = search.getByRole("listitem");
    expect(await row.evaluate((element) => element.querySelector(".search-result-metadata")!.getBoundingClientRect().left
      >= element.querySelector(".search-result-date")!.getBoundingClientRect().right)).toBe(true);
    await page.keyboard.press("Escape");
    await expect(search).toHaveCount(0);
    await expect(selectedDate).toBeFocused();
    await expect(picker).toHaveCount(0);
    await selectedDate.click();
    await picker.getByRole("button", { name: "Search daily notes", exact: true }).click();
    await search.getByLabel("Search words").fill("Calendar");
    await search.getByRole("button", { name: "Search", exact: true }).click();
    await search.getByRole("button", { name: "Open note 2030-09-03", exact: true }).click();
    await expect(selectedDate).toHaveValue("2030-09-03");
    await expect(picker).toHaveCount(0);
  });
}

for (const width of [360, 960]) {
  test(`whole-row results and read-only full-note previews work at ${width}px`, async ({ page, context }) => {
    await page.setViewportSize({ width, height: width === 360 ? 640 : 800 });
    await openDevelopmentStorage(page, "/#/date/2030-02-04", "disabled");
    const content = ["# Preview heading",
      ...Array.from({ length: 60 }, (_, i) => `Before paragraph ${i + 1}. Some ordinary note content.`),
      'First **needleword** match with [External](https://example.com) and [Daily Note](#/date/2030-02-01).',
      "- [ ] An untouched task", "```ts\nconst count = 42;\n```", "| A | B |\n| --- | --- |\n| one | two |", "$$x^2$$",
      ...Array.from({ length: 50 }, (_, i) => `After paragraph ${i + 1}. More content.`), "## End of complete note"
    ].join("\n\n");
    await seedDailyNoteState(page, { remote: { date: "2030-02-02", markdown: content,
      revisionId: "preview-version", updatedAt: "2030-02-01T00:00:00Z" } });
    await setRawMarkdown(page, "Preserve the editor date's content");
    await page.getByRole("button", { name: "Open menu" }).click();
    await page.getByRole("menuitem", { name: "Search daily notes", exact: true }).click();
    const dialog = page.getByRole("dialog", { name: "Search daily notes" });
    await dialog.getByLabel("Search words").fill("needleword");
    await dialog.getByRole("button", { name: "Search", exact: true }).click();
    const heading = dialog.locator(".search-result-heading");
    await expect(heading).toBeVisible();
    await dialog.getByLabel("Search words").hover();
    const resting = await heading.evaluate((element) => getComputedStyle(element).backgroundColor);
    await heading.locator("time").hover();
    expect(await heading.evaluate((element) => getComputedStyle(element).backgroundColor)).not.toBe(resting);
    await expect(dialog.getByRole("region", { name: "Read-only note preview" })).toHaveCount(0);
    await dialog.getByRole("button", { name: "2030-02-02", exact: true }).click();
    const preview = dialog.getByRole("region", { name: "Read-only note preview" });
    await expect(preview.locator(".ProseMirror")).toHaveAttribute("contenteditable", "false");
    await expect(preview).toHaveAttribute("title", "Read-only preview. First match in view. Links are disabled. Click to open.");
    await expect(dialog.locator(".search-preview-status")).toHaveCount(0);
    await expect.poll(() => preview.evaluate((element) => {
      const bounds = element.getBoundingClientRect();
      const first = element.querySelector("strong")!.getBoundingClientRect();
      const dialog = element.closest("dialog")!.getBoundingClientRect();
      return bounds.height <= Math.min(window.innerHeight * 0.22, 220) + 1
        && element.scrollTop > 300 && first.top >= bounds.top && first.bottom <= bounds.bottom
        && first.top >= dialog.top && first.bottom <= dialog.bottom;
    })).toBe(true);
    await expect(preview.getByRole("heading", { name: "End of complete note" })).toHaveCount(1);
    await expect(preview.locator("pre code")).toContainText("const count = 42;");
    await expect(preview.locator("table")).toContainText("one");
    await expect(preview.locator(".katex")).toHaveCount(1);
    const task = preview.locator(".jot-task-checkbox");
    await expect(task.locator("..")).toHaveClass(/readonly/);
    await expect(task.locator("..")).not.toHaveClass(/(?:^|\s)checked(?:\s|$)/);
    await expect(page.getByLabel("Selected date", { exact: true })).toHaveValue("2030-02-04");
    const originalUrl = page.url();
    const pageCount = context.pages().length;
    const external = preview.getByRole("link", { name: "External", exact: true });
    await expect(external).toHaveAttribute("aria-disabled", "true");
    await external.click({ button: "middle", force: true });
    expect(page.url()).toBe(originalUrl);
    expect(context.pages().length).toBe(pageCount);
    await preview.focus();
    await page.keyboard.type("SHOULD NOT EDIT");
    await expect(preview.locator(".ProseMirror")).not.toContainText("SHOULD NOT EDIT");
    await expect(dialog).toBeVisible();
    await dialog.getByRole("button", { name: "2030-02-02", exact: true }).click();
    await expect(preview).toHaveCount(0);
    await dialog.getByRole("button", { name: "2030-02-02", exact: true }).click();
    await expect(preview.locator("strong")).toHaveText("needleword");
    await dialog.getByRole("button", { name: "2030-02-02", exact: true }).click();
    await expect.poll(() => readLocalDraft(page, "2030-02-04")).toMatchObject({ markdown: "Preserve the editor date's content" });
    // Metadata toggles the preview; clicking the rendered note opens it.
    await heading.locator("time").click();
    await expect(preview.locator("strong")).toBeVisible();
    await preview.locator("strong").click();
    await expect(page.getByLabel("Selected date", { exact: true })).toHaveValue("2030-02-02");
    await expectRawMarkdown(page, content);
  });
}

test("a failed preview can be retried without opening the Daily Note", async ({ page }) => {
  await openDevelopmentStorage(page, "/#/date/2030-02-04", "disabled");
  await seedDailyNoteState(page, { remote: { date: "2030-02-02", markdown: "Retry preview [example](https://example.com)",
    revisionId: "preview-retry", updatedAt: "2030-02-01T00:00:00Z" } });
  await page.getByRole("button", { name: "Open menu" }).click();
  await page.getByRole("menuitem", { name: "Search daily notes", exact: true }).click();
  const dialog = page.getByRole("dialog", { name: "Search daily notes" });
  await dialog.getByLabel("Search words").fill("example");
  await dialog.getByRole("button", { name: "Search", exact: true }).click();
  await expect(dialog.locator(".search-result-open")).toBeVisible();
  await page.evaluate(() => localStorage.setItem("jot.fakeRemoteUnavailable", "true"));
  await dialog.getByRole("button", { name: "2030-02-02", exact: true }).click();
  await expect(dialog.getByRole("alert")).toContainText("unavailable");
  await page.evaluate(() => localStorage.removeItem("jot.fakeRemoteUnavailable"));
  await dialog.getByRole("button", { name: "Retry preview", exact: true }).click();
  await expect(dialog.getByRole("region", { name: "Read-only note preview" }).locator(".ProseMirror")).toContainText("Retry preview example");
  await expect(page.getByLabel("Selected date", { exact: true })).toHaveValue("2030-02-04");
  await dialog.getByRole("region", { name: "Read-only note preview" }).getByRole("link", { name: "example", exact: true }).click({ force: true });
  await expect(page.getByLabel("Selected date", { exact: true })).toHaveValue("2030-02-02");
  expect(page.url()).not.toContain("example.com");
});

test("search marks today's and the open note's dates and supports a larger resizable dialog", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 1100 });
  await openDevelopmentStorage(page, "/", "disabled");
  const today = await page.getByLabel("Selected date", { exact: true }).inputValue();
  await setRawMarkdown(page, "markerword in today's note");
  await expect(page.locator(".sync-status[aria-label*='Synced']")).toBeVisible();
  await seedDailyNoteState(page, { remote: { date: "2030-02-02", markdown: "markerword older note",
    revisionId: "marker-old", updatedAt: "2030-02-01T00:00:00Z" } });
  const openSearch = async () => {
    await page.getByRole("button", { name: "Open menu" }).click();
    await page.getByRole("menuitem", { name: "Search daily notes", exact: true }).click();
    await page.getByLabel("Search words").fill("markerword");
    await page.getByRole("button", { name: "Search", exact: true }).click();
  };
  await openSearch();
  const dialog = page.getByRole("dialog", { name: "Search daily notes" });
  await expect(dialog.locator(".search-result-date").filter({ hasText: today })).toHaveText(`${today} (today, open)`);
  expect(await dialog.locator(".search-result-date").filter({ hasText: today }).evaluate((element) => {
    const text = document.createRange(); text.selectNodeContents(element.firstChild!);
    return element.querySelector(".search-result-marker")!.getBoundingClientRect().left - text.getBoundingClientRect().right;
  })).toBeCloseTo(6, 0);
  const heading = dialog.getByRole("heading", { name: "Search daily notes", exact: true });
  expect(await heading.evaluate((element) => parseFloat(getComputedStyle(element).fontSize))).toBeGreaterThanOrEqual(24);
  const before = await dialog.boundingBox();
  expect(before!.width).toBeGreaterThan(680);
  await page.mouse.move(before!.x + before!.width - 3, before!.y + before!.height - 3);
  await page.mouse.down();
  await page.mouse.move(before!.x + before!.width + 97, before!.y + before!.height + 117, { steps: 10 });
  await page.mouse.up();
  await expect.poll(async () => {
    const after = (await dialog.boundingBox())!;
    return after.width > before!.width + 50 && after.height > before!.height + 50;
  }).toBe(true);
  await dialog.getByRole("button", { name: "Open note 2030-02-02", exact: true }).click();
  await expect(page.getByLabel("Selected date", { exact: true })).toHaveValue("2030-02-02");
  await openSearch();
  await expect(dialog.locator(".search-result-date").filter({ hasText: today })).toHaveText(`${today} (today)`);
  await expect(dialog.locator(".search-result-date").filter({ hasText: "2030-02-02" })).toHaveText("2030-02-02 (open)");
});

test("today/open markers fit a phone result row and its default action expands the preview", async ({ page }) => {
  await page.setViewportSize({ width: 360, height: 640 });
  await openDevelopmentStorage(page, "/", "disabled");
  const date = await page.getByLabel("Selected date", { exact: true }).inputValue();
  await setRawMarkdown(page, "phonemarker note");
  await expect(page.locator(".sync-status[aria-label*='Synced']")).toBeVisible();
  await page.getByRole("button", { name: "Open menu" }).click();
  await page.getByRole("menuitem", { name: "Search daily notes", exact: true }).click();
  const dialog = page.getByRole("dialog", { name: "Search daily notes" });
  await dialog.getByLabel("Search words").fill("phonemarker");
  await dialog.getByRole("button", { name: "Search", exact: true }).click();
  await expect(dialog.locator(".search-result-date")).toHaveText(`${date} (today, open)`);
  expect(await dialog.locator(".search-result-date").evaluate((element) => {
    return parseFloat(getComputedStyle(element.querySelector(".search-result-marker")!).marginInlineStart);
  })).toBeCloseTo(6, 0);
  expect(await dialog.locator(".search-result-heading").evaluate((element) => {
    const label = element.querySelector(".search-result-date")!.getBoundingClientRect();
    const metadata = element.querySelector(".search-result-metadata")!.getBoundingClientRect();
    return element.scrollWidth <= element.clientWidth && metadata.left >= label.right;
  })).toBe(true);
  await expect.poll(() => dialog.evaluate((element) => element.scrollWidth <= element.clientWidth)).toBe(true);
  await page.evaluate(() => localStorage.setItem("jot.fakeRemoteUnavailable", "true"));
  await dialog.getByRole("button", { name: `${date} (today, open)`, exact: true }).click();
  await expect(dialog.getByRole("region", { name: "Read-only note preview" }).locator(".ProseMirror")).toContainText("phonemarker note");
  await expect(dialog.getByRole("alert")).toHaveCount(0);
  await page.evaluate(() => localStorage.removeItem("jot.fakeRemoteUnavailable"));
  await expect(page.getByLabel("Selected date", { exact: true })).toHaveValue(date);
});


test("the centered search dialog resize corner follows the pointer throughout the drag", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 1100 });
  await openDevelopmentStorage(page, "/", "disabled");
  await page.getByRole("button", { name: "Open menu" }).click();
  await page.getByRole("menuitem", { name: "Search daily notes", exact: true }).click();
  const dialog = page.getByRole("dialog", { name: "Search daily notes" });
  const before = (await dialog.boundingBox())!;
  const corner = { x: before.x + before.width - 3, y: before.y + before.height - 3 };
  await page.mouse.move(corner.x, corner.y);
  await page.mouse.down();
  try {
    for (const delta of [20, 40, 60]) {
      await page.mouse.move(corner.x + delta, corner.y + delta, { steps: 4 });
      const bounds = (await dialog.boundingBox())!;
      expect(Math.abs(bounds.x + bounds.width - 3 - (corner.x + delta))).toBeLessThan(4);
      expect(Math.abs(bounds.y + bounds.height - 3 - (corner.y + delta))).toBeLessThan(4);
      expect(Math.abs(bounds.x + bounds.width / 2 - 720)).toBeLessThan(2);
      expect(Math.abs(bounds.y + bounds.height / 2 - 550)).toBeLessThan(2);
    }
  } finally { await page.mouse.up(); }
  const grip = dialog.getByRole("button", { name: "Resize search dialog", exact: true });
  await grip.focus();
  const keyboardBefore = (await dialog.boundingBox())!;
  await page.keyboard.press("ArrowLeft");
  await page.keyboard.press("ArrowUp");
  const keyboardAfter = (await dialog.boundingBox())!;
  expect(keyboardBefore.width - keyboardAfter.width).toBeCloseTo(20, 0);
  expect(keyboardBefore.height - keyboardAfter.height).toBeCloseTo(20, 0);
});

test("the open note falls back to Drive when its current text lacks the search terms", async ({ page }) => {
  const date = "2030-02-04";
  await openDevelopmentStorage(page, `/#/date/${date}`, "disabled");
  await setRawMarkdown(page, "Local text without the remote keyword");
  await seedDailyNoteState(page, { remote: { date, markdown: "Remote fallbackmatch content", revisionId: "remote-preview", updatedAt: "2030-02-04T00:00:00Z" } });
  await page.getByRole("button", { name: "Open menu" }).click();
  await page.getByRole("menuitem", { name: "Search daily notes", exact: true }).click();
  const dialog = page.getByRole("dialog", { name: "Search daily notes" });
  await dialog.getByLabel("Search words").fill("fallbackmatch");
  await dialog.getByRole("button", { name: "Search", exact: true }).click();
  await dialog.locator(".search-result-row").click();
  const preview = dialog.getByRole("region", { name: "Read-only note preview" });
  await expect(preview.locator(".ProseMirror")).toContainText("Remote fallbackmatch content");
  expect((await preview.boundingBox())!.height).toBeLessThanOrEqual(221);
  await dialog.getByRole("button", { name: "Close search", exact: true }).click();
  await expectRawMarkdown(page, /^Local text without the remote keyword/);
});
