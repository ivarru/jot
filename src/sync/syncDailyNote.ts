import { mergeDailyNote } from "~/domain/merge";
import { createDraft } from "~/storage/localDraftStore";
import type { IsoDate } from "~/domain/dates";
import type { LocalDraft, LocalDraftStore, RemoteStorageProvider, SyncStatus } from "~/storage/types";

export interface DailyNoteSession {
  readonly markdown: string;
  readonly status: SyncStatus;
}

export interface CleanDailyNoteRefresh {
  readonly markdown: string;
  readonly baselineMarkdown: string;
  readonly baselineRevisionId: string | null;
  readonly status: "local-only" | "synced";
}

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

  const merged = mergeDailyNote({
    baseline: draft.baselineMarkdown,
    local: draft.markdown,
    remote: result.remote.markdown
  });

  await drafts.save(createDraft(date, merged.merged, result.remote.markdown, result.remote.revisionId, true));
  return {
    markdown: merged.merged,
    status: merged.conflicted ? "conflict" : "saved-locally"
  };
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
