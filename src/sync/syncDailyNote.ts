import { mergeDailyNote } from "~/domain/merge";
import { createDraft } from "~/storage/localDraftStore";
import type { IsoDate } from "~/domain/dates";
import type { LocalDraftStore, RemoteStorageProvider, SyncStatus } from "~/storage/types";

export interface DailyNoteSession {
  readonly markdown: string;
  readonly status: SyncStatus;
}

export async function loadDailyNoteSession(
  date: IsoDate,
  drafts: LocalDraftStore,
  remote: RemoteStorageProvider
): Promise<DailyNoteSession> {
  const localDraft = await drafts.load(date);
  if (localDraft !== null) {
    return {
      markdown: localDraft.markdown,
      status: localDraft.dirty ? "saved-locally" : "synced"
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

  await drafts.save(createDraft(date, "", "", null, false));
  return {
    markdown: "",
    status: "local-only"
  };
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
  if (draft === null || !draft.dirty) {
    return {
      markdown: draft?.markdown ?? "",
      status: draft === null ? "local-only" : "synced"
    };
  }

  const result = await remote.saveDailyNote({
    date,
    markdown: draft.markdown,
    expectedRevisionId: draft.baselineRevisionId
  });

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
