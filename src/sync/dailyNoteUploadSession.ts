import {
  dailyNoteUploadMarkdown,
  type DailyNoteUploadCandidate,
  type DailyNoteUploadConflictResolution,
  type DailyNoteUploadPlanItem,
  type PendingDailyNoteUpload
} from "~/domain/dailyNoteUpload";
import type { IsoDate } from "~/domain/dates";
import { captureVisibleDailyNoteSnapshot, type DateBoundEditorState } from "~/editor/dateBoundEditor";
import type { LocalDraftStore, RemoteStorageProvider } from "~/storage/types";
import {
  saveSelectedDailyNoteSnapshot,
  type SaveSelectedDailyNoteSnapshotResult
} from "./selectedDailyNoteSession";

export interface BuildDailyNoteUploadPlanInput {
  readonly candidates: readonly DailyNoteUploadCandidate[];
  readonly drafts: LocalDraftStore;
  readonly remote: RemoteStorageProvider;
  readonly getState: () => DateBoundEditorState;
}

export interface SaveDailyNoteUploadPlanInput {
  readonly pending: PendingDailyNoteUpload;
  readonly resolution: DailyNoteUploadConflictResolution;
  readonly authReconnectRequired: () => boolean;
  readonly drafts: LocalDraftStore;
  readonly remote: RemoteStorageProvider;
  readonly getState: () => DateBoundEditorState;
}

export type SaveDailyNoteUploadPlanResult =
  | {
      readonly type: "uploaded";
      readonly count: number;
      readonly saveResults: readonly SaveSelectedDailyNoteSnapshotResult[];
    }
  | {
      readonly type: "failed";
      readonly error: unknown;
      readonly saveResults: readonly SaveSelectedDailyNoteSnapshotResult[];
    };

export async function buildDailyNoteUploadPlan(
  input: BuildDailyNoteUploadPlanInput
): Promise<DailyNoteUploadPlanItem[]> {
  const items: DailyNoteUploadPlanItem[] = [];

  for (const candidate of input.candidates) {
    items.push({
      ...candidate,
      existingMarkdown: await existingDailyNoteMarkdown({
        date: candidate.date,
        drafts: input.drafts,
        remote: input.remote,
        getState: input.getState
      })
    });
  }

  return items;
}

export async function saveDailyNoteUploadPlan(
  input: SaveDailyNoteUploadPlanInput
): Promise<SaveDailyNoteUploadPlanResult> {
  const saveResults: SaveSelectedDailyNoteSnapshotResult[] = [];

  for (const item of input.pending.items) {
    const existingMarkdown = await existingDailyNoteMarkdown({
      date: item.date,
      drafts: input.drafts,
      remote: input.remote,
      getState: input.getState
    });
    const markdown = existingMarkdown === null
      ? item.uploadedMarkdown
      : dailyNoteUploadMarkdown({
          existingMarkdown,
          uploadedMarkdown: item.uploadedMarkdown,
          resolution: input.resolution
        });

    let result: SaveSelectedDailyNoteSnapshotResult;
    try {
      result = await saveSelectedDailyNoteSnapshot({
        snapshot: {
          date: item.date,
          markdown
        },
        authReconnectRequired: input.authReconnectRequired(),
        drafts: input.drafts,
        remote: input.remote,
        getState: input.getState
      });
    } catch (error: unknown) {
      return {
        type: "failed",
        error,
        saveResults
      };
    }

    saveResults.push(result);
    if (result.type === "failed") {
      return {
        type: "failed",
        error: result.error,
        saveResults
      };
    }
  }

  return {
    type: "uploaded",
    count: input.pending.items.length,
    saveResults
  };
}

async function existingDailyNoteMarkdown(input: {
  readonly date: IsoDate;
  readonly drafts: LocalDraftStore;
  readonly remote: RemoteStorageProvider;
  readonly getState: () => DateBoundEditorState;
}): Promise<string | null> {
  const visibleSnapshot = captureVisibleDailyNoteSnapshot(input.getState());
  if (visibleSnapshot?.date === input.date) return nonEmptyMarkdown(visibleSnapshot.markdown);

  const localDraft = await input.drafts.load(input.date);
  if (localDraft?.dirty) return nonEmptyMarkdown(localDraft.markdown);

  const remoteNote = await input.remote.loadDailyNote(input.date);
  if (remoteNote !== null) return nonEmptyMarkdown(remoteNote.markdown);

  if (localDraft !== null) return nonEmptyMarkdown(localDraft.markdown);
  return null;
}

function nonEmptyMarkdown(markdown: string): string | null {
  return markdown.length === 0 ? null : markdown;
}
