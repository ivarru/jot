import type { IsoDate } from "~/domain/dates";
import type { JotSettings } from "~/domain/settings";

export type SyncStatus =
  | "local-only"
  | "saved-locally"
  | "syncing"
  | "synced"
  | "offline"
  | "auth-required"
  | "conflict"
  | "error";

export interface RemoteDailyNote {
  readonly date: IsoDate;
  readonly markdown: string;
  readonly revisionId: string;
  readonly updatedAt: string;
}

export interface SaveDailyNoteInput {
  readonly date: IsoDate;
  readonly markdown: string;
  readonly expectedRevisionId: string | null;
}

export type SaveDailyNoteResult =
  | {
      readonly type: "saved";
      readonly note: RemoteDailyNote;
    }
  | {
      readonly type: "conflict";
      readonly remote: RemoteDailyNote;
    };

export interface RemoteStorageProvider {
  loadDailyNote(date: IsoDate): Promise<RemoteDailyNote | null>;
  listDailyNoteDates?(): Promise<IsoDate[]>;
  saveDailyNote(input: SaveDailyNoteInput): Promise<SaveDailyNoteResult>;
  loadSettings(): Promise<JotSettings | null>;
  saveSettings(settings: JotSettings): Promise<JotSettings>;
}

export interface LocalDraft {
  readonly date: IsoDate;
  readonly markdown: string;
  readonly baselineMarkdown: string;
  readonly baselineRevisionId: string | null;
  readonly dirty: boolean;
  readonly updatedAt: string;
}

export interface LocalDraftStore {
  load(date: IsoDate): Promise<LocalDraft | null>;
  listExistingDailyNoteDates?(): Promise<IsoDate[]>;
  listDirty(): Promise<LocalDraft[]>;
  save(draft: LocalDraft): Promise<void>;
  saveIfUnchanged(date: IsoDate, expected: LocalDraft | null, draft: LocalDraft): Promise<boolean>;
  remove(date: IsoDate): Promise<void>;
  clearAll(): Promise<void>;
}
