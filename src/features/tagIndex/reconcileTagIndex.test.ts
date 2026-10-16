import { reconcileTagIndex, TagIndexChangedError, type TagIndexFile, type TagIndexNoteFile, type TagIndexStorage } from "./reconcileTagIndex";

function fixture() {
  const notes: Array<{ id: string; date: TagIndexNoteFile["date"]; revision: string; markdown: string }> = [
    { id: "a", date: "2030-02-01", revision: "1", markdown: "A [#work](jot:tag/work)" },
    { id: "b", date: "2030-02-02", revision: "1", markdown: "B [#work](jot:tag/work)" }
  ];
  const files = new Map<string, TagIndexFile & { content: string }>();
  let serial = 0;
  let limit = 200;
  const storage: TagIndexStorage = {
    readSource: vi.fn(async () => ({ key: JSON.stringify([limit, notes]), maxCharacters: limit, notes: notes.map((note) => ({ ...note })) })),
    readNote: vi.fn(async (file) => notes.find((note) => note.id === file.id)!.markdown),
    listIndexes: vi.fn(async () => [...files.values()].map((file) => ({ ...file }))),
    readIndex: vi.fn(async (file) => files.get(file.id)!.content),
    writeIndex: vi.fn(async (tag, content, existing) => {
      if (existing && files.get(existing.id)?.revision !== existing.revision) return false;
      const id = existing?.id ?? `file-${++serial}`;
      files.set(id, { id, tag, content, revision: String(++serial) });
      return true;
    }),
    retireIndex: vi.fn(async (file) => {
      if (files.get(file.id)?.revision !== file.revision) return false;
      files.delete(file.id); return true;
    })
  };
  return { notes, files, storage, setLimit: (value: number) => { limit = value; } };
}
const run = (storage: TagIndexStorage) => reconcileTagIndex(storage, new AbortController().signal);

it("builds existing notes, is idempotent, and reconciles edits, deletions, settings, and missing indexes", async () => {
  const { notes, files, storage, setLimit } = fixture();
  await run(storage);
  expect([...files.values()].map((file) => file.content)).toEqual(["2030-02-01 A  \n2030-02-02 B  \n"]);
  vi.mocked(storage.writeIndex).mockClear();
  await run(storage);
  expect(storage.writeIndex).not.toHaveBeenCalled();
  notes[0]!.markdown = "Changed [#api](jot:tag/api)"; notes[0]!.revision = "2";
  notes.splice(1);
  setLimit(4);
  await run(storage);
  expect([...files.values()].map((file) => [file.tag, file.content])).toEqual([["api", "2030-02-01 Cha…  \n"]]);
  files.clear();
  await run(storage);
  expect(files.size).toBe(1);
  notes[0]!.markdown = "";
  await run(storage);
  expect(files.size).toBe(0);
});

it("retries a changed source before writing an obsolete snapshot", async () => {
  const { notes, files, storage } = fixture();
  const list = storage.listIndexes;
  storage.listIndexes = vi.fn(async () => {
    notes[0]!.markdown = "New [#work](jot:tag/work)"; notes[0]!.revision = "2";
    return await list();
  });
  await run(storage);
  expect([...files.values()][0]!.content).toBe("2030-02-01 New  \n2030-02-02 B  \n");
  expect(storage.writeIndex).toHaveBeenCalledOnce();
});

it("two clients retry a conditional conflict and retain all dates", async () => {
  const { notes, files, storage } = fixture();
  await run(storage);
  notes[0]!.markdown = "Updated [#work](jot:tag/work)";
  const write = storage.writeIndex;
  vi.mocked(storage.writeIndex).mockImplementationOnce(async () => {
    // A concurrent client updated the target after its revision was captured.
    const current = [...files.values()][0]!;
    files.set(current.id, { ...current, revision: "newer-writer" });
    return false;
  });
  await run(storage);
  expect(write).toHaveBeenCalledTimes(3);
  expect([...files.values()][0]!.content).toBe("2030-02-01 Updated  \n2030-02-02 B  \n");
});

it("cleans duplicate generated files and indexes divergent duplicate source files without mutating notes", async () => {
  const { notes, files, storage } = fixture();
  notes.push({ id: "duplicate", date: "2030-02-01", revision: "1", markdown: "Other [#work](jot:tag/work)" });
  files.set("x", { id: "x", tag: "work", revision: "1", content: "old" });
  files.set("y", { id: "y", tag: "work", revision: "1", content: "duplicate" });
  await run(storage);
  expect(files.size).toBe(1);
  expect([...files.values()][0]!.content).toContain("2030-02-01 A");
  expect([...files.values()][0]!.content).toContain("2030-02-01 Other");
  expect(notes).toHaveLength(3);
});

it("repairs partial failure on restart without requiring another note edit", async () => {
  const { notes, files, storage } = fixture();
  notes[1]!.markdown += " [#api](jot:tag/api)";
  const write = storage.writeIndex;
  vi.mocked(write).mockImplementationOnce(async (tag, content) => {
    files.set("partial", { id: "partial", tag, content, revision: "1" });
    throw new Error("Connection lost after write");
  });
  await expect(run(storage)).rejects.toThrow("Connection lost");
  await run(storage);
  expect([...files.values()].map((file) => file.tag).sort()).toEqual(["api", "work"]);
});

it("cancels pending date A work when the worker is disposed and cannot write it under date B", async () => {
  const { notes, storage } = fixture();
  let release!: (value: string) => void;
  storage.readNote = vi.fn(() => new Promise<string>((resolve) => { release = resolve; }));
  const controller = new AbortController();
  const pending = reconcileTagIndex(storage, controller.signal);
  await Promise.resolve(); await Promise.resolve();
  // Editor navigation does not participate in the worker's captured source files.
  notes[1]!.date = "2030-02-03";
  controller.abort();
  release("Late date A [#work](jot:tag/work)");
  await expect(pending).rejects.toMatchObject({ name: "AbortError" });
  expect(storage.writeIndex).not.toHaveBeenCalled();
});

it("bounds retries while content keeps changing", async () => {
  const { storage } = fixture();
  let version = 0;
  vi.mocked(storage.readSource).mockImplementation(async () => ({ key: String(version++), maxCharacters: 200, notes: [] }));
  await expect(run(storage)).rejects.toBeInstanceOf(TagIndexChangedError);
  expect(storage.writeIndex).not.toHaveBeenCalled();
});
