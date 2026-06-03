import { createEffect, createSignal, on, onCleanup, Show } from "solid-js";
import { firstClipboardImageFile } from "./clipboardImages";
import type { ImageAttachmentDisplayMap } from "./milkdownImages";
import { createMilkdownImageViewDom, updateMilkdownImageViewDom } from "./milkdownImages";
import { createListTightnessPlugin } from "./milkdownListTightness";
import { renderMilkdownListItemLabel } from "./milkdownListItems";
import { insertTextAreaTabIndent, shouldInsertTextAreaTabIndent } from "./textAreaIndent";
import { resizeTextAreaToContents } from "./textAreaSizing";
import {
  markdownSourceOffsetToRenderedOffset,
  renderedOffsetToMarkdownSourceOffset
} from "~/editor/markdownCursor";
import type { Editor as MilkdownEditorInstance } from "@milkdown/kit/core";
import type { Node as ProseNode } from "@milkdown/kit/prose/model";
import type { Selection } from "@milkdown/kit/prose/state";
import type { EditorView } from "@milkdown/kit/prose/view";

interface MilkdownEditorProps {
  readonly documentKey: string;
  readonly resetKey?: number;
  readonly focusAtEnd?: boolean;
  readonly focusOffset?: number | null;
  readonly onFocusApplied?: () => void;
  readonly onCursorChange?: (offset: number) => void;
  readonly imageAttachmentDisplays?: ImageAttachmentDisplayMap;
  readonly value: string;
  readonly onChange: (documentKey: string, markdown: string) => void;
  readonly onBlur: (documentKey: string, markdown: string) => void;
  readonly onPasteImage?: (documentKey: string, file: File) => void;
}

interface MilkdownEditorSession {
  readonly applyExternalMarkdown: (markdown: string) => void;
  readonly getMarkdown: () => string;
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
        let disposed = false;
        let editor: MilkdownEditorInstance | null = null;
        let session: MilkdownEditorSession | null = null;
        let removeRootListeners: (() => void) | null = null;
        onCleanup(() => {
          disposed = true;
          removeRootListeners?.();
          if (activeSession === session) {
            activeSession = null;
          }
          void editor?.destroy();
        });

        setError(null);
        root.replaceChildren();

        const [
          { Editor, rootCtx, defaultValueCtx, editorViewCtx, serializerCtx },
          { commonmark, imageSchema },
          { gfm },
          { history },
          { indent, indentConfig },
          { listener, listenerCtx },
          { listItemBlockComponent, listItemBlockConfig },
          { Plugin, TextSelection },
          { $prose, $view, replaceAll }
        ] =
          await Promise.all([
            import("@milkdown/kit/core"),
            import("@milkdown/kit/preset/commonmark"),
            import("@milkdown/kit/preset/gfm"),
            import("@milkdown/kit/plugin/history"),
            import("@milkdown/kit/plugin/indent"),
            import("@milkdown/kit/plugin/listener"),
            import("@milkdown/kit/component/list-item-block"),
            import("@milkdown/kit/prose/state"),
            import("@milkdown/kit/utils")
          ]);
        if (disposed) return;
        const preserveListTightness = $prose(() => createListTightnessPlugin(Plugin));
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
            ctx.set<import("@milkdown/kit/plugin/indent").IndentConfigOptions, "indentConfig">(
              indentConfig.key,
              { type: "space", size: 2 }
            );
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
            ctx.get(listenerCtx).selectionUpdated((_ctx, selection) => {
              if (disposed || activeSession !== session) return;
              props.onCursorChange?.(renderedOffsetToMarkdownSourceOffset(
                markdownState.currentMarkdown,
                selectionToRenderedTextOffset(selection)
              ));
            });
          })
          .use(commonmark)
          .use(jotImageView)
          .use(gfm)
          .use(listItemBlockComponent)
          .use(preserveListTightness)
          .use(history)
          .use(indent)
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
            applyExternalMarkdown: (markdown) => {
              if (disposed || activeSession !== session || editor === null) return;

              let replacedMarkdown = markdown;
              editor.action((ctx) => {
                replaceAll(markdown)(ctx);
                const view = ctx.get(editorViewCtx);
                const serializer = ctx.get(serializerCtx);
                replacedMarkdown = serializer(view.state.doc);
              });
              trackMilkdownExternalMarkdown(markdownState, markdown, replacedMarkdown);
            },
            getMarkdown: () => markdownState.currentMarkdown
          };
          activeSession = session;
          if (props.value !== markdownState.currentMarkdown) {
            session.applyExternalMarkdown(props.value);
          }
          const view = editor.ctx.get(editorViewCtx);
          trackMilkdownSerializedMarkdown(markdownState, editor.ctx.get(serializerCtx)(view.state.doc));
          focusEditable(
            root,
            focusPlacement(focusAtEnd, focusOffset),
            view,
            TextSelection,
            props.value,
            props.onFocusApplied
          );
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

    session.applyExternalMarkdown(markdown);
  });

  createEffect(() => {
    props.value;
    if (error() === null || fallbackTextarea === undefined) return;
    requestAnimationFrame(() => {
      if (fallbackTextarea !== undefined) resizeTextAreaToContents(fallbackTextarea);
    });
  });

  return (
    <div class="editor-shell">
      <div ref={root} class="milkdown-root" />
      <Show when={error() !== null}>
        <textarea
          class="fallback-editor"
          value={props.value}
          ref={(element) => {
            fallbackTextarea = element;
            resizeTextAreaToContents(element);
            focusTextArea(element, focusPlacement(props.focusAtEnd, props.focusOffset), props.onFocusApplied);
          }}
          onClick={(event) => props.onCursorChange?.(event.currentTarget.selectionStart)}
          onInput={(event) => {
            resizeTextAreaToContents(event.currentTarget);
            props.onCursorChange?.(event.currentTarget.selectionStart);
            props.onChange(props.documentKey, event.currentTarget.value);
          }}
          onKeyDown={(event) => {
            if (!shouldInsertTextAreaTabIndent(event)) return;

            event.preventDefault();
            insertTextAreaTabIndent(
              event.currentTarget,
              (markdown) => props.onChange(props.documentKey, markdown),
              props.onCursorChange
            );
            resizeTextAreaToContents(event.currentTarget);
          }}
          onKeyUp={(event) => props.onCursorChange?.(event.currentTarget.selectionStart)}
          onSelect={(event) => props.onCursorChange?.(event.currentTarget.selectionStart)}
          onBlur={(event) => props.onBlur(props.documentKey, event.currentTarget.value)}
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
  requestAnimationFrame(() => {
    const editable = root.querySelector<HTMLElement>("[contenteditable='true']");
    if (!editable) return;
    editable.focus();
    if (placement.type === "end") {
      placeSelectionAtEnd(editable);
    } else if (placement.type === "offset") {
      placeSelectionAtMarkdownSourceOffset(view, textSelection, markdown, placement.offset);
    }
    onFocusApplied?.();
  });
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

function placeSelectionAtEnd(element: HTMLElement): void {
  const selection = window.getSelection();
  if (selection === null) return;

  const range = document.createRange();
  range.selectNodeContents(element);
  range.collapse(false);
  selection.removeAllRanges();
  selection.addRange(range);
}

function selectionToRenderedTextOffset(selection: Selection): number {
  return renderedTextOffsetBeforePosition(selection.$from.doc, selection.from);
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
