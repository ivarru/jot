import { createEffect, createRenderEffect, createSignal, on, onCleanup, Show } from "solid-js";
import { firstClipboardImageFile } from "./clipboardImages";
import type { ImageAttachmentDisplayMap } from "./milkdownImages";
import { createMilkdownImageViewDom, updateMilkdownImageViewDom } from "./milkdownImages";
import { shouldSyncMilkdownInlineMarkdown } from "./milkdownInlineSync";
import { createListTightnessPlugin } from "./milkdownListTightness";
import { renderMilkdownListItemLabel } from "./milkdownListItems";
import { createPlainUrlLinkBoundaryPlugin } from "./milkdownPlainUrl";
import { createMilkdownStructuralTabKeymap } from "./milkdownStructuralTab";
import { createMilkdownTableBoundaryNavigation } from "./milkdownTableBoundaryNavigation";
import { createMilkdownTableEnterKeymap } from "./milkdownTableEnter";
import { applyTextAreaStructuralTab, shouldHandleTextAreaStructuralTab } from "./textAreaIndent";
import { resizeTextAreaToContents } from "./textAreaSizing";
import { markdownLinkAtOffset } from "~/domain/dailyNoteLinks";
import {
  inactiveBlockFormatState,
  toggleMarkdownBlockQuote,
  type BlockFormatState
} from "~/editor/blockFormatting";
import {
  inactiveInlineFormatState,
  type InlineFormatState,
  type InlineMarkFormat
} from "~/editor/inlineFormatting";
import {
  inactiveListItemFormatState,
  markdownListItemFormatState,
  toggleMarkdownTaskListItem,
  type ListItemFormatState
} from "~/editor/listFormatting";
import {
  markdownSourceOffsetToRenderedOffset,
  renderedOffsetToMarkdownSourceOffset
} from "~/editor/markdownCursor";
import type { MarkdownSelection } from "~/editor/markdownSelection";
import { diffChars } from "diff";
import type { Ctx } from "@milkdown/kit/ctx";
import type { Editor as MilkdownEditorInstance } from "@milkdown/kit/core";
import type { MarkType, Node as ProseNode, NodeType } from "@milkdown/kit/prose/model";
import type { EditorState, Selection, Transaction } from "@milkdown/kit/prose/state";
import type { EditorView } from "@milkdown/kit/prose/view";

interface MilkdownEditorProps {
  readonly documentKey: string;
  readonly resetKey?: number;
  readonly focusAtEnd?: boolean;
  readonly focusSelection?: MarkdownSelection | null;
  readonly focusEnabled?: boolean;
  readonly onFocusApplied?: () => void;
  readonly imageAttachmentDisplays?: ImageAttachmentDisplayMap;
  readonly value: string;
  readonly readOnly?: boolean;
  readonly onChange: (documentKey: string, markdown: string) => void;
  readonly onBlur: (documentKey: string, markdown: string) => void;
  readonly onController?: (controller: MilkdownEditorController | null) => void;
  readonly onHistoryAvailabilityChange?: (availability: EditorHistoryAvailability) => void;
  readonly onInlineFormatStateChange?: (state: InlineFormatState) => void;
  readonly onBlockFormatStateChange?: (state: BlockFormatState) => void;
  readonly onListItemFormatStateChange?: (state: ListItemFormatState) => void;
  readonly onOpenLink?: (documentKey: string, href: string) => boolean;
  readonly onPasteImage?: (documentKey: string, file: File) => void;
}

interface MilkdownEditorSession {
  readonly applyExternalMarkdown: (markdown: string, undoable: boolean) => void;
  readonly applyStructuralTab: (shiftKey: boolean) => boolean;
  readonly closeHistory: () => void;
  readonly getBlockFormatState: () => BlockFormatState;
  readonly getHistoryAvailability: () => EditorHistoryAvailability;
  readonly getInlineFormatState: () => InlineFormatState;
  readonly getListItemFormatState: () => ListItemFormatState;
  readonly getSelection: () => MarkdownSelection | null;
  readonly getMarkdown: () => string;
  readonly focus: (placement: FocusPlacement, onFocusApplied?: () => void) => void;
  readonly redo: () => boolean;
  readonly setReadOnly: (readOnly: boolean) => void;
  readonly toggleBlockQuoteAtSelection: (selection?: MarkdownSelection) => boolean;
  readonly toggleInlineCodeAtSelection: () => boolean;
  readonly toggleInlineMarkAtSelection: (format: InlineMarkFormat) => boolean;
  readonly toggleTaskListItemAtSelection: (selection?: MarkdownSelection) => boolean;
  readonly undo: () => boolean;
}

interface EditorViewWithDomObserver extends EditorView {
  readonly domObserver?: {
    readonly flush?: () => void;
  };
}

type MarkdownSerializer = (doc: ProseNode) => string;
interface MarkdownSelectionMarkers {
  readonly markdown: string;
  readonly startMarker: string;
  readonly endMarker: string | null;
}
let cursorMarkerSequence = 0;

export interface MilkdownEditorController {
  readonly applyRawMarkdown: (markdown: string) => void;
  readonly applyStructuralTab: (shiftKey: boolean) => boolean;
  readonly closeHistory: () => void;
  readonly getBlockFormatState: () => BlockFormatState;
  readonly getHistoryAvailability: () => EditorHistoryAvailability;
  readonly getInlineFormatState: () => InlineFormatState;
  readonly getListItemFormatState: () => ListItemFormatState;
  readonly getMarkdown: () => string;
  readonly getSelection: () => MarkdownSelection | null;
  readonly redo: () => boolean;
  readonly toggleBlockQuoteAtSelection: (selection?: MarkdownSelection) => boolean;
  readonly toggleInlineCodeAtSelection: () => boolean;
  readonly toggleInlineMarkAtSelection: (format: InlineMarkFormat) => boolean;
  readonly toggleTaskListItemAtSelection: (selection?: MarkdownSelection) => boolean;
  readonly undo: () => boolean;
}

export interface EditorHistoryAvailability {
  readonly canUndo: boolean;
  readonly canRedo: boolean;
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
        const focusSelection = props.focusSelection;
        const markdownState = createMilkdownMarkdownSyncState(props.value);
        let currentReadOnly = props.readOnly === true;
        let disposed = false;
        let editor: MilkdownEditorInstance | null = null;
        let session: MilkdownEditorSession | null = null;
        let lastPointerMarkdownSelection: MarkdownSelection | null = null;
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
          {
            blockquoteSchema,
            bulletListSchema,
            codeBlockSchema,
            commonmark,
            emphasisSchema,
            headingSchema,
            imageSchema,
            inlineCodeSchema,
            linkSchema,
            listItemSchema,
            paragraphSchema,
            strongSchema
          },
          { gfm, tableCellSchema, tableRowSchema },
          { automd, inlineSyncConfig },
          { clipboard },
          { history },
          { listener, listenerCtx },
          { listItemBlockComponent, listItemBlockConfig },
          { Plugin, TextSelection },
          { closeHistory, redo, redoDepth, undo, undoDepth },
          { isInTable, selectedRect },
          { liftListItem, sinkListItem },
          { toggleMark, wrapIn },
          { $prose, $useKeymap, $view, replaceAll }
        ] =
          await Promise.all([
            import("@milkdown/kit/core"),
            import("@milkdown/kit/preset/commonmark"),
            import("@milkdown/kit/preset/gfm"),
            import("@milkdown/plugin-automd"),
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
        const historyAvailability = (view: EditorView): EditorHistoryAvailability => ({
          canUndo: undoDepth(view.state) > 0,
          canRedo: redoDepth(view.state) > 0
        });
        const inlineFormatState = (view: EditorView): InlineFormatState =>
          milkdownInlineFormatState(view, editor?.ctx ?? null, {
            italic: emphasisSchema,
            bold: strongSchema,
            code: inlineCodeSchema
          });
        const blockFormatState = (view: EditorView): BlockFormatState =>
          milkdownBlockFormatState(view, editor?.ctx ?? null, {
            quote: blockquoteSchema
          });
        const listItemFormatState = (view: EditorView): ListItemFormatState => {
          if (editor === null) return inactiveListItemFormatState;
          const selection = editorSelectionToMarkdownSourceSelection(
            markdownState.currentMarkdown,
            view.state.selection,
            view,
            editor.ctx.get(serializerCtx)
          );
          return markdownListItemFormatState(markdownState.currentMarkdown, selection);
        };
        const notifyHistoryAvailability = (view: EditorView) => {
          props.onHistoryAvailabilityChange?.(historyAvailability(view));
        };
        const notifyInlineFormatState = (view: EditorView) => {
          props.onInlineFormatStateChange?.(inlineFormatState(view));
        };
        const notifyBlockFormatState = (view: EditorView) => {
          props.onBlockFormatStateChange?.(blockFormatState(view));
        };
        const notifyListItemFormatState = (view: EditorView) => {
          props.onListItemFormatStateChange?.(listItemFormatState(view));
        };
        const inlineFormatStateTracker = $prose((ctx) => new Plugin({
          view: (view) => {
            props.onInlineFormatStateChange?.(milkdownInlineFormatState(view, ctx, {
              italic: emphasisSchema,
              bold: strongSchema,
              code: inlineCodeSchema
            }));

            return {
              update: (updatedView, previousState) => {
                if (
                  updatedView.state.doc === previousState.doc &&
                  updatedView.state.storedMarks === previousState.storedMarks &&
                  updatedView.state.selection.eq(previousState.selection)
                ) {
                  return;
                }

                props.onInlineFormatStateChange?.(milkdownInlineFormatState(updatedView, ctx, {
                  italic: emphasisSchema,
                  bold: strongSchema,
                  code: inlineCodeSchema
                }));
              }
            };
          }
        }));
        const blockFormatStateTracker = $prose((ctx) => new Plugin({
          view: (view) => {
            props.onBlockFormatStateChange?.(milkdownBlockFormatState(view, ctx, {
              quote: blockquoteSchema
            }));
            props.onListItemFormatStateChange?.(listItemFormatState(view));

            return {
              update: (updatedView, previousState) => {
                if (
                  updatedView.state.doc === previousState.doc &&
                  updatedView.state.selection.eq(previousState.selection)
                ) {
                  return;
                }

                props.onBlockFormatStateChange?.(milkdownBlockFormatState(updatedView, ctx, {
                  quote: blockquoteSchema
                }));
                props.onListItemFormatStateChange?.(listItemFormatState(updatedView));
              }
            };
          }
        }));
        const pointerBlockQuoteSelectionTracker = $prose((ctx) => new Plugin({
          props: {
            handleDOMEvents: {
              pointerdown: (view, event) => {
                lastPointerMarkdownSelection = pointerEventMarkdownSelection(
                  markdownState.currentMarkdown,
                  event,
                  view,
                  ctx.get(serializerCtx)
                );
                return false;
              },
              keydown: () => {
                lastPointerMarkdownSelection = null;
                return false;
              }
            }
          }
        }));
        const preventLinkBoundaryTyping = $prose((ctx) =>
          createLinkBoundaryTypingPlugin(Plugin, linkSchema.type(ctx))
        );
        const preventPlainUrlLinkBoundaryPaste = $prose((ctx) =>
          createPlainUrlLinkBoundaryPlugin(Plugin, TextSelection, linkSchema.type(ctx))
        );
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
        const tableEnterKeymap = createMilkdownTableEnterKeymap({
          useKeymap: $useKeymap,
          isInTable,
          selectedRect,
          TextSelection,
          tableCellSchema,
          tableRowSchema,
          paragraphSchema
        });
        const tableBoundaryNavigation = createMilkdownTableBoundaryNavigation({
          useKeymap: $useKeymap,
          prose: $prose,
          Plugin,
          isInTable,
          selectedRect,
          TextSelection,
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
            ctx.update(inlineSyncConfig.key, (config) => ({
              ...config,
              shouldSyncNode: shouldSyncMilkdownInlineMarkdown(config.shouldSyncNode)
            }));
            ctx.get(listenerCtx).updated((ctx, doc) => {
              if (disposed || activeSession !== session) return;

              notifyHistoryAvailability(ctx.get(editorViewCtx));

              const serializer = ctx.get(serializerCtx);
              const markdown = serializeMilkdownMarkdown(serializer, doc);
              if (!applyMilkdownUpdatedMarkdown(markdownState, markdown)) return;

              props.onChange(documentKey, markdown);
            });
          })
          .use(commonmark)
          .use(jotImageView)
          .use(gfm)
          .use(automd)
          .use(preventPlainUrlLinkBoundaryPaste)
          .use(clipboard)
          .use(structuralTabKeymap)
          .use(tableBoundaryNavigation)
          .use(tableEnterKeymap)
          .use(preventLinkBoundaryTyping)
          .use(inlineFormatStateTracker)
          .use(blockFormatStateTracker)
          .use(pointerBlockQuoteSelectionTracker)
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
                replacedMarkdown = serializeMilkdownMarkdown(serializer, view.state.doc);
              });
              trackMilkdownExternalMarkdown(markdownState, markdown, replacedMarkdown);
              notifyHistoryAvailability(editor.ctx.get(editorViewCtx));
            },
            applyStructuralTab: (shiftKey) => {
              if (disposed || activeSession !== session || editor === null || currentReadOnly) return false;
              const view = editor.ctx.get(editorViewCtx);
              if (isInTable(view.state)) return false;
              const handled =
                view.someProp("handleKeyDown", (handler) =>
                  handler(view, new KeyboardEvent("keydown", { bubbles: true, cancelable: true, key: "Tab", shiftKey }))
                ) === true;
              if (handled) {
                view.focus();
                notifyHistoryAvailability(view);
              }
              return handled;
            },
            closeHistory: () => {
              if (disposed || activeSession !== session || editor === null) return;
              const view = editor.ctx.get(editorViewCtx);
              view.dispatch(closeHistory(view.state.tr));
            },
            getHistoryAvailability: () => {
              if (disposed || activeSession !== session || editor === null) return { canUndo: false, canRedo: false };
              return historyAvailability(editor.ctx.get(editorViewCtx));
            },
            getBlockFormatState: () => {
              if (disposed || activeSession !== session || editor === null) return inactiveBlockFormatState;
              return blockFormatState(editor.ctx.get(editorViewCtx));
            },
            getInlineFormatState: () => {
              if (disposed || activeSession !== session || editor === null) return inactiveInlineFormatState;
              return inlineFormatState(editor.ctx.get(editorViewCtx));
            },
            getListItemFormatState: () => {
              if (disposed || activeSession !== session || editor === null) return inactiveListItemFormatState;
              return listItemFormatState(editor.ctx.get(editorViewCtx));
            },
            getSelection: () => {
              if (disposed || activeSession !== session || editor === null) return null;
              const view = editor.ctx.get(editorViewCtx);
              const markdown = markdownState.currentMarkdown;
              return editorDomSelectionToMarkdownSourceSelection(
                markdown,
                view,
                editor.ctx.get(serializerCtx)
              ) ?? editorSelectionToMarkdownSourceSelection(
                markdown,
                view.state.selection,
                view,
                editor.ctx.get(serializerCtx)
              );
            },
            getMarkdown: () => markdownState.currentMarkdown,
            focus: (placement, onFocusApplied) => {
              if (disposed || activeSession !== session || editor === null) return;
              const view = editor.ctx.get(editorViewCtx);
              focusEditable(
                root,
                placement,
                view,
                TextSelection,
                markdownState.currentMarkdown,
                onFocusApplied,
                () => !disposed && activeSession === session && editor !== null
              );
            },
            redo: () => {
              if (disposed || activeSession !== session || editor === null) return false;
              const view = editor.ctx.get(editorViewCtx);
              const applied = redo(view.state, view.dispatch, view);
              if (applied) notifyHistoryAvailability(view);
              notifyInlineFormatState(view);
              notifyBlockFormatState(view);
              notifyListItemFormatState(view);
              return applied;
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
            toggleBlockQuoteAtSelection: (selection) => {
              if (disposed || activeSession !== session || editor === null || currentReadOnly) return false;
              const view = editor.ctx.get(editorViewCtx);
              const serializer = editor.ctx.get(serializerCtx);
              const sourceSelection = selection ?? editorSelectionToMarkdownSourceSelection(
                markdownState.currentMarkdown,
                view.state.selection,
                view,
                serializer
              );
              const blockQuoteSelection = selectionWithPointerFallback(
                markdownState.currentMarkdown,
                sourceSelection,
                lastPointerMarkdownSelection
              );
              lastPointerMarkdownSelection = null;
              const result = toggleMarkdownBlockQuote(markdownState.currentMarkdown, blockQuoteSelection);
              if (result.markdown === markdownState.currentMarkdown) return false;
              const markedSelection = markdownWithSelectionMarkers(result.markdown, result.selection);

              editor.action((ctx) => {
                replaceAll(markedSelection.markdown, false)(ctx);
                const updatedView = ctx.get(editorViewCtx);
                if (!restoreSelectionFromMarkers(updatedView, TextSelection, markedSelection)) {
                  replaceAll(result.markdown, false)(ctx);
                  placeSelectionAtMarkdownSourceSelection(updatedView, TextSelection, result.markdown, result.selection);
                }
                updatedView.focus();
              });
              const updatedView = editor.ctx.get(editorViewCtx);
              trackMilkdownExternalMarkdown(markdownState, result.markdown, serializeMilkdownMarkdown(serializer, updatedView.state.doc));
              props.onChange(documentKey, result.markdown);
              notifyHistoryAvailability(updatedView);
              notifyBlockFormatState(updatedView);
              notifyListItemFormatState(updatedView);
              return true;
            },
            toggleInlineCodeAtSelection: () => {
              if (disposed || activeSession !== session || editor === null || currentReadOnly) return false;
              const view = editor.ctx.get(editorViewCtx);
              const applied = toggleInlineMarkInView(view, TextSelection, inlineCodeSchema.type(editor.ctx), toggleMark);
              if (!applied) return false;
              notifyHistoryAvailability(view);
              notifyInlineFormatState(view);
              return true;
            },
            toggleInlineMarkAtSelection: (format) => {
              if (disposed || activeSession !== session || editor === null || currentReadOnly) return false;
              const view = editor.ctx.get(editorViewCtx);
              const markType = format === "bold" ? strongSchema.type(editor.ctx) : emphasisSchema.type(editor.ctx);
              const applied = toggleInlineMarkInView(view, TextSelection, markType, toggleMark);
              if (!applied) return false;
              notifyHistoryAvailability(view);
              notifyInlineFormatState(view);
              return true;
            },
            toggleTaskListItemAtSelection: (selection) => {
              if (disposed || activeSession !== session || editor === null || currentReadOnly) return false;
              const view = editor.ctx.get(editorViewCtx);
              const serializer = editor.ctx.get(serializerCtx);
              const sourceSelection = selection ?? editorSelectionToMarkdownSourceSelection(
                markdownState.currentMarkdown,
                view.state.selection,
                view,
                serializer
              );
              const listItemSelection = selectionWithPointerFallback(
                markdownState.currentMarkdown,
                sourceSelection,
                lastPointerMarkdownSelection
              );
              lastPointerMarkdownSelection = null;
              const result = toggleMarkdownTaskListItem(markdownState.currentMarkdown, listItemSelection);
              if (result === null || result.markdown === markdownState.currentMarkdown) return false;
              const markedSelection = markdownWithSelectionMarkers(result.markdown, result.selection);

              editor.action((ctx) => {
                replaceAll(markedSelection.markdown, false)(ctx);
                const updatedView = ctx.get(editorViewCtx);
                if (!restoreSelectionFromMarkers(updatedView, TextSelection, markedSelection)) {
                  replaceAll(result.markdown, false)(ctx);
                  placeSelectionAtMarkdownSourceSelection(updatedView, TextSelection, result.markdown, result.selection);
                }
                updatedView.focus();
              });
              const updatedView = editor.ctx.get(editorViewCtx);
              trackMilkdownExternalMarkdown(markdownState, result.markdown, serializeMilkdownMarkdown(serializer, updatedView.state.doc));
              props.onChange(documentKey, result.markdown);
              notifyHistoryAvailability(updatedView);
              notifyListItemFormatState(updatedView);
              return true;
            },
            undo: () => {
              if (disposed || activeSession !== session || editor === null) return false;
              const view = editor.ctx.get(editorViewCtx);
              const applied = undo(view.state, view.dispatch, view);
              if (applied) notifyHistoryAvailability(view);
              notifyInlineFormatState(view);
              notifyBlockFormatState(view);
              notifyListItemFormatState(view);
              return applied;
            }
          };
          activeSession = session;
          props.onController?.({
            applyRawMarkdown: (markdown) => {
              session?.applyExternalMarkdown(markdown, true);
            },
            applyStructuralTab: (shiftKey) => session?.applyStructuralTab(shiftKey) ?? false,
            closeHistory: () => {
              session?.closeHistory();
            },
            getBlockFormatState: () => session?.getBlockFormatState() ?? inactiveBlockFormatState,
            getHistoryAvailability: () => session?.getHistoryAvailability() ?? { canUndo: false, canRedo: false },
            getInlineFormatState: () => session?.getInlineFormatState() ?? inactiveInlineFormatState,
            getListItemFormatState: () => session?.getListItemFormatState() ?? inactiveListItemFormatState,
            getMarkdown: () => session?.getMarkdown() ?? markdownState.currentMarkdown,
            getSelection: () => session?.getSelection() ?? null,
            redo: () => session?.redo() ?? false,
            toggleBlockQuoteAtSelection: (selection) => session?.toggleBlockQuoteAtSelection(selection) ?? false,
            toggleInlineCodeAtSelection: () => session?.toggleInlineCodeAtSelection() ?? false,
            toggleInlineMarkAtSelection: (format) => session?.toggleInlineMarkAtSelection(format) ?? false,
            toggleTaskListItemAtSelection: (selection) => session?.toggleTaskListItemAtSelection(selection) ?? false,
            undo: () => session?.undo() ?? false
          });
          props.onHistoryAvailabilityChange?.(session.getHistoryAvailability());
          props.onInlineFormatStateChange?.(session.getInlineFormatState());
          props.onBlockFormatStateChange?.(session.getBlockFormatState());
          props.onListItemFormatStateChange?.(session.getListItemFormatState());
          session.setReadOnly(props.readOnly === true);
          if (props.value !== markdownState.currentMarkdown) {
            session.applyExternalMarkdown(props.value, false);
          }
          const view = editor.ctx.get(editorViewCtx);
          trackMilkdownSerializedMarkdown(markdownState, serializeMilkdownMarkdown(editor.ctx.get(serializerCtx), view.state.doc));
          if (props.focusEnabled !== false) {
            session.focus(focusPlacement(focusAtEnd, focusSelection), props.onFocusApplied);
          }
        }

        const blurListener = () => props.onBlur(documentKey, markdownState.currentMarkdown);
        const clickLinkListener = (event: MouseEvent) => {
          if (event.button !== 0) return;
          const href = linkHrefFromEvent(event, root);
          if (href === null) return;
          if (props.onOpenLink === undefined) return;

          props.onOpenLink(documentKey, href);
          event.preventDefault();
          event.stopImmediatePropagation();
        };
        const openLinkShortcutListener = (event: KeyboardEvent) => {
          if (!isOpenLinkShortcut(event)) return;
          const session = activeSession;
          const selection = session?.getSelection() ?? null;
          if (selection === null) return;
          const link = markdownLinkAtOffset(session!.getMarkdown(), selection.start);
          if (link === null || props.onOpenLink?.(documentKey, link.destination) !== true) return;

          event.preventDefault();
          event.stopImmediatePropagation();
        };
        const pasteListener = (event: ClipboardEvent) => {
          if (props.onPasteImage === undefined) return;
          const file = firstClipboardImageFile(event.clipboardData?.items);
          if (file === null) return;

          event.preventDefault();
          event.stopImmediatePropagation();
          props.onPasteImage(documentKey, file);
        };
        root.addEventListener("focusout", blurListener);
        root.addEventListener("click", clickLinkListener, { capture: true });
        root.addEventListener("keydown", openLinkShortcutListener, { capture: true });
        root.addEventListener("paste", pasteListener, { capture: true });
        removeRootListeners = () => {
          root.removeEventListener("focusout", blurListener);
          root.removeEventListener("click", clickLinkListener, { capture: true });
          root.removeEventListener("keydown", openLinkShortcutListener, { capture: true });
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
      () => [props.documentKey, props.resetKey, props.focusAtEnd, props.focusSelection, props.focusEnabled] as const,
      (focus, previousFocus) => {
        if (props.focusEnabled === false) return;
        if (previousFocus !== undefined && (focus[0] !== previousFocus[0] || focus[1] !== previousFocus[1])) return;
        if (clearedOnlyFocusSelection(focus, previousFocus)) return;
        activeSession?.focus(
          focusPlacement(props.focusAtEnd, props.focusSelection),
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
            focusTextArea(element, focusPlacement(props.focusAtEnd, props.focusSelection), props.onFocusApplied);
          }}
          onInput={(event) => {
            if (props.readOnly === true) return;
            resizeTextAreaToContents(event.currentTarget);
            props.onChange(props.documentKey, event.currentTarget.value);
          }}
          onKeyDown={(event) => {
            if (props.readOnly === true) return;
            if (!shouldHandleTextAreaStructuralTab(event)) return;

            event.preventDefault();
            applyTextAreaStructuralTab(
              event.currentTarget,
              event.shiftKey,
              (markdown) => props.onChange(props.documentKey, markdown)
            );
            resizeTextAreaToContents(event.currentTarget);
          }}
          onBlur={(event) => {
            props.onBlur(props.documentKey, event.currentTarget.value);
          }}
          aria-label="Markdown editor fallback"
        />
      </Show>
    </div>
  );
}

function isOpenLinkShortcut(event: KeyboardEvent): boolean {
  return event.key === "Enter" && (event.metaKey || event.ctrlKey) && !event.shiftKey && !event.altKey && !event.isComposing;
}

function serializeMilkdownMarkdown(serializer: MarkdownSerializer, doc: ProseNode): string {
  return serializer(doc).replaceAll("\u00a0", " ");
}

function linkHrefFromEvent(event: Event, root: HTMLElement): string | null {
  const target = event.target;
  if (!(target instanceof Element) || !root.contains(target)) return null;
  const anchor = target.closest("a[href]");
  if (!(anchor instanceof HTMLAnchorElement) || !root.contains(anchor)) return null;
  return anchor.getAttribute("href");
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

function flushPendingEditorDomChanges(view: EditorView): void {
  (view as EditorViewWithDomObserver).domObserver?.flush?.();
}

interface MarkSchemaProvider {
  readonly type: (ctx: Ctx) => MarkType;
}

interface NodeSchemaProvider {
  readonly type: (ctx: Ctx) => NodeType;
}

function milkdownInlineFormatState(
  view: EditorView,
  ctx: Ctx | null,
  schemas: {
    readonly italic: MarkSchemaProvider;
    readonly bold: MarkSchemaProvider;
    readonly code: MarkSchemaProvider;
  }
): InlineFormatState {
  if (ctx === null) return inactiveInlineFormatState;

  const hasMark = (schema: MarkSchemaProvider) => selectionHasMark(view, schema.type(ctx));
  return {
    italic: hasMark(schemas.italic),
    bold: hasMark(schemas.bold),
    code: hasMark(schemas.code)
  };
}

function milkdownBlockFormatState(
  view: EditorView,
  ctx: Ctx | null,
  schemas: {
    readonly quote: NodeSchemaProvider;
  }
): BlockFormatState {
  if (ctx === null) return inactiveBlockFormatState;

  return {
    quote: selectionHasAncestorNode(view, schemas.quote.type(ctx))
  };
}

function selectionHasMark(view: EditorView, markType: MarkType): boolean {
  const selection = view.state.selection;
  if (selection.empty) {
    return markType.isInSet(view.state.storedMarks ?? selection.$from.marks()) !== undefined;
  }

  let selectedTextFound = false;
  let allSelectedTextHasMark = true;
  view.state.doc.nodesBetween(selection.from, selection.to, (node, position) => {
    if (!node.isText) return;

    const start = Math.max(selection.from, position);
    const end = Math.min(selection.to, position + node.nodeSize);
    if (start >= end) return;

    selectedTextFound = true;
    if (markType.isInSet(node.marks) === undefined) {
      allSelectedTextHasMark = false;
    }
  });

  return selectedTextFound && allSelectedTextHasMark;
}

function selectionHasAncestorNode(view: EditorView, nodeType: NodeType): boolean {
  const selection = view.state.selection;
  if (selection.empty) return resolvedPositionHasAncestor(selection.$from, nodeType);

  let selectedTextBlockFound = false;
  let allSelectedTextBlocksHaveAncestor = true;
  view.state.doc.nodesBetween(selection.from, selection.to, (node, position) => {
    if (!node.isTextblock) return;

    const start = Math.max(selection.from, position);
    const end = Math.min(selection.to, position + node.nodeSize);
    if (start >= end) return;

    selectedTextBlockFound = true;
    if (!resolvedPositionHasAncestor(view.state.doc.resolve(position + 1), nodeType)) {
      allSelectedTextBlocksHaveAncestor = false;
    }
  });

  return selectedTextBlockFound && allSelectedTextBlocksHaveAncestor;
}

function resolvedPositionHasAncestor(position: Selection["$from"], nodeType: NodeType): boolean {
  for (let depth = position.depth; depth > 0; depth -= 1) {
    if (position.node(depth).type === nodeType) return true;
  }
  return false;
}

function toggleInlineMarkInView(
  view: EditorView,
  textSelection: typeof import("@milkdown/kit/prose/state").TextSelection,
  markType: MarkType,
  toggleMarkCommand: typeof import("@milkdown/kit/prose/commands").toggleMark
): boolean {
  flushPendingEditorDomChanges(view);
  const selection = view.state.selection;
  if (!(selection instanceof textSelection)) return false;

  if (selection.$cursor === null) {
    const applied = toggleMarkCommand(markType)(view.state, view.dispatch, view);
    if (applied) view.focus();
    return applied;
  }

  const active = markType.isInSet(view.state.storedMarks ?? selection.$cursor.marks()) !== undefined;
  const transaction = active
    ? view.state.tr.removeStoredMark(markType)
    : view.state.tr.addStoredMark(markType.create());
  view.dispatch(transaction.setMeta("addToHistory", false));
  view.focus();
  return true;
}

export function createLinkBoundaryTypingPlugin(
  Plugin: typeof import("@milkdown/kit/prose/state").Plugin,
  linkType: MarkType
) {
  return new Plugin({
    appendTransaction: (_transactions, _oldState, newState): Transaction | null =>
      clearLinkBoundaryStoredMarkTransaction(newState, linkType)
  });
}

function clearLinkBoundaryStoredMarkTransaction(state: EditorState, linkType: MarkType): Transaction | null {
  const selection = state.selection;
  if (!selection.empty) return null;
  if (!isAtLinkRightBoundary(selection, linkType)) return null;

  const currentMarks = state.storedMarks ?? selection.$from.marks();
  const nextMarks = currentMarks.filter((mark) => mark.type !== linkType);
  if (nextMarks.length === currentMarks.length) return null;

  return state.tr.setStoredMarks(nextMarks).setMeta("addToHistory", false);
}

function isAtLinkRightBoundary(selection: Selection, linkType: MarkType): boolean {
  const before = selection.$from.nodeBefore;
  if (before === null) return false;

  const beforeLink = linkType.isInSet(before.marks);
  if (beforeLink === undefined) return false;

  const after = selection.$from.nodeAfter;
  const afterLink = after === null ? undefined : linkType.isInSet(after.marks);
  return afterLink === undefined || !afterLink.eq(beforeLink);
}

function focusEditable(
  root: HTMLElement,
  placement: FocusPlacement,
  view: EditorView,
  textSelection: typeof import("@milkdown/kit/prose/state").TextSelection,
  markdown: string,
  onFocusApplied?: () => void,
  isActive: () => boolean = () => true
): void {
  if (!isActive()) return;
  placeEditorSelection(view, textSelection, markdown, placement);
  view.focus();
  placeEditorSelection(view, textSelection, markdown, placement);
  onFocusApplied?.();
  restoreEditableSelection(root, view, textSelection, markdown, placement, 4, isActive);
}

function restoreEditableSelection(
  root: HTMLElement,
  view: EditorView,
  textSelection: typeof import("@milkdown/kit/prose/state").TextSelection,
  markdown: string,
  placement: FocusPlacement,
  attempts: number,
  isActive: () => boolean
): void {
  requestAnimationFrame(() => {
    if (!isActive()) return;
    if (root.querySelector<HTMLElement>("[contenteditable='true']") === null) {
      if (attempts > 0) {
        restoreEditableSelection(root, view, textSelection, markdown, placement, attempts - 1, isActive);
      }
      return;
    }
    placeEditorSelection(view, textSelection, markdown, placement);
    view.focus();
    placeEditorSelection(view, textSelection, markdown, placement);
  });
}

function placeEditorSelection(
  view: EditorView,
  textSelection: typeof import("@milkdown/kit/prose/state").TextSelection,
  markdown: string,
  placement: FocusPlacement
): void {
  if (placement.type === "end") {
    placeEditorSelectionAtEnd(view, textSelection);
  } else if (placement.type === "selection") {
    placeSelectionAtMarkdownSourceSelection(view, textSelection, markdown, placement.selection);
  }
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
  } else if (placement.type === "selection") {
    const start = Math.max(0, Math.min(element.value.length, placement.selection.start));
    const end = Math.max(0, Math.min(element.value.length, placement.selection.end));
    element.setSelectionRange(start, end);
  }
}

function placeEditorSelectionAtEnd(
  view: EditorView,
  textSelection: typeof import("@milkdown/kit/prose/state").TextSelection
): void {
  view.dispatch(view.state.tr.setSelection(textSelection.atEnd(view.state.doc)).scrollIntoView());
}

export function editorSelectionToMarkdownSourceSelection(
  markdown: string,
  selection: Selection,
  view: EditorView,
  serializer: MarkdownSerializer
): MarkdownSelection {
  const bias = selection.empty ? "cursor" : null;
  return {
    start: editorPositionToMarkdownSourceOffset(markdown, selection.from, bias ?? "start", view, serializer),
    end: editorPositionToMarkdownSourceOffset(markdown, selection.to, bias ?? "end", view, serializer)
  };
}

function editorDomSelectionToMarkdownSourceSelection(
  markdown: string,
  view: EditorView,
  serializer: MarkdownSerializer
): MarkdownSelection | null {
  const selection = view.dom.ownerDocument.getSelection();
  if (selection === null || selection.rangeCount === 0) return null;

  const range = selection.getRangeAt(0);
  if (!containsSelectionNode(view.dom, range.commonAncestorContainer)) return null;

  try {
    const bias = range.collapsed ? "cursor" : null;
    return {
      start: editorPositionToMarkdownSourceOffset(
        markdown,
        editorDomPositionToEditorPosition(view, range.startContainer, range.startOffset),
        bias ?? "start",
        view,
        serializer
      ),
      end: editorPositionToMarkdownSourceOffset(
        markdown,
        editorDomPositionToEditorPosition(view, range.endContainer, range.endOffset),
        bias ?? "end",
        view,
        serializer
      )
    };
  } catch {
    return null;
  }
}

function pointerEventMarkdownSelection(
  markdown: string,
  event: Event,
  view: EditorView,
  serializer: MarkdownSerializer
): MarkdownSelection | null {
  const target = event.target;
  if (!(target instanceof Node) || !view.dom.contains(target)) return null;

  const targetNode = pointerSelectionNode(target);
  try {
    const sourceOffset = editorPositionToMarkdownSourceOffset(
      markdown,
      editorDomPositionToEditorPosition(view, targetNode, 0),
      "cursor",
      view,
      serializer
    );
    return { start: sourceOffset, end: sourceOffset };
  } catch {
    return null;
  }
}

function pointerSelectionNode(target: Node): Node {
  if (target.nodeType === Node.TEXT_NODE) return target;
  if (target instanceof Element) return firstTextDescendant(target) ?? target;
  return target;
}

function firstTextDescendant(root: Element): Text | null {
  for (const child of root.childNodes) {
    if (child.nodeType === Node.TEXT_NODE && child.textContent !== "") return child as Text;
    if (child instanceof Element) {
      const text = firstTextDescendant(child);
      if (text !== null) return text;
    }
  }
  return null;
}

function selectionWithPointerFallback(
  markdown: string,
  selection: MarkdownSelection,
  pointerSelection: MarkdownSelection | null
): MarkdownSelection {
  if (pointerSelection === null || selection.start !== selection.end) return selection;
  if (markdownLineStartAt(markdown, pointerSelection.start) === markdownLineStartAt(markdown, selection.start)) {
    return selection;
  }

  return pointerSelection;
}

function markdownLineStartAt(markdown: string, offset: number): number {
  const clamped = Math.max(0, Math.min(markdown.length, offset));
  return markdown.lastIndexOf("\n", Math.max(0, clamped - 1)) + 1;
}

function containsSelectionNode(root: HTMLElement, node: Node): boolean {
  return node === root || root.contains(node);
}

function editorDomPositionToEditorPosition(view: EditorView, node: Node, offset: number): number {
  if (node === view.dom) {
    if (offset <= 0) return 0;
    if (offset >= view.dom.childNodes.length) return view.state.doc.content.size;
  }

  return view.posAtDOM(node, offset);
}

function editorPositionToMarkdownSourceOffset(
  markdown: string,
  position: number,
  bias: "start" | "end" | "cursor",
  view: EditorView,
  serializer: MarkdownSerializer
): number {
  const renderedOffset = renderedTextOffsetBeforePosition(view.state.doc, position);
  const renderedSourceOffset = renderedOffsetToMarkdownSourceOffset(markdown, renderedOffset);
  const serializedOffset = serializedEditorPositionToMarkdownSourceOffset(markdown, position, view, serializer);
  if (serializedOffset !== null) {
    const serializedRenderedOffset = markdownSourceOffsetToRenderedOffset(markdown, serializedOffset);
    if (
      bias === "start" &&
      serializedRenderedOffset === renderedOffset &&
      serializedOffset > 0 &&
      renderedSourceOffset > serializedOffset
    ) {
      return renderedSourceOffset;
    }

    return serializedOffset;
  }

  return renderedSourceOffset;
}

function serializedEditorPositionToMarkdownSourceOffset(
  markdown: string,
  position: number,
  view: EditorView,
  serializer: MarkdownSerializer
): number | null {
  const marker = createCursorMarker(markdown);
  try {
    const tr = view.state.tr.insertText(marker, position, position);
    const markedMarkdown = serializeMilkdownMarkdown(serializer, tr.doc);
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

function markdownWithSelectionMarkers(markdown: string, selection: MarkdownSelection): MarkdownSelectionMarkers {
  const start = Math.max(0, Math.min(markdown.length, Math.min(selection.start, selection.end)));
  const end = Math.max(0, Math.min(markdown.length, Math.max(selection.start, selection.end)));
  const startMarker = createCursorMarker(markdown);
  if (start === end) {
    return {
      markdown: `${markdown.slice(0, start)}${startMarker}${markdown.slice(start)}`,
      startMarker,
      endMarker: null
    };
  }

  const endMarker = createCursorMarker(`${markdown}${startMarker}`);
  return {
    markdown: `${markdown.slice(0, start)}${startMarker}${markdown.slice(start, end)}${endMarker}${markdown.slice(end)}`,
    startMarker,
    endMarker
  };
}

function restoreSelectionFromMarkers(
  view: EditorView,
  textSelection: typeof import("@milkdown/kit/prose/state").TextSelection,
  markers: MarkdownSelectionMarkers
): boolean {
  const startPosition = textPositionInDocument(view.state.doc, markers.startMarker);
  if (startPosition === null) return false;

  if (markers.endMarker === null) {
    const transaction = view.state.tr.delete(startPosition, startPosition + markers.startMarker.length);
    view.dispatch(
      transaction
        .setSelection(textSelection.create(transaction.doc, startPosition, startPosition))
        .scrollIntoView()
    );
    view.focus();
    return true;
  }

  const endPosition = textPositionInDocument(view.state.doc, markers.endMarker);
  if (endPosition === null) return false;

  const transaction = view.state.tr
    .delete(endPosition, endPosition + markers.endMarker.length)
    .delete(startPosition, startPosition + markers.startMarker.length);
  const selectionStart = transaction.mapping.map(startPosition, -1);
  const selectionEnd = transaction.mapping.map(endPosition, -1);
  view.dispatch(
    transaction
      .setSelection(textSelection.create(transaction.doc, selectionStart, selectionEnd))
      .scrollIntoView()
  );
  view.focus();
  return true;
}

function textPositionInDocument(doc: ProseNode, textToFind: string): number | null {
  let found: number | null = null;
  doc.descendants((node, position) => {
    if (!node.isText || node.text === undefined) return true;

    const index = node.text.indexOf(textToFind);
    if (index === -1) return true;

    found = position + index;
    return false;
  });
  return found;
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

function placeSelectionAtMarkdownSourceSelection(
  view: EditorView,
  textSelection: typeof import("@milkdown/kit/prose/state").TextSelection,
  markdown: string,
  selection: MarkdownSelection
): void {
  const start = positionForMarkdownSourceOffset(view.state.doc, markdown, selection.start);
  const end = positionForMarkdownSourceOffset(view.state.doc, markdown, selection.end);
  view.dispatch(
    view.state.tr
      .setSelection(textSelection.between(view.state.doc.resolve(start), view.state.doc.resolve(end)))
      .scrollIntoView()
  );
  view.focus();
}

function positionForMarkdownSourceOffset(doc: ProseNode, markdown: string, sourceOffset: number): number {
  return positionForRenderedTextOffset(doc, markdownSourceOffsetToRenderedOffset(markdown, sourceOffset));
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
