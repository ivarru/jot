import { createEffect, createRenderEffect, For, on, onCleanup } from "solid-js";
import { applyTextAreaStructuralTab, shouldHandleTextAreaStructuralTab } from "./textAreaIndent";
import { resizeTextAreaToContents } from "./textAreaSizing";
import { markdownLinkAtOffset } from "~/domain/dailyNoteLinks";
import { markdownHardLineBreakSpaceRanges } from "~/editor/markdownHardLineBreaks";
import type { MarkdownSelection } from "~/editor/markdownSelection";

interface PlainTextEditorProps {
  readonly documentKey: string;
  readonly resetKey?: number;
  readonly focusAtEnd?: boolean;
  readonly focusSelection?: MarkdownSelection | null;
  readonly focusEnabled?: boolean;
  readonly onFocusApplied?: () => void;
  readonly onElement?: (element: HTMLTextAreaElement | null) => void;
  readonly value: string;
  readonly readOnly?: boolean;
  readonly onChange: (documentKey: string, markdown: string) => void;
  readonly onBlur: (documentKey: string, markdown: string) => void;
  readonly onOpenLink?: (documentKey: string, href: string) => boolean;
  readonly onSelectionChange?: () => void;
  readonly onUndo?: () => boolean;
  readonly onRedo?: () => boolean;
}

export function PlainTextEditor(props: PlainTextEditorProps) {
  let textarea: HTMLTextAreaElement | undefined;

  onCleanup(() => props.onElement?.(null));

  createRenderEffect(
    on(
      () => [props.documentKey, props.resetKey, props.focusAtEnd, props.focusSelection, props.focusEnabled] as const,
      (focus, previousFocus) => {
        if (props.focusEnabled === false) return;
        if (textarea === undefined) return;
        if (clearedOnlyFocusSelection(focus, previousFocus)) return;
        focusTextArea(textarea, focusPlacement(props.focusAtEnd, props.focusSelection), props.onFocusApplied);
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
      <div class="plain-text-editor-frame">
        <div class="plain-text-hard-break-highlights" aria-hidden="true">
          <For each={hardLineBreakHighlightSegments(props.value)}>
            {(segment) =>
              segment.highlighted ? (
                <mark class="markdown-hard-break-spaces">{segment.text}</mark>
              ) : (
                <span>{segment.text}</span>
              )
            }
          </For>
        </div>
        <textarea
          ref={(element) => {
            textarea = element;
            props.onElement?.(element);
            if (props.focusEnabled !== false) {
              focusTextArea(element, focusPlacement(props.focusAtEnd, props.focusSelection), props.onFocusApplied);
            }
          }}
          class="plain-text-editor"
          value={props.value}
          readOnly={props.readOnly === true}
          onInput={(event) => {
            if (props.readOnly === true) return;
            resizeTextAreaToContents(event.currentTarget);
            props.onChange(props.documentKey, event.currentTarget.value);
            props.onSelectionChange?.();
          }}
          onKeyDown={(event) => {
            if (props.readOnly === true) return;
            if (isOpenLinkShortcut(event)) {
              const link = markdownLinkAtOffset(event.currentTarget.value, event.currentTarget.selectionStart);
              if (link !== null && props.onOpenLink?.(props.documentKey, link.destination) === true) {
                event.preventDefault();
                event.stopImmediatePropagation();
                return;
              }
            }
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
              (markdown) => props.onChange(props.documentKey, markdown)
            );
            resizeTextAreaToContents(event.currentTarget);
            props.onSelectionChange?.();
          }}
          onKeyUp={() => props.onSelectionChange?.()}
          onMouseUp={() => props.onSelectionChange?.()}
          onSelect={() => props.onSelectionChange?.()}
          onFocus={() => props.onSelectionChange?.()}
          onBlur={(event) => {
            props.onBlur(props.documentKey, event.currentTarget.value);
          }}
          aria-label="Markdown text editor"
          spellcheck={true}
        />
      </div>
    </div>
  );
}

interface HardLineBreakHighlightSegment {
  readonly text: string;
  readonly highlighted: boolean;
}

function hardLineBreakHighlightSegments(markdown: string): readonly HardLineBreakHighlightSegment[] {
  const ranges = markdownHardLineBreakSpaceRanges(markdown);
  const segments: HardLineBreakHighlightSegment[] = [];
  let cursor = 0;

  for (const range of ranges) {
    if (range.start > cursor) {
      segments.push({ text: markdown.slice(cursor, range.start), highlighted: false });
    }
    segments.push({ text: markdown.slice(range.start, range.end), highlighted: true });
    cursor = range.end;
  }

  if (cursor < markdown.length || segments.length === 0) {
    segments.push({ text: markdown.slice(cursor), highlighted: false });
  }

  return segments;
}

function isOpenLinkShortcut(event: KeyboardEvent): boolean {
  return event.key === "Enter" && (event.metaKey || event.ctrlKey) && !event.shiftKey && !event.altKey && !event.isComposing;
}

type FocusPlacement =
  | {
      readonly type: "default";
    }
  | {
      readonly type: "end";
    }
  | {
      readonly type: "selection";
      readonly selection: MarkdownSelection;
    };

function focusPlacement(focusAtEnd?: boolean, focusSelection?: MarkdownSelection | null): FocusPlacement {
  if (focusSelection !== null && focusSelection !== undefined) return { type: "selection", selection: focusSelection };
  if (focusAtEnd === true) return { type: "end" };
  return { type: "default" };
}

function clearedOnlyFocusSelection(
  focus: readonly [string, number | undefined, boolean | undefined, MarkdownSelection | null | undefined, boolean | undefined],
  previousFocus:
    | readonly [string, number | undefined, boolean | undefined, MarkdownSelection | null | undefined, boolean | undefined]
    | undefined
): boolean {
  return (
    previousFocus !== undefined &&
    previousFocus[3] !== null &&
    previousFocus[3] !== undefined &&
    focus[3] === null &&
    focus[0] === previousFocus[0] &&
    focus[1] === previousFocus[1] &&
    focus[2] === previousFocus[2] &&
    focus[4] === previousFocus[4]
  );
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

  queueMicrotask(() => {
    element.focus();
    placeTextAreaSelection(element, placement);
  });

  window.setTimeout(() => {
    element.focus();
    placeTextAreaSelection(element, placement);
  }, 0);

  requestAnimationFrame(() => {
    element.focus();
    placeTextAreaSelection(element, placement);
  });
}

function placeTextAreaSelection(element: HTMLTextAreaElement, placement: FocusPlacement): void {
  if (placement.type === "end") {
    const offset = element.value.length;
    element.setSelectionRange(offset, offset);
  } else if (placement.type === "selection") {
    const start = Math.max(0, Math.min(element.value.length, placement.selection.start));
    const end = Math.max(0, Math.min(element.value.length, placement.selection.end));
    element.setSelectionRange(start, end);
  }
}
