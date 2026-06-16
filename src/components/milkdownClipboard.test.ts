import { defaultValueCtx, Editor, editorViewCtx, serializerCtx } from "@milkdown/kit/core";
import { automd, inlineSyncConfig } from "@milkdown/plugin-automd";
import { clipboard } from "@milkdown/kit/plugin/clipboard";
import { commonmark, linkSchema } from "@milkdown/kit/preset/commonmark";
import { gfm } from "@milkdown/kit/preset/gfm";
import { Plugin, TextSelection } from "@milkdown/kit/prose/state";
import type { EditorView } from "@milkdown/kit/prose/view";
import { $prose } from "@milkdown/kit/utils";
import { shouldSyncMilkdownInlineMarkdown } from "./milkdownInlineSync";
import { createPlainUrlLinkBoundaryPlugin } from "./milkdownPlainUrl";

describe("milkdown clipboard paste", () => {
  it("pastes a plain text URL as a Markdown autolink", async () => {
    const editor = await createEditor("");

    try {
      const view = editor.ctx.get(editorViewCtx);

      expect(pastePlainText(view, "https://example.com/a:b?x=1")).toBe(true);
      const markdown = editor.ctx.get(serializerCtx)(view.state.doc);
      expect(markdown).toBe("<https://example.com/a:b?x=1>\n");
      expect(markdown).not.toContain("\\:");
    } finally {
      await destroyEditor(editor);
    }
  });

  it("keeps existing text outside a plain text URL pasted before it", async () => {
    const editor = await createEditor("tail");

    try {
      const view = editor.ctx.get(editorViewCtx);
      view.dispatch(view.state.tr.setSelection(TextSelection.create(view.state.doc, 1)));

      expect(pastePlainText(view, "https://example.com/a")).toBe(true);
      const markdown = editor.ctx.get(serializerCtx)(view.state.doc);
      expect(markdown).toBe("<https://example.com/a>tail\n");
      await animationFrame();
    } finally {
      await destroyEditor(editor);
    }
  });

  it("normalizes a plain text URL inserted without a paste event as a Markdown autolink", async () => {
    const editor = await createEditor("");

    try {
      const view = editor.ctx.get(editorViewCtx);

      vi.spyOn(view, "hasFocus").mockReturnValue(true);
      view.dispatch(view.state.tr.insertText("https://example.com/a:b?x=1"));
      await animationFrame();

      const markdown = editor.ctx.get(serializerCtx)(view.state.doc);
      expect(markdown).toBe("<https://example.com/a:b?x=1>\n");
      expect(markdown).not.toContain("\\:");
    } finally {
      await destroyEditor(editor);
    }
  });

  it("keeps existing text outside a plain text URL inserted through browser text input before it", async () => {
    const editor = await createEditor("tail");

    try {
      const view = editor.ctx.get(editorViewCtx);

      vi.spyOn(view, "hasFocus").mockReturnValue(true);
      view.dispatch(view.state.tr.setSelection(TextSelection.create(view.state.doc, 1)));
      const handled = view.someProp("handleTextInput", (handler) =>
        handler(view, 1, 1, "https://example.com/a", () => view.state.tr.insertText("https://example.com/a", 1, 1))
      );
      await animationFrame();

      expect(handled).toBe(true);
      const markdown = editor.ctx.get(serializerCtx)(view.state.doc);
      expect(markdown).toBe("<https://example.com/a>tail\n");
    } finally {
      await destroyEditor(editor);
    }
  });

  it("keeps ordinary plain text insertion as plain text", async () => {
    const editor = await createEditor("");

    try {
      const view = editor.ctx.get(editorViewCtx);

      vi.spyOn(view, "hasFocus").mockReturnValue(true);
      view.dispatch(view.state.tr.insertText("ordinary text"));
      await animationFrame();

      expect(editor.ctx.get(serializerCtx)(view.state.doc)).toBe("ordinary text\n");
    } finally {
      await destroyEditor(editor);
    }
  });

  it("keeps ordinary plain text paste as plain text", async () => {
    const editor = await createEditor("");

    try {
      const view = editor.ctx.get(editorViewCtx);

      expect(pastePlainText(view, "ordinary text")).toBe(true);
      expect(editor.ctx.get(serializerCtx)(view.state.doc)).toBe("ordinary text\n");
    } finally {
      await destroyEditor(editor);
    }
  });

  it("preserves GFM table paste behavior", async () => {
    const editor = await createEditor("placeholder");

    try {
      const view = editor.ctx.get(editorViewCtx);
      selectAllText(view);

      expect(pastePlainText(view, "| A | B |\n| --- | --- |\n| one | two |")).toBe(true);
      expect(editor.ctx.get(serializerCtx)(view.state.doc)).toContain("| A   | B   |\n| :-- | :-- |\n| one | two |\n");
    } finally {
      await destroyEditor(editor);
    }
  });
});

async function createEditor(markdown: string) {
  return await Editor.make()
    .config((ctx) => {
      ctx.set(defaultValueCtx, markdown);
      ctx.update(inlineSyncConfig.key, (config) => ({
        ...config,
        shouldSyncNode: shouldSyncMilkdownInlineMarkdown(config.shouldSyncNode)
      }));
    })
    .use(commonmark)
    .use(gfm)
    .use(automd)
    .use($prose((ctx) => createPlainUrlLinkBoundaryPlugin(Plugin, TextSelection, linkSchema.type(ctx))))
    .use(clipboard)
    .create();
}

async function animationFrame(): Promise<void> {
  await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
  await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
  await new Promise<void>((resolve) => window.setTimeout(() => resolve(), 0));
}

async function destroyEditor(editor: Awaited<ReturnType<typeof createEditor>>): Promise<void> {
  await animationFrame();
  await editor.destroy();
}

function pastePlainText(view: EditorView, text: string): boolean {
  return (
    view.someProp("handlePaste", (handler) =>
      handler(view, pasteEvent({ text, html: "" }), view.state.selection.content())
    ) === true
  );
}

function selectAllText(view: EditorView): void {
  view.dispatch(view.state.tr.setSelection(TextSelection.create(view.state.doc, 1, view.state.doc.content.size - 1)));
}

function pasteEvent(input: { readonly text: string; readonly html: string }): ClipboardEvent {
  const event = new Event("paste") as ClipboardEvent;
  Object.defineProperty(event, "clipboardData", {
    value: {
      getData: (type: string) => {
        if (type === "text/plain") return input.text;
        if (type === "text/html") return input.html;
        return "";
      }
    }
  });
  return event;
}
