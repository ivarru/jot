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
import { mergeDailyNote } from "~/domain/merge";
import {
  captureSaveRetrySnapshot,
  selectedDailyNoteBlurSaveAction,
  loadSelectedDailyNoteLocalSession,
  loadSelectedDailyNoteSession,
  reconnectSelectedDailyNoteAction,
  selectedDailyNoteManualSyncAction,
  refreshCleanSelectedDailyNoteSession,
  resolveSelectedDailyNoteConflict,
  saveSelectedDailyNoteSnapshot,
  selectedDailyNoteRemoteLoadAction,
  selectedDailyNotePollingAction,
  saveVisibleDailyNoteSnapshot
} from "./selectedDailyNoteSession";
import type { DailyNoteConflictResolution, DailyNoteSyncConflict } from "./syncDailyNote";

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

    expect(result).toMatchObject({
      type: "saved",
      session: {
        markdown: "before\nlocal\nsame\nafter\n",
        status: "conflict",
        conflict: {
          localMarkdown: "before\nlocal\nsame\nafter\n",
          remoteMarkdown: "before\nremote\nsame\nafter\n",
          remoteRevisionId: "remote-revision",
          merge: {
            manualConflictMarkdown: "before\n<<<<<<< Local Draft\nlocal\n=======\nremote\n>>>>>>> Google Drive\nsame\nafter\n"
          }
        }
      },
      transition: null
    });
  });

  it("returns unresolved conflicts as pending decisions without inserting marker text", async () => {
    const drafts = new MemoryDraftStore();
    const remote = new ConflictRemoteStorageProvider();
    const state = editorState({
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
      getState: () => state
    });

    expect(result.type).toBe("saved");
    if (result.type !== "saved") return;
    expect(result.session).toMatchObject({
      markdown: "before\nlocal\nsame\nafter\n",
      status: "conflict",
      conflict: {
        merge: {
          manualConflictMarkdown: "before\n<<<<<<< Local Draft\nlocal\n=======\nremote\n>>>>>>> Google Drive\nsame\nafter\n"
        }
      }
    });
    expect(result.transition).toMatchObject({
      state: {
        markdown: "before\nlocal\nsame\nafter\n"
      }
    });
    await expect(drafts.load("2030-02-02")).resolves.toMatchObject({
      markdown: "before\nlocal\nsame\nafter\n",
      dirty: true
    });
  });

  it("loads the remote note before saving a stale visible snapshot during reconnect", async () => {
    const drafts = new MemoryDraftStore();
    const remote = new RecordingRemoteStorageProvider();
    remote.note = {
      date: "2030-02-02",
      markdown: "breakfast done\nsnack\nlunch done\ndinner done\n",
      revisionId: "revision-2",
      updatedAt: "2030-01-01T00:00:00.000Z"
    };
    await drafts.save(createDraft(
      "2030-02-02",
      "breakfast\n\nlunch\ndinner\n",
      "breakfast\nlunch\ndinner\n",
      "revision-1",
      true
    ));

    const result = await saveSelectedDailyNoteSnapshot({
      snapshot: { date: "2030-02-02", markdown: "breakfast\n\nlunch\ndinner\n" },
      authReconnectRequired: false,
      refreshRemoteBeforeSave: true,
      drafts,
      remote,
      getState: () => editorState({
        selectedDate: "2030-02-02",
        loadedDate: "2030-02-02",
        markdown: "breakfast\n\nlunch\ndinner\n"
      })
    });

    expect(result.type).toBe("saved");
    expect(remote.loadInputs).toEqual(["2030-02-02"]);
    expect(remote.savedInputs).toEqual([
      {
        date: "2030-02-02",
        markdown: "breakfast done\n\nsnack\nlunch done\ndinner done\n",
        expectedRevisionId: "revision-2"
      }
    ]);
  });

  it("resolves pending conflicts through whole-note, unresolved-only, and manual choices", async () => {
    const conflict = syncConflict({
      baseline: "before\nold\nsame\nafter\n",
      local: "before\nlocal\nsame local\nafter\n",
      remote: "before\nremote\nsame\nafter remote\n"
    });

    await expectConflictResolution(conflict, "this-device", {
      markdown: conflict.localMarkdown,
      status: "synced",
      savedMarkdown: conflict.localMarkdown
    });
    await expectConflictResolution(conflict, "google-drive", {
      markdown: conflict.remoteMarkdown,
      status: "synced",
      savedMarkdown: null
    });
    await expectConflictResolution(conflict, "this-device-unresolved", {
      markdown: "before\nlocal\nsame local\nafter remote\n",
      status: "synced",
      savedMarkdown: "before\nlocal\nsame local\nafter remote\n"
    });
    await expectConflictResolution(conflict, "google-drive-unresolved", {
      markdown: "before\nremote\nsame local\nafter remote\n",
      status: "synced",
      savedMarkdown: "before\nremote\nsame local\nafter remote\n"
    });
    await expectConflictResolution(conflict, "manual", {
      markdown: "before\n<<<<<<< Local Draft\nlocal\n=======\nremote\n>>>>>>> Google Drive\nsame local\nafter remote\n",
      status: "conflict",
      savedMarkdown: null
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

  it("loads the Selected Date through the session seam", async () => {
    const drafts = new MemoryDraftStore();
    const remote = new RecordingRemoteStorageProvider();
    remote.note = {
      date: "2030-02-02",
      markdown: "remote",
      revisionId: "revision-1",
      updatedAt: "2030-01-01T00:00:00.000Z"
    };

    const result = await loadSelectedDailyNoteSession({
      date: "2030-02-02",
      drafts,
      remote,
      getState: () => editorState({ selectedDate: "2030-02-02", loadedDate: null })
    });

    expect(result).toMatchObject({
      type: "loaded",
      session: {
        markdown: "remote",
        status: "synced"
      },
      transition: {
        state: {
          selectedDate: "2030-02-02",
          loadedDate: "2030-02-02",
          markdown: "remote",
          cleanMarkdown: "remote"
        }
      }
    });
  });

  it("loads a clean cached Daily Note locally without waiting for remote storage", async () => {
    const drafts = new MemoryDraftStore();
    const remote = new RecordingRemoteStorageProvider();
    await drafts.save(createDraft("2030-02-02", "cached", "cached", "revision-1", false));

    const result = await loadSelectedDailyNoteLocalSession({
      date: "2030-02-02",
      drafts,
      getState: () => editorState({ selectedDate: "2030-02-02", loadedDate: null })
    });

    expect(result).toMatchObject({
      type: "loaded",
      session: {
        markdown: "cached",
        status: "synced"
      },
      transition: {
        state: {
          selectedDate: "2030-02-02",
          loadedDate: "2030-02-02",
          markdown: "cached",
          cleanMarkdown: "cached"
        }
      }
    });
    expect(remote.loadInputs).toEqual([]);
    expect(selectedDailyNoteRemoteLoadAction("2030-02-02", result.type === "loaded" ? result.session : null)).toEqual({
      type: "refresh-clean",
      date: "2030-02-02"
    });
  });

  it("requests a remote load when no cached Daily Note exists", async () => {
    const drafts = new MemoryDraftStore();

    const result = await loadSelectedDailyNoteLocalSession({
      date: "2030-02-02",
      drafts,
      getState: () => editorState({ selectedDate: "2030-02-02", loadedDate: null })
    });

    expect(result).toEqual({
      type: "empty",
      date: "2030-02-02",
      applyToSelectedDate: true
    });
    expect(selectedDailyNoteRemoteLoadAction("2030-02-02", null)).toEqual({
      type: "load-selected",
      date: "2030-02-02"
    });
  });

  it("does not schedule a remote load for dirty cached Daily Notes", async () => {
    const drafts = new MemoryDraftStore();
    await drafts.save(createDraft("2030-02-02", "dirty", "clean", "revision-1", true));

    const result = await loadSelectedDailyNoteLocalSession({
      date: "2030-02-02",
      drafts,
      getState: () => editorState({ selectedDate: "2030-02-02", loadedDate: null })
    });

    expect(result).toMatchObject({
      type: "loaded",
      session: {
        markdown: "dirty",
        status: "saved-locally"
      }
    });
    expect(selectedDailyNoteRemoteLoadAction("2030-02-02", result.type === "loaded" ? result.session : null)).toBeNull();
  });

  it("refreshes a clean selected Daily Note and commits the visible draft", async () => {
    const drafts = new MemoryDraftStore();
    const remote = new RecordingRemoteStorageProvider();
    await drafts.save(createDraft("2030-02-02", "clean", "clean", "revision-1", false));
    remote.note = {
      date: "2030-02-02",
      markdown: "remote refresh",
      revisionId: "revision-2",
      updatedAt: "2030-01-01T00:00:00.000Z"
    };

    const result = await refreshCleanSelectedDailyNoteSession({
      date: "2030-02-02",
      drafts,
      remote,
      getState: () =>
        editorState({
          selectedDate: "2030-02-02",
          loadedDate: "2030-02-02",
          markdown: "clean",
          cleanMarkdown: "clean"
        })
    });

    expect(result).toMatchObject({
      type: "refreshed",
      session: {
        markdown: "remote refresh",
        status: "synced"
      },
      transition: {
        state: {
          markdown: "remote refresh",
          cleanMarkdown: "remote refresh"
        }
      },
      draftCommitted: true
    });
    await expect(drafts.load("2030-02-02")).resolves.toMatchObject({
      markdown: "remote refresh",
      baselineRevisionId: "revision-2",
      dirty: false
    });
  });

  it("does not return a clean refresh transition after an edit during the draft commit", async () => {
    const drafts = new MemoryDraftStore();
    const remote = new RecordingRemoteStorageProvider();
    const commitStarted = deferred();
    const continueCommit = deferred();
    let currentState = editorState({
      selectedDate: "2030-02-02",
      loadedDate: "2030-02-02",
      markdown: "clean",
      cleanMarkdown: "clean",
      editorChangeEpoch: 1
    });
    await drafts.save(createDraft("2030-02-02", "clean", "clean", "revision-1", false));
    drafts.beforeSaveIfUnchanged = async () => {
      commitStarted.resolve();
      await continueCommit.promise;
    };
    remote.note = {
      date: "2030-02-02",
      markdown: "remote refresh",
      revisionId: "revision-2",
      updatedAt: "2030-01-01T00:00:00.000Z"
    };

    const refreshing = refreshCleanSelectedDailyNoteSession({
      date: "2030-02-02",
      drafts,
      remote,
      getState: () => currentState
    });
    await commitStarted.promise;
    currentState = editorState({
      selectedDate: "2030-02-02",
      loadedDate: "2030-02-02",
      markdown: "local edit",
      cleanMarkdown: null,
      editorChangeEpoch: 2
    });
    continueCommit.resolve();

    await expect(refreshing).resolves.toEqual({ type: "skipped" });
  });

  it("chooses polling actions from the selected Daily Note session state", () => {
    const cleanState = editorState({
      selectedDate: "2030-02-02",
      loadedDate: "2030-02-02",
      markdown: "clean",
      cleanMarkdown: "clean"
    });
    const dirtyState = editorState({
      selectedDate: "2030-02-02",
      loadedDate: "2030-02-02",
      markdown: "dirty"
    });

    expect(selectedDailyNotePollingAction({ authenticated: true, authReconnectRequired: false, state: cleanState, status: "synced" })).toEqual({
      type: "clean-refresh",
      date: "2030-02-02"
    });
    expect(selectedDailyNotePollingAction({ authenticated: true, authReconnectRequired: false, state: dirtyState, status: "saved-locally" })).toEqual({
      type: "dirty-save",
      snapshot: {
        date: "2030-02-02",
        markdown: "dirty"
      }
    });
    expect(selectedDailyNotePollingAction({ authenticated: true, authReconnectRequired: true, state: cleanState, status: "synced" })).toBeNull();
  });

  it("chooses reconnect actions from selected Daily Note visibility", () => {
    expect(
      reconnectSelectedDailyNoteAction(
        editorState({
          selectedDate: "2030-02-02",
          loadedDate: "2030-02-02",
          markdown: "visible"
        })
      )
    ).toEqual({
      type: "save-visible",
      snapshot: {
        date: "2030-02-02",
        markdown: "visible"
      }
    });

    expect(reconnectSelectedDailyNoteAction(editorState({ selectedDate: "2030-02-02", loadedDate: null }))).toEqual({
      type: "load-selected",
      date: "2030-02-02"
    });
    expect(reconnectSelectedDailyNoteAction(editorState({ selectedDate: null, loadedDate: null }))).toBeNull();
  });

  it("chooses manual sync actions from selected Daily Note visibility", () => {
    const cleanState = editorState({
      selectedDate: "2030-02-02",
      loadedDate: "2030-02-02",
      markdown: "clean",
      cleanMarkdown: "clean"
    });
    const dirtyState = editorState({
      selectedDate: "2030-02-02",
      loadedDate: "2030-02-02",
      markdown: "dirty"
    });

    expect(selectedDailyNoteManualSyncAction(cleanState, "synced")).toEqual({
      type: "refresh-clean",
      date: "2030-02-02"
    });
    expect(selectedDailyNoteManualSyncAction(cleanState, "local-only")).toEqual({
      type: "refresh-clean",
      date: "2030-02-02"
    });
    expect(selectedDailyNoteManualSyncAction(cleanState, "error")).toEqual({
      type: "refresh-clean",
      date: "2030-02-02"
    });
    expect(selectedDailyNoteManualSyncAction(dirtyState, "saved-locally")).toEqual({
      type: "save-visible",
      snapshot: {
        date: "2030-02-02",
        markdown: "dirty"
      }
    });
    expect(selectedDailyNoteManualSyncAction(dirtyState, "synced")).toEqual({
      type: "save-visible",
      snapshot: {
        date: "2030-02-02",
        markdown: "dirty"
      }
    });
    expect(selectedDailyNoteManualSyncAction(editorState({ selectedDate: "2030-02-02", loadedDate: null }), "synced")).toEqual({
      type: "load-selected",
      date: "2030-02-02"
    });
    expect(selectedDailyNoteManualSyncAction(cleanState, "auth-required")).toBeNull();
    expect(selectedDailyNoteManualSyncAction(cleanState, "syncing")).toBeNull();
  });

  it("does not save a clean visible Daily Note on blur", () => {
    const cleanState = editorState({
      selectedDate: "2030-02-02",
      loadedDate: "2030-02-02",
      markdown: "stale cached",
      cleanMarkdown: "stale cached"
    });
    const dirtyState = editorState({
      selectedDate: "2030-02-02",
      loadedDate: "2030-02-02",
      markdown: "local edit",
      cleanMarkdown: null
    });

    expect(selectedDailyNoteBlurSaveAction(cleanState, { date: "2030-02-02", markdown: "stale cached" })).toBeNull();
    expect(selectedDailyNoteBlurSaveAction(dirtyState, { date: "2030-02-02", markdown: "local edit" })).toEqual({
      date: "2030-02-02",
      markdown: "local edit"
    });
    expect(selectedDailyNoteBlurSaveAction(cleanState, { date: "2030-02-01", markdown: "background edit" })).toBeNull();
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

function syncConflict(input: {
  readonly baseline: string;
  readonly local: string;
  readonly remote: string;
}): DailyNoteSyncConflict {
  return {
    date: "2030-02-02",
    localMarkdown: input.local,
    remoteMarkdown: input.remote,
    baselineMarkdown: input.baseline,
    baselineRevisionId: "baseline-revision",
    remoteRevisionId: "remote-revision",
    merge: mergeDailyNote({
      baseline: input.baseline,
      local: input.local,
      remote: input.remote
    })
  };
}

async function expectConflictResolution(
  conflict: DailyNoteSyncConflict,
  resolution: DailyNoteConflictResolution,
  expected: {
    readonly markdown: string;
    readonly status: string;
    readonly savedMarkdown: string | null;
  }
): Promise<void> {
  const drafts = new MemoryDraftStore();
  const remote = new RecordingRemoteStorageProvider();
  const result = await resolveSelectedDailyNoteConflict({
    conflict,
    resolution,
    drafts,
    remote,
    getState: () => editorState({
      selectedDate: conflict.date,
      loadedDate: conflict.date,
      markdown: conflict.localMarkdown
    })
  });

  expect(result.type).toBe("saved");
  if (result.type !== "saved") return;
  expect(result.session).toMatchObject({
    markdown: expected.markdown,
    status: expected.status
  });
  expect(result.transition).toMatchObject({
    state: {
      markdown: expected.markdown
    }
  });
  expect(remote.savedInputs.map((input) => input.markdown)).toEqual(
    expected.savedMarkdown === null ? [] : [expected.savedMarkdown]
  );
  await expect(drafts.load(conflict.date)).resolves.toMatchObject({
    markdown: expected.markdown,
    dirty: expected.status !== "synced"
  });
}

class MemoryDraftStore implements LocalDraftStore {
  readonly drafts = new Map<IsoDate, LocalDraft>();
  beforeSaveIfUnchanged: (() => Promise<void>) | null = null;

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
    await this.beforeSaveIfUnchanged?.();
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

function deferred(): { readonly promise: Promise<void>; readonly resolve: () => void } {
  let resolve!: () => void;
  const promise = new Promise<void>((innerResolve) => {
    resolve = innerResolve;
  });
  return { promise, resolve };
}
