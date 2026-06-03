import { createSignal } from "solid-js";
import { render } from "solid-js/web";
import {
  applyMilkdownUpdatedMarkdown,
  createMilkdownMarkdownSyncState,
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
  const startedAt = Date.now();
  while (Date.now() - startedAt < 5000) {
    const editor = host.querySelector<HTMLElement>("[contenteditable='true']");
    if (editor !== null) return editor;
    await animationFrame();
  }
  throw new Error("Milkdown editor did not render.");
}

function animationFrame(): Promise<void> {
  return new Promise((resolve) => requestAnimationFrame(() => resolve()));
}

function delay(milliseconds: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}
