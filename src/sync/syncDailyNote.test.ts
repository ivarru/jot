import { createDraft } from "~/storage/localDraftStore";
import type { IsoDate } from "~/domain/dates";
import type { JotSettings } from "~/domain/settings";
import type {
  LocalDraft,
  LocalDraftStore,
  RemoteDailyNote,
  RemoteStorageProvider,
  SaveDailyNoteInput,
  SaveDailyNoteResult
} from "~/storage/types";
import { saveAndSyncDailyNoteSnapshot, syncDirtyDailyNoteDrafts } from "./syncDailyNote";

class MemoryDraftStore implements LocalDraftStore {
  readonly drafts = new Map<IsoDate, LocalDraft>();

  async load(date: IsoDate): Promise<LocalDraft | null> {
    return this.drafts.get(date) ?? null;
  }

  async listDirty(): Promise<LocalDraft[]> {
    return [...this.drafts.values()].filter((draft) => draft.dirty);
  }

  async save(draft: LocalDraft): Promise<void> {
    this.drafts.set(draft.date, draft);
  }

  async remove(date: IsoDate): Promise<void> {
    this.drafts.delete(date);
  }

  async clearAll(): Promise<void> {
    this.drafts.clear();
  }
}

class RecordingRemoteStorageProvider implements RemoteStorageProvider {
  readonly savedInputs: SaveDailyNoteInput[] = [];

  async loadDailyNote(): Promise<RemoteDailyNote | null> {
    return null;
  }

  async saveDailyNote(input: SaveDailyNoteInput): Promise<SaveDailyNoteResult> {
    this.savedInputs.push(input);
    return {
      type: "saved",
      note: {
        date: input.date,
        markdown: input.markdown,
        revisionId: `revision-${this.savedInputs.length}`,
        updatedAt: "2030-01-01T00:00:00.000Z"
      }
    };
  }

  async loadSettings(): Promise<JotSettings | null> {
    return null;
  }

  async saveSettings(settings: JotSettings): Promise<JotSettings> {
    return settings;
  }
}

describe("daily note sync", () => {
  it("syncs the captured date and markdown snapshot", async () => {
    const drafts = new MemoryDraftStore();
    const remote = new RecordingRemoteStorageProvider();

    await saveAndSyncDailyNoteSnapshot("2030-02-02", "tomorrow", drafts, remote);

    expect(remote.savedInputs).toEqual([
      {
        date: "2030-02-02",
        markdown: "tomorrow",
        expectedRevisionId: null
      }
    ]);
    await expect(drafts.load("2030-02-02")).resolves.toMatchObject({
      markdown: "tomorrow",
      dirty: false
    });
  });

  it("does not create a remote file for an unchanged empty note snapshot", async () => {
    const drafts = new MemoryDraftStore();
    const remote = new RecordingRemoteStorageProvider();

    await saveAndSyncDailyNoteSnapshot("2030-02-02", "", drafts, remote);

    expect(remote.savedInputs).toEqual([]);
    await expect(drafts.load("2030-02-02")).resolves.toMatchObject({
      markdown: "",
      dirty: false
    });
  });

  it("syncs dirty drafts for dates that are not currently open", async () => {
    const drafts = new MemoryDraftStore();
    const remote = new RecordingRemoteStorageProvider();
    await drafts.save(createDraft("2030-02-01", "yesterday", "", null, true));
    await drafts.save(createDraft("2030-02-02", "today", "", null, true));
    await drafts.save(createDraft("2030-02-03", "tomorrow", "", null, true));

    await syncDirtyDailyNoteDrafts(drafts, remote, "2030-02-02");

    expect(remote.savedInputs.map((input) => [input.date, input.markdown])).toEqual([
      ["2030-02-01", "yesterday"],
      ["2030-02-03", "tomorrow"]
    ]);
    await expect(drafts.load("2030-02-02")).resolves.toMatchObject({
      markdown: "today",
      dirty: true
    });
  });
});
