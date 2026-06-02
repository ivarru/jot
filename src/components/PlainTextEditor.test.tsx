import { render } from "solid-js/web";
import { PlainTextEditor } from "./PlainTextEditor";

describe("PlainTextEditor", () => {
  afterEach(() => {
    document.body.replaceChildren();
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

  it("inserts two spaces at the cursor when pressing tab", () => {
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
    const tabEvent = new KeyboardEvent("keydown", { bubbles: true, cancelable: true, key: "Tab" });

    textarea!.dispatchEvent(tabEvent);

    expect(tabEvent.defaultPrevented).toBe(true);
    expect(textarea!.value).toBe("before  after");
    expect(textarea!.selectionStart).toBe("before  ".length);
    expect(textarea!.selectionEnd).toBe("before  ".length);
    expect(changes).toEqual([["2030-02-01", "before  after"]]);

    dispose();
  });

  it("inserts tab spaces at the selection end without deleting selected text", () => {
    const host = document.createElement("div");
    document.body.append(host);
    const changes: Array<readonly [string, string]> = [];

    const dispose = render(
      () => PlainTextEditor({
        documentKey: "2030-02-01",
        value: "beforeselectedafter",
        onChange: (documentKey, markdown) => changes.push([documentKey, markdown]),
        onBlur: () => undefined
      }),
      host
    );

    const textarea = host.querySelector("textarea");
    expect(textarea).not.toBeNull();
    const selectionStart = "before".length;
    const selectionEnd = "beforeselected".length;
    textarea!.setSelectionRange(selectionStart, selectionEnd);
    const tabEvent = new KeyboardEvent("keydown", { bubbles: true, cancelable: true, key: "Tab" });

    textarea!.dispatchEvent(tabEvent);

    expect(tabEvent.defaultPrevented).toBe(true);
    expect(textarea!.value).toBe("beforeselected  after");
    expect(textarea!.selectionStart).toBe("beforeselected  ".length);
    expect(textarea!.selectionEnd).toBe("beforeselected  ".length);
    expect(changes).toEqual([["2030-02-01", "beforeselected  after"]]);

    dispose();
  });

  it.each([
    ["Shift+Tab", { shiftKey: true }],
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

  it("restores focus at the requested cursor offset", async () => {
    const host = document.createElement("div");
    document.body.append(host);

    const dispose = render(
      () => PlainTextEditor({
        documentKey: "2030-02-01",
        value: "first\nsecond",
        focusOffset: 7,
        onChange: () => undefined,
        onBlur: () => undefined
      }),
      host
    );

    await animationFrame();

    const textarea = host.querySelector("textarea");
    expect(textarea).not.toBeNull();
    expect(textarea!.selectionStart).toBe(7);
    expect(textarea!.selectionEnd).toBe(7);

    dispose();
  });
});

function animationFrame(): Promise<void> {
  return new Promise((resolve) => requestAnimationFrame(() => resolve()));
}
