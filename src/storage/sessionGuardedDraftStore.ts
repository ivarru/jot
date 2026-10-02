import { CancelledDailyNoteSyncError } from "~/sync/dailyNoteReplication";
import type { IsoDate } from "~/domain/dates";
import type { LocalDraft, LocalDraftStore } from "./types";

const EPOCH_KEY = "jot.accountEpoch";
const MUTATION_LOCK = "jot:local-draft-mutation";

/** Serializes draft writes with account clearing across pages in one browser. */
export class SessionGuardedDraftStore implements LocalDraftStore {
  private epoch: string;

  constructor(private readonly base: LocalDraftStore, private readonly storage: Storage | null) {
    this.epoch = storage?.getItem(EPOCH_KEY) ?? crypto.randomUUID();
    if (storage?.getItem(EPOCH_KEY) === null) storage.setItem(EPOCH_KEY, this.epoch);
  }

  adoptCurrentEpoch(): void {
    this.epoch = this.storage?.getItem(EPOCH_KEY) ?? this.epoch;
  }

  hasCurrentEpoch(): boolean {
    return this.storage?.getItem(EPOCH_KEY) === this.epoch;
  }

  async clearForSignOut(): Promise<void> {
    await this.withMutationLock(async () => {
      this.storage?.setItem(EPOCH_KEY, crypto.randomUUID());
      await this.base.clearAll();
    });
  }

  load(date: IsoDate): Promise<LocalDraft | null> { return this.base.load(date); }
  listExistingDailyNoteDates(): Promise<IsoDate[]> { return this.base.listExistingDailyNoteDates?.() ?? Promise.resolve([]); }
  listDirty(): Promise<LocalDraft[]> { return this.base.listDirty(); }
  save(draft: LocalDraft): Promise<void> { return this.mutate(() => this.base.save(draft)); }
  saveIfUnchanged(date: IsoDate, expected: LocalDraft | null, draft: LocalDraft): Promise<boolean> {
    return this.mutate(() => this.base.saveIfUnchanged(date, expected, draft));
  }
  remove(date: IsoDate): Promise<void> { return this.mutate(() => this.base.remove(date)); }
  clearAll(): Promise<void> { return this.mutate(() => this.base.clearAll()); }

  private async mutate<T>(operation: () => Promise<T>): Promise<T> {
    return this.withMutationLock(async () => {
      if (this.storage?.getItem(EPOCH_KEY) !== this.epoch) throw new CancelledDailyNoteSyncError();
      return await operation();
    });
  }

  private async withMutationLock<T>(operation: () => Promise<T>): Promise<T> {
    const manager = globalThis.navigator?.locks;
    return manager === undefined ? await operation() : await manager.request(MUTATION_LOCK, operation);
  }
}
