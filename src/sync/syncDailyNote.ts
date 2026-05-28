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
  const [localDraft, remoteNote] = await Promise.all([drafts.load(date), remote.loadDailyNote(date)]);

  if (localDraft !== null) {
    return {
      markdown: localDraft.markdown,
      status: localDraft.dirty ? "saved-locally" : "synced"
    };
  }

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
  await drafts.save(
    createDraft(date, markdown, existing?.baselineMarkdown ?? "", existing?.baselineRevisionId ?? null, true)
  );
  return "saved-locally";
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
