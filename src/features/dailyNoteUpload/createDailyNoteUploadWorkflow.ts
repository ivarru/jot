import { createSignal, type Accessor } from "solid-js";
import type { DateBoundEditorState } from "~/editor/dateBoundEditor";
import type { LocalDraftStore, RemoteStorageProvider } from "~/storage/types";
import {
  isCancelledDailyNoteSyncError,
  type DailyNoteSyncControl,
  type ReplicateDailyNoteSnapshotResult
} from "~/sync/dailyNoteReplication";
import {
  buildDailyNoteUploadCandidates,
  createPendingDailyNoteUpload,
  type DailyNoteUploadConflictResolution,
  type PendingDailyNoteUpload,
  type UploadedDailyNoteFile
} from "./dailyNoteUpload";
import { buildDailyNoteUploadPlan, saveDailyNoteUploadPlan } from "./dailyNoteUploadSession";

export interface DailyNoteUploadWorkflowDependencies {
  readonly drafts: LocalDraftStore;
  readonly remote: RemoteStorageProvider;
  readonly getState: () => DateBoundEditorState;
  readonly authReconnectRequired: Accessor<boolean>;
  readonly handleRemoteError: (error: unknown) => boolean;
  readonly errorMessage: (error: unknown) => string;
  readonly applySaveResult: (result: ReplicateDailyNoteSnapshotResult) => void;
  readonly onDailyNotesChanged: () => void;
}

export interface DailyNoteUploadWorkflow {
  readonly inProgress: Accessor<boolean>;
  readonly error: Accessor<string | null>;
  readonly message: Accessor<string | null>;
  readonly pending: Accessor<PendingDailyNoteUpload | null>;
  readonly setInputElement: (element: HTMLInputElement) => void;
  readonly openFilePicker: () => void;
  readonly handleFiles: (files: readonly File[]) => Promise<void>;
  readonly resolvePending: (resolution: DailyNoteUploadConflictResolution) => void;
  readonly cancelPending: () => void;
  readonly dismissMessage: () => void;
  readonly cancelAndReset: () => void;
}

export function createDailyNoteUploadWorkflow(
  dependencies: DailyNoteUploadWorkflowDependencies
): DailyNoteUploadWorkflow {
  const [inProgress, setInProgress] = createSignal(false);
  const [error, setError] = createSignal<string | null>(null);
  const [message, setMessage] = createSignal<string | null>(null);
  const [pending, setPending] = createSignal<PendingDailyNoteUpload | null>(null);
  let inputElement: HTMLInputElement | undefined;
  let generation = 0;

  const startWork = (): number => {
    generation += 1;
    return generation;
  };

  const cancelWork = () => {
    generation += 1;
  };

  const isCurrentGeneration = (candidate: number): boolean => candidate === generation;
  const canContinue = (candidate: number): NonNullable<DailyNoteSyncControl["canContinue"]> =>
    () => isCurrentGeneration(candidate);

  const reportError = (caught: unknown) => {
    if (dependencies.handleRemoteError(caught)) {
      setError("Reconnect before uploading daily notes.");
    } else {
      setError(dependencies.errorMessage(caught));
    }
  };

  const savePending = async (
    upload: PendingDailyNoteUpload,
    resolution: DailyNoteUploadConflictResolution,
    workGeneration = generation
  ) => {
    setInProgress(true);
    setError(null);
    setMessage(null);
    setPending(null);
    try {
      const result = await saveDailyNoteUploadPlan({
        pending: upload,
        resolution,
        authReconnectRequired: dependencies.authReconnectRequired,
        drafts: dependencies.drafts,
        remote: dependencies.remote,
        getState: dependencies.getState,
        canContinue: canContinue(workGeneration)
      });
      if (!isCurrentGeneration(workGeneration)) return;
      for (const saveResult of result.saveResults) dependencies.applySaveResult(saveResult);
      if (result.type === "failed") throw result.error;
      setMessage(`Uploaded ${result.count} daily note${result.count === 1 ? "" : "s"}.`);
      dependencies.onDailyNotesChanged();
    } catch (caught: unknown) {
      if (!isCurrentGeneration(workGeneration) || isCancelledDailyNoteSyncError(caught)) return;
      reportError(caught);
    } finally {
      if (isCurrentGeneration(workGeneration)) setInProgress(false);
    }
  };

  const handleFiles = async (files: readonly File[]) => {
    if (files.length === 0) return;

    const workGeneration = startWork();
    setInProgress(true);
    setError(null);
    setMessage(null);
    setPending(null);
    try {
      const uploadedFiles = await readFiles(files);
      const candidates = buildDailyNoteUploadCandidates(uploadedFiles);
      const planned = createPendingDailyNoteUpload(await buildDailyNoteUploadPlan({
        candidates,
        drafts: dependencies.drafts,
        remote: dependencies.remote,
        getState: dependencies.getState,
        canContinue: canContinue(workGeneration)
      }));
      if (!isCurrentGeneration(workGeneration)) return;
      if (planned.conflictCount > 0) {
        setPending(planned);
        return;
      }
      await savePending(planned, "replace", workGeneration);
    } catch (caught: unknown) {
      if (!isCurrentGeneration(workGeneration) || isCancelledDailyNoteSyncError(caught)) return;
      reportError(caught);
    } finally {
      if (isCurrentGeneration(workGeneration)) setInProgress(false);
    }
  };

  return {
    inProgress,
    error,
    message,
    pending,
    setInputElement: (element) => {
      inputElement = element;
    },
    openFilePicker: () => {
      setError(null);
      setMessage(null);
      if (dependencies.authReconnectRequired()) {
        setError("Reconnect before uploading daily notes.");
        return;
      }
      inputElement?.click();
    },
    handleFiles,
    resolvePending: (resolution) => {
      const upload = pending();
      if (upload !== null) void savePending(upload, resolution);
    },
    cancelPending: () => {
      cancelWork();
      setPending(null);
      setInProgress(false);
    },
    dismissMessage: () => setMessage(null),
    cancelAndReset: () => {
      cancelWork();
      setInProgress(false);
      setError(null);
      setMessage(null);
      setPending(null);
    }
  };
}

async function readFiles(files: readonly File[]): Promise<UploadedDailyNoteFile[]> {
  return await Promise.all(files.map(async (file) => ({
    filename: file.name,
    markdown: await file.text()
  })));
}
