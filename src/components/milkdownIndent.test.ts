import { defaultValueCtx, Editor, editorViewCtx, serializerCtx } from "@milkdown/kit/core";
import type { Node as ProseMirrorNode } from "@milkdown/kit/prose/model";
import { wrapIn } from "@milkdown/kit/prose/commands";
import { liftListItem, sinkListItem } from "@milkdown/kit/prose/schema-list";
import { Plugin, TextSelection } from "@milkdown/kit/prose/state";
import { isInTable, selectedRect } from "@milkdown/kit/prose/tables";
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
import { createMilkdownTableBoundaryNavigation } from "./milkdownTableBoundaryNavigation";

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

  it("turns an ordinary paragraph into a heading when shift-tab is pressed", async () => {
    const editor = await createEditor("beforeafter");

    try {
      const view = editor.ctx.get(editorViewCtx);
      selectTextEnd(view, "before");

      expect(pressTab(view, true)).toBe(true);
      expect(editor.ctx.get(serializerCtx)(view.state.doc)).toBe("# beforeafter\n");
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

  it("decreases and increases heading depth with tab and shift-tab", async () => {
    const editor = await createEditor("# Heading\n");

    try {
      const view = editor.ctx.get(editorViewCtx);
      selectTextEnd(view, "Heading");

      expect(pressTab(view)).toBe(true);
      expect(editor.ctx.get(serializerCtx)(view.state.doc)).toBe("Heading\n");

      expect(pressTab(view, true)).toBe(true);
      expect(editor.ctx.get(serializerCtx)(view.state.doc)).toBe("# Heading\n");

      expect(pressTab(view, true)).toBe(true);
      expect(editor.ctx.get(serializerCtx)(view.state.doc)).toBe("## Heading\n");
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

  it("moves from the last table cell to a following paragraph when tab is pressed", async () => {
    const editor = await createEditor("| A | B |\n| --- | --- |\n| one | two |\n");

    try {
      const view = editor.ctx.get(editorViewCtx);
      selectTextEnd(view, "two");

      expect(pressTab(view)).toBe(true);
      expect(topLevelNodeNames(view.state.doc)).toEqual(["table", "paragraph"]);
      expect(view.state.selection.$from.parent.type.name).toBe("paragraph");
      expect(view.state.selection.$from.parent.textContent).toBe("");
    } finally {
      await editor.destroy();
    }
  });

  it("moves from the last table cell to an existing following paragraph when tab is pressed", async () => {
    const editor = await createEditor("| A | B |\n| --- | --- |\n| one | two |\n\nafter");

    try {
      const view = editor.ctx.get(editorViewCtx);
      selectTextEnd(view, "two");

      expect(pressTab(view)).toBe(true);
      expect(topLevelNodeNames(view.state.doc)).toEqual(["table", "paragraph"]);
      expect(view.state.selection.$from.parent.textContent).toBe("after");
    } finally {
      await editor.destroy();
    }
  });

  it("moves from the first table cell to a preceding paragraph when shift-tab is pressed", async () => {
    const editor = await createEditor("| A | B |\n| --- | --- |\n| one | two |\n");

    try {
      const view = editor.ctx.get(editorViewCtx);
      selectTextEnd(view, "A");

      expect(pressTab(view, true)).toBe(true);
      expect(topLevelNodeNames(view.state.doc)).toEqual(["paragraph", "table"]);
      expect(view.state.selection.$from.parent.type.name).toBe("paragraph");
      expect(view.state.selection.$from.parent.textContent).toBe("");
    } finally {
      await editor.destroy();
    }
  });

  it("moves from the first table cell to an existing preceding paragraph when shift-tab is pressed", async () => {
    const editor = await createEditor("before\n\n| A | B |\n| --- | --- |\n| one | two |\n");

    try {
      const view = editor.ctx.get(editorViewCtx);
      selectTextEnd(view, "A");

      expect(pressTab(view, true)).toBe(true);
      expect(topLevelNodeNames(view.state.doc)).toEqual(["paragraph", "table"]);
      expect(view.state.selection.$from.parent.textContent).toBe("before");
    } finally {
      await editor.destroy();
    }
  });

  it("moves from the last table row to a following paragraph when arrow-down is pressed", async () => {
    const editor = await createEditor("| A | B |\n| --- | --- |\n| one | two |\n");

    try {
      const view = editor.ctx.get(editorViewCtx);
      mockEndOfTextblock(view, "down", true);
      selectTextEnd(view, "two");

      expect(pressKey(view, "ArrowDown")).toBe(true);
      expect(topLevelNodeNames(view.state.doc)).toEqual(["table", "paragraph"]);
      expect(view.state.selection.$from.parent.type.name).toBe("paragraph");
      expect(view.state.selection.$from.parent.textContent).toBe("");
    } finally {
      await editor.destroy();
    }
  });

  it("moves from the last table row to an existing following paragraph when arrow-down is pressed", async () => {
    const editor = await createEditor("| A | B |\n| --- | --- |\n| one | two |\n\nafter");

    try {
      const view = editor.ctx.get(editorViewCtx);
      mockEndOfTextblock(view, "down", true);
      selectTextEnd(view, "two");

      expect(pressKey(view, "ArrowDown")).toBe(true);
      expect(topLevelNodeNames(view.state.doc)).toEqual(["table", "paragraph"]);
      expect(view.state.selection.$from.parent.textContent).toBe("after");
    } finally {
      await editor.destroy();
    }
  });

  it("moves from the top table row to a preceding paragraph when arrow-up is pressed", async () => {
    const editor = await createEditor("| A | B |\n| --- | --- |\n| one | two |\n");

    try {
      const view = editor.ctx.get(editorViewCtx);
      mockEndOfTextblock(view, "up", true);
      selectTextEnd(view, "A");

      expect(pressKey(view, "ArrowUp")).toBe(true);
      expect(topLevelNodeNames(view.state.doc)).toEqual(["paragraph", "table"]);
      expect(view.state.selection.$from.parent.type.name).toBe("paragraph");
      expect(view.state.selection.$from.parent.textContent).toBe("");
    } finally {
      await editor.destroy();
    }
  });

  it("moves from the top table row to an existing preceding paragraph when arrow-up is pressed", async () => {
    const editor = await createEditor("before\n\n| A | B |\n| --- | --- |\n| one | two |\n");

    try {
      const view = editor.ctx.get(editorViewCtx);
      mockEndOfTextblock(view, "up", true);
      selectTextEnd(view, "A");

      expect(pressKey(view, "ArrowUp")).toBe(true);
      expect(topLevelNodeNames(view.state.doc)).toEqual(["paragraph", "table"]);
      expect(view.state.selection.$from.parent.textContent).toBe("before");
    } finally {
      await editor.destroy();
    }
  });

  it("does not handle arrow navigation from middle table rows", async () => {
    const editor = await createEditor("| A | B |\n| --- | --- |\n| one | two |\n| three | four |\n");

    try {
      const view = editor.ctx.get(editorViewCtx);
      mockEndOfTextblock(view, "down", true);
      selectTextEnd(view, "two");

      pressKey(view, "ArrowDown");
      expect(topLevelNodeNames(view.state.doc)).toEqual(["table"]);

      mockEndOfTextblock(view, "up", true);
      selectTextEnd(view, "three");

      pressKey(view, "ArrowUp");
      expect(topLevelNodeNames(view.state.doc)).toEqual(["table"]);
    } finally {
      await editor.destroy();
    }
  });

  it("escapes from table edge rows without relying on textblock edge detection", async () => {
    const editor = await createEditor("| A | B |\n| --- | --- |\n| one | two |\n");

    try {
      const view = editor.ctx.get(editorViewCtx);
      mockEndOfTextblock(view, "down", false);
      selectTextEnd(view, "two");

      expect(pressKey(view, "ArrowDown")).toBe(true);
      expect(topLevelNodeNames(view.state.doc)).toEqual(["table", "paragraph"]);
      expect(view.state.selection.$from.parent.type.name).toBe("paragraph");
    } finally {
      await editor.destroy();
    }
  });

  it("escapes from table edge rows when the current cell text is selected", async () => {
    const editor = await createEditor("| A | B |\n| --- | --- |\n| one | two |\n");

    try {
      const view = editor.ctx.get(editorViewCtx);
      mockEndOfTextblock(view, "down", false);
      selectTextRange(view, "two");

      expect(pressKey(view, "ArrowDown")).toBe(true);
      expect(topLevelNodeNames(view.state.doc)).toEqual(["table", "paragraph"]);
      expect(view.state.selection.$from.parent.type.name).toBe("paragraph");
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
  const tableBoundaryNavigation = createMilkdownTableBoundaryNavigation({
    useKeymap: $useKeymap,
    prose: $prose,
    Plugin,
    isInTable,
    selectedRect,
    TextSelection,
    paragraphSchema
  });

  return await Editor.make()
    .config((ctx) => {
      ctx.set(defaultValueCtx, markdown);
    })
    .use(commonmark)
    .use(gfm)
    .use(structuralTabKeymap)
    .use(tableBoundaryNavigation)
    .use(preserveListTightness)
    .create();
}

function pressTab(view: EditorView, shiftKey = false): boolean {
  return pressKey(view, "Tab", shiftKey);
}

function pressKey(view: EditorView, key: string, shiftKey = false): boolean {
  const event = new KeyboardEvent("keydown", { key, shiftKey, bubbles: true, cancelable: true });
  if (
    view.someProp(
      "handleDOMEvents",
      (handlers) => handlers.keydown?.(view, event) === true || event.defaultPrevented
    ) === true
  ) {
    return true;
  }

  return (
    view.someProp("handleKeyDown", (handler) =>
      handler(view, event)
    ) === true
  );
}

function mockEndOfTextblock(view: EditorView, direction: "up" | "down", result: boolean): void {
  view.endOfTextblock = ((actualDirection) => actualDirection === direction && result) as EditorView["endOfTextblock"];
}

function selectTextEnd(view: EditorView, textToFind: string): void {
  const position = findTextEndPosition(view.state.doc, textToFind);
  view.dispatch(view.state.tr.setSelection(TextSelection.create(view.state.doc, position)));
}

function selectTextRange(view: EditorView, textToFind: string): void {
  const start = findTextNodePosition(view.state.doc, textToFind);
  if (start === null) {
    throw new Error(`Text not found in Milkdown document: ${textToFind}`);
  }
  view.dispatch(view.state.tr.setSelection(TextSelection.create(view.state.doc, start, start + textToFind.length)));
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

function topLevelNodeNames(doc: ProseMirrorNode): string[] {
  const names: string[] = [];
  doc.forEach((node) => names.push(node.type.name));
  return names;
}
