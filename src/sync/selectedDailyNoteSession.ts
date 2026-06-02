import {
  applyCleanDailyNoteRefreshResult,
  applyLoadedDailyNoteResult,
  applySyncResult,
  canEditDailyNoteDate,
  captureVisibleDailyNoteSnapshot,
  createCleanDailyNoteRefreshRequest,
  type DateBoundEditorState,
  type DateBoundEditorTransition,
  type VisibleDailyNoteSnapshot
} from "~/editor/dateBoundEditor";
import type { IsoDate } from "~/domain/dates";
import type { LocalDraftStore, RemoteStorageProvider, SyncStatus } from "~/storage/types";
import {
  cleanDailyNoteRefreshToSession,
  commitVisibleCleanDailyNoteRefresh,
  loadCleanDailyNoteRefresh,
  loadDailyNoteSession,
  loadLocalDailyNoteSession,
  persistLocalDraft,
  saveAndSyncDailyNoteSnapshot,
  type CleanDailyNoteRefresh,
  type DailyNoteSession
} from "./syncDailyNote";
import type { SyncRetryAction } from "./syncErrorRetry";

export type SaveSelectedDailyNoteSnapshotResult =
  | {
      readonly type: "auth-required";
      readonly applyStatus: "auth-required" | null;
    }
  | {
      readonly type: "saved";
      readonly session: DailyNoteSession;
      readonly transition: DateBoundEditorTransition | null;
    }
  | {
      readonly type: "failed";
      readonly snapshot: VisibleDailyNoteSnapshot;
      readonly error: unknown;
      readonly applyToVisibleDailyNote: boolean;
    };

export interface SaveSelectedDailyNoteSnapshotInput {
  readonly snapshot: VisibleDailyNoteSnapshot;
  readonly authReconnectRequired: boolean;
  readonly drafts: LocalDraftStore;
  readonly remote: RemoteStorageProvider;
  readonly getState: () => DateBoundEditorState;
  readonly beforeApply?: () => void;
}

export interface SaveVisibleDailyNoteSnapshotInput {
  readonly authReconnectRequired: boolean;
  readonly drafts: LocalDraftStore;
  readonly remote: RemoteStorageProvider;
  readonly getState: () => DateBoundEditorState;
}

export type LoadSelectedDailyNoteSessionResult =
  | {
      readonly type: "loaded";
      readonly session: DailyNoteSession;
      readonly transition: DateBoundEditorTransition | null;
    }
  | {
      readonly type: "failed";
      readonly date: IsoDate;
      readonly error: unknown;
      readonly applyToSelectedDate: boolean;
    };

export type LoadSelectedDailyNoteLocalSessionResult =
  | {
      readonly type: "loaded";
      readonly session: DailyNoteSession;
      readonly transition: DateBoundEditorTransition | null;
    }
  | {
      readonly type: "empty";
      readonly date: IsoDate;
      readonly applyToSelectedDate: boolean;
    }
  | {
      readonly type: "failed";
      readonly date: IsoDate;
      readonly error: unknown;
      readonly applyToSelectedDate: boolean;
    };

export type RefreshCleanSelectedDailyNoteSessionResult =
  | {
      readonly type: "skipped";
    }
  | {
      readonly type: "refreshed";
      readonly refresh: CleanDailyNoteRefresh;
      readonly session: DailyNoteSession;
      readonly transition: DateBoundEditorTransition;
      readonly draftCommitted: boolean;
    }
  | {
      readonly type: "failed";
      readonly date: IsoDate;
      readonly phase: "load" | "commit";
      readonly error: unknown;
      readonly applyToSelectedDate: boolean;
    };

export type SelectedDailyNotePollingAction =
  | {
      readonly type: "clean-refresh";
      readonly date: IsoDate;
    }
  | {
      readonly type: "dirty-save";
      readonly snapshot: VisibleDailyNoteSnapshot;
    };

export type ReconnectSelectedDailyNoteAction =
  | {
      readonly type: "save-visible";
      readonly snapshot: VisibleDailyNoteSnapshot;
    }
  | {
      readonly type: "load-selected";
      readonly date: IsoDate;
    };

export type SelectedDailyNoteManualSyncAction =
  | {
      readonly type: "save-visible";
      readonly snapshot: VisibleDailyNoteSnapshot;
    }
  | {
      readonly type: "refresh-clean";
      readonly date: IsoDate;
    }
  | {
      readonly type: "load-selected";
      readonly date: IsoDate;
    };

export type SelectedDailyNoteRemoteLoadAction =
  | {
      readonly type: "load-selected";
      readonly date: IsoDate;
    }
  | {
      readonly type: "refresh-clean";
      readonly date: IsoDate;
    };

export interface LoadSelectedDailyNoteSessionInput {
  readonly date: IsoDate;
  readonly drafts: LocalDraftStore;
  readonly remote: RemoteStorageProvider;
  readonly getState: () => DateBoundEditorState;
}

export interface LoadSelectedDailyNoteLocalSessionInput {
  readonly date: IsoDate;
  readonly drafts: LocalDraftStore;
  readonly getState: () => DateBoundEditorState;
}

export interface RefreshCleanSelectedDailyNoteSessionInput {
  readonly date: IsoDate;
  readonly drafts: LocalDraftStore;
  readonly remote: RemoteStorageProvider;
  readonly getState: () => DateBoundEditorState;
  readonly beforeApply?: () => void;
}

export async function loadSelectedDailyNoteSession(
  input: LoadSelectedDailyNoteSessionInput
): Promise<LoadSelectedDailyNoteSessionResult> {
  try {
    const session = await loadDailyNoteSession(input.date, input.drafts, input.remote);
    return {
      type: "loaded",
      session,
      transition: applyLoadedDailyNoteResult(input.getState(), input.date, session)
    };
  } catch (error) {
    return {
      type: "failed",
      date: input.date,
      error,
      applyToSelectedDate: selectedDateStillRequested(input.getState(), input.date)
    };
  }
}

export async function loadSelectedDailyNoteLocalSession(
  input: LoadSelectedDailyNoteLocalSessionInput
): Promise<LoadSelectedDailyNoteLocalSessionResult> {
  try {
    const session = await loadLocalDailyNoteSession(input.date, input.drafts);
    if (session === null) {
      return {
        type: "empty",
        date: input.date,
        applyToSelectedDate: selectedDateStillRequested(input.getState(), input.date)
      };
    }

    return {
      type: "loaded",
      session,
      transition: applyLoadedDailyNoteResult(input.getState(), input.date, session)
    };
  } catch (error) {
    return {
      type: "failed",
      date: input.date,
      error,
      applyToSelectedDate: selectedDateStillRequested(input.getState(), input.date)
    };
  }
}

export function selectedDailyNoteRemoteLoadAction(
  date: IsoDate,
  localSession: DailyNoteSession | null
): SelectedDailyNoteRemoteLoadAction | null {
  if (localSession === null) return { type: "load-selected", date };
  if (localSession.status === "saved-locally") return null;
  return { type: "refresh-clean", date };
}

export async function refreshCleanSelectedDailyNoteSession(
  input: RefreshCleanSelectedDailyNoteSessionInput
): Promise<RefreshCleanSelectedDailyNoteSessionResult> {
  const request = createCleanDailyNoteRefreshRequest(input.getState(), input.date);
  if (request === null) return { type: "skipped" };

  let refresh: CleanDailyNoteRefresh | null;
  try {
    refresh = await loadCleanDailyNoteRefresh(input.date, input.drafts, input.remote);
  } catch (error) {
    return {
      type: "failed",
      date: input.date,
      phase: "load",
      error,
      applyToSelectedDate: selectedDateStillRequested(input.getState(), input.date)
    };
  }
  if (refresh === null) return { type: "skipped" };

  input.beforeApply?.();
  const session = cleanDailyNoteRefreshToSession(refresh);
  if (applyCleanDailyNoteRefreshResult(input.getState(), request, session) === null) return { type: "skipped" };

  try {
    const draftCommitted = await commitVisibleCleanDailyNoteRefresh(input.date, refresh, input.drafts);
    if (!draftCommitted) return { type: "skipped" };

    const transition = applyCleanDailyNoteRefreshResult(input.getState(), request, session);
    if (transition === null) return { type: "skipped" };

    return {
      type: "refreshed",
      refresh,
      session,
      transition,
      draftCommitted
    };
  } catch (error) {
    return {
      type: "failed",
      date: input.date,
      phase: "commit",
      error,
      applyToSelectedDate: selectedDateStillRequested(input.getState(), input.date)
    };
  }
}

export function selectedDailyNotePollingAction(input: {
  readonly authenticated: boolean;
  readonly authReconnectRequired: boolean;
  readonly state: DateBoundEditorState;
  readonly status: SyncStatus;
}): SelectedDailyNotePollingAction | null {
  if (
    !input.authenticated ||
    input.authReconnectRequired ||
    input.state.selectedDate === null ||
    input.state.loadedDate !== input.state.selectedDate
  ) {
    return null;
  }

  if (input.status === "local-only" || input.status === "synced") {
    return {
      type: "clean-refresh",
      date: input.state.selectedDate
    };
  }

  if (input.status === "saved-locally") {
    const snapshot = captureVisibleDailyNoteSnapshot(input.state);
    return snapshot === null ? null : { type: "dirty-save", snapshot };
  }

  return null;
}

export function reconnectSelectedDailyNoteAction(state: DateBoundEditorState): ReconnectSelectedDailyNoteAction | null {
  const snapshot = captureVisibleDailyNoteSnapshot(state);
  if (snapshot !== null) {
    return {
      type: "save-visible",
      snapshot
    };
  }

  return state.selectedDate === null
    ? null
    : {
        type: "load-selected",
        date: state.selectedDate
      };
}

export function selectedDailyNoteManualSyncAction(
  state: DateBoundEditorState,
  status: SyncStatus
): SelectedDailyNoteManualSyncAction | null {
  if (state.selectedDate === null) return null;
  if (status === "auth-required" || status === "syncing") return null;

  if (state.loadedDate !== state.selectedDate) {
    return {
      type: "load-selected",
      date: state.selectedDate
    };
  }

  if (state.cleanMarkdown !== null && state.markdown === state.cleanMarkdown) {
    return {
      type: "refresh-clean",
      date: state.selectedDate
    };
  }

  const snapshot = captureVisibleDailyNoteSnapshot(state);
  return snapshot === null
    ? null
    : {
        type: "save-visible",
        snapshot
      };
}

export function selectedDailyNoteBlurSaveAction(
  state: DateBoundEditorState,
  snapshot: VisibleDailyNoteSnapshot
): VisibleDailyNoteSnapshot | null {
  if (!canEditDailyNoteDate(snapshot.date, state)) return null;
  if (state.cleanMarkdown !== null && snapshot.markdown === state.cleanMarkdown) return null;
  return snapshot;
}

export async function saveVisibleDailyNoteSnapshot(
  input: SaveVisibleDailyNoteSnapshotInput
): Promise<SaveSelectedDailyNoteSnapshotResult | null> {
  const snapshot = captureVisibleDailyNoteSnapshot(input.getState());
  if (snapshot === null) return null;
  return await saveSelectedDailyNoteSnapshot({
    ...input,
    snapshot
  });
}

export async function saveSelectedDailyNoteSnapshot(
  input: SaveSelectedDailyNoteSnapshotInput
): Promise<SaveSelectedDailyNoteSnapshotResult> {
  if (input.authReconnectRequired) {
    await persistLocalDraft(input.snapshot.date, input.snapshot.markdown, input.drafts);
    return {
      type: "auth-required",
      applyStatus: snapshotStillVisible(input.getState(), input.snapshot) ? "auth-required" : null
    };
  }

  try {
    const session = await saveAndSyncDailyNoteSnapshot(
      input.snapshot.date,
      input.snapshot.markdown,
      input.drafts,
      input.remote
    );
    input.beforeApply?.();
    return {
      type: "saved",
      session,
      transition: applySyncResult(input.getState(), input.snapshot, session)
    };
  } catch (error) {
    return {
      type: "failed",
      snapshot: input.snapshot,
      error,
      applyToVisibleDailyNote: snapshotStillVisible(input.getState(), input.snapshot)
    };
  }
}

export function captureSaveRetrySnapshot(
  state: DateBoundEditorState,
  action: SyncRetryAction
): VisibleDailyNoteSnapshot | null {
  if (action.type !== "save-current-note") return null;

  const snapshot = captureVisibleDailyNoteSnapshot(state);
  if (snapshot === null || snapshot.date !== action.date) return null;
  return snapshot;
}

export function syncStatusFromSaveResult(result: SaveSelectedDailyNoteSnapshotResult): SyncStatus | null {
  switch (result.type) {
    case "auth-required":
      return result.applyStatus;
    case "saved":
      return result.transition === null ? null : result.session.status;
    case "failed":
      return result.applyToVisibleDailyNote ? "error" : null;
  }
}

function snapshotStillVisible(state: DateBoundEditorState, snapshot: VisibleDailyNoteSnapshot): boolean {
  return state.selectedDate === snapshot.date && state.loadedDate === snapshot.date;
}

function selectedDateStillRequested(state: DateBoundEditorState, date: IsoDate): boolean {
  return state.selectedDate === date;
}
