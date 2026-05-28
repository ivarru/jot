import { createEffect, createSignal, on, onCleanup, Show } from "solid-js";

interface MilkdownEditorProps {
  readonly documentKey: string;
  readonly value: string;
  readonly onChange: (documentKey: string, markdown: string) => void;
  readonly onBlur: (documentKey: string, markdown: string) => void;
}

export function MilkdownEditor(props: MilkdownEditorProps) {
  let root!: HTMLDivElement;
  const [error, setError] = createSignal<string | null>(null);

  createEffect(
    on(
      () => props.documentKey,
      async () => {
        const documentKey = props.documentKey;
        let currentMarkdown = props.value;
        setError(null);
        root.replaceChildren();

        const [{ Editor, rootCtx, defaultValueCtx }, { commonmark }, { gfm }, { history }, { listener, listenerCtx }] =
          await Promise.all([
            import("@milkdown/kit/core"),
            import("@milkdown/kit/preset/commonmark"),
            import("@milkdown/kit/preset/gfm"),
            import("@milkdown/kit/plugin/history"),
            import("@milkdown/kit/plugin/listener")
          ]);

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
          .use(gfm)
          .use(history)
          .use(listener)
          .create()
          .catch((reason: unknown) => {
            setError(reason instanceof Error ? reason.message : "Milkdown failed to load.");
            return null;
          });

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
          onInput={(event) => props.onChange(props.documentKey, event.currentTarget.value)}
          onBlur={(event) => props.onBlur(props.documentKey, event.currentTarget.value)}
          aria-label="Markdown editor fallback"
        />
      </Show>
    </div>
  );
}
