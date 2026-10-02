import type { IsoDate } from "~/domain/dates";
import { CancelledDailyNoteSyncError } from "~/sync/dailyNoteReplication";

/** A browser-owned lease. Nothing about ownership is persisted across page lifetimes. */
export function requestDailyNoteOwnership(
  date: IsoDate,
  onAcquired: () => void,
  onError: (error: unknown) => void
): () => Promise<void> {
  const manager = globalThis.navigator?.locks;
  if (manager === undefined) {
    // jsdom has no Web Locks implementation. Production browsers without Web Locks
    // must leave the editor read-only rather than allow an uncoordinated writer.
    if (import.meta.env.MODE === "test") onAcquired();
    else onError(new Error("This browser cannot coordinate editing across tabs."));
    return async () => {};
  }

  const abort = new AbortController();
  let release: (() => void) | null = null;
  let cancelled = false;
  const request = manager.request(`jot:daily-note:${date}`, { signal: abort.signal }, async () => {
    if (cancelled) return;
    await new Promise<void>((resolve) => {
      release = resolve;
      onAcquired();
      if (cancelled) resolve();
    });
  }).catch((error: unknown) => {
    if (!cancelled) onError(error);
  });

  return async () => {
    cancelled = true;
    abort.abort();
    release?.();
    await request;
  };
}

/** Briefly access an unowned date; cancel when an editing page owns it. */
export async function withUnownedDailyNoteAccess<T>(date: IsoDate, work: () => Promise<T>): Promise<T> {
  const manager = globalThis.navigator?.locks;
  if (manager === undefined) {
    if (import.meta.env.MODE === "test") return await work();
    throw new CancelledDailyNoteSyncError();
  }
  return await manager.request(`jot:daily-note:${date}`, { ifAvailable: true }, async (lock) => {
    if (lock === null) throw new CancelledDailyNoteSyncError();
    return await work();
  });
}

/** Run background work only when no page currently owns this date. */
export async function withAvailableDailyNoteOwnership(date: IsoDate, work: () => Promise<void>): Promise<void> {
  const manager = globalThis.navigator?.locks;
  if (manager === undefined) {
    if (import.meta.env.MODE === "test") await work();
    return;
  }
  await manager.request(`jot:daily-note:${date}`, { ifAvailable: true }, async (lock) => {
    if (lock !== null) await work();
  });
}
