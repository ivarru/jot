import { DEFAULT_JOT_SETTINGS } from "~/domain/settings";
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
      json({ files: [file("readme-file", "README.md", "text/markdown", "1")] }),
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
      json(file("readme-file", "README.md", "text/markdown", "1")),
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
    const createReadmeRequest = fetch.requests.find((request) => String(request.init.body).includes('"name":"README.md"'));
    expect(createReadmeRequest?.url).toContain("uploadType=multipart");
    expect(String(createReadmeRequest?.init.body)).toContain("This folder is managed by the Jot progressive web app.");
  });

  it("loads an existing Daily Note by metadata and media content", async () => {
    const fetch = createDriveFetch([
      json({ files: [file("jot-folder", "jot", "application/vnd.google-apps.folder", "1")] }),
      json({ files: [file("readme-file", "README.md", "text/markdown", "1")] }),
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
      json({ files: [file("readme-file", "README.md", "text/markdown", "1")] }),
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
      json({ files: [file("readme-file", "README.md", "text/markdown", "1")] }),
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
      json({ files: [file("readme-file", "README.md", "text/markdown", "1")] }),
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
      json({ files: [file("readme-file", "README.md", "text/markdown", "1")] }),
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
      json(file("readme-file", "README.md", "text/markdown", "1")),
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

function file(id: string, name: string, mimeType: string, version: string): object {
  return {
    id,
    name,
    mimeType,
    version,
    modifiedTime: "2030-01-01T00:00:00.000Z"
  };
}
