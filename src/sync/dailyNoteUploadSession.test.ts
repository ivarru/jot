import { createPendingDailyNoteUpload } from "~/domain/dailyNoteUpload";
import type { IsoDate } from "~/domain/dates";
import type { DateBoundEditorState } from "~/editor/dateBoundEditor";
import { createDraft } from "~/storage/localDraftStore";
import type {
  LocalDraft,
  LocalDraftStore,
  RemoteDailyNote,
  RemoteStorageProvider,
  SaveDailyNoteInput,
  SaveDailyNoteResult
} from "~/storage/types";
import {
  buildDailyNoteUploadPlan,
  saveDailyNoteUploadPlan
} from "./dailyNoteUploadSession";

describe("daily note upload session", () => {
  it("uses the visible selected Daily Note as existing upload content", async () => {
    const drafts = new MemoryDraftStore();
    const remote = new RecordingRemoteStorageProvider();
    remote.note = {
      date: "2030-02-02",
      markdown: "remote",
      revisionId: "revision-1",
      updatedAt: "2030-01-01T00:00:00.000Z"
    };

    await expect(buildDailyNoteUploadPlan({
      candidates: [{
        date: "2030-02-02",
        filename: "2030-02-02.md",
        uploadedMarkdown: "uploaded"
      }],
      drafts,
      remote,
      getState: () =>
        editorState({
          selectedDate: "2030-02-02",
          loadedDate: "2030-02-02",
          markdown: "visible"
        })
    })).resolves.toEqual([{
      date: "2030-02-02",
      filename: "2030-02-02.md",
      uploadedMarkdown: "uploaded",
      existingMarkdown: "visible"
    }]);
  });

  it("prefers dirty local draft content over remote content while planning uploads", async () => {
    const drafts = new MemoryDraftStore();
    const remote = new RecordingRemoteStorageProvider();
    await drafts.save(createDraft("2030-02-02", "dirty local", "baseline", "revision-1", true));
    remote.note = {
      date: "2030-02-02",
      markdown: "remote",
      revisionId: "revision-2",
      updatedAt: "2030-01-01T00:00:00.000Z"
    };

    await expect(buildDailyNoteUploadPlan({
      candidates: [{
        date: "2030-02-02",
        filename: "2030-02-02.md",
        uploadedMarkdown: "uploaded"
      }],
      drafts,
      remote,
      getState: () => editorState({ selectedDate: "2030-02-03", loadedDate: "2030-02-03" })
    })).resolves.toEqual([{
      date: "2030-02-02",
      filename: "2030-02-02.md",
      uploadedMarkdown: "uploaded",
      existingMarkdown: "dirty local"
    }]);
  });

  it("saves uploaded notes using the selected conflict resolution", async () => {
    const drafts = new MemoryDraftStore();
    const remote = new RecordingRemoteStorageProvider();
    const pending = createPendingDailyNoteUpload([{
      date: "2030-02-02",
      filename: "2030-02-02.md",
      uploadedMarkdown: "uploaded",
      existingMarkdown: "existing"
    }]);

    const result = await saveDailyNoteUploadPlan({
      pending,
      resolution: "append",
      authReconnectRequired: () => false,
      drafts,
      remote,
      getState: () =>
        editorState({
          selectedDate: "2030-02-02",
          loadedDate: "2030-02-02",
          markdown: "existing"
        })
    });

    expect(result).toMatchObject({
      type: "uploaded",
      count: 1,
      saveResults: [{
        type: "saved",
        session: {
          markdown: "existing\n\nuploaded",
          status: "synced"
        }
      }]
    });
    expect(remote.savedInputs).toEqual([{
      date: "2030-02-02",
      markdown: "existing\n\nuploaded",
      expectedRevisionId: null
    }]);
  });

  it("re-reads visible content when resolving a pending upload conflict", async () => {
    const drafts = new MemoryDraftStore();
    const remote = new RecordingRemoteStorageProvider();
    const pending = createPendingDailyNoteUpload([{
      date: "2030-02-02",
      filename: "2030-02-02.md",
      uploadedMarkdown: "uploaded",
      existingMarkdown: "visible when conflict opened"
    }]);

    const result = await saveDailyNoteUploadPlan({
      pending,
      resolution: "append",
      authReconnectRequired: () => false,
      drafts,
      remote,
      getState: () =>
        editorState({
          selectedDate: "2030-02-02",
          loadedDate: "2030-02-02",
          markdown: "edited while conflict open"
        })
    });

    expect(result.type).toBe("uploaded");
    expect(remote.savedInputs).toEqual([{
      date: "2030-02-02",
      markdown: "edited while conflict open\n\nuploaded",
      expectedRevisionId: null
    }]);
  });

  it("returns a structured failure when an uploaded note cannot be saved", async () => {
    const drafts = new MemoryDraftStore();
    const remote = new FailingRemoteStorageProvider();
    const pending = createPendingDailyNoteUpload([{
      date: "2030-02-02",
      filename: "2030-02-02.md",
      uploadedMarkdown: "uploaded",
      existingMarkdown: null
    }]);

    const result = await saveDailyNoteUploadPlan({
      pending,
      resolution: "replace",
      authReconnectRequired: () => false,
      drafts,
      remote,
      getState: () =>
        editorState({
          selectedDate: "2030-02-02",
          loadedDate: "2030-02-02",
          markdown: ""
        })
    });

    expect(result).toMatchObject({
      type: "failed",
      saveResults: [{
        type: "failed",
        applyToVisibleDailyNote: true
      }]
    });
    expect(result.type === "failed" ? result.error : null).toBeInstanceOf(Error);
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
  note: RemoteDailyNote | null = null;

  async loadDailyNote(date: IsoDate): Promise<RemoteDailyNote | null> {
    return this.note?.date === date ? this.note : null;
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

class FailingRemoteStorageProvider extends RecordingRemoteStorageProvider {
  override async saveDailyNote(): Promise<SaveDailyNoteResult> {
    throw new Error("remote unavailable");
  }
}
