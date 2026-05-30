import { resolveSyncErrorRetry, type SyncErrorState } from "./syncErrorRetry";

describe("sync error retry", () => {
  it("retries a load failure as a load when the editor has not loaded", () => {
    const error: SyncErrorState = {
      message: "Drive failed",
      retry: "load-selected-note",
      date: "2030-02-01"
    };

    expect(resolveSyncErrorRetry(error, { selectedDate: "2030-02-01", loadedDate: null })).toEqual({
      type: "load-selected-note",
      date: "2030-02-01"
    });
  });

  it("does not allow save retry until the selected note is loaded", () => {
    const error: SyncErrorState = {
      message: "Drive failed",
      retry: "save-current-note",
      date: "2030-02-01"
    };

    expect(resolveSyncErrorRetry(error, { selectedDate: "2030-02-01", loadedDate: null })).toBeNull();
  });

  it("allows save retry for the currently loaded selected note", () => {
    const error: SyncErrorState = {
      message: "Drive failed",
      retry: "save-current-note",
      date: "2030-02-01"
    };

    expect(resolveSyncErrorRetry(error, { selectedDate: "2030-02-01", loadedDate: "2030-02-01" })).toEqual({
      type: "save-current-note",
      date: "2030-02-01"
    });
  });

  it("does not retry a save failure after switching to a different loaded date", () => {
    const error: SyncErrorState = {
      message: "Drive failed",
      retry: "save-current-note",
      date: "2030-02-01"
    };

    expect(resolveSyncErrorRetry(error, { selectedDate: "2030-02-02", loadedDate: "2030-02-02" })).toBeNull();
  });
});
