import type { LocalDraftStore, RemoteStorageProvider } from "~/storage/types";
import { createExistingNoteDates } from "./createExistingNoteDates";

describe("createExistingNoteDates", () => {
  it("merges local and remote Daily Note dates", async () => {
    const workflow = createWorkflow({
      drafts: storeWithDates(["2030-02-01"]),
      remote: remoteWithDates(["2030-02-02"])
    });

    await workflow.refresh();

    expect([...workflow.dates()]).toEqual(["2030-02-01", "2030-02-02"]);
    expect(workflow.loading()).toBe(false);
    expect(workflow.error()).toBeNull();
  });

  it("keeps local dates and skips the remote provider while reconnect is required", async () => {
    const remote = remoteWithDates(["2030-02-02"]);
    const remoteDates = vi.spyOn(remote, "listDailyNoteDates");
    const workflow = createWorkflow({
      authReconnectRequired: () => true,
      drafts: storeWithDates(["2030-02-01"]),
      remote
    });

    await workflow.refresh();

    expect([...workflow.dates()]).toEqual(["2030-02-01"]);
    expect(remoteDates).not.toHaveBeenCalled();
  });

  it("ignores a delayed refresh after cancellation", async () => {
    const localDates = deferred<readonly "2030-02-01"[]>();
    const workflow = createWorkflow({
      drafts: {
        listExistingDailyNoteDates: () => localDates.promise
      } as unknown as LocalDraftStore
    });

    const refresh = workflow.refresh();
    workflow.cancel();
    localDates.resolve(["2030-02-01"]);
    await refresh;

    expect(workflow.dates().size).toBe(0);
    expect(workflow.loading()).toBe(false);
  });

  it("maps remote authentication failures to reconnect guidance", async () => {
    const workflow = createWorkflow({
      remote: {
        listDailyNoteDates: async () => {
          throw new Error("expired");
        }
      } as unknown as RemoteStorageProvider,
      handleRemoteError: () => true
    });

    await workflow.refresh();

    expect(workflow.error()).toBe("Reconnect to load remote note dates.");
  });
});

function createWorkflow(overrides: Partial<Parameters<typeof createExistingNoteDates>[0]> = {}) {
  return createExistingNoteDates({
    active: () => true,
    authReconnectRequired: () => false,
    drafts: storeWithDates([]),
    remote: remoteWithDates([]),
    handleRemoteError: () => false,
    errorMessage: (error) => (error as Error).message,
    ...overrides
  });
}

function storeWithDates(dates: readonly "2030-02-01"[]): LocalDraftStore {
  return { listExistingDailyNoteDates: async () => dates } as unknown as LocalDraftStore;
}

function remoteWithDates(dates: readonly ("2030-02-01" | "2030-02-02")[]): RemoteStorageProvider {
  return { listDailyNoteDates: async () => dates } as unknown as RemoteStorageProvider;
}

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((fulfill) => {
    resolve = fulfill;
  });
  return { promise, resolve };
}
