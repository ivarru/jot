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
import {
  cleanDailyNoteRefreshToSession,
  commitVisibleCleanDailyNoteRefresh,
  loadCleanDailyNoteRefresh,
  loadDailyNoteSession,
  rebaseAndSyncDailyNoteSnapshot,
  saveAndSyncDailyNoteSnapshot,
  syncDirtyDailyNoteDrafts
} from "./syncDailyNote";

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
  loadError: Error | null = null;
  beforeSaveResult: (() => Promise<void>) | null = null;

  async loadDailyNote(): Promise<RemoteDailyNote | null> {
    if (this.loadError !== null) throw this.loadError;
    return null;
  }

  async saveDailyNote(input: SaveDailyNoteInput): Promise<SaveDailyNoteResult> {
    this.savedInputs.push(input);
    await this.beforeSaveResult?.();
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

class SharedRemoteStorageProvider implements RemoteStorageProvider {
  readonly savedInputs: SaveDailyNoteInput[] = [];
  private note: RemoteDailyNote | null = null;
  private revision = 0;

  async loadDailyNote(date: IsoDate): Promise<RemoteDailyNote | null> {
    return this.note?.date === date ? this.note : null;
  }

  async saveDailyNote(input: SaveDailyNoteInput): Promise<SaveDailyNoteResult> {
    this.savedInputs.push(input);
    if (this.note !== null && input.expectedRevisionId !== this.note.revisionId) {
      return {
        type: "conflict",
        remote: this.note
      };
    }

    this.revision += 1;
    this.note = {
      date: input.date,
      markdown: input.markdown,
      revisionId: `revision-${this.revision}`,
      updatedAt: "2030-01-01T00:00:00.000Z"
    };
    return {
      type: "saved",
      note: this.note
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
  it("marks an empty missing remote note synced after checking Drive", async () => {
    const drafts = new MemoryDraftStore();
    const remote = new RecordingRemoteStorageProvider();

    await expect(loadDailyNoteSession("2030-02-02", drafts, remote)).resolves.toEqual({
      markdown: "",
      status: "synced"
    });
    await expect(drafts.load("2030-02-02")).resolves.toMatchObject({
      markdown: "",
      baselineMarkdown: "",
      baselineRevisionId: null,
      dirty: false
    });
  });

  it("loads an existing local draft without requiring remote access", async () => {
    const drafts = new MemoryDraftStore();
    const remote = new RecordingRemoteStorageProvider();
    remote.loadError = new Error("Reconnect to Google to continue syncing.");
    await drafts.save(createDraft("2030-02-02", "local draft", "", null, true));

    await expect(loadDailyNoteSession("2030-02-02", drafts, remote)).resolves.toEqual({
      markdown: "local draft",
      status: "saved-locally"
    });
  });

  it("refreshes an empty clean draft when another client has created the remote note", async () => {
    const remote = new SharedRemoteStorageProvider();
    const clientA = new MemoryDraftStore();
    const clientB = new MemoryDraftStore();

    await expect(loadDailyNoteSession("2030-02-02", clientA, remote)).resolves.toEqual({
      markdown: "",
      status: "synced"
    });
    await expect(loadDailyNoteSession("2030-02-02", clientB, remote)).resolves.toEqual({
      markdown: "",
      status: "synced"
    });

    await saveAndSyncDailyNoteSnapshot("2030-02-02", "A writes first", clientA, remote);

    await expect(loadDailyNoteSession("2030-02-02", clientB, remote)).resolves.toEqual({
      markdown: "A writes first",
      status: "synced"
    });
    await expect(clientB.load("2030-02-02")).resolves.toMatchObject({
      markdown: "A writes first",
      baselineMarkdown: "A writes first",
      baselineRevisionId: "revision-1",
      dirty: false
    });
  });

  it("refreshes a clean stale baseline when the remote revision has changed", async () => {
    const remote = new SharedRemoteStorageProvider();
    const clientA = new MemoryDraftStore();
    const clientB = new MemoryDraftStore();

    await saveAndSyncDailyNoteSnapshot("2030-02-02", "first", clientA, remote);
    await expect(loadDailyNoteSession("2030-02-02", clientB, remote)).resolves.toEqual({
      markdown: "first",
      status: "synced"
    });
    await saveAndSyncDailyNoteSnapshot("2030-02-02", "second", clientA, remote);

    await expect(loadDailyNoteSession("2030-02-02", clientB, remote)).resolves.toEqual({
      markdown: "second",
      status: "synced"
    });
    await expect(clientB.load("2030-02-02")).resolves.toMatchObject({
      markdown: "second",
      baselineMarkdown: "second",
      baselineRevisionId: "revision-2",
      dirty: false
    });
  });

  it("keeps a dirty local draft when the remote revision has changed", async () => {
    const remote = new SharedRemoteStorageProvider();
    const clientA = new MemoryDraftStore();
    const clientB = new MemoryDraftStore();

    await saveAndSyncDailyNoteSnapshot("2030-02-02", "first", clientA, remote);
    await loadDailyNoteSession("2030-02-02", clientB, remote);
    await clientB.save(createDraft("2030-02-02", "local dirty", "first", "revision-1", true));
    await saveAndSyncDailyNoteSnapshot("2030-02-02", "second", clientA, remote);

    await expect(loadDailyNoteSession("2030-02-02", clientB, remote)).resolves.toEqual({
      markdown: "local dirty",
      status: "saved-locally"
    });
    await expect(clientB.load("2030-02-02")).resolves.toMatchObject({
      markdown: "local dirty",
      baselineMarkdown: "first",
      baselineRevisionId: "revision-1",
      dirty: true
    });
  });

  it("marks a rebased dirty draft clean when it already matches the newer remote text", async () => {
    const remote = new SharedRemoteStorageProvider();
    const clientA = new MemoryDraftStore();
    const clientB = new MemoryDraftStore();

    await saveAndSyncDailyNoteSnapshot("2030-02-02", "old", clientA, remote);
    await loadDailyNoteSession("2030-02-02", clientB, remote);
    await saveAndSyncDailyNoteSnapshot("2030-02-02", "laptop", clientA, remote);

    await expect(rebaseAndSyncDailyNoteSnapshot("2030-02-02", "laptop", clientB, remote)).resolves.toEqual({
      markdown: "laptop",
      status: "synced"
    });
    expect(remote.savedInputs).toHaveLength(2);
    await expect(clientB.load("2030-02-02")).resolves.toMatchObject({
      markdown: "laptop",
      baselineMarkdown: "laptop",
      baselineRevisionId: "revision-2",
      dirty: false
    });
  });

  it("does not mutate a clean local draft until a remote refresh is applied", async () => {
    const remote = new SharedRemoteStorageProvider();
    const client = new MemoryDraftStore();
    await loadDailyNoteSession("2030-02-02", client, remote);
    await saveAndSyncDailyNoteSnapshot("2030-02-02", "remote", new MemoryDraftStore(), remote);

    const refresh = await loadCleanDailyNoteRefresh("2030-02-02", client, remote);

    expect(refresh).toMatchObject({
      markdown: "remote",
      baselineMarkdown: "remote",
      baselineRevisionId: "revision-1",
      status: "synced"
    });
    await expect(client.load("2030-02-02")).resolves.toMatchObject({
      markdown: "",
      baselineMarkdown: "",
      baselineRevisionId: null,
      dirty: false
    });

    expect(cleanDailyNoteRefreshToSession(refresh!)).toEqual({
      markdown: "remote",
      status: "synced"
    });
    await commitVisibleCleanDailyNoteRefresh("2030-02-02", refresh!, client);

    await expect(client.load("2030-02-02")).resolves.toMatchObject({
      markdown: "remote",
      baselineMarkdown: "remote",
      baselineRevisionId: "revision-1",
      dirty: false
    });
  });

  it("does not apply a clean remote refresh after the local draft becomes dirty", async () => {
    const remote = new SharedRemoteStorageProvider();
    const client = new MemoryDraftStore();
    await loadDailyNoteSession("2030-02-02", client, remote);
    await saveAndSyncDailyNoteSnapshot("2030-02-02", "remote", new MemoryDraftStore(), remote);
    const refresh = await loadCleanDailyNoteRefresh("2030-02-02", client, remote);
    await client.save(createDraft("2030-02-02", "local edit", "", null, true));

    await expect(commitVisibleCleanDailyNoteRefresh("2030-02-02", refresh!, client)).resolves.toBe(false);
    await expect(client.load("2030-02-02")).resolves.toMatchObject({
      markdown: "local edit",
      baselineMarkdown: "",
      baselineRevisionId: null,
      dirty: true
    });
  });

  it("does not commit a clean remote refresh over a racing local draft write", async () => {
    const remote = new SharedRemoteStorageProvider();
    const client = new MemoryDraftStore();
    await loadDailyNoteSession("2030-02-02", client, remote);
    await saveAndSyncDailyNoteSnapshot("2030-02-02", "remote", new MemoryDraftStore(), remote);
    const refresh = await loadCleanDailyNoteRefresh("2030-02-02", client, remote);
    const originalSaveIfUnchanged = client.saveIfUnchanged.bind(client);
    client.saveIfUnchanged = async (date, expected, draft) => {
      await client.save(createDraft("2030-02-02", "local edit", "", null, true));
      return await originalSaveIfUnchanged(date, expected, draft);
    };

    await expect(commitVisibleCleanDailyNoteRefresh("2030-02-02", refresh!, client)).resolves.toBe(false);
    await expect(client.load("2030-02-02")).resolves.toMatchObject({
      markdown: "local edit",
      baselineMarkdown: "",
      baselineRevisionId: null,
      dirty: true
    });
  });

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

  it("does not overwrite newer local edits when an older sync finishes", async () => {
    const drafts = new MemoryDraftStore();
    const remote = new RecordingRemoteStorageProvider();
    const saveStarted = deferred();
    const continueSave = deferred();
    remote.beforeSaveResult = async () => {
      saveStarted.resolve();
      await continueSave.promise;
    };

    const syncing = saveAndSyncDailyNoteSnapshot("2030-02-02", "old", drafts, remote);
    await saveStarted.promise;
    await drafts.save(createDraft("2030-02-02", "new", "", null, true));
    continueSave.resolve();

    await expect(syncing).resolves.toEqual({
      markdown: "new",
      status: "saved-locally"
    });
    await expect(drafts.load("2030-02-02")).resolves.toMatchObject({
      markdown: "new",
      baselineMarkdown: "old",
      baselineRevisionId: "revision-1",
      dirty: true
    });

    await saveAndSyncDailyNoteSnapshot("2030-02-02", "new", drafts, remote);

    expect(remote.savedInputs.at(-1)).toEqual({
      date: "2030-02-02",
      markdown: "new",
      expectedRevisionId: "revision-1"
    });
    await expect(drafts.load("2030-02-02")).resolves.toMatchObject({
      markdown: "new",
      baselineMarkdown: "new",
      baselineRevisionId: "revision-2",
      dirty: false
    });
  });

  it("does not create a remote file for an unchanged empty note snapshot", async () => {
    const drafts = new MemoryDraftStore();
    const remote = new RecordingRemoteStorageProvider();

    await expect(saveAndSyncDailyNoteSnapshot("2030-02-02", "", drafts, remote)).resolves.toEqual({
      markdown: "",
      status: "synced"
    });

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

function deferred(): { readonly promise: Promise<void>; readonly resolve: () => void };
function deferred<T>(): { readonly promise: Promise<T>; readonly resolve: (value: T) => void };
function deferred<T>(): { readonly promise: Promise<T>; readonly resolve: (value?: T) => void } {
  let resolve!: (value?: T) => void;
  const promise = new Promise<T>((innerResolve) => {
    resolve = innerResolve as (value?: T) => void;
  });
  return { promise, resolve };
}
