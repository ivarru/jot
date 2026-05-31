import type { IsoDate } from "~/domain/dates";
import type { LocalDraft, LocalDraftStore } from "./types";
import { withStore } from "./indexedDb";

export class IndexedDbLocalDraftStore implements LocalDraftStore {
  async load(date: IsoDate): Promise<LocalDraft | null> {
    return (await withStore<LocalDraft | undefined>("drafts", "readonly", (store) => store.get(date))) ?? null;
  }

  async listDirty(): Promise<LocalDraft[]> {
    const drafts = await withStore<LocalDraft[]>("drafts", "readonly", (store) => store.getAll());
    return drafts.filter((draft) => draft.dirty);
  }

  async save(draft: LocalDraft): Promise<void> {
    await withStore<IDBValidKey>("drafts", "readwrite", (store) => store.put(draft));
  }

  async saveIfUnchanged(date: IsoDate, expected: LocalDraft | null, draft: LocalDraft): Promise<boolean> {
    return await withStore<boolean>("drafts", "readwrite", async (store) => {
      const current = (await idbRequestToPromise<LocalDraft | undefined>(store.get(date))) ?? null;
      if (!draftsEqual(current, expected)) return false;

      await idbRequestToPromise<IDBValidKey>(store.put(draft));
      return true;
    });
  }

  async remove(date: IsoDate): Promise<void> {
    await withStore<undefined>("drafts", "readwrite", (store) => store.delete(date));
  }

  async clearAll(): Promise<void> {
    await withStore<undefined>("drafts", "readwrite", (store) => store.clear());
  }
}

function idbRequestToPromise<T>(request: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

function draftsEqual(left: LocalDraft | null, right: LocalDraft | null): boolean {
  if (left === null || right === null) return left === right;
  return (
    left.date === right.date &&
    left.markdown === right.markdown &&
    left.baselineMarkdown === right.baselineMarkdown &&
    left.baselineRevisionId === right.baselineRevisionId &&
    left.dirty === right.dirty &&
    left.updatedAt === right.updatedAt
  );
}

export function createDraft(
  date: IsoDate,
  markdown: string,
  baselineMarkdown: string,
  baselineRevisionId: string | null,
  dirty: boolean
): LocalDraft {
  return {
    date,
    markdown,
    baselineMarkdown,
    baselineRevisionId,
    dirty,
    updatedAt: new Date().toISOString()
  };
}
