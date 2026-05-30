import { createEffect, on } from "solid-js";
import { resizeTextAreaToContents } from "./textAreaSizing";

interface PlainTextEditorProps {
  readonly documentKey: string;
  readonly resetKey?: number;
  readonly focusAtEnd?: boolean;
  readonly onFocusApplied?: () => void;
  readonly value: string;
  readonly onChange: (documentKey: string, markdown: string) => void;
  readonly onBlur: (documentKey: string, markdown: string) => void;
}

export function PlainTextEditor(props: PlainTextEditorProps) {
  let textarea!: HTMLTextAreaElement;

  createEffect(
    on(
      () => [props.documentKey, props.resetKey, props.focusAtEnd] as const,
      () => focusTextArea(textarea, props.focusAtEnd === true ? "end" : "default", props.onFocusApplied),
      { defer: false }
    )
  );

  createEffect(() => {
    props.value;
    requestAnimationFrame(() => resizeTextAreaToContents(textarea));
  });

  return (
    <div class="editor-shell">
      <textarea
        ref={textarea}
        class="plain-text-editor"
        value={props.value}
        onInput={(event) => {
          resizeTextAreaToContents(event.currentTarget);
          props.onChange(props.documentKey, event.currentTarget.value);
        }}
        onBlur={(event) => props.onBlur(props.documentKey, event.currentTarget.value)}
        aria-label="Markdown text editor"
        spellcheck={true}
      />
    </div>
  );
}

type FocusPlacement = "default" | "end";

function focusTextArea(element: HTMLTextAreaElement, placement: FocusPlacement, onFocusApplied?: () => void): void {
  requestAnimationFrame(() => {
    element.focus();
    if (placement === "end") {
      element.setSelectionRange(element.value.length, element.value.length);
    }
    onFocusApplied?.();
  });
}
