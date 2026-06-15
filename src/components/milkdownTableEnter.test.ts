import { defaultValueCtx, Editor, editorViewCtx, serializerCtx } from "@milkdown/kit/core";
import type { Node as ProseMirrorNode } from "@milkdown/kit/prose/model";
import { TextSelection } from "@milkdown/kit/prose/state";
import { isInTable, selectedRect } from "@milkdown/kit/prose/tables";
import type { EditorView } from "@milkdown/kit/prose/view";
import { commonmark, paragraphSchema } from "@milkdown/kit/preset/commonmark";
import { gfm, tableCellSchema, tableRowSchema } from "@milkdown/kit/preset/gfm";
import { $useKeymap } from "@milkdown/kit/utils";
import { createMilkdownTableEnterKeymap } from "./milkdownTableEnter";

describe("milkdown table enter editing", () => {
  it("inserts a body row below the current table row", async () => {
    const editor = await createEditor("| A | B |\n| --- | --- |\n| one | two |\n");

    try {
      const view = editor.ctx.get(editorViewCtx);
      selectTextEnd(view, "one");

      expect(pressEnter(view)).toBe(true);
      expect(editor.ctx.get(serializerCtx)(view.state.doc)).toBe(
        "| A   | B   |\n| --- | --- |\n| one | two |\n|     |     |\n"
      );
    } finally {
      await editor.destroy();
    }
  });

  it("inserts a body row below the header row without creating another header", async () => {
    const editor = await createEditor("| A | B |\n| --- | --- |\n| one | two |\n");

    try {
      const view = editor.ctx.get(editorViewCtx);
      selectTextEnd(view, "A");

      expect(pressEnter(view)).toBe(true);
      expect(editor.ctx.get(serializerCtx)(view.state.doc)).toBe(
        "| A   | B   |\n| --- | --- |\n|     |     |\n| one | two |\n"
      );
    } finally {
      await editor.destroy();
    }
  });
});

async function createEditor(markdown: string) {
  const tableEnterKeymap = createMilkdownTableEnterKeymap({
    useKeymap: $useKeymap,
    isInTable,
    selectedRect,
    TextSelection,
    tableCellSchema,
    tableRowSchema,
    paragraphSchema
  });

  return await Editor.make()
    .config((ctx) => {
      ctx.set(defaultValueCtx, markdown);
    })
    .use(commonmark)
    .use(gfm)
    .use(tableEnterKeymap)
    .create();
}

function pressEnter(view: EditorView): boolean {
  return (
    view.someProp("handleKeyDown", (handler) =>
      handler(view, new KeyboardEvent("keydown", { key: "Enter" }))
    ) === true
  );
}

function selectTextEnd(view: EditorView, textToFind: string): void {
  const position = findTextEndPosition(view.state.doc, textToFind);
  view.dispatch(view.state.tr.setSelection(TextSelection.create(view.state.doc, position)));
}

function findTextEndPosition(doc: ProseMirrorNode, textToFind: string): number {
  const position = findTextNodePosition(doc, textToFind);
  if (position === null) {
    throw new Error(`Text not found in Milkdown document: ${textToFind}`);
  }
  return position + textToFind.length;
}

function findTextNodePosition(doc: ProseMirrorNode, textToFind: string): number | null {
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
