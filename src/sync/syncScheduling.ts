import type { JotSettings } from "~/domain/settings";
import type { SyncStatus } from "~/storage/types";

export const UNSYNCED_WARNING_DELAY_MS = 2 * 60 * 1000;

export function nextSyncRetryDelayMs(attempt: number, settings: JotSettings): number {
  const multiplier = 2 ** Math.max(0, attempt);
  return Math.min(settings.retryInitialDelayMs * multiplier, settings.retryMaxDelayMs);
}

export function shouldTrackUnsyncedSince(status: SyncStatus): boolean {
  return status === "saved-locally" || status === "syncing" || status === "error" || status === "auth-required";
}

export interface SyncRetryScheduleInput {
  readonly hasSyncError: boolean;
  readonly authenticated: boolean;
  readonly authReconnectRequired: boolean;
  readonly syncStatus: SyncStatus;
}

export function shouldScheduleSyncRetry(input: SyncRetryScheduleInput): boolean {
  return input.hasSyncError && input.authenticated && !input.authReconnectRequired && input.syncStatus !== "syncing";
}

export function shouldShowUnsyncedWarning(
  status: SyncStatus,
  unsyncedSinceMs: number | null,
  nowMs: number
): boolean {
  return (
    shouldTrackUnsyncedSince(status) &&
    unsyncedSinceMs !== null &&
    nowMs - unsyncedSinceMs >= UNSYNCED_WARNING_DELAY_MS
  );
}
