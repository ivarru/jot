import { createSignal } from "solid-js";
import { render } from "solid-js/web";
import { defaultValueCtx, Editor, editorViewCtx, serializerCtx } from "@milkdown/kit/core";
import type { Node as ProseMirrorNode } from "@milkdown/kit/prose/model";
import { TextSelection } from "@milkdown/kit/prose/state";
import { commonmark } from "@milkdown/kit/preset/commonmark";
import { gfm } from "@milkdown/kit/preset/gfm";
import {
  applyMilkdownUpdatedMarkdown,
  createMilkdownMarkdownSyncState,
  editorSelectionToMarkdownSourceOffset,
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

  it("does not report cursor changes while focus is disabled", async () => {
    const host = document.createElement("div");
    document.body.append(host);
    const cursorChanges: number[] = [];
    let setMarkdown!: (markdown: string) => void;

    const dispose = render(
      () => {
        const [markdown, innerSetMarkdown] = createSignal("old inactive");
        setMarkdown = innerSetMarkdown;

        return (
          <MilkdownEditor
            documentKey="2030-02-02"
            value={markdown()}
            readOnly={true}
            focusEnabled={false}
            onCursorChange={(offset) => cursorChanges.push(offset)}
            onChange={() => undefined}
            onBlur={() => undefined}
          />
        );
      },
      host
    );

    try {
      await waitForContentEditable(host, "false");
      cursorChanges.length = 0;

      setMarkdown("new inactive");
      await delay(300);

      expect(cursorChanges).toEqual([]);

    } finally {
      dispose();
    }
  });

  it("maps a WYSIWYG table cursor through Milkdown serialization to the raw Markdown offset", async () => {
    const markdown = "| A | B |\n| --- | --- |\n| one | two |\n";
    const editor = await createMilkdownTestEditor(markdown);

    try {
      const view = editor.ctx.get(editorViewCtx);
      const position = findTextEndPosition(view.state.doc, "one");
      view.dispatch(view.state.tr.setSelection(TextSelection.create(view.state.doc, position)));

      expect(editorSelectionToMarkdownSourceOffset(
        markdown,
        view.state.selection,
        view,
        editor.ctx.get(serializerCtx)
      )).toBe(markdown.indexOf("one") + "one".length);
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
