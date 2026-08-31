import { createSignal, type Accessor } from "solid-js";
import type { IsoDate } from "~/domain/dates";
import type { LocalDraftStore, RemoteStorageProvider } from "~/storage/types";

export interface ExistingNoteDates {
  readonly dates: Accessor<ReadonlySet<IsoDate>>;
  readonly loading: Accessor<boolean>;
  readonly error: Accessor<string | null>;
  readonly refresh: () => Promise<void>;
  readonly setDateExists: (date: IsoDate, exists: boolean) => void;
  readonly cancel: () => void;
  readonly reset: () => void;
}

export function createExistingNoteDates(input: {
  readonly active: Accessor<boolean>;
  readonly authReconnectRequired: Accessor<boolean>;
  readonly drafts: LocalDraftStore;
  readonly remote: RemoteStorageProvider;
  readonly handleRemoteError: (error: unknown) => boolean;
  readonly errorMessage: (error: unknown) => string;
}): ExistingNoteDates {
  const [dates, setDates] = createSignal<ReadonlySet<IsoDate>>(new Set());
  const [loading, setLoading] = createSignal(false);
  const [error, setError] = createSignal<string | null>(null);
  let refreshGeneration = 0;

  const invalidateRefresh = (): number => {
    refreshGeneration += 1;
    return refreshGeneration;
  };

  const canApply = (generation: number): boolean => generation === refreshGeneration && input.active();

  const refresh = async () => {
    const generation = invalidateRefresh();
    setLoading(true);
    setError(null);

    try {
      const localDates = await (input.drafts.listExistingDailyNoteDates?.() ?? Promise.resolve([]));
      if (!canApply(generation)) return;
      setDates(new Set(localDates));

      if (input.authReconnectRequired()) return;

      try {
        const remoteDates = await (input.remote.listDailyNoteDates?.() ?? Promise.resolve([]));
        if (!canApply(generation)) return;
        setDates(new Set([...localDates, ...remoteDates]));
      } catch (caught: unknown) {
        if (!canApply(generation)) return;
        setError(input.handleRemoteError(caught)
          ? "Reconnect to load remote note dates."
          : input.errorMessage(caught));
      }
    } catch (caught: unknown) {
      if (canApply(generation)) setError(input.errorMessage(caught));
    } finally {
      if (generation === refreshGeneration) setLoading(false);
    }
  };

  const cancel = () => {
    invalidateRefresh();
    setLoading(false);
  };

  return {
    dates,
    loading,
    error,
    refresh,
    setDateExists: (date, exists) => {
      setDates((current) => {
        const next = new Set(current);
        if (exists) next.add(date);
        else next.delete(date);
        return next;
      });
    },
    cancel,
    reset: () => {
      cancel();
      setDates(new Set<IsoDate>());
      setError(null);
    }
  };
}
