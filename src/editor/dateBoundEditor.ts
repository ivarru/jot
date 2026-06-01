import type { IsoDate } from "~/domain/dates";
import type { SyncStatus } from "~/storage/types";

export interface DateBoundEditorSelection {
  readonly selectedDate: IsoDate | null;
  readonly loadedDate: IsoDate | null;
}

export interface DateBoundEditorState extends DateBoundEditorSelection {
  readonly markdown: string;
  readonly cleanMarkdown: string | null;
  readonly editorChangeEpoch: number;
}

export interface VisibleDailyNoteSnapshot {
  readonly date: IsoDate;
  readonly markdown: string;
}

export interface CleanDailyNoteRefreshRequest {
  readonly date: IsoDate;
  readonly cleanMarkdown: string;
  readonly editorChangeEpoch: number;
  readonly markdown: string;
}

export type MarkdownWriteSource = "storage" | "editor";

export interface MarkdownWrite {
  readonly source: MarkdownWriteSource;
  readonly markdown: string;
}

export interface DateBoundEditorTransition {
  readonly state: DateBoundEditorState;
  readonly markdownWrite?: MarkdownWrite;
}

export type EditorChangeResult =
  | {
      readonly type: "current-editor";
      readonly state: DateBoundEditorState;
      readonly markdownWrite: MarkdownWrite;
    }
  | {
      readonly type: "stale-editor";
      readonly state: DateBoundEditorState;
      readonly backgroundSave: VisibleDailyNoteSnapshot;
    };

interface DailyNoteSessionResult {
  readonly markdown: string;
  readonly status: SyncStatus;
}

export function resetSelectedDailyNoteSession(
  state: DateBoundEditorState,
  date: IsoDate
): DateBoundEditorTransition {
  const next = {
    ...state,
    selectedDate: date,
    loadedDate: null,
    markdown: "",
    cleanMarkdown: null,
    editorChangeEpoch: 0
  };
  return {
    state: next,
    markdownWrite: {
      source: "storage",
      markdown: next.markdown
    }
  };
}

export function canEditSelectedDate(state: DateBoundEditorSelection): boolean {
  return state.selectedDate !== null && state.selectedDate === state.loadedDate;
}

export function canEditDailyNoteDate(date: IsoDate | null, state: DateBoundEditorSelection): date is IsoDate {
  return date !== null && state.selectedDate === date && state.loadedDate === date;
}

export function isSelectedDailyNoteDate(date: IsoDate, state: DateBoundEditorSelection): boolean {
  return date === state.selectedDate;
}

export function captureVisibleDailyNoteSnapshot(state: DateBoundEditorState): VisibleDailyNoteSnapshot | null {
  if (state.selectedDate === null || !canEditSelectedDate(state)) return null;
  return {
    date: state.selectedDate,
    markdown: state.markdown
  };
}

export function captureDocumentSnapshot(date: IsoDate, markdown: string): VisibleDailyNoteSnapshot {
  return {
    date,
    markdown
  };
}

export function applyLoadedDailyNoteResult(
  state: DateBoundEditorState,
  requestedDate: IsoDate,
  session: DailyNoteSessionResult
): DateBoundEditorTransition | null {
  if (requestedDate !== state.selectedDate) return null;

  const next = {
    ...state,
    loadedDate: requestedDate,
    markdown: session.markdown,
    cleanMarkdown: cleanMarkdownForStatus(session.markdown, session.status)
  };
  return {
    state: next,
    markdownWrite: {
      source: "storage",
      markdown: session.markdown
    }
  };
}

export function createCleanDailyNoteRefreshRequest(
  state: DateBoundEditorState,
  date: IsoDate
): CleanDailyNoteRefreshRequest | null {
  if (!canEditDailyNoteDate(date, state) || state.cleanMarkdown === null || state.markdown !== state.cleanMarkdown) {
    return null;
  }

  return {
    date,
    cleanMarkdown: state.cleanMarkdown,
    editorChangeEpoch: state.editorChangeEpoch,
    markdown: state.markdown
  };
}

export function applyCleanDailyNoteRefreshResult(
  state: DateBoundEditorState,
  request: CleanDailyNoteRefreshRequest,
  refresh: DailyNoteSessionResult
): DateBoundEditorTransition | null {
  if (
    !canEditDailyNoteDate(request.date, state) ||
    state.cleanMarkdown !== request.cleanMarkdown ||
    state.editorChangeEpoch !== request.editorChangeEpoch ||
    state.markdown !== request.markdown
  ) {
    return null;
  }

  const next = {
    ...state,
    markdown: refresh.markdown,
    cleanMarkdown: cleanMarkdownForStatus(refresh.markdown, refresh.status)
  };
  return {
    state: next,
    ...(refresh.markdown === state.markdown
      ? {}
      : {
          markdownWrite: {
            source: "storage" as const,
            markdown: refresh.markdown
          }
        })
  };
}

export function applySyncResult(
  state: DateBoundEditorState,
  snapshot: VisibleDailyNoteSnapshot,
  session: DailyNoteSessionResult
): DateBoundEditorTransition | null {
  if (!canEditDailyNoteDate(snapshot.date, state)) return null;

  const shouldApplyMarkdown = state.markdown === snapshot.markdown || session.status === "conflict";
  const nextMarkdown = shouldApplyMarkdown ? session.markdown : state.markdown;
  const next = {
    ...state,
    markdown: nextMarkdown,
    cleanMarkdown: cleanMarkdownForStatus(session.markdown, session.status)
  };

  return {
    state: next,
    ...(shouldApplyMarkdown
      ? {
          markdownWrite: {
            source: "storage" as const,
            markdown: session.markdown
          }
        }
      : {})
  };
}

export function applyEditorChange(
  state: DateBoundEditorState,
  documentDate: IsoDate,
  markdown: string
): EditorChangeResult {
  if (!canEditDailyNoteDate(documentDate, state)) {
    return {
      type: "stale-editor",
      state,
      backgroundSave: {
        date: documentDate,
        markdown
      }
    };
  }

  const next = {
    ...state,
    markdown,
    cleanMarkdown: null,
    editorChangeEpoch: state.editorChangeEpoch + 1
  };
  return {
    type: "current-editor",
    state: next,
    markdownWrite: {
      source: "editor",
      markdown
    }
  };
}

export function canApplyEditorAsyncResult(state: DateBoundEditorSelection, documentDate: IsoDate): boolean {
  return canEditDailyNoteDate(documentDate, state);
}

export function shouldApplyLoadedNote(requestedDate: IsoDate, selectedDate: IsoDate | null): boolean {
  return requestedDate === selectedDate;
}

export function editorChangeTarget(
  documentDate: IsoDate,
  state: DateBoundEditorSelection
): "current-editor" | "stale-editor" {
  return canEditDailyNoteDate(documentDate, state) ? "current-editor" : "stale-editor";
}

export function shouldApplySyncResult(syncDate: IsoDate, selectedDate: IsoDate | null): boolean {
  return syncDate === selectedDate;
}

export function shouldApplySyncMarkdownResult(input: {
  readonly syncDate: IsoDate;
  readonly selectedDate: IsoDate | null;
  readonly syncedMarkdown: string;
  readonly currentMarkdown: string;
}): boolean {
  return input.syncDate === input.selectedDate && input.syncedMarkdown === input.currentMarkdown;
}

export function shouldApplyEditorAsyncResult(documentDate: IsoDate, state: DateBoundEditorSelection): boolean {
  return canApplyEditorAsyncResult(state, documentDate);
}

export function shouldApplyCleanRemoteRefresh(input: {
  readonly refreshDate: IsoDate;
  readonly selectedDate: IsoDate | null;
  readonly loadedDate: IsoDate | null;
  readonly cleanMarkdown: string | null;
  readonly currentMarkdown: string;
}): boolean {
  return (
    input.refreshDate === input.selectedDate &&
    input.refreshDate === input.loadedDate &&
    input.cleanMarkdown !== null &&
    input.currentMarkdown === input.cleanMarkdown
  );
}

function cleanMarkdownForStatus(markdown: string, status: SyncStatus): string | null {
  return status === "local-only" || status === "synced" ? markdown : null;
}
