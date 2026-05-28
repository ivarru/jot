import type { ImageAttachmentResolution } from "~/domain/imageAttachments";
import { withStore } from "~/storage/indexedDb";
import type {
  GooglePhotosAlbum,
  GooglePhotosMediaItem,
  GooglePhotosPickingSession,
  PickedGooglePhotosMediaItem
} from "./googlePhotosAttachments";

const FAKE_JOT_ALBUM_ID = "fake-jot-album";

interface StoredFakePhotoMediaItem {
  readonly id: string;
  readonly blob: Blob;
  readonly filename: string;
  readonly mimeType: string;
  readonly width?: number;
  readonly height?: number;
  readonly createTime: string;
}

export class FakePhotosAttachmentProvider {
  async createPickingSession(): Promise<GooglePhotosPickingSession> {
    return {
      id: crypto.randomUUID(),
      mediaItemsSet: false
    };
  }

  async getPickingSession(sessionId: string): Promise<GooglePhotosPickingSession> {
    return {
      id: sessionId,
      mediaItemsSet: false
    };
  }

  async listPickedMediaItems(): Promise<PickedGooglePhotosMediaItem[]> {
    return [];
  }

  async pickImageFile(file: File): Promise<PickedGooglePhotosMediaItem> {
    if (!file.type.startsWith("image/")) {
      throw new Error("Jot can only attach image files.");
    }

    const id = `fake-source-${await hashBlob(file)}`;
    const dimensions = await readImageDimensions(file);
    const stored: StoredFakePhotoMediaItem = {
      id,
      blob: file,
      filename: file.name || "image",
      mimeType: file.type || "application/octet-stream",
      ...defined("width", dimensions.width),
      ...defined("height", dimensions.height),
      createTime: new Date(file.lastModified || Date.now()).toISOString()
    };
    await saveFakePhotoMediaItem(stored);

    return storedToPickedMediaItem(stored);
  }

  async downloadPickedImage(
    item: PickedGooglePhotosMediaItem,
    _resolution: ImageAttachmentResolution
  ): Promise<Blob> {
    const stored = await loadFakePhotoMediaItem(item.id);
    if (stored === null) {
      throw new Error("The selected fake image is no longer available.");
    }
    return stored.blob;
  }

  async createAlbum(title: string): Promise<GooglePhotosAlbum> {
    return {
      id: FAKE_JOT_ALBUM_ID,
      title
    };
  }

  async uploadImageToAlbum(input: {
    readonly albumId: string;
    readonly filename: string;
    readonly mimeType: string;
    readonly bytes: Blob;
  }): Promise<GooglePhotosMediaItem> {
    if (input.albumId !== FAKE_JOT_ALBUM_ID) {
      throw new Error("Unknown fake image album.");
    }

    const id = `fake-copy-${crypto.randomUUID()}`;
    const dimensions = await readImageDimensions(input.bytes);
    const stored: StoredFakePhotoMediaItem = {
      id,
      blob: input.bytes,
      filename: input.filename,
      mimeType: input.mimeType || input.bytes.type || "application/octet-stream",
      ...defined("width", dimensions.width),
      ...defined("height", dimensions.height),
      createTime: new Date().toISOString()
    };
    await saveFakePhotoMediaItem(stored);

    return await storedToMediaItem(stored);
  }

  async getMediaItem(mediaItemId: string): Promise<GooglePhotosMediaItem> {
    const stored = await loadFakePhotoMediaItem(mediaItemId);
    if (stored === null) {
      throw new Error("The fake image is no longer available.");
    }

    return await storedToMediaItem(stored);
  }
}

async function loadFakePhotoMediaItem(id: string): Promise<StoredFakePhotoMediaItem | null> {
  return (
    (await withStore<StoredFakePhotoMediaItem | undefined>("fakePhotoMediaItems", "readonly", (store) =>
      store.get(id)
    )) ?? null
  );
}

async function saveFakePhotoMediaItem(item: StoredFakePhotoMediaItem): Promise<void> {
  await withStore<IDBValidKey>("fakePhotoMediaItems", "readwrite", (store) => store.put(item));
}

function storedToPickedMediaItem(stored: StoredFakePhotoMediaItem): PickedGooglePhotosMediaItem {
  return {
    id: stored.id,
    createTime: stored.createTime,
    type: "PHOTO",
    mediaFile: {
      baseUrl: `fake:${stored.id}`,
      mimeType: stored.mimeType,
      filename: stored.filename,
      mediaFileMetadata: {
        ...defined("width", stored.width),
        ...defined("height", stored.height)
      }
    }
  };
}

async function storedToMediaItem(stored: StoredFakePhotoMediaItem): Promise<GooglePhotosMediaItem> {
  return {
    id: stored.id,
    baseUrl: await blobToDataUrl(stored.blob),
    mimeType: stored.mimeType,
    mediaMetadata: {
      ...defined("width", stored.width?.toString()),
      ...defined("height", stored.height?.toString())
    }
  };
}

async function hashBlob(blob: Blob): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", await blob.arrayBuffer());
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("");
}

async function readImageDimensions(blob: Blob): Promise<{ readonly width?: number; readonly height?: number }> {
  const url = URL.createObjectURL(blob);
  try {
    const image = new Image();
    await new Promise<void>((resolve, reject) => {
      image.onload = () => resolve();
      image.onerror = () => reject(new Error("Could not read image dimensions."));
      image.src = url;
    });

    return {
      ...defined("width", image.naturalWidth || undefined),
      ...defined("height", image.naturalHeight || undefined)
    };
  } catch {
    return {};
  } finally {
    URL.revokeObjectURL(url);
  }
}

function blobToDataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(reader.error ?? new Error("Could not read fake image."));
    reader.readAsDataURL(blob);
  });
}

function defined<K extends string, V>(key: K, value: V | undefined): { [P in K]: V } | Record<string, never> {
  return value === undefined ? {} : { [key]: value } as { [P in K]: V };
}
