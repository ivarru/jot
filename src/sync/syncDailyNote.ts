import { mergeDailyNote, type MergeResult } from "~/domain/merge";
import { createDraft } from "~/storage/localDraftStore";
import type { IsoDate } from "~/domain/dates";
import type { LocalDraft, LocalDraftStore, RemoteDailyNote, RemoteStorageProvider, SyncStatus } from "~/storage/types";

export interface DailyNoteSession {
  readonly markdown: string;
  readonly status: SyncStatus;
  readonly conflict?: DailyNoteSyncConflict;
}

export interface DailyNoteSyncControl {
  readonly canContinue?: () => boolean;
}

export class CancelledDailyNoteSyncError extends Error {
  constructor() {
    super("Daily Note sync operation was cancelled.");
    this.name = "CancelledDailyNoteSyncError";
  }
}

export interface DailyNoteSyncConflict {
  readonly date: IsoDate;
  readonly localMarkdown: string;
  readonly remoteMarkdown: string;
  readonly baselineMarkdown: string;
  readonly baselineRevisionId: string | null;
  readonly remoteRevisionId: string;
  readonly merge: MergeResult;
}

export interface CleanDailyNoteRefresh {
  readonly markdown: string;
  readonly baselineMarkdown: string;
  readonly baselineRevisionId: string | null;
  readonly status: "local-only" | "synced";
}

export type DailyNoteConflictResolution =
  | "this-device"
  | "google-drive"
  | "this-device-unresolved"
  | "google-drive-unresolved"
  | "manual";

export async function loadDailyNoteSession(
  date: IsoDate,
  drafts: LocalDraftStore,
  remote: RemoteStorageProvider,
  control: DailyNoteSyncControl = {}
): Promise<DailyNoteSession> {
  const localDraft = await drafts.load(date);
  assertCanContinue(control);
  if (localDraft?.dirty) {
    return {
      markdown: localDraft.markdown,
      status: "saved-locally"
    };
  }

  const remoteNote = await remote.loadDailyNote(date);
  assertCanContinue(control);
  if (remoteNote !== null) {
    await drafts.save(createDraft(date, remoteNote.markdown, remoteNote.markdown, remoteNote.revisionId, false));
    return {
      markdown: remoteNote.markdown,
      status: "synced"
    };
  }

  if (localDraft !== null) {
    return {
      markdown: localDraft.markdown,
      status: cleanDraftStatus(localDraft.markdown, localDraft.baselineRevisionId)
    };
  }

  await drafts.save(createDraft(date, "", "", null, false));
  return {
    markdown: "",
    status: "synced"
  };
}

export async function loadLocalDailyNoteSession(
  date: IsoDate,
  drafts: LocalDraftStore
): Promise<DailyNoteSession | null> {
  const localDraft = await drafts.load(date);
  if (localDraft === null) return null;

  return draftToSession(localDraft);
}

export async function loadCleanDailyNoteRefresh(
  date: IsoDate,
  drafts: LocalDraftStore,
  remote: RemoteStorageProvider
): Promise<CleanDailyNoteRefresh | null> {
  const localDraft = await drafts.load(date);
  if (localDraft?.dirty) return null;

  const remoteNote = await remote.loadDailyNote(date);
  if (remoteNote !== null) {
    return {
      markdown: remoteNote.markdown,
      baselineMarkdown: remoteNote.markdown,
      baselineRevisionId: remoteNote.revisionId,
      status: "synced"
    };
  }

  if (localDraft !== null) {
    return {
      markdown: localDraft.markdown,
      baselineMarkdown: localDraft.baselineMarkdown,
      baselineRevisionId: localDraft.baselineRevisionId,
      status: cleanDraftStatus(localDraft.markdown, localDraft.baselineRevisionId)
    };
  }

  return {
    markdown: "",
    baselineMarkdown: "",
    baselineRevisionId: null,
    status: "synced"
  };
}

export function cleanDailyNoteRefreshToSession(refresh: CleanDailyNoteRefresh): DailyNoteSession {
  return {
    markdown: refresh.markdown,
    status: refresh.status
  };
}

export async function commitVisibleCleanDailyNoteRefresh(
  date: IsoDate,
  refresh: CleanDailyNoteRefresh,
  drafts: LocalDraftStore,
  control: DailyNoteSyncControl = {}
): Promise<boolean> {
  const currentDraft = await drafts.load(date);
  assertCanContinue(control);
  if (currentDraft?.dirty) return false;

  return await drafts.saveIfUnchanged(
    date,
    currentDraft,
    createDraft(date, refresh.markdown, refresh.baselineMarkdown, refresh.baselineRevisionId, false)
  );
}

export async function persistLocalDraft(
  date: IsoDate,
  markdown: string,
  drafts: LocalDraftStore,
  control: DailyNoteSyncControl = {}
): Promise<SyncStatus> {
  const existing = await drafts.load(date);
  assertCanContinue(control);
  const baselineMarkdown = existing?.baselineMarkdown ?? "";
  const baselineRevisionId = existing?.baselineRevisionId ?? null;
  const dirty = markdown !== baselineMarkdown;

  await drafts.save(createDraft(date, markdown, baselineMarkdown, baselineRevisionId, dirty));

  if (dirty) return "saved-locally";
  return cleanDraftStatus(markdown, baselineRevisionId);
}

export async function syncDailyNote(
  date: IsoDate,
  drafts: LocalDraftStore,
  remote: RemoteStorageProvider,
  control: DailyNoteSyncControl = {}
): Promise<DailyNoteSession> {
  const draft = await drafts.load(date);
  assertCanContinue(control);
  if (draft === null) {
    return {
      markdown: "",
      status: "synced"
    };
  }

  if (!draft.dirty) {
    return {
      markdown: draft.markdown,
      status: cleanDraftStatus(draft.markdown, draft.baselineRevisionId)
    };
  }

  const result = await remote.saveDailyNote({
    date,
    markdown: draft.markdown,
    expectedRevisionId: draft.baselineRevisionId
  });
  assertCanContinue(control);
  const currentDraft = await drafts.load(date);
  assertCanContinue(control);
  if (draftChangedSinceSyncStarted(draft, currentDraft)) {
    if (result.type === "saved" && currentDraftStartedFromSameBaseline(draft, currentDraft)) {
      const dirty = currentDraft.markdown !== result.note.markdown;
      await drafts.save(createDraft(date, currentDraft.markdown, result.note.markdown, result.note.revisionId, dirty));
      return {
        markdown: currentDraft.markdown,
        status: dirty ? "saved-locally" : "synced"
      };
    }

    return draftToSession(currentDraft);
  }

  if (result.type === "saved") {
    await drafts.save(createDraft(date, result.note.markdown, result.note.markdown, result.note.revisionId, false));
    return {
      markdown: result.note.markdown,
      status: "synced"
    };
  }

  return await mergeRemoteConflict(date, draft, result.remote, drafts, null, control);
}

export async function saveAndSyncDailyNoteSnapshot(
  date: IsoDate,
  markdown: string,
  drafts: LocalDraftStore,
  remote: RemoteStorageProvider,
  control: DailyNoteSyncControl = {}
): Promise<DailyNoteSession> {
  await persistLocalDraft(date, markdown, drafts, control);
  assertCanContinue(control);
  return await syncDailyNote(date, drafts, remote, control);
}

export async function rebaseAndSyncDailyNoteSnapshot(
  date: IsoDate,
  markdown: string,
  drafts: LocalDraftStore,
  remote: RemoteStorageProvider,
  control: DailyNoteSyncControl = {}
): Promise<DailyNoteSession> {
  await persistLocalDraft(date, markdown, drafts, control);
  assertCanContinue(control);
  return await rebaseAndSyncDailyNote(date, drafts, remote, control);
}

export async function rebaseAndSyncDailyNote(
  date: IsoDate,
  drafts: LocalDraftStore,
  remote: RemoteStorageProvider,
  control: DailyNoteSyncControl = {}
): Promise<DailyNoteSession> {
  const draft = await drafts.load(date);
  assertCanContinue(control);
  if (draft === null || !draft.dirty) return await loadDailyNoteSession(date, drafts, remote, control);

  const remoteNote = await remote.loadDailyNote(date);
  assertCanContinue(control);
  if (remoteNote === null || remoteNote.revisionId === draft.baselineRevisionId) {
    return await syncDailyNote(date, drafts, remote, control);
  }

  return await mergeRemoteConflict(date, draft, remoteNote, drafts, remote, control);
}

export async function syncDirtyDailyNoteDrafts(
  drafts: LocalDraftStore,
  remote: RemoteStorageProvider,
  skipDate: IsoDate | null = null,
  control: DailyNoteSyncControl = {}
): Promise<DailyNoteSession[]> {
  const dirtyDrafts = await drafts.listDirty();
  const sessions: DailyNoteSession[] = [];

  for (const draft of dirtyDrafts) {
    if (draft.date === skipDate) continue;
    sessions.push(await syncDailyNote(draft.date, drafts, remote, control));
  }

  return sessions;
}

export async function resolveDailyNoteConflict(
  conflict: DailyNoteSyncConflict,
  resolution: DailyNoteConflictResolution,
  drafts: LocalDraftStore,
  remote: RemoteStorageProvider,
  control: DailyNoteSyncControl = {}
): Promise<DailyNoteSession> {
  const markdown = conflictResolutionMarkdown(conflict, resolution);
  if (resolution === "manual") {
    assertCanContinue(control);
    await drafts.save(createDraft(
      conflict.date,
      markdown,
      conflict.remoteMarkdown,
      conflict.remoteRevisionId,
      true
    ));
    return {
      markdown,
      status: "conflict"
    };
  }

  const dirty = markdown !== conflict.remoteMarkdown;
  assertCanContinue(control);
  await drafts.save(createDraft(
    conflict.date,
    markdown,
    conflict.remoteMarkdown,
    conflict.remoteRevisionId,
    dirty
  ));

  return dirty
    ? await syncDailyNote(conflict.date, drafts, remote, control)
    : {
        markdown,
        status: "synced"
      };
}

function draftChangedSinceSyncStarted(startedWith: LocalDraft, current: LocalDraft | null): current is LocalDraft {
  return (
    current !== null &&
    (
      current.markdown !== startedWith.markdown ||
      current.baselineMarkdown !== startedWith.baselineMarkdown ||
      current.baselineRevisionId !== startedWith.baselineRevisionId ||
      current.dirty !== startedWith.dirty
    )
  );
}

function currentDraftStartedFromSameBaseline(startedWith: LocalDraft, current: LocalDraft | null): current is LocalDraft {
  return (
    current !== null &&
    current.baselineMarkdown === startedWith.baselineMarkdown &&
    current.baselineRevisionId === startedWith.baselineRevisionId
  );
}

function cleanDraftStatus(markdown: string, baselineRevisionId: string | null): "local-only" | "synced" {
  if (baselineRevisionId !== null) return "synced";
  return markdown.length === 0 ? "synced" : "local-only";
}

function draftToSession(draft: LocalDraft): DailyNoteSession {
  return {
    markdown: draft.markdown,
    status: draft.dirty ? "saved-locally" : cleanDraftStatus(draft.markdown, draft.baselineRevisionId)
  };
}

async function mergeRemoteConflict(
  date: IsoDate,
  draft: LocalDraft,
  remoteNote: RemoteDailyNote,
  drafts: LocalDraftStore,
  resolvedSyncRemote: RemoteStorageProvider | null,
  control: DailyNoteSyncControl = {}
): Promise<DailyNoteSession> {
  const merged = mergeDailyNote({
    baseline: draft.baselineMarkdown,
    local: draft.markdown,
    remote: remoteNote.markdown
  });

  if (merged.unresolvedHunks.length === 0) {
    const dirty = merged.mergedMarkdown !== remoteNote.markdown;
    assertCanContinue(control);
    await drafts.save(createDraft(date, merged.mergedMarkdown, remoteNote.markdown, remoteNote.revisionId, dirty));
    if (!dirty) {
      return {
        markdown: merged.mergedMarkdown,
        status: "synced"
      };
    }
    if (resolvedSyncRemote !== null) return await syncDailyNote(date, drafts, resolvedSyncRemote, control);
    return {
      markdown: merged.mergedMarkdown,
      status: "saved-locally"
    };
  }

  return {
    markdown: draft.markdown,
    status: "conflict",
    conflict: {
      date,
      localMarkdown: draft.markdown,
      remoteMarkdown: remoteNote.markdown,
      baselineMarkdown: draft.baselineMarkdown,
      baselineRevisionId: draft.baselineRevisionId,
      remoteRevisionId: remoteNote.revisionId,
      merge: merged
    }
  };
}

export function isCancelledDailyNoteSyncError(error: unknown): boolean {
  return error instanceof CancelledDailyNoteSyncError;
}

function assertCanContinue(control: DailyNoteSyncControl): void {
  if (control.canContinue?.() === false) throw new CancelledDailyNoteSyncError();
}

function conflictResolutionMarkdown(
  conflict: DailyNoteSyncConflict,
  resolution: DailyNoteConflictResolution
): string {
  switch (resolution) {
    case "this-device":
      return conflict.merge.choices.thisDevice;
    case "google-drive":
      return conflict.merge.choices.googleDrive;
    case "this-device-unresolved":
      return conflict.merge.choices.thisDeviceForUnresolved ?? conflict.merge.choices.thisDevice;
    case "google-drive-unresolved":
      return conflict.merge.choices.googleDriveForUnresolved ?? conflict.merge.choices.googleDrive;
    case "manual":
      return conflict.merge.manualConflictMarkdown;
  }
}
