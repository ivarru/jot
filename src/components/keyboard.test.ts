import { isEscapeKey } from "./keyboard";

describe("keyboard helpers", () => {
  it.each([
    { key: "Escape" },
    { key: "Esc" },
    { key: "ESC" },
    { key: "Unidentified", code: "Escape" }
  ])("recognizes Escape from $key", (init) => {
    expect(isEscapeKey(new KeyboardEvent("keydown", init))).toBe(true);
  });

  it("does not treat another key as Escape", () => {
    expect(isEscapeKey(new KeyboardEvent("keydown", { key: "Enter", code: "Enter" }))).toBe(false);
  });
});
