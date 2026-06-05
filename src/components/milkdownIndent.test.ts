import { defaultValueCtx, Editor, editorViewCtx, serializerCtx } from "@milkdown/kit/core";
import type { Node as ProseMirrorNode } from "@milkdown/kit/prose/model";
import { wrapIn } from "@milkdown/kit/prose/commands";
import { liftListItem, sinkListItem } from "@milkdown/kit/prose/schema-list";
import { Plugin, TextSelection } from "@milkdown/kit/prose/state";
import { isInTable } from "@milkdown/kit/prose/tables";
import type { EditorView } from "@milkdown/kit/prose/view";
import {
  bulletListSchema,
  codeBlockSchema,
  commonmark,
  headingSchema,
  listItemSchema,
  paragraphSchema
} from "@milkdown/kit/preset/commonmark";
import { gfm } from "@milkdown/kit/preset/gfm";
import { $prose, $useKeymap } from "@milkdown/kit/utils";
import { createListTightnessPlugin } from "./milkdownListTightness";
import { createMilkdownStructuralTabKeymap } from "./milkdownStructuralTab";

describe("milkdown structural tab editing", () => {
  it("turns an ordinary paragraph into a bullet list item when tab is pressed", async () => {
    const editor = await createEditor("beforeafter");

    try {
      const view = editor.ctx.get(editorViewCtx);
      selectTextEnd(view, "before");

      expect(pressTab(view)).toBe(true);
      expect(editor.ctx.get(serializerCtx)(view.state.doc)).toBe("* beforeafter\n");
    } finally {
      await editor.destroy();
    }
  });

  it("consumes shift-tab in ordinary paragraphs without changing markdown", async () => {
    const editor = await createEditor("beforeafter");

    try {
      const view = editor.ctx.get(editorViewCtx);
      selectTextEnd(view, "before");

      expect(pressTab(view, true)).toBe(true);
      expect(editor.ctx.get(serializerCtx)(view.state.doc)).toBe("beforeafter\n");
    } finally {
      await editor.destroy();
    }
  });

  it("indents and dedents list items with tab and shift-tab", async () => {
    const editor = await createEditor("- first\n- second\n");

    try {
      const view = editor.ctx.get(editorViewCtx);
      selectTextEnd(view, "second");

      expect(pressTab(view)).toBe(true);
      expect(editor.ctx.get(serializerCtx)(view.state.doc)).toBe("* first\n  * second\n");

      expect(pressTab(view, true)).toBe(true);
      expect(editor.ctx.get(serializerCtx)(view.state.doc)).toBe("* first\n* second\n");
    } finally {
      await editor.destroy();
    }
  });

  it("indents and dedents the current code block line", async () => {
    const editor = await createEditor("```\ncode\n```\n");

    try {
      const view = editor.ctx.get(editorViewCtx);
      selectTextEnd(view, "code");

      expect(pressTab(view)).toBe(true);
      expect(editor.ctx.get(serializerCtx)(view.state.doc)).toBe("```\n  code\n```\n");

      expect(pressTab(view, true)).toBe(true);
      expect(editor.ctx.get(serializerCtx)(view.state.doc)).toBe("```\ncode\n```\n");
    } finally {
      await editor.destroy();
    }
  });

  it("increases and decreases heading depth with tab and shift-tab", async () => {
    const editor = await createEditor("# Heading\n");

    try {
      const view = editor.ctx.get(editorViewCtx);
      selectTextEnd(view, "Heading");

      expect(pressTab(view)).toBe(true);
      expect(editor.ctx.get(serializerCtx)(view.state.doc)).toBe("## Heading\n");

      expect(pressTab(view, true)).toBe(true);
      expect(editor.ctx.get(serializerCtx)(view.state.doc)).toBe("# Heading\n");

      expect(pressTab(view, true)).toBe(true);
      expect(editor.ctx.get(serializerCtx)(view.state.doc)).toBe("Heading\n");
    } finally {
      await editor.destroy();
    }
  });

  it("lets the GFM table keymap handle tab navigation", async () => {
    const editor = await createEditor("| A | B |\n| --- | --- |\n| one | two |\n");

    try {
      const view = editor.ctx.get(editorViewCtx);
      selectTextEnd(view, "one");
      const before = editor.ctx.get(serializerCtx)(view.state.doc);

      expect(pressTab(view)).toBe(true);
      expect(editor.ctx.get(serializerCtx)(view.state.doc)).toBe(before);
      expect(view.state.selection.$from.parent.textContent).toBe("two");
    } finally {
      await editor.destroy();
    }
  });
});

async function createEditor(markdown: string) {
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

  return await Editor.make()
    .config((ctx) => {
      ctx.set(defaultValueCtx, markdown);
    })
    .use(commonmark)
    .use(gfm)
    .use(structuralTabKeymap)
    .use(preserveListTightness)
    .create();
}

function pressTab(view: EditorView, shiftKey = false): boolean {
  return (
    view.someProp("handleKeyDown", (handler) =>
      handler(view, new KeyboardEvent("keydown", { key: "Tab", shiftKey }))
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
