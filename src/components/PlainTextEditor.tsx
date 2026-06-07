import { createEffect, createRenderEffect, on, onCleanup } from "solid-js";
import { applyTextAreaStructuralTab, shouldHandleTextAreaStructuralTab } from "./textAreaIndent";
import { resizeTextAreaToContents } from "./textAreaSizing";

interface PlainTextEditorProps {
  readonly documentKey: string;
  readonly resetKey?: number;
  readonly focusAtEnd?: boolean;
  readonly focusOffset?: number | null;
  readonly focusEnabled?: boolean;
  readonly onFocusApplied?: () => void;
  readonly onCursorChange?: ((offset: number) => void) | undefined;
  readonly onElement?: (element: HTMLTextAreaElement | null) => void;
  readonly value: string;
  readonly readOnly?: boolean;
  readonly onChange: (documentKey: string, markdown: string) => void;
  readonly onBlur: (documentKey: string, markdown: string) => void;
  readonly onUndo?: () => boolean;
  readonly onRedo?: () => boolean;
}

export function PlainTextEditor(props: PlainTextEditorProps) {
  let textarea: HTMLTextAreaElement | undefined;

  onCleanup(() => props.onElement?.(null));

  createRenderEffect(
    on(
      () => [props.documentKey, props.resetKey, props.focusAtEnd, props.focusOffset, props.focusEnabled] as const,
      () => {
        if (props.focusEnabled === false) return;
        if (textarea === undefined) return;
        focusTextArea(textarea, focusPlacement(props.focusAtEnd, props.focusOffset), props.onFocusApplied);
      },
      { defer: false }
    )
  );

  createEffect(() => {
    props.value;
    if (props.focusEnabled === false) return;
    requestAnimationFrame(() => {
      if (textarea !== undefined) resizeTextAreaToContents(textarea);
    });
  });

  return (
    <div class="editor-shell">
      <textarea
        ref={(element) => {
          textarea = element;
          props.onElement?.(element);
          if (props.focusEnabled !== false) {
            focusTextArea(element, focusPlacement(props.focusAtEnd, props.focusOffset), props.onFocusApplied);
          }
        }}
        class="plain-text-editor"
        value={props.value}
        readOnly={props.readOnly === true}
        onClick={(event) => props.onCursorChange?.(event.currentTarget.selectionStart)}
        onInput={(event) => {
          if (props.readOnly === true) return;
          resizeTextAreaToContents(event.currentTarget);
          props.onCursorChange?.(event.currentTarget.selectionStart);
          props.onChange(props.documentKey, event.currentTarget.value);
        }}
        onKeyDown={(event) => {
          if (props.readOnly === true) return;
          if (isPlainUndoShortcut(event)) {
            if (props.onUndo?.() === true) {
              event.preventDefault();
              event.stopImmediatePropagation();
            }
            return;
          }
          if (isPlainRedoShortcut(event)) {
            if (props.onRedo?.() === true) {
              event.preventDefault();
              event.stopImmediatePropagation();
            }
            return;
          }
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
        onBlur={(event) => {
          props.onCursorChange?.(event.currentTarget.selectionStart);
          props.onBlur(props.documentKey, event.currentTarget.value);
        }}
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

function isPlainUndoShortcut(event: KeyboardEvent): boolean {
  return (
    event.key.toLowerCase() === "z" &&
    (event.metaKey || event.ctrlKey) &&
    !event.shiftKey &&
    !event.altKey &&
    !event.isComposing
  );
}

function isPlainRedoShortcut(event: KeyboardEvent): boolean {
  return (
    ((event.key.toLowerCase() === "z" && event.shiftKey && (event.metaKey || event.ctrlKey)) ||
      (event.key.toLowerCase() === "y" && event.ctrlKey && !event.metaKey && !event.shiftKey)) &&
    !event.altKey &&
    !event.isComposing
  );
}

function focusTextArea(element: HTMLTextAreaElement, placement: FocusPlacement, onFocusApplied?: () => void): void {
  element.focus();
  placeTextAreaSelection(element, placement);
  onFocusApplied?.();

  requestAnimationFrame(() => {
    element.focus();
    placeTextAreaSelection(element, placement);
  });
}

function placeTextAreaSelection(element: HTMLTextAreaElement, placement: FocusPlacement): void {
  if (placement.type === "end") {
    const offset = element.value.length;
    element.setSelectionRange(offset, offset);
  } else if (placement.type === "offset") {
    const offset = Math.max(0, Math.min(element.value.length, placement.offset));
    element.setSelectionRange(offset, offset);
  }
}
