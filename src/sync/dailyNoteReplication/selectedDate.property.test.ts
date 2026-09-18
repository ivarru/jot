import fc from "fast-check";
import type { IsoDate } from "~/domain/dates";
import {
  applyEditorChange,
  captureVisibleDailyNoteSnapshot,
  resetSelectedDailyNoteSession,
  type DateBoundEditorState,
  type DateBoundEditorTransition,
  type VisibleDailyNoteSnapshot
} from "~/editor/dateBoundEditor";
import { createDraft } from "~/storage/localDraftStore";
import type {
  LocalDraft,
  LocalDraftStore,
  RemoteDailyNote,
  RemoteStorageProvider,
  SaveDailyNoteInput,
  SaveDailyNoteResult,
  SyncStatus
} from "~/storage/types";
import { isPropertyTestReplay, propertyTestParameters } from "~/testing/propertyTest";
import type { SyncErrorState } from "../syncErrorRetry";
import { createDailyNoteReplication, type DailyNoteReplication } from "./selectedDate";
import type { DailyNoteSyncConflict } from "./replicationCore";

const DATE_A: IsoDate = "2030-02-01";
const DATE_B: IsoDate = "2030-02-02";
const DATES = [DATE_A, DATE_B] as const;

type GateGroup = "read" | "commit" | "response";
type GateKind = "draft-read" | "draft-commit" | "draft-cas-commit" | "remote-read" | "remote-commit" | "remote-response";

type LifecycleCommand =
  | "edit"
  | "persist"
  | "save"
  | "blur"
  | "refresh"
  | "navigate"
  | "cancel"
  | "fail-next-save"
  | "remote-edit"
  | "release-read"
  | "release-commit"
  | "release-response";

const commandArbitrary = fc.array(
  fc.constantFrom<LifecycleCommand>(
    "edit",
    "persist",
    "save",
    "blur",
    "refresh",
    "navigate",
    "cancel",
    "fail-next-save",
    "remote-edit",
    "release-read",
    "release-commit",
    "release-response"
  ),
  { minLength: 12, maxLength: 30 }
);

describe("generated selected-date lifecycle", () => {
  it("preserves date and edit ownership across generated gated traces", async () => {
    const coverage = new Set<LifecycleCommand>();
    const gateCoverage = new Set<GateGroup>();

    await fc.assert(
      fc.asyncProperty(commandArbitrary, async (commands) => {
        const harness = new LifecycleHarness();
        for (const [index, command] of commands.entries()) {
          if (await harness.execute(command, index) && !command.startsWith("release-")) coverage.add(command);
          harness.assertInvariants();
        }

        await harness.settleFairly();
        for (const group of harness.releasedGateGroups) gateCoverage.add(group);
        harness.assertInvariants();
        expect(harness.pendingWork).toBe(0);
        expect(harness.outcome()).toMatch(/^(synced|conflict)$/);
      }),
      propertyTestParameters()
    );

    if (!isPropertyTestReplay()) {
      expect([...coverage].sort()).toEqual([
        "blur",
        "cancel",
        "edit",
        "fail-next-save",
        "navigate",
        "persist",
        "refresh",
        "remote-edit",
        "save"
      ]);
      expect([...gateCoverage].sort()).toEqual(["commit", "read", "response"]);
    }
  });

  it("does not let the historical queued autosave overwrite a clean refresh", async () => {
    const harness = new LifecycleHarness("* plain item");
    harness.remote.replace(DATE_A, "* [linked item](https://example.com)");
    const staleSnapshot = captureVisibleDailyNoteSnapshot(harness.state)!;

    harness.startRefresh();
    await harness.drain();
    harness.startSave(staleSnapshot);
    await harness.drain();

    expect(harness.remote.acceptedSaves).toEqual([]);
    expect(harness.state.markdown).toBe("* [linked item](https://example.com)");
    expect(harness.drafts.peek(DATE_A)).toMatchObject({
      markdown: "* [linked item](https://example.com)",
      dirty: false
    });
  });

  it("keeps a newer committed edit dirty after an older save response", async () => {
    const harness = new LifecycleHarness();
    harness.edit("newer-1");
    const older = captureVisibleDailyNoteSnapshot(harness.state)!;
    harness.startSave(older);
    await harness.releaseUntil("remote-response", false);

    harness.edit("newer-2");
    harness.startPersist();
    expect(await harness.releaseNext("read")).toBe(true);
    expect(await harness.releaseNext("commit")).toBe(true);
    expect(await harness.releaseNext("response")).toBe(true);
    await harness.drain();

    expect(harness.state.markdown).toContain("newer-2");
    expect(harness.drafts.peek(DATE_A)).toMatchObject({ markdown: expect.stringContaining("newer-2"), dirty: true });
  });

  it("cancellation prevents a pending local commit from repopulating cleared drafts", async () => {
    const harness = new LifecycleHarness();
    harness.edit("cancelled-edit");
    harness.startPersist();
    await harness.releaseUntil("draft-read", false);
    harness.sync.cancelInFlightWork();
    await harness.drafts.clearAll();
    await harness.drain();

    expect(harness.drafts.peek(DATE_A)).toBeNull();
    expect(harness.drafts.peek(DATE_B)).toBeNull();
  });

  it("retains a committed dirty draft when the remote save fails", async () => {
    const harness = new LifecycleHarness();
    harness.edit("offline-edit");
    harness.remote.failNextSave = true;
    harness.startSave();
    await harness.drain();

    expect(harness.syncStatus).toBe("error");
    expect(harness.drafts.peek(DATE_A)).toMatchObject({
      markdown: expect.stringContaining("offline-edit"),
      dirty: true
    });
  });

  it("settles an unpersisted visible edit before navigating to the other date", async () => {
    const harness = new LifecycleHarness();
    harness.edit("must-survive");

    await harness.settleFairly();

    expect(harness.remote.peek(DATE_A)?.markdown).toContain("must-survive");
    expect(harness.drafts.peek(DATE_A)).toMatchObject({
      markdown: expect.stringContaining("must-survive"),
      dirty: false
    });
  });

  it("allows an older date save response to arrive after navigation", async () => {
    const harness = new LifecycleHarness();
    harness.edit("pending-date-a");
    harness.startSave();
    await harness.releaseUntil("remote-response", false);

    await harness.navigate(DATE_B);

    expect(harness.state).toMatchObject({ selectedDate: DATE_B, loadedDate: null, markdown: "" });
    const dateBState = structuredClone(harness.state);
    const dateBDraft = structuredClone(harness.drafts.peek(DATE_B));
    expect(await harness.releaseNext("response")).toBe(true);
    expect(harness.state).toEqual(dateBState);
    expect(harness.drafts.peek(DATE_B)).toEqual(dateBDraft);

    await harness.drain();
    expect(harness.drafts.peek(DATE_A)?.markdown).toContain("pending-date-a");
  });
});

interface Gate {
  readonly kind: GateKind;
  readonly date: IsoDate;
  readonly release: () => void;
}

class GateScheduler {
  readonly pending: Gate[] = [];

  async wait(kind: GateKind, date: IsoDate): Promise<void> {
    await new Promise<void>((resolve) => {
      this.pending.push({ kind, date, release: resolve });
    });
  }

  take(group?: GateGroup): Gate | null {
    const index = this.pending.findIndex((gate) => group === undefined || gateGroup(gate.kind) === group);
    if (index < 0) return null;
    return this.pending.splice(index, 1)[0]!;
  }
}

class GatedDraftStore implements LocalDraftStore {
  private readonly drafts = new Map<IsoDate, LocalDraft>();

  constructor(private readonly gates: GateScheduler) {}

  seed(draft: LocalDraft): void {
    this.drafts.set(draft.date, draft);
  }

  peek(date: IsoDate): LocalDraft | null {
    return this.drafts.get(date) ?? null;
  }

  async load(date: IsoDate): Promise<LocalDraft | null> {
    await this.gates.wait("draft-read", date);
    return this.peek(date);
  }

  async listDirty(): Promise<LocalDraft[]> {
    return [...this.drafts.values()].filter((draft) => draft.dirty);
  }

  async save(draft: LocalDraft): Promise<void> {
    await this.gates.wait("draft-commit", draft.date);
    this.drafts.set(draft.date, draft);
  }

  async saveIfUnchanged(date: IsoDate, expected: LocalDraft | null, draft: LocalDraft): Promise<boolean> {
    await this.gates.wait("draft-cas-commit", date);
    const current = this.peek(date);
    if (!draftsEqual(current, expected)) return false;
    this.drafts.set(date, draft);
    return true;
  }

  async remove(date: IsoDate): Promise<void> {
    this.drafts.delete(date);
  }

  async clearAll(): Promise<void> {
    this.drafts.clear();
  }
}

class GatedRemoteStorage implements RemoteStorageProvider {
  readonly acceptedSaves: SaveDailyNoteInput[] = [];
  failNextSave = false;
  private revision = 0;
  private readonly notes = new Map<IsoDate, RemoteDailyNote>();

  constructor(private readonly gates: GateScheduler) {}

  peek(date: IsoDate): RemoteDailyNote | null {
    return this.notes.get(date) ?? null;
  }

  replace(date: IsoDate, markdown: string): RemoteDailyNote {
    this.revision += 1;
    const note = remoteNote(date, markdown, `revision-${this.revision}`);
    this.notes.set(date, note);
    return note;
  }

  async loadDailyNote(date: IsoDate): Promise<RemoteDailyNote | null> {
    await this.gates.wait("remote-read", date);
    return this.peek(date);
  }

  async saveDailyNote(input: SaveDailyNoteInput): Promise<SaveDailyNoteResult> {
    await this.gates.wait("remote-commit", input.date);
    if (this.failNextSave) {
      this.failNextSave = false;
      throw new Error("generated remote failure");
    }

    const current = this.peek(input.date);
    const result: SaveDailyNoteResult = current !== null && input.expectedRevisionId !== current.revisionId
      ? { type: "conflict", remote: current }
      : { type: "saved", note: this.replace(input.date, input.markdown) };
    if (result.type === "saved") this.acceptedSaves.push(input);

    // Remote acceptance happens above. Only the response is delayed here.
    await this.gates.wait("remote-response", input.date);
    return result;
  }

  async loadSettings(): Promise<null> {
    return null;
  }

  async saveSettings<T>(settings: T): Promise<T> {
    return settings;
  }
}

class LifecycleHarness {
  readonly gates = new GateScheduler();
  readonly drafts = new GatedDraftStore(this.gates);
  readonly remote = new GatedRemoteStorage(this.gates);
  readonly sync: DailyNoteReplication;
  private readonly inFlight = new Set<Promise<void>>();
  private readonly unexpectedErrors: unknown[] = [];
  private readonly expectedEditMarkers = new Map<IsoDate, string[]>();
  private visibleEditMarker: string | null = null;
  private commandIndex = 0;
  private pendingConflict: DailyNoteSyncConflict | null = null;
  readonly releasedGateGroups = new Set<GateGroup>();
  state: DateBoundEditorState;
  syncStatus: SyncStatus = "synced";
  lastSyncError: SyncErrorState | null = null;

  constructor(markdown = "seed") {
    const noteA = this.remote.replace(DATE_A, markdown);
    const noteB = this.remote.replace(DATE_B, "date-b-seed");
    this.drafts.seed(createDraft(DATE_A, markdown, markdown, noteA.revisionId, false));
    this.drafts.seed(createDraft(DATE_B, noteB.markdown, noteB.markdown, noteB.revisionId, false));
    this.state = editorState({
      selectedDate: DATE_A,
      loadedDate: DATE_A,
      markdown,
      cleanMarkdown: markdown
    });

    this.sync = createDailyNoteReplication({
      authenticated: () => true,
      authReconnectRequired: () => false,
      drafts: this.drafts,
      remote: this.remote,
      getState: () => this.state,
      getSyncStatus: () => this.syncStatus,
      getLastSyncError: () => this.lastSyncError,
      applyTransition: (transition) => this.applyTransition(transition),
      setLoadError: () => undefined,
      setLastSyncError: (error) => {
        this.lastSyncError = error;
      },
      setPendingSyncConflict: (conflict) => {
        this.pendingConflict = conflict;
      },
      setSyncStatus: (status) => {
        this.syncStatus = status;
      },
      setExistingNoteDate: () => undefined,
      handleRemoteError: () => false,
      errorMessage: (error) => error instanceof Error ? error.message : String(error)
    });
  }

  get pendingWork(): number {
    return this.inFlight.size + this.gates.pending.length;
  }

  outcome(): "synced" | "conflict" | "pending" {
    if (this.pendingConflict !== null || this.syncStatus === "conflict") return "conflict";
    return DATES.every((date) => this.drafts.peek(date)?.dirty === false) ? "synced" : "pending";
  }

  async execute(command: LifecycleCommand, index: number): Promise<boolean> {
    this.commandIndex = index;
    switch (command) {
      case "edit":
        return this.edit(`edit-${index}`);
      case "persist":
        return this.startPersist();
      case "save":
        return this.startSave();
      case "blur":
        return this.startBlur();
      case "refresh":
        return this.startRefresh();
      case "navigate":
        await this.navigate(this.state.selectedDate === DATE_A ? DATE_B : DATE_A);
        return true;
      case "cancel":
        this.sync.cancelInFlightWork();
        return true;
      case "fail-next-save":
        this.remote.failNextSave = true;
        return true;
      case "remote-edit":
        if (this.state.selectedDate === null) return false;
        if (
          this.drafts.peek(this.state.selectedDate)?.dirty === false &&
          (this.state.loadedDate !== this.state.selectedDate || this.state.cleanMarkdown === this.state.markdown)
        ) {
          // This generated external replacement deliberately supersedes content
          // that was already synchronized and has no newer visible local edit.
          this.expectedEditMarkers.delete(this.state.selectedDate);
        }
        this.remote.replace(this.state.selectedDate, `remote-${index}`);
        return true;
      case "release-read":
        return await this.releaseNext("read");
      case "release-commit":
        return await this.releaseNext("commit");
      case "release-response":
        return await this.releaseNext("response");
    }
  }

  edit(marker: string): boolean {
    if (this.state.loadedDate === null) return false;
    const date = this.state.loadedDate;
    const changed = applyEditorChange(this.state, date, `${this.state.markdown}\n${marker}`);
    if (changed.type !== "current-editor") return false;
    this.state = changed.state;
    this.visibleEditMarker = marker;
    this.expectedEditMarkers.set(date, [...(this.expectedEditMarkers.get(date) ?? []), marker]);
    return true;
  }

  startPersist(): boolean {
    const snapshot = captureVisibleDailyNoteSnapshot(this.state);
    if (snapshot === null) return false;
    this.track(this.sync.persistVisibleLocalDraft(snapshot));
    return true;
  }

  startSave(snapshot = captureVisibleDailyNoteSnapshot(this.state)): boolean {
    if (snapshot === null) return false;
    this.track(this.sync.saveAndSyncSnapshot(snapshot));
    return true;
  }

  startBlur(): boolean {
    const snapshot = captureVisibleDailyNoteSnapshot(this.state);
    if (snapshot === null) return false;
    this.track(this.sync.saveBlurSnapshot(snapshot));
    return true;
  }

  startRefresh(): boolean {
    if (this.state.selectedDate === null) return false;
    this.track(this.sync.refreshCleanSelectedDate(this.state.selectedDate));
    return true;
  }

  async navigate(date: IsoDate): Promise<void> {
    await this.preserveVisibleEditBeforeNavigation();
    this.state = resetSelectedDailyNoteSession(this.state, date).state;
    this.visibleEditMarker = null;
    this.track(this.sync.loadSelectedDate(date));
  }

  async releaseNext(group: GateGroup): Promise<boolean> {
    const gate = this.gates.take(group);
    if (gate === null) return false;
    await this.releaseGate(gate);
    return true;
  }

  async releaseUntil(kind: GateKind, releaseTarget = true): Promise<void> {
    for (let step = 0; step < 100; step += 1) {
      const target = this.gates.pending.find((gate) => gate.kind === kind);
      if (target !== undefined) {
        if (releaseTarget) {
          this.gates.pending.splice(this.gates.pending.indexOf(target), 1);
          await this.releaseGate(target);
        }
        return;
      }
      const gate = this.gates.take();
      if (gate === null) {
        await flushMicrotasks();
        continue;
      }
      await this.releaseGate(gate);
    }
    throw new Error(`Gate ${kind} was not reached.`);
  }

  async drain(): Promise<void> {
    for (let step = 0; step < 2_000 && this.pendingWork > 0; step += 1) {
      const gate = this.gates.take();
      if (gate !== null) await this.releaseGate(gate);
      else await flushMicrotasks();
    }
    if (this.pendingWork > 0) throw new Error(`Lifecycle work did not drain: ${this.traceState()}`);
    if (this.unexpectedErrors.length > 0) throw this.unexpectedErrors[0];
  }

  async settleFairly(): Promise<void> {
    this.remote.failNextSave = false;
    await this.drain();

    for (const date of DATES) {
      await this.flushVisibleEditBeforeNavigation();
      if (this.state.selectedDate !== date || this.state.loadedDate !== date) {
        await this.navigate(date);
        await this.drain();
      }
      if (this.hasConflict()) continue;

      for (let attempt = 0; attempt < 3; attempt += 1) {
        const visibleNeedsSave = this.state.loadedDate === date && this.state.cleanMarkdown !== this.state.markdown;
        if (!visibleNeedsSave && this.drafts.peek(date)?.dirty === false) break;
        this.startSave();
        await this.drain();
        if (this.hasConflict()) break;
      }
    }

    this.assertExpectedEditsRetained();
  }

  assertInvariants(): void {
    expect(this.state.loadedDate === null || this.state.loadedDate === this.state.selectedDate).toBe(true);
    if (this.visibleEditMarker !== null) expect(this.state.markdown).toContain(this.visibleEditMarker);
    for (const [date, draft] of DATES.map((date) => [date, this.drafts.peek(date)] as const)) {
      if (draft !== null) expect(draft.date).toBe(date);
    }
  }

  private async flushVisibleEditBeforeNavigation(): Promise<void> {
    if (this.state.loadedDate === null || this.hasConflict()) return;
    for (let attempt = 0; attempt < 3; attempt += 1) {
      if (this.state.cleanMarkdown === this.state.markdown && this.drafts.peek(this.state.loadedDate)?.dirty === false) {
        return;
      }
      this.startSave();
      await this.drain();
      if (this.hasConflict()) return;
    }
  }

  private async preserveVisibleEditBeforeNavigation(): Promise<void> {
    if (this.state.loadedDate === null || this.hasConflict()) return;
    if (this.state.cleanMarkdown === this.state.markdown) return;
    const snapshot = captureVisibleDailyNoteSnapshot(this.state);
    if (snapshot === null) return;

    for (let attempt = 0; attempt < 3; attempt += 1) {
      let settled = false;
      const persistence = this.sync.persistVisibleLocalDraft(snapshot).finally(() => {
        settled = true;
      });
      for (let step = 0; step < 100 && !settled; step += 1) {
        const gateIndex = this.gates.pending.findIndex(
          (gate) => gate.date === snapshot.date && gate.kind !== "remote-response"
        );
        if (gateIndex >= 0) {
          const [gate] = this.gates.pending.splice(gateIndex, 1);
          await this.releaseGate(gate!);
        } else {
          await flushMicrotasks();
        }
      }
      if (!settled) throw new Error(`Outgoing snapshot did not persist: ${this.traceState()}`);
      await persistence;
      if (this.drafts.peek(snapshot.date)?.markdown === snapshot.markdown) return;
    }
    throw new Error(`Outgoing snapshot was not retained: ${this.traceState()}`);
  }

  private hasConflict(): boolean {
    return this.syncStatus === "conflict";
  }

  private assertExpectedEditsRetained(): void {
    for (const [date, markers] of this.expectedEditMarkers) {
      const candidates = [
        this.drafts.peek(date)?.markdown,
        this.remote.peek(date)?.markdown,
        this.state.loadedDate === date ? this.state.markdown : undefined,
        this.pendingConflict?.date === date ? this.pendingConflict.localMarkdown : undefined,
        this.pendingConflict?.date === date ? this.pendingConflict.remoteMarkdown : undefined
      ].filter((markdown): markdown is string => markdown !== undefined);
      for (const marker of markers) {
        expect(
          candidates.some((markdown) => markdown.includes(marker)),
          `${date} lost ${marker}; candidates=${JSON.stringify(candidates)}`
        ).toBe(true);
      }
    }
  }

  private applyTransition(transition: DateBoundEditorTransition): void {
    this.state = transition.state;
  }

  private track(operation: Promise<void>): void {
    let tracked!: Promise<void>;
    tracked = operation
      .catch((error) => {
        this.unexpectedErrors.push(error);
      })
      .finally(() => {
        this.inFlight.delete(tracked);
      });
    this.inFlight.add(tracked);
    void flushMicrotasks();
  }

  private async releaseGate(gate: Gate): Promise<void> {
    this.releasedGateGroups.add(gateGroup(gate.kind));
    const selectedDate = this.state.selectedDate;
    const protectedState = selectedDate !== null && gate.date !== selectedDate ? structuredClone(this.state) : null;
    const protectedDraft = selectedDate !== null && gate.date !== selectedDate
      ? structuredClone(this.drafts.peek(selectedDate))
      : null;
    gate.release();
    await flushMicrotasks();

    if (protectedState !== null && selectedDate !== null) {
      expect(this.state).toEqual(protectedState);
      expect(this.drafts.peek(selectedDate)).toEqual(protectedDraft);
    }
    this.assertInvariants();
  }

  private traceState(): string {
    return JSON.stringify({
      commandIndex: this.commandIndex,
      state: this.state,
      status: this.syncStatus,
      gates: this.gates.pending.map((gate) => ({ kind: gate.kind, date: gate.date })),
      inFlight: this.inFlight.size
    });
  }
}

function gateGroup(kind: GateKind): GateGroup {
  if (kind === "draft-read" || kind === "remote-read") return "read";
  if (kind === "remote-response") return "response";
  return "commit";
}

function draftsEqual(left: LocalDraft | null, right: LocalDraft | null): boolean {
  return JSON.stringify(left) === JSON.stringify(right);
}

function remoteNote(date: IsoDate, markdown: string, revisionId: string): RemoteDailyNote {
  return { date, markdown, revisionId, updatedAt: "2030-01-01T00:00:00.000Z" };
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

async function flushMicrotasks(): Promise<void> {
  for (let index = 0; index < 12; index += 1) await Promise.resolve();
}
