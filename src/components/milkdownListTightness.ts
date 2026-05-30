import type { Node as ProseMirrorNode } from "@milkdown/kit/prose/model";
import type { EditorState, Plugin, Transaction } from "@milkdown/kit/prose/state";

interface ListTightnessUpdate {
  readonly pos: number;
  readonly spread: boolean;
}

interface ProseMirrorPluginSpec {
  readonly appendTransaction: (
    transactions: readonly Transaction[],
    oldState: EditorState,
    newState: EditorState
  ) => Transaction | null;
}

type ProseMirrorPluginConstructor = new (spec: ProseMirrorPluginSpec) => Plugin;

export function createListTightnessPlugin(PluginConstructor: ProseMirrorPluginConstructor): Plugin {
  return new PluginConstructor({
    appendTransaction: (transactions, _oldState, newState) => {
      if (!transactions.some((transaction) => transaction.docChanged)) return null;

      const tr = newState.tr;
      const changed = applyListTightnessUpdates(newState.doc, tr);
      return changed ? tr : null;
    }
  });
}

export function applyListTightnessUpdates(doc: ProseMirrorNode, tr: Transaction): boolean {
  const updates = findListTightnessUpdates(doc);
  for (const update of updates) {
    tr.setNodeAttribute(update.pos, "spread", update.spread);
  }
  return updates.length > 0;
}

export function findListTightnessUpdates(doc: ProseMirrorNode): ListTightnessUpdate[] {
  const updates: ListTightnessUpdate[] = [];

  doc.descendants((node, pos) => {
    if (!isListNode(node)) return true;

    const spread = spreadAttrToBoolean(node.attrs.spread);
    if (node.attrs.spread !== spread) {
      updates.push({ pos, spread });
    }

    node.forEach((child, offset) => {
      if (child.type.name !== "list_item") return;
      if (child.attrs.spread !== spread) {
        updates.push({ pos: pos + 1 + offset, spread });
      }
    });

    return true;
  });

  return updates;
}

function isListNode(node: ProseMirrorNode): boolean {
  return node.type.name === "bullet_list" || node.type.name === "ordered_list";
}

function spreadAttrToBoolean(value: unknown): boolean {
  return value === true || value === "true";
}
