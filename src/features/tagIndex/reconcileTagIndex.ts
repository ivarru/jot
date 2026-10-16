import type { IsoDate } from "~/domain/dates";
import { createConflictMarkdown } from "~/domain/merge";
import { buildTagIndexFiles } from "~/domain/tagIndex";

export interface TagIndexNoteFile {
  readonly id: string;
  readonly date: IsoDate;
  readonly revision: string;
}
export interface TagIndexFile {
  readonly id: string;
  readonly tag: string;
  readonly revision: string;
}
export interface TagIndexSource {
  readonly key: string;
  readonly maxCharacters: number;
  readonly notes: readonly TagIndexNoteFile[];
}
export interface TagIndexStorage {
  readSource(): Promise<TagIndexSource>;
  readNote(file: TagIndexNoteFile): Promise<string>;
  listIndexes(): Promise<readonly TagIndexFile[]>;
  readIndex(file: TagIndexFile): Promise<string>;
  writeIndex(tag: string, content: string, existing: TagIndexFile | null): Promise<boolean>;
  retireIndex(file: TagIndexFile): Promise<boolean>;
}

export class TagIndexChangedError extends Error {
  constructor() { super("Notes or tag indexes changed during maintenance. Will retry."); }
}

/** Full reconciliation makes failed/interrupted writes and externally removed tags repairable without a local log. */
export async function reconcileTagIndex(storage: TagIndexStorage, signal: AbortSignal): Promise<void> {
  for (let attempt = 0; attempt < 3; attempt++) {
    signal.throwIfAborted();
    const source = await storage.readSource();
    const byDate = new Map<IsoDate, string>();
    for (const file of source.notes) {
      signal.throwIfAborted();
      const content = await storage.readNote(file);
      const previous = byDate.get(file.date);
      byDate.set(file.date, previous === undefined || previous === content ? content : createConflictMarkdown(previous, content));
    }
    const desired = buildTagIndexFiles([...byDate].map(([date, markdown]) => ({ date, markdown })), source.maxCharacters);
    const files = await storage.listIndexes();
    const contents = new Map<string, string>();
    for (const file of files) {
      signal.throwIfAborted();
      contents.set(file.id, await storage.readIndex(file));
    }
    // Capture target revisions BEFORE validating the source, so an older worker cannot overwrite a newer writer.
    if ((await storage.readSource()).key !== source.key) continue;
    let changed = false;
    for (const [tag, content] of desired) {
      signal.throwIfAborted();
      const matches = files.filter((file) => file.tag === tag).sort((a, b) => a.id.localeCompare(b.id));
      const canonical = matches[0] ?? null;
      if ((!canonical || contents.get(canonical.id) !== content)
        && !await storage.writeIndex(tag, content, canonical)) { changed = true; break; }
      for (const duplicate of matches.slice(1)) {
        signal.throwIfAborted();
        if (!await storage.retireIndex(duplicate)) { changed = true; break; }
      }
      if (changed) break;
    }
    if (!changed) for (const obsolete of files.filter((file) => !desired.has(file.tag))) {
      signal.throwIfAborted();
      if (!await storage.retireIndex(obsolete)) { changed = true; break; }
    }
    signal.throwIfAborted();
    if (!changed && (await storage.readSource()).key === source.key) return;
  }
  throw new TagIndexChangedError();
}
