import { DEFAULT_JOT_SETTINGS } from "~/domain/settings";
import {
  nextSyncRetryDelayMs,
  shouldScheduleSyncRetry,
  shouldShowUnsyncedWarning,
  shouldTrackUnsyncedSince
} from "./syncScheduling";

describe("sync scheduling", () => {
  it("backs off retries up to the configured maximum", () => {
    expect(nextSyncRetryDelayMs(0, DEFAULT_JOT_SETTINGS)).toBe(5000);
    expect(nextSyncRetryDelayMs(1, DEFAULT_JOT_SETTINGS)).toBe(10000);
    expect(nextSyncRetryDelayMs(20, DEFAULT_JOT_SETTINGS)).toBe(300000);
  });

  it("tracks unsynced states that need user visibility", () => {
    expect(shouldTrackUnsyncedSince("saved-locally")).toBe(true);
    expect(shouldTrackUnsyncedSince("syncing")).toBe(true);
    expect(shouldTrackUnsyncedSince("error")).toBe(true);
    expect(shouldTrackUnsyncedSince("auth-required")).toBe(true);
    expect(shouldTrackUnsyncedSince("synced")).toBe(false);
    expect(shouldTrackUnsyncedSince("local-only")).toBe(false);
  });

  it("does not schedule stale retries during an active sync", () => {
    expect(
      shouldScheduleSyncRetry({
        hasSyncError: true,
        authenticated: true,
        authReconnectRequired: false,
        syncStatus: "syncing"
      })
    ).toBe(false);
    expect(
      shouldScheduleSyncRetry({
        hasSyncError: true,
        authenticated: true,
        authReconnectRequired: false,
        syncStatus: "error"
      })
    ).toBe(true);
  });

  it("shows the delayed sync warning after two minutes", () => {
    expect(shouldShowUnsyncedWarning("saved-locally", 1000, 120999)).toBe(false);
    expect(shouldShowUnsyncedWarning("saved-locally", 1000, 121000)).toBe(true);
    expect(shouldShowUnsyncedWarning("synced", 1000, 121000)).toBe(false);
  });
});
