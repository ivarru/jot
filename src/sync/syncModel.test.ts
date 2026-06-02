import { createDraft } from "~/storage/localDraftStore";
import type { IsoDate } from "~/domain/dates";
import type { DateBoundEditorState } from "~/editor/dateBoundEditor";
import type { JotSettings } from "~/domain/settings";
import type {
  LocalDraft,
  LocalDraftStore,
  RemoteDailyNote,
  RemoteStorageProvider,
  SaveDailyNoteInput,
  SaveDailyNoteResult
} from "~/storage/types";
import {
  loadCleanDailyNoteRefresh,
  loadDailyNoteSession,
  persistLocalDraft,
  saveAndSyncDailyNoteSnapshot,
  syncDailyNote,
  type CleanDailyNoteRefresh
} from "./syncDailyNote";
import { saveSelectedDailyNoteSnapshot } from "./selectedDailyNoteSession";

const DATE: IsoDate = "2030-02-02";

type ClientName = "A" | "B";

type ModelEvent =
  | {
      readonly type: "load";
      readonly client: ClientName;
    }
  | {
      readonly type: "save";
      readonly client: ClientName;
      readonly markdown: string;
    }
  | {
      readonly type: "edit";
      readonly client: ClientName;
      readonly markdown: string;
    }
  | {
      readonly type: "persist-visible-edit";
      readonly client: ClientName;
    }
  | {
      readonly type: "start-clean-refresh";
      readonly client: ClientName;
    }
  | {
      readonly type: "finish-clean-refresh";
      readonly client: ClientName;
    }
  | {
      readonly type: "commit-clean-refresh-draft";
      readonly client: ClientName;
    }
  | {
      readonly type: "remote";
      readonly markdown: string;
    };

interface ModelFailure {
  readonly trace: readonly ModelEvent[];
  readonly message: string;
}

interface PendingCleanRefresh {
  readonly expectedCleanMarkdown: string;
  readonly refresh: CleanDailyNoteRefresh | null;
}

interface ModelClient {
  readonly drafts: MemoryDraftStore;
  visibleMarkdown: string | null;
  visibleBaselineRevisionId: string | null;
  cleanMarkdown: string | null;
  pendingCleanRefresh: PendingCleanRefresh | null;
  pendingCleanRefreshCommit: CleanDailyNoteRefresh | null;
}

class MemoryDraftStore implements LocalDraftStore {
  readonly drafts = new Map<IsoDate, LocalDraft>();

  async load(date: IsoDate): Promise<LocalDraft | null> {
    return this.drafts.get(date) ?? null;
  }

  async listDirty(): Promise<LocalDraft[]> {
    return [...this.drafts.values()].filter((draft) => draft.dirty);
  }

  async save(draft: LocalDraft): Promise<void> {
    this.drafts.set(draft.date, draft);
  }

  async saveIfUnchanged(date: IsoDate, expected: LocalDraft | null, draft: LocalDraft): Promise<boolean> {
    const current = await this.load(date);
    if (JSON.stringify(current) !== JSON.stringify(expected)) return false;

    await this.save(draft);
    return true;
  }

  async remove(date: IsoDate): Promise<void> {
    this.drafts.delete(date);
  }

  async clearAll(): Promise<void> {
    this.drafts.clear();
  }
}

class ModelRemoteStorageProvider implements RemoteStorageProvider {
  private note: RemoteDailyNote | null = null;
  private revision = 0;
  failNextSave = false;

  async loadDailyNote(date: IsoDate): Promise<RemoteDailyNote | null> {
    return this.note?.date === date ? this.note : null;
  }

  async saveDailyNote(input: SaveDailyNoteInput): Promise<SaveDailyNoteResult> {
    if (this.failNextSave) {
      this.failNextSave = false;
      throw new Error("Transient save failure");
    }

    if (this.note !== null && input.expectedRevisionId !== this.note.revisionId) {
      return {
        type: "conflict",
        remote: this.note
      };
    }

    return {
      type: "saved",
      note: this.replace(input.date, input.markdown)
    };
  }

  async loadSettings(): Promise<JotSettings | null> {
    return null;
  }

  async saveSettings(settings: JotSettings): Promise<JotSettings> {
    return settings;
  }

  peek(date: IsoDate): RemoteDailyNote | null {
    return this.note?.date === date ? this.note : null;
  }

  replace(date: IsoDate, markdown: string): RemoteDailyNote {
    this.revision += 1;
    this.note = {
      date,
      markdown,
      revisionId: `revision-${this.revision}`,
      updatedAt: "2030-01-01T00:00:00.000Z"
    };
    return this.note;
  }
}

describe("daily note sync model", () => {
  it("does not find stale clean-client refresh failures in bounded two-client traces", async () => {
    const failure = await findFirstModelFailure({
      maxDepth: 4,
      events: [
        { type: "load", client: "A" },
        { type: "load", client: "B" },
        { type: "save", client: "A", markdown: "A1" },
        { type: "save", client: "B", markdown: "B1" },
        { type: "edit", client: "A", markdown: "A2" },
        { type: "edit", client: "B", markdown: "B2" },
        { type: "persist-visible-edit", client: "A" },
        { type: "persist-visible-edit", client: "B" },
        { type: "start-clean-refresh", client: "A" },
        { type: "start-clean-refresh", client: "B" },
        { type: "finish-clean-refresh", client: "A" },
        { type: "finish-clean-refresh", client: "B" },
        { type: "commit-clean-refresh-draft", client: "A" },
        { type: "commit-clean-refresh-draft", client: "B" },
        { type: "remote", markdown: "R" }
      ]
    });

    if (failure !== null) {
      throw new Error(`${failure.message}\nTrace:\n${failure.trace.map(formatEvent).join("\n")}`);
    }
  });

  it("does not save through a clean-refresh baseline that was never visible", async () => {
    const failure = await checkTrace([
      { type: "load", client: "A" },
      { type: "save", client: "B", markdown: "remote" },
      { type: "start-clean-refresh", client: "A" },
      { type: "edit", client: "A", markdown: "local" },
      { type: "finish-clean-refresh", client: "A" },
      { type: "persist-visible-edit", client: "A" },
      { type: "save", client: "A", markdown: "local" }
    ]);

    if (failure !== null) {
      throw new Error(`${failure.message}\nTrace:\n${failure.trace.map(formatEvent).join("\n")}`);
    }
  });

  it("does not save through a clean-refresh commit that raced with an editor change", async () => {
    const failure = await checkTrace([
      { type: "load", client: "A" },
      { type: "save", client: "B", markdown: "remote" },
      { type: "start-clean-refresh", client: "A" },
      { type: "finish-clean-refresh", client: "A" },
      { type: "edit", client: "A", markdown: "local" },
      { type: "commit-clean-refresh-draft", client: "A" },
      { type: "persist-visible-edit", client: "A" },
      { type: "save", client: "A", markdown: "local" }
    ]);

    if (failure !== null) {
      throw new Error(`${failure.message}\nTrace:\n${failure.trace.map(formatEvent).join("\n")}`);
    }
  });

  it("keeps dirty local content when the remote changes before reload", async () => {
    const client = new MemoryDraftStore();
    const remote = new ModelRemoteStorageProvider();
    await loadDailyNoteSession(DATE, client, remote);
    await persistLocalDraft(DATE, "local dirty", client);
    remote.replace(DATE, "remote changed");

    await expect(loadDailyNoteSession(DATE, client, remote)).resolves.toEqual({
      markdown: "local dirty",
      status: "saved-locally"
    });
    await expect(client.load(DATE)).resolves.toMatchObject({
      markdown: "local dirty",
      dirty: true
    });
  });

  it("does not silently overwrite a newer remote revision from a stale client", async () => {
    const remote = new ModelRemoteStorageProvider();
    const clientA = new MemoryDraftStore();
    const clientB = new MemoryDraftStore();
    await loadDailyNoteSession(DATE, clientA, remote);
    await loadDailyNoteSession(DATE, clientB, remote);

    await saveAndSyncDailyNoteSnapshot(DATE, "A1", clientA, remote);
    const result = await saveAndSyncDailyNoteSnapshot(DATE, "B1", clientB, remote);

    expect(remote.peek(DATE)?.markdown).toBe("A1");
    expect(result.status).not.toBe("synced");
    await expect(clientB.load(DATE)).resolves.toMatchObject({
      dirty: true
    });
  });

  it("preserves a single client's dirty draft across a transient save failure and retry", async () => {
    const client = new MemoryDraftStore();
    const remote = new ModelRemoteStorageProvider();
    remote.failNextSave = true;

    await expect(saveAndSyncDailyNoteSnapshot(DATE, "local", client, remote)).rejects.toThrow("Transient save failure");
    await expect(client.load(DATE)).resolves.toMatchObject({
      markdown: "local",
      dirty: true
    });

    await expect(syncDailyNote(DATE, client, remote)).resolves.toEqual({
      markdown: "local",
      status: "synced"
    });
    expect(remote.peek(DATE)?.markdown).toBe("local");
  });

  it("does not let a late single-client save clean a newer local edit", async () => {
    const client = new MemoryDraftStore();
    const remote = new ModelRemoteStorageProvider();
    const saveStarted = deferred();
    const continueSave = deferred();
    const originalSave = remote.saveDailyNote.bind(remote);
    remote.saveDailyNote = async (input) => {
      saveStarted.resolve();
      await continueSave.promise;
      return await originalSave(input);
    };

    const syncing = saveAndSyncDailyNoteSnapshot(DATE, "old", client, remote);
    await saveStarted.promise;
    await client.save(createDraft(DATE, "new", "", null, true));
    continueSave.resolve();

    await expect(syncing).resolves.toEqual({
      markdown: "new",
      status: "saved-locally"
    });
    await expect(client.load(DATE)).resolves.toMatchObject({
      markdown: "new",
      dirty: true
    });
  });

  it("does not apply a stale self conflict after the visible typo is fixed again", async () => {
    const client = new MemoryDraftStore();
    const remote = new ModelRemoteStorageProvider();
    const original = "before\noriginal\nsame\nafter\n";
    const fixed = "before\nfixed\nsame\nafter\n";
    const typo = "before\ntypo\nsame\nafter\n";
    const originalNote = remote.replace(DATE, original);
    remote.replace(DATE, fixed);
    await client.save(createDraft(DATE, typo, original, originalNote.revisionId, true));
    let currentState = editorState({
      selectedDate: DATE,
      loadedDate: DATE,
      markdown: typo,
      cleanMarkdown: null,
      editorChangeEpoch: 2
    });

    const result = await saveSelectedDailyNoteSnapshot({
      snapshot: { date: DATE, markdown: typo },
      authReconnectRequired: false,
      drafts: client,
      remote,
      getState: () => currentState,
      beforeApply: () => {
        currentState = editorState({
          selectedDate: DATE,
          loadedDate: DATE,
          markdown: fixed,
          cleanMarkdown: null,
          editorChangeEpoch: 3
        });
      }
    });

    expect(result.type).toBe("saved");
    if (result.type !== "saved") return;
    expect(result.session.status).toBe("conflict");
    expect(result.transition).toBeNull();
  });

  it("does not create a remote note for a single client's unchanged empty snapshot", async () => {
    const client = new MemoryDraftStore();
    const remote = new ModelRemoteStorageProvider();

    await expect(saveAndSyncDailyNoteSnapshot(DATE, "", client, remote)).resolves.toEqual({
      markdown: "",
      status: "local-only"
    });

    expect(remote.peek(DATE)).toBeNull();
    await expect(client.load(DATE)).resolves.toMatchObject({
      markdown: "",
      dirty: false
    });
  });
});

async function findFirstModelFailure(input: {
  readonly maxDepth: number;
  readonly events: readonly ModelEvent[];
}): Promise<ModelFailure | null> {
  for (let depth = 1; depth <= input.maxDepth; depth += 1) {
    for (const trace of tracesOfDepth(input.events, depth)) {
      const failure = await checkTrace(trace);
      if (failure !== null) return failure;
    }
  }
  return null;
}

async function checkTrace(trace: readonly ModelEvent[]): Promise<ModelFailure | null> {
  const remote = new ModelRemoteStorageProvider();
  const clients: Record<ClientName, ModelClient> = {
    A: createModelClient(),
    B: createModelClient()
  };

  for (const event of trace) {
    if (event.type === "remote") {
      remote.replace(DATE, event.markdown);
      continue;
    }

    const client = clients[event.client];
    if (event.type === "edit") {
      client.visibleMarkdown = event.markdown;
      client.cleanMarkdown = null;
      continue;
    }

    if (event.type === "persist-visible-edit") {
      if (client.visibleMarkdown === null) continue;
      await persistLocalDraft(DATE, client.visibleMarkdown, client.drafts);
      continue;
    }

    if (event.type === "save") {
      const failure = await checkSaveUsesVisibleBaseline(event.client, client, remote, trace);
      if (failure !== null) return failure;
      const session = await saveAndSyncDailyNoteSnapshot(DATE, event.markdown, client.drafts, remote).catch(() => null);
      if (session !== null) {
        client.visibleMarkdown = session.markdown;
        client.cleanMarkdown = isCleanSession(session.status) ? session.markdown : null;
        client.visibleBaselineRevisionId = (await client.drafts.load(DATE))?.baselineRevisionId ?? null;
      }
      continue;
    }

    if (event.type === "start-clean-refresh") {
      if (client.cleanMarkdown === null || client.visibleMarkdown === null) {
        client.pendingCleanRefresh = null;
        continue;
      }

      const beforeDraft = await client.drafts.load(DATE);
      const refresh = await loadCleanDailyNoteRefresh(DATE, client.drafts, remote);
      const afterDraft = await client.drafts.load(DATE);
      if (JSON.stringify(afterDraft) !== JSON.stringify(beforeDraft)) {
        return {
          trace,
          message: `Clean refresh read for client ${event.client} mutated the local draft before the refresh was applied.`
        };
      }
      client.pendingCleanRefresh = {
        expectedCleanMarkdown: client.cleanMarkdown,
        refresh
      };
      continue;
    }

    if (event.type === "finish-clean-refresh") {
      const pending = client.pendingCleanRefresh;
      client.pendingCleanRefresh = null;
      if (pending?.refresh === null || pending === null) continue;

      if (client.visibleMarkdown !== pending.expectedCleanMarkdown || client.cleanMarkdown !== pending.expectedCleanMarkdown) {
        continue;
      }
      client.visibleMarkdown = pending.refresh.markdown;
      client.cleanMarkdown = pending.refresh.markdown;
      client.visibleBaselineRevisionId = pending.refresh.baselineRevisionId;
      client.pendingCleanRefreshCommit = pending.refresh;
      continue;
    }

    if (event.type === "commit-clean-refresh-draft") {
      const pending = client.pendingCleanRefreshCommit;
      client.pendingCleanRefreshCommit = null;
      if (pending === null) continue;

      const currentDraft = await client.drafts.load(DATE);
      if (currentDraft?.dirty) continue;
      await client.drafts.saveIfUnchanged(DATE, currentDraft, createDraft(
        DATE,
        pending.markdown,
        pending.baselineMarkdown,
        pending.baselineRevisionId,
        false
      ));
      continue;
    }

    if (event.type === "load") {
      const beforeDraft = await client.drafts.load(DATE);
      const session = await loadDailyNoteSession(DATE, client.drafts, remote);
      const afterDraft = await client.drafts.load(DATE);
      const remoteNote = remote.peek(DATE);
      client.visibleMarkdown = session.markdown;
      client.cleanMarkdown = isCleanSession(session.status) ? session.markdown : null;
      client.visibleBaselineRevisionId = afterDraft?.baselineRevisionId ?? null;
      if (beforeDraft !== null && !beforeDraft.dirty && remoteNote !== null && session.markdown !== remoteNote.markdown) {
        return {
          trace,
          message: `Clean client ${event.client} loaded ${JSON.stringify(session.markdown)} while remote was ${JSON.stringify(remoteNote.markdown)}.`
        };
      }
    }
  }

  return null;
}

async function checkSaveUsesVisibleBaseline(
  clientName: ClientName,
  client: ModelClient,
  remote: ModelRemoteStorageProvider,
  trace: readonly ModelEvent[]
): Promise<ModelFailure | null> {
  const draft = await client.drafts.load(DATE);
  const remoteNote = remote.peek(DATE);
  if (
    draft?.dirty &&
    remoteNote !== null &&
    draft.baselineRevisionId === remoteNote.revisionId &&
    client.visibleBaselineRevisionId !== remoteNote.revisionId
  ) {
    return {
      trace,
      message: `Client ${clientName} is about to save using remote revision ${remoteNote.revisionId}, but that revision was never visible in the editor.`
    };
  }
  return null;
}

function createModelClient(): ModelClient {
  return {
    drafts: new MemoryDraftStore(),
    visibleMarkdown: null,
    visibleBaselineRevisionId: null,
    cleanMarkdown: null,
    pendingCleanRefresh: null,
    pendingCleanRefreshCommit: null
  };
}

function editorState(overrides: Partial<DateBoundEditorState>): DateBoundEditorState {
  return {
    selectedDate: null,
    loadedDate: null,
    markdown: "",
    cleanMarkdown: null,
    editorChangeEpoch: 0,
    ...overrides
  };
}

function isCleanSession(status: string): boolean {
  return status === "synced" || status === "local-only";
}

function tracesOfDepth(events: readonly ModelEvent[], depth: number): ModelEvent[][] {
  if (depth === 0) return [[]];
  return tracesOfDepth(events, depth - 1).flatMap((trace) => events.map((event) => [...trace, event]));
}

function formatEvent(event: ModelEvent): string {
  switch (event.type) {
    case "load":
      return `${event.client}: load`;
    case "save":
      return `${event.client}: save ${JSON.stringify(event.markdown)}`;
    case "edit":
      return `${event.client}: edit ${JSON.stringify(event.markdown)}`;
    case "persist-visible-edit":
      return `${event.client}: persist visible edit`;
    case "start-clean-refresh":
      return `${event.client}: start clean refresh`;
    case "finish-clean-refresh":
      return `${event.client}: finish clean refresh`;
    case "commit-clean-refresh-draft":
      return `${event.client}: commit clean refresh draft`;
    case "remote":
      return `remote: set ${JSON.stringify(event.markdown)}`;
  }
}

function deferred(): { readonly promise: Promise<void>; readonly resolve: () => void };
function deferred<T>(): { readonly promise: Promise<T>; readonly resolve: (value: T) => void };
function deferred<T>(): { readonly promise: Promise<T>; readonly resolve: (value?: T) => void } {
  let resolve!: (value?: T) => void;
  const promise = new Promise<T>((innerResolve) => {
    resolve = innerResolve as (value?: T) => void;
  });
  return { promise, resolve };
}
