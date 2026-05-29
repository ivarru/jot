import { DEFAULT_JOT_SETTINGS } from "~/domain/settings";
import type { ImageAttachmentMetadata } from "~/domain/imageAttachments";
import { GoogleDriveRequestError, GoogleDriveStorageProvider, createMultipartRelatedBody } from "./googleDriveStorage";
import type { AccessTokenProvider } from "~/auth/accessTokenProvider";

interface CapturedRequest {
  readonly url: string;
  readonly init: RequestInit;
}

class StaticTokenProvider implements AccessTokenProvider {
  async getAccessToken(): Promise<string> {
    return "test-token";
  }
}

describe("GoogleDriveStorageProvider", () => {
  it("binds the default global fetch receiver", async () => {
    const originalFetch = globalThis.fetch;
    const responses = [
      json({ files: [file("jot-folder", "jot", "application/vnd.google-apps.folder", "1")] }),
      json({ files: [file("agents-file", "AGENTS.md", "text/markdown", "1")] }),
      json({ files: [file("daily-folder", "Daily Notes", "application/vnd.google-apps.folder", "1")] }),
      json({ files: [] })
    ];
    const receiver = {};
    const fetchWithReceiverCheck = vi.fn(function (this: unknown) {
      if (this !== receiver) {
        throw new TypeError("'fetch' called on an object that does not implement interface Window.");
      }
      const response = responses.shift();
      if (!response) throw new Error("Unexpected fetch");
      return Promise.resolve(response);
    });
    globalThis.fetch = fetchWithReceiverCheck.bind(receiver) as unknown as typeof fetch;

    try {
      const provider = new GoogleDriveStorageProvider(new StaticTokenProvider());

      await expect(provider.loadDailyNote("2030-02-01")).resolves.toBeNull();
      expect(fetchWithReceiverCheck).toHaveBeenCalled();
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  it("creates folders and a new Daily Note with authenticated Drive requests", async () => {
    const fetch = createDriveFetch([
      json({ files: [] }),
      json(file("jot-folder", "jot", "application/vnd.google-apps.folder", "1")),
      json({ files: [] }),
      json(file("agents-file", "AGENTS.md", "text/markdown", "1")),
      json({ files: [] }),
      json(file("daily-folder", "Daily Notes", "application/vnd.google-apps.folder", "1")),
      json({ files: [] }),
      json(file("note-file", "2030-02-01.md", "text/markdown", "1"))
    ]);
    const provider = new GoogleDriveStorageProvider(new StaticTokenProvider(), fetch.fetch);

    const result = await provider.saveDailyNote({
      date: "2030-02-01",
      markdown: "# First",
      expectedRevisionId: null
    });

    expect(result).toEqual({
      type: "saved",
      note: {
        date: "2030-02-01",
        markdown: "# First",
        revisionId: "1",
        updatedAt: "2030-01-01T00:00:00.000Z"
      }
    });
    expect(fetch.requests.every((request) => new Headers(request.init.headers).get("Authorization") === "Bearer test-token")).toBe(
      true
    );
    const createNoteRequest = fetch.requests.at(-1);
    expect(createNoteRequest?.url).toContain("https://www.googleapis.com/upload/drive/v3/files?");
    expect(createNoteRequest?.url).toContain("uploadType=multipart");
    expect(String(createNoteRequest?.init.body)).toContain('"name":"2030-02-01.md"');
    expect(String(createNoteRequest?.init.body)).toContain('"parents":["daily-folder"]');
    expect(String(createNoteRequest?.init.body)).toContain("# First");
    const createAgentsRequest = fetch.requests.find((request) => String(request.init.body).includes('"name":"AGENTS.md"'));
    expect(createAgentsRequest?.url).toContain("uploadType=multipart");
    expect(String(createAgentsRequest?.init.body)).toContain("Agent Notes for the jot Drive Folder");
    expect(String(createAgentsRequest?.init.body)).toContain('"jotType":"agents"');
    expect(String(createAgentsRequest?.init.body)).toContain('"templateModifiedAt":"2026-05-29T08:19:54.000Z"');
    expect(String(createAgentsRequest?.init.body)).toContain("`jot:image:<id>`");
  });

  it("updates Drive AGENTS.md when the bundled template is newer than the Drive file", async () => {
    const fetch = createDriveFetch([
      json({ files: [file("jot-folder", "jot", "application/vnd.google-apps.folder", "1")] }),
      json({ files: [file("agents-file", "AGENTS.md", "text/markdown", "1", "2026-05-28T00:00:00.000Z")] }),
      json(file("agents-file", "AGENTS.md", "text/markdown", "2")),
      json({ files: [file("daily-folder", "Daily Notes", "application/vnd.google-apps.folder", "1")] }),
      json({ files: [] })
    ]);
    const provider = new GoogleDriveStorageProvider(new StaticTokenProvider(), fetch.fetch);

    await expect(provider.loadDailyNote("2030-02-01")).resolves.toBeNull();

    const updateAgentsRequest = fetch.requests[2];
    expect(updateAgentsRequest?.url).toContain("https://www.googleapis.com/upload/drive/v3/files/agents-file?");
    expect(updateAgentsRequest?.url).toContain("uploadType=media");
    expect(updateAgentsRequest?.init.method).toBe("PATCH");
    expect(new Headers(updateAgentsRequest?.init.headers).get("Content-Type")).toBe("text/markdown; charset=UTF-8");
    expect(String(updateAgentsRequest?.init.body)).toContain("The app updates this Drive file");
    expect(String(updateAgentsRequest?.init.body)).toContain("Google Photos album `jot`");
  });

  it("loads an existing Daily Note by metadata and media content", async () => {
    const fetch = createDriveFetch([
      json({ files: [file("jot-folder", "jot", "application/vnd.google-apps.folder", "1")] }),
      json({ files: [file("agents-file", "AGENTS.md", "text/markdown", "1")] }),
      json({ files: [file("daily-folder", "Daily Notes", "application/vnd.google-apps.folder", "1")] }),
      json({ files: [file("note-file", "2030-02-01.md", "text/markdown", "7")] }),
      text("# Existing")
    ]);
    const provider = new GoogleDriveStorageProvider(new StaticTokenProvider(), fetch.fetch);

    await expect(provider.loadDailyNote("2030-02-01")).resolves.toEqual({
      date: "2030-02-01",
      markdown: "# Existing",
      revisionId: "7",
      updatedAt: "2030-01-01T00:00:00.000Z"
    });
    expect(fetch.requests.at(-1)?.url).toBe("https://www.googleapis.com/drive/v3/files/note-file?alt=media");
  });

  it("returns a conflict instead of overwriting when Drive version changed", async () => {
    const fetch = createDriveFetch([
      json({ files: [file("jot-folder", "jot", "application/vnd.google-apps.folder", "1")] }),
      json({ files: [file("agents-file", "AGENTS.md", "text/markdown", "1")] }),
      json({ files: [file("daily-folder", "Daily Notes", "application/vnd.google-apps.folder", "1")] }),
      json({ files: [file("note-file", "2030-02-01.md", "text/markdown", "8")] }),
      text("# Remote")
    ]);
    const provider = new GoogleDriveStorageProvider(new StaticTokenProvider(), fetch.fetch);

    await expect(
      provider.saveDailyNote({
        date: "2030-02-01",
        markdown: "# Local",
        expectedRevisionId: "7"
      })
    ).resolves.toEqual({
      type: "conflict",
      remote: {
        date: "2030-02-01",
        markdown: "# Remote",
        revisionId: "8",
        updatedAt: "2030-01-01T00:00:00.000Z"
      }
    });
    expect(fetch.requests).toHaveLength(5);
  });

  it("returns a conflict when a local-only note finds an existing Drive file", async () => {
    const fetch = createDriveFetch([
      json({ files: [file("jot-folder", "jot", "application/vnd.google-apps.folder", "1")] }),
      json({ files: [file("agents-file", "AGENTS.md", "text/markdown", "1")] }),
      json({ files: [file("daily-folder", "Daily Notes", "application/vnd.google-apps.folder", "1")] }),
      json({ files: [file("note-file", "2030-02-01.md", "text/markdown", "8")] }),
      text("# Remote")
    ]);
    const provider = new GoogleDriveStorageProvider(new StaticTokenProvider(), fetch.fetch);

    await expect(
      provider.saveDailyNote({
        date: "2030-02-01",
        markdown: "# Local",
        expectedRevisionId: null
      })
    ).resolves.toEqual({
      type: "conflict",
      remote: {
        date: "2030-02-01",
        markdown: "# Remote",
        revisionId: "8",
        updatedAt: "2030-01-01T00:00:00.000Z"
      }
    });
    expect(fetch.requests.at(-1)?.url).toBe("https://www.googleapis.com/drive/v3/files/note-file?alt=media");
  });

  it("updates an existing Daily Note when the expected revision matches", async () => {
    const fetch = createDriveFetch([
      json({ files: [file("jot-folder", "jot", "application/vnd.google-apps.folder", "1")] }),
      json({ files: [file("agents-file", "AGENTS.md", "text/markdown", "1")] }),
      json({ files: [file("daily-folder", "Daily Notes", "application/vnd.google-apps.folder", "1")] }),
      json({ files: [file("note-file", "2030-02-01.md", "text/markdown", "7")] }),
      json(file("note-file", "2030-02-01.md", "text/markdown", "8"))
    ]);
    const provider = new GoogleDriveStorageProvider(new StaticTokenProvider(), fetch.fetch);

    const result = await provider.saveDailyNote({
      date: "2030-02-01",
      markdown: "# Updated",
      expectedRevisionId: "7"
    });

    expect(result.type).toBe("saved");
    const updateRequest = fetch.requests.at(-1);
    expect(updateRequest?.url).toContain("https://www.googleapis.com/upload/drive/v3/files/note-file?");
    expect(updateRequest?.url).toContain("uploadType=media");
    expect(updateRequest?.init.method).toBe("PATCH");
    expect(updateRequest?.init.body).toBe("# Updated");
  });

  it("loads and saves settings as JSON in the Jot Folder", async () => {
    const fetch = createDriveFetch([
      json({ files: [file("jot-folder", "jot", "application/vnd.google-apps.folder", "1")] }),
      json({ files: [file("agents-file", "AGENTS.md", "text/markdown", "1")] }),
      json({ files: [file("daily-folder", "Daily Notes", "application/vnd.google-apps.folder", "1")] }),
      json({ files: [] }),
      json(file("settings-file", "settings.json", "application/json", "1"))
    ]);
    const provider = new GoogleDriveStorageProvider(new StaticTokenProvider(), fetch.fetch);

    await expect(provider.saveSettings(DEFAULT_JOT_SETTINGS)).resolves.toEqual(DEFAULT_JOT_SETTINGS);
    const settingsRequest = fetch.requests.at(-1);
    expect(settingsRequest?.url).toContain("uploadType=multipart");
    expect(String(settingsRequest?.init.body)).toContain('"name":"settings.json"');
    expect(String(settingsRequest?.init.body)).toContain('"parents":["jot-folder"]');
  });

  it("stores image attachment metadata in a dedicated Drive folder", async () => {
    const metadata: ImageAttachmentMetadata = {
      version: 1,
      id: "01HZY3J2CJX6N7Y25K2K3N8E4A",
      createdAt: "2030-01-01T00:00:00.000Z",
      selectedResolution: "medium",
      source: {
        kind: "google-photos-picker",
        mediaItemId: "source-media-id",
        filename: "source.jpg",
        mimeType: "image/jpeg",
        width: 4032,
        height: 3024
      },
      copy: {
        kind: "google-photos-library",
        albumId: "album-id",
        mediaItemId: "copy-media-id",
        productUrl: "https://photos.google.com/photo/copy",
        mimeType: "image/jpeg"
      }
    };
    const fetch = createDriveFetch([
      json({ files: [file("jot-folder", "jot", "application/vnd.google-apps.folder", "1")] }),
      json({ files: [file("agents-file", "AGENTS.md", "text/markdown", "1")] }),
      json({ files: [file("daily-folder", "Daily Notes", "application/vnd.google-apps.folder", "1")] }),
      json({ files: [] }),
      json(file("image-attachments-folder", "Image Attachments", "application/vnd.google-apps.folder", "1")),
      json({ files: [] }),
      json(file("attachment-metadata", "01HZY3J2CJX6N7Y25K2K3N8E4A.json", "application/json", "1"))
    ]);
    const provider = new GoogleDriveStorageProvider(new StaticTokenProvider(), fetch.fetch);

    await provider.saveImageAttachmentMetadata(metadata);

    const createMetadataRequest = fetch.requests.at(-1);
    expect(createMetadataRequest?.url).toContain("uploadType=multipart");
    expect(String(createMetadataRequest?.init.body)).toContain('"name":"01HZY3J2CJX6N7Y25K2K3N8E4A.json"');
	    expect(String(createMetadataRequest?.init.body)).toContain('"parents":["image-attachments-folder"]');
	    expect(String(createMetadataRequest?.init.body)).toContain('"mediaItemId": "source-media-id"');
	    expect(String(createMetadataRequest?.init.body)).toContain('"sourceMediaItemId":"source-media-id"');
	    expect(String(createMetadataRequest?.init.body)).toContain('"copyMediaItemId":"copy-media-id"');
  });

  it("stores the Jot Image Album id in the Jot Folder", async () => {
    const fetch = createDriveFetch([
      json({ files: [file("jot-folder", "jot", "application/vnd.google-apps.folder", "1")] }),
      json({ files: [file("agents-file", "AGENTS.md", "text/markdown", "1")] }),
      json({ files: [file("daily-folder", "Daily Notes", "application/vnd.google-apps.folder", "1")] }),
      json({ files: [] }),
      json(file("image-album", "image-album.json", "application/json", "1"))
    ]);
    const provider = new GoogleDriveStorageProvider(new StaticTokenProvider(), fetch.fetch);

    await provider.saveJotImageAlbum({
      version: 1,
      albumId: "album-id",
      title: "jot",
      productUrl: "https://photos.google.com/album/album-id",
      createdAt: "2030-01-01T00:00:00.000Z"
    });

    const createAlbumMetadataRequest = fetch.requests.at(-1);
    expect(createAlbumMetadataRequest?.url).toContain("uploadType=multipart");
    expect(String(createAlbumMetadataRequest?.init.body)).toContain('"name":"image-album.json"');
    expect(String(createAlbumMetadataRequest?.init.body)).toContain('"albumId": "album-id"');
  });

  it("finds image attachment metadata by copied Google Photos media item id", async () => {
    const metadata: ImageAttachmentMetadata = {
      version: 1,
      id: "01HZY3J2CJX6N7Y25K2K3N8E4A",
      createdAt: "2030-01-01T00:00:00.000Z",
      selectedResolution: "medium",
      source: {
        kind: "google-photos-picker",
        mediaItemId: "source-media-id"
      },
      copy: {
        kind: "google-photos-library",
        albumId: "album-id",
        mediaItemId: "copy-media-id"
      }
    };
    const fetch = createDriveFetch([
      json({ files: [file("jot-folder", "jot", "application/vnd.google-apps.folder", "1")] }),
      json({ files: [file("agents-file", "AGENTS.md", "text/markdown", "1")] }),
      json({ files: [file("daily-folder", "Daily Notes", "application/vnd.google-apps.folder", "1")] }),
      json({ files: [file("image-attachments-folder", "Image Attachments", "application/vnd.google-apps.folder", "1")] }),
      json({ files: [file("attachment-metadata", "01HZY3J2CJX6N7Y25K2K3N8E4A.json", "application/json", "1")] }),
      text(JSON.stringify(metadata))
    ]);
    const provider = new GoogleDriveStorageProvider(new StaticTokenProvider(), fetch.fetch);

	    await expect(provider.findImageAttachmentMetadataByCopiedMediaItemId("copy-media-id")).resolves.toEqual(metadata);
	    expect(decodedUrl(fetch.requests.at(-2)?.url)).toContain(
	      "appProperties has { key='copyMediaItemId' and value='copy-media-id' }"
	    );
	    expect(fetch.requests).toHaveLength(6);
  });

  it("finds image attachment metadata by source Google Photos media item id", async () => {
    const metadata: ImageAttachmentMetadata = {
      version: 1,
      id: "01HZY3J2CJX6N7Y25K2K3N8E4A",
      createdAt: "2030-01-01T00:00:00.000Z",
      selectedResolution: "medium",
      source: {
        kind: "google-photos-picker",
        mediaItemId: "source-media-id"
      },
      copy: {
        kind: "google-photos-library",
        albumId: "album-id",
        mediaItemId: "copy-media-id"
      }
    };
    const fetch = createDriveFetch([
      json({ files: [file("jot-folder", "jot", "application/vnd.google-apps.folder", "1")] }),
      json({ files: [file("agents-file", "AGENTS.md", "text/markdown", "1")] }),
      json({ files: [file("daily-folder", "Daily Notes", "application/vnd.google-apps.folder", "1")] }),
      json({ files: [file("image-attachments-folder", "Image Attachments", "application/vnd.google-apps.folder", "1")] }),
      json({ files: [file("attachment-metadata", "01HZY3J2CJX6N7Y25K2K3N8E4A.json", "application/json", "1")] }),
      text(JSON.stringify(metadata))
    ]);
    const provider = new GoogleDriveStorageProvider(new StaticTokenProvider(), fetch.fetch);

	    await expect(provider.findImageAttachmentMetadataByMediaItemId("source-media-id")).resolves.toEqual(metadata);
	    expect(decodedUrl(fetch.requests.at(-2)?.url)).toContain(
	      "appProperties has { key='sourceMediaItemId' and value='source-media-id' }"
	    );
	    expect(fetch.requests).toHaveLength(6);
	  });

  it("creates valid multipart related request bodies", () => {
    const multipart = createMultipartRelatedBody({ name: "note.md" }, "hello", "text/markdown");

    expect(multipart.boundary).toMatch(/^jot-/);
    expect(multipart.body).toContain("Content-Type: application/json; charset=UTF-8");
    expect(multipart.body).toContain('{"name":"note.md"}');
    expect(multipart.body).toContain("Content-Type: text/markdown; charset=UTF-8");
    expect(multipart.body).toContain("hello");
    expect(multipart.body).toContain(`--${multipart.boundary}--`);
  });

  it("retries folder setup after a transient Drive failure", async () => {
    const fetch = createDriveFetch([
      new Response("temporary", { status: 503 }),
      json({ files: [] }),
      json(file("jot-folder", "jot", "application/vnd.google-apps.folder", "1")),
      json({ files: [] }),
      json(file("agents-file", "AGENTS.md", "text/markdown", "1")),
      json({ files: [] }),
      json(file("daily-folder", "Daily Notes", "application/vnd.google-apps.folder", "1")),
      json({ files: [] })
    ]);
    const provider = new GoogleDriveStorageProvider(new StaticTokenProvider(), fetch.fetch);

    await expect(provider.loadDailyNote("2030-02-01")).rejects.toThrow("HTTP 503");
    await expect(provider.loadDailyNote("2030-02-01")).resolves.toBeNull();
    expect(fetch.requests).toHaveLength(8);
  });

  it("includes Google Drive error response bodies in request failures", async () => {
    const responseBody = JSON.stringify({
      error: {
        code: 403,
        message: "Google Drive API has not been used in project test before or it is disabled."
      }
    });
    const fetch = createDriveFetch([new Response(responseBody, { status: 403 })]);
    const provider = new GoogleDriveStorageProvider(new StaticTokenProvider(), fetch.fetch);

    await expect(provider.loadDailyNote("2030-02-01")).rejects.toMatchObject({
      name: "GoogleDriveRequestError",
      status: 403,
      responseBody
    } satisfies Partial<GoogleDriveRequestError>);
  });
});

function createDriveFetch(responses: Response[]): { readonly fetch: typeof fetch; readonly requests: CapturedRequest[] } {
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

function file(
  id: string,
  name: string,
  mimeType: string,
  version: string,
  modifiedTime = "2030-01-01T00:00:00.000Z"
): object {
  return {
    id,
    name,
    mimeType,
    version,
    modifiedTime
  };
}

function decodedUrl(url: string | undefined): string {
  return decodeURIComponent(url ?? "").replaceAll("+", " ");
}
