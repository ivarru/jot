// @vitest-environment node
import { readFileSync } from "node:fs";
import { runInNewContext } from "node:vm";
import { describe, expect, it, vi } from "vitest";

function worker() {
  const origin = "https://jot.test";
  const stores = new Map<string, Map<string, { request: Request; response: Response }>>();
  const fetch = vi.fn(async (request: Request) => new Response("PUBLIC", { headers: { "Content-Type": "text/plain" } }));
  const open = async (name: string) => {
    if (!stores.has(name)) stores.set(name, new Map());
    const entries = stores.get(name)!;
    return {
      keys: async () => [...entries.values()].map(value => value.request),
      match: async (request: Request | string) => entries.get(typeof request === "string" ? new URL(request, origin + "/jot/").href : request.url)?.response.clone(),
      put: async (request: Request | string, response: Response) => {
        const key = typeof request === "string" ? new Request(new URL(request, origin + "/jot/")) : request;
        entries.set(key.url, { request: key.clone(), response: response.clone() });
      },
      delete: async (request: Request) => entries.delete(request.url),
      addAll: async () => {}
    };
  };
  const handlers = new Map<string, (event: unknown) => void>();
  runInNewContext(readFileSync("public/sw.js", "utf8"), {
    URL, Response, Request,
    self: { location: new URL(origin + "/jot/sw.js"), clients: { claim: async () => {} }, skipWaiting: async () => {}, addEventListener: (type: string, handler: (event: unknown) => void) => handlers.set(type, handler) },
    caches: { open, keys: async () => [...stores.keys()], delete: async (key: string) => stores.delete(key) }, fetch
  });
  return {
    stores, open, fetch,
    async install() {
      const work: Promise<unknown>[] = [];
      handlers.get("install")!({ waitUntil: (promise: Promise<unknown>) => work.push(promise) });
      await Promise.all(work);
    },
    async activate() {
      const work: Promise<unknown>[] = [];
      handlers.get("activate")!({ waitUntil: (promise: Promise<unknown>) => work.push(promise) });
      await Promise.all(work);
    },
    async request(path: string, init: RequestInit = {}, navigate = false) {
      const request = new Request(new URL(path, origin + "/jot/"), init);
      if (navigate) Object.defineProperty(request, "mode", { value: "navigate" });
      const work: Promise<unknown>[] = [];
      let response: Promise<Response> | undefined;
      handlers.get("fetch")!({ request, waitUntil: (promise: Promise<unknown>) => work.push(promise), respondWith: (promise: Promise<Response>) => { response = promise; } });
      const result = await response;
      await Promise.all(work);
      return result;
    },
    urls() { return [...stores.values()].flatMap(store => [...store.keys()]); }
  };
}

describe("public shell cache privacy", () => {
  it.each(["?title=PRIVATE&text=SECRET", "manifest.webmanifest?private=SECRET", "private-note", "/other-app/private", "_build/assets/unexpected.json"])("does not persist %s", async path => {
    const sw = worker();
    await sw.request(path, {}, path.startsWith("?"));
    expect(sw.urls()).toEqual([]);
  });
  it("omits ambient credentials on public asset fetches and honors install response privacy", async () => {
    const sw = worker();
    sw.fetch.mockResolvedValue(new Response("PRIVATE", { headers: { "Cache-Control": "no-store" } }));
    await sw.install();
    expect(sw.urls()).toEqual([]);
    expect(sw.fetch.mock.calls.every(([request]) => request.credentials === "omit")).toBe(true);
    await sw.request("icons/icon.svg");
    expect(sw.fetch.mock.calls.at(-1)?.[0].credentials).toBe("omit");
  });
  it("does not persist redirects to a different destination", async () => {
    const sw = worker();
    const response = new Response("PRIVATE");
    Object.defineProperty(response, "url", { value: "https://other.test/private" });
    Object.defineProperty(response, "redirected", { value: true });
    sw.fetch.mockResolvedValue(response);
    await sw.request("manifest.webmanifest");
    expect(sw.urls()).toEqual([]);
  });
  it("does not retain explicit authorization or private/no-store responses", async () => {
    const sw = worker();
    await sw.request("manifest.webmanifest", { headers: { Authorization: "Bearer SYNTHETIC_PRIVATE" } });
    for (const policy of ["private, max-age=600", "no-store"]) {
      sw.fetch.mockResolvedValue(new Response("PRIVATE_BODY", { headers: { "Cache-Control": policy } }));
      await sw.request("manifest.webmanifest");
    }
    expect(sw.urls()).toEqual([]);
  });
  it.each(["", "index.html", "manifest.webmanifest", "icons/icon.svg", "_build/assets/app-123.js", "_build/assets/math-123.css", "_build/assets/KaTeX-123.woff2"])("retains public asset %s for offline use", async path => {
    const sw = worker();
    await sw.request(path);
    expect(sw.urls()).toContain(new URL(path, "https://jot.test/jot/").href);
    sw.fetch.mockRejectedValue(new Error("offline"));
    expect(await (await sw.request(path))?.text()).toBe("PUBLIC");
  });
  it("purges old private entries while preserving neighboring legacy keys and migrating assets", async () => {
    const sw = worker();
    const legacy = await sw.open("jot-shell-v6");
    await legacy.put("?title=PRIVATE", new Response("SHELL"));
    await legacy.put("_build/assets/old.woff2", new Response("FONT"));
    await legacy.put("/other-app/?text=NEIGHBOR", new Response("NEIGHBOR"));
    await legacy.put("/jot/neighbor/?text=NESTED_NEIGHBOR", new Response("NESTED_NEIGHBOR"));
    const old = await sw.open("jot-shell:%2Fjot%2F:v7");
    await old.put("private-note", new Response("PRIVATE_BODY"));
    await old.put("_build/assets/old.js", new Response("SCRIPT"));
    await sw.activate();
    expect(sw.urls()).not.toContain("https://jot.test/jot/?title=PRIVATE");
    expect(sw.urls()).not.toContain("https://jot.test/jot/private-note");
    expect(sw.urls()).toContain("https://jot.test/other-app/?text=NEIGHBOR");
    expect(sw.urls()).toContain("https://jot.test/jot/neighbor/?text=NESTED_NEIGHBOR");
    sw.fetch.mockRejectedValue(new Error("offline"));
    expect(await (await sw.request("_build/assets/old.js"))?.text()).toBe("SCRIPT");
    expect(await (await sw.request("_build/assets/old.woff2"))?.text()).toBe("FONT");
  });
});
