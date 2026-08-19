import { performGoogleTokenRenewal, shouldSyncVisibleEditsBeforeRenewal } from "./googleTokenRenewal";

describe("performGoogleTokenRenewal", () => {
  it("syncs a dirty selected draft even when the live editor snapshot is unchanged after an error", () => {
    expect(shouldSyncVisibleEditsBeforeRenewal({
      editorSnapshotChanged: false,
      selectedDraftMatchesSnapshot: true,
      selectedDraftDirty: true,
      status: "error"
    })).toBe(true);
  });

  it("syncs an editor snapshot that is newer than its clean selected draft", () => {
    expect(shouldSyncVisibleEditsBeforeRenewal({
      editorSnapshotChanged: false,
      selectedDraftMatchesSnapshot: false,
      selectedDraftDirty: false,
      status: "synced"
    })).toBe(true);
  });

  it("silently renews a clean session without performing a final save", async () => {
    const events: string[] = [];

    const result = await performGoogleTokenRenewal({
      syncVisibleEdits: null,
      syncBackgroundDrafts: async () => {
        events.push("sync-background");
      },
      canContinue: () => true,
      editsSynced: async () => true,
      renewSilently: async () => {
        events.push("renew");
      },
      invalidateToken: () => events.push("invalidate")
    });

    expect(events).toEqual(["sync-background", "renew"]);
    expect(result).toEqual({ type: "renewed" });
  });

  it("syncs non-selected drafts before reporting whether edits survived a failed renewal", async () => {
    const events: string[] = [];
    let backgroundDraftDirty = true;

    const result = await performGoogleTokenRenewal({
      syncVisibleEdits: null,
      syncBackgroundDrafts: async () => {
        events.push("sync-background");
        backgroundDraftDirty = false;
      },
      canContinue: () => true,
      editsSynced: async () => {
        events.push("assess-edits");
        return !backgroundDraftDirty;
      },
      renewSilently: async () => {
        events.push("renew");
        throw new Error("interaction required");
      },
      invalidateToken: () => events.push("invalidate")
    });

    expect(events).toEqual(["sync-background", "renew", "invalidate", "assess-edits"]);
    expect(result).toEqual({ type: "reconnect", editsSynced: true });
  });

  it("retries with date B after switching from A while A's renewal save is pending", async () => {
    const events: string[] = [];
    let dateAIsCurrent = true;
    let retryQueued = false;

    const dateAResult = await performGoogleTokenRenewal({
      syncVisibleEdits: async () => {
        events.push("sync-visible-a");
        dateAIsCurrent = false;
      },
      syncBackgroundDrafts: async () => {
        events.push("sync-background-b");
      },
      canContinue: () => dateAIsCurrent,
      editsSynced: async () => true,
      renewSilently: async () => {
        events.push("renew");
      },
      invalidateToken: () => events.push("invalidate"),
      onAbort: () => {
        retryQueued = true;
      }
    });

    expect(dateAResult).toEqual({ type: "aborted" });
    expect(retryQueued).toBe(true);

    const dateBResult = await performGoogleTokenRenewal({
      syncVisibleEdits: async () => {
        events.push("sync-visible-b");
      },
      syncBackgroundDrafts: async () => {
        events.push("sync-background-except-b");
      },
      canContinue: () => true,
      editsSynced: async () => true,
      renewSilently: async () => {
        events.push("renew");
      },
      invalidateToken: () => events.push("invalidate")
    });

    expect(events).toEqual(["sync-visible-a", "sync-visible-b", "sync-background-except-b", "renew"]);
    expect(dateBResult).toEqual({ type: "renewed" });
  });
});
