import type { IsoDate } from "~/domain/dates";
import { DEFAULT_JOT_SETTINGS, type JotSettings, normalizeJotSettings } from "~/domain/settings";
import { withStore } from "./indexedDb";
import type { RemoteDailyNote, RemoteStorageProvider, SaveDailyNoteInput, SaveDailyNoteResult } from "./types";

interface StoredSettings {
  readonly id: "jot-settings";
  readonly value: JotSettings;
}

export class FakeRemoteStorageProvider implements RemoteStorageProvider {
  async loadDailyNote(date: IsoDate): Promise<RemoteDailyNote | null> {
    return (await withStore<RemoteDailyNote | undefined>("fakeRemoteNotes", "readonly", (store) => store.get(date))) ?? null;
  }

  async saveDailyNote(input: SaveDailyNoteInput): Promise<SaveDailyNoteResult> {
    const existing = await this.loadDailyNote(input.date);

    if (existing !== null && input.expectedRevisionId !== existing.revisionId) {
      return {
        type: "conflict",
        remote: existing
      };
    }

    const note: RemoteDailyNote = {
      date: input.date,
      markdown: input.markdown,
      revisionId: crypto.randomUUID(),
      updatedAt: new Date().toISOString()
    };

    await withStore<IDBValidKey>("fakeRemoteNotes", "readwrite", (store) => store.put(note));

    return {
      type: "saved",
      note
    };
  }

  async loadSettings(): Promise<JotSettings | null> {
    const stored = await withStore<StoredSettings | undefined>("settings", "readonly", (store) =>
      store.get("jot-settings")
    );

    return stored ? normalizeJotSettings(stored.value) : null;
  }

  async saveSettings(settings: JotSettings): Promise<JotSettings> {
    const normalized = normalizeJotSettings(settings);
    await withStore<IDBValidKey>("settings", "readwrite", (store) =>
      store.put({ id: "jot-settings", value: normalized } satisfies StoredSettings)
    );
    return normalized;
  }
}

export async function loadSettingsOrDefault(provider: RemoteStorageProvider): Promise<JotSettings> {
  return (await provider.loadSettings()) ?? DEFAULT_JOT_SETTINGS;
}
