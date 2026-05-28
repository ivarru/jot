import type { AccessTokenProvider } from "~/auth/accessTokenProvider";
import {
  GOOGLE_PHOTOS_APPENDONLY_SCOPE,
  GOOGLE_PHOTOS_PICKER_SCOPE,
  GooglePhotosAttachmentProvider,
  preservePickerUri
} from "./googlePhotosAttachments";

interface CapturedRequest {
  readonly url: string;
  readonly init: RequestInit;
}

class StaticTokenProvider implements AccessTokenProvider {
  async getAccessToken(): Promise<string> {
    return "photos-token";
  }
}

describe("GooglePhotosAttachmentProvider", () => {
  it("uses the current Picker and append-only Library scopes", () => {
    expect(GOOGLE_PHOTOS_PICKER_SCOPE).toBe("https://www.googleapis.com/auth/photospicker.mediaitems.readonly");
    expect(GOOGLE_PHOTOS_APPENDONLY_SCOPE).toBe("https://www.googleapis.com/auth/photoslibrary.appendonly");
  });

  it("creates single-item picker sessions", async () => {
    const fetch = createPhotosFetch([
      json({
        id: "session-id",
        pickerUri: "https://photos.google.com/share/session",
        mediaItemsSet: false
      })
    ]);
    const provider = new GooglePhotosAttachmentProvider(new StaticTokenProvider(), fetch.fetch);

    await expect(provider.createPickingSession()).resolves.toMatchObject({
      id: "session-id",
      pickerUri: "https://photos.google.com/share/session"
    });
    expect(fetch.requests[0]?.url).toBe("https://photospicker.googleapis.com/v1/sessions");
    expect(String(fetch.requests[0]?.init.body)).toContain('"maxItemCount":"1"');
  });

  it("preserves the picker URI when refreshed sessions omit it", () => {
    expect(
      preservePickerUri(
        {
          id: "session-id",
          pickerUri: "https://photos.google.com/share/session",
          mediaItemsSet: false
        },
        {
          id: "session-id",
          mediaItemsSet: true
        }
      )
    ).toEqual({
      id: "session-id",
      pickerUri: "https://photos.google.com/share/session",
      mediaItemsSet: true
    });
  });

  it("downloads picked image bytes at the selected resolution", async () => {
    const fetch = createPhotosFetch([new Response("image-bytes", { status: 200 })]);
    const provider = new GooglePhotosAttachmentProvider(new StaticTokenProvider(), fetch.fetch);

    const blob = await provider.downloadPickedImage(
      {
        id: "picked-id",
        type: "PHOTO",
        mediaFile: {
          baseUrl: "https://lh3.googleusercontent.com/p/test",
          mimeType: "image/jpeg"
        }
      },
      { name: "medium", label: "Medium", maxWidth: 2048, maxHeight: 2048 }
    );

    expect(blob).toBeInstanceOf(Blob);
    expect(fetch.requests[0]?.url).toBe("https://lh3.googleusercontent.com/p/test=w2048");
    expect(new Headers(fetch.requests[0]?.init.headers).get("Authorization")).toBe("Bearer photos-token");
  });

  it("uploads bytes and creates a media item in the Jot album", async () => {
    const fetch = createPhotosFetch([
      text("upload-token"),
      json({
        newMediaItemResults: [
          {
            status: {},
            mediaItem: {
              id: "copy-id",
              productUrl: "https://photos.google.com/photo/copy",
              mimeType: "image/jpeg"
            }
          }
        ]
      })
    ]);
    const provider = new GooglePhotosAttachmentProvider(new StaticTokenProvider(), fetch.fetch);

    await expect(
      provider.uploadImageToAlbum({
        albumId: "album-id",
        filename: "jot-image.jpg",
        mimeType: "image/jpeg",
        bytes: new Blob(["image-bytes"], { type: "image/jpeg" })
      })
    ).resolves.toMatchObject({
      id: "copy-id",
      productUrl: "https://photos.google.com/photo/copy"
    });
    expect(fetch.requests[0]?.url).toBe("https://photoslibrary.googleapis.com/v1/uploads");
    expect(fetch.requests[1]?.url).toBe("https://photoslibrary.googleapis.com/v1/mediaItems:batchCreate");
    expect(String(fetch.requests[1]?.init.body)).toContain('"albumId":"album-id"');
  });
});

function createPhotosFetch(responses: Response[]): { readonly fetch: typeof fetch; readonly requests: CapturedRequest[] } {
  const requests: CapturedRequest[] = [];
  const fetchMock = vi.fn(async (url: RequestInfo | URL, init: RequestInit = {}) => {
    requests.push({ url: String(url), init });
    const response = responses.shift();
    if (!response) throw new Error(`Unexpected request to ${String(url)}`);
    return response;
  }) as unknown as typeof fetch;

  return { fetch: fetchMock, requests };
}

function json(value: unknown): Response {
  return new Response(JSON.stringify(value), {
    status: 200,
    headers: {
      "Content-Type": "application/json"
    }
  });
}

function text(value: string): Response {
  return new Response(value, {
    status: 200,
    headers: {
      "Content-Type": "text/plain"
    }
  });
}
