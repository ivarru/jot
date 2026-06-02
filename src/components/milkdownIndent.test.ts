import { defaultValueCtx, Editor, editorViewCtx, serializerCtx } from "@milkdown/kit/core";
import { indent, indentConfig } from "@milkdown/kit/plugin/indent";
import { TextSelection } from "@milkdown/kit/prose/state";
import { commonmark } from "@milkdown/kit/preset/commonmark";

describe("milkdown indentation", () => {
  it("inserts two spaces when tab is pressed", async () => {
    const editor = await Editor.make()
      .config((ctx) => {
        ctx.set(defaultValueCtx, "beforeafter");
        ctx.set<import("@milkdown/kit/plugin/indent").IndentConfigOptions, "indentConfig">(
          indentConfig.key,
          { type: "space", size: 2 }
        );
      })
      .use(commonmark)
      .use(indent)
      .create();

    try {
      const view = editor.ctx.get(editorViewCtx);
      view.dispatch(view.state.tr.setSelection(TextSelection.create(view.state.doc, "before".length + 1)));

      const handled = view.someProp("handleKeyDown", (handler) => handler(view, new KeyboardEvent("keydown", { key: "Tab" })));

      expect(handled).toBe(true);
      expect(editor.ctx.get(serializerCtx)(view.state.doc)).toBe("before  after\n");
    } finally {
      await editor.destroy();
    }
  });
});
