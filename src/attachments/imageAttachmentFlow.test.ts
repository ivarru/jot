import { ImageAttachmentFlow } from "./imageAttachmentFlow";
import type { ImageAttachmentMetadata } from "~/domain/imageAttachments";
import type { GooglePhotosAttachmentProvider } from "~/photos/googlePhotosAttachments";
import type { GoogleDriveStorageProvider } from "~/storage/googleDriveStorage";

describe("ImageAttachmentFlow", () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it("copies a picked Google Photos image into the Jot album and saves Drive metadata", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2030-01-01T00:00:00.000Z"));

    const photos = {
      listPickedMediaItems: vi.fn(async () => [
        {
          id: "source-media-id",
          createTime: "2029-12-24T12:00:00.000Z",
          type: "PHOTO",
          mediaFile: {
            baseUrl: "https://lh3.googleusercontent.com/p/source",
            mimeType: "image/jpeg",
            filename: "source.jpg",
            mediaFileMetadata: {
              width: 4032,
              height: 3024
            }
          }
        }
      ]),
      downloadPickedImage: vi.fn(async () => new Blob(["image"], { type: "image/jpeg" })),
      createAlbum: vi.fn(async () => ({
        id: "album-id",
        title: "jot",
        productUrl: "https://photos.google.com/album/album-id"
      })),
      uploadImageToAlbum: vi.fn(async () => ({
        id: "copy-media-id",
        baseUrl: "https://lh3.googleusercontent.com/p/copy",
        productUrl: "https://photos.google.com/photo/copy",
        mimeType: "image/jpeg",
        mediaMetadata: {
          width: "2048",
          height: "1536"
        }
      }))
    } as unknown as GooglePhotosAttachmentProvider;
    const drive = {
      findImageAttachmentMetadataByCopiedMediaItemId: vi.fn(async () => null),
      findImageAttachmentMetadataByMediaItemId: vi.fn(async () => null),
      loadImageAttachmentMetadata: vi.fn(async () => null),
      loadJotImageAlbum: vi.fn(async () => null),
      saveJotImageAlbum: vi.fn(async () => undefined),
      saveImageAttachmentMetadata: vi.fn(async () => undefined)
    } as unknown as GoogleDriveStorageProvider;

    const flow = new ImageAttachmentFlow(photos, drive);
    const picked = await flow.getFirstPickedImage("session-id");
    const result = await flow.importPickedImage({
      picked: picked!,
      selectedResolution: flow.getAvailableResolutions(picked!).find((resolution) => resolution.name === "medium")!,
      altText: "Trail proposal"
    });

    expect(result.markdownReference).toMatch(/^!\[Trail proposal\]\(jot:image:[0-9A-HJKMNP-TV-Z]{26}\)$/);
    expect(drive.saveJotImageAlbum).toHaveBeenCalledWith(
      expect.objectContaining({
        albumId: "album-id",
        title: "jot"
      })
    );
    expect(photos.uploadImageToAlbum).toHaveBeenCalledWith(
      expect.objectContaining({
        albumId: "album-id",
        mimeType: "image/jpeg"
      })
    );
    expect(drive.saveImageAttachmentMetadata).toHaveBeenCalledWith(
      expect.objectContaining({
        selectedResolution: "medium",
        source: expect.objectContaining({
          mediaItemId: "source-media-id"
        }),
        copy: expect.objectContaining({
          albumId: "album-id",
          mediaItemId: "copy-media-id"
        })
      })
    );
  });

  it("reuses existing metadata when the picked image is already a Jot album copy", async () => {
    const metadata = imageAttachmentMetadata({
      id: "01HZY3J2CJX6N7Y25K2K3N8E4A",
      copyMediaItemId: "copy-media-id"
    });
    const photos = {
      downloadPickedImage: vi.fn(),
      uploadImageToAlbum: vi.fn()
    } as unknown as GooglePhotosAttachmentProvider;
    const drive = {
      findImageAttachmentMetadataByMediaItemId: vi.fn(async () => metadata)
    } as unknown as GoogleDriveStorageProvider;

    const flow = new ImageAttachmentFlow(photos, drive);
    const reusable = await flow.findReusablePickedImage(
      pickedImage({
        id: "copy-media-id",
        filename: "source.jpg"
      })
    );
    const result = flow.insertReusableImage({
      reusable: reusable!,
      altText: "Reuse this"
    });

    expect(result.markdownReference).toBe("![Reuse this](jot:image:01HZY3J2CJX6N7Y25K2K3N8E4A)");
    expect(photos.downloadPickedImage).not.toHaveBeenCalled();
    expect(photos.uploadImageToAlbum).not.toHaveBeenCalled();
  });

  it("reuses existing metadata when the same original source image is picked again", async () => {
    const metadata = imageAttachmentMetadata({
      id: "01HZY3J2CJX6N7Y25K2K3N8E4A",
      copyMediaItemId: "copy-media-id"
    });
    const photos = {
      downloadPickedImage: vi.fn(),
      uploadImageToAlbum: vi.fn()
    } as unknown as GooglePhotosAttachmentProvider;
    const drive = {
      findImageAttachmentMetadataByMediaItemId: vi.fn(async () => metadata)
    } as unknown as GoogleDriveStorageProvider;

    const reusable = await new ImageAttachmentFlow(photos, drive).findReusablePickedImage(
      pickedImage({
        id: "source-media-id",
        filename: "source.jpg"
      })
    );

    expect(reusable?.metadata.id).toBe("01HZY3J2CJX6N7Y25K2K3N8E4A");
    expect(photos.downloadPickedImage).not.toHaveBeenCalled();
    expect(photos.uploadImageToAlbum).not.toHaveBeenCalled();
  });

  it("recreates missing metadata for a picked Jot-created album image", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2030-01-01T00:00:00.000Z"));

    const photos = {
      downloadPickedImage: vi.fn(),
      uploadImageToAlbum: vi.fn()
    } as unknown as GooglePhotosAttachmentProvider;
    const drive = {
      findImageAttachmentMetadataByCopiedMediaItemId: vi.fn(async () => null),
      findImageAttachmentMetadataByMediaItemId: vi.fn(async () => null),
      loadImageAttachmentMetadata: vi.fn(async () => null),
      loadJotImageAlbum: vi.fn(async () => ({
        version: 1,
        albumId: "album-id",
        title: "jot",
        createdAt: "2030-01-01T00:00:00.000Z"
      })),
      saveImageAttachmentMetadata: vi.fn(async () => undefined)
    } as unknown as GoogleDriveStorageProvider;

    const flow = new ImageAttachmentFlow(photos, drive);
    const reusable = await flow.findReusablePickedImage(
      pickedImage({
        id: "copy-media-id",
        filename: "01HZY3J2CJX6N7Y25K2K3N8E4A.jpg"
      })
    );
    const result = flow.insertReusableImage({
      reusable: reusable!,
      altText: "Recovered"
    });

    expect(result.markdownReference).toBe("![Recovered](jot:image:01HZY3J2CJX6N7Y25K2K3N8E4A)");
    expect(drive.saveImageAttachmentMetadata).toHaveBeenCalledWith(
      expect.objectContaining({
        id: "01HZY3J2CJX6N7Y25K2K3N8E4A",
        selectedResolution: "original",
        copy: expect.objectContaining({
          albumId: "album-id",
          mediaItemId: "copy-media-id"
        })
      })
    );
    expect(photos.downloadPickedImage).not.toHaveBeenCalled();
    expect(photos.uploadImageToAlbum).not.toHaveBeenCalled();
  });

  it("resolves attachment displays through the copied Google Photos media item", async () => {
    const photos = {
      getMediaItem: vi.fn(async () => ({
        id: "copy-media-id",
        baseUrl: "https://lh3.googleusercontent.com/p/copy"
      }))
    } as unknown as GooglePhotosAttachmentProvider;
    const drive = {
      loadImageAttachmentMetadata: vi.fn(async () =>
        imageAttachmentMetadata({
          id: "01HZY3J2CJX6N7Y25K2K3N8E4A",
          copyMediaItemId: "copy-media-id"
        })
      )
    } as unknown as GoogleDriveStorageProvider;

    await expect(new ImageAttachmentFlow(photos, drive).resolveImageAttachmentDisplay("01HZY3J2CJX6N7Y25K2K3N8E4A")).resolves.toEqual(
      expect.objectContaining({
        id: "01HZY3J2CJX6N7Y25K2K3N8E4A",
        status: "ready",
        url: "https://lh3.googleusercontent.com/p/copy=w2048",
        expiresAtMs: expect.any(Number)
      })
    );
    expect(photos.getMediaItem).toHaveBeenCalledWith("copy-media-id");
  });

  it("reports missing display metadata without falling through to Google Photos", async () => {
    const photos = {
      getMediaItem: vi.fn()
    } as unknown as GooglePhotosAttachmentProvider;
    const drive = {
      loadImageAttachmentMetadata: vi.fn(async () => null)
    } as unknown as GoogleDriveStorageProvider;

    await expect(new ImageAttachmentFlow(photos, drive).resolveImageAttachmentDisplay("01HZY3J2CJX6N7Y25K2K3N8E4A")).resolves.toEqual({
      id: "01HZY3J2CJX6N7Y25K2K3N8E4A",
      status: "missing",
      message: "Image metadata was not found in Drive."
    });
    expect(photos.getMediaItem).not.toHaveBeenCalled();
  });

  it("reports metadata load failures as display errors", async () => {
    const photos = {
      getMediaItem: vi.fn()
    } as unknown as GooglePhotosAttachmentProvider;
    const drive = {
      loadImageAttachmentMetadata: vi.fn(async () => {
        throw new Error("Drive is unavailable");
      })
    } as unknown as GoogleDriveStorageProvider;

    await expect(new ImageAttachmentFlow(photos, drive).resolveImageAttachmentDisplay("01HZY3J2CJX6N7Y25K2K3N8E4A")).resolves.toEqual({
      id: "01HZY3J2CJX6N7Y25K2K3N8E4A",
      status: "error",
      message: "Drive is unavailable"
    });
    expect(photos.getMediaItem).not.toHaveBeenCalled();
  });
});

function pickedImage(input: { readonly id: string; readonly filename: string }) {
  return {
    id: input.id,
    createTime: "2029-12-24T12:00:00.000Z",
    type: "PHOTO" as const,
    mediaFile: {
      baseUrl: "https://lh3.googleusercontent.com/p/source",
      mimeType: "image/jpeg",
      filename: input.filename,
      mediaFileMetadata: {
        width: 4032,
        height: 3024
      }
    }
  };
}

function imageAttachmentMetadata(input: {
  readonly id: string;
  readonly copyMediaItemId: string;
}): ImageAttachmentMetadata {
  return {
    version: 1,
    id: input.id,
    createdAt: "2030-01-01T00:00:00.000Z",
    selectedResolution: "medium",
    source: {
      kind: "google-photos-picker",
      mediaItemId: "source-media-id",
      filename: "source.jpg"
    },
    copy: {
      kind: "google-photos-library",
      albumId: "album-id",
      mediaItemId: input.copyMediaItemId
    }
  };
}
