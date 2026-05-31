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
