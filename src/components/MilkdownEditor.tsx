import { createEffect, createSignal, on, onCleanup, Show } from "solid-js";
import type { ImageAttachmentDisplayMap } from "./milkdownImages";
import { createMilkdownImageViewDom, updateMilkdownImageViewDom } from "./milkdownImages";

interface MilkdownEditorProps {
  readonly documentKey: string;
  readonly resetKey?: number;
  readonly focusAtEnd?: boolean;
  readonly onFocusApplied?: () => void;
  readonly imageAttachmentDisplays?: ImageAttachmentDisplayMap;
  readonly value: string;
  readonly onChange: (documentKey: string, markdown: string) => void;
  readonly onBlur: (documentKey: string, markdown: string) => void;
}

export function MilkdownEditor(props: MilkdownEditorProps) {
  let root!: HTMLDivElement;
  const [error, setError] = createSignal<string | null>(null);
  let imageAttachmentDisplays: ImageAttachmentDisplayMap = {};
  const imageAttachmentDisplayListeners = new Set<() => void>();

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
        let currentMarkdown = props.value;
        setError(null);
        root.replaceChildren();

        const [
          { Editor, rootCtx, defaultValueCtx },
          { commonmark, imageSchema },
          { gfm },
          { history },
          { listener, listenerCtx },
          { $view }
        ] =
          await Promise.all([
            import("@milkdown/kit/core"),
            import("@milkdown/kit/preset/commonmark"),
            import("@milkdown/kit/preset/gfm"),
            import("@milkdown/kit/plugin/history"),
            import("@milkdown/kit/plugin/listener"),
            import("@milkdown/kit/utils")
          ]);
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

        const editor = await Editor.make()
          .config((ctx) => {
            ctx.set(rootCtx, root);
            ctx.set(defaultValueCtx, props.value);
            ctx.get(listenerCtx).markdownUpdated((_ctx, markdown, previousMarkdown) => {
              if (markdown !== previousMarkdown) {
                currentMarkdown = markdown;
                props.onChange(documentKey, markdown);
              }
            });
          })
          .use(commonmark)
          .use(jotImageView)
          .use(gfm)
          .use(history)
          .use(listener)
          .create()
          .catch((reason: unknown) => {
            setError(reason instanceof Error ? reason.message : "Milkdown failed to load.");
            return null;
          });

        if (editor !== null) {
          focusEditable(root, focusAtEnd ? "end" : "default", props.onFocusApplied);
        }

        const blurListener = () => props.onBlur(documentKey, currentMarkdown);
        root.addEventListener("focusout", blurListener);

        onCleanup(() => {
          root.removeEventListener("focusout", blurListener);
          void editor?.destroy();
        });
      },
      { defer: false }
    )
  );

  return (
    <div class="editor-shell">
      <div ref={root} class="milkdown-root" />
      <Show when={error() !== null}>
        <textarea
          class="fallback-editor"
          value={props.value}
          ref={(element) => focusTextArea(element, props.focusAtEnd === true ? "end" : "default", props.onFocusApplied)}
          onInput={(event) => props.onChange(props.documentKey, event.currentTarget.value)}
          onBlur={(event) => props.onBlur(props.documentKey, event.currentTarget.value)}
          aria-label="Markdown editor fallback"
        />
      </Show>
    </div>
  );
}

type FocusPlacement = "default" | "end";

function focusEditable(root: HTMLElement, placement: FocusPlacement, onFocusApplied?: () => void): void {
  requestAnimationFrame(() => {
    const editable = root.querySelector<HTMLElement>("[contenteditable='true']");
    if (!editable) return;
    editable.focus();
    if (placement === "end") placeSelectionAtEnd(editable);
    onFocusApplied?.();
  });
}

function focusTextArea(element: HTMLTextAreaElement, placement: FocusPlacement, onFocusApplied?: () => void): void {
  requestAnimationFrame(() => {
    element.focus();
    if (placement === "end") {
      element.setSelectionRange(element.value.length, element.value.length);
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
