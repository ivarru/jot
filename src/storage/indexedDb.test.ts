import "fake-indexeddb/auto";
import { withStore } from "./indexedDb";

describe("withStore transaction acknowledgement", () => {
  it("rejects when a request succeeds before its transaction aborts", async () => {
    const operation = withStore<IDBValidKey>("drafts", "readwrite", (store) => {
      const request = store.put({ date: "2030-01-01", markdown: "not committed" });
      request.addEventListener("success", () => store.transaction.abort());
      return request;
    });

    await expect(operation).rejects.toBeInstanceOf(DOMException);
  });

  it("rejects when a Promise-returning operation finishes before its transaction aborts", async () => {
    const operation = withStore<boolean>("drafts", "readwrite", (store) => new Promise((resolve) => {
      const request = store.put({ date: "2030-01-02", markdown: "not committed" });
      request.onsuccess = () => {
        resolve(true);
        store.transaction.abort();
      };
    }));

    await expect(operation).rejects.toBeInstanceOf(DOMException);
  });

  it("rejects request failures instead of remaining pending", async () => {
    await withStore<IDBValidKey>("drafts", "readwrite", (store) =>
      store.add({ date: "2030-01-03", markdown: "existing" })
    );

    await expect(withStore<IDBValidKey>("drafts", "readwrite", (store) =>
      store.add({ date: "2030-01-03", markdown: "duplicate" })
    )).rejects.toMatchObject({ name: "ConstraintError" });
  });

  it("rejects synchronous operation failures", async () => {
    const failure = new Error("operation failed synchronously");

    await expect(withStore("drafts", "readwrite", () => {
      throw failure;
    })).rejects.toBe(failure);
  });

  it("resolves a request result only after committed content is readable through a new operation", async () => {
    await withStore<IDBValidKey>("drafts", "readwrite", (store) =>
      store.put({ date: "2030-01-04", markdown: "committed" })
    );

    await expect(withStore<{ date: string; markdown: string } | undefined>("drafts", "readonly", (store) =>
      store.get("2030-01-04")
    )).resolves.toEqual({ date: "2030-01-04", markdown: "committed" });
  });

  it("resolves a Promise-returning operation even when the transaction completes first", async () => {
    await expect(withStore("drafts", "readonly", () => new Promise<string>((resolve) => {
      setTimeout(() => resolve("operation complete"), 0);
    }))).resolves.toBe("operation complete");
  });
});
