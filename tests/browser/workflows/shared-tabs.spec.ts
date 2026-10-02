import { expect, test, chromium } from "@playwright/test";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { expectRawMarkdown, openDevelopmentStorage, setRawMarkdown } from "../helpers/editor";
import { readLocalDraft, waitForFakeRemoteNote } from "../helpers/idb";

const date = "2030-04-05";

test("a second tab cannot edit the same date until the owner closes", async ({ page, context }) => {
  await openDevelopmentStorage(page, `/#/date/${date}`, "disabled");
  await page.evaluate(() => localStorage.setItem("jot.fakeRemoteUnavailable", "true"));
  await setRawMarkdown(page, "first tab edit");
  await expect.poll(async () => await readLocalDraft(page, date)).toMatchObject({ markdown: "first tab edit", dirty: true });

  const second = await context.newPage();
  await second.goto(`/#/date/${date}`);
  await expect(second.locator(".milkdown-root")).toContainText("first tab edit");
  await expect(second.locator(".milkdown-root [contenteditable='false']")).toBeVisible();
  await expect(second.getByText("Open in another tab")).toBeVisible();
  await expect(second.locator(".sync-status[aria-label*='Saved locally']")).toBeVisible();

  await setRawMarkdown(page, "first tab updated");
  await expect.poll(async () => await readLocalDraft(page, date)).toMatchObject({ markdown: "first tab updated", dirty: true });
  await second.reload();
  await expect(second.locator(".milkdown-root")).toContainText("first tab updated");
  await expect(second.locator(".milkdown-root [contenteditable='false']")).toBeVisible();
  await expect(second.locator(".sync-status[aria-label*='Saved locally']")).toBeVisible();

  await page.close();
  await expect(second.locator(".milkdown-root [contenteditable='true']")).toBeVisible();
  await expectRawMarkdown(second, "first tab updated");
  await setRawMarkdown(second, "second tab edit");
  await expect.poll(async () => (await readLocalDraft(second, date))?.markdown).toBe("second tab edit");
});

test("signing out in one tab cancels pending work and signs out the other", async ({ page, context }) => {
  await openDevelopmentStorage(page, `/#/date/${date}`, "disabled");
  const second = await context.newPage();
  await second.goto(`/#/date/${date}`);
  await expect(second.getByRole("region", { name: "Daily note editor" })).toBeVisible();

  await page.evaluate(() => localStorage.setItem("jot.fakeRemoteUnavailable", "true"));
  await setRawMarkdown(page, "pending work in first tab");
  await expect.poll(async () => await readLocalDraft(page, date)).toMatchObject({
    markdown: "pending work in first tab", dirty: true
  });

  second.on("dialog", (dialog) => void dialog.accept());
  await second.getByRole("button", { name: "Open menu" }).click();
  await second.getByRole("menuitem", { name: "Sign out" }).click();
  await expect(page.getByRole("button", { name: "Use development storage" })).toBeVisible();
  await expect(second.getByRole("button", { name: "Use development storage" })).toBeVisible();
  await expect(readLocalDraft(second, date)).resolves.toBeNull();
  await page.reload();
  await expect(page.getByRole("button", { name: "Use development storage" })).toBeVisible();
  await expect(readLocalDraft(page, date)).resolves.toBeNull();
});

test("sign-out clearing waits for a queued draft write", async ({ page, context }) => {
  await openDevelopmentStorage(page, `/#/date/${date}`, "disabled");
  await page.evaluate(() => localStorage.setItem("jot.fakeRemoteUnavailable", "true"));
  await setRawMarkdown(page, "first committed edit");
  await expect.poll(async () => (await readLocalDraft(page, date))?.markdown).toBe("first committed edit");

  const second = await context.newPage();
  await second.goto(`/#/date/${date}`);
  await page.evaluate(() => {
    void navigator.locks.request("jot:local-draft-mutation", async () => {
      await new Promise<void>((resolve) => {
        (window as Window & { releaseDraftMutationLock?: () => void }).releaseDraftMutationLock = resolve;
      });
    });
  });
  await expect.poll(async () => await page.evaluate(() =>
    typeof (window as Window & { releaseDraftMutationLock?: () => void }).releaseDraftMutationLock
  )).toBe("function");

  await setRawMarkdown(page, "second queued edit");
  await expect.poll(async () => await page.evaluate(async () =>
    (await navigator.locks.query()).pending.some((lock) => lock.name === "jot:local-draft-mutation")
  )).toBe(true);
  second.on("dialog", (dialog) => void dialog.accept());
  await second.getByRole("button", { name: "Open menu" }).click();
  await second.getByRole("menuitem", { name: "Sign out" }).click();
  await page.evaluate(() => {
    (window as Window & { releaseDraftMutationLock?: () => void }).releaseDraftMutationLock?.();
  });

  await expect(second.getByRole("button", { name: "Use development storage" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Use development storage" })).toBeVisible();
  await expect.poll(async () => await readLocalDraft(second, date)).toBeNull();
});

test("a date A ownership grant cannot replace date B after navigation", async ({ page, context }) => {
  const otherDate = "2030-04-06";
  await openDevelopmentStorage(page, `/#/date/${date}`, "disabled");
  await setRawMarkdown(page, "date A owner");
  await expect.poll(async () => (await readLocalDraft(page, date))?.markdown).toBe("date A owner");

  const second = await context.newPage();
  await second.goto(`/#/date/${date}`);
  await expect(second.getByText("Open in another tab")).toBeVisible();
  await second.getByRole("button", { name: "Next day" }).click();
  await expect(second.getByRole("textbox", { name: "Selected date" })).toHaveValue(otherDate);
  await page.close();
  await setRawMarkdown(second, "date B owner");
  await expect.poll(async () => (await readLocalDraft(second, otherDate))?.markdown).toBe("date B owner");
  await expectRawMarkdown(second, "date B owner");
});

test("a new date A owner syncs its edit after the first tab navigates to B", async ({ page, context }) => {
  await openDevelopmentStorage(page, `/#/date/${date}`, "disabled");
  await setRawMarkdown(page, "first tab edit before leaving A");
  await page.getByRole("button", { name: "Next day" }).click();
  await expect(page.getByRole("textbox", { name: "Selected date" })).toHaveValue("2030-04-06");
  await expect.poll(async () => (await readLocalDraft(page, date))?.markdown).toBe("first tab edit before leaving A");

  const second = await context.newPage();
  await second.goto(`/#/date/${date}`);
  await expect(second.locator(".milkdown-root [contenteditable='true']")).toBeVisible();
  await setRawMarkdown(second, "second tab edit after taking A");
  await expect.poll(async () => (await readLocalDraft(second, date))?.markdown).toBe("second tab edit after taking A");
  await waitForFakeRemoteNote(second, date, "second tab edit after taking A");
  await expect(page.getByRole("textbox", { name: "Selected date" })).toHaveValue("2030-04-06");
});

test("a departed date syncs without reopening it in a single tab", async ({ page }) => {
  await openDevelopmentStorage(page, `/#/date/${date}`, "disabled");
  await setRawMarkdown(page, "single tab edit before leaving A");
  await page.getByRole("button", { name: "Next day" }).click();
  await expect(page.getByRole("textbox", { name: "Selected date" })).toHaveValue("2030-04-06");
  await expect.poll(async () => (await readLocalDraft(page, date))?.markdown).toBe("single tab edit before leaving A");
  await waitForFakeRemoteNote(page, date, "single tab edit before leaving A");
  await expect(page.getByRole("textbox", { name: "Selected date" })).toHaveValue("2030-04-06");
});

test("a crashed renderer releases editing ownership without losing a committed draft", async ({ baseURL }) => {
  test.setTimeout(60_000);
  const profile = await mkdtemp(join(tmpdir(), "jot-shared-tabs-"));
  let first = await chromium.launchPersistentContext(profile, { channel: "chrome" });
  try {
    const page = first.pages()[0] ?? await first.newPage();
    await openDevelopmentStorage(page, `${baseURL}#/date/${date}`, "disabled");
    await setRawMarkdown(page, "committed before crash");
    await expect.poll(async () => (await readLocalDraft(page, date))?.markdown).toBe("committed before crash");

    const cdp = await first.newCDPSession(page);
    const crashed = page.waitForEvent("crash");
    void cdp.send("Page.crash").catch(() => {});
    await crashed;
    await first.close().catch(() => {});

    first = await chromium.launchPersistentContext(profile, { channel: "chrome" });
    const reopened = first.pages()[0] ?? await first.newPage();
    await reopened.goto(`${baseURL}#/date/${date}`);
    await expect(reopened.locator(".milkdown-root [contenteditable='true']")).toBeVisible();
    await expectRawMarkdown(reopened, "committed before crash");
  } finally {
    await first.close().catch(() => {});
    await rm(profile, { recursive: true, force: true });
  }
});
