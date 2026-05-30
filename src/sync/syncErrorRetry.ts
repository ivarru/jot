import type { IsoDate } from "~/domain/dates";
import { canEditSelectedDate, shouldApplyLoadedNote, type DateBoundEditorState } from "~/editor/dateBoundEditor";

export type SyncErrorRetry = "load-selected-note" | "save-current-note" | "save-settings" | "sync-dirty-drafts";

export interface SyncErrorState {
  readonly message: string;
  readonly retry: SyncErrorRetry;
  readonly date?: IsoDate;
}

export type SyncRetryAction =
  | {
      readonly type: "load-selected-note";
      readonly date: IsoDate;
    }
  | {
      readonly type: "save-current-note";
      readonly date: IsoDate;
    }
  | {
      readonly type: "save-settings";
    }
  | {
      readonly type: "sync-dirty-drafts";
    };

export function resolveSyncErrorRetry(
  error: SyncErrorState,
  state: DateBoundEditorState
): SyncRetryAction | null {
  switch (error.retry) {
    case "load-selected-note": {
      const date = error.date ?? state.selectedDate;
      if (date === null || !shouldApplyLoadedNote(date, state.selectedDate)) return null;
      return { type: "load-selected-note", date };
    }
    case "save-current-note": {
      const date = error.date;
      if (date === undefined || !canEditSelectedDate(state) || state.selectedDate !== date) return null;
      return { type: "save-current-note", date };
    }
    case "save-settings":
      return { type: "save-settings" };
    case "sync-dirty-drafts":
      return { type: "sync-dirty-drafts" };
  }
}
