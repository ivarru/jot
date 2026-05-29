import { ulid } from "ulid";

export const IMAGE_ATTACHMENT_METADATA_VERSION = 1;
const IMAGE_ATTACHMENT_ID_PATTERN = /^(?<id>[0-9A-HJKMNP-TV-Z]{26})(?:\.[^.]+)?$/;

export type ImageAttachmentResolutionName = "small" | "medium" | "large" | "original";

export interface ImageAttachmentResolution {
  readonly name: ImageAttachmentResolutionName;
  readonly label: string;
  readonly maxWidth: number;
  readonly maxHeight: number;
}

export const IMAGE_ATTACHMENT_RESOLUTIONS: readonly ImageAttachmentResolution[] = [
  { name: "small", label: "Small", maxWidth: 600, maxHeight: 600 },
  { name: "medium", label: "Medium", maxWidth: 1200, maxHeight: 1200 },
  { name: "large", label: "Large", maxWidth: 2400, maxHeight: 2400 },
  { name: "original", label: "Original", maxWidth: 16383, maxHeight: 16383 }
];

export interface ImageAttachmentMetadata {
  readonly version: typeof IMAGE_ATTACHMENT_METADATA_VERSION;
  readonly id: string;
  readonly createdAt: string;
  readonly selectedResolution: ImageAttachmentResolutionName;
  readonly source: ImageAttachmentSourceMetadata;
  readonly copy: {
    readonly kind: "google-photos-library";
    readonly albumId: string;
    readonly mediaItemId: string;
    readonly productUrl?: string;
    readonly mimeType?: string;
    readonly width?: number;
    readonly height?: number;
  };
}

export type ImageAttachmentSourceKind =
  | "google-photos-picker"
  | "device-upload"
  | "device-camera"
  | "clipboard";

export type ImageAttachmentSourceMetadata =
  | {
      readonly kind: "google-photos-picker";
      readonly mediaItemId: string;
      readonly createTime?: string;
      readonly filename?: string;
      readonly mimeType?: string;
      readonly width?: number;
      readonly height?: number;
    }
  | {
      readonly kind: Exclude<ImageAttachmentSourceKind, "google-photos-picker">;
      readonly filename?: string;
      readonly mimeType?: string;
      readonly width?: number;
      readonly height?: number;
      readonly lastModified?: string;
    };

export interface JotImageAlbumMetadata {
  readonly version: typeof IMAGE_ATTACHMENT_METADATA_VERSION;
  readonly albumId: string;
  readonly title: string;
  readonly productUrl?: string;
  readonly createdAt: string;
}

export function createImageAttachmentId(): string {
  return ulid();
}

export function imageAttachmentMetadataFilename(id: string): string {
  return `${id}.json`;
}

export function imageAttachmentIdFromFilename(filename: string | undefined): string | null {
  if (!filename) return null;
  return IMAGE_ATTACHMENT_ID_PATTERN.exec(filename)?.groups?.id ?? null;
}

export function resolveImageAttachmentResolution(
  name: ImageAttachmentResolutionName
): ImageAttachmentResolution {
  return IMAGE_ATTACHMENT_RESOLUTIONS.find((resolution) => resolution.name === name) ?? IMAGE_ATTACHMENT_RESOLUTIONS[1]!;
}

export function availableImageAttachmentResolutions(input: {
  readonly width?: number;
  readonly height?: number;
}): ImageAttachmentResolution[] {
  const originalWidth = input.width;
  const originalHeight = input.height ?? input.width ?? IMAGE_ATTACHMENT_RESOLUTIONS.at(-1)!.maxHeight;
  const smaller =
    originalWidth === undefined
      ? []
      : IMAGE_ATTACHMENT_RESOLUTIONS.filter(
          (resolution) => resolution.name !== "original" && resolution.maxWidth < originalWidth
        );

  return [
    ...smaller,
    {
      name: "original",
      label: originalWidth === undefined ? "Full size" : `Full size (${originalWidth} px wide)`,
      maxWidth: originalWidth ?? IMAGE_ATTACHMENT_RESOLUTIONS.at(-1)!.maxWidth,
      maxHeight: originalHeight
    }
  ];
}

export function googlePhotosImageContentUrl(baseUrl: string, resolution: ImageAttachmentResolution): string {
  if (baseUrl.startsWith("data:") || baseUrl.startsWith("blob:")) return baseUrl;
  return `${baseUrl}=w${resolution.maxWidth}`;
}
