import { expect, test } from "@playwright/test";
import { clickButton, openDevelopmentStorage, rawModeToggle, setTextareaValue } from "./helpers/editor";
import { seedConflictState, waitForFakeRemoteNote } from "./helpers/idb";

const date = "2030-02-02";
const baseline = "before\nold\nsame\nafter\n";
const local = "before\nlocal\nsame\nafter\n";
const remote = "before\nremote\nsame\nafter\n";
const resolved = "resolved note\n";

test("fake reconnect conflict can be resolved manually and synced", async ({ page }) => {
  await openDevelopmentStorage(page);
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
