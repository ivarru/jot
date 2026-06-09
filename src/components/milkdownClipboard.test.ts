import { defaultValueCtx, Editor, editorViewCtx, serializerCtx } from "@milkdown/kit/core";
import { automd } from "@milkdown/plugin-automd";
import { clipboard } from "@milkdown/kit/plugin/clipboard";
import { commonmark } from "@milkdown/kit/preset/commonmark";
import { gfm } from "@milkdown/kit/preset/gfm";
import { TextSelection } from "@milkdown/kit/prose/state";
import type { EditorView } from "@milkdown/kit/prose/view";

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
      await editor.destroy();
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
      await editor.destroy();
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
      await editor.destroy();
    }
  });

  it("keeps ordinary plain text paste as plain text", async () => {
    const editor = await createEditor("");

    try {
      const view = editor.ctx.get(editorViewCtx);

      expect(pastePlainText(view, "ordinary text")).toBe(true);
      expect(editor.ctx.get(serializerCtx)(view.state.doc)).toBe("ordinary text\n");
    } finally {
      await editor.destroy();
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
      await editor.destroy();
    }
  });
});

async function createEditor(markdown: string) {
  return await Editor.make()
    .config((ctx) => {
      ctx.set(defaultValueCtx, markdown);
    })
    .use(commonmark)
    .use(gfm)
    .use(automd)
    .use(clipboard)
    .create();
}

async function animationFrame(): Promise<void> {
  await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
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
