import { expect, test } from "@playwright/test";
import { openDevelopmentStorage } from "../helpers/editor";
import { seedLocalDraft } from "../helpers/idb";

test("the date picker marks only notes with visible content", async ({ page }) => {
  await openDevelopmentStorage(page);
  const dateInput = page.getByRole("textbox", { name: "Selected date", exact: true });
  const selectedDate = await dateInput.inputValue();
  const monthPrefix = selectedDate.slice(0, 8);
  const contentDate = `${monthPrefix}${selectedDate.endsWith("-01") ? "02" : "01"}`;
  const whitespaceDate = `${monthPrefix}${selectedDate.endsWith("-03") ? "04" : "03"}`;

  await seedLocalDraft(page, contentDate, "Visible note");
  await seedLocalDraft(page, whitespaceDate, " \n\t");
  await page.reload();

  await dateInput.click();
  await expect(page.getByRole("dialog", { name: "Date picker" })).toBeVisible();
  await expect(page.getByRole("button", { name: `${contentDate}, has note`, exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: whitespaceDate, exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: `${whitespaceDate}, has note`, exact: true })).toHaveCount(0);
});
