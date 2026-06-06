import { mergeDailyNote, type MergeResult } from "~/domain/merge";
import { createDraft } from "~/storage/localDraftStore";
import type { IsoDate } from "~/domain/dates";
import type { LocalDraft, LocalDraftStore, RemoteDailyNote, RemoteStorageProvider, SyncStatus } from "~/storage/types";

export interface DailyNoteSession {
  readonly markdown: string;
  readonly status: SyncStatus;
  readonly conflict?: DailyNoteSyncConflict;
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
  remote: RemoteStorageProvider
): Promise<DailyNoteSession> {
  const localDraft = await drafts.load(date);
  if (localDraft?.dirty) {
    return {
      markdown: localDraft.markdown,
      status: "saved-locally"
    };
  }

  const remoteNote = await remote.loadDailyNote(date);
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
      status: localDraft.baselineRevisionId === null ? "local-only" : "synced"
    };
  }

  await drafts.save(createDraft(date, "", "", null, false));
  return {
    markdown: "",
    status: "local-only"
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
      status: localDraft.baselineRevisionId === null ? "local-only" : "synced"
    };
  }

  return {
    markdown: "",
    baselineMarkdown: "",
    baselineRevisionId: null,
    status: "local-only"
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
  drafts: LocalDraftStore
): Promise<boolean> {
  const currentDraft = await drafts.load(date);
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
  drafts: LocalDraftStore
): Promise<SyncStatus> {
  const existing = await drafts.load(date);
  const baselineMarkdown = existing?.baselineMarkdown ?? "";
  const baselineRevisionId = existing?.baselineRevisionId ?? null;
  const dirty = markdown !== baselineMarkdown;

  await drafts.save(createDraft(date, markdown, baselineMarkdown, baselineRevisionId, dirty));

  if (dirty) return "saved-locally";
  return baselineRevisionId === null ? "local-only" : "synced";
}

export async function syncDailyNote(
  date: IsoDate,
  drafts: LocalDraftStore,
  remote: RemoteStorageProvider
): Promise<DailyNoteSession> {
  const draft = await drafts.load(date);
  if (draft === null) {
    return {
      markdown: "",
      status: "local-only"
    };
  }

  if (!draft.dirty) {
    return {
      markdown: draft.markdown,
      status: draft.baselineRevisionId === null ? "local-only" : "synced"
    };
  }

  const result = await remote.saveDailyNote({
    date,
    markdown: draft.markdown,
    expectedRevisionId: draft.baselineRevisionId
  });
  const currentDraft = await drafts.load(date);
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

  return await mergeRemoteConflict(date, draft, result.remote, drafts, null);
}

export async function saveAndSyncDailyNoteSnapshot(
  date: IsoDate,
  markdown: string,
  drafts: LocalDraftStore,
  remote: RemoteStorageProvider
): Promise<DailyNoteSession> {
  await persistLocalDraft(date, markdown, drafts);
  return await syncDailyNote(date, drafts, remote);
}

export async function rebaseAndSyncDailyNoteSnapshot(
  date: IsoDate,
  markdown: string,
  drafts: LocalDraftStore,
  remote: RemoteStorageProvider
): Promise<DailyNoteSession> {
  await persistLocalDraft(date, markdown, drafts);
  return await rebaseAndSyncDailyNote(date, drafts, remote);
}

export async function rebaseAndSyncDailyNote(
  date: IsoDate,
  drafts: LocalDraftStore,
  remote: RemoteStorageProvider
): Promise<DailyNoteSession> {
  const draft = await drafts.load(date);
  if (draft === null || !draft.dirty) return await loadDailyNoteSession(date, drafts, remote);

  const remoteNote = await remote.loadDailyNote(date);
  if (remoteNote === null || remoteNote.revisionId === draft.baselineRevisionId) {
    return await syncDailyNote(date, drafts, remote);
  }

  return await mergeRemoteConflict(date, draft, remoteNote, drafts, remote);
}

export async function syncDirtyDailyNoteDrafts(
  drafts: LocalDraftStore,
  remote: RemoteStorageProvider,
  skipDate: IsoDate | null = null
): Promise<DailyNoteSession[]> {
  const dirtyDrafts = await drafts.listDirty();
  const sessions: DailyNoteSession[] = [];

  for (const draft of dirtyDrafts) {
    if (draft.date === skipDate) continue;
    sessions.push(await syncDailyNote(draft.date, drafts, remote));
  }

  return sessions;
}

export async function resolveDailyNoteConflict(
  conflict: DailyNoteSyncConflict,
  resolution: DailyNoteConflictResolution,
  drafts: LocalDraftStore,
  remote: RemoteStorageProvider
): Promise<DailyNoteSession> {
  const markdown = conflictResolutionMarkdown(conflict, resolution);
  if (resolution === "manual") {
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
  await drafts.save(createDraft(
    conflict.date,
    markdown,
    conflict.remoteMarkdown,
    conflict.remoteRevisionId,
    dirty
  ));

  return dirty
    ? await syncDailyNote(conflict.date, drafts, remote)
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

function draftToSession(draft: LocalDraft): DailyNoteSession {
  return {
    markdown: draft.markdown,
    status: draft.dirty ? "saved-locally" : "synced"
  };
}

async function mergeRemoteConflict(
  date: IsoDate,
  draft: LocalDraft,
  remoteNote: RemoteDailyNote,
  drafts: LocalDraftStore,
  resolvedSyncRemote: RemoteStorageProvider | null
): Promise<DailyNoteSession> {
  const merged = mergeDailyNote({
    baseline: draft.baselineMarkdown,
    local: draft.markdown,
    remote: remoteNote.markdown
  });

  if (merged.unresolvedHunks.length === 0) {
    const dirty = merged.mergedMarkdown !== remoteNote.markdown;
    await drafts.save(createDraft(date, merged.mergedMarkdown, remoteNote.markdown, remoteNote.revisionId, dirty));
    if (!dirty) {
      return {
        markdown: merged.mergedMarkdown,
        status: "synced"
      };
    }
    if (resolvedSyncRemote !== null) return await syncDailyNote(date, drafts, resolvedSyncRemote);
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
