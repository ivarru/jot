import { createEffect, createRenderEffect, createSignal, on, onCleanup, Show, untrack } from "solid-js";
import { firstClipboardImageFile } from "./clipboardImages";
import type { ImageAttachmentDisplayMap } from "./milkdownImages";
import { createMilkdownImageViewDom, updateMilkdownImageViewDom } from "./milkdownImages";
import { createListTightnessPlugin } from "./milkdownListTightness";
import { renderMilkdownListItemLabel } from "./milkdownListItems";
import { createMilkdownStructuralTabKeymap } from "./milkdownStructuralTab";
import { applyTextAreaStructuralTab, shouldHandleTextAreaStructuralTab } from "./textAreaIndent";
import { resizeTextAreaToContents } from "./textAreaSizing";
import {
  markdownSourceOffsetToRenderedOffset,
  renderedOffsetToMarkdownSourceOffset
} from "~/editor/markdownCursor";
import { diffChars } from "diff";
import type { Editor as MilkdownEditorInstance } from "@milkdown/kit/core";
import type { Node as ProseNode } from "@milkdown/kit/prose/model";
import type { Selection } from "@milkdown/kit/prose/state";
import type { EditorView } from "@milkdown/kit/prose/view";

interface MilkdownEditorProps {
  readonly documentKey: string;
  readonly resetKey?: number;
  readonly focusAtEnd?: boolean;
  readonly focusOffset?: number | null;
  readonly focusEnabled?: boolean;
  readonly onFocusApplied?: () => void;
  readonly onCursorChange?: ((offset: number) => void) | undefined;
  readonly imageAttachmentDisplays?: ImageAttachmentDisplayMap;
  readonly value: string;
  readonly readOnly?: boolean;
  readonly onChange: (documentKey: string, markdown: string) => void;
  readonly onBlur: (documentKey: string, markdown: string) => void;
  readonly onController?: (controller: MilkdownEditorController | null) => void;
  readonly onPasteImage?: (documentKey: string, file: File) => void;
}

interface MilkdownEditorSession {
  readonly applyExternalMarkdown: (markdown: string, undoable: boolean) => void;
  readonly closeHistory: () => void;
  readonly getCursorOffset: () => number | null;
  readonly getMarkdown: () => string;
  readonly focus: (placement: FocusPlacement, markdown: string, onFocusApplied?: () => void) => void;
  readonly redo: () => boolean;
  readonly setReadOnly: (readOnly: boolean) => void;
  readonly undo: () => boolean;
}

type MarkdownSerializer = (doc: ProseNode) => string;
let cursorMarkerSequence = 0;

export interface MilkdownEditorController {
  readonly applyRawMarkdown: (markdown: string) => void;
  readonly closeHistory: () => void;
  readonly getCursorOffset: () => number | null;
  readonly redo: () => boolean;
  readonly undo: () => boolean;
}

export interface MilkdownMarkdownSyncState {
  currentMarkdown: string;
  lastSerializedMarkdown: string | null;
  pendingExternalMarkdown: string | null;
}

export function createMilkdownMarkdownSyncState(markdown: string): MilkdownMarkdownSyncState {
  return {
    currentMarkdown: markdown,
    lastSerializedMarkdown: null,
    pendingExternalMarkdown: null
  };
}

export function trackMilkdownSerializedMarkdown(
  state: MilkdownMarkdownSyncState,
  serializedMarkdown: string
): void {
  state.lastSerializedMarkdown = serializedMarkdown;
}

export function trackMilkdownExternalMarkdown(
  state: MilkdownMarkdownSyncState,
  markdown: string,
  serializedMarkdown: string
): void {
  state.currentMarkdown = markdown;
  state.lastSerializedMarkdown = serializedMarkdown;
  state.pendingExternalMarkdown = serializedMarkdown;
}

export function applyMilkdownUpdatedMarkdown(state: MilkdownMarkdownSyncState, markdown: string): boolean {
  if (state.pendingExternalMarkdown !== null) {
    const matchesPendingExternalMarkdown = state.pendingExternalMarkdown === markdown;
    state.pendingExternalMarkdown = null;
    if (matchesPendingExternalMarkdown) return false;
  }

  if (state.lastSerializedMarkdown === markdown) return false;

  state.lastSerializedMarkdown = markdown;
  state.currentMarkdown = markdown;
  return true;
}

export function MilkdownEditor(props: MilkdownEditorProps) {
  let root!: HTMLDivElement;
  let fallbackTextarea: HTMLTextAreaElement | undefined;
  const [error, setError] = createSignal<string | null>(null);
  let imageAttachmentDisplays: ImageAttachmentDisplayMap = {};
  const imageAttachmentDisplayListeners = new Set<() => void>();
  let activeSession: MilkdownEditorSession | null = null;

  createEffect(() => {
    imageAttachmentDisplays = props.imageAttachmentDisplays ?? {};
    for (const listener of imageAttachmentDisplayListeners) {
      listener();
    }
  });

  createEffect(
    on(
      () => [props.documentKey, props.resetKey] as const,
      async () => {
        const documentKey = props.documentKey;
        const focusAtEnd = props.focusAtEnd === true;
        const focusOffset = props.focusOffset;
        const markdownState = createMilkdownMarkdownSyncState(props.value);
        let currentReadOnly = props.readOnly === true;
        let disposed = false;
        let editor: MilkdownEditorInstance | null = null;
        let session: MilkdownEditorSession | null = null;
        let removeRootListeners: (() => void) | null = null;
        onCleanup(() => {
          disposed = true;
          removeRootListeners?.();
          if (activeSession === session) {
            activeSession = null;
            props.onController?.(null);
          }
          void editor?.destroy();
        });

        setError(null);
        root.replaceChildren();

        const [
          { Editor, rootCtx, defaultValueCtx, editorViewCtx, editorViewOptionsCtx, serializerCtx },
          { bulletListSchema, codeBlockSchema, commonmark, headingSchema, imageSchema, listItemSchema, paragraphSchema },
          { gfm },
          { clipboard },
          { history },
          { listener, listenerCtx },
          { listItemBlockComponent, listItemBlockConfig },
          { Plugin, TextSelection },
          { closeHistory, redo, undo },
          { isInTable },
          { liftListItem, sinkListItem },
          { wrapIn },
          { $prose, $useKeymap, $view, replaceAll }
        ] =
          await Promise.all([
            import("@milkdown/kit/core"),
            import("@milkdown/kit/preset/commonmark"),
            import("@milkdown/kit/preset/gfm"),
            import("@milkdown/kit/plugin/clipboard"),
            import("@milkdown/kit/plugin/history"),
            import("@milkdown/kit/plugin/listener"),
            import("@milkdown/kit/component/list-item-block"),
            import("@milkdown/kit/prose/state"),
            import("@milkdown/kit/prose/history"),
            import("@milkdown/kit/prose/tables"),
            import("@milkdown/kit/prose/schema-list"),
            import("@milkdown/kit/prose/commands"),
            import("@milkdown/kit/utils")
          ]);
        if (disposed) return;
        const preserveListTightness = $prose(() => createListTightnessPlugin(Plugin));
        const structuralTabKeymap = createMilkdownStructuralTabKeymap({
          useKeymap: $useKeymap,
          isInTable,
          sinkListItem,
          liftListItem,
          wrapIn,
          TextSelection,
          listItemSchema,
          bulletListSchema,
          codeBlockSchema,
          headingSchema,
          paragraphSchema
        });
        const jotImageView = $view(imageSchema.node, () => (node) => {
          let attrs = node.attrs;
          const dom = createMilkdownImageViewDom(attrs, imageAttachmentDisplays);
          const refresh = () => updateMilkdownImageViewDom(dom, attrs, imageAttachmentDisplays);
          imageAttachmentDisplayListeners.add(refresh);

          return {
            dom,
            update: (nextNode) => {
              attrs = nextNode.attrs;
              refresh();
              return true;
            },
            destroy: () => {
              imageAttachmentDisplayListeners.delete(refresh);
            },
            ignoreMutation: () => true
          };
        });

        editor = await Editor.make()
          .config((ctx) => {
            ctx.set(rootCtx, root);
            ctx.set(defaultValueCtx, props.value);
            ctx.update(editorViewOptionsCtx, (options) => ({
              ...options,
              editable: () => !currentReadOnly
            }));
            ctx.update(listItemBlockConfig.key, (config) => ({
              ...config,
              renderLabel: renderMilkdownListItemLabel
            }));
            ctx.get(listenerCtx).updated((ctx, doc) => {
              if (disposed || activeSession !== session) return;

              const serializer = ctx.get(serializerCtx);
              const markdown = serializer(doc);
              if (!applyMilkdownUpdatedMarkdown(markdownState, markdown)) return;

              props.onChange(documentKey, markdown);
            });
            ctx.get(listenerCtx).selectionUpdated((ctx, selection) => {
              if (disposed || activeSession !== session) return;
              if (props.focusEnabled === false) return;
              if (!root.contains(document.activeElement)) return;
              props.onCursorChange?.(editorSelectionToMarkdownSourceOffset(
                markdownState.currentMarkdown,
                selection,
                ctx.get(editorViewCtx),
                ctx.get(serializerCtx)
              ));
            });
          })
          .use(commonmark)
          .use(jotImageView)
          .use(gfm)
          .use(clipboard)
          .use(structuralTabKeymap)
          .use(listItemBlockComponent)
          .use(preserveListTightness)
          .use(history)
          .use(listener)
          .create()
          .catch((reason: unknown) => {
            setError(reason instanceof Error ? reason.message : "Milkdown failed to load.");
            return null;
          });

        if (editor !== null) {
          if (disposed) {
            void editor.destroy();
            return;
          }
          session = {
            applyExternalMarkdown: (markdown, undoable) => {
              if (disposed || activeSession !== session || editor === null) return;

              let replacedMarkdown = markdown;
              editor.action((ctx) => {
                replaceAll(markdown, !undoable)(ctx);
                const view = ctx.get(editorViewCtx);
                const serializer = ctx.get(serializerCtx);
                replacedMarkdown = serializer(view.state.doc);
              });
              trackMilkdownExternalMarkdown(markdownState, markdown, replacedMarkdown);
            },
            closeHistory: () => {
              if (disposed || activeSession !== session || editor === null) return;
              const view = editor.ctx.get(editorViewCtx);
              view.dispatch(closeHistory(view.state.tr));
            },
            getCursorOffset: () => {
              if (disposed || activeSession !== session || editor === null) return null;
              const view = editor.ctx.get(editorViewCtx);
              return editorSelectionToMarkdownSourceOffset(
                markdownState.currentMarkdown,
                view.state.selection,
                view,
                editor.ctx.get(serializerCtx)
              );
            },
            getMarkdown: () => markdownState.currentMarkdown,
            focus: (placement, markdown, onFocusApplied) => {
              if (disposed || activeSession !== session || editor === null) return;
              const view = editor.ctx.get(editorViewCtx);
              focusEditable(root, placement, view, TextSelection, markdown, onFocusApplied);
            },
            redo: () => {
              if (disposed || activeSession !== session || editor === null) return false;
              const view = editor.ctx.get(editorViewCtx);
              return redo(view.state, view.dispatch, view);
            },
            setReadOnly: (readOnly) => {
              if (disposed || activeSession !== session || editor === null) return;
              currentReadOnly = readOnly;
              const view = editor.ctx.get(editorViewCtx);
              view.setProps({
                editable: () => !currentReadOnly
              });
              view.dom.setAttribute("contenteditable", currentReadOnly ? "false" : "true");
              view.dom.setAttribute("aria-readonly", currentReadOnly ? "true" : "false");
            },
            undo: () => {
              if (disposed || activeSession !== session || editor === null) return false;
              const view = editor.ctx.get(editorViewCtx);
              return undo(view.state, view.dispatch, view);
            }
          };
          activeSession = session;
          props.onController?.({
            applyRawMarkdown: (markdown) => {
              session?.applyExternalMarkdown(markdown, true);
            },
            closeHistory: () => {
              session?.closeHistory();
            },
            getCursorOffset: () => session?.getCursorOffset() ?? null,
            redo: () => session?.redo() ?? false,
            undo: () => session?.undo() ?? false
          });
          session.setReadOnly(props.readOnly === true);
          if (props.value !== markdownState.currentMarkdown) {
            session.applyExternalMarkdown(props.value, false);
          }
          const view = editor.ctx.get(editorViewCtx);
          trackMilkdownSerializedMarkdown(markdownState, editor.ctx.get(serializerCtx)(view.state.doc));
          if (props.focusEnabled !== false) {
            session.focus(focusPlacement(focusAtEnd, focusOffset), props.value, props.onFocusApplied);
          }
        }

        const blurListener = () => props.onBlur(documentKey, markdownState.currentMarkdown);
        const pasteListener = (event: ClipboardEvent) => {
          if (props.onPasteImage === undefined) return;
          const file = firstClipboardImageFile(event.clipboardData?.items);
          if (file === null) return;

          event.preventDefault();
          event.stopImmediatePropagation();
          props.onPasteImage(documentKey, file);
        };
        root.addEventListener("focusout", blurListener);
        root.addEventListener("paste", pasteListener, { capture: true });
        removeRootListeners = () => {
          root.removeEventListener("focusout", blurListener);
          root.removeEventListener("paste", pasteListener, { capture: true });
        };
      },
      { defer: false }
    )
  );

  createEffect(() => {
    const markdown = props.value;
    const session = activeSession;
    if (session === null || markdown === session.getMarkdown()) return;

    session.applyExternalMarkdown(markdown, false);
  });

  createRenderEffect(
    on(
      () => [props.documentKey, props.resetKey, props.focusAtEnd, props.focusOffset, props.focusEnabled] as const,
      () => {
        if (props.focusEnabled === false) return;
        activeSession?.focus(
          focusPlacement(props.focusAtEnd, props.focusOffset),
          untrack(() => props.value),
          props.onFocusApplied
        );
      },
      { defer: true }
    )
  );

  createRenderEffect(() => {
    activeSession?.setReadOnly(props.readOnly === true);
  });

  createEffect(() => {
    props.value;
    if (props.focusEnabled === false) return;
    if (error() === null || fallbackTextarea === undefined) return;
    requestAnimationFrame(() => {
      if (fallbackTextarea !== undefined) resizeTextAreaToContents(fallbackTextarea);
    });
  });

  return (
    <div class="editor-shell">
      <div ref={root} class="milkdown-root" aria-readonly={props.readOnly === true ? "true" : "false"} />
      <Show when={error() !== null}>
        <textarea
          class="fallback-editor"
          value={props.value}
          readOnly={props.readOnly === true}
          ref={(element) => {
            fallbackTextarea = element;
            resizeTextAreaToContents(element);
            focusTextArea(element, focusPlacement(props.focusAtEnd, props.focusOffset), props.onFocusApplied);
          }}
          onClick={(event) => props.onCursorChange?.(event.currentTarget.selectionStart)}
          onInput={(event) => {
            if (props.readOnly === true) return;
            resizeTextAreaToContents(event.currentTarget);
            props.onCursorChange?.(event.currentTarget.selectionStart);
            props.onChange(props.documentKey, event.currentTarget.value);
          }}
          onKeyDown={(event) => {
            if (props.readOnly === true) return;
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
          aria-label="Markdown editor fallback"
        />
      </Show>
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

function focusEditable(
  root: HTMLElement,
  placement: FocusPlacement,
  view: EditorView,
  textSelection: typeof import("@milkdown/kit/prose/state").TextSelection,
  markdown: string,
  onFocusApplied?: () => void
): void {
  if (placement.type === "end") {
    placeEditorSelectionAtEnd(view, textSelection);
  } else if (placement.type === "offset") {
    placeSelectionAtMarkdownSourceOffset(view, textSelection, markdown, placement.offset);
  }

  view.focus();
  onFocusApplied?.();

  requestAnimationFrame(() => {
    if (root.querySelector<HTMLElement>("[contenteditable]") !== null) view.focus();
  });
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

function placeEditorSelectionAtEnd(
  view: EditorView,
  textSelection: typeof import("@milkdown/kit/prose/state").TextSelection
): void {
  view.dispatch(view.state.tr.setSelection(textSelection.atEnd(view.state.doc)).scrollIntoView());
}

function selectionToRenderedTextOffset(selection: Selection): number {
  return renderedTextOffsetBeforePosition(selection.$from.doc, selection.from);
}

export function editorSelectionToMarkdownSourceOffset(
  markdown: string,
  selection: Selection,
  view: EditorView,
  serializer: MarkdownSerializer
): number {
  const serializedOffset = serializedEditorSelectionToMarkdownSourceOffset(markdown, selection, view, serializer);
  if (serializedOffset !== null) return serializedOffset;

  return renderedOffsetToMarkdownSourceOffset(markdown, selectionToRenderedTextOffset(selection));
}

function serializedEditorSelectionToMarkdownSourceOffset(
  markdown: string,
  selection: Selection,
  view: EditorView,
  serializer: MarkdownSerializer
): number | null {
  const marker = createCursorMarker(markdown);
  try {
    const tr = view.state.tr.insertText(marker, selection.from, selection.to);
    const markedMarkdown = serializer(tr.doc);
    const serializedOffset = markedMarkdown.indexOf(marker);
    if (serializedOffset === -1) return null;

    const serializedMarkdown = `${markedMarkdown.slice(0, serializedOffset)}${markedMarkdown.slice(
      serializedOffset + marker.length
    )}`;
    return mapStringOffset(serializedMarkdown, markdown, serializedOffset);
  } catch {
    return null;
  }
}

function createCursorMarker(markdown: string): string {
  do {
    cursorMarkerSequence += 1;
  } while (markdown.includes(cursorMarker(cursorMarkerSequence)));
  return cursorMarker(cursorMarkerSequence);
}

function cursorMarker(sequence: number): string {
  return `JOTCURSORMARKER${sequence}END`;
}

function mapStringOffset(from: string, to: string, offset: number): number {
  if (from === to) return Math.max(0, Math.min(to.length, offset));

  let fromPosition = 0;
  let toPosition = 0;
  for (const change of diffChars(from, to)) {
    const valueLength = change.value.length;
    if (change.added === true) {
      toPosition += valueLength;
      continue;
    }
    if (change.removed === true) {
      if (offset <= fromPosition + valueLength) return toPosition;
      fromPosition += valueLength;
      continue;
    }

    if (offset <= fromPosition + valueLength) return toPosition + (offset - fromPosition);
    fromPosition += valueLength;
    toPosition += valueLength;
  }

  return toPosition;
}

function renderedTextOffsetBeforePosition(doc: ProseNode, position: number): number {
  return doc.textBetween(0, Math.max(0, position), "\n\n", "\n").length;
}

function placeSelectionAtMarkdownSourceOffset(
  view: EditorView,
  textSelection: typeof import("@milkdown/kit/prose/state").TextSelection,
  markdown: string,
  sourceOffset: number
): void {
  const renderedOffset = markdownSourceOffsetToRenderedOffset(markdown, sourceOffset);
  const position = positionForRenderedTextOffset(view.state.doc, renderedOffset);
  const selection = textSelection.near(view.state.doc.resolve(position));
  view.dispatch(view.state.tr.setSelection(selection).scrollIntoView());
}

function positionForRenderedTextOffset(doc: ProseNode, offset: number): number {
  const targetOffset = Math.max(0, offset);
  let bestPosition = 0;
  let bestDistance = Number.POSITIVE_INFINITY;

  doc.descendants((node, position) => {
    if (!node.isText) return true;

    const text = node.text ?? "";
    const startOffset = renderedTextOffsetBeforePosition(doc, position);
    const endOffset = startOffset + text.length;
    const clampedOffset = Math.max(startOffset, Math.min(endOffset, targetOffset));
    const distance = Math.abs(targetOffset - clampedOffset);
    if (distance < bestDistance) {
      bestDistance = distance;
      bestPosition = position + (clampedOffset - startOffset);
    }
    return true;
  });

  return Math.max(0, Math.min(doc.content.size, bestPosition));
}
