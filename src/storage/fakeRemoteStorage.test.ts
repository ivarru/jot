import "fake-indexeddb/auto";
import { withStore } from "./indexedDb";
import { FakeRemoteStorageProvider } from "./fakeRemoteStorage";

describe("FakeRemoteStorageProvider", () => {
  it("blocks every Daily Note remote operation during a simulated outage", async () => {
    const provider = new FakeRemoteStorageProvider();
    window.localStorage.setItem("jot.fakeRemoteUnavailable", "true");
    try {
      await expect(provider.loadDailyNote("2030-02-02")).rejects.toThrow("Fake remote storage is unavailable.");
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
