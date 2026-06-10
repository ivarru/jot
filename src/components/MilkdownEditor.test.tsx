import { createSignal } from "solid-js";
import { render } from "solid-js/web";
import { defaultValueCtx, Editor, editorViewCtx, serializerCtx } from "@milkdown/kit/core";
import type { Node as ProseMirrorNode } from "@milkdown/kit/prose/model";
import { TextSelection } from "@milkdown/kit/prose/state";
import { commonmark, inlineCodeSchema } from "@milkdown/kit/preset/commonmark";
import { gfm } from "@milkdown/kit/preset/gfm";
import { toggleMark } from "@milkdown/kit/prose/commands";
import {
  applyMilkdownUpdatedMarkdown,
  createMilkdownMarkdownSyncState,
  editorSelectionToMarkdownSourceSelection,
  MilkdownEditor,
  trackMilkdownExternalMarkdown,
  trackMilkdownSerializedMarkdown
} from "./MilkdownEditor";

describe("MilkdownEditor", () => {
  beforeAll(() => {
    const rect = () => ({
      bottom: 0,
      height: 0,
      left: 0,
      right: 0,
      top: 0,
      width: 0,
      x: 0,
      y: 0,
      toJSON: () => ({})
    });
    const rects = () => ({ length: 0, item: () => null, [Symbol.iterator]: Array.prototype[Symbol.iterator] });

    Object.defineProperty(Text.prototype, "getBoundingClientRect", { value: rect, configurable: true });
    Object.defineProperty(Text.prototype, "getClientRects", { value: rects, configurable: true });
    Object.defineProperty(Range.prototype, "getBoundingClientRect", { value: rect, configurable: true });
    Object.defineProperty(Range.prototype, "getClientRects", { value: rects, configurable: true });
  });

  afterEach(() => {
    document.body.replaceChildren();
  });

  it("updates the visible editor when the bound markdown changes", async () => {
    const host = document.createElement("div");
    document.body.append(host);
    const blurs: string[] = [];
    let setMarkdown!: (markdown: string) => void;

    const dispose = render(
      () => {
        const [markdown, innerSetMarkdown] = createSignal("old remote");
        setMarkdown = innerSetMarkdown;

        return (
          <MilkdownEditor
            documentKey="2030-02-02"
            value={markdown()}
            onChange={() => undefined}
            onBlur={(_documentKey, markdown) => blurs.push(markdown)}
          />
        );
      },
      host
    );

    try {
      const editor = await waitForEditable(host);
      expect(editor.textContent).toContain("old remote");

      setMarkdown("new remote");
      await animationFrame();
      await animationFrame();

      expect(editor.textContent).toContain("new remote");

      editor.dispatchEvent(new FocusEvent("focusout", { bubbles: true }));
      expect(blurs.at(-1)).toBe("new remote");

    } finally {
      dispose();
    }
  });

  it("does not report external markdown updates as user edits after Milkdown debounces", async () => {
    const host = document.createElement("div");
    document.body.append(host);
    const changes: string[] = [];
    let setMarkdown!: (markdown: string) => void;

    const dispose = render(
      () => {
        const [markdown, innerSetMarkdown] = createSignal("old remote");
        setMarkdown = innerSetMarkdown;

        return (
          <MilkdownEditor
            documentKey="2030-02-02"
            value={markdown()}
            onChange={(_documentKey, markdown) => changes.push(markdown)}
            onBlur={() => undefined}
          />
        );
      },
      host
    );

    try {
      await waitForEditable(host);

      setMarkdown("new remote");
      await delay(300);

      expect(changes).toEqual([]);

    } finally {
      dispose();
    }
  });

  it("does not let delayed callbacks from an old document affect the active blur snapshot", async () => {
    const host = document.createElement("div");
    document.body.append(host);
    const blurs: Array<readonly [string, string]> = [];
    let setDocument!: (document: { readonly documentKey: string; readonly markdown: string }) => void;

    const dispose = render(
      () => {
        const [document, innerSetDocument] = createSignal({
          documentKey: "2030-02-01",
          markdown: "A old"
        });
        setDocument = innerSetDocument;

        return (
          <MilkdownEditor
            documentKey={document().documentKey}
            value={document().markdown}
            onChange={() => undefined}
            onBlur={(documentKey, markdown) => blurs.push([documentKey, markdown])}
          />
        );
      },
      host
    );

    try {
      await waitForEditable(host);

      setDocument({
        documentKey: "2030-02-01",
        markdown: "A remote"
      });
      await animationFrame();
      setDocument({
        documentKey: "2030-02-02",
        markdown: "B current"
      });

      const editor = await waitForEditable(host);
      await delay(300);

      editor.dispatchEvent(new FocusEvent("focusout", { bubbles: true }));
      expect(blurs.at(-1)).toEqual(["2030-02-02", "B current"]);

    } finally {
      dispose();
    }
  });

  it("updates the editor editable state when read-only changes", async () => {
    const host = document.createElement("div");
    document.body.append(host);
    let setReadOnly!: (readOnly: boolean) => void;

    const dispose = render(
      () => {
        const [readOnly, innerSetReadOnly] = createSignal(true);
        setReadOnly = innerSetReadOnly;

        return (
          <MilkdownEditor
            documentKey="2030-02-02"
            value="locked"
            readOnly={readOnly()}
            onChange={() => undefined}
            onBlur={() => undefined}
          />
        );
      },
      host
    );

    try {
      await waitForMilkdownReadOnly(host, "true");

      setReadOnly(false);
      await waitForMilkdownReadOnly(host, "false");

    } finally {
      dispose();
    }
  });

  it("applies a read-only change that happens before async editor creation finishes", async () => {
    const host = document.createElement("div");
    document.body.append(host);
    let setReadOnly!: (readOnly: boolean) => void;

    const dispose = render(
      () => {
        const [readOnly, innerSetReadOnly] = createSignal(false);
        setReadOnly = innerSetReadOnly;

        return (
          <MilkdownEditor
            documentKey="2030-02-02"
            value="pending lock"
            readOnly={readOnly()}
            onChange={() => undefined}
            onBlur={() => undefined}
          />
        );
      },
      host
    );

    try {
      setReadOnly(true);

      await waitForContentEditable(host, "false");

    } finally {
      dispose();
    }
  });

  it("restores focus when only the requested selection changes", async () => {
    const host = document.createElement("div");
    document.body.append(host);
    let setSelection!: (selection: { readonly start: number; readonly end: number } | null) => void;
    let getSelection!: () => { readonly start: number; readonly end: number } | null;

    const dispose = render(
      () => {
        const [selection, innerSetSelection] = createSignal<{ readonly start: number; readonly end: number } | null>(
          null
        );
        setSelection = innerSetSelection;

        return (
          <MilkdownEditor
            documentKey="2030-02-02"
            value="before selected after"
            focusSelection={selection()}
            onChange={() => undefined}
            onBlur={() => undefined}
            onController={(nextController) => {
              if (nextController !== null) getSelection = nextController.getSelection;
            }}
          />
        );
      },
      host
    );

    try {
      const editor = await waitForEditable(host);

      setSelection({ start: "before ".length, end: "before selected".length });
      await animationFrame();
      await animationFrame();

      expect(document.activeElement).toBe(editor);
      expect(getSelection()).toEqual({
        start: "before ".length,
        end: "before selected".length
      });
    } finally {
      dispose();
    }
  });

  it("toggles collapsed inline-code state without writing literal backticks", async () => {
    const host = document.createElement("div");
    document.body.append(host);
    const changes: string[] = [];
    let setSelection!: (selection: { readonly start: number; readonly end: number } | null) => void;
    let getSelection!: () => { readonly start: number; readonly end: number } | null;
    let toggleInlineCodeAtSelection!: () => boolean;

    const dispose = render(
      () => {
        const [selection, innerSetSelection] = createSignal<{ readonly start: number; readonly end: number } | null>(
          null
        );
        setSelection = innerSetSelection;

        return (
          <MilkdownEditor
            documentKey="2030-02-02"
            value="Use  today"
            focusSelection={selection()}
            onChange={(_documentKey, markdown) => changes.push(markdown)}
            onBlur={() => undefined}
            onController={(nextController) => {
              if (nextController === null) return;
              getSelection = nextController.getSelection;
              toggleInlineCodeAtSelection = nextController.toggleInlineCodeAtSelection;
            }}
          />
        );
      },
      host
    );

    try {
      const editor = await waitForEditable(host);
      const cursor = "Use ".length;

      setSelection({ start: cursor, end: cursor });
      await animationFrame();
      await animationFrame();

      expect(getSelection()).toEqual({ start: cursor, end: cursor });
      expect(toggleInlineCodeAtSelection()).toBe(true);
      expect(toggleInlineCodeAtSelection()).toBe(true);
      await delay(300);

      expect(changes).toEqual([]);
      expect(document.activeElement).toBe(editor);
      expect(getSelection()).toEqual({ start: cursor, end: cursor });
    } finally {
      dispose();
    }
  });

  it("keeps a boundary space outside code after toggling collapsed inline-code and typing", async () => {
    const editor = await createMilkdownTestEditor("");

    try {
      const view = editor.ctx.get(editorViewCtx);
      const serializer = editor.ctx.get(serializerCtx);
      view.dispatch(view.state.tr.insertText("abc "));
      const cursor = findTextEndPosition(view.state.doc, "abc ");
      view.dispatch(view.state.tr.setSelection(TextSelection.create(view.state.doc, cursor)));

      expect(toggleMark(inlineCodeSchema.type(editor.ctx))(view.state, view.dispatch, view)).toBe(true);
      view.dispatch(view.state.tr.insertText("def"));

      expect(serializer(view.state.doc)).toBe("abc `def`\n");
    } finally {
      await editor.destroy();
    }
  });

  it("maps a browser selection at the editable root boundary to the raw Markdown range", async () => {
    const host = document.createElement("div");
    document.body.append(host);
    const markdown = Array.from({ length: 20 }, (_item, index) => `- item ${index + 1}`).join("\n");
    let getSelection!: () => { readonly start: number; readonly end: number } | null;

    const dispose = render(
      () => (
        <MilkdownEditor
          documentKey="2030-02-02"
          value={markdown}
          onChange={() => undefined}
          onBlur={() => undefined}
          onController={(nextController) => {
            if (nextController !== null) getSelection = nextController.getSelection;
          }}
        />
      ),
      host
    );

    try {
      const editor = await waitForEditable(host);
      const selection = document.getSelection();
      const range = document.createRange();

      range.selectNodeContents(editor);
      range.collapse(false);
      selection?.removeAllRanges();
      selection?.addRange(range);
      expect(getSelection()).toEqual({ start: markdown.length, end: markdown.length });

      range.selectNodeContents(editor);
      selection?.removeAllRanges();
      selection?.addRange(range);
      expect(getSelection()).toEqual({ start: 0, end: markdown.length });
    } finally {
      dispose();
    }
  });

  it("maps a browser selection inside the final list item text to the raw Markdown end", async () => {
    const host = document.createElement("div");
    document.body.append(host);
    const markdown = Array.from({ length: 20 }, (_item, index) => `- item ${index + 1}`).join("\n");
    let getSelection!: () => { readonly start: number; readonly end: number } | null;

    const dispose = render(
      () => (
        <MilkdownEditor
          documentKey="2030-02-02"
          value={markdown}
          onChange={() => undefined}
          onBlur={() => undefined}
          onController={(nextController) => {
            if (nextController !== null) getSelection = nextController.getSelection;
          }}
        />
      ),
      host
    );

    try {
      const editor = await waitForEditable(host);
      const text = findTextDomNode(editor, "item 20");
      expect(text).not.toBeNull();
      const selection = document.getSelection();
      const range = document.createRange();

      range.setStart(text!, "item 20".length);
      range.collapse(true);
      selection?.removeAllRanges();
      selection?.addRange(range);

      expect(getSelection()).toEqual({ start: markdown.length, end: markdown.length });
    } finally {
      dispose();
    }
  });

  it("maps a WYSIWYG table cursor through Milkdown serialization to the raw Markdown range", async () => {
    const markdown = "| A | B |\n| --- | --- |\n| one | two |\n";
    const editor = await createMilkdownTestEditor(markdown);

    try {
      const view = editor.ctx.get(editorViewCtx);
      const position = findTextEndPosition(view.state.doc, "one");
      view.dispatch(view.state.tr.setSelection(TextSelection.create(view.state.doc, position)));

      expect(editorSelectionToMarkdownSourceSelection(
        markdown,
        view.state.selection,
        view,
        editor.ctx.get(serializerCtx)
      )).toEqual({
        start: markdown.indexOf("one") + "one".length,
        end: markdown.indexOf("one") + "one".length
      });
    } finally {
      await editor.destroy();
    }
  });

  it("maps a WYSIWYG selection through Milkdown serialization to the raw Markdown range", async () => {
    const markdown = "| A | B |\n| --- | --- |\n| one | two |\n";
    const editor = await createMilkdownTestEditor(markdown);

    try {
      const view = editor.ctx.get(editorViewCtx);
      const start = findTextNodePosition(view.state.doc, "one");
      const end = findTextEndPosition(view.state.doc, "two");
      expect(start).not.toBeNull();
      view.dispatch(view.state.tr.setSelection(TextSelection.create(view.state.doc, start!, end)));

      expect(editorSelectionToMarkdownSourceSelection(
        markdown,
        view.state.selection,
        view,
        editor.ctx.get(serializerCtx)
      )).toEqual({
        start: markdown.indexOf("one"),
        end: markdown.indexOf("two") + "two".length
      });
    } finally {
      await editor.destroy();
    }
  });

  it("clears a pending external marker when a debounced user edit does not match it", () => {
    const state = createMilkdownMarkdownSyncState("old");
    trackMilkdownExternalMarkdown(state, "remote", "remote\n");

    expect(applyMilkdownUpdatedMarkdown(state, "remote plus edit\n")).toBe(true);
    expect(state).toEqual({
      currentMarkdown: "remote plus edit\n",
      lastSerializedMarkdown: "remote plus edit\n",
      pendingExternalMarkdown: null
    });

    expect(applyMilkdownUpdatedMarkdown(state, "remote\n")).toBe(true);
    expect(state).toEqual({
      currentMarkdown: "remote\n",
      lastSerializedMarkdown: "remote\n",
      pendingExternalMarkdown: null
    });
  });

  it("ignores debounced document updates when serialized markdown is unchanged", () => {
    const state = createMilkdownMarkdownSyncState("same");
    trackMilkdownSerializedMarkdown(state, "same\n");

    expect(applyMilkdownUpdatedMarkdown(state, "same\n")).toBe(false);
    expect(state).toEqual({
      currentMarkdown: "same",
      lastSerializedMarkdown: "same\n",
      pendingExternalMarkdown: null
    });
  });
});

async function waitForEditable(host: HTMLElement): Promise<HTMLElement> {
  return await waitForContentEditable(host, "true");
}

async function waitForContentEditable(host: HTMLElement, value: "true" | "false"): Promise<HTMLElement> {
  const startedAt = Date.now();
  while (Date.now() - startedAt < 5000) {
    const editor = host.querySelector<HTMLElement>(`[contenteditable='${value}']`);
    if (editor !== null) return editor;
    await animationFrame();
  }
  throw new Error("Milkdown editor did not render.");
}

async function waitForMilkdownReadOnly(host: HTMLElement, value: "true" | "false"): Promise<HTMLElement> {
  const startedAt = Date.now();
  while (Date.now() - startedAt < 5000) {
    const editor = host.querySelector<HTMLElement>(`.milkdown-root[aria-readonly='${value}']`);
    if (editor !== null) return editor;
    await animationFrame();
  }
  throw new Error("Milkdown editor read-only state did not update.");
}

function animationFrame(): Promise<void> {
  return new Promise((resolve) => requestAnimationFrame(() => resolve()));
}

function delay(milliseconds: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

async function createMilkdownTestEditor(markdown: string) {
  return await Editor.make()
    .config((ctx) => {
      ctx.set(defaultValueCtx, markdown);
    })
    .use(commonmark)
    .use(gfm)
    .create();
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

function findTextDomNode(root: HTMLElement, textToFind: string): Text | null {
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
  let node = walker.nextNode();
  while (node !== null) {
    if (node.textContent?.includes(textToFind)) return node as Text;
    node = walker.nextNode();
  }
  return null;
}
