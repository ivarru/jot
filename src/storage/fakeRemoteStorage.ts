import { buildTagIndexFiles } from "~/domain/tagIndex";
import { dailyNoteSearchTerms, inDailyNoteSearchRange, validateDailyNoteSearch, type DailyNoteSearch, type DailyNoteSearchResult } from "~/domain/dailyNoteSearch";
import type { IsoDate } from "~/domain/dates";
import { hasDailyNoteContent } from "~/domain/dailyNoteMarkdown";
import { type ImageAttachmentMetadata, type JotImageAlbumMetadata } from "~/domain/imageAttachments";
import { DEFAULT_JOT_SETTINGS, type JotSettings, normalizeJotSettings } from "~/domain/settings";
import { withStore } from "./indexedDb";
import type { RemoteDailyNote, RemoteStorageProvider, SaveDailyNoteInput, SaveDailyNoteResult } from "./types";

interface StoredSettings {
  readonly id: "jot-settings";
  readonly value: JotSettings;
}

interface StoredJotImageAlbum {
  readonly id: "jot-image-album";
  readonly value: JotImageAlbumMetadata;
}

export class FakeRemoteStorageProvider implements RemoteStorageProvider {
  async maintainTagIndex(signal: AbortSignal): Promise<void> {
    assertFakeRemoteAvailable();
    const settings = normalizeJotSettings(await this.loadSettings());
    signal.throwIfAborted();
    // Fake-provider derived files live in the existing settings store; Daily Notes remain separate.
    const notes = await withStore<RemoteDailyNote[]>("fakeRemoteNotes", "readonly", (store) => store.getAll());
    const files = buildTagIndexFiles(notes, settings.tagIndexMaxCharacters);
    signal.throwIfAborted();
    await withStore<IDBValidKey>("settings", "readwrite", (store) => store.put({
      id: "fake-tag-index", files: Object.fromEntries([...files].map(([tag, markdown]) => [`${tag}.md`, markdown]))
    }));
  }

  async loadDailyNote(date: IsoDate): Promise<RemoteDailyNote | null> {
    assertFakeRemoteAvailable();
    return (await withStore<RemoteDailyNote | undefined>("fakeRemoteNotes", "readonly", (store) => store.get(date))) ?? null;
  }

  async loadDailyNoteSearchPreview(result: DailyNoteSearchResult): Promise<string> {
    const note = await this.loadDailyNote(result.date);
    if (!note) throw new Error("This note is no longer available. Search again to refresh the results.");
    return note.markdown;
  }

  async searchDailyNotes(input: DailyNoteSearch): Promise<DailyNoteSearchResult[]> {
    validateDailyNoteSearch(input);
    assertFakeRemoteAvailable();
    const notes = await withStore<RemoteDailyNote[]>("fakeRemoteNotes", "readonly", (store) => store.getAll());
    const terms = dailyNoteSearchTerms(input.query);
    return notes.filter((note) => hasDailyNoteContent(note.markdown) && inDailyNoteSearchRange(note.date, input, note.updatedAt)
      && terms.every((term) => {
        const words = note.markdown.toLocaleLowerCase().match(/[\p{L}\p{N}_]+/gu) ?? [];
        const sought = term.toLocaleLowerCase().match(/[\p{L}\p{N}_]+/gu) ?? [];
        return sought.length > 0 && words.some((_, index) => sought.every((word, offset) => words[index + offset] === word));
      })).map((note) => ({ date: note.date, fileId: note.date, modifiedTime: Number.isFinite(Date.parse(note.updatedAt)) ? new Date(note.updatedAt).toISOString() : null,
        sizeBytes: String(new TextEncoder().encode(note.markdown).byteLength) }))
      .sort((a, b) => b.date.localeCompare(a.date));
  }

  async listDailyNoteDates(): Promise<IsoDate[]> {
    assertFakeRemoteAvailable();
    const notes = await withStore<RemoteDailyNote[]>("fakeRemoteNotes", "readonly", (store) => store.getAll());
    return notes.filter((note) => hasDailyNoteContent(note.markdown)).map((note) => note.date).sort();
  }

  async saveDailyNote(input: SaveDailyNoteInput): Promise<SaveDailyNoteResult> {
    assertFakeRemoteAvailable();
    return await withStore<SaveDailyNoteResult>("fakeRemoteNotes", "readwrite", async (store) => {
      const existing = (await waitForRequest<RemoteDailyNote | undefined>(store.get(input.date))) ?? null;

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

      await waitForRequest(store.put(note));
      return {
        type: "saved",
        note
      };
    });
  }

  async loadSettings(): Promise<JotSettings | null> {
    const stored = await withStore<StoredSettings | undefined>("settings", "readonly", (store) =>
      store.get("jot-settings")
    );

    const profile = typeof window === "undefined" ? null : window.localStorage.getItem("jot.fakeNormalizationProfile");
    if (profile === "enabled" || profile === "disabled") {
      return normalizeJotSettings({
        ...(stored?.value ?? DEFAULT_JOT_SETTINGS),
        normalizeEmptyEditorPlaceholders: profile === "enabled"
      });
    }
    return stored ? normalizeJotSettings(stored.value) : null;
  }

  async saveSettings(settings: JotSettings): Promise<JotSettings> {
    const normalized = normalizeJotSettings(settings);
    await withStore<IDBValidKey>("settings", "readwrite", (store) =>
      store.put({ id: "jot-settings", value: normalized } satisfies StoredSettings)
    );
    return normalized;
  }

  async loadJotImageAlbum(): Promise<JotImageAlbumMetadata | null> {
    const stored = await withStore<StoredJotImageAlbum | undefined>("fakeImageAlbum", "readonly", (store) =>
      store.get("jot-image-album")
    );

    return stored?.value ?? null;
  }

  async saveJotImageAlbum(metadata: JotImageAlbumMetadata): Promise<void> {
    await withStore<IDBValidKey>("fakeImageAlbum", "readwrite", (store) =>
      store.put({ id: "jot-image-album", value: metadata } satisfies StoredJotImageAlbum)
    );
  }

  async loadImageAttachmentMetadata(id: string): Promise<ImageAttachmentMetadata | null> {
    return (
      (await withStore<ImageAttachmentMetadata | undefined>("fakeImageAttachmentMetadata", "readonly", (store) =>
        store.get(id)
      )) ?? null
    );
  }

  async findImageAttachmentMetadataByCopiedMediaItemId(mediaItemId: string): Promise<ImageAttachmentMetadata | null> {
    return await this.findImageAttachmentMetadataByMediaItemIdField("copy", mediaItemId);
  }

  async findImageAttachmentMetadataByMediaItemId(mediaItemId: string): Promise<ImageAttachmentMetadata | null> {
    return (
      await this.findImageAttachmentMetadataByMediaItemIdField("source", mediaItemId) ??
      await this.findImageAttachmentMetadataByMediaItemIdField("copy", mediaItemId)
    );
  }

  async saveImageAttachmentMetadata(metadata: ImageAttachmentMetadata): Promise<void> {
    await withStore<IDBValidKey>("fakeImageAttachmentMetadata", "readwrite", (store) => store.put(metadata));
  }

  private async findImageAttachmentMetadataByMediaItemIdField(
    field: "source" | "copy",
    mediaItemId: string
  ): Promise<ImageAttachmentMetadata | null> {
    const metadata = await withStore<ImageAttachmentMetadata[]>("fakeImageAttachmentMetadata", "readonly", (store) =>
      store.getAll()
    );
    return metadata.find((item) => imageAttachmentMediaItemId(item, field) === mediaItemId) ?? null;
  }
}

function assertFakeRemoteAvailable(): void {
  if (typeof window !== "undefined" && window.localStorage.getItem("jot.fakeRemoteUnavailable") === "true") {
    throw new Error("Fake remote storage is unavailable.");
  }
}

function waitForRequest<T>(request: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

function imageAttachmentMediaItemId(metadata: ImageAttachmentMetadata, field: "source" | "copy"): string | undefined {
  if (field === "copy") return metadata.copy.mediaItemId;
  return metadata.source.kind === "google-photos-picker" ? metadata.source.mediaItemId : undefined;
}

export async function loadSettingsOrDefault(provider: RemoteStorageProvider): Promise<JotSettings> {
  return (await provider.loadSettings()) ?? DEFAULT_JOT_SETTINGS;
}
