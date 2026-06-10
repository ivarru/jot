import { createDraft } from "~/storage/localDraftStore";
import type { IsoDate } from "~/domain/dates";
import type { DateBoundEditorState, DateBoundEditorTransition } from "~/editor/dateBoundEditor";
import type {
  LocalDraft,
  LocalDraftStore,
  RemoteDailyNote,
  RemoteStorageProvider,
  SaveDailyNoteInput,
  SaveDailyNoteResult,
  SyncStatus
} from "~/storage/types";
import { createSelectedDateDriveSync } from "./selectedDateDriveSync";
import type { DailyNoteSyncConflict } from "./syncDailyNote";
import type { SyncErrorState } from "./syncErrorRetry";

const DATE: IsoDate = "2030-02-02";

describe("Selected Date Drive Sync lifecycle", () => {
  it("loads a cached Daily Note and follows with a clean remote refresh", async () => {
    const drafts = new MemoryDraftStore();
    const remote = new RecordingRemoteStorageProvider();
    await drafts.save(createDraft(DATE, "cached", "cached", "revision-1", false));
    remote.note = {
      date: DATE,
      markdown: "remote refresh",
      revisionId: "revision-2",
      updatedAt: "2030-01-01T00:00:00.000Z"
    };
    const harness = createHarness({ drafts, remote });

    await harness.sync.loadSelectedDateFromLocalDraft(DATE);

    expect(harness.transitions.map((transition) => transition.state.markdown)).toEqual([
      "cached",
      "remote refresh"
    ]);
    expect(harness.state.markdown).toBe("remote refresh");
    expect(harness.syncStatuses).toEqual(["synced", "synced"]);
    expect(remote.loadInputs).toEqual([DATE]);
    await expect(drafts.load(DATE)).resolves.toMatchObject({
      markdown: "remote refresh",
      baselineRevisionId: "revision-2",
      dirty: false
    });
  });

  it("does not continue from local draft load into remote follow-up after cancellation", async () => {
    const cachedDraft = createDraft(DATE, "cached", "cached", "revision-1", false);
    const drafts = new DelayedFirstLoadDraftStore(cachedDraft);
    const remote = new RecordingRemoteStorageProvider();
    remote.note = {
      date: DATE,
      markdown: "remote after sign-out",
      revisionId: "revision-2",
      updatedAt: "2030-01-01T00:00:00.000Z"
    };
    const harness = createHarness({ drafts, remote });

    const loading = harness.sync.loadSelectedDateFromLocalDraft(DATE);
    await drafts.firstLoadStarted.promise;
    harness.sync.cancelInFlightWork();
    await drafts.clearAll();
    drafts.finishFirstLoad();
    await loading;

    expect(harness.transitions).toEqual([]);
    expect(harness.syncStatuses).toEqual([]);
    expect(remote.loadInputs).toEqual([]);
    await expect(drafts.load(DATE)).resolves.toBeNull();
  });

  it("does not apply a remote load that finishes after cancellation", async () => {
    const drafts = new MemoryDraftStore();
    const remote = new DelayedLoadRemoteStorageProvider({
      date: DATE,
      markdown: "remote after sign-out",
      revisionId: "revision-1",
      updatedAt: "2030-01-01T00:00:00.000Z"
    });
    const harness = createHarness({ drafts, remote });

    const loading = harness.sync.loadSelectedDate(DATE);
    await remote.loadStarted.promise;
    harness.sync.cancelInFlightWork();
    await drafts.clearAll();
    remote.finishLoad();
    await loading;

    expect(harness.transitions).toEqual([]);
    expect(harness.syncStatuses).toEqual([]);
    await expect(drafts.load(DATE)).resolves.toBeNull();
  });

  it("does not persist a visible Local Draft after cancellation", async () => {
    const drafts = new DelayedLoadDraftStore(null);
    const remote = new RecordingRemoteStorageProvider();
    const harness = createHarness({ drafts, remote });

    const persisting = harness.sync.persistVisibleLocalDraft({
      date: DATE,
      markdown: "local edit after sign-out"
    });
    await drafts.loadStarted.promise;
    harness.sync.cancelInFlightWork();
    await drafts.clearAll();
    drafts.finishLoad();
    await persisting;

    expect(harness.syncStatuses).toEqual([]);
    await expect(drafts.load(DATE)).resolves.toBeNull();
  });

  it("does not commit a clean refresh after cancellation", async () => {
    const drafts = new MemoryDraftStore();
    await drafts.save(createDraft(DATE, "clean", "clean", "revision-1", false));
    const remote = new DelayedLoadRemoteStorageProvider({
      date: DATE,
      markdown: "remote refresh after sign-out",
      revisionId: "revision-2",
      updatedAt: "2030-01-01T00:00:00.000Z"
    });
    const harness = createHarness({
      drafts,
      remote,
      state: editorState({
        selectedDate: DATE,
        loadedDate: DATE,
        markdown: "clean",
        cleanMarkdown: "clean"
      }),
      syncStatus: "synced"
    });

    const refreshing = harness.sync.refreshCleanSelectedDate(DATE);
    await remote.loadStarted.promise;
    harness.sync.cancelInFlightWork();
    await drafts.clearAll();
    remote.finishLoad();
    await refreshing;

    expect(harness.transitions).toEqual([]);
    expect(harness.syncStatuses).toEqual([]);
    await expect(drafts.load(DATE)).resolves.toBeNull();
  });

  it("does not apply a remote save result after cancellation", async () => {
    const drafts = new MemoryDraftStore();
    const remote = new DelayedSaveRemoteStorageProvider();
    const harness = createHarness({
      drafts,
      remote,
      state: editorState({
        selectedDate: DATE,
        loadedDate: DATE,
        markdown: "dirty"
      })
    });

    const saving = harness.sync.saveAndSyncSnapshot({
      date: DATE,
      markdown: "dirty"
    });
    await remote.saveStarted.promise;
    harness.sync.cancelInFlightWork();
    await drafts.clearAll();
    remote.finishSave();
    await saving;

    expect(harness.transitions).toEqual([]);
    expect(harness.syncStatuses).toEqual(["syncing"]);
    await expect(drafts.load(DATE)).resolves.toBeNull();
  });

  it("owns dirty polling without exposing the clean-or-dirty action union to callers", async () => {
    const drafts = new MemoryDraftStore();
    const remote = new RecordingRemoteStorageProvider();
    const harness = createHarness({
      drafts,
      remote,
      state: editorState({
        selectedDate: DATE,
        loadedDate: DATE,
        markdown: "dirty"
      }),
      syncStatus: "saved-locally"
    });

    expect(harness.sync.pollingMode()).toBe("dirty-save");
    await harness.sync.pollSelectedDate();

    expect(remote.savedInputs).toEqual([
      {
        date: DATE,
        markdown: "dirty",
        expectedRevisionId: null
      }
    ]);
    expect(harness.syncStatuses).toEqual(["syncing", "synced"]);
    expect(harness.markedExistingDates).toEqual([DATE]);
  });

  it("applies sync conflict state from save results at the lifecycle seam", async () => {
    const drafts = new MemoryDraftStore();
    const remote = new ConflictRemoteStorageProvider();
    await drafts.save(createDraft(
      DATE,
      "before\nlocal\nsame\nafter\n",
      "before\nold\nsame\nafter\n",
      "baseline-revision",
      true
    ));
    const harness = createHarness({
      drafts,
      remote,
      state: editorState({
        selectedDate: DATE,
        loadedDate: DATE,
        markdown: "before\nlocal\nsame\nafter\n"
      }),
      syncStatus: "saved-locally"
    });

    await harness.sync.saveAndSyncSnapshot({
      date: DATE,
      markdown: "before\nlocal\nsame\nafter\n"
    });

    expect(harness.syncStatuses).toEqual(["syncing", "conflict"]);
    expect(harness.pendingSyncConflict?.remoteMarkdown).toBe("before\nremote\nsame\nafter\n");
    expect(harness.lastSyncError).toBeNull();
    expect(harness.state.markdown).toBe("before\nlocal\nsame\nafter\n");
  });

  it("routes selected-date retry work through the lifecycle module", async () => {
    const drafts = new MemoryDraftStore();
    const remote = new RecordingRemoteStorageProvider();
    remote.note = {
      date: DATE,
      markdown: "remote",
      revisionId: "revision-1",
      updatedAt: "2030-01-01T00:00:00.000Z"
    };
    const harness = createHarness({
      drafts,
      remote,
      lastSyncError: {
        message: "load failed",
        retry: "load-selected-note",
        date: DATE
      }
    });

    await harness.sync.retryLastSyncError({
      saveSettings: () => {
        throw new Error("settings retry should not run");
      },
      syncDirtyDrafts: () => {
        throw new Error("dirty draft retry should not run");
      }
    });

    expect(harness.lastSyncError).toBeNull();
    expect(harness.state.markdown).toBe("remote");
    expect(harness.syncStatuses).toEqual(["synced"]);
  });
});

function createHarness(input: {
  readonly drafts: LocalDraftStore;
  readonly remote: RemoteStorageProvider;
  readonly state?: DateBoundEditorState;
  readonly syncStatus?: SyncStatus;
  readonly lastSyncError?: SyncErrorState | null;
}) {
  let state = input.state ?? editorState({ selectedDate: DATE, loadedDate: null });
  let syncStatus: SyncStatus = input.syncStatus ?? "local-only";
  let lastSyncError: SyncErrorState | null = input.lastSyncError ?? null;
  let pendingSyncConflict: DailyNoteSyncConflict | null = null;
  const transitions: DateBoundEditorTransition[] = [];
  const syncStatuses: SyncStatus[] = [];
  const markedExistingDates: IsoDate[] = [];

  const sync = createSelectedDateDriveSync({
    authenticated: () => true,
    authReconnectRequired: () => false,
    drafts: input.drafts,
    remote: input.remote,
    getState: () => state,
    getSyncStatus: () => syncStatus,
    getLastSyncError: () => lastSyncError,
    applyTransition: (transition) => {
      transitions.push(transition);
      state = transition.state;
    },
    setLoadError: () => undefined,
    setLastSyncError: (error) => {
      lastSyncError = error;
    },
    setPendingSyncConflict: (conflict) => {
      pendingSyncConflict = conflict;
    },
    setSyncStatus: (status) => {
      syncStatus = status;
      syncStatuses.push(status);
    },
    markExistingNoteDate: (date) => markedExistingDates.push(date),
    handleRemoteError: () => false,
    errorMessage: (error) => error instanceof Error ? error.message : String(error)
  });

  return {
    get state() {
      return state;
    },
    get syncStatus() {
      return syncStatus;
    },
    get lastSyncError() {
      return lastSyncError;
    },
    get pendingSyncConflict() {
      return pendingSyncConflict;
    },
    markedExistingDates,
    sync,
    syncStatuses,
    transitions
  };
}

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

class DelayedFirstLoadDraftStore extends MemoryDraftStore {
  readonly firstLoadStarted = deferred<void>();
  private readonly firstLoadCanFinish = deferred<void>();
  private firstLoadPending = true;

  constructor(private readonly firstLoadDraft: LocalDraft) {
    super();
  }

  override async load(date: IsoDate): Promise<LocalDraft | null> {
    if (date === this.firstLoadDraft.date && this.firstLoadPending) {
      this.firstLoadPending = false;
      this.firstLoadStarted.resolve();
      await this.firstLoadCanFinish.promise;
      return this.firstLoadDraft;
    }

    return await super.load(date);
  }

  finishFirstLoad(): void {
    this.firstLoadCanFinish.resolve();
  }
}

class DelayedLoadDraftStore extends MemoryDraftStore {
  readonly loadStarted = deferred<void>();
  private readonly loadCanFinish = deferred<void>();
  private loadPending = true;

  constructor(private readonly loadResult: LocalDraft | null) {
    super();
  }

  override async load(date: IsoDate): Promise<LocalDraft | null> {
    if (date === DATE && this.loadPending) {
      this.loadPending = false;
      this.loadStarted.resolve();
      await this.loadCanFinish.promise;
      return this.loadResult;
    }

    return await super.load(date);
  }

  finishLoad(): void {
    this.loadCanFinish.resolve();
  }
}

class RecordingRemoteStorageProvider implements RemoteStorageProvider {
  readonly loadInputs: IsoDate[] = [];
  readonly savedInputs: SaveDailyNoteInput[] = [];
  note: RemoteDailyNote | null = null;

  async loadDailyNote(date: IsoDate): Promise<RemoteDailyNote | null> {
    this.loadInputs.push(date);
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

class DelayedLoadRemoteStorageProvider extends RecordingRemoteStorageProvider {
  readonly loadStarted = deferred<void>();
  private readonly loadCanFinish = deferred<void>();

  constructor(note: RemoteDailyNote) {
    super();
    this.note = note;
  }

  override async loadDailyNote(date: IsoDate): Promise<RemoteDailyNote | null> {
    this.loadInputs.push(date);
    this.loadStarted.resolve();
    await this.loadCanFinish.promise;
    return this.note?.date === date ? this.note : null;
  }

  finishLoad(): void {
    this.loadCanFinish.resolve();
  }
}

class DelayedSaveRemoteStorageProvider extends RecordingRemoteStorageProvider {
  readonly saveStarted = deferred<void>();
  private readonly saveCanFinish = deferred<void>();

  override async saveDailyNote(input: SaveDailyNoteInput): Promise<SaveDailyNoteResult> {
    this.savedInputs.push(input);
    this.saveStarted.resolve();
    await this.saveCanFinish.promise;
    return {
      type: "saved",
      note: {
        date: input.date,
        markdown: input.markdown,
        revisionId: "revision-after-sign-out",
        updatedAt: "2030-01-01T00:00:00.000Z"
      }
    };
  }

  finishSave(): void {
    this.saveCanFinish.resolve();
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

function deferred<T = void>(): { readonly promise: Promise<T>; readonly resolve: (value: T | PromiseLike<T>) => void } {
  let resolve!: (value: T | PromiseLike<T>) => void;
  const promise = new Promise<T>((innerResolve) => {
    resolve = innerResolve;
  });
  return { promise, resolve };
}
