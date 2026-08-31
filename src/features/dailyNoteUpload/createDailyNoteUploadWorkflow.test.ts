import type { DateBoundEditorState } from "~/editor/dateBoundEditor";
import type { LocalDraftStore, RemoteStorageProvider } from "~/storage/types";
import { createDailyNoteUploadWorkflow } from "./createDailyNoteUploadWorkflow";

const sessionMocks = vi.hoisted(() => ({
  buildPlan: vi.fn(),
  savePlan: vi.fn()
}));

vi.mock("./dailyNoteUploadSession", () => ({
  buildDailyNoteUploadPlan: sessionMocks.buildPlan,
  saveDailyNoteUploadPlan: sessionMocks.savePlan
}));

describe("createDailyNoteUploadWorkflow", () => {
  beforeEach(() => {
    sessionMocks.buildPlan.mockReset();
    sessionMocks.savePlan.mockReset();
  });

  it("opens the registered file input unless reconnect is required", () => {
    let reconnectRequired = false;
    const workflow = createWorkflow({ authReconnectRequired: () => reconnectRequired });
    const input = document.createElement("input");
    const click = vi.spyOn(input, "click");
    workflow.setInputElement(input);

    workflow.openFilePicker();
    expect(click).toHaveBeenCalledOnce();
    expect(workflow.error()).toBeNull();

    reconnectRequired = true;
    workflow.openFilePicker();
    expect(click).toHaveBeenCalledOnce();
    expect(workflow.error()).toBe("Reconnect before uploading daily notes.");
  });

  it("uploads a conflict-free plan and applies every replication result", async () => {
    const saveResult = { type: "saved" };
    sessionMocks.buildPlan.mockResolvedValue([planItem(null)]);
    sessionMocks.savePlan.mockResolvedValue({
      type: "uploaded",
      count: 1,
      saveResults: [saveResult]
    });
    const applySaveResult = vi.fn();
    const onDailyNotesChanged = vi.fn();
    const workflow = createWorkflow({ applySaveResult, onDailyNotesChanged });

    await workflow.handleFiles([markdownFile()]);

    expect(sessionMocks.savePlan).toHaveBeenCalledWith(expect.objectContaining({ resolution: "replace" }));
    expect(applySaveResult).toHaveBeenCalledWith(saveResult);
    expect(onDailyNotesChanged).toHaveBeenCalledOnce();
    expect(workflow.inProgress()).toBe(false);
    expect(workflow.message()).toBe("Uploaded 1 daily note.");
  });

  it("holds conflicting plans for an explicit resolution", async () => {
    sessionMocks.buildPlan.mockResolvedValue([planItem("existing")]);
    sessionMocks.savePlan.mockResolvedValue({ type: "uploaded", count: 1, saveResults: [] });
    const workflow = createWorkflow();

    await workflow.handleFiles([markdownFile()]);
    expect(workflow.pending()?.conflictCount).toBe(1);
    expect(sessionMocks.savePlan).not.toHaveBeenCalled();

    workflow.resolvePending("append");
    await settle();

    expect(sessionMocks.savePlan).toHaveBeenCalledWith(expect.objectContaining({ resolution: "append" }));
    expect(workflow.pending()).toBeNull();
    expect(workflow.message()).toBe("Uploaded 1 daily note.");
  });

  it("ignores a delayed plan after cancellation and resets visible state", async () => {
    const plan = deferred<ReturnType<typeof planItem>[]>();
    sessionMocks.buildPlan.mockReturnValue(plan.promise);
    const workflow = createWorkflow();

    const upload = workflow.handleFiles([markdownFile()]);
    expect(workflow.inProgress()).toBe(true);

    workflow.cancelAndReset();
    plan.resolve([planItem(null)]);
    await upload;

    expect(sessionMocks.savePlan).not.toHaveBeenCalled();
    expect(workflow.inProgress()).toBe(false);
    expect(workflow.pending()).toBeNull();
    expect(workflow.error()).toBeNull();
    expect(workflow.message()).toBeNull();
  });

  it("reports validation failures without invoking persistence", async () => {
    const workflow = createWorkflow({ errorMessage: (error) => `Upload error: ${(error as Error).message}` });

    await workflow.handleFiles([uploadedFile("notes.md")]);

    expect(sessionMocks.buildPlan).not.toHaveBeenCalled();
    expect(sessionMocks.savePlan).not.toHaveBeenCalled();
    expect(workflow.error()).toContain("Daily Note files must be named YYYY-MM-DD.md");
  });
});

function createWorkflow(overrides: Partial<Parameters<typeof createDailyNoteUploadWorkflow>[0]> = {}) {
  return createDailyNoteUploadWorkflow({
    drafts: {} as LocalDraftStore,
    remote: {} as RemoteStorageProvider,
    getState: () => editorState(),
    authReconnectRequired: () => false,
    handleRemoteError: () => false,
    errorMessage: (error) => (error as Error).message,
    applySaveResult: () => undefined,
    onDailyNotesChanged: () => undefined,
    ...overrides
  });
}

function editorState(): DateBoundEditorState {
  return {
    selectedDate: "2030-02-02",
    loadedDate: "2030-02-02",
    markdown: "",
    cleanMarkdown: "",
    editorChangeEpoch: 0
  };
}

function markdownFile(): File {
  return uploadedFile("2030-02-02.md");
}

function uploadedFile(name: string): File {
  return {
    name,
    text: async () => "uploaded"
  } as File;
}

function planItem(existingMarkdown: string | null) {
  return {
    date: "2030-02-02" as const,
    filename: "2030-02-02.md",
    uploadedMarkdown: "uploaded",
    existingMarkdown
  };
}

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((fulfill) => {
    resolve = fulfill;
  });
  return { promise, resolve };
}

async function settle(): Promise<void> {
  await Promise.resolve();
  await Promise.resolve();
}
