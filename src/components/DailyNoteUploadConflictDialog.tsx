import { For } from "solid-js";
import type {
  DailyNoteUploadConflictResolution,
  PendingDailyNoteUpload
} from "~/domain/dailyNoteUpload";

interface DailyNoteUploadConflictDialogProps {
  readonly pending: PendingDailyNoteUpload;
  readonly inProgress: boolean;
  readonly onResolve: (resolution: DailyNoteUploadConflictResolution) => void;
  readonly onCancel: () => void;
}

export function DailyNoteUploadConflictDialog(props: DailyNoteUploadConflictDialogProps) {
  const conflictingItems = () => props.pending.items.filter((item) => item.existingMarkdown !== null);

  return (
    <div class="modal-backdrop" role="presentation">
      <div
        class="daily-note-upload-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="daily-note-upload-modal-title"
        onKeyDown={(event) => {
          if (event.key === "Escape") props.onCancel();
        }}
      >
        <div class="daily-note-upload-modal-header">
          <h2 id="daily-note-upload-modal-title">Existing daily notes</h2>
          <p>
            {props.pending.conflictCount} uploaded file{props.pending.conflictCount === 1 ? "" : "s"} match existing notes.
          </p>
        </div>
        <ul class="daily-note-upload-conflicts">
          <For each={conflictingItems()}>{(item) => <li>{item.filename}</li>}</For>
        </ul>
        <div class="modal-actions daily-note-upload-actions">
          <button
            type="button"
            disabled={props.inProgress}
            onClick={() => props.onResolve("prepend")}
          >
            Prepend
          </button>
          <button
            type="button"
            disabled={props.inProgress}
            onClick={() => props.onResolve("append")}
          >
            Append
          </button>
          <button
            type="button"
            disabled={props.inProgress}
            onClick={() => props.onResolve("replace")}
          >
            Replace
          </button>
          <button
            type="button"
            disabled={props.inProgress}
            onClick={props.onCancel}
          >
            Cancel
          </button>
        </div>
      </div>
    </div>
  );
}
