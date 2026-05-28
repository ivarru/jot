import { createImageAttachmentReference } from "~/domain/attachmentReferences";
import type { ImageAttachmentDisplay } from "~/domain/imageAttachmentDisplay";
import {
  IMAGE_ATTACHMENT_METADATA_VERSION,
  availableImageAttachmentResolutions,
  createImageAttachmentId,
  imageAttachmentIdFromFilename,
  imageAttachmentMetadataFilename,
  googlePhotosImageContentUrl,
  type ImageAttachmentMetadata,
  type ImageAttachmentResolution,
  type ImageAttachmentResolutionName,
  type JotImageAlbumMetadata
} from "~/domain/imageAttachments";
import {
  type GooglePhotosAlbum,
  type GooglePhotosPickingSession,
  type GooglePhotosMediaItem,
  type PickedGooglePhotosMediaItem
} from "~/photos/googlePhotosAttachments";

const JOT_IMAGE_ALBUM_TITLE = "jot";
const GOOGLE_PHOTOS_DISPLAY_URL_REFRESH_MS = 55 * 60 * 1000;

export interface ImageAttachmentPhotosProvider {
  createPickingSession(): Promise<GooglePhotosPickingSession>;
  getPickingSession(sessionId: string): Promise<GooglePhotosPickingSession>;
  listPickedMediaItems(sessionId: string): Promise<PickedGooglePhotosMediaItem[]>;
  downloadPickedImage(item: PickedGooglePhotosMediaItem, resolution: ImageAttachmentResolution): Promise<Blob>;
  createAlbum(title: string): Promise<GooglePhotosAlbum>;
  uploadImageToAlbum(input: {
    readonly albumId: string;
    readonly filename: string;
    readonly mimeType: string;
    readonly bytes: Blob;
  }): Promise<GooglePhotosMediaItem | undefined>;
  getMediaItem(mediaItemId: string): Promise<GooglePhotosMediaItem>;
}

export interface ImageAttachmentMetadataStore {
  loadJotImageAlbum(): Promise<JotImageAlbumMetadata | null>;
  saveJotImageAlbum(metadata: JotImageAlbumMetadata): Promise<void>;
  loadImageAttachmentMetadata(id: string): Promise<ImageAttachmentMetadata | null>;
  findImageAttachmentMetadataByMediaItemId(mediaItemId: string): Promise<ImageAttachmentMetadata | null>;
  saveImageAttachmentMetadata(metadata: ImageAttachmentMetadata): Promise<void>;
}

export interface InsertedImageAttachment {
  readonly metadata: ImageAttachmentMetadata;
  readonly markdownReference: string;
}

export interface ReusableImageAttachment {
  readonly metadata: ImageAttachmentMetadata;
}

export class ImageAttachmentFlow {
  constructor(
    private readonly photos: ImageAttachmentPhotosProvider,
    private readonly drive: ImageAttachmentMetadataStore
  ) {}

  async startPicking(): Promise<GooglePhotosPickingSession> {
    return await this.photos.createPickingSession();
  }

  async getPickingSession(sessionId: string): Promise<GooglePhotosPickingSession> {
    return await this.photos.getPickingSession(sessionId);
  }

  async getFirstPickedImage(sessionId: string): Promise<PickedGooglePhotosMediaItem | null> {
    const picked = (await this.photos.listPickedMediaItems(sessionId)).find(isPickedImage);
    return picked ?? null;
  }

  getAvailableResolutions(picked: PickedGooglePhotosMediaItem): ImageAttachmentResolution[] {
    const metadata = picked.mediaFile?.mediaFileMetadata;
    return availableImageAttachmentResolutions({
      ...defined("width", metadata?.width),
      ...defined("height", metadata?.height)
    });
  }

  async findReusablePickedImage(picked: PickedGooglePhotosMediaItem): Promise<ReusableImageAttachment | null> {
    const metadata = await this.findReusableAttachment(picked);
    return metadata === null ? null : { metadata };
  }

  async importPickedImage(input: {
    readonly picked: PickedGooglePhotosMediaItem;
    readonly selectedResolution: ImageAttachmentResolution;
    readonly altText: string;
  }): Promise<InsertedImageAttachment> {
    const id = createImageAttachmentId();
    const album = await this.ensureJotImageAlbum();
    const bytes = await this.photos.downloadPickedImage(input.picked, input.selectedResolution);
    const mimeType = input.picked.mediaFile?.mimeType ?? bytes.type;
    const copy = await this.photos.uploadImageToAlbum({
      albumId: album.albumId,
      filename: imageAttachmentFilename(id, input.picked, mimeType),
      mimeType,
      bytes
    });
    const metadata = createImageAttachmentMetadata({
      id,
      selectedResolution: input.selectedResolution.name,
      album,
      picked: input.picked,
      copiedMediaItemId: copy?.id ?? "",
      ...defined("copiedProductUrl", copy?.productUrl),
      ...defined("copiedMimeType", copy?.mimeType),
      ...defined("copiedWidth", numberFromString(copy?.mediaMetadata?.width)),
      ...defined("copiedHeight", numberFromString(copy?.mediaMetadata?.height))
    });

    await this.drive.saveImageAttachmentMetadata(metadata);

    return {
      metadata,
      markdownReference: createImageAttachmentReference(id, input.altText)
    };
  }

  insertReusableImage(input: {
    readonly reusable: ReusableImageAttachment;
    readonly altText: string;
  }): InsertedImageAttachment {
    return {
      metadata: input.reusable.metadata,
      markdownReference: createImageAttachmentReference(input.reusable.metadata.id, input.altText)
    };
  }

  async resolveImageAttachmentDisplay(id: string): Promise<ImageAttachmentDisplay> {
    const metadata = await this.drive.loadImageAttachmentMetadata(id).catch((error: unknown) => {
      return {
        error
      };
    });
    if (isMetadataLoadError(metadata)) {
      return {
        id,
        status: "error",
        message: errorMessage(metadata.error)
      };
    }
    if (metadata === null) {
      return {
        id,
        status: "missing",
        message: "Image metadata was not found in Drive."
      };
    }

    try {
      const mediaItem = await this.photos.getMediaItem(metadata.copy.mediaItemId);
      const baseUrl = mediaItem.baseUrl;
      if (baseUrl === undefined) {
        return {
          id,
          status: "error",
          message: "Google Photos did not return an image URL."
        };
      }

      return {
        id,
        status: "ready",
        url: googlePhotosImageContentUrl(baseUrl, {
          name: "medium",
          label: "Medium",
          maxWidth: 2048,
          maxHeight: 2048
        }),
        ...defined("expiresAtMs", displayUrlExpiresAtMs(baseUrl))
      };
    } catch (error: unknown) {
      return {
        id,
        status: "error",
        message: errorMessage(error)
      };
    }
  }

  private async findReusableAttachment(picked: PickedGooglePhotosMediaItem): Promise<ImageAttachmentMetadata | null> {
    const existingByMediaItemId = await this.drive.findImageAttachmentMetadataByMediaItemId(picked.id);
    if (existingByMediaItemId !== null) return existingByMediaItemId;

    const idFromFilename = imageAttachmentIdFromFilename(picked.mediaFile?.filename);
    if (idFromFilename === null) return null;

    const existingById = await this.drive.loadImageAttachmentMetadata(idFromFilename);
    if (existingById !== null) return existingById;

    const album = await this.drive.loadJotImageAlbum();
    if (album === null) return null;

    const metadata = createImageAttachmentMetadata({
      id: idFromFilename,
      selectedResolution: "original",
      album,
      picked,
      copiedMediaItemId: picked.id,
      ...defined("copiedMimeType", picked.mediaFile?.mimeType),
      ...defined("copiedWidth", picked.mediaFile?.mediaFileMetadata?.width),
      ...defined("copiedHeight", picked.mediaFile?.mediaFileMetadata?.height)
    });
    await this.drive.saveImageAttachmentMetadata(metadata);
    return metadata;
  }

  private async ensureJotImageAlbum(): Promise<JotImageAlbumMetadata> {
    const existing = await this.drive.loadJotImageAlbum();
    if (existing !== null) return existing;

    const album = await this.photos.createAlbum(JOT_IMAGE_ALBUM_TITLE);
    const metadata: JotImageAlbumMetadata = {
      version: IMAGE_ATTACHMENT_METADATA_VERSION,
      albumId: album.id,
      title: album.title,
      ...defined("productUrl", album.productUrl),
      createdAt: new Date().toISOString()
    };
    await this.drive.saveJotImageAlbum(metadata);
    return metadata;
  }
}

function createImageAttachmentMetadata(input: {
  readonly id: string;
  readonly selectedResolution: ImageAttachmentResolutionName;
  readonly album: JotImageAlbumMetadata;
  readonly picked: PickedGooglePhotosMediaItem;
  readonly copiedMediaItemId: string;
  readonly copiedProductUrl?: string;
  readonly copiedMimeType?: string;
  readonly copiedWidth?: number;
  readonly copiedHeight?: number;
}): ImageAttachmentMetadata {
  const mediaFile = input.picked.mediaFile;
  return {
    version: IMAGE_ATTACHMENT_METADATA_VERSION,
    id: input.id,
    createdAt: new Date().toISOString(),
    selectedResolution: input.selectedResolution,
    source: {
      kind: "google-photos-picker",
      mediaItemId: input.picked.id,
      ...defined("createTime", input.picked.createTime),
      ...defined("filename", mediaFile?.filename),
      ...defined("mimeType", mediaFile?.mimeType),
      ...defined("width", mediaFile?.mediaFileMetadata?.width),
      ...defined("height", mediaFile?.mediaFileMetadata?.height)
    },
    copy: {
      kind: "google-photos-library",
      albumId: input.album.albumId,
      mediaItemId: input.copiedMediaItemId,
      ...defined("productUrl", input.copiedProductUrl),
      ...defined("mimeType", input.copiedMimeType),
      ...defined("width", input.copiedWidth),
      ...defined("height", input.copiedHeight)
    }
  };
}

function isPickedImage(item: PickedGooglePhotosMediaItem): boolean {
  return item.type !== "VIDEO" && item.mediaFile?.mimeType?.startsWith("image/") === true;
}

function imageAttachmentFilename(id: string, picked: PickedGooglePhotosMediaItem, mimeType: string): string {
  const filename = picked.mediaFile?.filename;
  const extension = filename?.includes(".") ? filename.slice(filename.lastIndexOf(".")) : extensionForMimeType(mimeType);
  return imageAttachmentMetadataFilename(id).replace(/\.json$/, extension);
}

function extensionForMimeType(mimeType: string): string {
  switch (mimeType) {
    case "image/png":
      return ".png";
    case "image/webp":
      return ".webp";
    case "image/gif":
      return ".gif";
    default:
      return ".jpg";
  }
}

function numberFromString(value: string | undefined): number | undefined {
  if (!value) return undefined;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : undefined;
}

function isMetadataLoadError(value: ImageAttachmentMetadata | { readonly error: unknown } | null): value is { readonly error: unknown } {
  return typeof value === "object" && value !== null && "error" in value;
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function displayUrlExpiresAtMs(baseUrl: string): number | undefined {
  if (baseUrl.startsWith("data:") || baseUrl.startsWith("blob:")) return undefined;
  return Date.now() + GOOGLE_PHOTOS_DISPLAY_URL_REFRESH_MS;
}

function defined<K extends string, V>(key: K, value: V | undefined): { [P in K]: V } | Record<string, never> {
  return value === undefined ? {} : { [key]: value } as { [P in K]: V };
}
