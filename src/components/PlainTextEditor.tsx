import { createEffect, on } from "solid-js";
import { applyTextAreaStructuralTab, shouldHandleTextAreaStructuralTab } from "./textAreaIndent";
import { resizeTextAreaToContents } from "./textAreaSizing";

interface PlainTextEditorProps {
  readonly documentKey: string;
  readonly resetKey?: number;
  readonly focusAtEnd?: boolean;
  readonly focusOffset?: number | null;
  readonly onFocusApplied?: () => void;
  readonly onCursorChange?: (offset: number) => void;
  readonly value: string;
  readonly onChange: (documentKey: string, markdown: string) => void;
  readonly onBlur: (documentKey: string, markdown: string) => void;
}

export function PlainTextEditor(props: PlainTextEditorProps) {
  let textarea!: HTMLTextAreaElement;

  createEffect(
    on(
      () => [props.documentKey, props.resetKey, props.focusAtEnd, props.focusOffset] as const,
      () => focusTextArea(textarea, focusPlacement(props.focusAtEnd, props.focusOffset), props.onFocusApplied),
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
        onClick={(event) => props.onCursorChange?.(event.currentTarget.selectionStart)}
        onInput={(event) => {
          resizeTextAreaToContents(event.currentTarget);
          props.onCursorChange?.(event.currentTarget.selectionStart);
          props.onChange(props.documentKey, event.currentTarget.value);
        }}
        onKeyDown={(event) => {
          if (!shouldHandleTextAreaStructuralTab(event)) return;

          event.preventDefault();
          applyTextAreaStructuralTab(
            event.currentTarget,
            event.shiftKey,
            (markdown) => props.onChange(props.documentKey, markdown),
            props.onCursorChange
          );
          resizeTextAreaToContents(event.currentTarget);
        }}
        onKeyUp={(event) => props.onCursorChange?.(event.currentTarget.selectionStart)}
        onSelect={(event) => props.onCursorChange?.(event.currentTarget.selectionStart)}
        onBlur={(event) => props.onBlur(props.documentKey, event.currentTarget.value)}
        aria-label="Markdown text editor"
        spellcheck={true}
      />
    </div>
  );
}

type FocusPlacement =
  | {
      readonly type: "default";
    }
  | {
      readonly type: "end";
    }
  | {
      readonly type: "offset";
      readonly offset: number;
    };

function focusPlacement(focusAtEnd?: boolean, focusOffset?: number | null): FocusPlacement {
  if (typeof focusOffset === "number") return { type: "offset", offset: focusOffset };
  if (focusAtEnd === true) return { type: "end" };
  return { type: "default" };
}

function focusTextArea(element: HTMLTextAreaElement, placement: FocusPlacement, onFocusApplied?: () => void): void {
  requestAnimationFrame(() => {
    element.focus();
    if (placement.type === "end") {
      const offset = element.value.length;
      element.setSelectionRange(offset, offset);
    } else if (placement.type === "offset") {
      const offset = Math.max(0, Math.min(element.value.length, placement.offset));
      element.setSelectionRange(offset, offset);
    }
    onFocusApplied?.();
  });
}
