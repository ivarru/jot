import { Show } from "solid-js";
import { DailyNoteUploadConflictDialog } from "./DailyNoteUploadConflictDialog";
import { DailyNoteUploadStatusAlert } from "./DailyNoteUploadStatusAlert";
import type { DailyNoteUploadWorkflow } from "./createDailyNoteUploadWorkflow";

export interface DailyNoteUploadSurfacesProps {
  readonly workflow: DailyNoteUploadWorkflow;
}

export function DailyNoteUploadSurfaces(props: DailyNoteUploadSurfacesProps) {
  return (
    <>
      <input
        ref={props.workflow.setInputElement}
        class="hidden-file-input"
        type="file"
        accept=".md,text/markdown"
        multiple
        onChange={(event) => {
          const files = Array.from(event.currentTarget.files ?? []);
          event.currentTarget.value = "";
          void props.workflow.handleFiles(files);
        }}
      />

      <Show when={props.workflow.error()}>
        {(message) => (
          <aside class="sync-alert sync-alert-error" aria-live="polite">
            <strong>Daily note upload failed</strong>
            <pre>{message()}</pre>
          </aside>
        )}
      </Show>

      <DailyNoteUploadStatusAlert
        inProgress={props.workflow.inProgress()}
        message={props.workflow.message()}
        onDismissMessage={props.workflow.dismissMessage}
      />

      <Show when={props.workflow.pending()}>
        {(pending) => (
          <DailyNoteUploadConflictDialog
            pending={pending()}
            inProgress={props.workflow.inProgress()}
            onResolve={props.workflow.resolvePending}
            onCancel={props.workflow.cancelPending}
          />
        )}
      </Show>
    </>
  );
}
