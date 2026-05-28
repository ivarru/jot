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

  async remove(date: IsoDate): Promise<void> {
    await withStore<undefined>("drafts", "readwrite", (store) => store.delete(date));
  }

  async clearAll(): Promise<void> {
    await withStore<undefined>("drafts", "readwrite", (store) => store.clear());
  }
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
