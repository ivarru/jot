import { createSignal } from "solid-js";
import { render } from "solid-js/web";
import { defaultValueCtx, Editor, editorViewCtx, serializerCtx } from "@milkdown/kit/core";
import type { Node as ProseMirrorNode } from "@milkdown/kit/prose/model";
import { Plugin, TextSelection } from "@milkdown/kit/prose/state";
import { commonmark, inlineCodeSchema, linkSchema } from "@milkdown/kit/preset/commonmark";
import { gfm } from "@milkdown/kit/preset/gfm";
import { toggleMark } from "@milkdown/kit/prose/commands";
import { $prose } from "@milkdown/kit/utils";
import {
  applyMilkdownUpdatedMarkdown,
  createMilkdownMarkdownSyncState,
  createLinkBoundaryTypingPlugin,
  editorSelectionToMarkdownSourceSelection,
  MilkdownEditor,
  type MilkdownEditorController,
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

  it("restores a heading selection when reset and requested selection change together", async () => {
    const host = document.createElement("div");
    document.body.append(host);
    const markdown = "See [details](#details)\n\nIntro\n\n## Details\nBody";
    const headingStart = markdown.lastIndexOf("Details");
    const headingSelection = {
      start: headingStart,
      end: headingStart + "Details".length
    };
    let setNavigation!: (navigation: {
      readonly resetKey: number;
      readonly selection: { readonly start: number; readonly end: number } | null;
    }) => void;
    let getSelection!: () => { readonly start: number; readonly end: number } | null;

    const dispose = render(
      () => {
        const [navigation, innerSetNavigation] = createSignal<{
          readonly resetKey: number;
          readonly selection: { readonly start: number; readonly end: number } | null;
        }>({
          resetKey: 0,
          selection: null
        });
        setNavigation = innerSetNavigation;

        return (
          <MilkdownEditor
            documentKey="2030-02-02"
            resetKey={navigation().resetKey}
            value={markdown}
            focusSelection={navigation().selection}
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
      await waitForEditable(host);

      setNavigation({ resetKey: 1, selection: headingSelection });
      await animationFrame();
      await animationFrame();

      expect(getSelection()).toEqual(headingSelection);
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

  it("toggles collapsed strong and emphasis state without writing literal markers", async () => {
    const host = document.createElement("div");
    document.body.append(host);
    const changes: string[] = [];
    let setSelection!: (selection: { readonly start: number; readonly end: number } | null) => void;
    let getInlineFormatState!: () => { readonly italic: boolean; readonly bold: boolean; readonly code: boolean };
    let toggleInlineMarkAtSelection!: (format: "italic" | "bold") => boolean;

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
              getInlineFormatState = nextController.getInlineFormatState;
              toggleInlineMarkAtSelection = nextController.toggleInlineMarkAtSelection;
            }}
          />
        );
      },
      host
    );

    try {
      const cursor = "Use ".length;

      await waitForEditable(host);
      setSelection({ start: cursor, end: cursor });
      await animationFrame();
      await animationFrame();

      expect(getInlineFormatState()).toEqual({ italic: false, bold: false, code: false });
      expect(toggleInlineMarkAtSelection("bold")).toBe(true);
      expect(getInlineFormatState()).toEqual({ italic: false, bold: true, code: false });
      expect(toggleInlineMarkAtSelection("italic")).toBe(true);
      expect(getInlineFormatState()).toEqual({ italic: true, bold: true, code: false });
      await delay(300);

      expect(changes).toEqual([]);
    } finally {
      dispose();
    }
  });

  it("reports inline format state from the selected text instead of adjacent boundaries", async () => {
    const host = document.createElement("div");
    document.body.append(host);
    let setSelection!: (selection: { readonly start: number; readonly end: number } | null) => void;
    let getInlineFormatState!: () => { readonly italic: boolean; readonly bold: boolean; readonly code: boolean };

    const dispose = render(
      () => {
        const [selection, innerSetSelection] = createSignal<{ readonly start: number; readonly end: number } | null>(
          null
        );
        setSelection = innerSetSelection;

        return (
          <MilkdownEditor
            documentKey="2030-02-02"
            value="**a**b**c**"
            focusSelection={selection()}
            onChange={() => undefined}
            onBlur={() => undefined}
            onController={(nextController) => {
              if (nextController === null) return;
              getInlineFormatState = nextController.getInlineFormatState;
            }}
          />
        );
      },
      host
    );

    try {
      await waitForEditable(host);

      setSelection({ start: "**a**".length, end: "**a**b".length });
      await animationFrame();
      await animationFrame();
      expect(getInlineFormatState()).toEqual({ italic: false, bold: false, code: false });

      setSelection({ start: "**a**b**".length, end: "**a**b**c".length });
      await animationFrame();
      await animationFrame();
      expect(getInlineFormatState()).toEqual({ italic: false, bold: true, code: false });
    } finally {
      dispose();
    }
  });

  it("preserves the selected text when toggling WYSIWYG inline code", async () => {
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
            value="Use foo today"
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
      await waitForEditable(host);
      setSelection({ start: "Use ".length, end: "Use foo".length });
      await animationFrame();
      await animationFrame();

      expect(toggleInlineCodeAtSelection()).toBe(true);
      await delay(300);

      expect(changes.at(-1)).toBe("Use `foo` today\n");
      expect(getSelection()).toEqual({
        start: "Use `".length,
        end: "Use `foo".length
      });
    } finally {
      dispose();
    }
  });

  it("toggles block quote formatting through the WYSIWYG controller", async () => {
    const host = document.createElement("div");
    document.body.append(host);
    const changes: string[] = [];
    let setSelection!: (selection: { readonly start: number; readonly end: number } | null) => void;
    let getBlockFormatState!: () => { readonly quote: boolean };
    let getSelection!: () => { readonly start: number; readonly end: number } | null;
    let toggleBlockQuoteAtSelection!: () => boolean;

    const dispose = render(
      () => {
        const [selection, innerSetSelection] = createSignal<{ readonly start: number; readonly end: number } | null>(
          null
        );
        setSelection = innerSetSelection;

        return (
          <MilkdownEditor
            documentKey="2030-02-02"
            value="quote me"
            focusSelection={selection()}
            onChange={(_documentKey, markdown) => changes.push(markdown)}
            onBlur={() => undefined}
            onController={(nextController) => {
              if (nextController === null) return;
              getBlockFormatState = nextController.getBlockFormatState;
              getSelection = nextController.getSelection;
              toggleBlockQuoteAtSelection = nextController.toggleBlockQuoteAtSelection;
            }}
          />
        );
      },
      host
    );

    try {
      await waitForEditable(host);
      setSelection({ start: 0, end: "quote me".length });
      await animationFrame();
      await animationFrame();

      expect(getBlockFormatState()).toEqual({ quote: false });
      expect(toggleBlockQuoteAtSelection()).toBe(true);
      await delay(300);

      expect(changes.at(-1)).toBe("> quote me");
      expect(getSelection()).toEqual({ start: 2, end: "> quote me".length });
      expect(getBlockFormatState()).toEqual({ quote: true });

      expect(toggleBlockQuoteAtSelection()).toBe(true);
      await delay(300);

      expect(changes.at(-1)).toBe("quote me");
      expect(getSelection()).toEqual({ start: 0, end: "quote me".length });
      expect(getBlockFormatState()).toEqual({ quote: false });
    } finally {
      dispose();
    }
  });

  it("quotes a normal WYSIWYG text line from a collapsed cursor at line start without escaping the marker", async () => {
    const host = document.createElement("div");
    document.body.append(host);
    const changes: string[] = [];
    let setSelection!: (selection: { readonly start: number; readonly end: number } | null) => void;
    let getSelection!: () => { readonly start: number; readonly end: number } | null;
    let toggleBlockQuoteAtSelection!: (selection?: { readonly start: number; readonly end: number }) => boolean;

    const dispose = render(
      () => {
        const [selection, innerSetSelection] = createSignal<{ readonly start: number; readonly end: number } | null>(
          null
        );
        setSelection = innerSetSelection;

        return (
          <MilkdownEditor
            documentKey="2030-02-02"
            value="quote me"
            focusSelection={selection()}
            onChange={(_documentKey, markdown) => changes.push(markdown)}
            onBlur={() => undefined}
            onController={(nextController) => {
              if (nextController === null) return;
              getSelection = nextController.getSelection;
              toggleBlockQuoteAtSelection = nextController.toggleBlockQuoteAtSelection;
            }}
          />
        );
      },
      host
    );

    try {
      await waitForEditable(host);
      const cursor = 0;
      setSelection({ start: cursor, end: cursor });
      await animationFrame();
      await animationFrame();

      expect(toggleBlockQuoteAtSelection()).toBe(true);
      await delay(300);

      expect(changes.at(-1)).toBe("> quote me");
      expect(getSelection()).toEqual({ start: "> ".length, end: "> ".length });
    } finally {
      dispose();
    }
  });

  it("quotes only the selected WYSIWYG line when the source selection ends at a line break", async () => {
    const host = document.createElement("div");
    document.body.append(host);
    const changes: string[] = [];
    let setSelection!: (selection: { readonly start: number; readonly end: number } | null) => void;
    let getSelection!: () => { readonly start: number; readonly end: number } | null;
    let toggleBlockQuoteAtSelection!: () => boolean;

    const dispose = render(
      () => {
        const [selection, innerSetSelection] = createSignal<{ readonly start: number; readonly end: number } | null>(
          null
        );
        setSelection = innerSetSelection;

        return (
          <MilkdownEditor
            documentKey="2030-02-02"
            value={"first\nsecond"}
            focusSelection={selection()}
            onChange={(_documentKey, markdown) => changes.push(markdown)}
            onBlur={() => undefined}
            onController={(nextController) => {
              if (nextController === null) return;
              getSelection = nextController.getSelection;
              toggleBlockQuoteAtSelection = nextController.toggleBlockQuoteAtSelection;
            }}
          />
        );
      },
      host
    );

    try {
      await waitForEditable(host);
      setSelection({ start: 0, end: "first\n".length });
      await animationFrame();
      await animationFrame();

      expect(toggleBlockQuoteAtSelection()).toBe(true);
      await delay(300);

      expect(changes.at(-1)).toBe("> first\n\nsecond");
    } finally {
      dispose();
    }
  });

  it("quotes only the selected WYSIWYG list item before a following paragraph", async () => {
    const host = document.createElement("div");
    document.body.append(host);
    const changes: string[] = [];
    let setSelection!: (selection: { readonly start: number; readonly end: number } | null) => void;
    let getSelection!: () => { readonly start: number; readonly end: number } | null;
    let toggleBlockQuoteAtSelection!: () => boolean;

    const dispose = render(
      () => {
        const [selection, innerSetSelection] = createSignal<{ readonly start: number; readonly end: number } | null>(
          null
        );
        setSelection = innerSetSelection;

        return (
          <MilkdownEditor
            documentKey="2030-02-02"
            value={"* abc\n\n123"}
            focusSelection={selection()}
            onChange={(_documentKey, markdown) => changes.push(markdown)}
            onBlur={() => undefined}
            onController={(nextController) => {
              if (nextController === null) return;
              getSelection = nextController.getSelection;
              toggleBlockQuoteAtSelection = nextController.toggleBlockQuoteAtSelection;
            }}
          />
        );
      },
      host
    );

    try {
      await waitForEditable(host);
      setSelection({ start: "* ".length, end: "* abc".length });
      await animationFrame();
      await animationFrame();

      expect(toggleBlockQuoteAtSelection()).toBe(true);
      await delay(300);

      expect(changes.at(-1)).toBe("> * abc\n\n123");
      expect(getSelection()).toEqual({ start: "> * ".length, end: "> * abc".length });
    } finally {
      dispose();
    }
  });

  it("quotes the current WYSIWYG list item before a following paragraph from a collapsed cursor", async () => {
    const host = document.createElement("div");
    document.body.append(host);
    const changes: string[] = [];
    let setSelection!: (selection: { readonly start: number; readonly end: number } | null) => void;
    let getSelection!: () => { readonly start: number; readonly end: number } | null;
    let toggleBlockQuoteAtSelection!: () => boolean;

    const dispose = render(
      () => {
        const [selection, innerSetSelection] = createSignal<{ readonly start: number; readonly end: number } | null>(
          null
        );
        setSelection = innerSetSelection;

        return (
          <MilkdownEditor
            documentKey="2030-02-02"
            value={"* abc\n\n123"}
            focusSelection={selection()}
            onChange={(_documentKey, markdown) => changes.push(markdown)}
            onBlur={() => undefined}
            onController={(nextController) => {
              if (nextController === null) return;
              getSelection = nextController.getSelection;
              toggleBlockQuoteAtSelection = nextController.toggleBlockQuoteAtSelection;
            }}
          />
        );
      },
      host
    );

    try {
      await waitForEditable(host);
      const cursor = "* ab".length;
      setSelection({ start: cursor, end: cursor });
      await animationFrame();
      await animationFrame();

      expect(toggleBlockQuoteAtSelection()).toBe(true);
      await delay(300);

      expect(changes.at(-1)).toBe("> * abc\n\n123");
      expect(getSelection()).toEqual({ start: "> * ab".length, end: "> * ab".length });
    } finally {
      dispose();
    }
  });

  it("uses the explicit source selection passed to the public block quote controller", async () => {
    const host = document.createElement("div");
    document.body.append(host);
    const changes: string[] = [];
    let setSelection!: (selection: { readonly start: number; readonly end: number } | null) => void;
    let toggleBlockQuoteAtSelection!: (selection?: { readonly start: number; readonly end: number }) => boolean;

    const dispose = render(
      () => {
        const [selection, innerSetSelection] = createSignal<{ readonly start: number; readonly end: number } | null>(
          null
        );
        setSelection = innerSetSelection;

        return (
          <MilkdownEditor
            documentKey="2030-02-02"
            value={"* abc\n\n123"}
            focusSelection={selection()}
            onChange={(_documentKey, markdown) => changes.push(markdown)}
            onBlur={() => undefined}
            onController={(nextController) => {
              if (nextController === null) return;
              toggleBlockQuoteAtSelection = nextController.toggleBlockQuoteAtSelection;
            }}
          />
        );
      },
      host
    );

    try {
      await waitForEditable(host);
      setSelection({ start: "* abc\n\n".length, end: "* abc\n\n123".length });
      await animationFrame();
      await animationFrame();

      expect(toggleBlockQuoteAtSelection({ start: "* ".length, end: "* abc".length })).toBe(true);
      await delay(300);

      expect(changes.at(-1)).toBe("> * abc\n\n123");
    } finally {
      dispose();
    }
  });

  it("uses the last WYSIWYG pointer target for a collapsed block quote selection that drifts after a list", async () => {
    const host = document.createElement("div");
    document.body.append(host);
    const changes: string[] = [];
    let toggleBlockQuoteAtSelection!: (selection?: { readonly start: number; readonly end: number }) => boolean;

    const dispose = render(
      () => (
        <MilkdownEditor
          documentKey="2030-02-02"
          value={"* abc\n\n123"}
          onChange={(_documentKey, markdown) => changes.push(markdown)}
          onBlur={() => undefined}
          onController={(nextController) => {
            if (nextController === null) return;
            toggleBlockQuoteAtSelection = nextController.toggleBlockQuoteAtSelection;
          }}
        />
      ),
      host
    );

    try {
      const editor = await waitForEditable(host);
      const abcParagraph = Array.from(editor.querySelectorAll("p")).find((paragraph) => paragraph.textContent === "abc");
      expect(abcParagraph).not.toBeUndefined();
      abcParagraph!.dispatchEvent(pointerDownEvent());

      const driftedCursor = "* abc\n\n123".length;
      expect(toggleBlockQuoteAtSelection({ start: driftedCursor, end: driftedCursor })).toBe(true);
      await delay(300);

      expect(changes.at(-1)).toBe("> * abc\n\n123");
    } finally {
      dispose();
    }
  });

  it("opens a rendered Markdown link through the app handler on plain click", async () => {
    const host = document.createElement("div");
    document.body.append(host);
    const opened: Array<readonly [string, string]> = [];

    const dispose = render(
      () => (
        <MilkdownEditor
          documentKey="2030-02-02"
          value="See [decision](#/date/2030-02-01#decisions)"
          onChange={() => undefined}
          onBlur={() => undefined}
          onOpenLink={(documentKey, href) => {
            opened.push([documentKey, href]);
            return true;
          }}
        />
      ),
      host
    );

    try {
      await waitForEditable(host);
      const link = host.querySelector<HTMLAnchorElement>("a[href='#/date/2030-02-01#decisions']");
      expect(link).not.toBeNull();

      const event = new MouseEvent("click", { bubbles: true, cancelable: true, button: 0 });
      link!.dispatchEvent(event);

      expect(opened).toEqual([["2030-02-02", "#/date/2030-02-01#decisions"]]);
      expect(event.defaultPrevented).toBe(true);
    } finally {
      dispose();
    }
  });

  it("suppresses rendered Markdown link clicks when the app handler declines them", async () => {
    const host = document.createElement("div");
    document.body.append(host);

    const dispose = render(
      () => (
        <MilkdownEditor
          documentKey="2030-02-02"
          value="See [decision](#/date/2030-02-01#decisions)"
          onChange={() => undefined}
          onBlur={() => undefined}
          onOpenLink={() => false}
        />
      ),
      host
    );

    try {
      await waitForEditable(host);
      const link = host.querySelector<HTMLAnchorElement>("a[href='#/date/2030-02-01#decisions']");
      expect(link).not.toBeNull();

      const event = new MouseEvent("click", { bubbles: true, cancelable: true, button: 0 });
      link!.dispatchEvent(event);

      expect(event.defaultPrevented).toBe(true);
    } finally {
      dispose();
    }
  });

  it("unquotes a WYSIWYG block quote around a list without lifting list content", async () => {
    const host = document.createElement("div");
    document.body.append(host);
    const changes: string[] = [];
    let setSelection!: (selection: { readonly start: number; readonly end: number } | null) => void;
    let getSelection!: () => { readonly start: number; readonly end: number } | null;
    let toggleBlockQuoteAtSelection!: () => boolean;

    const dispose = render(
      () => {
        const [selection, innerSetSelection] = createSignal<{ readonly start: number; readonly end: number } | null>(
          null
        );
        setSelection = innerSetSelection;

        return (
          <MilkdownEditor
            documentKey="2030-02-02"
            value="> * item"
            focusSelection={selection()}
            onChange={(_documentKey, markdown) => changes.push(markdown)}
            onBlur={() => undefined}
            onController={(nextController) => {
              if (nextController === null) return;
              getSelection = nextController.getSelection;
              toggleBlockQuoteAtSelection = nextController.toggleBlockQuoteAtSelection;
            }}
          />
        );
      },
      host
    );

    try {
      await waitForEditable(host);
      setSelection({ start: "> * ".length, end: "> * item".length });
      await animationFrame();
      await animationFrame();

      expect(toggleBlockQuoteAtSelection()).toBe(true);
      await delay(300);

      expect(changes.at(-1)).toBe("* item");
      expect(getSelection()).toEqual({ start: "* ".length, end: "* item".length });
    } finally {
      dispose();
    }
  });

  it("toggles the current nested WYSIWYG bullet into a task item", async () => {
    const host = document.createElement("div");
    document.body.append(host);
    const changes: string[] = [];
    let setSelection!: (selection: { readonly start: number; readonly end: number } | null) => void;
    let getListItemFormatState!: () => { readonly task: boolean };
    let getSelection!: () => { readonly start: number; readonly end: number } | null;
    let toggleTaskListItemAtSelection!: () => boolean;

    const dispose = render(
      () => {
        const [selection, innerSetSelection] = createSignal<{ readonly start: number; readonly end: number } | null>(
          null
        );
        setSelection = innerSetSelection;

        return (
          <MilkdownEditor
            documentKey="2030-02-02"
            value={"* parent\n  * child\n* after"}
            focusSelection={selection()}
            onChange={(_documentKey, markdown) => changes.push(markdown)}
            onBlur={() => undefined}
            onController={(nextController) => {
              if (nextController === null) return;
              getListItemFormatState = nextController.getListItemFormatState;
              getSelection = nextController.getSelection;
              toggleTaskListItemAtSelection = nextController.toggleTaskListItemAtSelection;
            }}
          />
        );
      },
      host
    );

    try {
      await waitForEditable(host);
      const cursor = "* parent\n  * chi".length;
      setSelection({ start: cursor, end: cursor });
      await animationFrame();
      await animationFrame();

      expect(getListItemFormatState()).toEqual({ task: false });
      expect(toggleTaskListItemAtSelection()).toBe(true);
      await delay(300);

      expect(changes.at(-1)).toBe("* parent\n  * [ ] child\n* after");
      expect(getSelection()).toEqual({
        start: "* parent\n  * [ ] chi".length,
        end: "* parent\n  * [ ] chi".length
      });
      expect(getListItemFormatState()).toEqual({ task: true });
    } finally {
      dispose();
    }
  });

  it("turns a normal WYSIWYG text line into a task item", async () => {
    const host = document.createElement("div");
    document.body.append(host);
    const changes: string[] = [];
    let setSelection!: (selection: { readonly start: number; readonly end: number } | null) => void;
    let getListItemFormatState!: () => { readonly task: boolean };
    let getSelection!: () => { readonly start: number; readonly end: number } | null;
    let toggleTaskListItemAtSelection!: () => boolean;

    const dispose = render(
      () => {
        const [selection, innerSetSelection] = createSignal<{ readonly start: number; readonly end: number } | null>(
          null
        );
        setSelection = innerSetSelection;

        return (
          <MilkdownEditor
            documentKey="2030-02-02"
            value="plain"
            focusSelection={selection()}
            onChange={(_documentKey, markdown) => changes.push(markdown)}
            onBlur={() => undefined}
            onController={(nextController) => {
              if (nextController === null) return;
              getListItemFormatState = nextController.getListItemFormatState;
              getSelection = nextController.getSelection;
              toggleTaskListItemAtSelection = nextController.toggleTaskListItemAtSelection;
            }}
          />
        );
      },
      host
    );

    try {
      await waitForEditable(host);
      const cursor = "pla".length;
      setSelection({ start: cursor, end: cursor });
      await animationFrame();
      await animationFrame();

      expect(getListItemFormatState()).toEqual({ task: false });
      expect(toggleTaskListItemAtSelection()).toBe(true);
      await delay(300);

      expect(changes.at(-1)).toBe("* [ ] plain");
      expect(getSelection()).toEqual({
        start: "* [ ] pla".length,
        end: "* [ ] pla".length
      });
      expect(getListItemFormatState()).toEqual({ task: true });
    } finally {
      dispose();
    }
  });

  it("removes an existing checked task marker through the WYSIWYG controller", async () => {
    const host = document.createElement("div");
    document.body.append(host);
    const changes: string[] = [];
    let setSelection!: (selection: { readonly start: number; readonly end: number } | null) => void;
    let getSelection!: () => { readonly start: number; readonly end: number } | null;
    let toggleTaskListItemAtSelection!: () => boolean;

    const dispose = render(
      () => {
        const [selection, innerSetSelection] = createSignal<{ readonly start: number; readonly end: number } | null>(
          null
        );
        setSelection = innerSetSelection;

        return (
          <MilkdownEditor
            documentKey="2030-02-02"
            value={"* parent\n  * [x] child\n* after"}
            focusSelection={selection()}
            onChange={(_documentKey, markdown) => changes.push(markdown)}
            onBlur={() => undefined}
            onController={(nextController) => {
              if (nextController === null) return;
              getSelection = nextController.getSelection;
              toggleTaskListItemAtSelection = nextController.toggleTaskListItemAtSelection;
            }}
          />
        );
      },
      host
    );

    try {
      await waitForEditable(host);
      setSelection({
        start: "* parent\n  * [x] ".length,
        end: "* parent\n  * [x] child".length
      });
      await animationFrame();
      await animationFrame();

      expect(toggleTaskListItemAtSelection()).toBe(true);
      await delay(300);

      expect(changes.at(-1)).toBe("* parent\n  * child\n* after");
      expect(getSelection()).toEqual({
        start: "* parent\n  * ".length,
        end: "* parent\n  * child".length
      });
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

  it("keeps text typed after a link outside that link", async () => {
    const editor = await createMilkdownTestEditor("See [decision](#/date/2030-02-01#decisions)");

    try {
      const view = editor.ctx.get(editorViewCtx);
      const serializer = editor.ctx.get(serializerCtx);
      const cursor = findTextEndPosition(view.state.doc, "decision");
      view.dispatch(view.state.tr.setSelection(TextSelection.create(view.state.doc, cursor)));

      view.dispatch(view.state.tr.insertText(" after"));

      expect(serializer(view.state.doc)).toBe("See [decision](#/date/2030-02-01#decisions) after\n");
    } finally {
      await editor.destroy();
    }
  });

  it("keeps text typed inside a link in that link", async () => {
    const editor = await createMilkdownTestEditor("See [decision](#/date/2030-02-01#decisions)");

    try {
      const view = editor.ctx.get(editorViewCtx);
      const serializer = editor.ctx.get(serializerCtx);
      const cursor = findTextNodePosition(view.state.doc, "decision")! + "deci".length;
      view.dispatch(view.state.tr.setSelection(TextSelection.create(view.state.doc, cursor)));

      view.dispatch(view.state.tr.insertText("X"));

      expect(serializer(view.state.doc)).toBe("See [deciXsion](#/date/2030-02-01#decisions)\n");
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

  it("does not route toolbar structural indent through WYSIWYG table cell navigation", async () => {
    const host = document.createElement("div");
    document.body.append(host);
    const markdown = "| A | B |\n| --- | --- |\n| one | two |\n";
    const cursor = markdown.indexOf("one") + "one".length;
    let setSelection!: (selection: { readonly start: number; readonly end: number } | null) => void;
    let controller!: MilkdownEditorController;

    const dispose = render(
      () => {
        const [selection, innerSetSelection] = createSignal<{ readonly start: number; readonly end: number } | null>(
          null
        );
        setSelection = innerSetSelection;

        return (
          <MilkdownEditor
            documentKey="2030-02-02"
            value={markdown}
            focusSelection={selection()}
            onChange={() => undefined}
            onBlur={() => undefined}
            onController={(nextController) => {
              if (nextController !== null) controller = nextController;
            }}
          />
        );
      },
      host
    );

    try {
      await waitForEditable(host);
      setSelection({ start: cursor, end: cursor });
      await animationFrame();
      await animationFrame();

      const before = controller.getSelection();
      expect(before).not.toBeNull();
      expect(controller.applyStructuralTab(false)).toBe(false);
      expect(controller.applyStructuralTab(true)).toBe(false);
      expect(controller.getSelection()).toEqual(before);
    } finally {
      dispose();
    }
  });

  it("maps a WYSIWYG task-list cursor through Milkdown serialization to the raw Markdown range", async () => {
    const markdown = "* parent\n  * [ ] child\n* after";
    const editor = await createMilkdownTestEditor(markdown);

    try {
      const view = editor.ctx.get(editorViewCtx);
      const position = findTextNodePosition(view.state.doc, "child")! + "chi".length;
      view.dispatch(view.state.tr.setSelection(TextSelection.create(view.state.doc, position)));

      expect(editorSelectionToMarkdownSourceSelection(
        markdown,
        view.state.selection,
        view,
        editor.ctx.get(serializerCtx)
      )).toEqual({
        start: "* parent\n  * [ ] chi".length,
        end: "* parent\n  * [ ] chi".length
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

function pointerDownEvent(): PointerEvent {
  const event = new Event("pointerdown", { bubbles: true, cancelable: true }) as PointerEvent;
  Object.defineProperty(event, "button", { value: 0 });
  Object.defineProperty(event, "pointerType", { value: "mouse" });
  return event;
}

async function createMilkdownTestEditor(markdown: string) {
  return await Editor.make()
    .config((ctx) => {
      ctx.set(defaultValueCtx, markdown);
    })
    .use(commonmark)
    .use(gfm)
    .use($prose((ctx) => createLinkBoundaryTypingPlugin(Plugin, linkSchema.type(ctx))))
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
