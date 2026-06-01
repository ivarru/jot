import { Show } from "solid-js";

interface DailyNoteUploadStatusAlertProps {
  readonly inProgress: boolean;
  readonly message: string | null;
  readonly onDismissMessage: () => void;
}

export function DailyNoteUploadStatusAlert(props: DailyNoteUploadStatusAlertProps) {
  return (
    <>
      <Show when={props.inProgress}>
        <aside class="sync-alert" role="status" aria-live="polite">
          <strong>Uploading daily notes...</strong>
        </aside>
      </Show>
      <Show when={!props.inProgress && props.message !== null}>
        <aside class="sync-alert sync-alert-dismissible" role="status" aria-live="polite">
          <strong>{props.message}</strong>
          <button
            type="button"
            class="icon-button sync-alert-dismiss"
            aria-label="Dismiss daily note upload message"
            onClick={props.onDismissMessage}
          >
            <CloseIcon />
          </button>
        </aside>
      </Show>
    </>
  );
}

function CloseIcon() {
  return (
    <svg
      aria-hidden="true"
      viewBox="0 0 24 24"
      width="20"
      height="20"
      fill="none"
      stroke="currentColor"
      stroke-width="2"
      stroke-linecap="round"
    >
      <path d="M18 6 6 18" />
      <path d="m6 6 12 12" />
    </svg>
  );
}
