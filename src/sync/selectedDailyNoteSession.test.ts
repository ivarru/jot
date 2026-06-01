import { createDraft } from "~/storage/localDraftStore";
import type { IsoDate } from "~/domain/dates";
import type { DateBoundEditorState, VisibleDailyNoteSnapshot } from "~/editor/dateBoundEditor";
import type {
  LocalDraft,
  LocalDraftStore,
  RemoteDailyNote,
  RemoteStorageProvider,
  SaveDailyNoteInput,
  SaveDailyNoteResult
} from "~/storage/types";
import {
  captureSaveRetrySnapshot,
  saveSelectedDailyNoteSnapshot,
  saveVisibleDailyNoteSnapshot
} from "./selectedDailyNoteSession";

describe("selected Daily Note session async save seam", () => {
  it("persists a Local Draft without remote sync when auth reconnect is required", async () => {
    const drafts = new MemoryDraftStore();
    const remote = new RecordingRemoteStorageProvider();
    const state = editorState({
      selectedDate: "2030-02-02",
      loadedDate: "2030-02-02",
      markdown: "visible"
    });

    const result = await saveSelectedDailyNoteSnapshot({
      snapshot: { date: "2030-02-02", markdown: "visible" },
      authReconnectRequired: true,
      drafts,
      remote,
      getState: () => state
    });

    expect(result).toEqual({
      type: "auth-required",
      applyStatus: "auth-required"
    });
    expect(remote.savedInputs).toEqual([]);
    await expect(drafts.load("2030-02-02")).resolves.toMatchObject({
      markdown: "visible",
      dirty: true
    });
  });

  it("does not apply a sync conflict after the Selected Date changes", async () => {
    const drafts = new MemoryDraftStore();
    const remote = new ConflictRemoteStorageProvider();
    let currentState = editorState({
      selectedDate: "2030-02-02",
      loadedDate: "2030-02-02",
      markdown: "before\nlocal\nsame\nafter\n"
    });
    await drafts.save(createDraft(
      "2030-02-02",
      "before\nlocal\nsame\nafter\n",
      "before\nold\nsame\nafter\n",
      "baseline-revision",
      true
    ));

    const result = await saveSelectedDailyNoteSnapshot({
      snapshot: { date: "2030-02-02", markdown: "before\nlocal\nsame\nafter\n" },
      authReconnectRequired: false,
      drafts,
      remote,
      getState: () => currentState,
      beforeApply: () => {
        currentState = editorState({
          selectedDate: "2030-02-03",
          loadedDate: "2030-02-03",
          markdown: "other day"
        });
      }
    });

    expect(result).toEqual({
      type: "saved",
      session: {
        markdown: "before\n<<<<<<< Local Draft\nlocal\n=======\nremote\n>>>>>>> Google Drive\nsame\nafter\n",
        status: "conflict"
      },
      transition: null
    });
  });

  it("saves the visible Daily Note snapshot when one is editable", async () => {
    const drafts = new MemoryDraftStore();
    const remote = new RecordingRemoteStorageProvider();

    const result = await saveVisibleDailyNoteSnapshot({
      authReconnectRequired: false,
      drafts,
      remote,
      getState: () =>
        editorState({
          selectedDate: "2030-02-02",
          loadedDate: "2030-02-02",
          markdown: "visible"
        })
    });

    expect(result?.type).toBe("saved");
    expect(remote.savedInputs).toEqual([
      {
        date: "2030-02-02",
        markdown: "visible",
        expectedRevisionId: null
      }
    ]);
  });

  it("captures a retry snapshot only for the matching visible Daily Note", () => {
    const state = editorState({
      selectedDate: "2030-02-02",
      loadedDate: "2030-02-02",
      markdown: "visible"
    });

    expect(captureSaveRetrySnapshot(state, { type: "save-current-note", date: "2030-02-02" })).toEqual({
      date: "2030-02-02",
      markdown: "visible"
    });
    expect(captureSaveRetrySnapshot(state, { type: "save-current-note", date: "2030-02-01" })).toBeNull();
    expect(captureSaveRetrySnapshot(state, { type: "save-settings" })).toBeNull();
  });
});

function editorState(overrides: Partial<DateBoundEditorState>): DateBoundEditorState {
  return {
    selectedDate: null,
    loadedDate: null,
    markdown: "",
    cleanMarkdown: null,
    editorChangeEpoch: 0,
    ...overrides
  };
}

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

  async saveIfUnchanged(date: IsoDate, expected: LocalDraft | null, draft: LocalDraft): Promise<boolean> {
    const current = await this.load(date);
    if (JSON.stringify(current) !== JSON.stringify(expected)) return false;
    await this.save(draft);
    return true;
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

  async loadSettings(): Promise<null> {
    return null;
  }

  async saveSettings<T>(settings: T): Promise<T> {
    return settings;
  }
}

class ConflictRemoteStorageProvider extends RecordingRemoteStorageProvider {
  override async saveDailyNote(input: SaveDailyNoteInput): Promise<SaveDailyNoteResult> {
    this.savedInputs.push(input);
    return {
      type: "conflict",
      remote: {
        date: input.date,
        markdown: "before\nremote\nsame\nafter\n",
        revisionId: "remote-revision",
        updatedAt: "2030-01-01T00:00:00.000Z"
      }
    };
  }
}
