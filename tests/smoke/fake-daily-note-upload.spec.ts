import { expect, test } from "@playwright/test";
import { writeFile } from "node:fs/promises";
import { clickButton, openDevelopmentStorage } from "./helpers/editor";
import { waitForFakeRemoteNote } from "./helpers/idb";

const uploadDate = "2030-02-02";
const uploadMarkdown = "Uploaded daily note smoke";

test("fake storage uploads a Daily Note Markdown file", async ({ page }, testInfo) => {
  const notePath = testInfo.outputPath(`${uploadDate}.md`);
  await writeFile(notePath, uploadMarkdown);

  await openDevelopmentStorage(page);
  await page.locator("input[accept=\".md,text/markdown\"]").setInputFiles(notePath);

  const note = await waitForFakeRemoteNote(page, uploadDate);
  expect(note.markdown).toBe(uploadMarkdown);

  await expect(page.getByText("Uploaded 1 daily note.")).toBeVisible();
  await clickButton(page, "Dismiss daily note upload message");
  await expect(page.getByText("Uploaded 1 daily note.")).toBeHidden();
});
