import {
  applySyncResult,
  captureVisibleDailyNoteSnapshot,
  type DateBoundEditorState,
  type DateBoundEditorTransition,
  type VisibleDailyNoteSnapshot
} from "~/editor/dateBoundEditor";
import type { LocalDraftStore, RemoteStorageProvider, SyncStatus } from "~/storage/types";
import { persistLocalDraft, saveAndSyncDailyNoteSnapshot, type DailyNoteSession } from "./syncDailyNote";
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
