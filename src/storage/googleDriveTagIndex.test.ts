import { GoogleDriveStorageProvider } from "./googleDriveStorage";
import { DEFAULT_JOT_SETTINGS } from "~/domain/settings";

type File = {
  id: string; name: string; mimeType: string; parents: string[]; version: string; modifiedTime: string;
  content: string; trashed?: boolean;
};
const folderType = "application/vnd.google-apps.folder";
function fixture() {
  const files = new Map<string, File>();
  let serial = 10;
  const add = (id: string, name: string, parent: string, content = "", mimeType = "text/markdown") => {
    const file: File = { id, name, mimeType, parents: [parent], version: "1", modifiedTime: "2099-01-01T00:00:00Z", content };
    files.set(id, file); return file;
  };
  add("jot", "jot", "root", "", folderType);
  add("agents", "AGENTS.md", "jot");
  add("daily", "Daily Notes", "jot", "", folderType);
  const requests: Array<{ url: URL; method: string; headers: Headers; body: string }> = [];
  let onPut: ((file: File) => number | undefined) | undefined;
  let paginate = false;
  const fetch = vi.fn(async (input: RequestInfo | URL, init: RequestInit = {}) => {
    const url = new URL(String(input));
    const method = init.method ?? "GET";
    const headers = new Headers(init.headers);
    const body = String(init.body ?? "");
    requests.push({ url, method, headers, body });
    if (init.signal?.aborted) throw new DOMException("Aborted", "AbortError");
    const json = (value: unknown, status = 200) => new Response(JSON.stringify(value), { status, headers: { "Content-Type": "application/json" } });
    const metadata = (file: File) => ({ ...file, size: String(new TextEncoder().encode(file.content).length) });
    const v2 = (file: File) => ({ id: file.id, version: file.version, modifiedDate: file.modifiedTime, etag: `"${file.id}:${file.version}"` });
    if (url.pathname === "/drive/v3/files" && method === "GET") {
      const query = url.searchParams.get("q")!;
      const parent = query.match(/^'([^']+)' in parents/)![1]!;
      const name = query.match(/name = '([^']+)'/)?.[1];
      const mime = query.match(/mimeType = '([^']+)'/)![1]!;
      const matches = [...files.values()].filter((file) => !file.trashed && file.parents.includes(parent)
        && file.mimeType === mime && (name === undefined || file.name === name));
      if (paginate && parent === "daily" && matches.length > 1) {
        return url.searchParams.has("pageToken") ? json({ files: matches.slice(1).map(metadata) })
          : json({ files: matches.slice(0, 1).map(metadata), nextPageToken: "second" });
      }
      return json({ files: matches.map(metadata) });
    }
    if (url.pathname === "/drive/v3/files" && method === "POST") {
      const data = JSON.parse(body);
      return json(metadata(add(`created-${++serial}`, data.name, data.parents?.[0] ?? "root", "", data.mimeType)));
    }
    if (url.pathname === "/upload/drive/v3/files" && method === "POST") {
      const boundary = headers.get("Content-Type")!.split("boundary=")[1]!;
      const parts = body.split(`--${boundary}`);
      const data = JSON.parse(parts[1]!.split("\r\n\r\n")[1]!);
      const content = parts[2]!.slice(parts[2]!.indexOf("\r\n\r\n") + 4).replace(/\r\n$/, "");
      return json(metadata(add(`created-${++serial}`, data.name, data.parents[0], content, data.mimeType)));
    }
    const id = decodeURIComponent(url.pathname.split("/").at(-1)!);
    const file = files.get(id);
    if (!file || file.trashed) return json({ error: "not found" }, 404);
    if (url.pathname.startsWith("/drive/v3/files/") && url.searchParams.get("alt") === "media") return new Response(file.content);
    if (url.pathname.startsWith("/drive/v2/files/") && method === "GET") return json(v2(file));
    if (url.pathname.startsWith("/upload/drive/v2/files/") && method === "PUT") {
      const status = onPut?.(file);
      if (status) return json({ error: "injected failure" }, status);
      if (headers.get("If-Match") !== v2(file).etag) return json({}, 412);
      file.content = body; file.version = String(Number(file.version) + 1);
      return json(v2(file));
    }
    if (url.pathname.startsWith("/drive/v2/files/") && method === "PATCH") {
      if (headers.get("If-Match") !== v2(file).etag) return json({}, 412);
      expect(JSON.parse(body)).toEqual({ labels: { trashed: true } });
      file.trashed = true; return json(v2(file));
    }
    if (url.pathname.startsWith("/upload/drive/v3/files/") && method === "PATCH") {
      file.content = body; file.version = String(Number(file.version) + 1); return json(metadata(file));
    }
    throw new Error(`Unexpected ${method} ${url}`);
  });
  const provider = new GoogleDriveStorageProvider({ getAccessToken: async () => "test-token" }, fetch as typeof globalThis.fetch);
  const maintain = () => provider.maintainTagIndex(new AbortController().signal);
  const indexes = () => [...files.values()].filter((file) => !file.trashed && file.name.endsWith(".md")
    && file.parents.some((id) => files.get(id)?.name === "tag-index"));
  return { files, add, requests, fetch, provider, maintain, indexes, setOnPut: (fn: typeof onPut) => { onPut = fn; },
    paginate: () => { paginate = true; } };
}

it("creates a separate folder and Markdown indexes with authenticated scoped metadata/media requests", async () => {
  const f = fixture();
  f.add("note-a", "2030-02-01.md", "daily", "A [#work](jot:tag/work)");
  f.add("note-b", "2030-02-02.md", "daily", "B [#work](jot:tag/work)");
  f.add("not-note", "notes.md", "daily", "Ignore [#wrong](jot:tag/wrong)");
  f.paginate();
  await f.maintain();
  expect(f.indexes().map((file) => [file.name, file.content])).toEqual([["work.md", "2030-02-01 A  \n2030-02-02 B  \n"]]);
  expect(f.requests.every((request) => request.headers.get("Authorization") === "Bearer test-token")).toBe(true);
  const folder = f.requests.find((request) => request.method === "POST" && request.body.includes('"name":"tag-index"'))!;
  expect(folder.url.pathname).toBe("/drive/v3/files");
  expect(JSON.parse(folder.body)).toMatchObject({ mimeType: folderType, parents: ["jot"] });
  const create = f.requests.find((request) => request.url.pathname === "/upload/drive/v3/files")!;
  expect(create.method).toBe("POST"); expect(create.url.searchParams.get("uploadType")).toBe("multipart");
  expect(create.headers.get("Content-Type")).toContain("multipart/related; boundary=");
  expect(create.body).toContain('"name":"work.md","mimeType":"text/markdown"');
  expect(create.body).toContain('"appProperties":{"jotType":"tag-index","tag":"work"}');
  expect(create.body).toContain('"parents":["created-11"]');
  expect(create.body).toContain("Content-Type: text/markdown; charset=UTF-8");
  expect(f.requests.some((request) => request.url.searchParams.get("pageToken") === "second")).toBe(true);
  expect(f.requests.filter((request) => request.url.searchParams.get("q")?.includes("'daily' in parents"))
    .every((request) => request.url.searchParams.get("q")!.includes("trashed = false"))).toBe(true);
});

it("is idempotent, caches unchanged note media, detects external edits and conditionally updates/removes indexes", async () => {
  const f = fixture();
  const note = f.add("note", "2030-02-01.md", "daily", "Old [#work](jot:tag/work)");
  await f.maintain();
  f.requests.length = 0;
  await f.maintain();
  expect(f.requests.filter((request) => request.method !== "GET")).toEqual([]);
  expect(f.requests.some((request) => request.url.pathname.endsWith("/note") && request.url.searchParams.has("alt"))).toBe(false);
  note.content = "New [#work](jot:tag/work)"; note.version = "2";
  await f.maintain();
  const update = f.requests.find((request) => request.method === "PUT")!;
  expect(update.url.pathname).toMatch(/^\/upload\/drive\/v2\/files\//);
  expect(update.url.searchParams.get("uploadType")).toBe("media");
  expect(update.headers.get("If-Match")).toMatch(/^"created-\d+:1"$/);
  expect(update.headers.get("Content-Type")).toBe("text/markdown; charset=UTF-8");
  expect(update.body).toBe("2030-02-01 New  \n");
  note.trashed = true;
  await f.maintain();
  expect(f.indexes()).toEqual([]);
  const retire = f.requests.find((request) => request.method === "PATCH")!;
  expect(retire.url.pathname).toContain("/drive/v2/files/");
  expect(retire.headers.get("If-Match")).toContain(":2");
  expect(JSON.parse(retire.body)).toEqual({ labels: { trashed: true } });
});

it("retries 412 races and uses current settings when regenerating all excerpts", async () => {
  const f = fixture();
  f.add("settings", "settings.json", "jot", JSON.stringify({ tagIndexMaxCharacters: 4 }), "application/json");
  const note = f.add("note", "2030-02-01.md", "daily", "Original [#work](jot:tag/work)");
  await f.maintain();
  expect(f.indexes()[0]!.content).toBe("2030-02-01 Ori…  \n");
  await f.provider.saveSettings({ ...DEFAULT_JOT_SETTINGS, tagIndexMaxCharacters: 6 });
  let raced = false;
  f.setOnPut((index) => {
    if (raced) return;
    raced = true; index.version = "10";
    note.content = "Latest [#work](jot:tag/work)"; note.version = "2";
    return 412;
  });
  await f.maintain();
  expect(f.indexes()[0]!.content).toBe("2030-02-01 Latest  \n");
  const settingsSave = f.requests.find((request) => request.url.pathname.endsWith("/settings") && request.method === "PATCH")!;
  expect(settingsSave.headers.get("Content-Type")).toBe("application/json; charset=UTF-8");
  expect(JSON.parse(settingsSave.body).tagIndexMaxCharacters).toBe(6);
});

it("repairs duplicates across concurrently created folders without touching Daily Notes", async () => {
  const f = fixture();
  f.add("folder-a", "tag-index", "jot", "", folderType);
  f.add("folder-b", "tag-index", "jot", "", folderType);
  f.add("index-a", "work.md", "folder-a", "stale");
  f.add("index-b", "work.md", "folder-b", "other");
  f.add("note", "2030-02-01.md", "daily", "Source [#work](jot:tag/work)");
  await f.maintain();
  expect(f.indexes().map((file) => file.id)).toEqual(["index-a"]);
  expect(f.indexes()[0]!.content).toBe("2030-02-01 Source  \n");
  expect(f.requests.filter((request) => request.method !== "GET").every((request) => !request.url.pathname.endsWith("/note"))).toBe(true);
});

it("leaves notes safe on index errors and rebuilds after failure or missing generated files", async () => {
  const f = fixture();
  const note = f.add("note", "2030-02-01.md", "daily", "Old [#work](jot:tag/work)");
  await f.maintain();
  note.content = "New [#work](jot:tag/work)"; note.version = "2";
  f.setOnPut(() => 503);
  await expect(f.maintain()).rejects.toMatchObject({ status: 503 });
  expect(note.content).toBe("New [#work](jot:tag/work)");
  f.setOnPut(undefined);
  await f.maintain();
  expect(f.indexes()[0]!.content).toBe("2030-02-01 New  \n");
  f.files.delete(f.indexes()[0]!.id);
  await f.maintain();
  expect(f.indexes()[0]!.content).toBe("2030-02-01 New  \n");
});

it("does not mutate generated files if disposed while conditional metadata is pending", async () => {
  const f = fixture();
  const note = f.add("note", "2030-02-01.md", "daily", "Old [#work](jot:tag/work)");
  await f.maintain();
  note.content = "New [#work](jot:tag/work)"; note.version = "2";
  let release!: () => void;
  let started!: () => void;
  const pending = new Promise<void>((resolve) => { release = resolve; });
  const ready = new Promise<void>((resolve) => { started = resolve; });
  const provider = new GoogleDriveStorageProvider({ getAccessToken: async () => "test-token" }, (async (url, init) => {
    if (String(url).includes("/drive/v2/files/")) { started(); await pending; }
    return await f.fetch(url, init);
  }) as typeof globalThis.fetch);
  const controller = new AbortController();
  const operation = provider.maintainTagIndex(controller.signal);
  await ready;
  const writes = f.requests.filter((request) => request.method !== "GET").length;
  controller.abort(); release();
  await expect(operation).rejects.toMatchObject({ name: "AbortError" });
  expect(f.requests.filter((request) => request.method !== "GET")).toHaveLength(writes);
  expect(f.indexes()[0]!.content).toBe("2030-02-01 Old  \n");
});

it("concurrent provider instances converge without losing another date's entries", async () => {
  const f = fixture();
  const note = f.add("note-a", "2030-02-01.md", "daily", "Old [#work](jot:tag/work)");
  f.add("note-b", "2030-02-02.md", "daily", "Other date [#work](jot:tag/work)");
  await f.maintain();
  note.content = "Changed [#work](jot:tag/work)"; note.version = "2";
  const second = new GoogleDriveStorageProvider({ getAccessToken: async () => "test-token" }, f.fetch as typeof globalThis.fetch);
  await Promise.all([f.maintain(), second.maintainTagIndex(new AbortController().signal)]);
  expect(f.indexes()).toHaveLength(1);
  expect(f.indexes()[0]!.content).toBe("2030-02-01 Changed  \n2030-02-02 Other date  \n");
  expect(f.files.get("note-b")!.content).toBe("Other date [#work](jot:tag/work)");
});
