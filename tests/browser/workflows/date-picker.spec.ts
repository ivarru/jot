import { expect, test } from "@playwright/test";
import { openDevelopmentStorage, switchToRawMode, wysiwygEditor } from "../helpers/editor";
import { seedLocalDraft } from "../helpers/idb";

test("the date picker marks only notes with visible content", async ({ page }) => {
  await openDevelopmentStorage(page, "/", "disabled");
  const dateInput = page.getByRole("textbox", { name: "Selected date", exact: true });
  const selectedDate = await dateInput.inputValue();
  const monthPrefix = selectedDate.slice(0, 8);
  const contentDate = `${monthPrefix}${selectedDate.endsWith("-01") ? "02" : "01"}`;
  const whitespaceDate = `${monthPrefix}${selectedDate.endsWith("-03") ? "04" : "03"}`;

  await seedLocalDraft(page, contentDate, "Visible note");
  await seedLocalDraft(page, whitespaceDate, " \n\t");
  await page.reload();
  await expect(wysiwygEditor(page)).toBeVisible();

  await dateInput.click();
  await expect(page.getByRole("dialog", { name: "Date picker" })).toBeVisible();
  await expect(page.getByRole("button", { name: `${contentDate}, has note`, exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: whitespaceDate, exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: `${whitespaceDate}, has note`, exact: true })).toHaveCount(0);
});

test("editor shortcuts move to the next and previous Daily Note", async ({ page }) => {
  await openDevelopmentStorage(page, "/#/date/2030-02-02", "enabled");
  const dateInput = page.getByRole("textbox", { name: "Selected date", exact: true });
  const useMac = process.platform === "darwin";

  await expect(page.getByRole("button", { name: "Previous day", exact: true })).toHaveAttribute(
    "data-tooltip",
    `Previous day (${useMac ? "Cmd+Option+P" : "Ctrl+Alt+P"})`
  );
  await expect(page.getByRole("button", { name: "Next day", exact: true })).toHaveAttribute(
    "data-tooltip",
    `Next day (${useMac ? "Cmd+Option+N" : "Ctrl+Alt+N"})`
  );

  await wysiwygEditor(page).focus();
  await page.keyboard.press(useMac ? "Meta+Alt+N" : "Control+Alt+N");
  await expect(dateInput).toHaveValue("2030-02-03");

  await switchToRawMode(page);
  await page.getByLabel("Markdown text editor").focus();
  await page.keyboard.press(useMac ? "Meta+Alt+P" : "Control+Alt+P");
  await expect(dateInput).toHaveValue("2030-02-02");
});

test("reopening the date picker returns to the selected month", async ({ page }) => {
  await openDevelopmentStorage(page, "/#/date/2030-02-02", "disabled");
  const dateInput = page.getByRole("textbox", { name: "Selected date", exact: true });

  await dateInput.click();
  await page.getByRole("button", { name: "Next month", exact: true }).click();
  await expect(page.getByRole("button", { name: "2030-02-02", exact: true })).toHaveCount(0);

  await page.keyboard.press("Escape");
  await expect(page.getByRole("dialog", { name: "Date picker" })).toBeHidden();
  await dateInput.click();

  await expect(page.getByRole("button", { name: "2030-02-02", exact: true })).toBeVisible();
});
