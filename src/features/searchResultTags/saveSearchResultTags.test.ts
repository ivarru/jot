import { saveSearchResultTags } from "./saveSearchResultTags";
import { createDraft } from "~/storage/localDraftStore";
import type { IsoDate } from "~/domain/dates";
import type { LocalDraft, LocalDraftStore, RemoteStorageProvider, SaveDailyNoteInput } from "~/storage/types";

const A: IsoDate = "2030-02-02", B: IsoDate = "2030-02-04";
function fixture() {
  const notes = new Map<IsoDate, LocalDraft>();
  let remoteText = "Budget";
  const drafts: LocalDraftStore = {
    load: vi.fn(async (date) => notes.get(date) ?? null),
    save: vi.fn(async (draft) => { notes.set(draft.date, draft); }),
    saveIfUnchanged: vi.fn(async (date, expected, draft) => {
      if ((notes.get(date) ?? null) !== expected) return false;
      notes.set(date, draft); return true;
    }),
    listDirty: async () => [...notes.values()].filter((draft) => draft.dirty),
    remove: async () => {}, clearAll: async () => {}
  };
  const remote = {
    loadDailyNote: vi.fn(async (date: IsoDate) => ({ date, markdown: remoteText, revisionId: "r1", updatedAt: "2030-01-01T00:00:00Z" })),
    saveDailyNote: vi.fn(async (input: SaveDailyNoteInput) => {
      remoteText = input.markdown;
      return { type: "saved" as const, note: { date: input.date, markdown: input.markdown, revisionId: "r2", updatedAt: "2030-01-02T00:00:00Z" } };
    }), loadSettings: async () => null, saveSettings: async (settings) => settings
  } satisfies RemoteStorageProvider;
  return { notes, drafts, remote };
}
it("saves the captured date with a remote baseline and syncs normally", async () => {
  const { notes, drafts, remote } = fixture();
  await saveSearchResultTags(A, "Budget", "Budget tagged", drafts, remote, () => true);
  expect(remote.saveDailyNote).toHaveBeenCalledWith({ date: A, markdown: "Budget tagged", expectedRevisionId: "r1" });
  expect(notes.get(A)).toMatchObject({ markdown: "Budget tagged", dirty: false });
});
it("rejects a newer local draft without overwriting it", async () => {
  const { notes, drafts, remote } = fixture();
  const newer = createDraft(A, "New edit", "Budget", "r1", true); notes.set(A, newer);
  await expect(saveSearchResultTags(A, "Budget", "Budget tagged", drafts, remote, () => true)).rejects.toThrow("changed");
  expect(notes.get(A)).toBe(newer); expect(remote.saveDailyNote).not.toHaveBeenCalled();
});
it("rejects changed remote content and a concurrent local write", async () => {
  const { drafts, remote } = fixture();
  await expect(saveSearchResultTags(A, "stale", "tagged", drafts, remote, () => true)).rejects.toThrow("changed");
  vi.mocked(drafts.saveIfUnchanged).mockResolvedValue(false);
  await expect(saveSearchResultTags(A, "Budget", "tagged", drafts, remote, () => true)).rejects.toThrow("local draft changed");
  expect(remote.saveDailyNote).not.toHaveBeenCalled();
});
it("keeps date A bound while its load is pending and date B becomes selected", async () => {
  const { notes, drafts, remote } = fixture();
  let selected: IsoDate = A;
  let resume!: () => void;
  const pending = new Promise<void>((resolve) => { resume = resolve; });
  const load = remote.loadDailyNote.getMockImplementation()!;
  remote.loadDailyNote.mockImplementation(async (date) => { await pending; return load(date); });
  const saving = saveSearchResultTags(A, "Budget", "Budget tagged", drafts, remote, () => true);
  selected = B; notes.set(selected, createDraft(B, "Keep B", "Keep B", "b", false));
  resume(); await saving;
  expect(notes.get(A)?.markdown).toBe("Budget tagged"); expect(notes.get(B)?.markdown).toBe("Keep B");
  expect(remote.saveDailyNote.mock.calls.every(([input]) => input.date === A)).toBe(true);
});
it("cancels before persistence when lifecycle changes during a pending load", async () => {
  const { drafts, remote } = fixture(); let active = true;
  const load = remote.loadDailyNote.getMockImplementation()!;
  remote.loadDailyNote.mockImplementation(async (date) => { active = false; return load(date); });
  await expect(saveSearchResultTags(A, "Budget", "tagged", drafts, remote, () => active)).rejects.toThrow("connection changed");
  expect(drafts.saveIfUnchanged).not.toHaveBeenCalled(); expect(remote.saveDailyNote).not.toHaveBeenCalled();
});

it("cancels a pending date A load when navigation selects A for editing", async () => {
  const { notes, drafts, remote } = fixture();
  let selected: IsoDate = B;
  let resume!: () => void;
  const pending = new Promise<void>((resolve) => { resume = resolve; });
  const load = remote.loadDailyNote.getMockImplementation()!;
  remote.loadDailyNote.mockImplementation(async (date) => { await pending; return load(date); });
  const saving = saveSearchResultTags(A, "Budget", "tagged", drafts, remote, () => selected !== A);
  selected = A;
  const newer = createDraft(A, "New editor content", "Budget", "r1", true); notes.set(A, newer);
  resume();
  await expect(saving).rejects.toThrow("changed");
  expect(notes.get(A)).toBe(newer); expect(remote.saveDailyNote).not.toHaveBeenCalled();
});

it("retains the tagged draft if the remote save fails", async () => {
  const { notes, drafts, remote } = fixture();
  remote.saveDailyNote.mockRejectedValue(new Error("offline"));
  await expect(saveSearchResultTags(A, "Budget", "tagged", drafts, remote, () => true)).rejects.toThrow("offline");
  expect(notes.get(A)).toMatchObject({ markdown: "tagged", baselineMarkdown: "Budget", dirty: true });
});
