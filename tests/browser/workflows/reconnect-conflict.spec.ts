import { expect, test } from "@playwright/test";
import { grantClipboardPermissions } from "../helpers/clipboard";
import {
  clickButton,
  expectRawMarkdown,
  openDevelopmentStorage,
  rawModeToggle,
  setRawMarkdown,
  setTextareaValue
} from "../helpers/editor";
import {
  readFakeRemoteNote,
  readLocalDraft,
  seedConflictState,
  seedDailyNoteState,
  waitForFakeRemoteNote
} from "../helpers/idb";

const date = "2030-02-02";
const baseline = "before\nold\nsame\nafter\n";
const local = "before\nlocal\nsame\nafter\n";
const remote = "before\nremote\nsame\nafter\n";
const resolved = "resolved note\n";

test.describe("mobile remote-note loading", () => {
  test.use({
    viewport: { width: 432, height: 800 },
    hasTouch: true,
    isMobile: true
  });

  test("resuming a phone tab preserves a compact list written while it was backgrounded", async ({ page }) => {
    const before = "Earlier phone content";
    const compact = [
      "* AWS Kiro",
      "* [Agent Skills](https://agentskills.io/home) (standard)."
    ].join("\n");
    await openDevelopmentStorage(page, "/", "disabled");
    await seedDailyNoteState(page, {
      remote: {
        date,
        markdown: before,
        revisionId: "phone-revision",
        updatedAt: "2030-01-01T00:00:00.000Z"
      }
    });
    await page.goto(`/#/date/${date}`);
    await expect(page.locator(".milkdown-root")).toContainText(before);

    await page.evaluate(() => {
      Object.defineProperty(document, "visibilityState", { configurable: true, value: "hidden" });
      document.dispatchEvent(new Event("visibilitychange"));
    });
    await seedDailyNoteState(page, {
      remote: {
        date,
        markdown: compact,
        revisionId: "mac-revision",
        updatedAt: "2030-01-02T00:00:00.000Z"
      }
    });
    await page.evaluate(() => {
      Object.defineProperty(document, "visibilityState", { configurable: true, value: "visible" });
      document.dispatchEvent(new Event("visibilitychange"));
      window.dispatchEvent(new Event("pageshow"));
    });

    await expect(page.locator(".milkdown-root ul")).toHaveAttribute("data-spread", "false");
    await page.waitForTimeout(2_500);
    await expect(readFakeRemoteNote(page, date)).resolves.toMatchObject({ markdown: compact });
    await expect(readLocalDraft(page, date)).resolves.toMatchObject({ markdown: compact });
  });
});

test("fake reconnect conflict can be resolved manually and synced", async ({ page }) => {
  await openDevelopmentStorage(page, "/", "disabled");
  await expect(page.locator(".sync-status[aria-label*=\"Local only\"], .sync-status[aria-label*=\"Synced\"]")).toBeVisible();

  await seedConflictState(page, {
    date,
    baseline,
    local,
    remote
  });
  await page.goto(`/#/date/${date}`);
  await expect(page.locator(".sync-status[aria-label*=\"Saved locally\"]")).toBeVisible();

  await clickButton(page, "Saved locally");
  await expect(page.getByText("Sync conflict")).toBeVisible();
  await expect(rawModeToggle(page)).toBeDisabled();

  await clickButton(page, "Resolve manually");
  await expect(page.locator(".plain-text-editor")).toHaveValue(/<<<<<<< Local Draft/);
  await expect(rawModeToggle(page)).toHaveAttribute("aria-pressed", "true");
  await expect(rawModeToggle(page)).toBeDisabled();

  await setTextareaValue(page, ".plain-text-editor", resolved);
  await expect(rawModeToggle(page)).toBeEnabled();
  await clickButton(page, "Conflict");
  const note = await waitForFakeRemoteNote(page, date, resolved);
  expect(note.markdown).toBe(resolved);
});

test("an enabled diagnostic buffer can be copied and freezes when a conflict opens", async ({ page }) => {
  await openDevelopmentStorage(page, "/", "enabled");
  await grantClipboardPermissions(page);
  await page.getByRole("button", { name: "Open menu" }).click();
  await page.getByRole("menuitem", { name: "Settings", exact: true }).click();
  const diagnostics = page.getByLabel("Collect sync diagnostics for conflict reports");
  await diagnostics.check();

  await seedConflictState(page, { date, baseline, local, remote });
  await page.goto(`/#/date/${date}`);
  await expect(page.locator(".sync-status[aria-label*='Saved locally']")).toBeVisible();
  await clickButton(page, "Saved locally");
  await expect(page.getByText("Sync conflict")).toBeVisible();

  const editor = page.getByRole("region", { name: "Daily note editor" }).getByRole("textbox");
  await expect(editor).toHaveAttribute("contenteditable", "false");
  const copy = page.getByRole("button", { name: "Copy sync diagnostics", exact: true });
  await expect(copy).toBeEnabled();
  await copy.click();
  const copied = await page.evaluate(async () => await navigator.clipboard.readText());
  expect(copied).toMatch(/^Jot \d+\.\d+\.\d+ sync diagnostics/);
  expect(copied).toContain("sync-conflict");
  expect(copied).not.toContain(local);
  expect(copied).not.toContain(remote);

  await copy.click();
  await expect.poll(async () => await page.evaluate(async () => await navigator.clipboard.readText())).toBe(copied);
});

test("a clean stale phone cache refreshes to the longer remote note before remaining synced", async ({ page }) => {
  const shortPhoneCopy = "# Day\n\nBreakfast\n";
  const longPcCopy = "# Day\n\nBreakfast\n\nWork completed on the PC\n\nEvening notes\n";
  await openDevelopmentStorage(page, "/", "disabled");
  await seedDailyNoteState(page, {
    draft: {
      date,
      markdown: shortPhoneCopy,
      baselineMarkdown: shortPhoneCopy,
      baselineRevisionId: "revision-7",
      dirty: false,
      updatedAt: "2030-01-01T00:00:00.000Z"
    },
    remote: {
      date,
      markdown: longPcCopy,
      revisionId: "revision-8",
      updatedAt: "2030-01-02T00:00:00.000Z"
    }
  });

  await page.goto(`/#/date/${date}`);
  await expectRawMarkdown(page, longPcCopy);
  await expect(page.locator(".sync-status[aria-label*=\"Synced\"]")).toBeVisible();
  await expect.poll(async () => {
    const draft = await readLocalDraft(page, date);
    const remote = await readFakeRemoteNote(page, date);
    return {
      draftMarkdown: draft?.markdown,
      baselineMarkdown: draft?.baselineMarkdown,
      remoteMarkdown: remote?.markdown,
      revisionMatches: draft?.baselineRevisionId === remote?.revisionId,
      dirty: draft?.dirty
    };
  }).toEqual({
    draftMarkdown: longPcCopy,
    baselineMarkdown: longPcCopy,
    remoteMarkdown: longPcCopy,
    revisionMatches: true,
    dirty: false
  });
});

test("a queued phone autosave cannot remove a Mac hyperlink after the clean refresh", async ({ page }) => {
  const phoneCache = "* Mac item\n";
  const macNote = "* [Mac item](https://example.com)\n";
  const phoneEdit = `${macNote}* Test\n`;
  await openDevelopmentStorage(page, "/", "disabled");
  await seedDailyNoteState(page, {
    draft: {
      date,
      markdown: phoneCache,
      baselineMarkdown: phoneCache,
      baselineRevisionId: "revision-7",
      dirty: false,
      updatedAt: "2030-01-01T00:00:00.000Z"
    },
    remote: {
      date,
      markdown: macNote,
      revisionId: "revision-8",
      updatedAt: "2030-01-02T00:00:00.000Z"
    }
  });

  await page.goto(`/#/date/${date}`);
  await expectRawMarkdown(page, macNote);
  // Let the autosave that was scheduled from the cached note become due.
  await page.waitForTimeout(2_500);
  await expect(readFakeRemoteNote(page, date)).resolves.toMatchObject({ markdown: macNote });

  await setRawMarkdown(page, phoneEdit);
  await expect(waitForFakeRemoteNote(page, date, phoneEdit)).resolves.toMatchObject({ markdown: phoneEdit });
  await expect(page.getByText("Sync conflict")).not.toBeVisible();
});

test("a dirty stale phone edit cannot replace a newer PC revision", async ({ page }) => {
  const staleBaseline = "# Day\n\nShared line\n";
  const phoneEdit = "# Day\n\nChanged on the phone\n";
  const pcEdit = "# Day\n\nChanged on the PC with substantially more detail\n";
  await openDevelopmentStorage(page, "/", "disabled");
  await seedDailyNoteState(page, {
    draft: {
      date,
      markdown: phoneEdit,
      baselineMarkdown: staleBaseline,
      baselineRevisionId: "revision-7",
      dirty: true,
      updatedAt: "2030-01-02T08:00:00.000Z"
    },
    remote: {
      date,
      markdown: pcEdit,
      revisionId: "revision-8",
      updatedAt: "2030-01-02T16:00:00.000Z"
    }
  });

  await page.goto(`/#/date/${date}`);
  await expectRawMarkdown(page, phoneEdit);
  await expect(page.getByText("Sync conflict")).toBeVisible();
  await expect(readFakeRemoteNote(page, date)).resolves.toMatchObject({
    markdown: pcEdit,
    revisionId: "revision-8"
  });

  await clickButton(page, "Keep Google Drive");
  await expectRawMarkdown(page, pcEdit);
  await expect(page.locator(".sync-status[aria-label*=\"Synced\"]")).toBeVisible();
  await expect.poll(async () => {
    const draft = await readLocalDraft(page, date);
    const remote = await readFakeRemoteNote(page, date);
    return {
      markdown: draft?.markdown,
      baselineMarkdown: draft?.baselineMarkdown,
      revisionMatches: draft?.baselineRevisionId === remote?.revisionId,
      dirty: draft?.dirty
    };
  }).toEqual({ markdown: pcEdit, baselineMarkdown: pcEdit, revisionMatches: true, dirty: false });
});
