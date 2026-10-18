import { nodeViewCtx } from "@milkdown/kit/core";
import type { MilkdownPlugin } from "@milkdown/kit/ctx";
import type { EditorState, Transaction } from "@milkdown/kit/prose/state";
import type { EditorView, NodeViewConstructor } from "@milkdown/kit/prose/view";

// Milkdown 7.22's list view restores its mount-time selection on the next
// frame. Retain the component, but reject that restore after newer editing or
// selection. Share one proxy per editor so upstream's batched restores remain
// batched; bind other methods to the real view to preserve their receivers.
export function guardListItemBlockView(plugin: MilkdownPlugin): MilkdownPlugin {
  return (ctx) => {
    const run = plugin(ctx);
    return async () => {
      const cleanup = await run();
      ctx.update(nodeViewCtx, (views) => views.map(([name, create]) =>
        [name, name === "list_item" ? guardMountSelection(create) : create]));
      return async () => { if (cleanup) await cleanup(); };
    };
  };
}

function guardMountSelection(create: NodeViewConstructor): NodeViewConstructor {
  const views = new WeakMap<EditorView, { proxy: EditorView; snapshot: { state: EditorState } }>();
  return (node, view, getPos, decorations, innerDecorations) => {
    let entry = views.get(view);
    if (!entry) {
      const snapshot = { state: view.state };
      const proxy = new Proxy(view, {
        get(target, key) {
          if (key === "dispatch") return (transaction: Transaction) => {
            if (transaction.selectionSet && !transaction.docChanged
              && (target.state.doc !== snapshot.state.doc || !target.state.selection.eq(snapshot.state.selection))) return;
            target.dispatch(transaction);
          };
          const value = Reflect.get(target, key, target);
          return typeof value === "function" ? value.bind(target) : value;
        }
      });
      entry = { proxy, snapshot };
      views.set(view, entry);
    }
    entry.snapshot.state = view.state;
    return create(node, entry.proxy, getPos, decorations, innerDecorations);
  };
}
