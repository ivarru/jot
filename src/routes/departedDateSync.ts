import type { IsoDate } from "~/domain/dates";
import { CancelledDailyNoteSyncError, syncDailyNote, type DailyNoteSyncControl } from "~/sync/dailyNoteReplication";
import type { LocalDraft, LocalDraftStore, RemoteStorageProvider } from "~/storage/types";
import { withUnownedDailyNoteAccess } from "./sharedTabOwnership";

/** Sync a departed date without retaining its editing lock across remote I/O. */
export async function syncDepartedDate(
  date: IsoDate,
  drafts: LocalDraftStore,
  remote: RemoteStorageProvider,
  control: DailyNoteSyncControl = {}
): Promise<void> {
  let observedDraft: LocalDraft | null | undefined;
  const guardedDrafts: LocalDraftStore = {
    load: async (requestedDate) => {
      assertDate(date, requestedDate);
      return await withUnownedDailyNoteAccess(date, async () => {
        observedDraft = await drafts.load(date);
        return observedDraft;
      });
    },
    save: async (draft) => {
      assertDate(date, draft.date);
      await withUnownedDailyNoteAccess(date, async () => {
        if (observedDraft === undefined || !await drafts.saveIfUnchanged(date, observedDraft, draft)) {
          throw new CancelledDailyNoteSyncError();
        }
        observedDraft = draft;
      });
    },
    saveIfUnchanged: async (requestedDate, expected, draft) => {
      assertDate(date, requestedDate);
      assertDate(date, draft.date);
      return await withUnownedDailyNoteAccess(date, async () => {
        const saved = await drafts.saveIfUnchanged(date, expected, draft);
        if (saved) observedDraft = draft;
        return saved;
      });
    },
    listDirty: async () => { throw new CancelledDailyNoteSyncError(); },
    remove: async () => { throw new CancelledDailyNoteSyncError(); },
    clearAll: async () => { throw new CancelledDailyNoteSyncError(); }
  };
  const guardedRemote: RemoteStorageProvider = {
    loadDailyNote: async (requestedDate) => {
      assertDate(date, requestedDate);
      const { pending } = await withUnownedDailyNoteAccess(date, async () => ({
        pending: remote.loadDailyNote(date)
      }));
      return await pending;
    },
    saveDailyNote: async (input) => {
      assertDate(date, input.date);
      const { pending } = await withUnownedDailyNoteAccess(date, async () => ({
        pending: remote.saveDailyNote(input)
      }));
      return await pending;
    },
    loadSettings: () => remote.loadSettings(),
    saveSettings: (settings) => remote.saveSettings(settings)
  };
  await syncDailyNote(date, guardedDrafts, guardedRemote, control);
}

function assertDate(expected: IsoDate, actual: IsoDate): void {
  if (actual !== expected) throw new CancelledDailyNoteSyncError();
}
