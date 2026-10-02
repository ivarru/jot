import "fake-indexeddb/auto";
import { IndexedDbLocalDraftStore } from "./localDraftStore";
import { SessionGuardedDraftStore } from "./sessionGuardedDraftStore";
import type { LocalDraft } from "./types";

describe("SessionGuardedDraftStore", () => {
  it("rejects a stale tab's draft write after another tab signs out", async () => {
    const base = new IndexedDbLocalDraftStore();
    const first = new SessionGuardedDraftStore(base, localStorage);
    const second = new SessionGuardedDraftStore(base, localStorage);
    const draft = {
      date: "2030-04-05",
      markdown: "pending edit",
      baselineMarkdown: "",
      baselineRevisionId: null,
      dirty: true,
      updatedAt: "2030-04-05T00:00:00.000Z"
    } satisfies LocalDraft;
    await first.save(draft);
    await second.clearForSignOut();
    await expect(first.save(draft)).rejects.toMatchObject({ name: "CancelledDailyNoteSyncError" });
    await expect(base.load(draft.date)).resolves.toBeNull();

    second.adoptCurrentEpoch();
    await second.save(draft);
    await expect(base.load(draft.date)).resolves.toEqual(draft);
    await base.clearAll();
    localStorage.removeItem("jot.accountEpoch");
  });
});
