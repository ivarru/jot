import "fake-indexeddb/auto";
import { withStore } from "./indexedDb";
import { FakeRemoteStorageProvider } from "./fakeRemoteStorage";

describe("FakeRemoteStorageProvider", () => {
  it("blocks every Daily Note remote operation during a simulated outage", async () => {
    const provider = new FakeRemoteStorageProvider();
    window.localStorage.setItem("jot.fakeRemoteUnavailable", "true");
    try {
      await expect(provider.loadDailyNote("2030-02-02")).rejects.toThrow("Fake remote storage is unavailable.");
      await expect(provider.listTagIndexes()).rejects.toThrow("Fake remote storage is unavailable.");
      await expect(provider.loadTagIndex("work")).rejects.toThrow("Fake remote storage is unavailable.");
      await expect(provider.listDailyNoteDates()).rejects.toThrow("Fake remote storage is unavailable.");
      await expect(provider.saveDailyNote({
        date: "2030-02-02", markdown: "offline", expectedRevisionId: null
      })).rejects.toThrow("Fake remote storage is unavailable.");
    } finally {
      window.localStorage.removeItem("jot.fakeRemoteUnavailable");
    }
  });

  it("atomically rejects one of two divergent concurrent creates", async () => {
    await withStore<undefined>("fakeRemoteNotes", "readwrite", (store) => store.clear());
    const first = new FakeRemoteStorageProvider();
    const second = new FakeRemoteStorageProvider();

    const results = await Promise.all([
      first.saveDailyNote({
        date: "2030-02-02",
        markdown: "first device",
        expectedRevisionId: null
      }),
      second.saveDailyNote({
        date: "2030-02-02",
        markdown: "second device",
        expectedRevisionId: null
      })
    ]);

    expect(results.map((result) => result.type).sort()).toEqual(["conflict", "saved"]);
    const remote = await first.loadDailyNote("2030-02-02");
    expect(remote).not.toBeNull();
    expect(results).toContainEqual({ type: "saved", note: remote });
    expect(results).toContainEqual({ type: "conflict", remote });
  });
});

it("keeps fake derived indexes separate and rebuilds them from saved settings and synced notes", async () => {
  const provider = new FakeRemoteStorageProvider();
  await withStore<undefined>("fakeRemoteNotes", "readwrite", (store) => store.clear());
  await provider.saveDailyNote({ date: "2030-02-01", markdown: "Original [#work](jot:tag/work)", expectedRevisionId: null });
  const { DEFAULT_JOT_SETTINGS } = await import("~/domain/settings");
  await provider.saveSettings({ ...DEFAULT_JOT_SETTINGS, tagIndexMaxCharacters: 4 });
  await provider.maintainTagIndex(new AbortController().signal);
  expect(await withStore("settings", "readonly", (store) => store.get("fake-tag-index")))
    .toEqual({ id: "fake-tag-index", files: { "work.md": "2030-02-01 Ori…  \n" }, modifiedTimes: { "work.md": expect.any(String) } });
  await expect(provider.listTagIndexes()).resolves.toEqual([{ tag: "work", modifiedTime: expect.any(String) }]);
  await expect(provider.loadTagIndex("work")).resolves.toBe("2030-02-01 Ori…  \n");
  await expect(provider.loadTagIndex("missing")).rejects.toThrow("no longer available");
  expect((await provider.loadDailyNote("2030-02-01"))?.markdown).toBe("Original [#work](jot:tag/work)");
});

it("preserves modification times for unchanged indexes and removes metadata with empty indexes", async () => {
  vi.useFakeTimers({ toFake: ["Date"] });
  try {
    const provider = new FakeRemoteStorageProvider();
    await withStore<undefined>("fakeRemoteNotes", "readwrite", (store) => store.clear());
    vi.setSystemTime(new Date("2030-01-01T00:00:00Z"));
    const saved = await provider.saveDailyNote({ date: "2030-02-01", markdown: "Work [#work](jot:tag/work)", expectedRevisionId: null });
    await provider.maintainTagIndex(new AbortController().signal);
    const before = await provider.listTagIndexes();
    vi.setSystemTime(new Date("2030-01-02T00:00:00Z"));
    await provider.maintainTagIndex(new AbortController().signal);
    expect(await provider.listTagIndexes()).toEqual(before);
    expect(saved.type).toBe("saved");
    if (saved.type !== "saved") throw new Error("Expected note save");
    await provider.saveDailyNote({ date: "2030-02-01", markdown: "Changed [#work](jot:tag/work)", expectedRevisionId: saved.note.revisionId });
    await provider.maintainTagIndex(new AbortController().signal);
    expect(await provider.listTagIndexes()).toEqual([{ tag: "work", modifiedTime: "2030-01-02T00:00:00.000Z" }]);
    await withStore<undefined>("fakeRemoteNotes", "readwrite", (store) => store.clear());
    await provider.maintainTagIndex(new AbortController().signal);
    expect(await provider.listTagIndexes()).toEqual([]);
  } finally { vi.useRealTimers(); }
});
