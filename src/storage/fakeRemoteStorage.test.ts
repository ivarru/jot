import "fake-indexeddb/auto";
import { withStore } from "./indexedDb";
import { FakeRemoteStorageProvider } from "./fakeRemoteStorage";

describe("FakeRemoteStorageProvider", () => {
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
