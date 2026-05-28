import type { IsoDate } from "~/domain/dates";

export interface DateBoundEditorState {
  readonly selectedDate: IsoDate | null;
  readonly loadedDate: IsoDate | null;
}

export function canEditSelectedDate(state: DateBoundEditorState): boolean {
  return state.selectedDate !== null && state.selectedDate === state.loadedDate;
}

export function shouldApplyLoadedNote(requestedDate: IsoDate, selectedDate: IsoDate | null): boolean {
  return requestedDate === selectedDate;
}

export function editorChangeTarget(
  documentDate: IsoDate,
  state: DateBoundEditorState
): "current-editor" | "stale-editor" {
  return state.selectedDate === documentDate && state.loadedDate === documentDate ? "current-editor" : "stale-editor";
}

export function shouldApplySyncResult(syncDate: IsoDate, selectedDate: IsoDate | null): boolean {
  return syncDate === selectedDate;
}
