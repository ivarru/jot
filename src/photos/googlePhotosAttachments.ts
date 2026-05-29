import type { AccessTokenProvider } from "~/auth/accessTokenProvider";
import {
  googlePhotosImageContentUrl,
  type ImageAttachmentResolution
} from "~/domain/imageAttachments";

export const GOOGLE_PHOTOS_PICKER_SCOPE = "https://www.googleapis.com/auth/photospicker.mediaitems.readonly";
export const GOOGLE_PHOTOS_APPENDONLY_SCOPE = "https://www.googleapis.com/auth/photoslibrary.appendonly";
export const GOOGLE_PHOTOS_APP_CREATED_READ_SCOPE = "https://www.googleapis.com/auth/photoslibrary.readonly.appcreateddata";

const PHOTOS_PICKER_API_BASE = "https://photospicker.googleapis.com/v1";
const PHOTOS_LIBRARY_API_BASE = "https://photoslibrary.googleapis.com/v1";

type FetchLike = typeof fetch;

export interface GooglePhotosPickingSession {
  readonly id: string;
  readonly pickerUri?: string;
  readonly mediaItemsSet?: boolean;
  readonly pollingConfig?: {
    readonly pollInterval?: string;
    readonly timeoutIn?: string;
  };
}

export interface PickedGooglePhotosMediaItem {
  readonly id: string;
  readonly createTime?: string;
  readonly type?: "PHOTO" | "VIDEO" | "TYPE_UNSPECIFIED";
  readonly mediaFile?: {
    readonly baseUrl: string;
    readonly mimeType?: string;
    readonly filename?: string;
    readonly mediaFileMetadata?: {
      readonly width?: number;
      readonly height?: number;
    };
  };
}

interface PickedMediaItemsResponse {
  readonly mediaItems?: PickedGooglePhotosMediaItem[];
  readonly nextPageToken?: string;
}

export interface GooglePhotosAlbum {
  readonly id: string;
  readonly title: string;
  readonly productUrl?: string;
}

export interface GooglePhotosMediaItem {
  readonly id: string;
  readonly productUrl?: string;
  readonly baseUrl?: string;
  readonly mimeType?: string;
  readonly mediaMetadata?: {
    readonly width?: string;
    readonly height?: string;
  };
}

interface BatchCreateMediaItemsResponse {
  readonly newMediaItemResults?: readonly {
    readonly status?: {
      readonly code?: number;
      readonly message?: string;
    };
    readonly mediaItem?: GooglePhotosMediaItem;
  }[];
}

export class GooglePhotosRequestError extends Error {
  constructor(
    readonly status: number,
    readonly responseBody: string
  ) {
    super(`Google Photos request failed with HTTP ${status}: ${responseBody}`);
    this.name = "GooglePhotosRequestError";
  }
}

export function preservePickerUri(
  previous: GooglePhotosPickingSession | null,
  next: GooglePhotosPickingSession
): GooglePhotosPickingSession {
  return next.pickerUri === undefined && previous?.pickerUri !== undefined
    ? { ...next, pickerUri: previous.pickerUri }
    : next;
}

export class GooglePhotosAttachmentProvider {
  constructor(
    private readonly tokenProvider: AccessTokenProvider,
    private readonly fetchFn: FetchLike = globalThis.fetch.bind(globalThis)
  ) {}

  async createPickingSession(): Promise<GooglePhotosPickingSession> {
    return await this.requestJson<GooglePhotosPickingSession>(`${PHOTOS_PICKER_API_BASE}/sessions`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json; charset=UTF-8"
      },
      body: JSON.stringify({
        pickingConfig: {
          maxItemCount: "1"
        }
      })
    });
  }

  async getPickingSession(sessionId: string): Promise<GooglePhotosPickingSession> {
    return await this.requestJson<GooglePhotosPickingSession>(
      `${PHOTOS_PICKER_API_BASE}/sessions/${encodeURIComponent(sessionId)}`
    );
  }

  async listPickedMediaItems(sessionId: string): Promise<PickedGooglePhotosMediaItem[]> {
    const items: PickedGooglePhotosMediaItem[] = [];
    let pageToken: string | undefined;

    do {
      const params = new URLSearchParams({ sessionId });
      if (pageToken) params.set("pageToken", pageToken);
      const response = await this.requestJson<PickedMediaItemsResponse>(`${PHOTOS_PICKER_API_BASE}/mediaItems?${params}`);
      items.push(...(response.mediaItems ?? []));
      pageToken = response.nextPageToken;
    } while (pageToken);

    return items;
  }

  async downloadPickedImage(
    item: PickedGooglePhotosMediaItem,
    resolution: ImageAttachmentResolution
  ): Promise<Blob> {
    const mediaFile = item.mediaFile;
    if (item.type === "VIDEO" || !mediaFile?.mimeType?.startsWith("image/")) {
      throw new Error("Jot can only attach images from Google Photos.");
    }

    const url = googlePhotosImageContentUrl(mediaFile.baseUrl, resolution);
    const response = await this.request(url);
    return await response.blob();
  }

  async createAlbum(title: string): Promise<GooglePhotosAlbum> {
    return await this.requestJson<GooglePhotosAlbum>(`${PHOTOS_LIBRARY_API_BASE}/albums`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json; charset=UTF-8"
      },
      body: JSON.stringify({
        album: {
          title
        }
      })
    });
  }

  async uploadImageToAlbum(input: {
    readonly albumId: string;
    readonly filename: string;
    readonly mimeType: string;
    readonly bytes: Blob;
  }): Promise<NonNullable<BatchCreateMediaItemsResponse["newMediaItemResults"]>[number]["mediaItem"]> {
    const uploadToken = await this.uploadBytes(input.bytes, input.mimeType);
    const response = await this.requestJson<BatchCreateMediaItemsResponse>(`${PHOTOS_LIBRARY_API_BASE}/mediaItems:batchCreate`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json; charset=UTF-8"
      },
      body: JSON.stringify({
        albumId: input.albumId,
        newMediaItems: [
          {
            simpleMediaItem: {
              fileName: input.filename,
              uploadToken
            }
          }
        ]
      })
    });
    const result = response.newMediaItemResults?.[0];

    if (!result?.mediaItem || (result.status?.code ?? 0) !== 0) {
      throw new Error(result?.status?.message ?? "Google Photos did not create the uploaded image.");
    }

    return result.mediaItem;
  }

  async getMediaItem(mediaItemId: string): Promise<GooglePhotosMediaItem> {
    return await this.requestJson<GooglePhotosMediaItem>(
      `${PHOTOS_LIBRARY_API_BASE}/mediaItems/${encodeURIComponent(mediaItemId)}`
    );
  }

  private async uploadBytes(bytes: Blob, mimeType: string): Promise<string> {
    const response = await this.request(`${PHOTOS_LIBRARY_API_BASE}/uploads`, {
      method: "POST",
      headers: {
        "Content-Type": "application/octet-stream",
        "X-Goog-Upload-Content-Type": mimeType,
        "X-Goog-Upload-Protocol": "raw"
      },
      body: bytes
    });

    return await response.text();
  }

  private async requestJson<T>(url: string, init: RequestInit = {}): Promise<T> {
    const response = await this.request(url, init);
    return (await response.json()) as T;
  }

  private async request(url: string, init: RequestInit = {}): Promise<Response> {
    const token = await this.tokenProvider.getAccessToken();
    const headers = new Headers(init.headers);
    headers.set("Authorization", `Bearer ${token}`);

    const response = await this.fetchFn(url, {
      ...init,
      headers
    });

    if (!response.ok) {
      const responseBody = await response.text();
      if (isGoogleAuthFailure(response.status, responseBody)) {
        this.tokenProvider.invalidateAccessToken?.();
      }
      throw new GooglePhotosRequestError(response.status, responseBody);
    }

    return response;
  }
}

function isGoogleAuthFailure(status: number, responseBody: string): boolean {
  return (
    status === 401 ||
    responseBody.includes("invalid_token") ||
    responseBody.includes("Invalid Credentials") ||
    responseBody.includes("Request is missing required authentication credential")
  );
}
