import { createComputed, createRoot } from "solid-js";
import { createTagIndexCatalog } from "./tagIndexCatalog";
import type { TagIndexSummary } from "./types";

beforeEach(() => localStorage.clear());
const entries: TagIndexSummary[] = [
  { tag: "alpha", modifiedTime: "2030-01-01T00:00:00Z" },
  { tag: "zebra", modifiedTime: "2030-02-01T00:00:00Z" },
  { tag: "unknown", modifiedTime: null }
];
it("caches index metadata, defaults to recent order, and shares alphabetic ordering", async () => {
  await createRoot(async (dispose) => {
    const catalog = createTagIndexCatalog({ storage: localStorage, list: async () => entries });
    await catalog.refresh();
    expect(catalog.tags()).toEqual(["zebra", "alpha", "unknown"]);
    catalog.setAlphabetical(true);
    expect(catalog.tags()).toEqual(["alpha", "unknown", "zebra"]);
    const reopened = createRoot(() => createTagIndexCatalog({ storage: localStorage, list: async () => [] }));
    expect(reopened.tags()).toEqual(["zebra", "alpha", "unknown"]);
    await catalog.refresh(); expect(catalog.alphabetical()).toBe(true);
    dispose();
  });
});
it("retains cached tags during failed refreshes and removes deleted indexes on success", async () => {
  await createRoot(async (dispose) => {
    const list = vi.fn().mockResolvedValueOnce(entries).mockRejectedValueOnce(new Error("offline")).mockResolvedValueOnce([]);
    const catalog = createTagIndexCatalog({ list });
    await catalog.refresh(); await catalog.refresh();
    expect(catalog.tags()).toEqual(["zebra", "alpha", "unknown"]);
    expect(catalog.error()).toBe("offline");
    await catalog.refresh(); expect(catalog.tags()).toEqual([]); expect(catalog.error()).toBeNull();
    dispose();
  });
});
it("ignores superseded responses and pending responses after sign-out", async () => {
  await createRoot(async (dispose) => {
    const pending: Array<(entries: readonly TagIndexSummary[]) => void> = [];
    const catalog = createTagIndexCatalog({ storage: localStorage, list: () => new Promise((resolve) => pending.push(resolve)) });
    const first = catalog.refresh(); const second = catalog.refresh();
    pending[1]!(entries); await second; pending[0]!([]); await first;
    expect(catalog.tags()).toHaveLength(3);
    const last = catalog.refresh(); catalog.clear(); pending[2]!(entries); await last;
    expect(catalog.tags()).toEqual([]);
    expect(localStorage.getItem("jot.tagIndexCatalog.v1")).toBeNull();
    dispose();
  });
});
it("ignores malformed entries, old dismissals, and unavailable storage", async () => {
  await createRoot(async (dispose) => {
    localStorage.setItem("jot.tagSuggestions.v1", JSON.stringify({ known: ["legacy"], dismissed: ["alpha"] }));
    localStorage.setItem("jot.tagIndexCatalog.v1", "{broken");
    const catalog = createTagIndexCatalog({ storage: localStorage, list: async () => [...entries, { tag: "../bad", modifiedTime: null }] });
    expect(catalog.tags()).toEqual([]); await catalog.refresh(); expect(catalog.tags()).toContain("alpha");
    catalog.clear(); expect(localStorage.getItem("jot.tagSuggestions.v1")).toBeNull();
    dispose();
  });
});

it("does not notify tag-list consumers when a refresh leaves the names and order unchanged", async () => {
  await createRoot(async (dispose) => {
    const catalog = createTagIndexCatalog({ list: async () => entries });
    const changes = vi.fn();
    createComputed(() => { changes(catalog.tags()); });
    await catalog.refresh();
    const count = changes.mock.calls.length;
    await catalog.refresh();
    expect(changes).toHaveBeenCalledTimes(count);
    dispose();
  });
});
