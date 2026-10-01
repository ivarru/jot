import { expect, test } from "@playwright/test";
import { expectRawMarkdown, openDevelopmentStorage, setRawMarkdown } from "../helpers/editor";
import { readFakeRemoteNote, readLocalDraft, seedDailyNoteState } from "../helpers/idb";

const date = "2030-03-07";
const local = "Offline change with exact spacing  \nsecond line\n";

test("a committed offline Local Draft survives page closure without a remote acknowledgement", async ({ page, context }) => {
  await openDevelopmentStorage(page, `/#/date/${date}`, "disabled");
  await page.evaluate(() => localStorage.setItem("jot.fakeRemoteUnavailable", "true"));
  await setRawMarkdown(page, local);
  await expect.poll(async () => await readLocalDraft(page, date)).toMatchObject({ markdown: local, dirty: true });
  await expect(readFakeRemoteNote(page, date)).resolves.toBeNull();
  await page.close();

  const reopened = await context.newPage();
  await reopened.goto(`/#/date/${date}`);
  await expectRawMarkdown(reopened, local);
  await expect(reopened.locator(".sync-status[aria-label*='Synced']")).toHaveCount(0);
  await expect.poll(async () => await readLocalDraft(reopened, date)).toMatchObject({ markdown: local, dirty: true });
  await expect(readFakeRemoteNote(reopened, date)).resolves.toBeNull();
});

test("reconnecting a restarted draft against a remote edit surfaces both alternatives", async ({ page, context }) => {
  const baseline = "before\nshared\nafter\n";
  const localEdit = "before\nlocal\nafter\n";
  const remoteEdit = "before\nremote\nafter\n";
  await openDevelopmentStorage(page, "/", "disabled");
  await seedDailyNoteState(page, {
    remote: { date, markdown: baseline, revisionId: "base", updatedAt: "2030-03-06T00:00:00.000Z" }
  });
  await page.goto(`/#/date/${date}`);
  await expectRawMarkdown(page, baseline);
  await page.evaluate(() => localStorage.setItem("jot.fakeRemoteUnavailable", "true"));
  await setRawMarkdown(page, localEdit);
  await expect.poll(async () => await readLocalDraft(page, date)).toMatchObject({ markdown: localEdit, dirty: true });
  await page.close();

  const reopened = await context.newPage();
  await reopened.goto(`/#/date/${date}`);
  await expectRawMarkdown(reopened, localEdit);
  await seedDailyNoteState(reopened, {
    remote: { date, markdown: remoteEdit, revisionId: "other", updatedAt: "2030-03-07T00:00:00.000Z" }
  });
  await reopened.evaluate(() => localStorage.removeItem("jot.fakeRemoteUnavailable"));
  await reopened.locator(".sync-status").click();
  await expect(reopened.getByText("Sync conflict")).toBeVisible();
  await expect(readLocalDraft(reopened, date)).resolves.toMatchObject({ markdown: localEdit, dirty: true });
  await expect(readFakeRemoteNote(reopened, date)).resolves.toMatchObject({ markdown: remoteEdit });
});
