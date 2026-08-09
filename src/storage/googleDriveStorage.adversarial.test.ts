import type { AccessTokenProvider } from "~/auth/accessTokenProvider";
import type { IsoDate } from "~/domain/dates";
import { saveAndSyncDailyNoteSnapshot, syncDailyNote } from "~/sync/dailyNoteReplication/replicationCore";
import { GoogleDriveStorageProvider } from "./googleDriveStorage";
import { createDraft } from "./localDraftStore";
import type { LocalDraft, LocalDraftStore } from "./types";

interface CapturedRequest {
  readonly url: string;
  readonly init: RequestInit;
}

interface HarnessFile {
  readonly id: string;
  readonly name: string;
  readonly mimeType: string;
  readonly parentId: string;
  markdown: string;
  modifiedTime: string;
  version: number;
  trashed: boolean;
}

class StaticTokenProvider implements AccessTokenProvider {
  readonly invalidateAccessToken = vi.fn();

  async getAccessToken(): Promise<string> {
    return "test-token";
  }
}

class MemoryDraftStore implements LocalDraftStore {
  private readonly drafts = new Map<IsoDate, LocalDraft>();

  async load(date: IsoDate): Promise<LocalDraft | null> {
    return this.drafts.get(date) ?? null;
  }

  async listDirty(): Promise<LocalDraft[]> {
    return [...this.drafts.values()].filter((draft) => draft.dirty);
  }

  async save(draft: LocalDraft): Promise<void> {
    this.drafts.set(draft.date, draft);
  }

  async saveIfUnchanged(date: IsoDate, expected: LocalDraft | null, draft: LocalDraft): Promise<boolean> {
    if (this.drafts.get(date) !== expected) return false;
    this.drafts.set(date, draft);
    return true;
  }

  async remove(date: IsoDate): Promise<void> {
    this.drafts.delete(date);
  }

  async clearAll(): Promise<void> {
    this.drafts.clear();
  }
}

class StatefulDriveFetch {
  readonly requests: CapturedRequest[] = [];
  readonly fetch = vi.fn(this.handle.bind(this)) as unknown as typeof fetch;
  private readonly files = new Map<string, HarnessFile>();
  private nextModifiedSequence = 3;
  private nextCreatedFile = 1;
  private nextTrashMutation: { readonly fileId: string; readonly markdown: string } | null = null;
  private dailyNoteListBarrier: ArrivalBarrier | null = null;
  private conditionalUpdateBarrier: ArrivalBarrier | null = null;
  private dropAcceptedUpdateResponse = false;

  constructor() {
    this.addFile({
      id: "jot-folder",
      name: "jot",
      mimeType: "application/vnd.google-apps.folder",
      parentId: "root",
      markdown: "",
      modifiedTime: "2030-01-01T00:00:00.000Z",
      version: 1
    });
    this.addFile({
      id: "agents-file",
      name: "AGENTS.md",
      mimeType: "text/markdown",
      parentId: "jot-folder",
      markdown: "managed",
      modifiedTime: "2030-01-01T00:00:00.000Z",
      version: 1
    });
    this.addFile({
      id: "daily-folder",
      name: "Daily Notes",
      mimeType: "application/vnd.google-apps.folder",
      parentId: "jot-folder",
      markdown: "",
      modifiedTime: "2030-01-01T00:00:00.000Z",
      version: 1
    });
  }

  addDailyNote(input: {
    readonly id: string;
    readonly markdown: string;
    readonly modifiedTime: string;
    readonly version: number;
  }): void {
    this.addFile({
      ...input,
      name: "2030-02-01.md",
      mimeType: "text/markdown",
      parentId: "daily-folder"
    });
  }

  mutateBeforeNextTrash(fileId: string, markdown: string): void {
    this.nextTrashMutation = { fileId, markdown };
  }

  pauseDailyNoteListsUntil(arrivals: number): void {
    this.dailyNoteListBarrier = new ArrivalBarrier(arrivals);
  }

  pauseConditionalUpdatesUntil(arrivals: number): void {
    this.conditionalUpdateBarrier = new ArrivalBarrier(arrivals);
  }

  dropNextAcceptedUpdateResponse(): void {
    this.dropAcceptedUpdateResponse = true;
  }

  activeDailyNotes(): HarnessFile[] {
    return [...this.files.values()].filter((file) => file.parentId === "daily-folder" && !file.trashed);
  }

  file(fileId: string): HarnessFile {
    const file = this.files.get(fileId);
    if (file === undefined) throw new Error(`Unknown harness file ${fileId}`);
    return file;
  }

  private addFile(input: Omit<HarnessFile, "trashed">): void {
    this.files.set(input.id, { ...input, trashed: false });
  }

  private async handle(url: RequestInfo | URL, init: RequestInit = {}): Promise<Response> {
    const request = { url: String(url), init };
    this.requests.push(request);
    const decoded = decodeURIComponent(request.url.replaceAll("+", " "));

    if (request.url.startsWith("https://www.googleapis.com/drive/v3/files?")) {
      const listed = this.listFiles(decoded).map(toDriveFile);
      if (decoded.includes("name = '2030-02-01.md'")) await this.dailyNoteListBarrier?.arrive();
      return json({ files: listed });
    }

    if (request.url.startsWith("https://www.googleapis.com/upload/drive/v3/files?") && init.method === "POST") {
      const multipart = parseMultipartRequest(init);
      const metadata = multipart.metadata as {
        readonly name: string;
        readonly mimeType: string;
        readonly parents: readonly string[];
      };
      const file: HarnessFile = {
        id: `created-note-${this.nextCreatedFile}`,
        name: metadata.name,
        mimeType: metadata.mimeType,
        parentId: metadata.parents[0]!,
        markdown: multipart.content,
        modifiedTime: `2030-01-${String(this.nextModifiedSequence).padStart(2, "0")}T00:00:00.000Z`,
        version: 1,
        trashed: false
      };
      this.nextCreatedFile += 1;
      this.nextModifiedSequence += 1;
      this.files.set(file.id, file);
      return json(toDriveFile(file));
    }

    const mediaMatch = request.url.match(/^https:\/\/www\.googleapis\.com\/drive\/v3\/files\/([^?]+)\?alt=media$/);
    if (mediaMatch?.[1] !== undefined) return text(this.file(mediaMatch[1]).markdown);

    const v2MetadataMatch = request.url.match(/^https:\/\/www\.googleapis\.com\/drive\/v2\/files\/([^?]+)\?/);
    if (v2MetadataMatch?.[1] !== undefined && init.method === undefined) {
      return json(toV2File(this.file(v2MetadataMatch[1])));
    }

    const v2UploadMatch = request.url.match(/^https:\/\/www\.googleapis\.com\/upload\/drive\/v2\/files\/([^?]+)\?/);
    if (v2UploadMatch?.[1] !== undefined && init.method === "PUT") {
      await this.conditionalUpdateBarrier?.arrive();
      const file = this.file(v2UploadMatch[1]);
      if (new Headers(init.headers).get("If-Match") !== etag(file)) {
        return new Response("precondition failed", { status: 412 });
      }
      file.markdown = String(init.body);
      this.advance(file);
      if (this.dropAcceptedUpdateResponse) {
        this.dropAcceptedUpdateResponse = false;
        throw new TypeError("Drive response was lost after accepting the update");
      }
      return json(toV2File(file));
    }

    const v2PatchMatch = request.url.match(/^https:\/\/www\.googleapis\.com\/drive\/v2\/files\/([^?]+)\?/);
    if (v2PatchMatch?.[1] !== undefined && init.method === "PATCH") {
      this.applyPendingTrashMutation();
      const file = this.file(v2PatchMatch[1]);
      if (new Headers(init.headers).get("If-Match") !== etag(file)) {
        return new Response("precondition failed", { status: 412 });
      }
      const body = JSON.parse(String(init.body)) as { readonly labels?: { readonly trashed?: boolean } };
      file.trashed = body.labels?.trashed === true;
      this.advance(file);
      return json(toV2File(file));
    }

    const v3PatchMatch = request.url.match(/^https:\/\/www\.googleapis\.com\/drive\/v3\/files\/([^?]+)\?/);
    if (v3PatchMatch?.[1] !== undefined && init.method === "PATCH") {
      this.applyPendingTrashMutation();
      const file = this.file(v3PatchMatch[1]);
      const body = JSON.parse(String(init.body)) as { readonly trashed?: boolean };
      file.trashed = body.trashed === true;
      this.advance(file);
      return json(toDriveFile(file));
    }

    throw new Error(`Unexpected request to ${request.url}`);
  }

  private listFiles(decodedUrl: string): HarnessFile[] {
    const name = [...this.files.values()].find((file) => decodedUrl.includes(`name = '${file.name}'`))?.name;
    return [...this.files.values()].filter((file) =>
      !file.trashed &&
      (name === undefined || file.name === name) &&
      decodedUrl.includes(`'${file.parentId}' in parents`) &&
      decodedUrl.includes(`mimeType = '${file.mimeType}'`)
    );
  }

  private applyPendingTrashMutation(): void {
    const mutation = this.nextTrashMutation;
    if (mutation === null) return;
    this.nextTrashMutation = null;
    const file = this.file(mutation.fileId);
    file.markdown = mutation.markdown;
    this.advance(file);
  }

  private advance(file: HarnessFile): void {
    file.version += 1;
    file.modifiedTime = `2030-01-${String(this.nextModifiedSequence).padStart(2, "0")}T00:00:00.000Z`;
    this.nextModifiedSequence += 1;
  }
}

class ArrivalBarrier {
  private arrivals = 0;
  private readonly released: Promise<void>;
  private release!: () => void;

  constructor(private readonly requiredArrivals: number) {
    this.released = new Promise((resolve) => {
      this.release = resolve;
    });
  }

  async arrive(): Promise<void> {
    this.arrivals += 1;
    if (this.arrivals >= this.requiredArrivals) this.release();
    await this.released;
  }
}

describe("GoogleDriveStorageProvider adversarial behavior", () => {
  it("does not retire a duplicate changed after its content was merged", async () => {
    const drive = new StatefulDriveFetch();
    drive.addDailyNote({
      id: "older-note",
      markdown: "older snapshot",
      modifiedTime: "2030-01-01T00:00:00.000Z",
      version: 7
    });
    drive.addDailyNote({
      id: "newer-note",
      markdown: "newer snapshot",
      modifiedTime: "2030-01-02T00:00:00.000Z",
      version: 8
    });
    drive.mutateBeforeNextTrash("older-note", "late edit from another device");
    const provider = new GoogleDriveStorageProvider(new StaticTokenProvider(), drive.fetch);

    await expect(provider.loadDailyNote("2030-02-01")).rejects.toThrow(
      "Google Drive changed a duplicate Daily Note while Jot was consolidating it."
    );
    expect(drive.file("older-note")).toMatchObject({
      markdown: "late edit from another device",
      trashed: false
    });

    const recovered = await provider.loadDailyNote("2030-02-01");
    expect(recovered?.markdown).toContain("older snapshot");
    expect(recovered?.markdown).toContain("newer snapshot");
    expect(recovered?.markdown).toContain("late edit from another device");
    expect(drive.activeDailyNotes()).toHaveLength(1);
  });

  it("allows only one of two independent providers to replace the same revision", async () => {
    const drive = new StatefulDriveFetch();
    drive.addDailyNote({
      id: "note-file",
      markdown: "shared baseline",
      modifiedTime: "2030-01-01T00:00:00.000Z",
      version: 7
    });
    drive.pauseConditionalUpdatesUntil(2);
    const first = new GoogleDriveStorageProvider(new StaticTokenProvider(), drive.fetch);
    const second = new GoogleDriveStorageProvider(new StaticTokenProvider(), drive.fetch);

    const results = await Promise.all([
      first.saveDailyNote({ date: "2030-02-01", markdown: "first device", expectedRevisionId: "7" }),
      second.saveDailyNote({ date: "2030-02-01", markdown: "second device", expectedRevisionId: "7" })
    ]);

    expect(results.map((result) => result.type).sort()).toEqual(["conflict", "saved"]);
    const remote = drive.file("note-file");
    const winner = results.find((result) => result.type === "saved");
    const loser = results.find((result) => result.type === "conflict");
    expect(winner).toMatchObject({ type: "saved", note: { markdown: remote.markdown } });
    expect(loser).toMatchObject({ type: "conflict", remote: { markdown: remote.markdown } });
    expect(["first device", "second device"]).toContain(remote.markdown);

    const updates = drive.requests.filter((request) => request.url.includes("/upload/drive/v2/files/note-file?"));
    expect(updates).toHaveLength(2);
    for (const update of updates) {
      expect(update.init.method).toBe("PUT");
      expect(new Headers(update.init.headers).get("Authorization")).toBe("Bearer test-token");
      expect(new Headers(update.init.headers).get("If-Match")).toBe('"note-file-7"');
    }
  });

  it("recognizes an accepted update after its response was lost without writing again", async () => {
    const drive = new StatefulDriveFetch();
    drive.addDailyNote({
      id: "note-file",
      markdown: "shared baseline",
      modifiedTime: "2030-01-01T00:00:00.000Z",
      version: 7
    });
    drive.dropNextAcceptedUpdateResponse();
    const provider = new GoogleDriveStorageProvider(new StaticTokenProvider(), drive.fetch);
    const drafts = new MemoryDraftStore();
    await drafts.save(createDraft("2030-02-01", "shared baseline", "shared baseline", "7", false));

    await expect(
      saveAndSyncDailyNoteSnapshot("2030-02-01", "accepted content", drafts, provider)
    ).rejects.toThrow("Drive response was lost");
    expect(drive.file("note-file")).toMatchObject({ markdown: "accepted content", version: 8 });
    await expect(drafts.load("2030-02-01")).resolves.toMatchObject({
      markdown: "accepted content",
      baselineRevisionId: "7",
      dirty: true
    });

    await expect(syncDailyNote("2030-02-01", drafts, provider)).resolves.toEqual({
      markdown: "accepted content",
      status: "synced"
    });
    await expect(drafts.load("2030-02-01")).resolves.toMatchObject({
      markdown: "accepted content",
      baselineMarkdown: "accepted content",
      baselineRevisionId: "8",
      dirty: false
    });

    expect(drive.requests.filter((request) => request.url.includes("/upload/drive/v2/files/note-file?"))).toHaveLength(1);
    const retryList = drive.requests.filter((request) => request.url.includes("/drive/v3/files?")).at(-1);
    const retryDownload = drive.requests.filter((request) => request.url.endsWith("/note-file?alt=media")).at(-1);
    expect(retryList?.init.cache).toBe("no-store");
    expect(retryDownload?.init.cache).toBe("no-store");
  });

  it("preserves both independent first creates through duplicate consolidation", async () => {
    const drive = new StatefulDriveFetch();
    drive.pauseDailyNoteListsUntil(2);
    const first = new GoogleDriveStorageProvider(new StaticTokenProvider(), drive.fetch);
    const second = new GoogleDriveStorageProvider(new StaticTokenProvider(), drive.fetch);

    const created = await Promise.all([
      first.saveDailyNote({ date: "2030-02-01", markdown: "first device", expectedRevisionId: null }),
      second.saveDailyNote({ date: "2030-02-01", markdown: "second device", expectedRevisionId: null })
    ]);
    expect(created.map((result) => result.type)).toEqual(["saved", "saved"]);
    expect(drive.activeDailyNotes()).toHaveLength(2);

    const observer = new GoogleDriveStorageProvider(new StaticTokenProvider(), drive.fetch);
    const recovered = await observer.loadDailyNote("2030-02-01");
    expect(recovered?.markdown).toContain("first device");
    expect(recovered?.markdown).toContain("second device");
    expect(drive.activeDailyNotes()).toHaveLength(1);

    const creates = drive.requests.filter((request) => request.url.includes("/upload/drive/v3/files?"));
    expect(creates).toHaveLength(2);
    for (const create of creates) {
      expect(create.init.method).toBe("POST");
      expect(new Headers(create.init.headers).get("Authorization")).toBe("Bearer test-token");
      expect(String(create.init.body)).toContain('"name":"2030-02-01.md"');
    }
  });
});

function parseMultipartRequest(init: RequestInit): { readonly metadata: unknown; readonly content: string } {
  const contentType = new Headers(init.headers).get("Content-Type") ?? "";
  const boundary = contentType.match(/boundary=([^;]+)/)?.[1];
  if (boundary === undefined) throw new Error("Missing multipart boundary");
  const parts = String(init.body).split(`--${boundary}`);
  const metadataPart = parts[1];
  const contentPart = parts[2];
  if (metadataPart === undefined || contentPart === undefined) throw new Error("Invalid multipart request");
  return {
    metadata: JSON.parse(afterHeaders(metadataPart)),
    content: afterHeaders(contentPart).replace(/\r\n$/, "")
  };
}

function afterHeaders(part: string): string {
  const separator = part.indexOf("\r\n\r\n");
  if (separator === -1) throw new Error("Invalid multipart part");
  return part.slice(separator + 4).replace(/^\r\n/, "");
}

function toDriveFile(file: HarnessFile): object {
  return {
    id: file.id,
    name: file.name,
    mimeType: file.mimeType,
    modifiedTime: file.modifiedTime,
    version: String(file.version),
    size: String(new TextEncoder().encode(file.markdown).length)
  };
}

function toV2File(file: HarnessFile): object {
  return {
    id: file.id,
    etag: etag(file),
    modifiedDate: file.modifiedTime,
    version: String(file.version)
  };
}

function etag(file: HarnessFile): string {
  return `\"${file.id}-${file.version}\"`;
}

function json(value: unknown): Response {
  return new Response(JSON.stringify(value), {
    status: 200,
    headers: { "Content-Type": "application/json" }
  });
}

function text(value: string): Response {
  return new Response(value, {
    status: 200,
    headers: { "Content-Type": "text/plain" }
  });
}
