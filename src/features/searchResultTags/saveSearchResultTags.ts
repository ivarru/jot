import type { IsoDate } from "~/domain/dates";
import type { LocalDraftStore, RemoteStorageProvider } from "~/storage/types";
import { createDraft } from "~/storage/localDraftStore";
import { syncDailyNote } from "~/sync/dailyNoteReplication";
import { containsDailyNoteConflictMarkers } from "~/domain/merge";

/** Caller holds editing ownership. All asynchronous work stays bound to this explicit date and source. */
export async function saveSearchResultTags(date: IsoDate, source: string, updated: string,
  drafts: LocalDraftStore, remote: RemoteStorageProvider, canContinue: () => boolean): Promise<void> {
  const assertCurrent = () => { if (!canContinue()) throw new Error("The note or connection changed. Refresh the passage."); };
  assertCurrent();
  if (containsDailyNoteConflictMarkers(source)) throw new Error("Resolve this note's conflict before adding tags.");
  const draft = await drafts.load(date);
  assertCurrent();
  const note = await remote.loadDailyNote(date);
  assertCurrent();
  if (!note || note.markdown !== source || (draft !== null && draft.markdown !== source)) {
    throw new Error("The note changed. Refresh the passage before adding tags.");
  }
  if (source === updated) return;
  const saved = await drafts.saveIfUnchanged(date, draft, createDraft(date, updated, note.markdown, note.revisionId, true));
  assertCurrent();
  if (!saved) throw new Error("The local draft changed. Refresh the passage before adding tags.");
  const session = await syncDailyNote(date, drafts, remote, { canContinue });
  if (session.status !== "synced") throw new Error("Tags are saved locally. Open this note to check its sync status before retrying.");
}
