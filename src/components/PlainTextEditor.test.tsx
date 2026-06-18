import { render } from "solid-js/web";
import { createSignal } from "solid-js";
import { PlainTextEditor } from "./PlainTextEditor";

describe("PlainTextEditor", () => {
  afterEach(() => {
    document.body.replaceChildren();
  });

  it("applies the browser spellcheck preference to the textarea", () => {
    const host = document.createElement("div");
    document.body.append(host);

    const dispose = render(
      () =>
        PlainTextEditor({
          documentKey: "2030-02-01",
          value: "helo",
          spellcheck: false,
          onChange: () => undefined,
          onBlur: () => undefined
        }),
      host
    );

    expect(host.querySelector("textarea")!.getAttribute("spellcheck")).toBe("false");

    dispose();
  });

  it("emits markdown changes and blur saves with the bound document key", () => {
    const host = document.createElement("div");
    document.body.append(host);
    const changes: Array<readonly [string, string]> = [];
    const blurs: Array<readonly [string, string]> = [];

    const dispose = render(
      () => PlainTextEditor({
        documentKey: "2030-02-01",
        value: "# Initial",
        onChange: (documentKey, markdown) => changes.push([documentKey, markdown]),
        onBlur: (documentKey, markdown) => blurs.push([documentKey, markdown])
      }),
      host
    );

    const textarea = host.querySelector("textarea");
    expect(textarea).not.toBeNull();
    textarea!.value = "# Changed";
    textarea!.dispatchEvent(new InputEvent("input", { bubbles: true }));
    textarea!.dispatchEvent(new FocusEvent("blur"));

    expect(changes).toEqual([["2030-02-01", "# Changed"]]);
    expect(blurs).toEqual([["2030-02-01", "# Changed"]]);

    dispose();
  });

  it("marks the textarea read-only and suppresses input callbacks", () => {
    const host = document.createElement("div");
    document.body.append(host);
    const changes: string[] = [];

    const dispose = render(
      () => PlainTextEditor({
        documentKey: "2030-02-01",
        value: "# Initial",
        readOnly: true,
        onChange: (_documentKey, markdown) => changes.push(markdown),
        onBlur: () => undefined
      }),
      host
    );

    const textarea = host.querySelector("textarea");
    expect(textarea).not.toBeNull();
    expect(textarea!.readOnly).toBe(true);
    textarea!.value = "# Changed";
    textarea!.dispatchEvent(new InputEvent("input", { bubbles: true }));

    expect(changes).toEqual([]);

    dispose();
  });

  it("renders raw markdown hard line break spaces in a hidden highlight layer", () => {
    const host = document.createElement("div");
    document.body.append(host);
    const markdown = "first  \nsecond \nthird   \nfinal  ";

    const dispose = render(
      () => PlainTextEditor({
        documentKey: "2030-02-01",
        value: markdown,
        onChange: () => undefined,
        onBlur: () => undefined
      }),
      host
    );

    const highlightLayer = host.querySelector<HTMLElement>(".plain-text-hard-break-highlights");
    const highlightedSpaces = [...host.querySelectorAll<HTMLElement>(".markdown-hard-break-spaces")].map(
      (element) => element.textContent
    );

    expect(highlightLayer).not.toBeNull();
    expect(highlightLayer!.getAttribute("aria-hidden")).toBe("true");
    expect(highlightLayer!.textContent).toBe(markdown);
    expect(highlightedSpaces).toEqual(["  ", "   "]);

    dispose();
  });

  it("turns the current plain text line into a list item when pressing tab", () => {
    const host = document.createElement("div");
    document.body.append(host);
    const changes: Array<readonly [string, string]> = [];

    const dispose = render(
      () => PlainTextEditor({
        documentKey: "2030-02-01",
        value: "before",
        onChange: (documentKey, markdown) => changes.push([documentKey, markdown]),
        onBlur: () => undefined
      }),
      host
    );

    const textarea = host.querySelector("textarea");
    expect(textarea).not.toBeNull();
    textarea!.setSelectionRange("before".length, "before".length);
    const tabEvent = new KeyboardEvent("keydown", { bubbles: true, cancelable: true, key: "Tab" });

    textarea!.dispatchEvent(tabEvent);

    expect(tabEvent.defaultPrevented).toBe(true);
    expect(textarea!.value).toBe("* before");
    expect(textarea!.selectionStart).toBe("* before".length);
    expect(textarea!.selectionEnd).toBe("* before".length);
    expect(changes).toEqual([["2030-02-01", "* before"]]);

    dispose();
  });

  it("indents the current list item when pressing tab", () => {
    const host = document.createElement("div");
    document.body.append(host);
    const changes: Array<readonly [string, string]> = [];

    const dispose = render(
      () => PlainTextEditor({
        documentKey: "2030-02-01",
        value: "* first\n* second",
        onChange: (documentKey, markdown) => changes.push([documentKey, markdown]),
        onBlur: () => undefined
      }),
      host
    );

    const textarea = host.querySelector("textarea");
    expect(textarea).not.toBeNull();
    textarea!.setSelectionRange("* first\n".length, "* first\n".length);
    const tabEvent = new KeyboardEvent("keydown", { bubbles: true, cancelable: true, key: "Tab" });

    textarea!.dispatchEvent(tabEvent);

    expect(tabEvent.defaultPrevented).toBe(true);
    expect(textarea!.value).toBe("* first\n  * second");
    expect(textarea!.selectionStart).toBe("* first\n  ".length);
    expect(textarea!.selectionEnd).toBe("* first\n  ".length);
    expect(changes).toEqual([["2030-02-01", "* first\n  * second"]]);

    dispose();
  });

  it("dedents the current list item when pressing shift-tab", () => {
    const host = document.createElement("div");
    document.body.append(host);
    const changes: Array<readonly [string, string]> = [];

    const dispose = render(
      () => PlainTextEditor({
        documentKey: "2030-02-01",
        value: "* first\n  * second",
        onChange: (documentKey, markdown) => changes.push([documentKey, markdown]),
        onBlur: () => undefined
      }),
      host
    );

    const textarea = host.querySelector("textarea");
    expect(textarea).not.toBeNull();
    textarea!.setSelectionRange("* first\n  ".length, "* first\n  ".length);
    const tabEvent = new KeyboardEvent("keydown", {
      bubbles: true,
      cancelable: true,
      key: "Tab",
      shiftKey: true
    });

    textarea!.dispatchEvent(tabEvent);

    expect(tabEvent.defaultPrevented).toBe(true);
    expect(textarea!.value).toBe("* first\n* second");
    expect(textarea!.selectionStart).toBe("* first\n".length);
    expect(textarea!.selectionEnd).toBe("* first\n".length);
    expect(changes).toEqual([["2030-02-01", "* first\n* second"]]);

    dispose();
  });

  it("lifts a top-level list item to plain text when pressing shift-tab", () => {
    const host = document.createElement("div");
    document.body.append(host);
    const changes: Array<readonly [string, string]> = [];

    const dispose = render(
      () => PlainTextEditor({
        documentKey: "2030-02-01",
        value: "* item",
        onChange: (documentKey, markdown) => changes.push([documentKey, markdown]),
        onBlur: () => undefined
      }),
      host
    );

    const textarea = host.querySelector("textarea");
    expect(textarea).not.toBeNull();
    textarea!.setSelectionRange("* item".length, "* item".length);
    const tabEvent = new KeyboardEvent("keydown", {
      bubbles: true,
      cancelable: true,
      key: "Tab",
      shiftKey: true
    });

    textarea!.dispatchEvent(tabEvent);

    expect(tabEvent.defaultPrevented).toBe(true);
    expect(textarea!.value).toBe("item");
    expect(textarea!.selectionStart).toBe("item".length);
    expect(textarea!.selectionEnd).toBe("item".length);
    expect(changes).toEqual([["2030-02-01", "item"]]);

    dispose();
  });

  it("lifts a top-level task list item to plain text when pressing shift-tab", () => {
    const host = document.createElement("div");
    document.body.append(host);
    const changes: Array<readonly [string, string]> = [];

    const dispose = render(
      () => PlainTextEditor({
        documentKey: "2030-02-01",
        value: "* [ ] item",
        onChange: (documentKey, markdown) => changes.push([documentKey, markdown]),
        onBlur: () => undefined
      }),
      host
    );

    const textarea = host.querySelector("textarea");
    expect(textarea).not.toBeNull();
    textarea!.setSelectionRange("* [ ] item".length, "* [ ] item".length);
    const tabEvent = new KeyboardEvent("keydown", {
      bubbles: true,
      cancelable: true,
      key: "Tab",
      shiftKey: true
    });

    textarea!.dispatchEvent(tabEvent);

    expect(tabEvent.defaultPrevented).toBe(true);
    expect(textarea!.value).toBe("item");
    expect(textarea!.selectionStart).toBe("item".length);
    expect(textarea!.selectionEnd).toBe("item".length);
    expect(changes).toEqual([["2030-02-01", "item"]]);

    dispose();
  });

  it("decreases and increases heading depth with tab and shift-tab", () => {
    const host = document.createElement("div");
    document.body.append(host);
    const changes: Array<readonly [string, string]> = [];

    const dispose = render(
      () => PlainTextEditor({
        documentKey: "2030-02-01",
        value: "# Heading",
        onChange: (documentKey, markdown) => changes.push([documentKey, markdown]),
        onBlur: () => undefined
      }),
      host
    );

    const textarea = host.querySelector("textarea");
    expect(textarea).not.toBeNull();
    textarea!.setSelectionRange("# Heading".length, "# Heading".length);

    textarea!.dispatchEvent(new KeyboardEvent("keydown", { bubbles: true, cancelable: true, key: "Tab" }));
    expect(textarea!.value).toBe("Heading");

    textarea!.dispatchEvent(
      new KeyboardEvent("keydown", { bubbles: true, cancelable: true, key: "Tab", shiftKey: true })
    );
    expect(textarea!.value).toBe("# Heading");

    textarea!.dispatchEvent(
      new KeyboardEvent("keydown", { bubbles: true, cancelable: true, key: "Tab", shiftKey: true })
    );
    expect(textarea!.value).toBe("## Heading");

    expect(changes).toEqual([
      ["2030-02-01", "Heading"],
      ["2030-02-01", "# Heading"],
      ["2030-02-01", "## Heading"]
    ]);

    dispose();
  });

  it("indents and dedents the current fenced code block line", () => {
    const host = document.createElement("div");
    document.body.append(host);
    const changes: Array<readonly [string, string]> = [];

    const dispose = render(
      () => PlainTextEditor({
        documentKey: "2030-02-01",
        value: "```\ncode\n```",
        onChange: (documentKey, markdown) => changes.push([documentKey, markdown]),
        onBlur: () => undefined
      }),
      host
    );

    const textarea = host.querySelector("textarea");
    expect(textarea).not.toBeNull();
    textarea!.setSelectionRange("```\ncode".length, "```\ncode".length);

    textarea!.dispatchEvent(new KeyboardEvent("keydown", { bubbles: true, cancelable: true, key: "Tab" }));
    expect(textarea!.value).toBe("```\n  code\n```");

    textarea!.dispatchEvent(
      new KeyboardEvent("keydown", { bubbles: true, cancelable: true, key: "Tab", shiftKey: true })
    );
    expect(textarea!.value).toBe("```\ncode\n```");

    expect(changes).toEqual([
      ["2030-02-01", "```\n  code\n```"],
      ["2030-02-01", "```\ncode\n```"]
    ]);

    dispose();
  });

  it.each([
    ["Ctrl+Tab", { ctrlKey: true }],
    ["Alt+Tab", { altKey: true }],
    ["Meta+Tab", { metaKey: true }]
  ])("does not consume %s", (_name, modifiers) => {
    const host = document.createElement("div");
    document.body.append(host);
    const changes: Array<readonly [string, string]> = [];

    const dispose = render(
      () => PlainTextEditor({
        documentKey: "2030-02-01",
        value: "beforeafter",
        onChange: (documentKey, markdown) => changes.push([documentKey, markdown]),
        onBlur: () => undefined
      }),
      host
    );

    const textarea = host.querySelector("textarea");
    expect(textarea).not.toBeNull();
    textarea!.setSelectionRange("before".length, "before".length);
    const tabEvent = new KeyboardEvent("keydown", {
      bubbles: true,
      cancelable: true,
      key: "Tab",
      ...modifiers
    });

    textarea!.dispatchEvent(tabEvent);

    expect(tabEvent.defaultPrevented).toBe(false);
    expect(textarea!.value).toBe("beforeafter");
    expect(textarea!.selectionStart).toBe("before".length);
    expect(textarea!.selectionEnd).toBe("before".length);
    expect(changes).toEqual([]);

    dispose();
  });

  it("turns plain text into a heading when pressing shift-tab", () => {
    const host = document.createElement("div");
    document.body.append(host);
    const changes: Array<readonly [string, string]> = [];

    const dispose = render(
      () => PlainTextEditor({
        documentKey: "2030-02-01",
        value: "before",
        onChange: (documentKey, markdown) => changes.push([documentKey, markdown]),
        onBlur: () => undefined
      }),
      host
    );

    const textarea = host.querySelector("textarea");
    expect(textarea).not.toBeNull();
    textarea!.setSelectionRange("before".length, "before".length);
    const tabEvent = new KeyboardEvent("keydown", {
      bubbles: true,
      cancelable: true,
      key: "Tab",
      shiftKey: true
    });

    textarea!.dispatchEvent(tabEvent);

    expect(tabEvent.defaultPrevented).toBe(true);
    expect(textarea!.value).toBe("# before");
    expect(textarea!.selectionStart).toBe("# before".length);
    expect(textarea!.selectionEnd).toBe("# before".length);
    expect(changes).toEqual([["2030-02-01", "# before"]]);

    dispose();
  });

  it("restores focus at the requested selection", async () => {
    const host = document.createElement("div");
    document.body.append(host);

    const dispose = render(
      () => PlainTextEditor({
        documentKey: "2030-02-01",
        value: "first\nsecond",
        focusSelection: { start: 2, end: 7 },
        onChange: () => undefined,
        onBlur: () => undefined
      }),
      host
    );

    await animationFrame();

    const textarea = host.querySelector("textarea");
    expect(textarea).not.toBeNull();
    expect(textarea!.selectionStart).toBe(2);
    expect(textarea!.selectionEnd).toBe(7);

    dispose();
  });

  it("restores focus when only the requested selection changes", async () => {
    const host = document.createElement("div");
    document.body.append(host);
    let setSelection!: (selection: { readonly start: number; readonly end: number } | null) => void;

    const dispose = render(
      () => {
        const [selection, innerSetSelection] = createSignal<{ readonly start: number; readonly end: number } | null>(null);
        setSelection = innerSetSelection;

        return (
          <PlainTextEditor
            documentKey="2030-02-01"
            value="first\nsecond"
            focusSelection={selection()}
            onChange={() => undefined}
            onBlur={() => undefined}
          />
        );
      },
      host
    );

    const textarea = host.querySelector("textarea");
    expect(textarea).not.toBeNull();
    textarea!.setSelectionRange(0, 0);

    setSelection({ start: 2, end: 7 });
    await animationFrame();

    expect(textarea!.selectionStart).toBe(2);
    expect(textarea!.selectionEnd).toBe(7);

    dispose();
  });
});

function animationFrame(): Promise<void> {
  return new Promise((resolve) => requestAnimationFrame(() => resolve()));
}
