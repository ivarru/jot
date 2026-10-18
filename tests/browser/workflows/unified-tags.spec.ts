import { expect, test } from "@playwright/test";
import { openDevelopmentStorage, setRawMarkdown, switchToWysiwygMode, focusRawEditorRange,
  focusWysiwygTextOffset, rawEditor, wysiwygEditor, expectRawMarkdown } from "../helpers/editor";

for (const mode of ["raw", "wysiwyg"] as const) {
  for (const entry of ["toolbar", "shortcut"] as const) {
    for (const control of ["Escape", "Close tags"] as const) {
    test(`cancelling tags via ${control} from ${entry} restores the ${mode} caret`, async ({ page }) => {
      await openDevelopmentStorage(page, "/#/date/2030-02-04", "disabled");
      await setRawMarkdown(page, "Alpha beta omega");
      if (mode === "wysiwyg") {
        await switchToWysiwygMode(page);
        await focusWysiwygTextOffset(page, "Alpha beta omega", 6);
      } else await focusRawEditorRange(page, 6, 6);
      if (entry === "toolbar") await page.getByRole("button", { name: "Tag", exact: true }).click();
      else await page.keyboard.press(process.platform === "darwin" ? "Meta+Alt+K" : "Control+Alt+K");
      const dialog = page.getByRole("dialog");
      await expect(dialog).toBeVisible();
      await dialog.locator("input").first().click();
      if (control === "Escape") await page.keyboard.press("Escape");
      else await dialog.getByRole("button", { name: control, exact: true }).click();
      await expect(dialog).toHaveCount(0);
      await expect(mode === "raw" ? rawEditor(page) : wysiwygEditor(page)).toBeFocused();
      await page.keyboard.insertText("X");
      await expectRawMarkdown(page, mode === "raw" ? "Alpha Xbeta omega" : /^Alpha Xbeta omega\n?$/);
    });
    }
  }
}

for (const mode of ["raw", "wysiwyg"] as const) {
  for (const [source, text, expected] of [
    ["# Heading\n\nTail", "Heading", "# Heading\n\n[#work](jot:tag/work)\n\nTail"],
    ["Read [docs](https://example.com) now", "docs", "Read [docs](https://example.com) [#work](jot:tag/work) now"],
    ["Read `sample code` now", "sample code", "Read `sample code` [#work](jot:tag/work) now"],
    ["```js\nconst x = 1;\n```\n\nTail", "const x", "```js\nconst x = 1;\n```\n\n[#work](jot:tag/work)\n\nTail"],
  ]) {
    test(`Tags inserts after ${text} in ${mode} mode`, async ({ page }) => {
      await openDevelopmentStorage(page, "/#/date/2030-02-04", "disabled");
      await setRawMarkdown(page, source!);
      if (mode === "wysiwyg") {
        await switchToWysiwygMode(page); await focusWysiwygTextOffset(page, text!, 2);
      } else {
        const offset = source!.indexOf(text!) + 2; await focusRawEditorRange(page, offset, offset);
      }
      await page.getByRole("button", { name: "Tag", exact: true }).click();
      const dialog = page.getByRole("dialog", { name: "Tags", exact: true });
      await dialog.getByRole("combobox").fill("work");
      await dialog.locator(".tag-field-add").click();
      await expect(dialog).toHaveCount(0);
      await expect(mode === "raw" ? rawEditor(page) : wysiwygEditor(page)).toBeFocused();
      if (mode === "raw") await expectRawMarkdown(page, expected!);
      else {
        const tag = wysiwygEditor(page).locator('a[href="jot:tag/work"]');
        await expect(tag).toHaveText("#work");
        expect(await tag.evaluate(element => element.parentElement?.closest("h1,h2,h3,h4,h5,h6,pre,code,a") === null)).toBe(true);
        await expect(wysiwygEditor(page)).toContainText(text!);
      }
      // Undo in the editor that performed the insertion; inspecting raw Markdown switches modes.
      await page.getByRole("button", { name: "Undo", exact: true }).click();
      await expectRawMarkdown(page, mode === "raw" ? source! : new RegExp("^" + source!.replace(/[.*+?^${}()|[\]\\]/g, "\\$&") + "\\n?$"));
    });
  }
}

async function seedTags(page: import("@playwright/test").Page) {
  const { seedDailyNoteState } = await import("../helpers/idb");
  await seedDailyNoteState(page, { remote: { date: "2030-02-01", markdown: "Research [#research](jot:tag/research)\n\nRelease [#release](jot:tag/release)", revisionId: "a", updatedAt: "2030-01-01T00:00:00Z" } });
  await page.getByRole("button", { name: "Open menu" }).click();
  await page.getByRole("menuitem", { name: "Settings", exact: true }).click();
  const settings = page.getByRole("dialog", { name: "Settings" });
  await settings.getByRole("button", { name: "Rebuild tag index" }).click();
  await expect.poll(() => page.evaluate(() => JSON.parse(localStorage.getItem("jot.tagIndexCatalog.v1") ?? "[]").map((entry: { tag: string }) => entry.tag).sort())).toEqual(["release", "research"]);
  await settings.getByRole("button", { name: "Close settings" }).click();
}

for (const mode of ["raw", "wysiwyg"] as const) {
  test(`arrow keys traverse all Add buttons from an empty ${mode} tag field`, async ({ page }) => {
    await openDevelopmentStorage(page, "/#/date/2030-02-04", "disabled");
    await seedTags(page);
    await setRawMarkdown(page, "Alpha omega");
    if (mode === "wysiwyg") {
      await switchToWysiwygMode(page);
      await focusWysiwygTextOffset(page, "Alpha omega", 6);
    } else await focusRawEditorRange(page, 6, 6);
    await page.getByRole("button", { name: "Tag", exact: true }).click();
    const dialog = page.getByRole("dialog", { name: "Tags", exact: true });
    const input = dialog.getByRole("combobox", { name: "Tag or filter" });
    await expect(input).toBeFocused();
    const buttons = dialog.locator(".tag-row-add");
    const names = await buttons.evaluateAll(elements => elements.map(e => e.getAttribute("aria-label")));
    expect(names).toHaveLength(2);
    for (const name of names) {
      await page.keyboard.press("ArrowDown");
      await expect(dialog.locator(".tag-row-add.is-secondary-focus")).toHaveAttribute("aria-label", name!);
      await expect(input).toBeFocused();
    }
    await page.keyboard.press("ArrowUp");
    await expect(dialog.locator(".tag-row-add.is-secondary-focus")).toHaveAttribute("aria-label", names[0]!);
    await page.keyboard.press("ArrowUp");
    await expect(dialog.locator(".tag-field-add")).toHaveClass(/is-secondary-focus/);
    await expect(input).toHaveValue("");
  });
}

test("Firefox can select and add a tag immediately after typing in the WYSIWYG editor", async ({ page }) => {
  await openDevelopmentStorage(page, "/#/date/2030-02-04", "disabled");
  await seedTags(page);
  await wysiwygEditor(page).click();
  await page.keyboard.type("A new paragraph ");
  await page.getByRole("button", { name: "Tag", exact: true }).click();
  const dialog = page.getByRole("dialog", { name: "Tags", exact: true });
  const input = dialog.getByRole("combobox", { name: "Tag or filter" });
  await input.pressSequentially("res");
  await expect(dialog.getByRole("button", { name: "Use #research", exact: true })).toBeEnabled();
  await input.press("ArrowDown");
  await expect(dialog.locator(".tag-row-add.is-secondary-focus")).toHaveAttribute("aria-label", "Use #research");
  await input.press("Enter");
  await expect(dialog).toHaveCount(0);
  await expect(wysiwygEditor(page)).toContainText("#research");
});

test("Tags keeps its top edge fixed while filtering changes its height", async ({ page }) => {
  await page.setViewportSize({ width: 1100, height: 900 });
  await openDevelopmentStorage(page, "/#/date/2030-02-04", "disabled");
  await seedTags(page);
  await page.getByRole("button", { name: "Tag", exact: true }).click();
  const dialog = page.getByRole("dialog", { name: "Tags", exact: true });
  const input = dialog.getByRole("combobox", { name: "Tag or filter" });
  const top = (await dialog.boundingBox())!.y;
  await input.fill("no-matching-tags");
  await expect(dialog).toContainText("No tags match this prefix.");
  await expect.poll(async () => (await dialog.boundingBox())!.y).toBeCloseTo(top, 0);
  expect(top).toBeLessThanOrEqual(48);
  expect(top).toBeGreaterThanOrEqual(12);
  await input.fill("");
  await expect.poll(async () => (await dialog.boundingBox())!.y).toBeCloseTo(top, 0);
  await dialog.getByRole("button", { name: "Expand #research", exact: true }).click();
  await expect(dialog.locator(".tag-index-occurrence")).toHaveCount(1);
  await expect.poll(async () => (await dialog.boundingBox())!.y).toBeCloseTo(top, 0);
});

for (const method of ["field button", "row button", "Enter", "highlighted Enter"] as const) {
  test(`unified tags insert through ${method} and preserve the insertion caret and undo`, async ({ page }) => {
    await openDevelopmentStorage(page, "/#/date/2030-02-04", "disabled");
    await seedTags(page);
    await setRawMarkdown(page, "Alpha omega"); await focusRawEditorRange(page, 6, 6);
    await page.getByRole("button", { name: "Tag", exact: true }).click();
    const dialog = page.getByRole("dialog", { name: "Tags", exact: true });
    const input = dialog.getByRole("combobox", { name: "Tag or filter" });
    await expect(input).toBeFocused(); await expect(dialog.locator(".tag-field-add")).toBeHidden();
    let tag = "new-tag";
    if (method === "row button") {
      tag = "research"; await dialog.getByRole("button", { name: "Use #research", exact: true }).click();
    } else if (method === "highlighted Enter") {
      tag = "research"; await input.fill("res"); await input.press("ArrowDown");
      await expect(input).toHaveValue("res"); await expect(dialog.locator(".tag-row-add.is-secondary-focus")).toHaveAttribute("aria-label", "Use #research");
      // A refresh with unchanged tags must retain secondary focus and typing focus.
      await page.evaluate(() => window.dispatchEvent(new Event("online")));
      await expect(dialog.locator(".tag-row-add.is-secondary-focus")).toHaveAttribute("aria-label", "Use #research");
      await input.press("Enter");
    } else {
      await input.fill("New Tag");
      if (method === "field button") await dialog.locator(".tag-field-add").click(); else await input.press("Enter");
    }
    const expected = `Alpha [#${tag}](jot:tag/${tag}) omega`;
    await expect(dialog).toHaveCount(0); await expect(rawEditor(page)).toBeFocused();
    await expect(rawEditor(page)).toHaveValue(expected);
    await expect.poll(() => rawEditor(page).evaluate((e) => (e as HTMLTextAreaElement).selectionStart)).toBe(expected.indexOf("omega"));
    await page.getByRole("button", { name: "Undo", exact: true }).click();
    await expect(rawEditor(page)).toHaveValue("Alpha omega");
  });
}

test("Tab completes a shared prefix without inserting or trapping ordinary focus traversal", async ({ page }) => {
  await openDevelopmentStorage(page, "/#/date/2030-02-04", "disabled"); await seedTags(page);
  await page.getByRole("button", { name: "Tag", exact: true }).click();
  const dialog = page.getByRole("dialog", { name: "Tags", exact: true });
  const input = dialog.getByRole("combobox", { name: "Tag or filter" });
  await input.fill("r"); await input.press("Tab"); await expect(input).toHaveValue("re"); await expect(input).toBeFocused();
  await input.press("Tab"); await expect(dialog.locator(".tag-field-add")).toBeFocused();
  await input.fill("rese"); await input.press("Tab"); await expect(input).toHaveValue("research");
  await expect(dialog).toBeVisible(); await expect(dialog.locator(".tag-index-occurrence")).toHaveCount(0);
  await input.fill("none"); await input.press("Tab"); await expect(dialog.locator(".tag-field-add")).toBeFocused();
  await page.keyboard.press("Escape"); await expect(dialog).toHaveCount(0);
});

for (const theme of ["light", "dark"] as const) {
  test(`expanded tag rows sort date groups and fade only repeated dates in ${theme} mode`, async ({ page }) => {
    await page.emulateMedia({ colorScheme: theme }); await page.setViewportSize({ width: 360, height: 700 });
    await openDevelopmentStorage(page, "/#/date/2030-02-04", "disabled");
    const { seedDailyNoteState } = await import("../helpers/idb");
    await seedDailyNoteState(page, { remote: { date: "2030-02-01", markdown: "Old first [#work](jot:tag/work)\n\nOld second [#work](jot:tag/work)", revisionId: "a", updatedAt: "2030-01-01T00:00:00Z" } });
    await seedDailyNoteState(page, { remote: { date: "2030-02-02", markdown: "New first [#work](jot:tag/work)\n\nNew second [#work](jot:tag/work)", revisionId: "b", updatedAt: "2030-01-01T00:00:00Z" } });
    await page.getByRole("button", { name: "Open menu" }).click(); await page.getByRole("menuitem", { name: "Settings", exact: true }).click();
    const settings = page.getByRole("dialog", { name: "Settings" }); await settings.getByRole("button", { name: "Rebuild tag index" }).click();
    await expect.poll(() => page.evaluate(() => JSON.parse(localStorage.getItem("jot.tagIndexCatalog.v1") ?? "[]").some((e: { tag: string }) => e.tag === "work"))).toBe(true);
    await settings.getByRole("button", { name: "Close settings" }).click();
    await page.getByRole("button", { name: "Tag", exact: true }).click();
    const dialog = page.getByRole("dialog", { name: "Tags", exact: true });
    await dialog.getByRole("button", { name: "Expand #work" }).click();
    const rows = dialog.locator(".tag-index-occurrence"); await expect(rows).toHaveCount(4);
    await expect(rows.locator("time")).toHaveText(["2030-02-02", "2030-02-02", "2030-02-01", "2030-02-01"]);
    await expect(rows.locator(".tag-index-excerpt")).toHaveText(["New first", "New second", "Old first", "Old second"]);
    await expect(dialog).not.toContainText("Instance"); await expect(dialog.locator(".tag-index-modified time")).toHaveText(/\d{4}-\d\d-\d\d \d\d:\d\d/);
    const colors = await rows.evaluateAll((elements) => elements.map((row) => ({ date: getComputedStyle(row.querySelector("time")!).color, opacity: getComputedStyle(row).opacity, excerptOpacity: getComputedStyle(row.querySelector(".tag-index-excerpt")!).opacity })));
    expect(colors[0]!.date).toBe(colors[2]!.date); expect(colors[1]!.date).toBe(colors[3]!.date); expect(colors[0]!.date).not.toBe(colors[1]!.date);
    expect(colors.every((c) => c.opacity === "1" && c.excerptOpacity === "1")).toBe(true);
    expect(await dialog.evaluate((e) => e.scrollWidth <= e.clientWidth)).toBe(true);
    await rows.nth(3).click(); await expect(page.getByLabel("Selected date", { exact: true })).toHaveValue("2030-02-01");
    await expect.poll(() => page.evaluate(() => window.getSelection()?.toString())).toContain("#work");
    await expect.poll(() => page.evaluate(() => window.getSelection()?.anchorNode?.parentElement?.closest("p")?.textContent)).toContain("Old second");
  });
}

test("Escape closes the tag dialog while retaining actual fullscreen", async ({ page, context, browserName }) => {
  test.skip(browserName !== "chromium", "Firefox consumes Escape in DOM fullscreen and does not implement Keyboard Lock.");
  await openDevelopmentStorage(page, "/#/date/2030-02-04", "disabled");
  if (browserName === "chromium") {
    const cdp = await context.newCDPSession(page);
    await cdp.send("Browser.grantPermissions", { origin: new URL(page.url()).origin, permissions: ["keyboardLock"] });
  }
  // Enter actual fullscreen through a trusted button click; do not stub fullscreen or keyboard-lock APIs.
  await page.evaluate(() => {
    const button = document.createElement("button"); button.textContent = "Enter test fullscreen";
    button.addEventListener("click", () => { void document.documentElement.requestFullscreen(); }); document.body.append(button);
  });
  await page.getByRole("button", { name: "Enter test fullscreen" }).click();
  await expect.poll(() => page.evaluate(() => Boolean(document.fullscreenElement))).toBe(true);
  await page.getByRole("button", { name: "Tag", exact: true }).click();
  const dialog = page.getByRole("dialog", { name: "Tags", exact: true }); await expect(dialog.getByRole("combobox")).toBeFocused();
  await page.keyboard.press("Escape"); await expect(dialog).toHaveCount(0);
  await expect.poll(() => page.evaluate(() => Boolean(document.fullscreenElement))).toBe(true);
  await page.evaluate(() => document.exitFullscreen());
});

for (const mode of ["raw", "wysiwyg"] as const) {
  test(`cancelling tags preserves a noncollapsed ${mode} selection`, async ({ page }) => {
    await openDevelopmentStorage(page, "/#/date/2030-02-04", "disabled"); await setRawMarkdown(page, "Alpha beta omega");
    if (mode === "raw") await focusRawEditorRange(page, 6, 10);
    else {
      await switchToWysiwygMode(page);
      await wysiwygEditor(page).evaluate((editor) => {
        (editor as HTMLElement).focus(); const node = editor.querySelector("p")!.firstChild!;
        const range = document.createRange(); range.setStart(node, 6); range.setEnd(node, 10);
        getSelection()?.removeAllRanges(); getSelection()?.addRange(range); document.dispatchEvent(new Event("selectionchange"));
      });
    }
    await page.getByRole("button", { name: "Tag", exact: true }).click();
    const dialog = page.getByRole("dialog", { name: "Tags", exact: true }); await dialog.getByRole("button", { name: "Close tags", exact: true }).click();
    await expect(mode === "raw" ? rawEditor(page) : wysiwygEditor(page)).toBeFocused();
    await page.keyboard.insertText("new");
    await expectRawMarkdown(page, mode === "raw" ? "Alpha new omega" : /^Alpha new omega\n?$/);
  });
}

test("a date change while Tags is open disables insertion and cannot restore A's caret into B", async ({ page }) => {
  await openDevelopmentStorage(page, "/#/date/2030-02-04", "disabled"); await setRawMarkdown(page, "A unsynced text");
  const { seedDailyNoteState, readLocalDraft } = await import("../helpers/idb");
  await seedDailyNoteState(page, { remote: { date: "2030-02-05", markdown: "B content", revisionId: "b", updatedAt: "2030-01-01T00:00:00Z" } });
  await focusRawEditorRange(page, 2, 2); await page.getByRole("button", { name: "Tag", exact: true }).click();
  const dialog = page.getByRole("dialog", { name: "Tags", exact: true });
  await dialog.getByRole("combobox").fill("work");
  await page.evaluate(() => { window.location.hash = "#/date/2030-02-05"; });
  await expect(page.getByLabel("Selected date", { exact: true })).toHaveValue("2030-02-05");
  await expect(dialog.locator(".tag-field-add")).toBeDisabled(); await expect(dialog).toContainText("Daily Note changed");
  await dialog.getByRole("combobox").press("Enter"); await expect(dialog).toBeVisible();
  await dialog.getByRole("button", { name: "Close tags" }).click();
  await expect(rawEditor(page)).toHaveValue("B content");
  await expect.poll(async () => (await readLocalDraft(page, "2030-02-04"))?.markdown).toBe("A unsynced text");
  expect(await rawEditor(page).evaluate((e) => (e as HTMLTextAreaElement).selectionStart)).not.toBe(2);
});

for (const method of ["row Add", "Enter"] as const) {
  test(`WYSIWYG insertion through ${method} restores the new caret and is undoable`, async ({ page }) => {
    await openDevelopmentStorage(page, "/#/date/2030-02-04", "disabled"); await seedTags(page);
    await setRawMarkdown(page, "Alpha omega"); await switchToWysiwygMode(page);
    await focusWysiwygTextOffset(page, "Alpha omega", 6);
    await page.getByRole("button", { name: "Tag", exact: true }).click();
    const dialog = page.getByRole("dialog", { name: "Tags", exact: true });
    const tag = method === "row Add" ? "research" : "new-tag";
    if (method === "row Add") await dialog.getByRole("button", { name: "Use #research", exact: true }).click();
    else { await dialog.getByRole("combobox").fill(tag); await dialog.getByRole("combobox").press("Enter"); }
    await expect(dialog).toHaveCount(0); await expect(wysiwygEditor(page)).toBeFocused();
    await page.keyboard.insertText("X");
    await expect(wysiwygEditor(page)).toContainText(`Alpha #${tag} Xomega`);
    await page.getByRole("button", { name: "Undo", exact: true }).click();
    await expect(wysiwygEditor(page)).not.toContainText("Xomega");
    // Milkdown may group immediately adjacent typing with the insertion.
    if ((await wysiwygEditor(page).textContent())?.includes(`#${tag}`)) await page.getByRole("button", { name: "Undo", exact: true }).click();
    await expect(wysiwygEditor(page)).toHaveText("Alpha omega");
  });
}

test("a read-only note still permits tag browsing with Add controls disabled", async ({ page, context }) => {
  await openDevelopmentStorage(page, "/#/date/2030-02-04", "disabled"); await seedTags(page);
  await setRawMarkdown(page, "Owned by the first tab");
  const { readLocalDraft } = await import("../helpers/idb");
  await expect.poll(async () => (await readLocalDraft(page, "2030-02-04"))?.markdown).toBe("Owned by the first tab");
  const second = await context.newPage();
  try {
    await second.goto("/#/date/2030-02-04");
    await expect(second.getByText("Open in another tab")).toBeVisible();
    await second.getByRole("button", { name: "Tag", exact: true }).click();
    const dialog = second.getByRole("dialog", { name: "Tags", exact: true });
    await dialog.getByRole("combobox").fill("res");
    await expect(dialog.locator(".tag-field-add")).toBeDisabled(); await expect(dialog.getByRole("button", { name: "Use #research", exact: true })).toBeDisabled();
    await dialog.getByRole("button", { name: "Expand #research" }).click(); await expect(dialog.locator(".tag-index-occurrence")).toHaveCount(1);
    await dialog.getByRole("button", { name: "Close tags" }).click();
  } finally { await second.close(); }
});

test("a locally created tag can immediately be reused before syncing", async ({ page, context }) => {
  await openDevelopmentStorage(page, "/#/date/2030-02-04", "disabled");
  await context.setOffline(true);
  await setRawMarkdown(page, "Local note"); await focusRawEditorRange(page, 10, 10);
  await page.getByRole("button", { name: "Tag", exact: true }).click();
  const dialog = page.getByRole("dialog", { name: "Tags", exact: true });
  await expect(dialog.locator(".tag-field-add")).toBeHidden();
  await expect(dialog).not.toContainText("Add a tag at the editor cursor");
  await dialog.getByRole("combobox").fill("fresh-tag");
  await dialog.getByRole("button", { name: "Create", exact: true }).click();
  await expect(dialog).toHaveCount(0);
  await page.getByRole("button", { name: "Tag", exact: true }).click();
  const use = dialog.getByRole("button", { name: "Use #fresh-tag", exact: true });
  await expect(use).toBeVisible();
  await expect(dialog.locator(".tag-index-modified")).toContainText("Changed");
  await expect(dialog.locator(".tag-index-row")).toHaveAttribute("title", "Click to show tag occurrences");
  await dialog.getByRole("button", { name: "Expand #fresh-tag", exact: true }).click();
  await expect(dialog).toContainText("No synced occurrences yet.");
  await use.click();
  await expect(rawEditor(page)).toHaveValue("Local note [#fresh-tag](jot:tag/fresh-tag) [#fresh-tag](jot:tag/fresh-tag)");
});

test("an expanded local reference tag refreshes when its synced index appears", async ({ page, context }) => {
  await openDevelopmentStorage(page, "/#/date/2030-02-04", "disabled");
  await context.setOffline(true);
  await setRawMarkdown(page, "Context [#work][w]\n\n[w]: jot:tag/work");
  await page.getByRole("button", { name: "Tag", exact: true }).click();
  const dialog = page.getByRole("dialog", { name: "Tags", exact: true });
  await expect(dialog.getByRole("button", { name: "Use #work", exact: true })).toBeVisible();
  await dialog.getByRole("button", { name: "Expand #work", exact: true }).click();
  await expect(dialog).toContainText("No synced occurrences yet.");
  await context.setOffline(false);
  await expect(dialog.locator(".tag-index-occurrence")).toHaveCount(1, { timeout: 20_000 });
  await expect(dialog.locator(".tag-index-excerpt")).toHaveText("Context");
  await expect(dialog.getByRole("button", { name: "Collapse #work", exact: true })).toBeVisible();
});
