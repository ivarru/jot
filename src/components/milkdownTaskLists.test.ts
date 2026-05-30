import { defaultValueCtx, Editor, editorViewCtx, serializerCtx } from "@milkdown/kit/core";
import type { Node as ProseMirrorNode } from "@milkdown/kit/prose/model";
import { Plugin } from "@milkdown/kit/prose/state";
import { commonmark } from "@milkdown/kit/preset/commonmark";
import { gfm } from "@milkdown/kit/preset/gfm";
import { $prose } from "@milkdown/kit/utils";
import { createListTightnessPlugin } from "./milkdownListTightness";

describe("milkdown task list markdown", () => {
  it("accepts GFM checkbox syntax and preserves tight task lists after editing", async () => {
    await expect(
      serializeMilkdownMarkdownAfterTextEdit("- [ ] unchecked\n- [x] checked\n", "unchecked", "!")
    ).resolves.toBe("* [ ] unchecked!\n* [x] checked\n");
  });

  it("preserves tight ordinary lists after editing", async () => {
    await expect(serializeMilkdownMarkdownAfterTextEdit("- first\n- second\n", "first", "!")).resolves.toBe(
      "* first!\n* second\n"
    );
  });

  it("keeps loose ordinary lists loose after editing", async () => {
    await expect(serializeMilkdownMarkdownAfterTextEdit("- first\n\n- second\n", "first", "!")).resolves.toBe(
      "* first!\n\n* second\n"
    );
  });
});

async function serializeMilkdownMarkdownAfterTextEdit(markdown: string, textToEdit: string, insertedText: string): Promise<string> {
  const preserveListTightness = $prose(() => createListTightnessPlugin(Plugin));
  const editor = await Editor.make()
    .config((ctx) => {
      ctx.set(defaultValueCtx, markdown);
    })
    .use(commonmark)
    .use(gfm)
    .use(preserveListTightness)
    .create();

  try {
    const view = editor.ctx.get(editorViewCtx);
    view.dispatch(view.state.tr.insertText(insertedText, findTextEndPosition(view.state.doc, textToEdit)));
    const serializer = editor.ctx.get(serializerCtx);
    return serializer(view.state.doc);
  } finally {
    await editor.destroy();
  }
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
  doc.descendants((node, pos) => {
    if (!node.isText || node.text === undefined) return true;

    const index = node.text.indexOf(textToFind);
    if (index === -1) return true;

    found = pos + index;
    return false;
  });
  return found;
}
