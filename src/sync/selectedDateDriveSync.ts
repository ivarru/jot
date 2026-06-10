import type { IsoDate } from "~/domain/dates";
import type {
  DateBoundEditorState,
  DateBoundEditorTransition,
  VisibleDailyNoteSnapshot
} from "~/editor/dateBoundEditor";
import { canEditDailyNoteDate } from "~/editor/dateBoundEditor";
import type { LocalDraftStore, RemoteStorageProvider, SyncStatus } from "~/storage/types";
import type { DailyNoteConflictResolution, DailyNoteSyncConflict } from "./syncDailyNote";
import { isCancelledDailyNoteSyncError, persistLocalDraft, type DailyNoteSyncControl } from "./syncDailyNote";
import {
  captureSaveRetrySnapshot,
  loadSelectedDailyNoteLocalSession,
  loadSelectedDailyNoteSession,
  reconnectSelectedDailyNoteAction,
  refreshCleanSelectedDailyNoteSession,
  resolveSelectedDailyNoteConflict,
  saveSelectedDailyNoteSnapshot,
  saveVisibleDailyNoteSnapshot,
  selectedDailyNoteBlurSaveAction,
  selectedDailyNoteManualSyncAction,
  selectedDailyNotePollingAction,
  selectedDailyNoteRemoteLoadAction,
  type LoadSelectedDailyNoteLocalSessionResult,
  type LoadSelectedDailyNoteSessionResult,
  type RefreshCleanSelectedDailyNoteSessionResult,
  type SaveSelectedDailyNoteSnapshotResult
} from "./selectedDailyNoteSession";
import { resolveSyncErrorRetry, type SyncErrorState } from "./syncErrorRetry";

export type SelectedDatePollingMode = "clean-refresh" | "dirty-save";

export interface SelectedDateDriveSyncInput {
  readonly authenticated: () => boolean;
  readonly authReconnectRequired: () => boolean;
  readonly drafts: LocalDraftStore;
  readonly remote: RemoteStorageProvider;
  readonly getState: () => DateBoundEditorState;
  readonly getSyncStatus: () => SyncStatus;
  readonly getLastSyncError: () => SyncErrorState | null;
  readonly applyTransition: (transition: DateBoundEditorTransition) => void;
  readonly setLoadError: (message: string | null) => void;
  readonly setLastSyncError: (error: SyncErrorState | null) => void;
  readonly setPendingSyncConflict: (conflict: DailyNoteSyncConflict | null) => void;
  readonly setSyncStatus: (status: SyncStatus) => void;
  readonly markExistingNoteDate: (date: IsoDate) => void;
  readonly handleRemoteError: (error: unknown, retry?: SyncErrorState | null) => boolean;
  readonly errorMessage: (error: unknown) => string;
}

export interface SelectedDateDriveSync {
  readonly cancelInFlightWork: () => void;
  readonly loadSelectedDate: (date: IsoDate) => Promise<void>;
  readonly loadSelectedDateFromLocalDraft: (date: IsoDate) => Promise<void>;
  readonly refreshCleanSelectedDate: (date: IsoDate) => Promise<void>;
  readonly persistVisibleLocalDraft: (snapshot: VisibleDailyNoteSnapshot) => Promise<void>;
  readonly saveAndSyncSnapshot: (
    snapshot: VisibleDailyNoteSnapshot,
    options?: { readonly refreshRemoteBeforeSave?: boolean }
  ) => Promise<void>;
  readonly saveCurrentEditorSnapshot: () => Promise<void>;
  readonly saveBlurSnapshot: (snapshot: VisibleDailyNoteSnapshot) => Promise<void>;
  readonly canSyncSelectedDateOnDemand: () => boolean;
  readonly syncSelectedDateOnDemand: () => Promise<void>;
  readonly pollingMode: () => SelectedDatePollingMode | null;
  readonly pollSelectedDate: () => Promise<void>;
  readonly applySaveResult: (result: SaveSelectedDailyNoteSnapshotResult) => void;
  readonly resolvePendingConflict: (
    conflict: DailyNoteSyncConflict,
    resolution: DailyNoteConflictResolution
  ) => Promise<void>;
  readonly retryLastSyncError: (input: {
    readonly saveSettings: () => void;
    readonly syncDirtyDrafts: () => void;
  }) => Promise<void>;
  readonly reconnect: () => Promise<void>;
}

export function createSelectedDateDriveSync(input: SelectedDateDriveSyncInput): SelectedDateDriveSync {
  let generation = 0;

  const cancelInFlightWork = (): void => {
    generation += 1;
  };

  const currentGeneration = (): number => generation;
  const isCurrentGeneration = (capturedGeneration: number): boolean => capturedGeneration === generation;
  const canContinueInGeneration = (capturedGeneration: number): NonNullable<DailyNoteSyncControl["canContinue"]> =>
    () => isCurrentGeneration(capturedGeneration);

  const loadSelectedDate = async (date: IsoDate): Promise<void> => {
    const startedInGeneration = currentGeneration();
    const result = await loadSelectedDailyNoteSession({
      date,
      drafts: input.drafts,
      remote: input.remote,
      getState: input.getState,
      canContinue: canContinueInGeneration(startedInGeneration)
    });
    if (!isCurrentGeneration(startedInGeneration)) return;
    applyLoadResult(result);
  };

  const loadSelectedDateFromLocalDraft = async (date: IsoDate): Promise<void> => {
    const startedInGeneration = currentGeneration();
    const result = await loadSelectedDailyNoteLocalSession({
      date,
      drafts: input.drafts,
      getState: input.getState
    });
    if (!isCurrentGeneration(startedInGeneration)) return;

    const remoteAction = applyLocalLoadResult(result);
    if (remoteAction === null) return;
    if (!isCurrentGeneration(startedInGeneration)) return;

    if (remoteAction.type === "load-selected") {
      await loadSelectedDate(remoteAction.date);
    } else {
      await refreshCleanSelectedDate(remoteAction.date);
    }
  };

  const refreshCleanSelectedDate = async (date: IsoDate): Promise<void> => {
    const startedInGeneration = currentGeneration();
    const result = await refreshCleanSelectedDailyNoteSession({
      date,
      drafts: input.drafts,
      remote: input.remote,
      getState: input.getState,
      canContinue: canContinueInGeneration(startedInGeneration)
    });
    if (!isCurrentGeneration(startedInGeneration)) return;
    applyRefreshResult(result);
  };

  const persistVisibleLocalDraft = async (snapshot: VisibleDailyNoteSnapshot): Promise<void> => {
    const startedInGeneration = currentGeneration();
    try {
      const status = await persistLocalDraft(snapshot.date, snapshot.markdown, input.drafts, {
        canContinue: canContinueInGeneration(startedInGeneration)
      });
      if (!isCurrentGeneration(startedInGeneration)) return;
      input.setSyncStatus(status);
    } catch (error: unknown) {
      if (isCancelledDailyNoteSyncError(error)) return;
      input.setLastSyncError({
        message: input.errorMessage(error),
        retry: "save-current-note",
        date: snapshot.date
      });
      input.setSyncStatus("error");
    }
  };

  const saveAndSyncSnapshot = async (
    snapshot: VisibleDailyNoteSnapshot,
    options: { readonly refreshRemoteBeforeSave?: boolean } = {}
  ): Promise<void> => {
    const startedInGeneration = currentGeneration();
    if (!input.authReconnectRequired() && canEditDailyNoteDate(snapshot.date, input.getState())) {
      input.setSyncStatus("syncing");
    }
    const result = await saveSelectedDailyNoteSnapshot({
      snapshot,
      authReconnectRequired: input.authReconnectRequired(),
      drafts: input.drafts,
      remote: input.remote,
      getState: input.getState,
      canContinue: canContinueInGeneration(startedInGeneration),
      ...(options.refreshRemoteBeforeSave === undefined
        ? {}
        : { refreshRemoteBeforeSave: options.refreshRemoteBeforeSave })
    });
    if (!isCurrentGeneration(startedInGeneration)) return;
    applySaveResult(result);
  };

  const saveCurrentEditorSnapshot = async (): Promise<void> => {
    const startedInGeneration = currentGeneration();
    const result = await saveVisibleDailyNoteSnapshot({
      authReconnectRequired: input.authReconnectRequired(),
      drafts: input.drafts,
      remote: input.remote,
      getState: input.getState,
      canContinue: canContinueInGeneration(startedInGeneration)
    });
    if (!isCurrentGeneration(startedInGeneration)) return;
    if (result !== null) applySaveResult(result);
  };

  const saveBlurSnapshot = async (snapshot: VisibleDailyNoteSnapshot): Promise<void> => {
    const save = selectedDailyNoteBlurSaveAction(input.getState(), snapshot);
    if (save !== null) await saveAndSyncSnapshot(save);
  };

  const syncSelectedDateOnDemand = async (): Promise<void> => {
    if (!input.authenticated() || input.authReconnectRequired()) return;
    const action = selectedDailyNoteManualSyncAction(input.getState(), input.getSyncStatus());
    if (action === null) return;

    switch (action.type) {
      case "load-selected":
        await loadSelectedDate(action.date);
        return;
      case "refresh-clean":
        await refreshCleanSelectedDate(action.date);
        return;
      case "save-visible":
        await saveAndSyncSnapshot(action.snapshot);
        return;
    }
  };

  const canSyncSelectedDateOnDemand = (): boolean => {
    return (
      input.authenticated() &&
      !input.authReconnectRequired() &&
      selectedDailyNoteManualSyncAction(input.getState(), input.getSyncStatus()) !== null
    );
  };

  const pollingMode = (): SelectedDatePollingMode | null => {
    const action = selectedDailyNotePollingAction({
      authenticated: input.authenticated(),
      authReconnectRequired: input.authReconnectRequired(),
      state: input.getState(),
      status: input.getSyncStatus()
    });
    return action?.type ?? null;
  };

  const pollSelectedDate = async (): Promise<void> => {
    const action = selectedDailyNotePollingAction({
      authenticated: input.authenticated(),
      authReconnectRequired: input.authReconnectRequired(),
      state: input.getState(),
      status: input.getSyncStatus()
    });
    if (action === null) return;

    if (action.type === "clean-refresh") {
      await refreshCleanSelectedDate(action.date);
    } else {
      await saveAndSyncSnapshot(action.snapshot);
    }
  };

  const resolvePendingConflict = async (
    conflict: DailyNoteSyncConflict,
    resolution: DailyNoteConflictResolution
  ): Promise<void> => {
    const startedInGeneration = currentGeneration();
    if (resolution !== "manual") input.setSyncStatus("syncing");
    const result = await resolveSelectedDailyNoteConflict({
      conflict,
      resolution,
      drafts: input.drafts,
      remote: input.remote,
      getState: input.getState,
      canContinue: canContinueInGeneration(startedInGeneration)
    });
    if (!isCurrentGeneration(startedInGeneration)) return;
    applySaveResult(result);
  };

  const retryLastSyncError = async (retryInput: {
    readonly saveSettings: () => void;
    readonly syncDirtyDrafts: () => void;
  }): Promise<void> => {
    const error = input.getLastSyncError();
    if (error === null) return;
    const action = resolveSyncErrorRetry(error, input.getState());

    input.setLastSyncError(null);
    if (action === null) return;

    switch (action.type) {
      case "load-selected-note":
        input.setLoadError(null);
        await loadSelectedDate(action.date);
        return;
      case "save-current-note": {
        const snapshot = captureSaveRetrySnapshot(input.getState(), action);
        if (snapshot !== null) await saveAndSyncSnapshot(snapshot);
        return;
      }
      case "save-settings":
        retryInput.saveSettings();
        return;
      case "sync-dirty-drafts":
        retryInput.syncDirtyDrafts();
        return;
    }
  };

  const reconnect = async (): Promise<void> => {
    const reconnectAction = reconnectSelectedDailyNoteAction(input.getState());
    if (reconnectAction?.type === "save-visible") {
      await saveAndSyncSnapshot(reconnectAction.snapshot, { refreshRemoteBeforeSave: true });
    } else if (reconnectAction?.type === "load-selected") {
      await loadSelectedDate(reconnectAction.date);
      const loadedAction = reconnectSelectedDailyNoteAction(input.getState());
      if (loadedAction?.type === "save-visible") {
        await saveAndSyncSnapshot(loadedAction.snapshot, { refreshRemoteBeforeSave: true });
      }
    }
  };

  const applyLocalLoadResult = (
    result: LoadSelectedDailyNoteLocalSessionResult
  ): ReturnType<typeof selectedDailyNoteRemoteLoadAction> => {
    switch (result.type) {
      case "loaded":
        if (result.transition === null) return null;
        input.applyTransition(result.transition);
        input.setSyncStatus(result.session.status);
        if (result.session.status !== "conflict") input.setLastSyncError(null);
        return result.transition.state.loadedDate === null
          ? null
          : selectedDailyNoteRemoteLoadAction(result.transition.state.loadedDate, result.session);
      case "empty":
        return result.applyToSelectedDate ? selectedDailyNoteRemoteLoadAction(result.date, null) : null;
      case "failed":
        applyLoadFailure(result.date, result.error, result.applyToSelectedDate);
        return null;
    }
  };

  const applyLoadResult = (result: LoadSelectedDailyNoteSessionResult): void => {
    switch (result.type) {
      case "loaded":
        if (result.transition === null) return;
        input.applyTransition(result.transition);
        input.setSyncStatus(result.session.status);
        if (result.session.status !== "conflict") input.setLastSyncError(null);
        return;
      case "failed":
        applyLoadFailure(result.date, result.error, result.applyToSelectedDate);
        return;
    }
  };

  const applyRefreshResult = (result: RefreshCleanSelectedDailyNoteSessionResult): void => {
    switch (result.type) {
      case "skipped":
        return;
      case "refreshed":
        input.applyTransition(result.transition);
        input.setSyncStatus(result.session.status);
        if (result.session.status !== "conflict") input.setLastSyncError(null);
        return;
      case "failed":
        if (!result.applyToSelectedDate) return;
        if (
          result.phase === "load" &&
          input.handleRemoteError(result.error, {
            message: input.errorMessage(result.error),
            retry: "load-selected-note",
            date: result.date
          })
        ) return;
        input.setLastSyncError({
          message: input.errorMessage(result.error),
          retry: "load-selected-note",
          date: result.date
        });
        input.setSyncStatus("error");
        return;
    }
  };

  const applySaveResult = (result: SaveSelectedDailyNoteSnapshotResult): void => {
    switch (result.type) {
      case "auth-required":
        if (result.applyStatus !== null) input.setSyncStatus(result.applyStatus);
        return;
      case "saved":
        if (result.transition === null) return;
        input.applyTransition(result.transition);
        if (result.transition.state.loadedDate !== null) {
          input.markExistingNoteDate(result.transition.state.loadedDate);
        }
        input.setSyncStatus(result.session.status);
        input.setPendingSyncConflict(result.session.conflict ?? null);
        if (result.session.status !== "conflict") input.setLastSyncError(null);
        return;
      case "failed":
        if (!result.applyToVisibleDailyNote) return;
        if (input.handleRemoteError(result.error, {
          message: input.errorMessage(result.error),
          retry: "save-current-note",
          date: result.snapshot.date
        })) return;
        input.setLastSyncError({
          message: input.errorMessage(result.error),
          retry: "save-current-note",
          date: result.snapshot.date
        });
        input.setSyncStatus("error");
        return;
    }
  };

  const applyLoadFailure = (date: IsoDate, error: unknown, applyToSelectedDate: boolean): void => {
    if (!applyToSelectedDate) return;
    if (input.handleRemoteError(error, {
      message: input.errorMessage(error),
      retry: "load-selected-note",
      date
    })) return;

    const message = input.errorMessage(error);
    input.setLoadError(message);
    input.setLastSyncError({ message, retry: "load-selected-note", date });
    input.setSyncStatus("error");
  };

  return {
    cancelInFlightWork,
    loadSelectedDate,
    loadSelectedDateFromLocalDraft,
    refreshCleanSelectedDate,
    persistVisibleLocalDraft,
    saveAndSyncSnapshot,
    saveCurrentEditorSnapshot,
    saveBlurSnapshot,
    canSyncSelectedDateOnDemand,
    syncSelectedDateOnDemand,
    pollingMode,
    pollSelectedDate,
    applySaveResult,
    resolvePendingConflict,
    retryLastSyncError,
    reconnect
  };
}
