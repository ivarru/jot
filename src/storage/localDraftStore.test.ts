import "fake-indexeddb/auto";
import { createDraft, IndexedDbLocalDraftStore, isExistingDailyNoteDraft } from "./localDraftStore";

describe("Local Draft note existence", () => {
  it("does not count an unedited local-only empty draft as an existing note", () => {
    expect(isExistingDailyNoteDraft(createDraft("2030-02-01", "", "", null, false))).toBe(false);
  });

  it("does not count empty or whitespace-only drafts as existing notes, regardless of sync history", () => {
    expect(isExistingDailyNoteDraft(createDraft("2030-02-01", " \n\t", "", null, true))).toBe(false);
    expect(isExistingDailyNoteDraft(createDraft("2030-02-01", "", "remote", "revision-1", true))).toBe(false);
  });

  it("counts drafts with visible content as existing notes", () => {
    expect(isExistingDailyNoteDraft(createDraft("2030-02-01", "local", "", null, false))).toBe(true);
    expect(isExistingDailyNoteDraft(createDraft("2030-02-01", "\n local \n", "remote", "revision-1", true))).toBe(true);
  });
});

describe("IndexedDbLocalDraftStore conditional writes", () => {
  it("retains compare-and-swap behavior when the expected draft is stale", async () => {
    const store = new IndexedDbLocalDraftStore();
    const date = "2030-02-10";
    const original = createDraft(date, "original", "", null, true);
    const newer = createDraft(date, "newer", "", null, true);
    await store.save(original);
    await store.save(newer);

    await expect(store.saveIfUnchanged(
      date,
      original,
      createDraft(date, "stale overwrite", "", null, true)
    )).resolves.toBe(false);
    await expect(store.load(date)).resolves.toEqual(newer);
  });
});
